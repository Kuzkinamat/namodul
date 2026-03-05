
function calculateSMA(data, period) {
    if (!data || !data.length || data.length < period) {
        return data.map(d => ({ time: d.time, value: null }));
    }
    
    const sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            sma.push({ time: data[i].time, value: null });
        } else {
            let sum = 0;
            for (let j = i - period + 1; j <= i; j++) {
                const value = data[j].close !== undefined ? data[j].close : data[j].value;
                sum += value;
            }
            sma.push({ time: data[i].time, value: sum / period });
        }
    }
    return sma;
}

function calculateBollingerBands(data, period = 20, stdDev = 2) {
    if (!data || !data.length || data.length < period) {
        return data.map(d => ({ time: d.time, upper: null, middle: null, lower: null }));
    }
    
    const bb = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            bb.push({ time: data[i].time, upper: null, middle: null, lower: null });
        } else {
            const slice = data.slice(i - period + 1, i + 1);
            const values = slice.map(d => d.close);
            const mean = values.reduce((sum, val) => sum + val, 0) / period;
            const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
            const std = Math.sqrt(variance);
            
            bb.push({
                time: data[i].time,
                upper: mean + stdDev * std,
                middle: mean,
                lower: mean - stdDev * std
            });
        }
    }
    return bb;
}

function calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (!data || !data.length) return [];
    
    // Calculate EMAs
    const fastEMA = calculateEMA(data, fastPeriod);
    const slowEMA = calculateEMA(data, slowPeriod);
    
    // Calculate MACD line (fast EMA - slow EMA)
    const macdLine = [];
    for (let i = 0; i < data.length; i++) {
        if (fastEMA[i] && slowEMA[i]) {
            macdLine.push({
                time: data[i].time,
                value: fastEMA[i].value - slowEMA[i].value
            });
        } else {
            macdLine.push({ time: data[i].time, value: null });
        }
    }
    
    // Calculate Signal line (EMA of MACD line)
    const signalLine = calculateEMA(macdLine, signalPeriod);
    
    // Calculate Histogram (MACD - Signal)
    const histogram = [];
    for (let i = 0; i < data.length; i++) {
        const macdVal = macdLine[i]?.value;
        const signalVal = signalLine[i]?.value;
        
        if (macdVal !== null && signalVal !== null) {
            histogram.push({
                time: data[i].time,
                value: macdVal - signalVal,
                color: (macdVal - signalVal) >= 0 ? '#26a69a' : '#ef5350'
            });
        } else {
            histogram.push({ time: data[i].time, value: null, color: null });
        }
    }
    
    // Combine results
    const result = [];
    for (let i = 0; i < data.length; i++) {
        result.push({
            time: data[i].time,
            macd: macdLine[i]?.value,
            signal: signalLine[i]?.value,
            histogram: histogram[i]?.value,
            histogramColor: histogram[i]?.color
        });
    }
    
    return result;
}

/**
 * Calculate Exponential Moving Average (EMA) - re-export from ind.js
 * This function is already defined in ind.js, but we re-export it here for compatibility
 */
function calculateEMA(arr, period) {
    // This function is defined in ind.js, but we provide a fallback implementation
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
 * Calculate Stochastic Oscillator - re-export from ind.js
 * This function is already defined in ind.js, but we re-export it here for compatibility
 */
function calculateStochastic(data, kPeriod = 14, dPeriod = 3, slowing = 3) {
    // This function is defined in ind.js, but we provide a fallback implementation
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

// Export functions for global use
window.calcSMA = calculateSMA;
window.calcBB = calculateBollingerBands;
window.calcMACD = calculateMACD;
window.calcEMA = calculateEMA;
window.calcStochastic = calculateStochastic;