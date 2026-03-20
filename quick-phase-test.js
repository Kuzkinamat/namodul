const EURUSD = require('./data/EURUSD_M5_data.js');
const { calcBB } = require('./ind_bb.js');
const { calcATR } = require('./ind_atr.js');
const { calculatePhaseIndicator, shouldTradeInPhase } = require('./ind_phase.js');

function simulate(data, params, filter) {
  const bb = calcBB(data, params.bbPeriod, params.bbStdDev);
  const atr = calcATR(data, 14);
  const phase = calculatePhaseIndicator(data, bb, atr, 20, 30);

  let balance = 100, wins = 0, losses = 0, trades = 0;

  for (let i = 1; i < data.length; i++) {
    const bb0 = bb[i], bb1 = bb[i-1];
    if (!bb0 || !bb1) continue;

    const cv0 = data[i].close, cv1 = data[i-1].close;
    const flatWidthLookback = params.flatWidthLookback;
    const squeezeWidthFactor = params.squeezeWidthFactor;
    
    let wSum = 0, wCnt = 0;
    for (let lag = 1; lag <= flatWidthLookback && i - lag >= 0; lag++) {
      if (bb[i-lag] && bb[i-lag].upper) {
        wSum += (bb[i-lag].upper - bb[i-lag].lower);
        wCnt++;
      }
    }
    const wAvg = wCnt > 0 ? (wSum / wCnt) : (bb0.upper - bb0.lower);
    const widthNow = bb0.upper - bb0.lower;

    let signal = null;
    if (cv1 <= bb1.upper && cv0 > bb0.upper) signal = 'buy';
    else if (cv1 >= bb1.lower && cv0 < bb0.lower) signal = 'sell';
    if (!signal) continue;

    if (filter !== 'none') {
      const currentPhase = phase.phase[i];
      if (!shouldTradeInPhase(currentPhase, filter)) continue;
    }

    const expirationSeconds = 15 * 60;
    const closeTime = data[i].time + expirationSeconds;
    let closePrice = null;
    for (let j = i + 1; j < data.length; j++) {
      if (data[j].time >= closeTime) {
        closePrice = data[j].close;
        break;
      }
    }
    if (!closePrice) closePrice = data[data.length - 1].close;

    const entryPrice = data[i].close;
    let pnl = 0;
    if (signal === 'buy') {
      pnl = closePrice > entryPrice ? 0.8 : -1;
    } else {
      pnl = closePrice < entryPrice ? 0.8 : -1;
    }
    
    if (pnl > 0) wins++;
    else losses++;
    
    balance += pnl;
    trades++;
  }

  return {
    balance: balance.toFixed(2),
    trades,
    wins,
    losses,
    winrate: trades > 0 ? ((wins/trades)*100).toFixed(2) : 0,
    pnl: (balance - 100).toFixed(2)
  };
}

const params = { bbPeriod: 48, bbStdDev: 1.4, flatWidthLookback: 12, squeezeWidthFactor: 0.85 };

console.log('TEST 1: NO FILTER');
const r1 = simulate(EURUSD, params, 'none');
console.log('Balance: ' + r1.balance + ', Trades: ' + r1.trades + ', WR: ' + r1.winrate + '%');

console.log('\nTEST 2: BREAKOUT FILTER');
const r2 = simulate(EURUSD, params, 'breakout');
console.log('Balance: ' + r2.balance + ', Trades: ' + r2.trades + ', WR: ' + r2.winrate + '%');

console.log('\nIMPACT: Balance ' + r1.balance + ' -> ' + r2.balance + ' (Δ ' + (parseFloat(r2.balance) - parseFloat(r1.balance)).toFixed(2) + ')');
