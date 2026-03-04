// Indicator calculation utilities
// Optimized version - removed unused functions and duplicates

/**
 * Calculate Exponential Moving Average (EMA)
 * @param {Array} arr - Array of objects with {time, close} or {time, value} properties
 * @param {number} period - EMA period
 * @returns {Array} Array of objects with {time, value} properties
 */
function calculateEMA(arr, period) {
    if (!arr || !arr.length) return [];
    const k = 2 / (period + 1);
    let ema = [];
    let prev = (arr[0].close !== undefined) ? arr[0].close : arr[0].value;
    
    arr.forEach((d, i) => {
        let val = (d.close !== undefined) ? d.close : d.value;
        let v = (i === 0) ? prev : (val - prev) * k + prev;
        ema.push({ time: d.time, value: v });
        prev = v;
    });
    
    return ema;
}

/**
 * Calculate Relative Strength Index (RSI)
 * @param {Array} data - Array of objects with {time, close} properties
 * @param {number} period - RSI period (typically 14)
 * @returns {Array} Array of objects with {time, value} properties
 */
function calculateRSI(data, period) {
    if (data.length <= period) return [];
    
    let rsiData = [], avgGain0;
    
    // Calculate initial average gain and loss
    for (let i = 1; i <= period; i++) {
        const diff = data[i].close - data[i-1].close;
        if (diff > 0) avgGain += diff; 
        else avgLoss -= diff;
    }
    
    avgGain /= period; 
    avgLoss /= period;
    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiData.push({ time: data[period].time, value: 100 - (100 / (1 + rs)) });

    // Calculate subsequent RSI values
    for (let i = period + 1; i < data.length; i++) {
        const diff = data[i].close - data[i-1].close;
        let gain = diff > 0 ? diff : 0;
        let loss = diff < 0 ? -diff : 0;
        
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        
        rsiData.push({ time: data[i].time, value: 100 - (100 / (1 + rs)) });
    }
    
    return rsiData;
}

// Maintain backward compatibility for existing code in main.js
// These functions are used by main.js and should be preserved
const calcEMA = calculateEMA;
const calcRSI = calculateRSI;