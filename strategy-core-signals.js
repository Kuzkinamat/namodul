// strategy-core-signals.js
// Signal generation for breakout entries using Bollinger Bands.

window.StrategyCoreSignals = (function() {
    'use strict';

    function calculateSignals(data, params, indicators, tradeHistory) {
        const defaults = window.StrategyParams;
        const indicatorModule = window.StrategyCoreIndicators;
        const contextModule = window.StrategyCoreContext;
        if (!defaults || !indicatorModule || !contextModule) {
            return [];
        }

        const resolvedParams = defaults.normalizeParams(params);
        const resolvedIndicators = indicators || indicatorModule.calculateIndicators(data, resolvedParams, { silent: true, forceAll: true });
        if (!resolvedIndicators || !Array.isArray(data) || data.length < 2) {
            return [];
        }

        const bb = resolvedIndicators.bb || [];
        const signals = [];

        for (let i = 1; i < data.length; i++) {
            if (resolvedParams.filterTradingHours && data[i].isTradingHour === false) {
                continue;
            }

            if (!bb[i] || !bb[i - 1] || bb[i].upper === null || bb[i].lower === null || bb[i - 1].upper === null || bb[i - 1].lower === null) {
                continue;
            }

            const prevClose = data[i - 1].close;
            const currClose = data[i].close;

            const prevInside = prevClose <= bb[i - 1].upper && prevClose >= bb[i - 1].lower;
            const breakoutDown = prevInside && currClose < bb[i].lower;
            const breakoutUp = prevInside && currClose > bb[i].upper;

            if (!breakoutDown && !breakoutUp) {
                continue;
            }

            const context = contextModule.createConditionContext(i, data, resolvedIndicators, tradeHistory || []);
            const buyCondition = resolvedParams.buyCondition;
            const sellCondition = resolvedParams.sellCondition;

            const buyPass = breakoutDown && contextModule.evaluateCondition(buyCondition, context);
            const sellPass = breakoutUp && contextModule.evaluateCondition(sellCondition, context);

            if (buyPass) {
                signals.push({
                    time: data[i].time,
                    type: 'buy',
                    price: currClose,
                    bbUpper: bb[i].upper,
                    bbLower: bb[i].lower
                });
            } else if (sellPass) {
                signals.push({
                    time: data[i].time,
                    type: 'sell',
                    price: currClose,
                    bbUpper: bb[i].upper,
                    bbLower: bb[i].lower
                });
            }
        }

        return signals;
    }

    return {
        calculateSignals
    };
})();
