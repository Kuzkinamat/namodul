// main.js - Main application logic

const SCALE_WIDTH = 80;
let data = [];
window.data = data; // expose globally
let MARKER_TIMESTAMPS = [];
window.MARKER_TIMESTAMPS = MARKER_TIMESTAMPS; // экспорт для strategy.js
let currentRange = '1W', currentTimeframe = '1m', currentSource = 'none', curM = 0, isSyncing = false;
window.curM = curM; // экспорт для strategy.js
const activePanes = {}, mainSeriesRefs = {};

const addLog = (m) => {
    const c = document.getElementById('log-content');
    if (c) {
        c.innerHTML += `<div><span style=\"color:#5d606b\">[${new Date().toLocaleTimeString()}]</span> ${m}</div>`;
        c.scrollTop = c.scrollHeight;
    }
};
window.addLog = addLog;
// Data utilities for range/timeframe calculations
window.DataUtils = {
    // Minutes in each range (assuming 24h days, 7 days week, 30 days month, 365 days year)
    RANGE_MINUTES: {
        '1D': 24 * 60,          // 1440
        '1W': 7 * 24 * 60,      // 10080
        '1M': 30 * 24 * 60,     // 43200
        '1Y': 365 * 24 * 60     // 525600
    },
    // Minutes in each timeframe (short format)
    TIMEFRAME_MINUTES: {
        '1m': 1,
        '5m': 5,
        '15m': 15,
        '1H': 60,
    },
    // Calculate number of candles needed for given range and timeframe
    calculateOutputSize: function(range, timeframe) {
        const rangeMinutes = this.RANGE_MINUTES[range];
        const timeframeMinutes = this.TIMEFRAME_MINUTES[timeframe];
        if (!rangeMinutes || !timeframeMinutes) {
            console.warn(`Unknown range or timeframe: ${range}, ${timeframe}`);
            return 100; // fallback
        }
        const candles = Math.ceil(rangeMinutes / timeframeMinutes);
        // Limit to API maximum (5000 for Twelve Data free plan)
        const MAX_OUTPUTSIZE = 5000;
        return Math.min(candles, MAX_OUTPUTSIZE);
    },
    // Map timeframe to Twelve Data interval string (convert short format to API format)
    mapTimeframeToInterval: function(timeframe) {
        const intervalMap = {
            '1m': '1min',
            '5m': '5min',
            '15m': '15min',
            '1H': '1h',
            '4H': '4h',
            '1D': '1day',
            '1W': '1week',
            '1M': '1month'
        };
        return intervalMap[timeframe] || '1day';
    }
};

// Chart configuration
const chartOpts = { 
    layout: { background: { color: '#131722' }, textColor: '#d1d4dc' }, 
    rightPriceScale: { borderColor: '#363c4e', minimumWidth: SCALE_WIDTH }, 
    grid: { vertLines: { visible: false }, horzLines: { color: '#242733' } }, 
    crosshair: { mode: LightweightCharts.CrosshairMode.Hidden },
    timeScale: { borderColor: '#363c4e', timeVisible: true, rightOffset: 80 } 
};

const chartMain = LightweightCharts.createChart(document.getElementById('chart-main'), chartOpts);
window.chartMain = chartMain;
const candleSeries = chartMain.addSeries(LightweightCharts.CandlestickSeries, {
    upColor: '#26a69a', downColor: '#ef5350', lastValueVisible: false, priceLineVisible: false});
window.candleSeries = candleSeries;

window.onresize = () => { 
    const container = document.getElementById('main-pane');
    if (!container) return;
    chartMain.resize(container.clientWidth, container.clientHeight); 
    Object.values(activePanes).forEach(p => p.chart.resize(container.clientWidth, 130)); 
};

window.toggleLog = () => { 
    document.getElementById('log-panel').classList.toggle('collapsed'); 
    setTimeout(window.onresize, 50); 
};

window.setRange = (r) => { 
    currentRange = r; 
    document.getElementById('range-btn').innerText = r + ' ▾'; 
    addLog(`Range set to: ${r}`); 
};

window.setTimeframe = (tf) => { 
    currentTimeframe = tf; 
    document.getElementById('timeframe-btn').innerText = tf + ' ▾'; 
    addLog(`Timeframe set to: ${tf}`); 
};

function renderPairs(pairs) {
    const drop = document.getElementById('pair-dropdown');
    if (!drop) return;
    drop.innerHTML = pairs.length ? '' : '<div class=\"ind-row\">No pairs found</div>';
    pairs.forEach(p => { 
        const el = document.createElement('div'); 
        el.className = 'ind-row'; 
        el.innerText = p; 
        el.onclick = () => window.setPair(p); 
        drop.appendChild(el); 
    });
}

window.setDataSource = async (type) => {
    currentSource = type; 
    document.getElementById('source-btn').innerText = (type === 'none' ? 'SOURCE' : type.toUpperCase()) + ' ▾';
    if (type === 'none') {
        data = []; window.data = data; candleSeries.setData([]);
        Object.keys(mainSeriesRefs).forEach(id => { mainSeriesRefs[id].forEach(s => chartMain.removeSeries(s)); delete mainSeriesRefs[id]; });
        Object.keys(activePanes).forEach(id => { activePanes[id].chart.remove(); document.getElementById(`wrapper-${id}`)?.remove(); delete activePanes[id]; });
        document.querySelectorAll('#indicator-menu input[type=\"checkbox\"]').forEach(cb => cb.checked = false);
        addLog("Source cleared.");
    } else if (type === 'twelvedata' && window.TwelveDataProvider) {
        addLog("Initializing Twelve Data API connection...");
        if (await window.TwelveDataProvider.requestAccess()) {
            renderPairs(window.TwelveDataProvider.getPairs());
        }
    }
    window.onresize(); 
};

window.setPair = async (p) => {
    document.getElementById('pair-btn').innerText = p + ' ▾';
    const provider = (currentSource === 'twelvedata') ? window.TwelveDataProvider : null;
    if (provider) {
        addLog(`Fetching data: ${p}, Range: ${currentRange}, Timeframe: ${currentTimeframe}`);
        const newData = await provider.fetchData(currentRange, currentTimeframe, p);
        if (!newData || !newData.length) return addLog("No data received");
        data = newData;
        window.data = data;
        candleSeries.setData(data);
        chartMain.timeScale().fitContent();
        // Очистить маркеры сигналов
        if (window.Strategy && window.chartMain && window.candleSeries) {
            window.Strategy.clearSignals(window.chartMain, window.candleSeries);
        }
        // Сбросить сигналы
        window.lastSignals = [];
        // Очистить массив временных меток маркеров
        MARKER_TIMESTAMPS = [];
        curM = 0;
        // Обновить график баланса, если он активен
        if (activePanes.Balance && typeof window.updateBalance === 'function') {
            window.updateBalance();
        }
        document.querySelectorAll('#indicator-menu input[type=\"checkbox\"]').forEach(cb => {
            if(cb.checked) window.toggleIndicator(cb.getAttribute('data-id'), true);
        });
        updatePopbar();
        addLog(`Loaded ${p}: ${data.length} candles (Range: ${currentRange}, TF: ${currentTimeframe})`);
    }
};

function updatePopbar() {
    if (!data.length) return;
    const ts = chartMain.timeScale();
    const mainPane = document.getElementById('main-pane');
    const logicalIndex = ts.coordinateToLogical((mainPane.clientWidth - SCALE_WIDTH) / 2);
    if (logicalIndex !== null) {
        const candle = data[Math.round(logicalIndex)];
        if (candle) {
            ['open', 'high', 'low', 'close'].forEach(f => { 
                const el = document.getElementById(`val-${f}`);
                if (el) el.innerText = candle[f].toFixed(5); 
            });
        }
    }
}

/**
 * Синхронизирует видимый логический диапазон всех графиков (основного и индикаторных панелей).
 * Использует логические диапазоны (getVisibleLogicalRange / setVisibleLogicalRange) для точного совмещения
 * свечей и индикаторов, что предотвращает визуальное смещение.
 * Важно: чтобы синхронизация работала корректно, массивы данных индикаторов должны иметь ту же длину,
 * что и основной массив свечей, и сохранять соответствие по времени. Для периодов, где индикатор не определён,
 * следует передавать значение null (а не фильтровать элементы), иначе логические индексы разойдутся.
 */
function syncAll(source) {
    if (isSyncing) return;
    isSyncing = true;
    const range = source.timeScale().getVisibleLogicalRange();
    if (range) {
        [chartMain, ...Object.values(activePanes).map(p => p.chart)].forEach(c => {
            if (c && c !== source) c.timeScale().setVisibleLogicalRange(range);
        });
    }
    updatePopbar();
    isSyncing = false;
}

chartMain.timeScale().subscribeVisibleLogicalRangeChange(() => syncAll(chartMain));

/**
 * Включает/выключает индикатор на графике.
 * Для индикаторов, отображаемых в отдельных панелях (Stochastic, MACD), создаёт отдельный чарт.
 * Для индикаторов на основном графике (SMA, BB) добавляет series поверх свечей.
 *
 * Важное замечание: чтобы синхронизация логических диапазонов работала правильно,
 * массивы данных индикаторов должны сохранять ту же длину и порядок, что и основной массив свечей.
 * Поэтому для периодов, где индикатор не определён, передаётся значение null (не фильтруется).
 * Это гарантирует, что логические индексы в syncAll остаются согласованными.
 */
window.toggleIndicator = function(id, isChecked) {
    if (!isChecked) {
        if (mainSeriesRefs[id]) { mainSeriesRefs[id].forEach(s => chartMain.removeSeries(s)); delete mainSeriesRefs[id]; }
        if (activePanes[id]) { activePanes[id].chart.remove(); document.getElementById(`wrapper-${id}`)?.remove(); delete activePanes[id]; }
        return window.onresize();
    }
    if (!data.length) return;

    if (id === 'SMA' || id === 'BB') {
        if (mainSeriesRefs[id]) mainSeriesRefs[id].forEach(s => chartMain.removeSeries(s));
        mainSeriesRefs[id] = [];
        if (id === 'SMA') {
            const s = chartMain.addSeries(LightweightCharts.LineSeries, { color: '#ff00a6', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
            const sma = data.map((d, i) => i < 19 ? { time: d.time, value: null } : { time: d.time, value: data.slice(i-19, i+1).reduce((a,b)=>a+b.close, 0)/20 });
            s.setData(sma); mainSeriesRefs[id].push(s);
        }
        if (id === 'BB') {
            const bb = data.map((d, i) => {
                if (i < 19) return { time: d.time, t: null, m: null, b: null };
                const sl = data.slice(i-19, i+1).map(x => x.close);
                const m = sl.reduce((a, b) => a + b, 0) / 20;
                const sd = Math.sqrt(sl.reduce((a, b) => a + Math.pow(b - m, 2), 0) / 20);
                return { time: d.time, t: m + 2 * sd, m: m, b: m - 2 * sd };
            });
            [{k:'t', c:'rgba(38,166,154,0.3)'}, {k:'m', c:'rgba(33,150,243,0.5)'}, {k:'b', c:'rgba(38,166,154,0.3)'}].forEach(o => {
                const s = chartMain.addSeries(LightweightCharts.LineSeries, { color: o.c, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
                s.setData(bb.map(v => ({ time: v.time, value: v[o.k] }))); mainSeriesRefs[id].push(s);
            });
        }
    } else {
        // Log main data info for debugging
        if (data.length > 0) {
            addLog(`Main data length: ${data.length}`);
            addLog(`First candle time: ${new Date(data[0].time * 1000).toISOString()}`);
            addLog(`Last candle time: ${new Date(data[data.length - 1].time * 1000).toISOString()}`);
        }
        if (!activePanes[id]) {
            const wr = document.createElement('div'); wr.id = `wrapper-${id}`; wr.className = 'pane-wrapper sub-pane'; wr.innerHTML = `<div class=\"v-line\"></div><div id=\"chart-${id}\" class=\"chart-container\"></div>`;
            document.getElementById('panels-container').appendChild(wr);
            const c = LightweightCharts.createChart(document.getElementById(`chart-${id}`), { ...chartOpts, timeScale: { visible: false } });
            c.timeScale().subscribeVisibleLogicalRangeChange(() => syncAll(c));
            activePanes[id] = { chart: c, series: [] };
        }
        const pane = activePanes[id];
        pane.series.forEach(s => pane.chart.removeSeries(s)); pane.series = [];
        if (id === 'Stochastic') {
            const stochasticData = calcStochastic(data, 14, 3, 3);
            // Logging for debugging
            addLog(`Stochastic data length: ${stochasticData.length}`);
            // Log first 5 elements
            for (let idx = 0; idx < Math.min(5, stochasticData.length); idx++) {
                const d = stochasticData[idx];
                addLog(`Stochastic[${idx}]: time=${new Date(d.time * 1000).toISOString()}, k=${d.k}, d=${d.d}`);
            }
            const nonNullK = stochasticData.filter(d => d.k !== null).length;
            const nonNullD = stochasticData.filter(d => d.d !== null).length;
            addLog(`Non-null K: ${nonNullK}, D: ${nonNullD}`);
            if (nonNullK > 0) {
                const firstK = stochasticData.find(d => d.k !== null);
                const lastK = stochasticData.slice().reverse().find(d => d.k !== null);
                addLog(`First K time: ${new Date(firstK.time * 1000).toISOString()}, value: ${firstK.k.toFixed(2)}`);
                addLog(`Last K time: ${new Date(lastK.time * 1000).toISOString()}, value: ${lastK.k.toFixed(2)}`);
            }
            // Create line for %K - keep null values
            const kLine = pane.chart.addSeries(LightweightCharts.LineSeries, { color: '#ff00a6', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
            const kData = stochasticData.map(d => ({ time: d.time, value: d.k }));
            kLine.setData(kData);
            pane.series.push(kLine);
            
            // Create line for %D - keep null values
            const dLine = pane.chart.addSeries(LightweightCharts.LineSeries, { color: '#2196f3', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
            const dData = stochasticData.map(d => ({ time: d.time, value: d.d }));
            dLine.setData(dData);
            pane.series.push(dLine);
        }
        if (id === 'MACD') {
            const h = pane.chart.addSeries(LightweightCharts.HistogramSeries, { lastValueVisible: false, priceLineVisible: false });
            const l1 = pane.chart.addSeries(LightweightCharts.LineSeries, { color: '#2196f3', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
            const l2 = pane.chart.addSeries(LightweightCharts.LineSeries, { color: '#ff9800', lineWidth:1, lastValueVisible: false, priceLineVisible: false });
            const e12 = calcEMA(data, 12), e26 = calcEMA(data, 26);
            const m = e12.map((e,i)=>({time: e.time, value: e.value - e26[i].value}));
            const sig = calcEMA(m, 9);
            h.setData(m.map((v,i)=>({time: v.time, value: v.value - (sig[i]?.value || 0), color: (v.value-(sig[i]?.value||0))>=0?'#26a69a':'#ef5350'})));
            l1.setData(m); l2.setData(sig); pane.series.push(h, l1, l2);
        }
        window.onresize(); syncAll(chartMain);
    }
};

window.changeMarker = (dir) => {
    if (MARKER_TIMESTAMPS.length) {
        curM = (curM + dir + MARKER_TIMESTAMPS.length) % MARKER_TIMESTAMPS.length;
        const ts = MARKER_TIMESTAMPS[curM];
        chartMain.timeScale().setVisibleRange({ from: ts - 3600, to: ts + 3600 });
    }
};

// Включение/выключение графика баланса
window.toggleBalance = function(isChecked) {
    if (!isChecked) {
        // Удалить панель Balance
        if (activePanes.Balance) {
            activePanes.Balance.chart.remove();
            document.getElementById('wrapper-Balance')?.remove();
            delete activePanes.Balance;
            window.onresize();
            addLog('График баланса скрыт');
        }
        return;
    }
    if (!data.length) {
        addLog('Нет данных для расчета баланса');
        return;
    }
    // Рассчитать PnL (если сигналов нет, будет отображен постоянный баланс)
    const balanceData = window.Strategy.calculatePnL(data, window.lastSignals || [], 100, 1, 0.8);
    if (!balanceData || balanceData.length === 0) {
        addLog('Не удалось рассчитать баланс');
        return;
    }
    // Создать панель для Balance, если её нет
    if (!activePanes.Balance) {
        const wr = document.createElement('div');
        wr.id = 'wrapper-Balance';
        wr.className = 'pane-wrapper sub-pane';
        wr.innerHTML = `<div class="v-line"></div><div id="chart-Balance" class="chart-container"></div>`;
        document.getElementById('panels-container').appendChild(wr);
        const chart = LightweightCharts.createChart(document.getElementById('chart-Balance'), {
            layout: { background: { color: '#131722' }, textColor: '#d1d4dc' },
            rightPriceScale: { borderColor: '#363c4e', minimumWidth: 80 },
            grid: { vertLines: { visible: false }, horzLines: { color: '#242733' } },
            crosshair: { mode: LightweightCharts.CrosshairMode.Hidden },
            timeScale: { visible: false }
        });
        chart.timeScale().subscribeVisibleLogicalRangeChange(() => syncAll(chart));
        activePanes.Balance = { chart, series: [] };
    }
    const pane = activePanes.Balance;
    pane.series.forEach(s => pane.chart.removeSeries(s));
    pane.series = [];
    const series = pane.chart.addSeries(LightweightCharts.LineSeries, {
        color: '#00ff00',
        lineWidth: 2,
        lastValueVisible: false,
        priceLineVisible: false
    });
    series.setData(balanceData);
    pane.series.push(series);
    pane.chart.timeScale().fitContent();
    window.onresize();
    syncAll(chartMain);
    addLog('График баланса отображен');
};

// Обновить график баланса (если активен) на основе текущих сигналов
window.updateBalance = function() {
    if (!activePanes.Balance) {
        // График баланса не активен
        return;
    }
    if (!data.length) {
        addLog('Нет данных для обновления баланса');
        return;
    }
    // Рассчитать PnL (если сигналов нет, будет отображен постоянный баланс)
    const balanceData = window.Strategy.calculatePnL(data, window.lastSignals || [], 100, 1, 0.8);
    if (!balanceData || balanceData.length === 0) {
        addLog('Не удалось рассчитать баланс');
        return;
    }
    const pane = activePanes.Balance;
    pane.series.forEach(s => pane.chart.removeSeries(s));
    pane.series = [];
    const series = pane.chart.addSeries(LightweightCharts.LineSeries, {
        color: '#00ff00',
        lineWidth: 2,
        lastValueVisible: false,
        priceLineVisible: false
    });
    series.setData(balanceData);
    pane.series.push(series);
    pane.chart.timeScale().fitContent();
    syncAll(chartMain);
    addLog('График баланса обновлен');
};

// Initialize with default values
window.onresize();
window.setDataSource('none');