// calc.js - Calculation utilities for indicators
// EMA and RSI calculations

const calcEMA = (arr, p) => {
    if (!arr || !arr.length) return [];
    const k = 2 / (p + 1);
    let ema = [];
    let prev = (arr[0].close !== undefined) ? arr[0].close : arr[0].value;
    arr.forEach((d, i) => {
        let val = (d.close !== undefined) ? d.close : d.value;
        let v = (i === 0) ? prev : (val - prev) * k + prev;
        ema.push({ time: d.time, value: v });
        prev = v;
    });
    return ema;
};

const calcRSI = (data, p) => {
    if (data.length <= p) return [];
    let rsiData = [], avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= p; i++) {
        const diff = data[i].close - data[i-1].close;
        if (diff > 0) avgGain += diff; else avgLoss -= diff;
    }
    avgGain /= p; avgLoss /= p;
    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiData.push({ time: data[p].time, value: 100 - (100 / (1 + rs)) });

    for (let i = p + 1; i < data.length; i++) {
        const diff = data[i].close - data[i-1].close;
        let gain = diff > 0 ? diff : 0, loss = diff < 0 ? -diff : 0;
        avgGain = (avgGain * (p - 1) + gain) / p;
        avgLoss = (avgLoss * (p - 1) + loss) / p;
        rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsiData.push({ time: data[i].time, value: 100 - (100 / (1 + rs)) });
    }
    return rsiData;
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { calcEMA, calcRSI };
}