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
            if (idx < 0) {
                return name === 'bb' ? { upper: null, middle: null, lower: null } : null;
            }

            const series = indicators[name];
            if (!series) {
                return name === 'bb' ? { upper: null, middle: null, lower: null } : null;
            }

            const value = series[idx];
            if (value) {
                return value;
            }

            return name === 'bb' ? { upper: null, middle: null, lower: null } : null;
        }

        function phase(lag = 0) {
            const idx = i + lag;
            const phaseSeries = indicators.phase;
            if (!phaseSeries || idx < 0) {
                return { name: 'flat', confidence: 0, score: 0 };
            }

            const names = Array.isArray(phaseSeries.phase) ? phaseSeries.phase : [];
            const confs = Array.isArray(phaseSeries.confidence) ? phaseSeries.confidence : [];
            const scores = Array.isArray(phaseSeries.phaseScore) ? phaseSeries.phaseScore : [];

            const name = names[idx] || 'flat';
            const confidence = Number.isFinite(confs[idx]) ? confs[idx] : 0;
            const score = Number.isFinite(scores[idx]) ? scores[idx] : 0;

            return { name, confidence, score };
        }

        function bal(lag) {
            const arr = window.lastBalance;
            if (!arr) return null;
            const idx = i + lag;
            if (idx < 0 || idx >= arr.length) return null;
            return arr[idx] ? arr[idx].value : null;
        }

        function lastLossWithinTf(tfCount = 2) {
            const history = tradeHistory || [];
            if (!history.length) return false;

            const lastTrade = history[history.length - 1];
            if (!lastTrade || lastTrade.result !== 'loss') return false;

            const currentCandle = data[i];
            if (!currentCandle || !Number.isFinite(currentCandle.time) || !Number.isFinite(lastTrade.closeTime)) {
                return false;
            }

            const expirationMinutes = Number(
                (window.Strategy && window.Strategy.params && window.Strategy.params.expirationMinutes) || 5
            );
            const windowSeconds = Math.max(1, expirationMinutes) * 60 * Math.max(1, Number(tfCount) || 1);
            const dt = currentCandle.time - lastTrade.closeTime;

            return dt > 0 && dt <= windowSeconds;
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
            phase,
            bal,
            lastLossWithinTf,

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
            const safeDealStats = typeof context.dealStats === 'function'
                ? context.dealStats
                : function() {
                    return { winCount: 0, lossCount: 0, totalProfit: 0, winRate: 0 };
                };
            const safeLastLossWithinTf = typeof context.lastLossWithinTf === 'function'
                ? context.lastLossWithinTf
                : function() { return false; };
            const safePhase = typeof context.phase === 'function'
                ? context.phase
                : function() { return { name: 'flat', confidence: 0, score: 0 }; };

            const fn = new Function('c', 'ind', 'phase', 'bal', 'dealStats', 'lastLossWithinTf',
                `let buy = 0, sell = 0;\n${rulesCode}\nreturn { buy, sell };`
            );
            const result = fn(context.c, context.ind, safePhase, context.bal, safeDealStats, safeLastLossWithinTf);
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
