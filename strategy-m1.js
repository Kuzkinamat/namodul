// strategy-params.js
//m1

window.StrategyParams = (function() {
    'use strict';

    const DEFAULT_PARAMS = Object.freeze({
        useBB: true,
        bbPeriod: 60,
        bbStdDev: 2.7,

        // Trade management
        expirationMinutes: 15,

        // Martingale
        useMartingale: 1,
        martingaleMultiplier: 3,
        martingaleMaxSteps: 5,

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