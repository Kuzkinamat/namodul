// strategy-params.js
//m5

window.StrategyParams = (function() {
    'use strict';

    const DEFAULT_PARAMS = Object.freeze({
        baseStake:          1,
        filterTradingHours: true,
        expirationMinutes:  15,
        winPayout:          0.8,

        useBB:              true,
        bbPeriod:           20,
        bbStdDev:           1.4,
        
        flatWidthLookback:  15,
        squeezeWidthFactor: 0.75,

        // Фаза рынка
        usePhase:           true,
        phaseFilter:        'breakout',  // 'breakout', 'trend', 'conservative', или 'none' (без фильтра)


        rules: `
// c(lag)        — свеча:      .open .high .low .close
// ind(name,lag) — индикатор:  ind('bb',-1).upper / .middle / .lower
// phase(lag)    — фаза рынка: { name, confidence, score }
// bal(lag)      — баланс:     число или null
// dealStats(n)  — статистика последних n сделок
// === REB + Break (реалистичные параметры) ===

const bb0 = ind('bb', 0), bb1 = ind('bb', -1);
if (bb0 && bb0.upper !== null && bb1 && bb1.upper !== null) {
    const cv0 = c(0), cv1 = c(-1);
    if (cv0 && cv1) {
        const runtimeParams = (globalThis.Strategy && globalThis.Strategy.params) || {};
        const flatWidthLookback = Math.max(5, Number(runtimeParams.flatWidthLookback || 15));
        const squeezeWidthFactor = Number(runtimeParams.squeezeWidthFactor || 0.75);

        const widthNow = bb0.upper - bb0.lower;
        if (widthNow > 0) {
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
            if (wAvg > 0) {
                const isFlat = widthNow <= wAvg * 1.15;
                const isSqueeze = widthNow <= wAvg * squeezeWidthFactor;

                const touchedUpper = cv0.high >= bb0.upper || cv0.close >= bb0.upper;
                const touchedLower = cv0.low <= bb0.lower || cv0.close <= bb0.lower;
                const brokeUp = cv0.close > bb0.upper && cv1.close <= bb1.upper;
                const brokeDn = cv0.close < bb0.lower && cv1.close >= bb1.lower;

                const ph = phase(0);
                const phaseName = ph && ph.name ? ph.name : 'flat';
                const phaseScore = ph && Number.isFinite(ph.score) ? ph.score : 0;

                // Пробой: только при направленной фазе или в squeeze.
                const allowBreakoutUp = phaseName === 'squeeze' || phaseScore > 1.2;
                const allowBreakoutDn = phaseName === 'squeeze' || phaseScore < -1.2;

                // Отскок: только во флэте/слабой компрессии.
                const allowRebound = phaseName === 'flat' || (phaseName === 'squeeze' && Math.abs(phaseScore) < 1.0);

                // 3) Режим сжатия: торгуем пробой в сторону импульса
                if (isSqueeze && brokeUp && allowBreakoutUp) {
                    buy += 1;
                }
                if (isSqueeze && brokeDn && allowBreakoutDn) {
                    sell += 1;
                }

                // 1) Режим флэта: отбой от границ BB (только если не в режиме сжатия)
                if (!isSqueeze && allowRebound) {
                    if (touchedLower) buy += 1;
                    if (touchedUpper) sell += 1;
                }

                // 4) Мартингейл: если предыдущая сделка (до 2 TF) была убыточной,
                if (typeof lastLossWithinTf === 'function' && lastLossWithinTf(2)) {
                    if (buy >= 1) buy += 0;
                    if (sell >= 1) sell += 0;
                }
            }
        }
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

