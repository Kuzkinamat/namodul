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
            addLog(`Предупреждение: неизвестный диапазон или таймфрейм: ${range}, ${timeframe}`);
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

// Local CSV Data Provider
window.LocalCSVProvider = {
    /**
     * Scan window for global variables ending with '_data' (e.g., EURUSD_M5_data)
     * Returns array of objects { pair, timeframe, data }.
     */
    scanDataVariables: function() {
        const datasets = [];
        for (const key in window) {
            if (key.endsWith('_data') && Array.isArray(window[key])) {
                // Extract pair and timeframe from variable name
                // Example: EURUSD_M5_data -> pair = 'EUR/USD', timeframe = '5m'
                const base = key.slice(0, -5); // remove '_data'
                let pair = base;
                let timeframe = '1m';
                // Detect timeframe suffix like _M1, _M5, _M15, _H1, _H4, _D1, _W1, _MN
                const tfMatch = base.match(/_([MHDW])(\d+)$/);
                if (tfMatch) {
                    const type = tfMatch[1];
                    const num = parseInt(tfMatch[2]);
                    pair = base.slice(0, -tfMatch[0].length);
                    if (type === 'M') timeframe = num + 'm';
                    else if (type === 'H') timeframe = num + 'H';
                    else if (type === 'D') timeframe = num + 'D';
                    else if (type === 'W') timeframe = num + 'W';
                    else if (type === 'MN') timeframe = num + 'M';
                }
                // Convert pair from EURUSD to EUR/USD
                if (pair.length === 6 && !pair.includes('/')) {
                    pair = pair.slice(0,3) + '/' + pair.slice(3);
                }
                datasets.push({
                    variable: key,
                    pair: pair,
                    timeframe: timeframe,
                    data: window[key]
                });
            }
        }
        return datasets;
    },

    /**
     * Get list of available trading pairs (unique)
     */
    getPairs: function() {
        const datasets = this.scanDataVariables();
        const pairs = [...new Set(datasets.map(d => d.pair))];
        return pairs;
    },

    /**
     * Get pairs filtered by timeframe (if timeframe is selected)
     */
    getPairsByTimeframe: function(timeframe) {
        const datasets = this.scanDataVariables();
        return datasets.filter(d => d.timeframe === timeframe).map(d => d.pair);
    },

    /**
     * Request access (always succeeds for local data)
     */
    requestAccess: async function() {
        addLog("Local CSV data provider initialized.");
        return true;
    },

    /**
     * Fetch data for a specific pair and timeframe.
     * Note: range is ignored because local data contains all available history.
     */
    fetchData: async function(range, timeframe, pair) {
        addLog(`Loading local data: ${pair}, Timeframe: ${timeframe}`);
        const datasets = this.scanDataVariables();
        const dataset = datasets.find(d => d.pair === pair && d.timeframe === timeframe);
        if (!dataset) {
            throw new Error(`No local data found for ${pair} (TF: ${timeframe})`);
        }
        // Return a copy to avoid mutation
        return dataset.data.slice();
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
    } else if (type === 'local' && window.LocalCSVProvider) {
        addLog("Initializing Local CSV data...");
        if (await window.LocalCSVProvider.requestAccess()) {
            // Filter pairs by current timeframe (if any)
            const pairs = window.LocalCSVProvider.getPairsByTimeframe(currentTimeframe);
            if (pairs.length === 0) {
                // Fallback to all pairs
                renderPairs(window.LocalCSVProvider.getPairs());
            } else {
                renderPairs(pairs);
            }
        }
    }
    window.onresize();
};

window.setPair = async (p) => {
    document.getElementById('pair-btn').innerText = p + ' ▾';
    let provider = null;
    if (currentSource === 'twelvedata') provider = window.TwelveDataProvider;
    else if (currentSource === 'local') provider = window.LocalCSVProvider;
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
        window.MARKER_TIMESTAMPS.length = 0;
        curM = 0;
        window.curM = curM;
        // Обновить график баланса, если он активен
        if (activePanes.Balance && typeof window.updateBalance === 'function') {
            window.updateBalance();
        }
        document.querySelectorAll('#indicator-menu input[type=\"checkbox\"]').forEach(cb => {
            if(cb.checked) window.toggleIndicator(cb.getAttribute('data-id'), true);
        });
        updateIndicatorValues();
        addLog(`Loaded ${p}: ${data.length} candles (Range: ${currentRange}, TF: ${currentTimeframe})`);
    }
};

function updateIndicatorValues() {
    if (!data.length) return;
    const ts = chartMain.timeScale();
    const mainPane = document.getElementById('main-pane');
    const logicalIndex = ts.coordinateToLogical((mainPane.clientWidth - SCALE_WIDTH) / 2);
    if (logicalIndex === null) return;
    const idx = Math.round(logicalIndex);
    const candle = data[idx];
    if (!candle) return;

    // Получить параметры индикаторов из Strategy (или использовать значения по умолчанию)
    const params = window.Strategy?.params || {};
    const smaPeriod = params.smaPeriod || 20;
    const bbPeriod = params.bbPeriod || 20;
    const bbStdDev = params.bbStdDev || 2;
    const macdFast = params.macdFast || 12;
    const macdSlow = params.macdSlow || 26;
    const macdSignal = params.macdSignal || 9;
    const stochasticK = params.stochasticK || 14;
    const stochasticD = params.stochasticD || 3;
    const stochasticSlowing = params.stochasticSlowing || 3;

    // Вычислить индикаторы для всей серии (или только для нужного индекса)
    const sma = window.calcSMA(data, smaPeriod);
    const bb = window.calcBB(data, bbPeriod, bbStdDev);
    const macd = window.calcMACD(data, macdFast, macdSlow, macdSignal);
    const stochastic = window.calcStochastic(data, stochasticK, stochasticD, stochasticSlowing);

    // Получить значения для текущего индекса
    const smaVal = sma[idx]?.value;
    const bbUpper = bb[idx]?.upper;
    const bbMiddle = bb[idx]?.middle;
    const bbLower = bb[idx]?.lower;
    const macdVal = macd[idx]?.macd;
    const macdSignalVal = macd[idx]?.signal;
    const macdHist = macd[idx]?.histogram;
    const stochK = stochastic[idx]?.k;
    const stochD = stochastic[idx]?.d;

    // Форматирование
    const format = (v, digits = 5) => v === null ? '—' : v.toFixed(digits);
    const formatPercent = (v) => v === null ? '—' : v.toFixed(2) + '%';

    // Обновить DOM элементы для переменных покупки и продажи
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };

    // MACD значения
    setText('buy-macd-val', format(macdVal, 5));
    setText('buy-signal-val', format(macdSignalVal, 5));
    setText('buy-histogram-val', format(macdHist, 5));
    setText('sell-macd-val', format(macdVal, 5));
    setText('sell-signal-val', format(macdSignalVal, 5));
    setText('sell-histogram-val', format(macdHist, 5));

    // Stochastic значения
    setText('buy-stochasticK-val', formatPercent(stochK));
    setText('buy-stochasticD-val', formatPercent(stochD));
    setText('sell-stochasticK-val', formatPercent(stochK));
    setText('sell-stochasticD-val', formatPercent(stochD));

    // Цены (убраны, так как элементы удалены из HTML)
    // SMA и BB (не используются в списках, но можно оставить для отладки)
    // setText('val-sma', format(smaVal));
    // setText('val-bb', `U:${format(bbUpper)} M:${format(bbMiddle)} L:${format(bbLower)}`);
    // setText('val-macd', `MACD:${format(macdVal, 5)} Sig:${format(macdSignalVal, 5)} Hist:${format(macdHist, 5)}`);
    // setText('val-stochastic', `K:${formatPercent(stochK)} D:${formatPercent(stochD)}`);

    // Сохранить текущие значения переменных для вставки
    window.currentIndicatorValues = {
        macdVal,
        macdSignalVal,
        macdHist,
        stochK,
        stochD,
        smaVal,
        bbUpper,
        bbMiddle,
        bbLower,
        close: candle.close,
        open: candle.open,
        high: candle.high,
        low: candle.low
    };
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
    updateIndicatorValues();
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

// Auto‑load local data if available
(async function init() {
    // Wait a bit for all scripts to load
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check for any local data variable (e.g., EURUSD_M5_data)
    const localVars = Object.keys(window).filter(k => k.endsWith('_data') && Array.isArray(window[k]));
    if (localVars.length > 0) {
        // Use the first dataset
        const varName = localVars[0];
        // Extract pair and timeframe from variable name (same logic as LocalCSVProvider)
        const base = varName.slice(0, -5);
        let pair = base;
        let timeframe = '1m';
        const tfMatch = base.match(/_([MHDW])(\d+)$/);
        if (tfMatch) {
            const type = tfMatch[1];
            const num = parseInt(tfMatch[2]);
            pair = base.slice(0, -tfMatch[0].length);
            if (type === 'M') timeframe = num + 'm';
            else if (type === 'H') timeframe = num + 'H';
            else if (type === 'D') timeframe = num + 'D';
            else if (type === 'W') timeframe = num + 'W';
            else if (type === 'MN') timeframe = num + 'M';
        }
        if (pair.length === 6 && !pair.includes('/')) {
            pair = pair.slice(0,3) + '/' + pair.slice(3);
        }
        
        // Set timeframe UI
        currentTimeframe = timeframe;
        document.getElementById('timeframe-btn').innerText = timeframe + ' ▾';
        
        // Set source to local
        await window.setDataSource('local');
        
        // Wait for pairs to be rendered
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Set pair
        await window.setPair(pair);
        
        addLog(`Auto‑loaded ${pair} (${timeframe}) from local data.`);
    } else {
        // No local data, start with empty source
        window.setDataSource('none');
    }
    // (удалено - setupConditionCheckboxes больше не вызывается)
})();

// Открыть/закрыть панель настроек
window.toggleSettings = function() {
    const panel = document.getElementById('settings-panel');
    if (panel) {
        panel.classList.toggle('open');
        const isOpen = panel.classList.contains('open');
        // console.log removed
        addLog(isOpen ? 'Панель настроек открыта' : 'Панель настроек закрыта');
    } else {
        addLog('Ошибка: панель настроек не найдена в toggleSettings');
    }
};

// (удалено - заменено на applyAllSettings)

// Экспорт данных в CSV или JSON
window.exportData = function(format) {
    if (!window.data || window.data.length === 0) {
        addLog('Нет данных для экспорта');
        return;
    }
    let content, mime, filename;
    if (format === 'csv') {
        const headers = ['time', 'open', 'high', 'low', 'close'];
        const rows = window.data.map(d => [d.time, d.open, d.high, d.low, d.close].join(','));
        content = [headers.join(','), ...rows].join('\n');
        mime = 'text/csv';
        filename = `data_${new Date().toISOString().slice(0,10)}.csv`;
    } else if (format === 'json') {
        content = JSON.stringify(window.data, null, 2);
        mime = 'application/json';
        filename = `data_${new Date().toISOString().slice(0,10)}.json`;
    } else {
        addLog('Неизвестный формат экспорта');
        return;
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog(`Данные экспортированы в ${format.toUpperCase()}`);
};


// Навигация по маркерам с поддержкой 'first' и 'last'
window.changeMarker = function(dir) {
    if (!window.MARKER_TIMESTAMPS || window.MARKER_TIMESTAMPS.length === 0) {
        addLog('Нет маркеров для навигации');
        return;
    }
    if (dir === 'first') {
        curM = 0;
    } else if (dir === 'last') {
        curM = window.MARKER_TIMESTAMPS.length - 1;
    } else if (typeof dir === 'number') {
        curM = (curM + dir + window.MARKER_TIMESTAMPS.length) % window.MARKER_TIMESTAMPS.length;
    } else {
        addLog('Неизвестное направление навигации');
        return;
    }
    window.curM = curM;
    const ts = window.MARKER_TIMESTAMPS[curM];
    // Центрировать график на маркере с небольшим отступом
    chartMain.timeScale().setVisibleRange({ from: ts - 3600, to: ts + 3600 });
    addLog(`Переход к маркеру ${curM + 1} из ${window.MARKER_TIMESTAMPS.length}`);
};
// Переход к началу графика (сохраняет текущий масштаб)
window.navigateToStart = function() {
    if (!data || data.length === 0) {
        addLog('Нет данных для навигации');
        return;
    }
    const ts = chartMain.timeScale();
    const visibleRange = ts.getVisibleLogicalRange();
    if (!visibleRange) {
        // Если диапазон не определён, показываем первые 50 свечей
        const visibleBars = 50;
        const endIndex = Math.min(visibleBars, data.length - 1);
        const startTime = data[0].time;
        const endTime = data[endIndex].time;
        ts.setVisibleRange({ from: startTime, to: endTime });
        addLog('Переход к началу графика (масштаб по умолчанию)');
        return;
    }
    // Вычислить длину видимого диапазона в логических единицах (индексах свечей)
    const length = visibleRange.to - visibleRange.from;
    // Установить новый диапазон с той же длиной, но начинающийся с первой свечи
    const newFrom = 0;
    const newTo = Math.min(length, data.length - 1);
    ts.setVisibleLogicalRange({ from: newFrom, to: newTo });
    addLog('Переход к началу графика (масштаб сохранён)');
};

// Переход к концу графика (сохраняет текущий масштаб)
window.navigateToEnd = function() {
    if (!data || data.length === 0) {
        addLog('Нет данных для навигации');
        return;
    }
    const ts = chartMain.timeScale();
    const visibleRange = ts.getVisibleLogicalRange();
    if (!visibleRange) {
        // Если диапазон не определён, показываем последние 50 свечей
        const visibleBars = 50;
        const startIndex = Math.max(0, data.length - visibleBars);
        const startTime = data[startIndex].time;
        const endTime = data[data.length - 1].time;
        ts.setVisibleRange({ from: startTime, to: endTime });
        addLog('Переход к концу графика (масштаб по умолчанию)');
        return;
    }
    // Вычислить длину видимого диапазона в логических единицах
    const length = visibleRange.to - visibleRange.from;
    // Установить новый диапазон с той же длиной, но заканчивающийся последней свечой
    const newTo = data.length - 1;
    const newFrom = Math.max(0, newTo - length);
    ts.setVisibleLogicalRange({ from: newFrom, to: newTo });
    addLog('Переход к концу графика (масштаб сохранён)');
};

// Применить все настройки (индикаторы и стратегия) из новой панели с тремя окнами
window.applyAllSettings = function() {
    addLog('Применение всех настроек...');
    // console.log removed
    // 1. Настройки индикаторов (JSON из textarea)
    const indicatorSettingsTextarea = document.getElementById('indicator-settings');
    let rawSettings = {};
    if (indicatorSettingsTextarea && indicatorSettingsTextarea.value.trim()) {
        try {
            rawSettings = JSON.parse(indicatorSettingsTextarea.value.trim());
        } catch (e) {
            addLog('Ошибка парсинга JSON настроек индикаторов: ' + e.message);
            return;
        }
    } else {
        // Если поле пустое, использовать значения по умолчанию
        rawSettings = {
            smaPeriod: 20,
            bbPeriod: 20,
            bbStdDev: 2,
            macdFast: 12,
            macdSlow: 26,
            macdSignal: 9,
            stochasticK: 14,
            stochasticD: 3,
            stochasticSlowing: 3
        };
    }

    // Преобразовать вложенный формат (sma.period) в плоский (smaPeriod)
    const indicatorSettings = {};
    if (rawSettings.sma && typeof rawSettings.sma === 'object') {
        // Вложенный формат
        if (rawSettings.sma.period !== undefined) indicatorSettings.smaPeriod = rawSettings.sma.period;
        if (rawSettings.bb && rawSettings.bb.period !== undefined) indicatorSettings.bbPeriod = rawSettings.bb.period;
        if (rawSettings.bb && rawSettings.bb.stdDev !== undefined) indicatorSettings.bbStdDev = rawSettings.bb.stdDev;
        if (rawSettings.macd && rawSettings.macd.fast !== undefined) indicatorSettings.macdFast = rawSettings.macd.fast;
        if (rawSettings.macd && rawSettings.macd.slow !== undefined) indicatorSettings.macdSlow = rawSettings.macd.slow;
        if (rawSettings.macd && rawSettings.macd.signal !== undefined) indicatorSettings.macdSignal = rawSettings.macd.signal;
        if (rawSettings.stochastic && rawSettings.stochastic.k !== undefined) indicatorSettings.stochasticK = rawSettings.stochastic.k;
        if (rawSettings.stochastic && rawSettings.stochastic.d !== undefined) indicatorSettings.stochasticD = rawSettings.stochastic.d;
        if (rawSettings.stochastic && rawSettings.stochastic.slowing !== undefined) indicatorSettings.stochasticSlowing = rawSettings.stochastic.slowing;
    } else {
        // Плоский формат (уже совместим)
        Object.assign(indicatorSettings, rawSettings);
    }

    // 2. Условие покупки
    const buyConditionTextarea = document.getElementById('buy-condition');
    const buyCondition = buyConditionTextarea ? buyConditionTextarea.value.trim() : '';

    // 3. Условие продажи
    const sellConditionTextarea = document.getElementById('sell-condition');
    const sellCondition = sellConditionTextarea ? sellConditionTextarea.value.trim() : '';

    if (window.Strategy && window.Strategy.applyIndicatorSettings && window.Strategy.applyStrategySettings) {
        // Применить настройки индикаторов
        window.Strategy.applyIndicatorSettings(indicatorSettings);
        // Применить условия покупки и продажи (через applyStrategySettings)
        window.Strategy.applyStrategySettings({
            buyCondition: buyCondition,
            sellCondition: sellCondition
        });
        addLog('Все настройки применены (индикаторы, условия покупки и продажи)');
        // НЕ запускаем стратегию здесь, чтобы избежать рекурсии
        // Обновить значения индикаторов под прицелом
        updateIndicatorValues();
    } else {
        addLog('Ошибка: Strategy не загружен');
    }
};
// Вставить переменную в поле условия (старая функция для condition-input)
window.insertVariable = function(varName) {
    const textarea = document.getElementById('condition-input');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end);
    textarea.value = before + varName + after;
    // Установить курсор после вставленной переменной
    const newPos = start + varName.length;
    textarea.selectionStart = newPos;
    textarea.selectionEnd = newPos;
    textarea.focus();
};

// Вставить переменную в указанное текстовое поле (новая функция для трёх окон)
window.insertVariableIntoEditor = function(textareaId, varName) {
    const textarea = document.getElementById(textareaId);
    if (!textarea) {
        addLog('Предупреждение: текстовое поле не найдено: ' + textareaId);
        return;
    }
    // Маппинг имён переменных на ключи в window.currentIndicatorValues
    const varMapping = {
        'macd': 'macdVal',
        'signal': 'macdSignalVal',
        'histogram': 'macdHist',
        'stochasticK': 'stochK',
        'stochasticD': 'stochD',
        'sma': 'smaVal',
        'bbUpper': 'bbUpper',
        'bbMiddle': 'bbMiddle',
        'bbLower': 'bbLower',
        'close': 'close',
        'open': 'open',
        'high': 'high',
        'low': 'low'
    };
    const key = varMapping[varName] || varName;
    let value = window.currentIndicatorValues ? window.currentIndicatorValues[key] : null;
    // Если значение не найдено, используем имя переменной
    let insertText;
    if (value !== null && value !== undefined) {
        // Вставляем в формате "varName = value"
        insertText = varName + ' = ' + value.toString();
    } else {
        insertText = varName;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end);
    textarea.value = before + insertText + after;
    // Установить курсор после вставленной переменной
    const newPos = start + insertText.length;
    textarea.selectionStart = newPos;
    textarea.selectionEnd = newPos;
    textarea.focus();
};

// Вставить готовое условие в указанное текстовое поле
window.insertConditionIntoEditor = function(textareaId, condition) {
    const textarea = document.getElementById(textareaId);
    if (!textarea) {
        addLog('Предупреждение: текстовое поле не найдено: ' + textareaId);
        return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end);
    textarea.value = before + condition + after;
    // Установить курсор после вставленного условия
    const newPos = start + condition.length;
    textarea.selectionStart = newPos;
    textarea.selectionEnd = newPos;
    textarea.focus();
};

// (удалено - функция setupConditionCheckboxes больше не нужна)
// ==================== Модальное окно настроек индикаторов ====================

/**
 * Открывает модальное окно настроек индикаторов и заполняет его текущими параметрами.
 */
window.openIndicatorSettings = function() {
    const modal = document.getElementById('indicator-settings-modal');
    if (!modal) {
        addLog('Ошибка: модальное окно не найдено');
        return;
    }
    // Получить текущие параметры из Strategy
    const params = window.Strategy?.params || {};
    // Заполнить сетку параметров
    const grid = document.getElementById('params-grid');
    if (grid) {
        grid.innerHTML = '';
        // Список параметров с метками и типами
        const paramDefs = [
            { key: 'smaPeriod', label: 'Период SMA', type: 'number', min: 1, max: 200, step: 1 },
            { key: 'bbPeriod', label: 'Период Bollinger Bands', type: 'number', min: 1, max: 200, step: 1 },
            { key: 'bbStdDev', label: 'Стандартное отклонение BB', type: 'number', min: 0.5, max: 5, step: 0.1 },
            { key: 'macdFast', label: 'MACD быстрый период', type: 'number', min: 1, max: 50, step: 1 },
            { key: 'macdSlow', label: 'MACD медленный период', type: 'number', min: 1, max: 100, step: 1 },
            { key: 'macdSignal', label: 'MACD сигнальный период', type: 'number', min: 1, max: 50, step: 1 },
            { key: 'stochasticK', label: 'Stochastic %K период', type: 'number', min: 1, max: 50, step: 1 },
            { key: 'stochasticD', label: 'Stochastic %D период', type: 'number', min: 1, max: 50, step: 1 },
            { key: 'stochasticSlowing', label: 'Stochastic замедление', type: 'number', min: 1, max: 10, step: 1 },
            { key: 'useMACD', label: 'Использовать MACD', type: 'checkbox' },
            { key: 'useStochastic', label: 'Использовать Stochastic', type: 'checkbox' },
            { key: 'useSMA', label: 'Использовать SMA', type: 'checkbox' },
            { key: 'useBB', label: 'Использовать Bollinger Bands', type: 'checkbox' },
            { key: 'overbought', label: 'Уровень перекупленности', type: 'number', min: 0, max: 100, step: 1 },
            { key: 'oversold', label: 'Уровень перепроданности', type: 'number', min: 0, max: 100, step: 1 }
        ];
        paramDefs.forEach(def => {
            const row = document.createElement('div');
            row.className = 'param-row';
            const label = document.createElement('label');
            label.textContent = def.label;
            const input = document.createElement('input');
            input.type = def.type;
            input.id = `modal-${def.key}`;
            if (def.type === 'number') {
                input.min = def.min;
                input.max = def.max;
                input.step = def.step || 1;
                input.value = params[def.key] !== undefined ? params[def.key] : getDefaultValue(def.key);
            } else if (def.type === 'checkbox') {
                input.checked = params[def.key] !== undefined ? params[def.key] : getDefaultValue(def.key);
            }
            row.appendChild(label);
            row.appendChild(input);
            grid.appendChild(row);
        });
    }
    // Заполнить пользовательское условие
    const conditionTextarea = document.getElementById('custom-condition');
    if (conditionTextarea) {
        conditionTextarea.value = params.customCondition || '';
    }
    // Показать модальное окно
    modal.classList.add('open');
    addLog('Открыто окно настроек индикаторов');
};

/**
 * Возвращает значение по умолчанию для параметра.
 */
function getDefaultValue(key) {
    const defaults = {
        smaPeriod: 20,
        bbPeriod: 20,
        bbStdDev: 2,
        macdFast: 12,
        macdSlow: 26,
        macdSignal: 9,
        stochasticK: 14,
        stochasticD: 3,
        stochasticSlowing: 3,
        useMACD: true,
        useStochastic: true,
        useSMA: true,
        useBB: true,
        overbought: 85,
        oversold: 15
    };
    return defaults[key] !== undefined ? defaults[key] : '';
}

/**
 * Закрывает модальное окно настроек индикаторов.
 */
window.closeIndicatorSettings = function() {
    const modal = document.getElementById('indicator-settings-modal');
    if (modal) {
        modal.classList.remove('open');
        addLog('Окно настроек индикаторов закрыто');
    }
};

/**
 * Применяет настройки из модального окна и обновляет Strategy.
 */
window.applyIndicatorSettingsFromModal = function() {
    const params = {};
    // Собрать значения из полей ввода
    const paramKeys = [
        'smaPeriod', 'bbPeriod', 'bbStdDev', 'macdFast', 'macdSlow', 'macdSignal',
        'stochasticK', 'stochasticD', 'stochasticSlowing',
        'useMACD', 'useStochastic', 'useSMA', 'useBB',
        'overbought', 'oversold'
    ];
    paramKeys.forEach(key => {
        const input = document.getElementById(`modal-${key}`);
        if (!input) return;
        if (input.type === 'checkbox') {
            params[key] = input.checked;
        } else if (input.type === 'number') {
            params[key] = parseFloat(input.value);
        } else {
            params[key] = input.value;
        }
    });
    // Пользовательское условие
    const conditionTextarea = document.getElementById('custom-condition');
    if (conditionTextarea) {
        params.customCondition = conditionTextarea.value.trim();
    }
    // Применить настройки к Strategy
    if (window.Strategy && window.Strategy.applyIndicatorSettings && window.Strategy.applyStrategySettings) {
        // Разделим параметры на индикаторные и стратегические (использование индикаторов)
        const indicatorSettings = {
            smaPeriod: params.smaPeriod,
            bbPeriod: params.bbPeriod,
            bbStdDev: params.bbStdDev,
            macdFast: params.macdFast,
            macdSlow: params.macdSlow,
            macdSignal: params.macdSignal,
            stochasticK: params.stochasticK,
            stochasticD: params.stochasticD,
            stochasticSlowing: params.stochasticSlowing
        };
        const strategySettings = {
            useMACD: params.useMACD,
            useStochastic: params.useStochastic,
            useSMA: params.useSMA,
            useBB: params.useBB,
            overbought: params.overbought,
            oversold: params.oversold,
            customCondition: params.customCondition
        };
        window.Strategy.applyIndicatorSettings(indicatorSettings);
        window.Strategy.applyStrategySettings(strategySettings);
        addLog('Настройки индикаторов и стратегии применены из модального окна');
        // Закрыть окно
        window.closeIndicatorSettings();
        // Перезапустить стратегию
        window.Strategy.testStrategy();
        // Обновить UI (значения индикаторов)
        updateIndicatorValues();
    } else {
        addLog('Ошибка: Strategy не загружен');
    }
};

// =============================================================================
// Проверка наличия элементов панели настроек при загрузке
window.addEventListener('DOMContentLoaded', () => {
    addLog('DOM loaded, checking settings panel elements...');
    const panel = document.getElementById('settings-panel');
    if (!panel) addLog('Ошибка: панель настроек не найдена');
    else addLog('Панель настроек найдена');
    const buyCondition = document.getElementById('buy-condition');
    if (!buyCondition) addLog('Ошибка: текстовое поле buy-condition не найдено');
    else addLog('Текстовое поле buy-condition найдено');
    const sellCondition = document.getElementById('sell-condition');
    if (!sellCondition) addLog('Ошибка: текстовое поле sell-condition не найдено');
    else addLog('Текстовое поле sell-condition найдено');
    const indicatorSettings = document.getElementById('indicator-settings');
    if (!indicatorSettings) addLog('Ошибка: текстовое поле indicator-settings не найдено');
    else addLog('Текстовое поле indicator-settings найдено');
    const applyButton = document.querySelector('.settings-btn[onclick="applyAllSettings()"]');
    if (!applyButton) addLog('Кнопка applyAllSettings не найдена (ожидаемо, так как она удалена)');
    else addLog('Кнопка applyAllSettings найдена');
    // Проверка функции toggleSettings
    const toggleButton = document.getElementById('settings-toggle');
    if (!toggleButton) addLog('Ошибка: кнопка settings-toggle не найдена');
    else addLog('Кнопка settings-toggle найдена');
});