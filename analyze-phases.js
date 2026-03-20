/**
 * Analyze market phases distribution
 * Анализирует распределение фаз рынка на EURUSD M5
 */

const EURUSD = require('./data/EURUSD_M5_data.js');
const { calcBB } = require('./ind_bb.js');
const { calcATR } = require('./ind_atr.js');
const { calculatePhaseIndicator } = require('./ind_phase.js');

console.log('\n' + '='.repeat(70));
console.log('📊 АНАЛИЗ ФАЗ РЫНКА EURUSD M5');
console.log('='.repeat(70) + '\n');

const data = EURUSD.slice(0, 100000);
console.log(`📈 Данные: ${data.length.toLocaleString()} свечей`);

// Рассчитаем индикаторы
const bb = calcBB(data, 48, 1.4);
const atr = calcATR(data, 14);
const phaseResult = calculatePhaseIndicator(data, bb, atr, 20, 30);

console.log('✅ Индикаторы рассчитаны\n');

// === СТАТИСТИКА ПО ФАЗАМ ===
const phaseStats = {
  squeeze: { count: 0, entries: [], confidence: [] },
  flat: { count: 0, entries: [], confidence: [] },
  trend_up: { count: 0, entries: [], confidence: [] },
  trend_down: { count: 0, entries: [], confidence: [] },
  chaos: { count: 0, entries: [], confidence: [] }
};

for (let i = 0; i < phaseResult.phase.length; i++) {
  const p = phaseResult.phase[i];
  if (phaseStats[p]) {
    phaseStats[p].count++;
    phaseStats[p].entries.push(i);
    phaseStats[p].confidence.push(phaseResult.confidence[i]);
  }
}

// === РАСПЕЧАТКА ===
console.log('📊 РАСПРЕДЕЛЕНИЕ ФАЗ:\n');

const total = phaseResult.phase.length;
const phases = ['squeeze', 'flat', 'trend_up', 'trend_down', 'chaos'];

for (const phase of phases) {
  const stats = phaseStats[phase];
  const pct = ((stats.count / total) * 100).toFixed(1);
  const avgConf = stats.confidence.length > 0 
    ? (stats.confidence.reduce((a,b) => a+b) / stats.confidence.length).toFixed(2)
    : 0;
  
  const bar = '█'.repeat(Math.round(parseFloat(pct) / 2));
  
  let emoji = '';
  if (phase === 'squeeze') emoji = '🔷';
  else if (phase === 'flat') emoji = '📊';
  else if (phase === 'trend_up') emoji = '📈';
  else if (phase === 'trend_down') emoji = '📉';
  else if (phase === 'chaos') emoji = '🌪️ ';
  
  console.log(`${emoji} ${phase.padEnd(10)} | ${bar.padEnd(25)} | ${pct.padStart(5)}% | ${stats.count.toLocaleString().padStart(6)} | conf: ${avgConf}`);
}

console.log('\n' + '-'.repeat(70) + '\n');

// === АНАЛИЗ ДЛИТЕЛЬНОСТИ ФАЗ ===
console.log('⏱️  АНАЛИЗ ДЛИТЕЛЬНОСТИ ФАЗ:\n');

function getSequenceLengths(phase) {
  const entries = phaseStats[phase].entries;
  if (entries.length === 0) return [];
  
  const lengths = [];
  let start = entries[0];
  
  for (let i = 1; i < entries.length; i++) {
    if (entries[i] !== entries[i-1] + 1) {
      lengths.push(entries[i-1] - start + 1);
      start = entries[i];
    }
  }
  lengths.push(entries[entries.length - 1] - start + 1);
  return lengths;
}

for (const phase of phases) {
  const lengths = getSequenceLengths(phase);
  if (lengths.length === 0) continue;
  
  const minLen = Math.min(...lengths);
  const maxLen = Math.max(...lengths);
  const avgLen = (lengths.reduce((a,b) => a+b) / lengths.length).toFixed(1);
  
  console.log(`${phase.padEnd(10)} | episodes: ${lengths.length.toLocaleString().padStart(4)} | min: ${minLen.toLocaleString().padStart(4)} | max: ${maxLen.toLocaleString().padStart(4)} | avg: ${avgLen.padStart(6)}`);
}

console.log('\n' + '-'.repeat(70) + '\n');

// === РЕКОМЕНДАЦИИ ===
console.log('💡 РЕКОМЕНДАЦИИ:\n');

const squeezeFreq = (phaseStats.squeeze.count / total) * 100;
const trendFreq = ((phaseStats.trend_up.count + phaseStats.trend_down.count) / total) * 100;
const chaosFreq = (phaseStats.chaos.count / total) * 100;

if (squeezeFreq > 20) {
  console.log('✅ Много squeeze фаз (>' + squeezeFreq.toFixed(1) + '%) → breakout стратегия может работать');
}
if (trendFreq > 30) {
  console.log('✅ Много trend фаз (>' + trendFreq.toFixed(1) + '%) → trend-follow стратегия может работать');
}
if (chaosFreq > 20) {
  console.log('⚠️  Много chaos фаз (>' + chaosFreq.toFixed(1) + '%) → нужен фильтр, не торговать везде');
}
if (phaseStats.flat.count > phaseStats.trend_up.count && phaseStats.flat.count > phaseStats.trend_down.count) {
  console.log('✅ Преобладают flat/squeeze фазы → mean-reversion может работать');
}

console.log('\n' + '='.repeat(70) + '\n');
