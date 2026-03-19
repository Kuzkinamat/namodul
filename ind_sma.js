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

window.calcSMA = calculateSMA;
