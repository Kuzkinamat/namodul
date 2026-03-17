// strategy-params.js
// Strategy parameters and entry conditions — edit this file per strategy.

window.StrategyParams = (function() {
    'use strict';

    const DEFAULT_PARAMS = Object.freeze({
        useBB: true,
        bbPeriod: 20,
        bbStdDev: 2,

        // Trade management
        expirationMinutes: 5,

        // Martingale
        useMartingale: false,
        martingaleMultiplier: 2,
        martingaleMaxSteps: 3,

        // Entry conditions
        buyCondition: '',
        sellCondition: '',
        filterTradingHours: true
    });

    function getDefaultParams() {
        return { ...DEFAULT_PARAMS };
    }

    function normalizeParams(params) {
        return { ...DEFAULT_PARAMS, ...(params || {}) };
    }

    return {
        DEFAULT_PARAMS,
        getDefaultParams,
        normalizeParams
    };
})();

