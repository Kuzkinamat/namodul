function calculateStochastic(data, kPeriod = 5, dPeriod = 3, slowing = 3) {
    if (data.length < kPeriod) return data.map(d => ({ time: d.time, k: null, d: null }));

    const stochasticData = [];
    for (let i = 0; i < data.length; i++) {
        stochasticData.push({
            time: data[i].time,
            k: null,
            d: null
        });
    }

    const kValues = [];
    for (let i = kPeriod - 1; i < data.length; i++) {
        let lowestLow = data[i].low;
        let highestHigh = data[i].high;

        for (let j = i - kPeriod + 1; j <= i; j++) {
            if (data[j].low < lowestLow) lowestLow = data[j].low;
            if (data[j].high > highestHigh) highestHigh = data[j].high;
        }

        const close = data[i].close;
        const k = highestHigh - lowestLow === 0 ? 50 : 100 * (close - lowestLow) / (highestHigh - lowestLow);
        kValues.push({ time: data[i].time, value: k, index: i });
    }

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

    slowedKValues.forEach(kv => {
        stochasticData[kv.index].k = kv.value;
    });

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

window.calcStochastic = calculateStochastic;
