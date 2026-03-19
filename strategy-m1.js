// strategy-params.js
//m1

window.StrategyParams = (function() {
    'use strict';

    const DEFAULT_PARAMS = Object.freeze({
        bbPeriod:           60,
        bbStdDev:           2.7,
        expirationMinutes:  15,
        baseStake:          1,
        filterTradingHours: true,

        rules: `// c(lag)        — свеча:      .open .high .low .close
// ind(name,lag) — индикатор:  ind('bb',-1).upper / .middle / .lower
// bal(lag)      — баланс:     число или null

if (c(-1).close >= ind('bb',-1).lower &&
    c(-1).close <= ind('bb',-1).upper &&
    c(0).close  <  ind('bb', 0).lower) buy  += 1;

if (c(-1).close >= ind('bb',-1).lower &&
    c(-1).close <= ind('bb',-1).upper &&
    c(0).close  >  ind('bb', 0).upper) sell += 1;
`
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
