// strategy-params.js
//m5

window.StrategyParams = (function() {
    'use strict';

    const DEFAULT_PARAMS = Object.freeze({
        baseStake:          1,
        filterTradingHours: true,
        expirationMinutes:  15,
        winPayout:          0.8,

        useSMA:             false,
        useBB:              true,
        useATR:             false,
        useMACD:            false,
        useStochastic:      true,
        bbPeriod:           20,
        bbStdDev:           1.8,
        stochasticK:        14,
        stochasticD:        3,
        stochasticSlowing:  3,
        stochModeThreshold:  50,
        stopLossCnt:         4,
        stopLossPeriod:      60,

        rules: `
// c(lag)        — свеча:      .open .high .low .close
// ind(name,lag) — индикатор:  ind('bb',0).upper / .middle / .lower
// ind('stochastic',0) — Stochastic: .k .d
// bal(lag)      — баланс:     число или null
// dealStats(n)  — статистика последних n сделок
// lossCountWithinPeriods(n) — кол-во лоссов за последние n свечей

const params = (globalThis.Strategy && globalThis.Strategy.params) || {};
const bb0 = ind('bb', 0), bb1 = ind('bb', -1);
const st0 = ind('stochastic', 0);
const cv0 = c(0), cv1 = c(-1);

const stochModeThreshold = Number(params.stochModeThreshold ?? 50);
const stopLossCnt      = Math.max(0, Number(params.stopLossCnt ?? 4));
const stopLossPeriod   = Math.max(1, Number(params.stopLossPeriod ?? 60));

if (
    bb0 && bb1 && cv0 && cv1 && st0 &&
    bb0.upper !== null && bb1.upper !== null && Number.isFinite(st0.k)
) {
    const stochLow = st0.k < stochModeThreshold;
    const stochHigh = st0.k >= stochModeThreshold;

    // Пробой BB: свеча закрылась за полосой
    const brokeUp = cv0.close > bb0.upper && cv1.close <= bb1.upper;
    const brokeDn = cv0.close < bb0.lower && cv1.close >= bb1.lower;

    const stopActive = stopLossCnt > 0 &&
        typeof lossCountWithinPeriods === 'function' &&
        lossCountWithinPeriods(stopLossPeriod) >= stopLossCnt;

    if (!stopActive) {
        // Stochastic ниже порога: идём за пробоем
        if (brokeUp && stochLow) buy  = 1.5;
        if (brokeDn && stochLow) sell = 1.5;

        // Stochastic выше порога: берём откат от полосы
        if (brokeUp && stochHigh) sell = 1.2;
        if (brokeDn && stochHigh) buy  = 1.2;
    }
}
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

