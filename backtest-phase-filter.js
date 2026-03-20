/**
 * Full backtest with phase filter
 * Бэктест стратегии с фильтром по фазам рынка
 */

const EURUSD = require('./data/EURUSD_M5_data.js');

// === LOADER ===
function loadIndicatorFunctions() {
  const ind_bb = require('./ind_bb.js');
  const ind_atr = require('./ind_atr.js');
  const ind_sma = require('./ind_sma.js');
  const ind_phase = require('./ind_phase.js');
  
  return {
    calcBB: ind_bb.calcBB,
    calcATR: ind_atr.calcATR,
    calcSMA: ind_sma ? ind_sma.calcSMA : null,
    calculatePhaseIndicator: ind_phase.calculatePhaseIndicator,
    shouldTradeInPhase: ind_phase.shouldTradeInPhase
  };
}

function simulateStrategy(data, params, phaseFilter = 'none') {
  const inds = loadIndicatorFunctions();
  const bb = inds.calcBB(data, params.bbPeriod, params.bbStdDev);
  const atr = inds.calcATR(data, 14);
  const phase = inds.calculatePhaseIndicator(data, bb, atr, 20, 30);

  let balance = 100;
  let trades = [];
  let wins = 0, losses = 0;

  for (let i = 1; i < data.length; i++) {
    const bb0 = bb[i];
    const bb1 = bb[i - 1];
    
    if (!bb0 || !bb0.upper || !bb1 || !bb1.upper) continue;

    // Базовый сигнал: пробой верхней/нижней полосы BB
    const cv0 = data[i].close;
    const cv1 = data[i - 1].close;

    // Считаем ширину флэта за lookback
    const flatWidthLookback = params.flatWidthLookback || 20;
    const squeezeWidthFactor = params.squeezeWidthFactor || 0.75;
    
    let wSum = 0, wCnt = 0;
    for (let lag = 1; lag <= flatWidthLookback && i - lag >= 0; lag++) {
      if (bb[i - lag] && bb[i - lag].upper) {
        wSum += (bb[i - lag].upper - bb[i - lag].lower);
        wCnt++;
      }
    }
    
    const wAvg = wCnt > 0 ? (wSum / wCnt) : (bb0.upper - bb0.lower);
    const widthNow = bb0.upper - bb0.lower;
    const isSqueeze = wAvg > 0 && widthNow <= wAvg * squeezeWidthFactor;

    let signal = null;

    // Пробой вверх
    if (cv1 <= bb1.upper && cv0 > bb0.upper) {
      signal = 'buy';
    }
    // Пробой вниз
    else if (cv1 >= bb1.lower && cv0 < bb0.lower) {
      signal = 'sell';
    }

    if (!signal) continue;

    // === ФАЗОВЫЙ ФИЛЬТР ===
    if (phaseFilter !== 'none') {
      const currentPhase = phase.phase[i];
      const shouldTrade = inds.shouldTradeInPhase(currentPhase, phaseFilter);
      if (!shouldTrade) {
        continue; // Пропускаем сигнал
      }
    }

    // === ЗАКРЫТИЕ ПОЗИЦИИ (expiration = 15 min) ===
    const expirationSeconds = 15 * 60;
    const closeTime = data[i].time + expirationSeconds;
    let closePrice = null;

    for (let j = i + 1; j < data.length; j++) {
      if (data[j].time >= closeTime) {
        closePrice = data[j].close;
        break;
      }
    }

    if (!closePrice) {
      closePrice = data[data.length - 1].close;
    }

    // === P&L ===
    const entryPrice = data[i].close;
    let pnl = 0;
    let result = 'loss';

    if (signal === 'buy') {
      if (closePrice > entryPrice) {
        pnl = 0.8;  // +0.8
        result = 'win';
        wins++;
      } else {
        pnl = -1;   // -1
        losses++;
      }
    } else {
      if (closePrice < entryPrice) {
        pnl = 0.8;  // +0.8
        result = 'win';
        wins++;
      } else {
        pnl = -1;   // -1
        losses++;
      }
    }

    balance += pnl;
    trades.push({
      time: data[i].time,
      type: signal,
      entry: entryPrice,
      close: closePrice,
      result,
      pnl
    });
  }

  const winrate = trades.length > 0 ? ((wins / trades.length) * 100).toFixed(2) : 0;

  return {
    balance: balance.toFixed(2),
    trades: trades.length,
    wins,
    losses,
    winrate,
    pnl: (balance - 100).toFixed(2)
  };
}

// === MAIN ===
console.log(`\n${'='.repeat(70)}`);
console.log(`EURUSD M5 - Сравнение эффекта фазового фильтра`);
console.log(`${'='.repeat(70)}`);
console.log(`Данные: ${EURUSD.length.toLocaleString()} свечей\n`);

const params = {
  bbPeriod: 48,
  bbStdDev: 1.4,
  flatWidthLookback: 12,
  squeezeWidthFactor: 0.85
};

// Тест без фильтра
console.log(`TEST 1: БЕЗ ФИЛЬТРА (phaseFilter: "none")`);
console.log('-'.repeat(70));
const resultNoFilter = simulateStrategy(EURUSD, params, 'none');
console.log(`  Баланс:    ${resultNoFilter.balance} (${resultNoFilter.pnl})`);
console.log(`  Сделок:    ${resultNoFilter.trades}`);
console.log(`  W/L:       ${resultNoFilter.wins}/${resultNoFilter.losses}`);
console.log(`  Винрейт:   ${resultNoFilter.winrate}%\n`);

// Тест с breakout фильтром
console.log(`TEST 2: С BREAKOUT ФИЛЬТРОМ (phaseFilter: "breakout")`);
console.log('-'.repeat(70));
const resultWithFilter = simulateStrategy(EURUSD, params, 'breakout');
console.log(`  Баланс:    ${resultWithFilter.balance} (${resultWithFilter.pnl})`);
console.log(`  Сделок:    ${resultWithFilter.trades}`);
console.log(`  W/L:       ${resultWithFilter.wins}/${resultWithFilter.losses}`);
console.log(`  Винрейт:   ${resultWithFilter.winrate}%\n`);

// Анализ улучшения
console.log(`${'='.repeat(70)}`);
console.log(`СРАВНИТЕЛЬНЫЙ АНАЛИЗ`);
console.log(`${'='.repeat(70)}`);
console.log(`Баланс:       ${resultNoFilter.balance} → ${resultWithFilter.balance} (Δ ${(parseFloat(resultWithFilter.balance) - parseFloat(resultNoFilter.balance)).toFixed(2)})`);
console.log(`Сделок:       ${resultNoFilter.trades} → ${resultWithFilter.trades} (-${resultNoFilter.trades - resultWithFilter.trades})`);
console.log(`Винрейт:      ${resultNoFilter.winrate}% → ${resultWithFilter.winrate}% (Δ ${(parseFloat(resultWithFilter.winrate) - parseFloat(resultNoFilter.winrate)).toFixed(2)}%)`);

if (parseFloat(resultWithFilter.balance) > parseFloat(resultNoFilter.balance)) {
  console.log(`\n✅ ФИЛЬТР ПОМОГ! Баланс улучшился на ${(parseFloat(resultWithFilter.balance) - parseFloat(resultNoFilter.balance)).toFixed(2)}`);
} else if (parseFloat(resultWithFilter.balance) < parseFloat(resultNoFilter.balance)) {
  console.log(`\n❌ ФИЛЬТР ПОМЕШАЛ (на данных). Но попробуем другие режимы...`);
} else {
  console.log(`\n➖ Разницы нет`);
}

console.log(`\n${'='.repeat(70)}\n`);
