import EURUSDData from './data/EURUSD_M5_data.js';

function calcBB(data, period, stdDev) {
  const out = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      out.push({ upper: null, middle: null, lower: null });
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
    const mean = sum / period;
    let varSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = data[j].close - mean;
      varSum += d * d;
    }
    const std = Math.sqrt(varSum / period);
    out.push({
      upper: mean + stdDev * std,
      middle: mean,
      lower: mean - stdDev * std
    });
  }
  return out;
}

function calcATR(candles, period = 14) {
  const atr = [];
  const tr = [];
  for (let i = 0; i < candles.length; i++) {
    const current = candles[i];
    let trValue;
    if (i === 0) {
      trValue = current.high - current.low;
    } else {
      const prev = candles[i - 1];
      const h = current.high, l = current.low, pc = prev.close;
      const hl = h - l, hc = Math.abs(h - pc), lc = Math.abs(l - pc);
      trValue = Math.max(hl, hc, lc);
    }
    tr.push(trValue);
    if (i < period - 1) {
      atr.push(null);
    } else if (i === period - 1) {
      const sum = tr.slice(0, period).reduce((a, b) => a + b, 0);
      atr.push(sum / period);
    } else {
      const prevATR = atr[i - 1];
      const smoothedATR = (prevATR * (period - 1) + trValue) / period;
      atr.push(smoothedATR);
    }
  }
  return atr;
}

function analyzeTrendStructure(candles, atrValue) {
  if (candles.length < 5) return { direction: 'none', strength: 0.5 };
  let upCount = 0, downCount = 0;
  for (let i = 2; i < candles.length - 2; i++) {
    if (candles[i].high > candles[i-1].high && candles[i].high > candles[i+1].high) {
      if (candles[i].high > candles[i-2].high) upCount++; else downCount++;
    }
    if (candles[i].low < candles[i-1].low && candles[i].low < candles[i+1].low) {
      if (candles[i].low < candles[i-2].low) downCount++; else upCount++;
    }
  }
  const total = upCount + downCount;
  if (total === 0) return { direction: 'none', strength: 0.5 };
  const upRatio = upCount / total;
  if (upRatio > 0.6) return { direction: 'up', strength: 0.5 + upRatio * 0.5 };
  if (upRatio < 0.4) return { direction: 'down', strength: 0.5 + (1 - upRatio) * 0.5 };
  return { direction: 'none', strength: 0.5 };
}

function calculatePhaseIndicator(candles, bb, atr, period = 20, structureLookback = 30) {
  const n = candles.length;
  const phases = [];
  const confidence = [];
  const bbWidths = [];
  for (let i = 0; i < n; i++) {
    const width = bb[i].upper - bb[i].lower;
    bbWidths.push(width);
  }
  for (let i = Math.max(structureLookback, period); i < n; i++) {
    let phase = 'chaos', conf = 0.5;
    const recentWidths = bbWidths.slice(Math.max(0, i - period + 1), i + 1);
    const avgWidth = recentWidths.reduce((a, b) => a + b, 0) / recentWidths.length;
    const currentWidth = bbWidths[i];
    const widthRatio = avgWidth > 0 ? currentWidth / avgWidth : 1;
    const currentPrice = candles[i].close;
    const smaValue = bb[i].middle;
    const atrValue = atr[i] || atr[atr.length - 1];
    const distFromSMA = Math.abs(currentPrice - smaValue) / (atrValue || 1);
    const structureData = candles.slice(Math.max(0, i - structureLookback), i + 1);
    const trendSignal = analyzeTrendStructure(structureData, atrValue);
    if (widthRatio < 0.4 && distFromSMA < 0.8) {
      phase = 'squeeze'; conf = Math.min(1, 0.9 + (0.4 - widthRatio) * 0.25);
    } else if (widthRatio < 0.7 && distFromSMA < 1.2) {
      phase = 'flat'; conf = Math.min(1, 0.8 + (0.7 - widthRatio) * 0.3);
    } else if (trendSignal.direction === 'up' && currentPrice > smaValue) {
      phase = 'trend_up'; conf = trendSignal.strength;
    } else if (trendSignal.direction === 'down' && currentPrice < smaValue) {
      phase = 'trend_down'; conf = trendSignal.strength;
    } else {
      phase = 'chaos'; conf = Math.min(1, 0.5 + (widthRatio - 1.2) * 0.1);
    }
    phases.push(phase);
    confidence.push(conf);
  }
  while (phases.length < n) {
    phases.unshift('flat');
    confidence.unshift(0.3);
  }
  return { phase: phases, confidence: confidence };
}

const data = EURUSDData.slice(0, 100000);
console.log('PHASE ANALYSIS EURUSD M5');
console.log('Data: ' + data.length + ' candles\n');

const bb = calcBB(data, 48, 1.4);
const atr = calcATR(data, 14);
const phaseResult = calculatePhaseIndicator(data, bb, atr, 20, 30);

const phaseStats = {
  squeeze: { count: 0, confidence: [] },
  flat: { count: 0, confidence: [] },
  trend_up: { count: 0, confidence: [] },
  trend_down: { count: 0, confidence: [] },
  chaos: { count: 0, confidence: [] }
};

for (let i = 0; i < phaseResult.phase.length; i++) {
  const p = phaseResult.phase[i];
  if (phaseStats[p]) {
    phaseStats[p].count++;
    phaseStats[p].confidence.push(phaseResult.confidence[i]);
  }
}

console.log('PHASE DISTRIBUTION:');
console.log('');

const total = phaseResult.phase.length;
const phases = ['squeeze', 'flat', 'trend_up', 'trend_down', 'chaos'];

for (const phase of phases) {
  const stats = phaseStats[phase];
  const pct = ((stats.count / total) * 100).toFixed(1);
  const avgConf = stats.confidence.length > 0 
    ? (stats.confidence.reduce((a,b) => a+b) / stats.confidence.length).toFixed(2)
    : 0;
  
  console.log(phase.padEnd(12) + ' | ' + (stats.count + '').padStart(6) + ' | ' + (pct + '%').padStart(6) + ' | conf: ' + avgConf);
}

console.log('');

const squeezeFreq = (phaseStats.squeeze.count / total) * 100;
const trendFreq = ((phaseStats.trend_up.count + phaseStats.trend_down.count) / total) * 100;
const chaosFreq = (phaseStats.chaos.count / total) * 100;
const flatFreq = (phaseStats.flat.count / total) * 100;

console.log('SUMMARY:');
console.log('Squeeze: ' + squeezeFreq.toFixed(1) + '%');
console.log('Flat: ' + flatFreq.toFixed(1) + '%');
console.log('Trend: ' + trendFreq.toFixed(1) + '%');
console.log('Chaos: ' + chaosFreq.toFixed(1) + '%');

console.log('\nRECOMMENDATIONS:');
if (chaosFreq > 20) {
  console.log('- NEED FILTER: ' + chaosFreq.toFixed(1) + '% chaos detected');
}
if (squeezeFreq + flatFreq > 40) {
  console.log('- GOOD FOR: breakout strategy (high squeeze/flat)');
}
if (trendFreq > 30) {
  console.log('- GOOD FOR: trend-follow strategy');
}
