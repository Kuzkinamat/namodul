// strategy-core-context.js
// Logging, trading-hour checks, condition context and condition evaluation.

window.StrategyCoreContext = (function() {
    'use strict';

    function log(message) {
        if (typeof window.addLog === 'function') {
            window.addLog(message);
        }
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
        function c(lag) {
            const idx = i + lag;
            if (idx < 0 || idx >= data.length) return null;
            return data[idx];
        }

        function ind(name, lag) {
            const idx = i + lag;
            if (!indicators[name] || idx < 0) return null;
            return indicators[name][idx] || null;
        }

        function bal(lag) {
            const arr = window.lastBalance;
            if (!arr) return null;
            const idx = i + lag;
            if (idx < 0 || idx >= arr.length) return null;
            return arr[idx] ? arr[idx].value : null;
        }

        const bbObj = indicators.bb && indicators.bb[i] ? indicators.bb[i] : { upper: null, middle: null, lower: null };
        const candle = data[i] || { close: null, open: null, high: null, low: null };

        return {
            i,
            data,
            indicators,
            tradeHistory: tradeHistory || [],
            c,
            ind,
            bal,
            // legacy fields for backward compatibility
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

    function evaluateRules(rulesCode, context) {
        if (!rulesCode || rulesCode.trim() === '') {
            return { buy: 0, sell: 0 };
        }
        try {
            const fn = new Function('c', 'ind', 'bal',
                `let buy = 0, sell = 0;\n${rulesCode}\nreturn { buy: Math.floor(buy), sell: Math.floor(sell) };`
            );
            const result = fn(context.c, context.ind, context.bal);
            if (!result || typeof result !== 'object') {
                return { buy: 0, sell: 0 };
            }
            return {
                buy: Number.isFinite(result.buy) ? result.buy : 0,
                sell: Number.isFinite(result.sell) ? result.sell : 0
            };
        } catch (err) {
            log('Ошибка в rules: ' + err.message);
            return { buy: 0, sell: 0 };
        }
    }

    return {
        log,
        isTradingHour,
        enrichDataWithTradingHours,
        createConditionContext,
        evaluateCondition,
        evaluateRules
    };
})();
