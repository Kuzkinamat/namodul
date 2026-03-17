// strategy-core-indicators.js
// Indicator calculations used by StrategyCore.

window.StrategyCoreIndicators = (function() {
    'use strict';

    function calculateIndicators(data, params, options) {
        const defaults = window.StrategyParams;
        const context = window.StrategyCoreContext;
        if (!defaults || !context) {
            return null;
        }

        const resolvedParams = defaults.normalizeParams(params);
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
                context.log('Ошибка: функция calcBB не найдена');
            }
            return null;
        }

        if (!(options && options.silent)) {
            context.log('Расчет Bollinger Bands...');
        }

        const bb = window.calcBB(data, resolvedParams.bbPeriod, resolvedParams.bbStdDev);
        if (!Array.isArray(bb) || bb.length !== data.length) {
            if (!(options && options.silent)) {
                const len = Array.isArray(bb) ? bb.length : 0;
                context.log(`Ошибка: длина Bollinger Bands (${len}) не совпадает с данными (${data.length})`);
            }
            return null;
        }

        indicators.bb = bb;
        return indicators;
    }

    return {
        calculateIndicators
    };
})();
