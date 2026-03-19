// strategy-core-signals.js
// Signal generation using user-defined rules evaluated per candle.

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

        const signals = [];
        const expirationSeconds = (resolvedParams.expirationMinutes || 5) * 60;

        for (let i = 1; i < data.length; i++) {
            if (resolvedParams.filterTradingHours && data[i].isTradingHour === false) {
                continue;
            }

            // Пропустить свечу, если со времени последнего сигнала ещё не истёк expirationMinutes
            if (signals.length > 0) {
                const lastSignalTime = signals[signals.length - 1].time;
                if (data[i].time - lastSignalTime < expirationSeconds) {
                    continue;
                }
            }

            const context = contextModule.createConditionContext(i, data, resolvedIndicators, tradeHistory || []);
            const { buy, sell } = contextModule.evaluateRules(resolvedParams.rules, context);

            if (buy >= 1) {
                signals.push({
                    time: data[i].time,
                    type: 'buy',
                    price: data[i].close,
                    buyStrength: buy,
                    sellStrength: 0
                });
            } else if (sell >= 1) {
                signals.push({
                    time: data[i].time,
                    type: 'sell',
                    price: data[i].close,
                    buyStrength: 0,
                    sellStrength: sell
                });
            }
        }

        return signals;
    }

    return {
        calculateSignals
    };
})();
