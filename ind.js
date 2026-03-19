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
window.calcEMA = calculateEMA;
