const fs = require('fs');

function loadData(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  const start = txt.indexOf('[');
  const end = txt.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) throw new Error('Data array not found');
  return JSON.parse(txt.slice(start, end + 1));
}

function calcBB(data, period, stdDev) {
  const out = new Array(data.length);
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      out[i] = { upper: null, middle: null, lower: null };
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
    out[i] = { upper: mean + stdDev * std, middle: mean, lower: mean - stdDev * std };
  }
  return out;
}

function findCloseIndex(data, entryIndex, closeTime) {
  for (let i = entryIndex; i < data.length; i++) {
    if (data[i].time >= closeTime) return i;
  }
  return data.length - 1;
}

function backtest(data, cfg) {
  const bb = calcBB(data, cfg.bbPeriod, cfg.bbStdDev);
  const expirationSec = cfg.expirationMinutes * 60;
  const signals = [];

  for (let i = 1; i < data.length; i++) {
    const bb0 = bb[i];
    const bb1 = bb[i - 1];
    if (!bb0 || !bb1 || bb0.upper == null || bb1.upper == null) continue;

    const cv0 = data[i];
    const cv1 = data[i - 1];
    const widthNow = bb0.upper - bb0.lower;
    if (widthNow <= 0) continue;

    let wSum = 0;
    let wCnt = 0;
    for (let lag = -1; lag >= -cfg.flatWidthLookback; lag--) {
      const idx = i + lag;
      if (idx < 0) continue;
      const b = bb[idx];
      if (b && b.upper != null && b.lower != null) {
        wSum += (b.upper - b.lower);
        wCnt++;
      }
    }
    const wAvg = wCnt > 0 ? wSum / wCnt : widthNow;
    if (wAvg <= 0) continue;

    const isSqueeze = widthNow <= wAvg * cfg.squeezeWidthFactor;
    const brokeUp = cv0.close > bb0.upper && cv1.close <= bb1.upper;
    const brokeDn = cv0.close < bb0.lower && cv1.close >= bb1.lower;

    let buy = 0;
    let sell = 0;
    if (isSqueeze && brokeUp) buy += 1;
    if (isSqueeze && brokeDn) sell += 1;

    if (signals.length > 0) {
      const lastSignalTime = signals[signals.length - 1].time;
      if (cv0.time - lastSignalTime < expirationSec) continue;
    }

    if (buy >= 1) signals.push({ type: 'buy', time: cv0.time, price: cv0.close, idx: i });
    else if (sell >= 1) signals.push({ type: 'sell', time: cv0.time, price: cv0.close, idx: i });
  }

  let balance = 100;
  let wins = 0;
  let losses = 0;

  for (const s of signals) {
    const closeIdx = findCloseIndex(data, s.idx, s.time + expirationSec);
    const closePrice = data[closeIdx].close;
    const isWin = s.type === 'buy' ? closePrice > s.price : closePrice < s.price;
    if (isWin) {
      wins++;
      balance += 0.8;
    } else {
      losses++;
      balance -= 1;
    }
  }

  return {
    trades: signals.length,
    wins,
    losses,
    winrate: signals.length ? (wins / signals.length) * 100 : 0,
    balance,
    profit: balance - 100
  };
}

const all = loadData('d:/GD/namodul/data/EURUSD_M5_data.js');
const candidates = [
  { bbPeriod: 48, bbStdDev: 1.4 },
  { bbPeriod: 48, bbStdDev: 1.7 },
  { bbPeriod: 46, bbStdDev: 1.8 },
  { bbPeriod: 48, bbStdDev: 1.8 },
  { bbPeriod: 46, bbStdDev: 1.6 },
  { bbPeriod: 70, bbStdDev: 2.0 },
  { bbPeriod: 46, bbStdDev: 1.9 }
];
const base = { flatWidthLookback: 12, squeezeWidthFactor: 0.85, expirationMinutes: 15 };

const segments = [];
for (let start = 0; start + 10000 <= all.length; start += 10000) {
  segments.push({ start, end: start + 10000, data: all.slice(start, start + 10000) });
}

const report = candidates.map(candidate => {
  const full = backtest(all, { ...base, ...candidate });
  const folds = segments.map((seg, idx) => ({ fold: idx + 1, ...backtest(seg.data, { ...base, ...candidate }) }));
  const profitableFolds = folds.filter(f => f.profit > 0).length;
  const avgProfit = folds.reduce((acc, f) => acc + f.profit, 0) / folds.length;
  const worstFold = Math.min(...folds.map(f => f.profit));
  return {
    ...candidate,
    full,
    profitableFolds,
    avgProfit,
    worstFold,
    folds
  };
});

report.sort((a, b) => {
  if (b.profitableFolds !== a.profitableFolds) return b.profitableFolds - a.profitableFolds;
  if (b.avgProfit !== a.avgProfit) return b.avgProfit - a.avgProfit;
  return b.full.profit - a.full.profit;
});

console.log(JSON.stringify(report, null, 2));
