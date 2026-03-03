// main.js - Main application logic

const SCALE_WIDTH = 80;
let data = [];
let MARKER_TIMESTAMPS = [];
let currentRange = '1M', currentTimeframe = '1min', currentSource = 'none', curM = 0, isSyncing = false;
const activePanes = {}, mainSeriesRefs = {};

const addLog = (m) => { 
    const c = document.getElementById('log-content'); 
    if (c) { 
        c.innerHTML += `<div><span style=\"color:#5d606b\">[${new Date().toLocaleTimeString()}]</span> ${m}</div>`; 
        c.scrollTop = c.scrollHeight; 
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
const candleSeries = chartMain.addSeries(LightweightCharts.CandlestickSeries, { 
    upColor: '#26a69a', downColor: '#ef5350', lastValueVisible: false, priceLineVisible: false 
});

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
        data = []; candleSeries.setData([]);
        Object.keys(mainSeriesRefs).forEach(id => { mainSeriesRefs[id].forEach(s => chartMain.removeSeries(s)); delete mainSeriesRefs[id]; });
        Object.keys(activePanes).forEach(id => { activePanes[id].chart.remove(); document.getElementById(`wrapper-${id}`)?.remove(); delete activePanes[id]; });
        document.querySelectorAll('#indicator-menu input[type=\"checkbox\"]').forEach(cb => cb.checked = false);
        addLog("Source cleared.");
    } else if (type === 'csv' && window.CsvProvider) {
        if (await window.CsvProvider.requestAccess()) renderPairs(await window.CsvProvider.scanFiles());
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
    const provider = (currentSource === 'csv') ? window.CsvProvider :
                     (currentSource === 'twelvedata') ? window.TwelveDataProvider : null;
    if (provider) {
        // Combine range and timeframe for data fetching
        const combinedRange = currentTimeframe === '1min' ? '1min' :
                             currentTimeframe === '5min' ? '5min' :
                             currentTimeframe === '15min' ? '15min' :
                             currentRange;
        
        addLog(`Fetching data: ${p}, Range: ${currentRange}, Timeframe: ${currentTimeframe}`);
        const newData = await provider.fetchData(combinedRange, p);
        if (!newData || !newData.length) return addLog("No data received");
        data = newData;
        candleSeries.setData(data);
        chartMain.timeScale().fitContent();
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
            const sma = data.map((d, i) => i < 19 ? null : { time: d.time, value: data.slice(i-19, i+1).reduce((a,b)=>a+b.close, 0)/20 }).filter(v => v !== null);
            s.setData(sma); mainSeriesRefs[id].push(s);
        }
        if (id === 'BB') {
            const bb = data.map((d, i) => { if (i < 19) return null; 
                const sl = data.slice(i-19, i+1).map(x=>x.close), m = sl.reduce((a,b)=>a+b,0)/20, sd = Math.sqrt(sl.reduce((a,b)=>a+Math.pow(b-m,2),0)/20);
                return { time: d.time, t: m + 2*sd, m: m, b: m - 2*sd };
            }).filter(v => v !== null);
            [{k:'t', c:'rgba(38,166,154,0.3)'}, {k:'m', c:'rgba(33,150,243,0.5)'}, {k:'b', c:'rgba(38,166,154,0.3)'}].forEach(o => {
                const s = chartMain.addSeries(LightweightCharts.LineSeries, { color: o.c, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
                s.setData(bb.map(v => ({ time: v.time, value: v[o.k] }))); mainSeriesRefs[id].push(s);
            });
        }
    } else {
        if (!activePanes[id]) {
            const wr = document.createElement('div'); wr.id = `wrapper-${id}`; wr.className = 'pane-wrapper sub-pane'; wr.innerHTML = `<div class=\"v-line\"></div><div id=\"chart-${id}\" class=\"chart-container\"></div>`;
            document.getElementById('panels-container').appendChild(wr);
            const c = LightweightCharts.createChart(document.getElementById(`chart-${id}`), { ...chartOpts, timeScale: { visible: false } });
            c.timeScale().subscribeVisibleLogicalRangeChange(() => syncAll(c));
            activePanes[id] = { chart: c, series: [] };
        }
        const pane = activePanes[id];
        pane.series.forEach(s => pane.chart.removeSeries(s)); pane.series = [];
        if (id === 'RSI') {
            const s = pane.chart.addSeries(LightweightCharts.LineSeries, { color: '#ff00a6', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
            s.setData(calcRSI(data, 14)); pane.series.push(s);
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

// Initialize with default values
window.onresize(); 
window.setDataSource('none');