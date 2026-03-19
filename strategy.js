// strategy.js
// Оркестрация стратегии: запуск теста, маркеры, PnL и связь с UI

(function() {
    'use strict';

    const FALLBACK_PARAMS = {
        useBB: true,
        useMACD: true,
        bbPeriod: 20,
        bbStdDev: 2,
        macdFast: 12,
        macdSlow: 26,
        macdSignal: 9,
        flatWidthLookback: 20,
        squeezeWidthFactor: 0.75,
        expirationMinutes: 5,
        winPayout: 0.8,
        baseStake: 1,
        rules: '',
        filterTradingHours: false
    };

    const STRATEGY_SETTING_KEYS = [
        'expirationMinutes',
        'winPayout',
        'baseStake',
        'rules',
        'filterTradingHours'
    ];

    const INDICATOR_SETTING_KEYS = [
        'bbPeriod',
        'bbStdDev',
        'macdFast',
        'macdSlow',
        'macdSignal',
        'flatWidthLookback',
        'squeezeWidthFactor'
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
        const core = getCore();
        if (core && typeof core.getDefaultParams === 'function') {
            return core.getDefaultParams();
        }
        return { ...FALLBACK_PARAMS };
    }

    function syncParams(params) {
        return { ...createDefaultParams(), ...(params || {}) };
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
                log(`Данные для стратегии: ${data.length} свечей`);

                if (window.debugLog) {
                    log('Отладочный лог включен для calculateSignals');
                }

                const indicators = core.calculateIndicators(data, this.params);
                if (!indicators) {
                    return [];
                }

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
            const markers = signals.map(signal => ({
                time: signal.time,
                position: signal.type === 'buy' ? 'belowBar' : 'aboveBar',
                color: signal.type === 'buy' ? '#26a69a' : '#ef5350',
                shape: signal.type === 'buy' ? 'arrowUp' : 'arrowDown',
                text: signal.type === 'buy' ? 'BUY' : 'SELL'
            }));

            if (window.MARKER_TIMESTAMPS) {
                window.MARKER_TIMESTAMPS.splice(0, window.MARKER_TIMESTAMPS.length, ...signals.map(signal => signal.time));
                if (window.curM !== undefined) window.curM = 0;
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
                const stake = (this.params.baseStake || 1) * (strength ?? 1);
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
                    expiration: expirationSeconds / 60
                });
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

            if (typeof window.applyAllSettings === 'function') {
                window.applyAllSettings();
            } else {
                log('Предупреждение: функция applyAllSettings не найдена');
            }

            log('Launch strategy ...');
            const signals = this.calculateSignals(window.data);

            if (window.chartMain && window.candleSeries) {
                this.clearSignals(window.chartMain, window.candleSeries);
            }

            if (window.chartMain && window.candleSeries) {
                this.plotSignals(window.chartMain, window.candleSeries, signals);
            }

            window.lastSignals = signals;

            // Log strategy summary (including winrate) right after test run / Apply.
            const winPayout = this.params?.winPayout ?? 0.8;
            this.calculatePnL(window.data, signals, 100, 1, winPayout, { logSummary: true });

            if (typeof window.updateBalance === 'function') {
                window.updateBalance();
            }
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
            this.params = createDefaultParams();
            log('StrategyCore обновлён, параметры загружены из нового ядра');
        }
    };
})();