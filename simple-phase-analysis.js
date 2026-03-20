const EURUSD = require('./data/EURUSD_M5_data.js');
const { calcBB } = require('./ind_bb.js');
const { calcATR } = require('./ind_atr.js');
const { calculatePhaseIndicator } = require('./ind_phase.js');

const data = EURUSD.slice(0, 100000);
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
console.log('Total: ' + total);

// Calculate frequencies
const squeezeFreq = (phaseStats.squeeze.count / total) * 100;
const trendFreq = ((phaseStats.trend_up.count + phaseStats.trend_down.count) / total) * 100;
const chaosFreq = (phaseStats.chaos.count / total) * 100;
const flatFreq = (phaseStats.flat.count / total) * 100;

console.log('\nSUMMARY:');
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
