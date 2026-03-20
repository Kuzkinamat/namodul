// strategy-core-signals.js
// Signal generation using user-defined rules evaluated per candle.

window.StrategyCoreSignals = (function() {
    'use strict';

    function findCloseIndex(data, entryIndex, closeTime) {
        for (let i = entryIndex; i < data.length; i++) {
            if (data[i].time >= closeTime) {
                return i;
            }
        }

        return data.length - 1;
    }

    function buildClosedTradeHistory(data, signals, currentIndex, expirationSeconds) {
        const history = [];
        const currentTime = data[currentIndex] ? data[currentIndex].time : null;
        if (!Number.isFinite(currentTime)) {
            return history;
        }

        for (const signal of signals) {
            const entryIndex = data.findIndex(candle => candle.time === signal.time);
            if (entryIndex === -1) {
                continue;
            }

            const closeTime = signal.time + expirationSeconds;
            const closeIndex = findCloseIndex(data, entryIndex, closeTime);
            const closeCandle = data[closeIndex];
            if (!closeCandle || closeCandle.time >= currentTime) {
                continue;
            }

            const entryPrice = signal.price;
            const closePrice = closeCandle.close;
            const isWin = signal.type === 'buy'
                ? closePrice > entryPrice
                : closePrice < entryPrice;

            history.push({
                time: signal.time,
                type: signal.type,
                closeTime: closeCandle.time,
                result: isWin ? 'win' : 'loss'
            });
        }

        return history;
    }

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

            const localTradeHistory = buildClosedTradeHistory(data, signals, i, expirationSeconds);
            const mergedTradeHistory = (tradeHistory || []).concat(localTradeHistory);
            const context = contextModule.createConditionContext(i, data, resolvedIndicators, mergedTradeHistory);
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
