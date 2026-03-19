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

window.calcBB = calculateBollingerBands;
