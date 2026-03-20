// ind_renderers.js
// Rendering/toggle helpers for indicators.

window.IndicatorRenderers = (function() {
    'use strict';

    function toLinePoint(time, value) {
        return Number.isFinite(value) ? { time, value } : { time };
    }

    function removeMainSeries(id, chartMain, mainSeriesRefs) {
        if (!mainSeriesRefs[id]) return;
        mainSeriesRefs[id].forEach(s => chartMain.removeSeries(s));
        delete mainSeriesRefs[id];
    }

    function removePane(id, activePanes) {
        if (!activePanes[id]) return;
        activePanes[id].chart.remove();
        document.getElementById('wrapper-' + id)?.remove();
        delete activePanes[id];
    }

    function ensurePane(id, activePanes, chartOpts, syncAll, LightweightCharts) {
        if (activePanes[id]) {
            return activePanes[id];
        }

        const wr = document.createElement('div');
        wr.id = 'wrapper-' + id;
        wr.className = 'pane-wrapper sub-pane';
        if (id === 'Phase') {
            wr.style.height = '65px';
        }
        wr.innerHTML = '<div class="v-line"></div><div id="chart-' + id + '" class="chart-container"></div>';
        document.getElementById('panels-container').appendChild(wr);

        const c = LightweightCharts.createChart(document.getElementById('chart-' + id), {
            ...chartOpts,
            // Keep same price scale setup as other panes (e.g. MACD) for consistent layout.
            timeScale: {
                ...chartOpts.timeScale,
                visible: false,
                rightOffset: chartOpts.timeScale?.rightOffset ?? 80
            }
        });
        c.timeScale().subscribeVisibleLogicalRangeChange(() => syncAll(c));
        activePanes[id] = { chart: c, series: [] };
        return activePanes[id];
    }

    function renderSMA(data, params, chartMain, mainSeriesRefs, LightweightCharts) {
        removeMainSeries('SMA', chartMain, mainSeriesRefs);
        mainSeriesRefs.SMA = [];
        const s = chartMain.addSeries(LightweightCharts.LineSeries, {
            color: '#ff00a6',
            lineWidth: 1,
            lastValueVisible: false,
            priceLineVisible: false
        });
        const sma = window.calcSMA(data, params.smaPeriod || 20);
        s.setData(sma.map(point => toLinePoint(point.time, point.value)));
        mainSeriesRefs.SMA.push(s);
    }

    function renderBB(data, params, chartMain, mainSeriesRefs, LightweightCharts) {
        removeMainSeries('BB', chartMain, mainSeriesRefs);
        mainSeriesRefs.BB = [];
        const bb = window.calcBB(data, params.bbPeriod || 20, params.bbStdDev || 2);
        [
            { k: 't', c: 'rgba(38,166,154,0.3)' },
            { k: 'm', c: 'rgba(33,150,243,0.5)' },
            { k: 'b', c: 'rgba(38,166,154,0.3)' }
        ].forEach(o => {
            const s = chartMain.addSeries(LightweightCharts.LineSeries, {
                color: o.c,
                lineWidth: 1,
                lastValueVisible: false,
                priceLineVisible: false
            });
            const keyMap = { t: 'upper', m: 'middle', b: 'lower' };
            s.setData(bb.map(v => toLinePoint(v.time, v[keyMap[o.k]])));
            mainSeriesRefs.BB.push(s);
        });
    }

    function renderStochastic(data, params, pane, LightweightCharts, addLog) {
        const stochasticData = window.calcStochastic(
            data,
            params.stochasticK || 14,
            params.stochasticD || 3,
            params.stochasticSlowing || 3
        );

        addLog('Stochastic data length: ' + stochasticData.length);
        for (let idx = 0; idx < Math.min(5, stochasticData.length); idx++) {
            const d = stochasticData[idx];
            addLog('Stochastic[' + idx + ']: time=' + new Date(d.time * 1000).toISOString() + ', k=' + d.k + ', d=' + d.d);
        }

        const nonNullK = stochasticData.filter(d => d.k !== null).length;
        const nonNullD = stochasticData.filter(d => d.d !== null).length;
        addLog('Non-null K: ' + nonNullK + ', D: ' + nonNullD);
        if (nonNullK > 0) {
            const firstK = stochasticData.find(d => d.k !== null);
            const lastK = stochasticData.slice().reverse().find(d => d.k !== null);
            addLog('First K time: ' + new Date(firstK.time * 1000).toISOString() + ', value: ' + firstK.k.toFixed(2));
            addLog('Last K time: ' + new Date(lastK.time * 1000).toISOString() + ', value: ' + lastK.k.toFixed(2));
        }

        const kLine = pane.chart.addSeries(LightweightCharts.LineSeries, {
            color: '#ff00a6',
            lineWidth: 1,
            lastValueVisible: false,
            priceLineVisible: false
        });
        kLine.setData(stochasticData.map(d => ({ time: d.time, value: d.k })));
        pane.series.push(kLine);

        const dLine = pane.chart.addSeries(LightweightCharts.LineSeries, {
            color: '#2196f3',
            lineWidth: 1,
            lastValueVisible: false,
            priceLineVisible: false
        });
        dLine.setData(stochasticData.map(d => ({ time: d.time, value: d.d })));
        pane.series.push(dLine);
    }

    function renderMACD(data, params, pane, LightweightCharts) {
        const h = pane.chart.addSeries(LightweightCharts.HistogramSeries, {
            lastValueVisible: false,
            priceLineVisible: false
        });
        const l1 = pane.chart.addSeries(LightweightCharts.LineSeries, {
            color: '#2196f3',
            lineWidth: 1,
            lastValueVisible: false,
            priceLineVisible: false
        });
        const l2 = pane.chart.addSeries(LightweightCharts.LineSeries, {
            color: '#ff9800',
            lineWidth: 1,
            lastValueVisible: false,
            priceLineVisible: false
        });

        const macdData = window.calcMACD(data, params.macdFast || 12, params.macdSlow || 26, params.macdSignal || 9);
        h.setData(macdData.map(item => ({
            time: item.time,
            value: item.histogram,
            color: item.histogramColor
        })));
        l1.setData(macdData.map(item => ({ time: item.time, value: item.macd })));
        l2.setData(macdData.map(item => ({ time: item.time, value: item.signal })));
        pane.series.push(h, l1, l2);
    }

    function renderPhase(data, params, indicators, pane, LightweightCharts, addLog) {
        if (!indicators || !indicators.phase || !Array.isArray(indicators.phase.phase)) {
            if (addLog) addLog('Phase: indicators not available');
            return;
        }

        // Match MACD pane layout: visible right price scale with fixed minimum width.
        pane.chart.applyOptions({
            rightPriceScale: {
                visible: true,
                borderVisible: true,
                borderColor: '#363c4e',
                minimumWidth: 80,
                autoScale: true,
                scaleMargins: { top: 0, bottom: 0 }
            },
            leftPriceScale: { visible: false }
        });

        if (addLog) addLog('Phase: rendering ' + indicators.phase.phase.length + ' data points');

        const phaseData = [];
        const PHASE_COLORS = {
            'squeeze': '#00ffff',  // cyan — сжатие
            'flat': '#aaaaaa',     // серый — боковик
            'trend_up': '#00ee44', // ярко-зелёный — вверх
            'trend_down': '#ff3333', // красный — вниз
            'chaos': '#ffaa00'     // оранжевый — хаос
        };

        const confidence = indicators.phase.confidence;
        const phaseScore = indicators.phase.phaseScore;

        for (let i = 0; i < Math.min(indicators.phase.phase.length, data.length); i++) {
            const phase = indicators.phase.phase[i];
            const color = PHASE_COLORS[phase] || '#666';
            // Приоритет: phaseScore (signed). Фолбэк на confidence для старых данных.
            const conf = (confidence && confidence[i] != null ? confidence[i] : 0.5);
            let fallbackSigned = 0;
            if (phase === 'trend_up') fallbackSigned = 1 + conf;
            else if (phase === 'trend_down') fallbackSigned = -(1 + conf);
            else if (phase === 'squeeze') fallbackSigned = 0.5 + conf * 0.5;
            else if (phase === 'flat') fallbackSigned = conf * 0.2;

            const value = (phaseScore && Number.isFinite(phaseScore[i]))
                ? phaseScore[i]
                : fallbackSigned;

            phaseData.push({
                time: data[i].time,
                value,
                color
            });
        }

        if (phaseData.length === 0) {
            if (addLog) addLog('Phase: no data to render');
            return;
        }

        if (addLog) addLog('Phase: created ' + phaseData.length + ' bars');

        try {
            const histogram = pane.chart.addSeries(LightweightCharts.HistogramSeries, {
                color: '#ffaa00',
                priceScaleId: 'right',
                lastValueVisible: false,
                priceLineVisible: false,
                baseValue: { type: 'price', price: 0 }
            });
            histogram.setData(phaseData);
            pane.series.push(histogram);

            // Keep scale readable and ensure values are visible.
            pane.chart.priceScale('right').applyOptions({
                visible: true,
                minimumWidth: 80,
                autoScale: true,
                scaleMargins: { top: 0, bottom: 0 }
            });

            // Anchor series makes scale always non-degenerate and labels stable.
            const anchorTop = pane.chart.addSeries(LightweightCharts.LineSeries, {
                color: 'rgba(255,255,255,0.01)',
                lineWidth: 1,
                lastValueVisible: false,
                priceLineVisible: false,
                priceScaleId: 'right'
            });
            const anchorBottom = pane.chart.addSeries(LightweightCharts.LineSeries, {
                color: 'rgba(255,255,255,0.01)',
                lineWidth: 1,
                lastValueVisible: false,
                priceLineVisible: false,
                priceScaleId: 'right'
            });
            anchorTop.setData(data.map(d => ({ time: d.time, value: 2.2 })));
            anchorBottom.setData(data.map(d => ({ time: d.time, value: -2.2 })));
            pane.series.push(anchorTop, anchorBottom);

            // Symmetric anchors keep 0 visually centered on autoscale.

            pane.chart.timeScale().fitContent();

            if (addLog) addLog('Phase: histogram added successfully');
        } catch (e) {
            if (addLog) addLog('Phase: ERROR rendering - ' + e.message);
        }
    }

    function toggleIndicator(ctx) {
        const {
            id,
            isChecked,
            data,
            params,
            chartMain,
            chartOpts,
            mainSeriesRefs,
            activePanes,
            syncAll,
            onResize,
            addLog,
            LightweightCharts
        } = ctx;

        const removeLegacyPhaseOverlay = () => {
            const overlay = document.getElementById('phase-indicator-panel');
            if (overlay) {
                overlay.remove();
            }
        };

        if (!isChecked) {
            if (id === 'Phase') {
                removeLegacyPhaseOverlay();
            }
            removeMainSeries(id, chartMain, mainSeriesRefs);
            removePane(id, activePanes);
            onResize();
            return true;
        }

        if (!data.length) {
            return true;
        }

        if (id === 'SMA') {
            renderSMA(data, params, chartMain, mainSeriesRefs, LightweightCharts);
            return true;
        }

        if (id === 'BB') {
            renderBB(data, params, chartMain, mainSeriesRefs, LightweightCharts);
            return true;
        }

        addLog('Main data length: ' + data.length);
        addLog('First candle time: ' + new Date(data[0].time * 1000).toISOString());
        addLog('Last candle time: ' + new Date(data[data.length - 1].time * 1000).toISOString());

        const pane = ensurePane(id, activePanes, chartOpts, syncAll, LightweightCharts);
        pane.series.forEach(s => pane.chart.removeSeries(s));
        pane.series = [];

        if (id === 'Stochastic') {
            renderStochastic(data, params, pane, LightweightCharts, addLog);
        }
        if (id === 'MACD') {
            renderMACD(data, params, pane, LightweightCharts);
        }
        if (id === 'Phase') {
            removeLegacyPhaseOverlay();
            addLog('Phase: calculating indicators...');
            const indicators = window.StrategyCore && typeof window.StrategyCore.calculateIndicators === 'function'
                ? window.StrategyCore.calculateIndicators(data, params, { forceAll: true, silent: true })
                : null;

            if (indicators) {
                renderPhase(data, params, indicators, pane, LightweightCharts, addLog);
                addLog('Phase: rendered in bottom pane');


            } else {
                addLog('Phase: failed to calculate indicators');
            }
        }

        onResize();
        syncAll(chartMain);
        return true;
    }

    return {
        toggleIndicator
    };
})();
