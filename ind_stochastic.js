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

    // Первый проход: вычисляем K% с использованием скользящего окна для min/max
    const kValues = [];
    let lowestLow = data[0].low;
    let highestHigh = data[0].high;
    
    // Инициализация первого окна
    for (let i = 0; i < kPeriod; i++) {
        if (data[i].low < lowestLow) lowestLow = data[i].low;
        if (data[i].high > highestHigh) highestHigh = data[i].high;
    }
    
    for (let i = kPeriod - 1; i < data.length; i++) {
        if (i > kPeriod - 1) {
            // Переинициализировать min/max для нового окна
            lowestLow = data[i - kPeriod + 1].low;
            highestHigh = data[i - kPeriod + 1].high;
            
            for (let j = i - kPeriod + 1; j <= i; j++) {
                if (data[j].low < lowestLow) lowestLow = data[j].low;
                if (data[j].high > highestHigh) highestHigh = data[j].high;
            }
        }

        const close = data[i].close;
        const k = highestHigh - lowestLow === 0 ? 50 : 100 * (close - lowestLow) / (highestHigh - lowestLow);
        kValues.push({ time: data[i].time, value: k, index: i });
    }

    // Второй проход: применяем slowing фактор к K% используя скользящее окно
    const slowedKValues = [];
    if (slowing > 1 && kValues.length >= slowing) {
        let sum = 0;
        
        // Инициализация первого окна
        for (let i = 0; i < slowing; i++) {
            sum += kValues[i].value;
        }
        
        for (let i = slowing - 1; i < kValues.length; i++) {
            if (i > slowing - 1) {
                // Удаляем старый элемент и добавляем новый
                sum -= kValues[i - slowing].value;
                sum += kValues[i].value;
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

    // Третий проход: вычисляем D% (SMA от K%) используя скользящее окно
    if (slowedKValues.length >= dPeriod) {
        let sum = 0;
        
        // Инициализация первого окна
        for (let i = 0; i < dPeriod; i++) {
            sum += slowedKValues[i].value;
        }
        
        for (let i = dPeriod - 1; i < slowedKValues.length; i++) {
            if (i > dPeriod - 1) {
                // Удаляем старый элемент и добавляем новый
                sum -= slowedKValues[i - dPeriod].value;
                sum += slowedKValues[i].value;
            }
            
            const d = sum / dPeriod;
            const targetIndex = slowedKValues[i].index;
            stochasticData[targetIndex].d = d;
        }
    }

    return stochasticData;
}

window.calcStochastic = calculateStochastic;
