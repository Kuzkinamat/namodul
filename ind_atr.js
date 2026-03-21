/**
 * ATR (Average True Range) Indicator
 * Измеряет волатильность цены
 */

function calcATR(candles, period = 120, smoothPeriod = 60) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return [];
  }

  const atr = [];
  const tr = []; // True Range

  // Вычислим True Range для каждой свечи
  for (let i = 0; i < candles.length; i++) {
    const current = candles[i];
    let trValue;

    if (i === 0) {
      // Первая свеча: TR = High - Low
      trValue = current.high - current.low;
    } else {
      const prev = candles[i - 1];
      const h = current.high;
      const l = current.low;
      const pc = prev.close;

      // TR = max(H - L, |H - PC|, |L - PC|)
      const hl = h - l;
      const hc = Math.abs(h - pc);
      const lc = Math.abs(l - pc);
      trValue = Math.max(hl, hc, lc);
    }

    tr.push(trValue);

    // Вычислим ATR как SMA от TR
    if (i < period - 1) {
      atr.push(null);
    } else if (i === period - 1) {
      // Первый ATR: простое среднее
      const sum = tr.slice(0, period).reduce((a, b) => a + b, 0);
      atr.push(sum / period);
    } else {
      // Сглаживание: (PrevATR * (period - 1) + CurrentTR) / period
      const prevATR = atr[i - 1];
      const smoothedATR = (prevATR * (period - 1) + trValue) / period;
      atr.push(smoothedATR);
    }
  }

  const sp = Math.max(1, Number(smoothPeriod) || 1);
  if (sp <= 1) {
    return atr;
  }

  // Доп. сглаживание ATR через EMA, чтобы убрать резкие всплески на графике.
  const k = 2 / (sp + 1);
  const smoothed = new Array(atr.length).fill(null);
  let prev = null;

  for (let i = 0; i < atr.length; i++) {
    const v = atr[i];
    if (!Number.isFinite(v)) {
      continue;
    }

    if (!Number.isFinite(prev)) {
      prev = v;
    } else {
      prev = (v - prev) * k + prev;
    }
    smoothed[i] = prev;
  }

  return smoothed;
}

/**
 * Экспорт для использования в стратегии
 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcATR };
}
