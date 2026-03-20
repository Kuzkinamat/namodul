/**
 * Market Phase Indicator
 * Определяет фазу рынка: squeeze, flat, trend_up, trend_down, chaos
 * 
 * Возвращает массивы для каждой свечи с фазой и уверенностью (0-1)
 */

function calculatePhaseIndicator(candles, bb, atr, period = 20, structureLookback = 30) {
  const n = Array.isArray(candles) ? candles.length : 0;
  const phases = [];
  const confidence = [];
  const phaseScore = [];

  if (!n || !Array.isArray(bb) || bb.length !== n || !Array.isArray(atr) || atr.length !== n) {
    return { phase: [], confidence: [], phaseScore: [] };
  }

  // Вычислим ширины Bollinger Bands (bb - массив объектов { upper, middle, lower })
  const bbWidths = new Array(n);
  for (let i = 0; i < n; i++) {
    const row = bb[i];
    if (!row || !Number.isFinite(row.upper) || !Number.isFinite(row.lower)) {
      bbWidths[i] = null;
      continue;
    }
    bbWidths[i] = row.upper - row.lower;
  }

  // Основной цикл по свечам
  for (let i = Math.max(structureLookback, period); i < n; i++) {
    let phase = 'chaos';
    let conf = 0.5;

    // === ШАГИ АНАЛИЗА ===

    // 1. Анализ ширины Bollinger Bands (локально за period свечей)
    const currentWidth = bbWidths[i];
    let wSum = 0, wCnt = 0;
    for (let j = Math.max(0, i - period + 1); j <= i; j++) {
      const w = bbWidths[j];
      if (Number.isFinite(w) && w > 0) { wSum += w; wCnt++; }
    }
    const avgWidth = wCnt > 0 ? wSum / wCnt : (Number.isFinite(currentWidth) ? currentWidth : 0);

    const widthRatio = Number.isFinite(currentWidth) && Number.isFinite(avgWidth) && avgWidth > 0
      ? currentWidth / avgWidth
      : 1;

    // 2. Анализ дистанции цены от SMA
    const currentPrice = candles[i].close;
    const smaValue = bb[i] ? bb[i].middle : null;
    const atrValue = atr[i] || atr[atr.length - 1] || 0;
    const distFromSMA = Number.isFinite(smaValue) && atrValue > 0
      ? Math.abs(currentPrice - smaValue) / atrValue
      : 0;

    // 3. Анализ структуры High-Low (ищем тренд)
    const trendSignal = analyzeTrendStructure(candles, Math.max(0, i - structureLookback), i, atrValue);

    // === ЛОГИКА ОПРЕДЕЛЕНИЯ ФАЗЫ ===

    // SQUEEZE: Очень узкие полосы + цена близко к середине
    if (widthRatio < 0.4 && distFromSMA < 0.8) {
      phase = 'squeeze';
      conf = Math.min(1, 0.9 + (0.4 - widthRatio) * 0.25);
    }
    // FLAT: Узкие полосы, но цена может быть чуть дальше
    else if (widthRatio < 0.7 && distFromSMA < 1.2) {
      phase = 'flat';
      conf = Math.min(1, 0.8 + (0.7 - widthRatio) * 0.3);
    }
    // TREND_UP: Цена выше SMA, структура показывает восход
    else if (trendSignal.direction === 'up' && currentPrice > smaValue) {
      phase = 'trend_up';
      conf = trendSignal.strength;
    }
    // TREND_DOWN: Цена ниже SMA, структура показывает спуск
    else if (trendSignal.direction === 'down' && currentPrice < smaValue) {
      phase = 'trend_down';
      conf = trendSignal.strength;
    }
    // CHAOS: Всё остальное - высокая волатильность, нет структуры
    else {
      phase = 'chaos';
      conf = Math.min(1, 0.5 + (widthRatio - 1.2) * 0.1);
    }

    // Числовой score для стратегии/визуализации:
    // trend_up > 0, trend_down < 0, flat/chaos около 0, squeeze умеренно положительный.
    let score = 0;
    if (phase === 'trend_up') score = 1 + conf;
    else if (phase === 'trend_down') score = -(1 + conf);
    else if (phase === 'squeeze') score = 0.5 + conf * 0.5;
    else if (phase === 'flat') score = conf * 0.2;
    else score = 0;

    phases.push(phase);
    confidence.push(conf);
    phaseScore.push(score);
  }

  // Заполним начало значениями по умолчанию
  const fillValue = 'flat';
  while (phases.length < n) {
    phases.unshift(fillValue);
    confidence.unshift(0.3);
    phaseScore.unshift(0.06);
  }

  return {
    phase: phases,           // массив строк: 'squeeze', 'flat', 'trend_up', 'trend_down', 'chaos'
    confidence: confidence,  // массив чисел 0-1
    phaseScore: phaseScore,  // массив чисел: вниз < 0, флет ~ 0, вверх > 0
  };
}

/**
 * Анализирует структуру High-Low для определения тренда
 * Ищет растущие/падающие локальные экстремумы
 */
function analyzeTrendStructure(candles, startIdx, endIdx, atrValue) {
  if (endIdx - startIdx + 1 < 5) {
    return { direction: 'none', strength: 0.5 };
  }

  let upCount = 0;
  let downCount = 0;

  // Ищем локальные максимумы и минимумы
  for (let i = startIdx + 2; i <= endIdx - 2; i++) {
    // Локальный максимум
    if (
      candles[i].high > candles[i - 1].high &&
      candles[i].high > candles[i + 1].high
    ) {
      if (candles[i].high > candles[i - 2].high) upCount++;
      else downCount++;
    }

    // Локальный минимум
    if (
      candles[i].low < candles[i - 1].low &&
      candles[i].low < candles[i + 1].low
    ) {
      if (candles[i].low < candles[i - 2].low) downCount++;
      else upCount++;
    }
  }

  const total = upCount + downCount;
  if (total === 0) {
    return { direction: 'none', strength: 0.5 };
  }

  const upRatio = upCount / total;

  let direction = 'none';
  let strength = 0.5;

  if (upRatio > 0.6) {
    direction = 'up';
    strength = 0.5 + upRatio * 0.5; // 0.8-1.0
  } else if (upRatio < 0.4) {
    direction = 'down';
    strength = 0.5 + (1 - upRatio) * 0.5; // 0.8-1.0
  } else {
    direction = 'none';
    strength = 0.5;
  }

  return { direction, strength };
}

/**
 * Фильтр для сигналов: пропускать торговлю только в подходящих фазах
 */
function shouldTradeInPhase(phase, tradeType = 'breakout') {
  // breakout: работает в squeeze->trend переходе
  if (tradeType === 'breakout') {
    return phase === 'squeeze' || phase === 'flat' || phase === 'trend_up' || phase === 'trend_down';
  }

  // trend: работает в тренде
  if (tradeType === 'trend') {
    return phase === 'trend_up' || phase === 'trend_down';
  }

  // mean_reversion: работает в flat'е
  if (tradeType === 'mean_reversion') {
    return phase === 'flat' || phase === 'squeeze';
  }

  // conservative: только в четких тренд-фазах
  if (tradeType === 'conservative') {
    return phase === 'trend_up' || phase === 'trend_down';
  }

  return true; // по умолчанию не фильтруем
}

/**
 * Экспорт для использования в стратегии
 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculatePhaseIndicator,
    analyzeTrendStructure,
    shouldTradeInPhase,
  };
}
