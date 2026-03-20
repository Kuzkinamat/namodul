function calculateSMA(data, period) {
    if (!data || !data.length || data.length < period) {
        return data.map(d => ({ time: d.time, value: null }));
    }

    const sma = [];
    let sum = 0;
    
    // Инициализация для первого окна
    for (let i = 0; i < period; i++) {
        const value = data[i].close !== undefined ? data[i].close : data[i].value;
        sum += value;
    }
    
    // Считаем первые period-1 значения как null
    for (let i = 0; i < period - 1; i++) {
        sma.push({ time: data[i].time, value: null });
    }
    
    // Скользящее окно для остальных значений
    for (let i = period - 1; i < data.length; i++) {
        if (i > period - 1) {
            // Удаляем самый старый элемент из окна
            const oldValue = data[i - period].close !== undefined ? data[i - period].close : data[i - period].value;
            sum -= oldValue;
            
            // Добавляем новый элемент в окно
            const newValue = data[i].close !== undefined ? data[i].close : data[i].value;
            sum += newValue;
        }
        
        sma.push({ time: data[i].time, value: sum / period });
    }
    
    return sma;
}

window.calcSMA = calculateSMA;
