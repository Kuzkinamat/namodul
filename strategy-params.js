// strategy-params.js
//m5

window.StrategyParams = (function() {
    'use strict';

    const DEFAULT_PARAMS = Object.freeze({
        useBB:              true,
        bbPeriod:           50,
        bbStdDev:           2.0,
        flatWidthLookback:  20,
        squeezeWidthFactor: 0.75,
        expirationMinutes:  15,
        winPayout:          0.8,
        baseStake:          1,
        filterTradingHours: true,

        rules: `// c(lag)        — свеча:      .open .high .low .close
// ind(name,lag) — индикатор:  ind('bb',-1).upper / .middle / .lower
// bal(lag)      — баланс:     число или null
// dealStats(n)  — статистика последних n сделок
// === BB (Флэт + Сжатие) ===
// 1) Флэт: касание/пробой верхней BB -> PUT, нижней -> CALL
// 2) Сжатие BB: при узких полосах торгуем ПРОБОЙ в сторону выхода

const bb0 = ind('bb', 0), bb1 = ind('bb', -1);
if (!bb0 || bb0.upper === null || !bb1 || bb1.upper === null) return;

const cv0 = c(0), cv1 = c(-1);
if (!cv0 || !cv1) return;

const runtimeParams = (globalThis.Strategy && globalThis.Strategy.params) || {};
const flatWidthLookback = Math.max(5, Number(runtimeParams.flatWidthLookback || 20));
const squeezeWidthFactor = Number(runtimeParams.squeezeWidthFactor || 0.75);

const widthNow = bb0.upper - bb0.lower;
if (widthNow <= 0) return;

// Ширина BB за lookback для оценки флэта/сжатия
let wSum = 0, wCnt = 0;
for (let lag = -1; lag >= -flatWidthLookback; lag--) {
    const b = ind('bb', lag);
    if (b && b.upper !== null && b.lower !== null) {
        wSum += (b.upper - b.lower);
        wCnt++;
    }
}
const wAvg = wCnt > 0 ? (wSum / wCnt) : widthNow;
if (wAvg <= 0) return;

const isFlat = widthNow <= wAvg * 1.15;
const isSqueeze = widthNow <= wAvg * squeezeWidthFactor;

const touchedUpper = cv0.high >= bb0.upper || cv0.close >= bb0.upper;
const touchedLower = cv0.low <= bb0.lower || cv0.close <= bb0.lower;
const brokeUp = cv0.close > bb0.upper && cv1.close <= bb1.upper;
const brokeDn = cv0.close < bb0.lower && cv1.close >= bb1.lower;

// 3) Режим сжатия: торгуем пробой в сторону импульса
if (isSqueeze && (brokeUp || brokeDn)) {
    if (brokeUp) buy += 1;
    if (brokeDn) sell += 1;
    return;
}

// 1) Режим флэта: отбой от границ BB
if (isFlat && touchedLower) buy += 1;   // CALL от нижней полосы
if (isFlat && touchedUpper) sell += 1;  // PUT от верхней полосы

// 4) Мартингейл: если предыдущая сделка (до 2 TF) была убыточной,
//    добавляем +1.3 к силе уже найденного сигнала
if (typeof lastLossWithinTf === 'function' && lastLossWithinTf(2)) {
    if (buy >= 1) buy += 1.3;
    if (sell >= 1) sell += 1.3;
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

