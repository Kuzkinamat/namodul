// strategy-core.js
// Минимальное ядро стратегии: только Bollinger Bands (вход при выходе за границы)

window.StrategyCore = (function() {
    'use strict';

    const DEFAULT_PARAMS = Object.freeze({
        useBB: true,
        bbPeriod: 20,
        bbStdDev: 2,

        // Управление сделкой
        expirationMinutes: 5,

        // Мартингейл
        useMartingale: false,
        martingaleMultiplier: 2,
        martingaleMaxSteps: 3,

        // Для совместимости с текущим UI/обвязкой
        useMACD: false,
        useStochastic: false,
        useSMA: false,
        customCondition: '',
        buyCondition: '',
        sellCondition: '',
        filterTradingHours: false
    });

    function log(message) {
        if (typeof window.addLog === 'function') {
            window.addLog(message);
        }
    }

    function getDefaultParams() {
        return { ...DEFAULT_PARAMS };
    }

    function normalizeParams(params) {
        return { ...DEFAULT_PARAMS, ...(params || {}) };
    }

    function calculateIndicators(data, params, options) {
        const resolvedParams = normalizeParams(params);
        const indicators = {
            macd: [],
            stochastic: [],
            sma: [],
            bb: []
        };

        if (!Array.isArray(data) || data.length === 0) {
            return indicators;
        }

        const shouldCalcBB = (options && options.forceAll) ||
            (options && Array.isArray(options.only) ? options.only.includes('bb') : resolvedParams.useBB);

        if (!shouldCalcBB) {
            return indicators;
        }

        if (typeof window.calcBB !== 'function') {
            if (!(options && options.silent)) {
                log('Ошибка: функция calcBB не найдена');
            }
            return null;
        }

        if (!(options && options.silent)) {
            log('Расчет Bollinger Bands...');
        }

        const bb = window.calcBB(data, resolvedParams.bbPeriod, resolvedParams.bbStdDev);
        if (!Array.isArray(bb) || bb.length !== data.length) {
            if (!(options && options.silent)) {
                const len = Array.isArray(bb) ? bb.length : 0;
                log(`Ошибка: длина Bollinger Bands (${len}) не совпадает с данными (${data.length})`);
            }
            return null;
        }

        indicators.bb = bb;
        return indicators;
    }

    function isTradingHour(timestamp) {
        if (!timestamp) return false;

        const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
        const date = new Date(ts * 1000);
        const dayOfWeek = date.getUTCDay();
        const hours = date.getUTCHours();

        if (dayOfWeek >= 1 && dayOfWeek <= 4) return true;
        if (dayOfWeek === 5 && hours < 21) return true;
        if (dayOfWeek === 1 && hours >= 21) return true;

        return false;
    }

    function enrichDataWithTradingHours(data) {
        if (!Array.isArray(data)) {
            return data;
        }

        return data.map(candle => ({
            ...candle,
            isTradingHour: isTradingHour(candle.time)
        }));
    }

    function createConditionContext(i, data, indicators, tradeHistory) {
        const bbObj = indicators.bb && indicators.bb[i] ? indicators.bb[i] : { upper: null, middle: null, lower: null };
        const candle = data[i] || { close: null, open: null, high: null, low: null };

        return {
            i,
            data,
            indicators,
            tradeHistory: tradeHistory || [],

            bbUpper: bbObj.upper,
            bbMiddle: bbObj.middle,
            bbLower: bbObj.lower,

            close: candle.close,
            open: candle.open,
            high: candle.high,
            low: candle.low,

            indicator: function(name, lag = 0) {
                const idx = i - lag;
                if (idx < 0) return null;
                const series = indicators[name];
                if (!series || !series[idx]) return null;
                return series[idx];
            },

            price: function(type = 'close', lag = 0) {
                const idx = i - lag;
                if (idx < 0 || !data[idx]) return null;
                return data[idx][type];
            },

            dealStats: function(windowSize) {
                const history = tradeHistory || [];
                if (!history.length) {
                    return { winCount: 0, lossCount: 0, totalProfit: 0, winRate: 0 };
                }
                const recent = history.slice(-windowSize);
                const winCount = recent.filter(d => d.result === 'win').length;
                const lossCount = recent.filter(d => d.result === 'loss').length;
                const totalProfit = recent.reduce((sum, d) => sum + (d.profit || 0), 0);
                const winRate = recent.length ? winCount / recent.length : 0;
                return { winCount, lossCount, totalProfit, winRate };
            }
        };
    }

    function evaluateCondition(condition, context) {
        if (!condition || condition.trim() === '') {
            return true;
        }

        try {
            const fn = new Function(...Object.keys(context), `return ${condition};`);
            return Boolean(fn(...Object.values(context)));
        } catch (err) {
            log('Ошибка выполнения условия: ' + err.message);
            return false;
        }
    }

    function calculateSignals(data, params, indicators, tradeHistory) {
        const resolvedParams = normalizeParams(params);
        const resolvedIndicators = indicators || calculateIndicators(data, resolvedParams, { silent: true, forceAll: true });
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

            const context = createConditionContext(i, data, resolvedIndicators, tradeHistory || []);
            const buyCondition = resolvedParams.buyCondition || resolvedParams.customCondition;
            const sellCondition = resolvedParams.sellCondition || resolvedParams.customCondition;

            const buyPass = breakoutDown && evaluateCondition(buyCondition, context);
            const sellPass = breakoutUp && evaluateCondition(sellCondition, context);

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
        getDefaultParams,
        normalizeParams,
        calculateIndicators,
        createConditionContext,
        evaluateCondition,
        calculateSignals,
        isTradingHour,
        enrichDataWithTradingHours
    };
})();