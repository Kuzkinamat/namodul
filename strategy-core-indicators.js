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

        const requestedOnly = options && Array.isArray(options.only) ? options.only : null;
        const shouldCalcBB = (options && options.forceAll) ||
            (requestedOnly ? requestedOnly.includes('bb') : resolvedParams.useBB !== false);
        const shouldCalcMACD = (options && options.forceAll) ||
            (requestedOnly ? requestedOnly.includes('macd') : resolvedParams.useMACD === true);

        if (shouldCalcBB) {
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
        }

        if (shouldCalcMACD) {
            if (typeof window.calcMACD !== 'function') {
                if (!(options && options.silent)) {
                    context.log('Ошибка: функция calcMACD не найдена');
                }
                return null;
            }

            if (!(options && options.silent)) {
                context.log('Расчет MACD...');
            }

            const macd = window.calcMACD(data, resolvedParams.macdFast || 12, resolvedParams.macdSlow || 26, resolvedParams.macdSignal || 9);
            if (!Array.isArray(macd) || macd.length !== data.length) {
                if (!(options && options.silent)) {
                    const len = Array.isArray(macd) ? macd.length : 0;
                    context.log(`Ошибка: длина MACD (${len}) не совпадает с данными (${data.length})`);
                }
                return null;
            }
            indicators.macd = macd;
        }

        return indicators;
    }

    return {
        calculateIndicators
    };
})();
