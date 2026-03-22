// strategy.js
// Оркестрация стратегии: запуск теста, маркеры, PnL и связь с UI

(function() {
    'use strict';

    const FALLBACK_PARAMS = {
        expirationMinutes: 15,
        winPayout: 0.8,
        baseStake: 1,
        useMartingale: false,
        martingaleMultiplier: 2,
        martingaleMaxSteps: 5,
        rules: '',
        filterTradingHours: false
    };

    const STRATEGY_SETTING_KEYS = [
        'expirationMinutes',
        'winPayout',
        'baseStake',
        'useMartingale',
        'martingaleMultiplier',
        'martingaleMaxSteps',
        'rules',
        'filterTradingHours'
    ];

    const INDICATOR_SETTING_KEYS = [
        'bbPeriod',
        'bbStdDev',
        'useATR',
        'atrPeriod',
        'atrSmoothPeriod',
        'useStochastic',
        'stochasticK',
        'stochasticD',
        'stochasticSlowing'
    ];

    function log(message) {
        if (typeof window.addLog === 'function') {
            window.addLog(message);
        }
    }

    function getCore() {
        return window.StrategyCore || null;
    }

    function createDefaultParams() {
        if (window.StrategyParams && typeof window.StrategyParams.getDefaultParams === 'function') {
            return window.StrategyParams.getDefaultParams();
        }

        const core = getCore();
        if (core && typeof core.getDefaultParams === 'function') {
            return core.getDefaultParams();
        }

        return { ...FALLBACK_PARAMS };
    }

    function syncParams(params) {
        if (window.StrategyParams && typeof window.StrategyParams.normalizeParams === 'function') {
            return window.StrategyParams.normalizeParams(params || {});
        }

        const core = getCore();
        if (core && typeof core.normalizeParams === 'function') {
            return core.normalizeParams(params || {});
        }

        return { ...FALLBACK_PARAMS, ...(params || {}) };
    }

    function applyWhitelistedSettings(target, source, keys) {
        if (!source || typeof source !== 'object') {
            return false;
        }

        let changed = false;
        for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
                target[key] = source[key];
                changed = true;
            }
        }

        return changed;
    }

    window.Strategy = {
        params: createDefaultParams(),
        tradeHistory: [],
        expiration: 5,
        markerBaseList: [],
        markerSeries: null,
        currentGraphicMarkerIndex: -1,
        lastIndicators: null,
        lastDataRef: null,
        entryGraphicChart: null,
        entryGraphicSeriesMid: null,
        entryGraphicSeriesUpper: null,
        entryGraphicSeriesLower: null,

        setSeriesMarkers: function(series, markers) {
            if (!series) {
                return;
            }

            if (window.LightweightCharts && typeof window.LightweightCharts.createSeriesMarkers === 'function') {
                if (series.markerPrimitive && typeof series.markerPrimitive.setMarkers === 'function') {
                    series.markerPrimitive.setMarkers(markers);
                } else {
                    series.markerPrimitive = window.LightweightCharts.createSeriesMarkers(series, markers);
                }
            } else if (typeof series.setMarkers === 'function') {
                series.setMarkers(markers);
                log('Маркеры созданы через setMarkers');
            } else {
                log('Ошибка: не найден метод для отображения маркеров');
            }
        },

        ensureEntryGraphicSeries: function(chart) {
            if (!chart || !window.LightweightCharts || !window.LightweightCharts.LineSeries) {
                return;
            }

            if (this.entryGraphicChart && this.entryGraphicChart !== chart) {
                this.removeEntryGraphicSeries();
            }

            if (!this.entryGraphicSeriesMid) {
                this.entryGraphicSeriesMid = chart.addSeries(window.LightweightCharts.LineSeries, {
                    color: '#00bcd4',
                    lineWidth: 1,
                    lineStyle: 2,
                    priceLineVisible: false,
                    lastValueVisible: false,
                    crosshairMarkerVisible: false
                });
            }
            if (!this.entryGraphicSeriesUpper) {
                this.entryGraphicSeriesUpper = chart.addSeries(window.LightweightCharts.LineSeries, {
                    color: '#ff8a65',
                    lineWidth: 2,
                    priceLineVisible: false,
                    lastValueVisible: false,
                    crosshairMarkerVisible: false
                });
            }
            if (!this.entryGraphicSeriesLower) {
                this.entryGraphicSeriesLower = chart.addSeries(window.LightweightCharts.LineSeries, {
                    color: '#ff8a65',
                    lineWidth: 2,
                    priceLineVisible: false,
                    lastValueVisible: false,
                    crosshairMarkerVisible: false
                });
            }

            this.entryGraphicChart = chart;
        },

        removeEntryGraphicSeries: function() {
            if (this.entryGraphicChart) {
                if (this.entryGraphicSeriesMid) {
                    this.entryGraphicChart.removeSeries(this.entryGraphicSeriesMid);
                }
                if (this.entryGraphicSeriesUpper) {
                    this.entryGraphicChart.removeSeries(this.entryGraphicSeriesUpper);
                }
                if (this.entryGraphicSeriesLower) {
                    this.entryGraphicChart.removeSeries(this.entryGraphicSeriesLower);
                }
            }

            this.entryGraphicSeriesMid = null;
            this.entryGraphicSeriesUpper = null;
            this.entryGraphicSeriesLower = null;
            this.entryGraphicChart = null;
        },

        clearEntryGraphicLines: function() {
            if (this.entryGraphicSeriesMid) {
                this.entryGraphicSeriesMid.setData([]);
            }
            if (this.entryGraphicSeriesUpper) {
                this.entryGraphicSeriesUpper.setData([]);
            }
            if (this.entryGraphicSeriesLower) {
                this.entryGraphicSeriesLower.setData([]);
            }
        },

        showEntryGraphicForMarker: function(markerIndex) {
            this.clearEntryGraphicLines();
            this.currentGraphicMarkerIndex = -1;
        },

        clearEntryGraphic: function() {
            this.clearEntryGraphicLines();
            this.currentGraphicMarkerIndex = -1;
        },

        createConditionContext: function(i, data, indicators, tradeHistory) {
            const core = getCore();
            if (!core || typeof core.createConditionContext !== 'function') {
                log('Ошибка: StrategyCore.createConditionContext недоступна');
                return null;
            }

            return core.createConditionContext(i, data, indicators, tradeHistory || this.tradeHistory);
        },

        evaluateCondition: function(condition, context) {
            const core = getCore();
            if (!core || typeof core.evaluateCondition !== 'function') {
                log('Ошибка: StrategyCore.evaluateCondition недоступна');
                return false;
            }

            return core.evaluateCondition(condition, context);
        },

        calculateSignals: function(data) {
            try {
                if (!Array.isArray(data) || data.length < 30) {
                    log('Недостаточно данных для расчета сигналов (нужно минимум 30 свечей)');
                    return [];
                }

                const core = getCore();
                if (!core || typeof core.calculateIndicators !== 'function' || typeof core.calculateSignals !== 'function') {
                    log('Ошибка: StrategyCore не готов к расчету сигналов');
                    return [];
                }

                this.params = syncParams(this.params);

                if (window.debugLog) {
                    log('Отладочный лог включен для calculateSignals');
                }

                const indicators = core.calculateIndicators(data, this.params);
                if (!indicators) {
                    return [];
                }

                this.lastIndicators = indicators;
                this.lastDataRef = data;

                const signals = core.calculateSignals(data, this.params, indicators, this.tradeHistory);
                return signals;
            } catch (error) {
                log(`Ошибка расчета сигналов: ${error.message}`);
                return [];
            }
        },

        clearSignals: function(chart, series) {
            if (!chart || !series) {
                return;
            }

            if (series.markerPrimitive && typeof series.markerPrimitive.setMarkers === 'function') {
                series.markerPrimitive.setMarkers([]);
            } else if (typeof series.setMarkers === 'function') {
                series.setMarkers([]);
                log('Маркеры очищены (setMarkers)');
            } else if (window.LightweightCharts && typeof window.LightweightCharts.createSeriesMarkers === 'function') {
                window.LightweightCharts.createSeriesMarkers(series, []);
            } else {
                log('Не удалось очистить маркеры: нет подходящего метода');
            }

            if (window.MARKER_TIMESTAMPS) {
                window.MARKER_TIMESTAMPS.length = 0;
                if (window.curM !== undefined) window.curM = 0;
            }

            this.markerBaseList = [];
            this.markerSeries = null;
            this.currentGraphicMarkerIndex = -1;
            this.clearEntryGraphicLines();
            this.removeEntryGraphicSeries();
        },

        plotSignals: function(chart, series, signals) {
            if (!chart || !series) {
                log('Ошибка: график или серия не доступны для отображения маркеров');
                return;
            }
            if (!signals || signals.length === 0) {
                log('Нет сигналов для отображения');
                return;
            }

            const baseStake = this.params.baseStake || 1;
            
            // Создаём map результатов и ставки сделки по времени и типу для быстрого поиска
            const tradeResultMap = {};
            const tradeStakeMap = {};
            if (this.tradeHistory && Array.isArray(this.tradeHistory)) {
                for (const trade of this.tradeHistory) {
                    const key = `${trade.time}_${trade.type}`;
                    tradeResultMap[key] = trade.result; // 'win' или 'loss'
                    tradeStakeMap[key] = Number(trade.stake) || 0;
                }
            }

            const markers = [];
            signals.forEach(signal => {
                const strength = signal.type === 'buy' ? signal.buyStrength : signal.sellStrength;

                // Определяем цвет маркера по результату сделки
                const tradeKey = `${signal.time}_${signal.type}`;
                const tradeResult = tradeResultMap[tradeKey];
                const dealSize = tradeStakeMap[tradeKey] || (baseStake * strength);
                const dealSizeText = dealSize.toFixed(1);
                
                let markerColor;
                if (tradeResult === 'win') {
                    markerColor = '#90EE90'; // Зелёный для win
                } else if (tradeResult === 'loss') {
                    markerColor = '#FFD700'; // Жёлтый для loss
                } else {
                    // Если результат неизвестен, используем цвет по типу
                    markerColor = signal.type === 'buy' ? '#26a69a' : '#ef5350';
                }

                markers.push({
                    time: signal.time,
                    position: signal.type === 'buy' ? 'belowBar' : 'aboveBar',
                    color: markerColor,
                    shape: signal.type === 'buy' ? 'arrowUp' : 'arrowDown',
                    text: dealSizeText
                });
            });

            this.markerBaseList = markers.slice();
            this.markerSeries = series;
            this.currentGraphicMarkerIndex = -1;
            this.clearEntryGraphicLines();

            if (window.MARKER_TIMESTAMPS) {
                window.MARKER_TIMESTAMPS.splice(0, window.MARKER_TIMESTAMPS.length, ...signals.map(signal => signal.time));
                if (window.curM !== undefined) window.curM = 0;
            }

            this.setSeriesMarkers(series, markers);
        },

        calculatePnL: function(data, signals, initialDeposit = 100, tradeAmount = 1, winCoefficient = null, options = {}) {
            this.params = syncParams(this.params);
            if (winCoefficient === null) {
                winCoefficient = Number(this.params.winPayout ?? 0.8);
            }
            const shouldLogSummary = options.logSummary !== false;
            this.tradeHistory = [];
            window.tradeHistory = this.tradeHistory;

            const balance = [];
            let currentBalance = initialDeposit;

            if (!signals || signals.length === 0) {
                for (let i = 0; i < data.length; i++) {
                    balance.push({
                        time: data[i].time,
                        value: currentBalance
                    });
                }
                window.lastBalance = balance;
                if (shouldLogSummary) {
                    log(`Баланс (без сделок): ${currentBalance.toFixed(2)}`);
                }
                return balance;
            }

            const expirationSeconds = this.getExpiration() * 60;
            const profitByCandleIndex = {};
            const useMartingale = this.params.useMartingale === true;
            const martingaleMultiplier = Math.max(1, Number(this.params.martingaleMultiplier ?? 2));
            const martingaleMaxSteps = Math.max(0, Number(this.params.martingaleMaxSteps ?? 5));
            let martingaleStep = 0;

            for (const signal of signals) {
                const entryIndex = data.findIndex(candle => candle.time === signal.time);
                if (entryIndex === -1) {
                    log(`Сигнал с временем ${signal.time} не найден в данных`);
                    continue;
                }

                const closeTime = signal.time + expirationSeconds;
                let closeIndex = -1;

                for (let i = entryIndex; i < data.length; i++) {
                    if (data[i].time >= closeTime) {
                        closeIndex = i;
                        break;
                    }
                }

                if (closeIndex === -1) {
                    closeIndex = data.length - 1;
                }

                const entryPrice = signal.price;
                const closePrice = data[closeIndex].close;

                let isWin = false;
                if (signal.type === 'buy') {
                    isWin = closePrice > entryPrice;
                } else if (signal.type === 'sell') {
                    isWin = closePrice < entryPrice;
                }

                const strength = signal.type === 'buy' ? signal.buyStrength : signal.sellStrength;
                const baseStake = (this.params.baseStake || 1) * (strength ?? 1);
                const martingaleFactor = useMartingale ? Math.pow(martingaleMultiplier, martingaleStep) : 1;
                const stake = baseStake * martingaleFactor;
                const profit = isWin ? stake * winCoefficient : -stake;

                if (!profitByCandleIndex[closeIndex]) {
                    profitByCandleIndex[closeIndex] = 0;
                }
                profitByCandleIndex[closeIndex] += profit;

                this.tradeHistory.push({
                    time: signal.time,
                    type: signal.type,
                    price: entryPrice,
                    closeTime: data[closeIndex].time,
                    closePrice: closePrice,
                    result: isWin ? 'win' : 'loss',
                    profit: profit,
                    stake,
                    martingaleStep,
                    expiration: expirationSeconds / 60
                });

                if (useMartingale) {
                    if (isWin) {
                        martingaleStep = 0;
                    } else {
                        // stopLossCnt делает паузу (freeze) в мартине при лоссе
                        const stopLossCnt = Math.max(0, Number(this.params.stopLossCnt ?? 4));
                        const stopLossPeriod = Math.max(1, Number(this.params.stopLossPeriod ?? 60));
                        
                        const stopActive = stopLossCnt > 0 && this.tradeHistory.length > 0;
                        if (stopActive) {
                            // Считаем лоссы за последний период в барах (свечах)
                            const windowStart = Math.max(0, closeIndex - stopLossPeriod);
                            const recentLosses = this.tradeHistory.filter(t => {
                                const closeIdx = data.findIndex(candle => candle.time === t.closeTime);
                                return t.result === 'loss' && closeIdx >= windowStart && closeIdx <= closeIndex;
                            }).length;
                            
                            // Если лоссов меньше stopLossCnt, увеличиваем шаг; иначе мартин замерзает
                            if (recentLosses < stopLossCnt) {
                                martingaleStep = Math.min(martingaleMaxSteps, martingaleStep + 1);
                            }
                            // Иначе шаг остаётся без изменений (freeze)
                        } else {
                            // stopLossCnt не активен, увеличиваем шаг как обычно
                            martingaleStep = Math.min(martingaleMaxSteps, martingaleStep + 1);
                        }
                    }
                }
            }

            for (let i = 0; i < data.length; i++) {
                if (profitByCandleIndex[i] !== undefined) {
                    currentBalance += profitByCandleIndex[i];
                }
                balance.push({
                    time: data[i].time,
                    value: currentBalance
                });
            }

            window.lastBalance = balance;
            const totalTrades = this.tradeHistory.length;
            const wins = this.tradeHistory.filter(t => t.result === 'win').length;
            const losses = this.tradeHistory.filter(t => t.result === 'loss').length;
            const winrate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
            if (shouldLogSummary) {
                log(`Конечный баланс: ${currentBalance.toFixed(2)} (сделок: ${totalTrades}, win: ${wins}, loss: ${losses}, winrate: ${winrate.toFixed(2)}%)`);
            }
            return balance;
        },

        testStrategy: function() {
            if (!window.data || window.data.length === 0) {
                log('Нет данных для тестирования стратегии');
                return;
            }

            log('Launch strategy ...');

            // Даем UI отрисовать лог до тяжелых синхронных расчетов
            setTimeout(() => {
                // Сохранить диапазон ДО любых операций, которые вызывают fitContent/syncAll
                const _ts = window.chartMain && window.chartMain.timeScale
                    ? window.chartMain.timeScale()
                    : null;
                const _savedRange = _ts && typeof _ts.getVisibleLogicalRange === 'function'
                    ? _ts.getVisibleLogicalRange()
                    : null;

                if (typeof window.applyAllSettings === 'function') {
                    window.applyAllSettings();
                } else {
                    log('Предупреждение: функция applyAllSettings не найдена');
                }

                // Каждый запуск бэктеста должен начинаться с чистой истории сделок,
                // иначе dealStats() в rules будет учитывать предыдущий прогон.
                this.tradeHistory = [];
                window.tradeHistory = this.tradeHistory;

                const signals = this.calculateSignals(window.data);

                window.lastSignals = signals;

                // Рассчитываем PnL ПЕРЕД отображением маркеров, чтобы знать результаты сделок
                const winPayout = this.params?.winPayout ?? 0.8;
                this.calculatePnL(window.data, signals, 100, 1, winPayout, { logSummary: true });

                // Теперь отображаем маркеры с информацией о результатах
                if (window.chartMain && window.candleSeries) {
                    this.clearSignals(window.chartMain, window.candleSeries);
                }

                if (window.chartMain && window.candleSeries) {
                    this.plotSignals(window.chartMain, window.candleSeries, signals);
                }

                if (typeof window.updateBalance === 'function') {
                    window.updateBalance();
                }

                // Восстановить диапазон: fitContent внутри updateBalance/applyAllSettings
                // сбивает позицию через syncAll
                if (_ts && _savedRange && typeof _ts.setVisibleLogicalRange === 'function') {
                    _ts.setVisibleLogicalRange(_savedRange);
                }
            }, 0);
        },

        setExpiration: function(minutes) {
            this.expiration = minutes;
            this.params = syncParams(this.params);
            this.params.expirationMinutes = minutes;
            log(`Время экспирации установлено: ${minutes} минут`);
        },

        getExpiration: function() {
            this.params = syncParams(this.params);
            return Number(this.params.expirationMinutes || this.expiration || 5);
        },

        applyStrategySettings: function(settings) {
            this.params = syncParams(this.params);
            if (applyWhitelistedSettings(this.params, settings, STRATEGY_SETTING_KEYS)) {
                log('Настройки стратегии применены');
            }
        },

        applyIndicatorSettings: function(settings) {
            this.params = syncParams(this.params);
            if (applyWhitelistedSettings(this.params, settings, INDICATOR_SETTING_KEYS)) {
                log('Настройки индикаторов применены');
            }
        },

        updateFromCore: function() {
            // Синхронизировать params с последними значениями из StrategyCore/StrategyParams
            // Это необходимо, чтобы новые значения индикаторов (bbPeriod, bbStdDev) 
            // из переопределенного strategy-params.js были доступны для renderBB и других функций
            const coreParams = createDefaultParams();
            if (coreParams && typeof coreParams === 'object') {
                this.params = { ...coreParams };
                log('Параметры синхронизированы с StrategyCore');
            }
        },

    };
})();