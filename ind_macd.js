function calculateMACD(data, fastPeriod = 5, slowPeriod = 34, signalPeriod = 5) {
    if (!data || !data.length) return [];

    const fastEMA = calculateEMA(data, fastPeriod);
    const slowEMA = calculateEMA(data, slowPeriod);

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

    const signalLine = calculateEMA(macdLine, signalPeriod);

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

window.calcMACD = calculateMACD;
