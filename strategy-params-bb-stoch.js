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
        bbPeriod:           15,
        bbStdDev:           2,
        
        useStochastic:      true,
        stochasticK:        14,
        stochasticD:        3,
        stochasticSlowing:  3,
        stochLower:  30,
        stochUpper:  70,
        
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
const st1 = ind('stochastic', -1);
const cv0 = c(0), cv1 = c(-1);

const stochLower = Number(params.stochLower ?? 30);
const stochUpper = Number(params.stochUpper ?? 70);
const stopLossCnt      = Math.max(0, Number(params.stopLossCnt ?? 4));
const stopLossPeriod   = Math.max(1, Number(params.stopLossPeriod ?? 60));

if (
    bb0 && bb1 && cv0 && cv1 && st0 && st1 &&
    bb0.upper !== null && bb1.upper !== null &&
    Number.isFinite(st0.k) && Number.isFinite(st0.d) &&
    Number.isFinite(st1.k) && Number.isFinite(st1.d)
) {
    const stochLow = st0.k < stochLower;
    const stochHigh = st0.k >= stochUpper;

    // Stochastic между порогами: нейтральная зона
    const stochNeutral = st0.k >= stochLower && st0.k < stochUpper;
    const stochCrossUp = st1.k <= st1.d && st0.k > st0.d;
    const stochCrossDown = st1.k >= st1.d && st0.k < st0.d;

    // Пробой BB: свеча закрылась за полосой
    const bbBrokeUp = cv0.close > bb0.upper && cv1.close <= bb1.upper;
    const bbBrokeDn = cv0.close < bb0.lower && cv1.close >= bb1.lower;

    const stopActive = stopLossCnt > 0 &&
        typeof lossCountWithinPeriods === 'function' &&
        lossCountWithinPeriods(stopLossPeriod) >= stopLossCnt;

    if (!stopActive) {
        // Stochastic ниже порога: идём за пробоем
        if (bbBrokeUp && stochLow) buy  = 1.5;
        if (bbBrokeDn && stochLow) sell = 1.5;

        // Stochastic выше порога: берём откат от полосы
        if (bbBrokeDn && stochHigh && stochCrossUp) buy  = 1.2;
        if (bbBrokeUp && stochHigh && stochCrossDown) sell = 1.2;
        

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

