// main.js - Main application logic

const SCALE_WIDTH = 80;
let data = [];
window.data = data; // expose globally
let MARKER_TIMESTAMPS = [];
window.MARKER_TIMESTAMPS = MARKER_TIMESTAMPS; // экспорт для strategy.js
let currentRange = '1W', currentTimeframe = '1m', currentSource = 'none', currentPair = '', curM = 0, isSyncing = false;
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
    reloadDataIfNeeded();
};

window.setTimeframe = async (tf) => {
    currentTimeframe = tf;
    // Обновить текст кнопки TF (например, "m1 ▾")
    const displayMap = { '1m': 'm1', '5m': 'm5', '15m': 'm15' };
    const display = displayMap[tf] || tf;
    const tfBtn = document.getElementById('tf-btn');
    if (tfBtn) tfBtn.innerText = display + ' ▾';
    addLog(`Timeframe set to: ${tf}`);
    // Обновить список пар для текущего источника
    await updatePairListForCurrentSource();
    // Перезагрузить данные, если источник выбран
    reloadDataIfNeeded();
};

function reloadDataIfNeeded() {
    if (currentSource !== 'none' && currentPair) {
        // Перезагрузить данные с текущими параметрами
        window.setPair(currentPair);
    }
}

async function updatePairListForCurrentSource() {
    if (currentSource === 'none') {
        // Очистить список пар
        renderPairs([]);
        return;
    }
    if (currentSource === 'twelvedata' && window.TwelveDataProvider) {
        const pairs = window.TwelveDataProvider.getPairs();
        renderPairs(pairs);
    } else if (currentSource === 'local' && window.LocalJsProvider) {
        // Фильтруем пары по текущему TF
        const pairs = await window.LocalJsProvider.getPairsByTimeframe(currentTimeframe);
        if (pairs.length === 0) {
            // Если для данного TF нет файлов, очищаем список пар и график
            renderPairs([]);
            // Также очищаем график, если пара была выбрана
            if (currentPair) {
                data = []; window.data = data;
                candleSeries.setData([]);
                Object.keys(mainSeriesRefs).forEach(id => { mainSeriesRefs[id].forEach(s => chartMain.removeSeries(s)); delete mainSeriesRefs[id]; });
                Object.keys(activePanes).forEach(id => { activePanes[id].chart.remove(); document.getElementById(`wrapper-${id}`)?.remove(); delete activePanes[id]; });
                currentPair = '';
                document.getElementById('pair-btn').innerText = 'Select ▾';
                addLog('No pairs for selected timeframe, cleared chart.');
            }
        } else {
            renderPairs(pairs);
        }
    }
}

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
        // Очистить список пар
        renderPairs([]);
    } else if (type === 'twelvedata' && window.TwelveDataProvider) {
        addLog("Initializing Twelve Data API connection...");
        if (await window.TwelveDataProvider.requestAccess()) {
            await updatePairListForCurrentSource();
        }
    } else if (type === 'local' && window.LocalJsProvider) {
        addLog("Initializing Local data...");
        if (await window.LocalJsProvider.requestAccess()) {
            await updatePairListForCurrentSource();
        }
    }
    window.onresize();
};

window.setPair = async (p) => {
    currentPair = p;
    document.getElementById('pair-btn').innerText = p + ' ▾';
    let provider = null;
    if (currentSource === 'twelvedata') provider = window.TwelveDataProvider;
    else if (currentSource === 'local') provider = window.LocalJsProvider;
    if (provider) {
        addLog(`Fetching data: ${p}, Range: ${currentRange}, Timeframe: ${currentTimeframe}`);
        const newData = await provider.fetchData(currentRange, currentTimeframe, p);
        if (!newData || !newData.length) return addLog("No data received");
        data = newData;
        // Обогатить данные признаком торговых часов (если StrategyCore доступен)
        if (window.StrategyCore && window.StrategyCore.enrichDataWithTradingHours) {
            data = window.StrategyCore.enrichDataWithTradingHours(data);
        }
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

    const coreDefaults = window.StrategyCore && typeof window.StrategyCore.getDefaultParams === 'function'
        ? window.StrategyCore.getDefaultParams()
        : {};
    const params = { ...coreDefaults, ...(window.Strategy?.params || {}) };

    let indicators = null;
    if (window.StrategyCore && typeof window.StrategyCore.calculateIndicators === 'function') {
        indicators = window.StrategyCore.calculateIndicators(data, params, {
            only: ['sma', 'bb', 'macd', 'stochastic'],
            forceAll: true,
            silent: true
        });
    }

    if (!indicators) {
        indicators = {
            sma: window.calcSMA(data, params.smaPeriod || 20),
            bb: window.calcBB(data, params.bbPeriod || 20, params.bbStdDev || 2),
            macd: window.calcMACD(data, params.macdFast || 12, params.macdSlow || 26, params.macdSignal || 9),
            stochastic: window.calcStochastic(data, params.stochasticK || 14, params.stochasticD || 3, params.stochasticSlowing || 3)
        };
    }

    // Получить значения для текущего индекса
    const smaVal = indicators.sma[idx]?.value;
    const bbUpper = indicators.bb[idx]?.upper;
    const bbMiddle = indicators.bb[idx]?.middle;
    const bbLower = indicators.bb[idx]?.lower;
    const macdVal = indicators.macd[idx]?.macd;
    const macdSignalVal = indicators.macd[idx]?.signal;
    const macdHist = indicators.macd[idx]?.histogram;
    const stochK = indicators.stochastic[idx]?.k;
    const stochD = indicators.stochastic[idx]?.d;

    // Форматирование
    const format = (v, digits = 5) => (v === null || v === undefined || !Number.isFinite(v)) ? '—' : v.toFixed(digits);
    const formatPercent = (v) => (v === null || v === undefined || !Number.isFinite(v)) ? '—' : v.toFixed(2) + '%';

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

window.updateIndicatorValues = updateIndicatorValues;


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

function toLinePoint(time, value) {
    return Number.isFinite(value) ? { time, value } : { time };
}

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

    const coreDefaults = window.StrategyCore && typeof window.StrategyCore.getDefaultParams === 'function'
        ? window.StrategyCore.getDefaultParams()
        : {};
    const params = { ...coreDefaults, ...(window.Strategy?.params || {}) };

    if (id === 'SMA' || id === 'BB') {
        if (mainSeriesRefs[id]) mainSeriesRefs[id].forEach(s => chartMain.removeSeries(s));
        mainSeriesRefs[id] = [];
        if (id === 'SMA') {
            const s = chartMain.addSeries(LightweightCharts.LineSeries, { color: '#ff00a6', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
            const sma = window.calcSMA(data, params.smaPeriod || 20);
            s.setData(sma.map(point => toLinePoint(point.time, point.value))); mainSeriesRefs[id].push(s);
        }
        if (id === 'BB') {
            const bb = window.calcBB(data, params.bbPeriod || 20, params.bbStdDev || 2);
            [{k:'t', c:'rgba(38,166,154,0.3)'}, {k:'m', c:'rgba(33,150,243,0.5)'}, {k:'b', c:'rgba(38,166,154,0.3)'}].forEach(o => {
                const s = chartMain.addSeries(LightweightCharts.LineSeries, { color: o.c, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
                const keyMap = { t: 'upper', m: 'middle', b: 'lower' };
                s.setData(bb.map(v => toLinePoint(v.time, v[keyMap[o.k]]))); mainSeriesRefs[id].push(s);
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
            const stochasticData = calcStochastic(data, params.stochasticK || 14, params.stochasticD || 3, params.stochasticSlowing || 3);
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
            const macdData = calcMACD(data, params.macdFast || 12, params.macdSlow || 26, params.macdSignal || 9);
            h.setData(macdData.map(item => ({
                time: item.time,
                value: item.histogram,
                color: item.histogramColor
            })));
            l1.setData(macdData.map(item => ({ time: item.time, value: item.macd })));
            l2.setData(macdData.map(item => ({ time: item.time, value: item.signal })));
            pane.series.push(h, l1, l2);
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
    
    // Use LocalJsProvider to scan available modules
    const datasets = window.LocalJsProvider ? await window.LocalJsProvider.scanModules() : [];
    let targetPair = 'EUR/USD';
    let targetDataset = null;
    
    // Try to find EUR/USD dataset (any timeframe)
    for (const ds of datasets) {
        if (ds.pair === targetPair) {
            targetDataset = ds;
            break;
        }
    }
    // If not found, fallback to first dataset (if any)
    if (!targetDataset && datasets.length > 0) {
        targetDataset = datasets[0];
        targetPair = targetDataset.pair;
    }
    
    if (targetDataset) {
        const { pair, timeframe } = targetDataset;
        
        // Set timeframe UI
        window.setTimeframe(timeframe);
        
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
        addLog('No local data found, starting with empty source.');
    }
})();

// Открыть/закрыть панель настроек
window.toggleSettings = function() {
    const panel = document.getElementById('settings-panel');
    if (!panel) {
        addLog('Ошибка: панель настроек не найдена в toggleSettings');
        return;
    }

    panel.classList.toggle('open');
};

// Навигация по маркерам с поддержкой 'first' и 'last'
function getVisibleLogicalRangeSafe() {
    return chartMain.timeScale().getVisibleLogicalRange();
}

function findNearestMarkerIndexByCenter() {
    if (!window.MARKER_TIMESTAMPS || window.MARKER_TIMESTAMPS.length === 0) {
        return -1;
    }

    const visibleRange = getVisibleLogicalRangeSafe();
    if (!visibleRange || !data || data.length === 0) {
        return Math.max(0, Math.min(curM, window.MARKER_TIMESTAMPS.length - 1));
    }

    const centerLogical = (visibleRange.from + visibleRange.to) / 2;
    const centerIndex = Math.max(0, Math.min(data.length - 1, Math.round(centerLogical)));
    const centerTime = data[centerIndex].time;

    let nearestIndex = 0;
    let nearestDistance = Infinity;
    for (let i = 0; i < window.MARKER_TIMESTAMPS.length; i++) {
        const distance = Math.abs(window.MARKER_TIMESTAMPS[i] - centerTime);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = i;
        }
    }

    return nearestIndex;
}

function centerOnDataIndexPreserveScale(targetIndex) {
    const ts = chartMain.timeScale();
    const visibleRange = getVisibleLogicalRangeSafe();
    if (!visibleRange) {
        return false;
    }

    const span = visibleRange.to - visibleRange.from;
    const halfSpan = span / 2;
    let from = targetIndex - halfSpan;
    let to = targetIndex + halfSpan;

    if (from < 0) {
        to -= from;
        from = 0;
    }

    const maxIndex = Math.max(0, data.length - 1);
    if (to > maxIndex) {
        const shift = to - maxIndex;
        from = Math.max(0, from - shift);
        to = maxIndex;
    }

    ts.setVisibleLogicalRange({ from, to });
    return true;
}

window.changeMarker = function(dir) {
    if (!window.MARKER_TIMESTAMPS || window.MARKER_TIMESTAMPS.length === 0) {
        addLog('Нет маркеров для навигации');
        return;
    }

    const markersCount = window.MARKER_TIMESTAMPS.length;
    const baseIndex = findNearestMarkerIndexByCenter();

    if (dir === 'first') {
        curM = 0;
    } else if (dir === 'last') {
        curM = markersCount - 1;
    } else if (typeof dir === 'number') {
        curM = (baseIndex + dir + markersCount) % markersCount;
    } else {
        addLog('Неизвестное направление навигации');
        return;
    }

    window.curM = curM;
    const markerTime = window.MARKER_TIMESTAMPS[curM];
    const markerDataIndex = data.findIndex(candle => candle.time === markerTime);

    if (markerDataIndex === -1) {
        addLog('Маркер не найден в текущих данных');
        return;
    }

    if (!centerOnDataIndexPreserveScale(markerDataIndex)) {
        addLog('Не удалось выполнить переход без изменения масштаба');
        return;
    }

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
        addLog('Переход к началу невозможен: видимый диапазон не определён');
        return;
    }
    // Вычислить длину видимого диапазона в логических единицах (индексах свечей)
    const length = visibleRange.to - visibleRange.from;
    // Установить новый диапазон с той же длиной, но начинающийся с первой свечи
    const newFrom = 0;
    const newTo = Math.min(length, data.length - 1);
    ts.setVisibleLogicalRange({ from: newFrom, to: newTo });
    addLog('Переход к началу графика');
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
        addLog('Переход к концу невозможен: видимый диапазон не определён');
        return;
    }
    // Вычислить длину видимого диапазона в логических единицах
    const length = visibleRange.to - visibleRange.from;
    // Установить новый диапазон с той же длиной, но заканчивающийся последней свечой
    const newTo = data.length - 1;
    const newFrom = Math.max(0, newTo - length);
    ts.setVisibleLogicalRange({ from: newFrom, to: newTo });
    addLog('Переход к концу графика');
};

// applyAllSettings is provided by strategy-editor.js.



// =============================================================================
// Обработчики UI при загрузке
window.addEventListener('DOMContentLoaded', () => {
    // Обработка кликов для TF dropdown
    const tfDropdown = document.querySelector('#tf-btn + .dropdown');
    if (tfDropdown) {
        const items = tfDropdown.querySelectorAll('.ind-row:not(.header)');
        items.forEach(item => {
            item.addEventListener('click', () => {
                const value = item.getAttribute('data-value');
                if (value) {
                    window.setTimeframe(value);
                    // Закрыть dropdown
                    const menuItem = item.closest('.menu-item');
                    if (menuItem) menuItem.classList.remove('open');
                }
            });
        });
        // Заголовок TF не кликабелен
        const header = tfDropdown.querySelector('.ind-row.header');
        if (header) {
            header.style.pointerEvents = 'none';
            header.style.cursor = 'default';
        }
    } else {
        addLog('TF dropdown не найден');
    }

    // Обработка кликов для Range dropdown (если нужно, но уже есть в index.html через onclick)
    // Проверим, что заголовок Range также не кликабелен
    const rangeDropdown = document.querySelector('#range-btn + .dropdown');
    if (rangeDropdown) {
        const header = rangeDropdown.querySelector('.ind-row.header');
        if (header) {
            header.style.pointerEvents = 'none';
            header.style.cursor = 'default';
        }
    }
});