// Indicator rendering logic

// Simple Moving Average (SMA)
function calculateSMA(data, period) {
    let sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            sma.push(null); // Not enough data to calculate SMA
        } else {
            let sum = 0;
            for (let j = i - period + 1; j <= i; j++) {
                sum += data[j];
            }
            sma.push(sum / period);
        }
    }
    return sma;
}

// Bollinger Bands
function calculateBollingerBands(data, period, multiplier) {
    let sma = calculateSMA(data, period);
    let bands = { upper: [], middle: [], lower: [] };

    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            bands.upper.push(null);
            bands.middle.push(null);
            bands.lower.push(null);
        } else {
            let sum = 0;
            for (let j = i - period + 1; j <= i; j++) {
                sum += Math.pow(data[j] - sma[i], 2);
            }
            let stdDev = Math.sqrt(sum / period);
            bands.middle.push(sma[i]);
            bands.upper.push(sma[i] + (stdDev * multiplier));
            bands.lower.push(sma[i] - (stdDev * multiplier));
        }
    }
    return bands;
}

// Relative Strength Index (RSI)
function calculateRSI(data, period) {
    let gain = 0;
    let loss = 0;
    let rsi = [];

    for (let i = 1; i < data.length; i++) {
        let change = data[i] - data[i - 1];
        if (change > 0) {
            gain += change;
        } else {
            loss -= change;
        }
        if (i >= period) {
            if (i > period) {
                let prevGain = gain / period;
                let prevLoss = loss / period;
                gain = (prevGain * (period - 1) + (change > 0 ? change : 0)) / period;
                loss = (prevLoss * (period - 1) + (change < 0 ? -change : 0)) / period;
            }
            let rs = gain / Math.abs(loss);
            rsi.push(100 - (100 / (1 + rs)));
        }
    }
    return rsi;
}

// Moving Average Convergence Divergence (MACD)
function calculateMACD(data, fastPeriod, slowPeriod, signalPeriod) {
    let macd = [];
    let signal = [];

    let fastEMA = calculateEMA(data, fastPeriod);
    let slowEMA = calculateEMA(data, slowPeriod);

    for (let i = 0; i < data.length; i++) {
        macd.push(fastEMA[i] - slowEMA[i]);
    }
    signal = calculateEMA(macd, signalPeriod);

    return { macd, signal };
}

// Exponential Moving Average (helper function for MACD)
function calculateEMA(data, period) {
    let ema = [];
    let k = 2 / (period + 1);

    // Start with the first data point as the initial EMA
    ema[0] = data[0];

    for (let i = 1; i < data.length; i++) {
        ema[i] = (data[i] * k) + (ema[i - 1] * (1 - k));
    }
    return ema;
}