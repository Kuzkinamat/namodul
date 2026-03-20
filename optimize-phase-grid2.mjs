import EURUSDData from './data/EURUSD_M5_data.js';
import GBPUSDData from './data/GBPUSD_M5_data.js';
import USDCADData from './data/USDCAD_M5_data.js';
import USDCHFData from './data/USDCHF_M5_data.js';
import USDJPYData from './data/USDJPY_M5_data.js';

// ─── Indicators (typed-array based for speed) ─────────────────────────────

function calcBB(data, period, stdDev) {
  const n = data.length;
  const upper = new Float64Array(n);
  const middle = new Float64Array(n);
  const lower = new Float64Array(n);
  let sum = 0, sumSq = 0;
  for (let i = 0; i < period - 1; i++) {
    const v = data[i].close; sum += v; sumSq += v * v;
    upper[i] = middle[i] = lower[i] = NaN;
  }
  for (let i = period - 1; i < n; i++) {
    if (i > period - 1) {
      const old = data[i - period].close; sum -= old; sumSq -= old * old;
    }
    const v = data[i].close; sum += v; sumSq += v * v;
    const mean = sum / period;
    const std = Math.sqrt(Math.max(0, sumSq / period - mean * mean));
    upper[i] = mean + stdDev * std;
    middle[i] = mean;
    lower[i] = mean - stdDev * std;
  }
  return { upper, middle, lower };
}

function calcATR(candles, period) {
  const n = candles.length;
  const atr = new Float64Array(n);
  let prevATR = 0;
  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const trv = i === 0 ? c.high - c.low
      : Math.max(c.high - c.low, Math.abs(c.high - candles[i-1].close), Math.abs(c.low - candles[i-1].close));
    if (i < period - 1) continue;
    if (i === period - 1) {
      let s = 0;
      for (let j = 0; j < period; j++) s += candles[j].high - candles[j].low;
      prevATR = s / period; atr[i] = prevATR; continue;
    }
    prevATR = (prevATR * (period - 1) + trv) / period;
    atr[i] = prevATR;
  }
  return atr;
}

function calcPhase(bbUpper, bbMiddle, bbLower, highs, lows, closes, atr, period, structureLookback) {
  const n = closes.length;
  const phaseArr = new Int8Array(n); // 0=flat,1=squeeze,2=trend_up,3=trend_down,4=chaos
  const widths = new Float64Array(n);
  for (let i = 0; i < n; i++) widths[i] = bbUpper[i] - bbLower[i];

  const minStart = Math.max(structureLookback, period);
  for (let i = minStart; i < n; i++) {
    const curW = widths[i];
    if (!(curW > 0)) { phaseArr[i] = 4; continue; }

    let wSum = 0, wCnt = 0;
    for (let j = Math.max(0, i - period + 1); j <= i; j++) {
      if (widths[j] > 0) { wSum += widths[j]; wCnt++; }
    }
    const avgW = wCnt > 0 ? wSum / wCnt : curW;
    const wRatio = curW / avgW;

    const sma = bbMiddle[i];
    const atrV = atr[i] || 0.0001;
    const dist = Math.abs(closes[i] - sma) / atrV;

    const s0 = Math.max(0, i - structureLookback);
    let up = 0, dn = 0;
    for (let k = s0 + 2; k <= i - 2; k++) {
      if (highs[k] > highs[k-1] && highs[k] > highs[k+1]) {
        if (highs[k] > highs[k-2]) up++; else dn++;
      }
      if (lows[k] < lows[k-1] && lows[k] < lows[k+1]) {
        if (lows[k] < lows[k-2]) dn++; else up++;
      }
    }
    const total = up + dn;
    let tdir = 0;
    if (total > 0) { const r = up/total; tdir = r > 0.6 ? 1 : r < 0.4 ? -1 : 0; }

    if (wRatio < 0.4 && dist < 0.8) phaseArr[i] = 1;
    else if (wRatio < 0.7 && dist < 1.2) phaseArr[i] = 0;
    else if (tdir === 1 && closes[i] > sma) phaseArr[i] = 2;
    else if (tdir === -1 && closes[i] < sma) phaseArr[i] = 3;
    else phaseArr[i] = 4;
  }
  return { phaseArr, widths };
}

// ─── Signal evaluation with precomputed data ──────────────────────────────

function evalSignals(pre, sigParams) {
  const { bbUpper, bbLower, bbUpper1, bbLower1, widths, wPrefix, wCount, phaseArr, closes, highs, lows, minStart, n } = pre;
  const { flatWidthLookback, squeezeWidthFactor, expirationCandles, mode, phaseStrict } = sigParams;

  let wins = 0, losses = 0;
  const minI = minStart + flatWidthLookback + 2;
  const maxI = n - expirationCandles - 1;

  for (let i = minI; i < maxI; i++) {
    const u0 = bbUpper[i], l0 = bbLower[i];
    const u1 = bbUpper1[i], l1 = bbLower1[i];
    if (!(u0 > 0) || !(u1 > 0)) continue;

    const widthNow = widths[i];
    if (!(widthNow > 0)) continue;

    // O(1) rolling average using prefix sums (lookback = [i-lbk, i-1])
    const lo = i - flatWidthLookback, hi = i - 1;
    const wSum = wPrefix[hi + 1] - wPrefix[lo];
    const wCnt = wCount[hi + 1]  - wCount[lo];
    const wAvg = wCnt > 0 ? wSum / wCnt : widthNow;
    if (!(wAvg > 0)) continue;

    const isSqueeze = widthNow <= wAvg * squeezeWidthFactor;
    const ph = phaseArr[i];
    const c0 = closes[i], c1 = closes[i - 1];

    const brokeUp = c0 > u0 && c1 <= u1;
    const brokeDn = c0 < l0 && c1 >= l1;
    const tUpper = highs[i] >= u0 || c0 >= u0;
    const tLower = lows[i] <= l0 || c0 <= l0;

    let pabu, pabd, par;
    if (phaseStrict) {
      pabu = ph === 2;           // trend_up only
      pabd = ph === 3;           // trend_down only
      par  = ph === 0 || ph === 1; // flat or squeeze
    } else {
      pabu = ph === 1 || ph === 2; // squeeze or trend_up
      pabd = ph === 1 || ph === 3; // squeeze or trend_down
      par  = ph === 0 || ph === 1; // flat or squeeze
    }

    let dir = 0;
    if (mode !== 'rebound_only') {
      if (isSqueeze && brokeUp && pabu) dir = 1;
      else if (isSqueeze && brokeDn && pabd) dir = -1;
    }
    if (dir === 0 && mode !== 'breakout_only') {
      if (!isSqueeze && par && tLower) dir = 1;
      else if (!isSqueeze && par && tUpper) dir = -1;
    }
    if (dir === 0) continue;

    const win = dir === 1 ? closes[i + expirationCandles] > c0 : closes[i + expirationCandles] < c0;
    if (win) wins++; else losses++;
  }
  return { wins, losses };
}

// ─── Grid definition ──────────────────────────────────────────────────────

const BB_PARAMS = [
  [20, 1.4], [20, 1.8], [20, 2.2],
  [30, 1.4], [30, 1.8], [30, 2.2],
  [48, 1.4], [48, 1.8], [48, 2.2],
];

const SIGNAL_GRID = {
  squeezeWidthFactor: [0.60, 0.70, 0.80, 0.90],
  flatWidthLookback:  [8, 12, 20],
  expirationCandles:  [1, 2, 3, 6],
  mode:               ['rebound_only', 'breakout_only', 'both'],
  phaseStrict:        [false, true],
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

const PHASEP = 20, PHASESL = 30;

const rawData = [
  { name: 'EURUSD', data: EURUSDData.slice(0, 100000) },
];

let sigCombos = 1;
for (const v of Object.values(SIGNAL_GRID)) sigCombos *= v.length;
const totalCombos = BB_PARAMS.length * sigCombos;
console.log(`Grid: ${BB_PARAMS.length} BB × ${sigCombos} signal = ${totalCombos} combos × ${rawData.length} pairs`);

const t0 = Date.now();

// Step 1: Precompute once per (dataset × BB params)
const precomputed = []; // [dsIdx][bbIdx]
for (const { name, data } of rawData) {
  const n = data.length;
  const closes = new Float64Array(n);
  const highs  = new Float64Array(n);
  const lows   = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    closes[i] = data[i].close;
    highs[i]  = data[i].high;
    lows[i]   = data[i].low;
  }
  const atr = calcATR(data, 14);
  const perBB = [];
  for (const [bbPeriod, bbStdDev] of BB_PARAMS) {
    const bb = calcBB(data, bbPeriod, bbStdDev);
    // Shifted: bb[i-1] values
    const bbU1 = new Float64Array(n);
    const bbL1 = new Float64Array(n);
    for (let i = 1; i < n; i++) { bbU1[i] = bb.upper[i-1]; bbL1[i] = bb.lower[i-1]; }
    const { phaseArr, widths } = calcPhase(bb.upper, bb.middle, bb.lower, highs, lows, closes, atr, PHASEP, PHASESL);
    const minStart = Math.max(PHASESL, PHASEP);
    // Prefix sum of widths for O(1) rolling average queries
    const wPrefix = new Float64Array(n + 1);
    const wCount  = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) {
      wPrefix[i+1] = wPrefix[i] + (widths[i] > 0 ? widths[i] : 0);
      wCount[i+1]  = wCount[i]  + (widths[i] > 0 ? 1 : 0);
    }
    perBB.push({ bbUpper: bb.upper, bbLower: bb.lower, bbUpper1: bbU1, bbLower1: bbL1,
                 widths, wPrefix, wCount, phaseArr, closes, highs, lows, minStart, n });
  }
  precomputed.push(perBB);
}

const t1 = Date.now();
console.log(`Precomputed in ${((t1 - t0)/1000).toFixed(1)}s. Sweeping ${sigCombos} signal combos...`);

// Step 2: Sweep signal params — store per-bbIdx wins/losses too
const results = [];
// bestPerBB[bbIdx] = { sigParams, wins, losses, total, winrate }
const bestPerBB_map = new Array(BB_PARAMS.length).fill(null);

for (const sigParams of cartesian(SIGNAL_GRID)) {
  let totalWins = 0, totalLosses = 0;
  for (let bbIdx = 0; bbIdx < BB_PARAMS.length; bbIdx++) {
    let bbWins = 0, bbLosses = 0;
    for (let dsIdx = 0; dsIdx < rawData.length; dsIdx++) {
      const r = evalSignals(precomputed[dsIdx][bbIdx], sigParams);
      bbWins += r.wins; bbLosses += r.losses;
      totalWins += r.wins; totalLosses += r.losses;
    }
    const bbT = bbWins + bbLosses;
    const bbWr = bbT > 0 ? bbWins / bbT : 0;
    const cur = bestPerBB_map[bbIdx];
    if (!cur || bbWr > cur.winrate) {
      bestPerBB_map[bbIdx] = { sigParams: { ...sigParams }, wins: bbWins, losses: bbLosses, total: bbT, winrate: bbWr };
    }
  }
  const total = totalWins + totalLosses;
  results.push({ sigParams: { ...sigParams }, wins: totalWins, losses: totalLosses, total,
                 winrate: total > 0 ? totalWins / total : 0 });
}

const bestPerBB = BB_PARAMS.map(([bbPeriod, bbStdDev], bbIdx) => ({
  bbPeriod, bbStdDev, ...bestPerBB_map[bbIdx]
}));

results.sort((a, b) => b.winrate - a.winrate);

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`Done in ${elapsed}s total\n`);

const breakEven = 1 / 1.8;
console.log('=== TOP 30 results (break-even 55.56% @ 80% payout) ===\n');
for (const r of results.slice(0, 30)) {
  const p = r.sigParams;
  const wr = (r.winrate * 100).toFixed(2);
  const ev = ((r.winrate * 1.8 - 1) * 100).toFixed(1);
  const flag = r.winrate >= breakEven ? '✓ +EV' : '✗';
  console.log(
    `${flag}  wr=${wr}%  ev=${ev}%  n=${r.total}  ` +
    `${p.mode.padEnd(14)}  ${p.phaseStrict?'strict':'loose '}  ` +
    `exp=${p.expirationCandles}c  sq=${p.squeezeWidthFactor}  lbk=${p.flatWidthLookback}`
  );
}

// Average by mode×strict
const byMode = {};
for (const r of results) {
  const key = r.sigParams.mode + (r.sigParams.phaseStrict ? '+strict' : '+loose');
  if (!byMode[key]) byMode[key] = { wins: 0, losses: 0 };
  byMode[key].wins += r.wins;
  byMode[key].losses += r.losses;
}
console.log('\n=== Average winrate by mode ===');
for (const [key, v] of Object.entries(byMode).sort((a, b) => (b[1].wins/(b[1].wins+b[1].losses)) - (a[1].wins/(a[1].wins+a[1].losses)))) {
  const t = v.wins + v.losses;
  console.log(`  ${key.padEnd(28)}  avg wr=${(v.wins/t*100).toFixed(2)}%`);
}

console.log('\n=== Best per BB params ===');
for (const b of bestPerBB.sort((a, bs) => bs.winrate - a.winrate)) {
  const wr = (b.winrate * 100).toFixed(2);
  const ev = ((b.winrate * 1.8 - 1) * 100).toFixed(1);
  const flag = b.winrate >= breakEven ? '✓ +EV' : '✗';
  const p = b.sigParams;
  console.log(`${flag}  bb${b.bbPeriod}/${b.bbStdDev}  wr=${wr}%  ev=${ev}%  n=${b.total}  ${p.mode}  exp=${p.expirationCandles}c  sq=${p.squeezeWidthFactor}`);
}
