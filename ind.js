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
 * Calculate Stochastic Oscillator
 * @param {Array} data - Array of objects with {time, high, low, close} properties
 * @param {number} kPeriod - %K period (typically 14)
 * @param {number} dPeriod - %D period (typically 3)
 * @param {number} slowing - Slowing period (typically 3)
 * @returns {Array} Array of objects with {time, k, d} properties (k and d can be null for insufficient data)
 */
function calculateStochastic(data, kPeriod = 14, dPeriod = 3, slowing = 3) {
    if (data.length < kPeriod) return data.map(d => ({ time: d.time, k: null, d: null }));
    
    const stochasticData = [];
    
    // Initialize result array with null values
    for (let i = 0; i < data.length; i++) {
        stochasticData.push({
            time: data[i].time,
            k: null,
            d: null
        });
    }
    
    // Calculate %K values
    const kValues = [];
    for (let i = kPeriod - 1; i < data.length; i++) {
        let lowestLow = data[i].low;
        let highestHigh = data[i].high;
        
        // Find lowest low and highest high in the last kPeriod periods
        for (let j = i - kPeriod + 1; j <= i; j++) {
            if (data[j].low < lowestLow) lowestLow = data[j].low;
            if (data[j].high > highestHigh) highestHigh = data[j].high;
        }
        
        const close = data[i].close;
        const k = highestHigh - lowestLow === 0 ? 50 : 100 * (close - lowestLow) / (highestHigh - lowestLow);
        kValues.push({ time: data[i].time, value: k, index: i });
    }
    
    // Apply slowing to %K
    const slowedKValues = [];
    if (slowing > 1) {
        for (let i = slowing - 1; i < kValues.length; i++) {
            let sum = 0;
            for (let j = i - slowing + 1; j <= i; j++) {
                sum += kValues[j].value;
            }
            const slowedK = sum / slowing;
            slowedKValues.push({ 
                time: kValues[i].time, 
                value: slowedK, 
                index: kValues[i].index 
            });
        }
    } else {
        kValues.forEach(kv => {
            slowedKValues.push({ 
                time: kv.time, 
                value: kv.value, 
                index: kv.index 
            });
        });
    }
    
    // Fill %K values in result array
    slowedKValues.forEach(kv => {
        stochasticData[kv.index].k = kv.value;
    });
    
    // Calculate %D (SMA of slowed %K) and fill in result array
    for (let i = dPeriod - 1; i < slowedKValues.length; i++) {
        let sum = 0;
        for (let j = i - dPeriod + 1; j <= i; j++) {
            sum += slowedKValues[j].value;
        }
        const d = sum / dPeriod;
        const targetIndex = slowedKValues[i].index;
        stochasticData[targetIndex].d = d;
    }
    
    return stochasticData;
}

// Maintain backward compatibility for existing code in main.js
// These functions are used by main.js and should be preserved
const calcEMA = calculateEMA;
const calcStochastic = calculateStochastic;