// strategy-core.js
// Ядро стратегии: вычисления условий и сигналов

window.StrategyCore = (function() {
    'use strict';

    // Создать контекст для оценки условия
    function createConditionContext(i, data, indicators, tradeHistory) {
        const macdObj = indicators.macd && indicators.macd[i] ? indicators.macd[i] : { macd: null, signal: null, histogram: null };
        const stochObj = indicators.stochastic && indicators.stochastic[i] ? indicators.stochastic[i] : { k: null, d: null };
        const smaObj = indicators.sma && indicators.sma[i] ? indicators.sma[i] : { value: null };
        const bbObj = indicators.bb && indicators.bb[i] ? indicators.bb[i] : { upper: null, middle: null, lower: null };
        const candle = data[i] || { close: null, open: null, high: null, low: null };

        return {
            i: i,
            data: data,
            indicators: indicators,
            tradeHistory: tradeHistory || [],
            macd: macdObj.macd,
            signal: macdObj.signal,
            histogram: macdObj.histogram,
            stochasticK: stochObj.k,
            stochasticD: stochObj.d,
            sma: smaObj.value,
            bbUpper: bbObj.upper,
            bbMiddle: bbObj.middle,
            bbLower: bbObj.lower,
            close: candle.close,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            macdVal: macdObj.macd,
            macdSignalVal: macdObj.signal,
            macdHist: macdObj.histogram,
            stochK: stochObj.k,
            stochD: stochObj.d,
            indicator: function(name, lag = 0) {
                const idx = i - lag;
                if (idx < 0) return null;
                const ind = indicators[name];
                if (!ind || !ind[idx]) return null;
                return ind[idx];
            },
            price: function(type = 'close', lag = 0) {
                const idx = i - lag;
                if (idx < 0 || !data[idx]) return null;
                return data[idx][type];
            },
            dealStats: function(window) {
                const history = tradeHistory || [];
                if (!history || history.length === 0) {
                    return { winCount: 0, lossCount: 0, totalProfit: 0, winRate: 0 };
                }
                const recent = history.slice(-window);
                const winCount = recent.filter(d => d.result === 'win').length;
                const lossCount = recent.filter(d => d.result === 'loss').length;
                const totalProfit = recent.reduce((sum, d) => sum + (d.profit || 0), 0);
                const winRate = recent.length > 0 ? winCount / recent.length : 0;
                return { winCount, lossCount, totalProfit, winRate };
            }
        };
    }

    // Оценить условие
    function evaluateCondition(condition, context) {
        if (!condition || condition.trim() === '') {
            return true;
        }
        try {
            const func = new Function(...Object.keys(context), `return ${condition};`);
            const result = func(...Object.values(context));
            return Boolean(result);
        } catch (err) {
            if (window.addLog) window.addLog('Ошибка выполнения условия: ' + err.message);
            return false;
        }
    }

    // Вычислить сигналы на основе данных и параметров
    function calculateSignals(data, params, indicators) {
        // params: { useMACD, useStochastic, useSMA, useBB, overbought, oversold, buyCondition, sellCondition, ... }
        // indicators: { macd, stochastic, sma, bb } - уже рассчитанные массивы
        // Возвращает массив сигналов
        const signals = [];
        const debug = window.debugLog || false;

        for (let i = 1; i < data.length; i++) {
            let longConditions = [];
            let shortConditions = [];

            if (params.useMACD && indicators.macd && indicators.macd.length > i) {
                const prevMacd = indicators.macd[i - 1];
                const currMacd = indicators.macd[i];
                if (currMacd.macd !== null) {
                    const macdAboveZero = currMacd.macd > 0;
                    const macdHistogramRising = currMacd.histogram > prevMacd.histogram && prevMacd.histogram < 0;
                    const macdBelowZero = currMacd.macd < 0;
                    const macdHistogramFalling = currMacd.histogram < prevMacd.histogram && prevMacd.histogram > 0;
                    longConditions.push(macdAboveZero || macdHistogramRising);
                    shortConditions.push(macdBelowZero || macdHistogramFalling);
                }
            }

            if (params.useStochastic && indicators.stochastic && indicators.stochastic.length > i) {
                const prevStoch = indicators.stochastic[i - 1];
                const currStoch = indicators.stochastic[i];
                if (currStoch.k !== null && currStoch.d !== null) {
                    const stochasticOversold = currStoch.k < params.oversold && currStoch.d < params.oversold;
                    const stochasticCrossUp = prevStoch.k < prevStoch.d && currStoch.k > currStoch.d;
                    const stochasticOverbought = currStoch.k > params.overbought && currStoch.d > params.overbought;
                    const stochasticCrossDown = prevStoch.k > prevStoch.d && currStoch.k < currStoch.d;
                    longConditions.push(stochasticOversold && stochasticCrossUp);
                    shortConditions.push(stochasticOverbought && stochasticCrossDown);
                }
            }

            if (params.useSMA && indicators.sma && indicators.sma.length > i && indicators.sma[i].value !== null) {
                const price = data[i].close;
                const sma = indicators.sma[i].value;
                longConditions.push(price > sma);
                shortConditions.push(price < sma);
            }

            if (params.useBB && indicators.bb && indicators.bb.length > i && indicators.bb[i].lower !== null && indicators.bb[i].upper !== null) {
                const price = data[i].close;
                const lower = indicators.bb[i].lower;
                const upper = indicators.bb[i].upper;
                longConditions.push(price <= lower);
                shortConditions.push(price >= upper);
            }

            if (longConditions.length === 0 && shortConditions.length === 0) {
                continue;
            }

            const longSignal = longConditions.length > 0 && longConditions.every(c => c === true);
            const shortSignal = shortConditions.length > 0 && shortConditions.every(c => c === true);

            let buyConditionPass = true;
            let sellConditionPass = true;
            const buyCondition = params.buyCondition || params.customCondition;
            const sellCondition = params.sellCondition || params.customCondition;
            if (buyCondition && buyCondition.trim() !== '') {
                const context = createConditionContext(i, data, indicators, []);
                buyConditionPass = evaluateCondition(buyCondition, context);
            }
            if (sellCondition && sellCondition.trim() !== '') {
                const context = createConditionContext(i, data, indicators, []);
                sellConditionPass = evaluateCondition(sellCondition, context);
            }

            if (longSignal && buyConditionPass) {
                signals.push({
                    time: data[i].time,
                    type: 'buy',
                    price: data[i].close
                });
            } else if (shortSignal && sellConditionPass) {
                signals.push({
                    time: data[i].time,
                    type: 'sell',
                    price: data[i].close
                });
            }
        }

        return signals;
    }

    // Экспорт
    return {
        createConditionContext,
        evaluateCondition,
        calculateSignals
    };
})();