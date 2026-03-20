import EURUSDData from './data/EURUSD_M5_data.js';
import GBPUSDData from './data/GBPUSD_M5_data.js';
import USDCADData from './data/USDCAD_M5_data.js';
import USDCHFData from './data/USDCHF_M5_data.js';
import USDJPYData from './data/USDJPY_M5_data.js';

// ─── Indicator calculations ────────────────────────────────────────────────

function calcBB(data, period, stdDev) {
  const bb = [];
  let sum = 0, sumSq = 0;
  for (let i = 0; i < period - 1; i++) {
    const v = data[i].close;
    sum += v; sumSq += v * v;
    bb.push({ upper: null, middle: null, lower: null });
  }
  for (let i = period - 1; i < data.length; i++) {
    if (i > period - 1) {
      const old = data[i - period].close;
      sum -= old; sumSq -= old * old;
    }
    const v = data[i].close;
    sum += v; sumSq += v * v;
    const mean = sum / period;
    const std = Math.sqrt(Math.max(0, sumSq / period - mean * mean));
    bb.push({ upper: mean + stdDev * std, middle: mean, lower: mean - stdDev * std });
  }
  return bb;
}

function calcATR(candles, period = 14) {
  const atr = [];
  const tr = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const trv = i === 0 ? c.high - c.low
      : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close));
    tr.push(trv);
    if (i < period - 1) { atr.push(null); continue; }
    if (i === period - 1) { atr.push(tr.slice(0, period).reduce((a, b) => a + b, 0) / period); continue; }
    atr.push((atr[i - 1] * (period - 1) + trv) / period);
  }
  return atr;
}

function analyzeTrendStructure(candles, startIdx, endIdx) {
  if (endIdx - startIdx + 1 < 5) return { direction: 'none', strength: 0.5 };
  let up = 0, dn = 0;
  for (let i = startIdx + 2; i <= endIdx - 2; i++) {
    if (candles[i].high > candles[i - 1].high && candles[i].high > candles[i + 1].high) {
      if (candles[i].high > candles[i - 2].high) up++; else dn++;
    }
    if (candles[i].low < candles[i - 1].low && candles[i].low < candles[i + 1].low) {
      if (candles[i].low < candles[i - 2].low) dn++; else up++;
    }
  }
  const total = up + dn;
  if (total === 0) return { direction: 'none', strength: 0.5 };
  const r = up / total;
  if (r > 0.6) return { direction: 'up', strength: 0.5 + r * 0.5 };
  if (r < 0.4) return { direction: 'down', strength: 0.5 + (1 - r) * 0.5 };
  return { direction: 'none', strength: 0.5 };
}

function calcPhase(candles, bb, atr, period, structureLookback) {
  const n = candles.length;
  const phases = new Array(n);
  const scores = new Array(n);
  const widths = new Array(n);

  for (let i = 0; i < n; i++) {
    const row = bb[i];
    widths[i] = (row && row.upper !== null) ? row.upper - row.lower : null;
  }

  const minStart = Math.max(structureLookback, period);
  for (let i = 0; i < minStart; i++) { phases[i] = 'flat'; scores[i] = 0.06; }

  for (let i = minStart; i < n; i++) {
    const curW = widths[i];

    let wSum = 0, wCnt = 0;
    for (let j = Math.max(0, i - period + 1); j <= i; j++) {
      const w = widths[j];
      if (w !== null && w > 0) { wSum += w; wCnt++; }
    }
    const avgW = wCnt > 0 ? wSum / wCnt : (curW || 0);
    const wRatio = (curW && avgW > 0) ? curW / avgW : 1;

    const price = candles[i].close;
    const sma = bb[i].middle;
    const atrV = atr[i] || atr[n - 1] || 0;
    const dist = atrV > 0 ? Math.abs(price - sma) / atrV : 0;

    const trend = analyzeTrendStructure(candles, Math.max(0, i - structureLookback), i);

    let phase, conf;
    if (wRatio < 0.4 && dist < 0.8) {
      phase = 'squeeze'; conf = Math.min(1, 0.9 + (0.4 - wRatio) * 0.25);
    } else if (wRatio < 0.7 && dist < 1.2) {
      phase = 'flat'; conf = Math.min(1, 0.8 + (0.7 - wRatio) * 0.3);
    } else if (trend.direction === 'up' && price > sma) {
      phase = 'trend_up'; conf = trend.strength;
    } else if (trend.direction === 'down' && price < sma) {
      phase = 'trend_down'; conf = trend.strength;
    } else {
      phase = 'chaos'; conf = Math.min(1, 0.5 + (wRatio - 1.2) * 0.1);
    }

    phases[i] = phase;
    let score = 0;
    if (phase === 'trend_up') score = 1 + conf;
    else if (phase === 'trend_down') score = -(1 + conf);
    else if (phase === 'squeeze') score = 0.5 + conf * 0.5;
    else if (phase === 'flat') score = conf * 0.2;
    scores[i] = score;
  }
  return { phases, scores };
}

// ─── Strategy evaluation ──────────────────────────────────────────────────

function evalStrategy(data, params) {
  const {
    bbPeriod, bbStdDev,
    flatWidthLookback, squeezeWidthFactor, phaseThreshold,
    expirationCandles, phasePeriod, phaseStructureLookback,
  } = params;

  const bb = calcBB(data, bbPeriod, bbStdDev);
  const atr = calcATR(data, 14);
  const { phases, scores } = calcPhase(data, bb, atr, phasePeriod, phaseStructureLookback);

  let wins = 0, losses = 0;
  const minI = Math.max(bbPeriod, flatWidthLookback, phaseStructureLookback) + 2;
  const maxI = data.length - expirationCandles - 1;

  for (let i = minI; i < maxI; i++) {
    const bb0 = bb[i], bb1 = bb[i - 1];
    if (!bb0 || bb0.upper === null || !bb1 || bb1.upper === null) continue;

    const cv0 = data[i], cv1 = data[i - 1];
    const widthNow = bb0.upper - bb0.lower;
    if (widthNow <= 0) continue;

    // Rolling average width
    let wSum = 0, wCnt = 0;
    for (let lag = 1; lag <= flatWidthLookback; lag++) {
      const b = bb[i - lag];
      if (b && b.upper !== null) { wSum += b.upper - b.lower; wCnt++; }
    }
    const wAvg = wCnt > 0 ? wSum / wCnt : widthNow;
    if (wAvg <= 0) continue;

    const isSqueeze = widthNow <= wAvg * squeezeWidthFactor;

    const ph = phases[i];
    const sc = scores[i];

    const brokeUp = cv0.close > bb0.upper && cv1.close <= bb1.upper;
    const brokeDn = cv0.close < bb0.lower && cv1.close >= bb1.lower;
    const touchedUpper = cv0.high >= bb0.upper || cv0.close >= bb0.upper;
    const touchedLower = cv0.low <= bb0.lower || cv0.close <= bb0.lower;

    const allowBreakoutUp = ph === 'squeeze' || sc > phaseThreshold;
    const allowBreakoutDn = ph === 'squeeze' || sc < -phaseThreshold;
    const allowRebound = ph === 'flat' || (ph === 'squeeze' && Math.abs(sc) < 1.0);

    let dir = 0; // +1 = buy, -1 = sell
    if (isSqueeze && brokeUp && allowBreakoutUp) dir = 1;
    else if (isSqueeze && brokeDn && allowBreakoutDn) dir = -1;
    else if (!isSqueeze && allowRebound && touchedLower) dir = 1;
    else if (!isSqueeze && allowRebound && touchedUpper) dir = -1;

    if (dir === 0) continue;

    const entryClose = cv0.close;
    const exitClose = data[i + expirationCandles].close;
    const win = dir === 1 ? exitClose > entryClose : exitClose < entryClose;
    if (win) wins++; else losses++;
  }

  const total = wins + losses;
  return { wins, losses, total, winrate: total > 0 ? wins / total : 0 };
}

// ─── Grid definition ─────────────────────────────────────────────────────

const grid = {
  bbPeriod:              [24, 36, 48],
  bbStdDev:              [1.4, 1.8, 2.2],
  squeezeWidthFactor:    [0.65, 0.75, 0.85],
  phaseThreshold:        [0.8, 1.2, 1.6],
  flatWidthLookback:     [10, 15, 20],
  expirationCandles:     [3],   // 15 min on M5
  phasePeriod:           [20],
  phaseStructureLookback:[30],
};

function* cartesian(g) {
  const keys = Object.keys(g);
  const vals = keys.map(k => g[k]);
  function* rec(i, cur) {
    if (i === keys.length) { yield { ...cur }; return; }
    for (const v of vals[i]) { cur[keys[i]] = v; yield* rec(i + 1, cur); }
  }
  yield* rec(0, {});
}

// ─── Run ──────────────────────────────────────────────────────────────────

const allData = [
  { name: 'EURUSD', data: EURUSDData.slice(0, 100000) },
  { name: 'GBPUSD', data: GBPUSDData.slice(0, 100000) },
  { name: 'USDCAD', data: USDCADData.slice(0, 100000) },
  { name: 'USDCHF', data: USDCHFData.slice(0, 100000) },
  { name: 'USDJPY', data: USDJPYData.slice(0, 100000) },
];

// Count total combinations
let totalCombos = 1;
for (const v of Object.values(grid)) totalCombos *= v.length;
console.log(`Grid: ${totalCombos} combinations × ${allData.length} pairs\n`);
const t0 = Date.now();

const results = [];

for (const params of cartesian(grid)) {
  let totalWins = 0, totalLosses = 0;
  for (const { data } of allData) {
    const r = evalStrategy(data, params);
    totalWins += r.wins;
    totalLosses += r.losses;
  }
  const total = totalWins + totalLosses;
  const winrate = total > 0 ? totalWins / total : 0;
  results.push({ params, wins: totalWins, losses: totalLosses, total, winrate });
}

results.sort((a, b) => b.winrate - a.winrate);

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`Done in ${elapsed}s\n`);
console.log('=== TOP 20 by winrate (break-even = 55.56% at 80% payout) ===\n');

const breakEven = 1 / 1.8;

for (const r of results.slice(0, 20)) {
  const p = r.params;
  const wr = (r.winrate * 100).toFixed(2);
  const ev = ((r.winrate * 1.8 - 1) * 100).toFixed(1);
  const flag = r.winrate >= breakEven ? '✓ +EV' : '✗';
  console.log(
    `${flag}  wr=${wr}%  ev=${ev}%  n=${r.total}` +
    `  bb${p.bbPeriod}/${p.bbStdDev}  sq=${p.squeezeWidthFactor}` +
    `  ph=${p.phaseThreshold}  lbk=${p.flatWidthLookback}`
  );
}

console.log('\n=== BEST PARAMS ===');
const best = results[0];
console.log(JSON.stringify(best.params, null, 2));
console.log(`winrate: ${(best.winrate * 100).toFixed(2)}%  trades: ${best.total}  ev: ${((best.winrate * 1.8 - 1) * 100).toFixed(1)}%`);
