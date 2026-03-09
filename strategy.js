
// strategy.js
// Торговая стратегия на основе MACD и Stochastic для бинарных опционов

window.Strategy = {
    // Параметры стратегии
    params: {
        macdFast: 12,
        macdSlow: 26,
        macdSignal: 9,
        stochasticK: 14,
        stochasticD: 3,
        stochasticSlowing: 3,
        overbought: 85,
        oversold: 15,
        useMACD: true,
        useStochastic: true,
        useSMA: false,
        useBB: false,
        smaPeriod: 20,
        bbPeriod: 20,
        bbStdDev: 2,
        customCondition: '',
        buyCondition: '',
        sellCondition: ''
    },

    // История сделок (массив объектов {time, type, price, result, profit})
    tradeHistory: [],

    // Создать контекст для оценки условия
    createConditionContext: function(i, data, indicators, tradeHistory) {
        // indicators - объект с массивами индикаторов
        // tradeHistory - массив истории сделок (можно передать this.tradeHistory)
        const macdObj = indicators.macd && indicators.macd[i] ? indicators.macd[i] : { macd: null, signal: null, histogram: null };
        const stochObj = indicators.stochastic && indicators.stochastic[i] ? indicators.stochastic[i] : { k: null, d: null };
        const smaObj = indicators.sma && indicators.sma[i] ? indicators.sma[i] : { value: null };
        const bbObj = indicators.bb && indicators.bb[i] ? indicators.bb[i] : { upper: null, middle: null, lower: null };
        const candle = data[i] || { close: null, open: null, high: null, low: null };

        return {
            i: i, // текущий индекс
            data: data, // весь массив свечей
            indicators: indicators, // {macd: [...], stochastic: [...], sma: [...], bb: [...]}
            tradeHistory: tradeHistory || this.tradeHistory,
            // Прямые переменные для удобства
            macd: macdObj.macd,
            signal: macdObj.signal,
            histogram: macdObj.histogram,
            stochasticK: stochObj.k,
            stochasticD: stochObj.d,
            sma: smaObj.value,
            bbUpper: bbObj.upper,
            bbMiddle: bbObj.middle,
            bbLower: bbObj.lower,
            close: candle.close,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            // Синонимы для совместимости с маппингом
            macdVal: macdObj.macd,
            macdSignalVal: macdObj.signal,
            macdHist: macdObj.histogram,
            stochK: stochObj.k,
            stochD: stochObj.d,
            // Вспомогательные функции
            indicator: function(name, lag = 0) {
                const idx = i - lag;
                if (idx < 0) return null;
                const ind = indicators[name];
                if (!ind || !ind[idx]) return null;
                return ind[idx]; // возвращаем объект индикатора
            },
            price: function(type = 'close', lag = 0) {
                const idx = i - lag;
                if (idx < 0 || !data[idx]) return null;
                return data[idx][type];
            },
            dealStats: function(window) {
                const history = tradeHistory || this.tradeHistory;
                if (!history || history.length === 0) {
                    return { winCount: 0, lossCount: 0, totalProfit: 0, winRate: 0 };
                }
                const recent = history.slice(-window);
                const winCount = recent.filter(d => d.result === 'win').length;
                const lossCount = recent.filter(d => d.result === 'loss').length;
                const totalProfit = recent.reduce((sum, d) => sum + (d.profit || 0), 0);
                const winRate = recent.length > 0 ? winCount / recent.length : 0;
                return { winCount, lossCount, totalProfit, winRate };
            }
        };
    },

    // Оценить условие
    evaluateCondition: function(condition, context) {
        if (!condition || condition.trim() === '') {
            return true; // пустое условие всегда true
        }
        try {
            // Безопасное выполнение кода
            const func = new Function(...Object.keys(context), `return ${condition};`);
            const result = func(...Object.values(context));
            return Boolean(result);
        } catch (err) {
            addLog('Ошибка выполнения условия: ' + err.message);
            return false;
        }
    },

    // Вычислить сигналы на основе данных
    calculateSignals: function(data) {
        try {
            if (!data || data.length < 30) {
                addLog('Недостаточно данных для расчета сигналов (нужно минимум 30 свечей)');
                return [];
            }
            addLog(`Данные для стратегии: ${data.length} свечей`);
            // Включить отладочный лог
            const debug = window.debugLog || false;
            if (debug) {
                addLog('Отладочный лог включен для calculateSignals');
            }

            // Рассчитать индикаторы в зависимости от настроек
            let macdData = [];
            let stochasticData = [];
            let smaData = [];
            let bbData = [];

            if (this.params.useMACD) {
                if (typeof window.calcMACD !== 'function') {
                    addLog('Ошибка: функция calcMACD не найдена');
                    return [];
                }
                addLog('Расчет MACD...');
                macdData = window.calcMACD(data, this.params.macdFast, this.params.macdSlow, this.params.macdSignal);
                if (macdData.length !== data.length) {
                    addLog(`Ошибка: длина MACD (${macdData.length}) не совпадает с данными (${data.length})`);
                    return [];
                }
            }

            if (this.params.useStochastic) {
                if (typeof window.calcStochastic !== 'function') {
                    addLog('Ошибка: функция calcStochastic не найдена');
                    return [];
                }
                addLog('Расчет Stochastic...');
                stochasticData = window.calcStochastic(data, this.params.stochasticK, this.params.stochasticD, this.params.stochasticSlowing);
                if (stochasticData.length !== data.length) {
                    addLog(`Ошибка: длина Stochastic (${stochasticData.length}) не совпадает с данными (${data.length})`);
                    return [];
                }
            }

            if (this.params.useSMA) {
                if (typeof window.calcSMA !== 'function') {
                    addLog('Ошибка: функция calcSMA не найдена');
                    return [];
                }
                addLog('Расчет SMA...');
                smaData = window.calcSMA(data, this.params.smaPeriod);
            }

            if (this.params.useBB) {
                if (typeof window.calcBB !== 'function') {
                    addLog('Ошибка: функция calcBB не найдена');
                    return [];
                }
                addLog('Расчет Bollinger Bands...');
                bbData = window.calcBB(data, this.params.bbPeriod, this.params.bbStdDev);
            }

            // Создать объект индикаторов для передачи в контекст
            const indicators = {
                macd: macdData,
                stochastic: stochasticData,
                sma: smaData,
                bb: bbData
            };

            const signals = [];

            // Анализ начиная с достаточного количества баров
            for (let i = 1; i < data.length; i++) {
                let longConditions = [];
                let shortConditions = [];

                // Условия MACD
                if (this.params.useMACD && macdData.length > i) {
                    const prevMacd = macdData[i - 1];
                    const currMacd = macdData[i];
                    if (currMacd.macd !== null) {
                        const macdAboveZero = currMacd.macd > 0;
                        const macdHistogramRising = currMacd.histogram > prevMacd.histogram && prevMacd.histogram < 0;
                        const macdBelowZero = currMacd.macd < 0;
                        const macdHistogramFalling = currMacd.histogram < prevMacd.histogram && prevMacd.histogram > 0;
                        longConditions.push(macdAboveZero || macdHistogramRising);
                        shortConditions.push(macdBelowZero || macdHistogramFalling);
                    }
                }

                // Условия Stochastic
                if (this.params.useStochastic && stochasticData.length > i) {
                    const prevStoch = stochasticData[i - 1];
                    const currStoch = stochasticData[i];
                    if (currStoch.k !== null && currStoch.d !== null) {
                        const stochasticOversold = currStoch.k < this.params.oversold && currStoch.d < this.params.oversold;
                        const stochasticCrossUp = prevStoch.k < prevStoch.d && currStoch.k > currStoch.d;
                        const stochasticOverbought = currStoch.k > this.params.overbought && currStoch.d > this.params.overbought;
                        const stochasticCrossDown = prevStoch.k > prevStoch.d && currStoch.k < currStoch.d;
                        longConditions.push(stochasticOversold && stochasticCrossUp);
                        shortConditions.push(stochasticOverbought && stochasticCrossDown);
                    }
                }

                // Условия SMA (пример: цена выше SMA для long, ниже для short)
                if (this.params.useSMA && smaData.length > i && smaData[i].value !== null) {
                    const price = data[i].close;
                    const sma = smaData[i].value;
                    longConditions.push(price > sma);
                    shortConditions.push(price < sma);
                }

                // Условия Bollinger Bands (цена касается нижней полосы для long, верхней для short)
                if (this.params.useBB && bbData.length > i && bbData[i].lower !== null && bbData[i].upper !== null) {
                    const price = data[i].close;
                    const lower = bbData[i].lower;
                    const upper = bbData[i].upper;
                    longConditions.push(price <= lower);
                    shortConditions.push(price >= upper);
                }

                // Отладочный лог для первых 10 свечей: значения условий
                if (debug && i < 10) {
                    addLog(`i=${i}: longConditions=${JSON.stringify(longConditions)}, shortConditions=${JSON.stringify(shortConditions)}`);
                }

                // Если ни один индикатор не выбран, то сигналов нет
                if (longConditions.length === 0 && shortConditions.length === 0) {
                    continue;
                }

                // Сигнал формируется если все выбранные индикаторы дают условие
                const longSignal = longConditions.length > 0 && longConditions.every(c => c === true);
                const shortSignal = shortConditions.length > 0 && shortConditions.every(c => c === true);

                // Проверка пользовательских условий (если заданы)
                let buyConditionPass = true;
                let sellConditionPass = true;
                const buyCondition = this.params.buyCondition || this.params.customCondition;
                const sellCondition = this.params.sellCondition || this.params.customCondition;
                if (buyCondition && buyCondition.trim() !== '') {
                    const context = this.createConditionContext(i, data, indicators, this.tradeHistory);
                    buyConditionPass = this.evaluateCondition(buyCondition, context);
                }
                if (sellCondition && sellCondition.trim() !== '') {
                    const context = this.createConditionContext(i, data, indicators, this.tradeHistory);
                    sellConditionPass = this.evaluateCondition(sellCondition, context);
                }

                // Отладочный лог для первых 10 свечей
                if (debug && i < 10) {
                    addLog(`i=${i}: longSignal=${longSignal}, shortSignal=${shortSignal}, buyConditionPass=${buyConditionPass}, sellConditionPass=${sellConditionPass}`);
                    addLog(`  macd=${indicators.macd[i]?.macd}, stochasticK=${indicators.stochastic[i]?.k}, close=${data[i].close}`);
                }

                if (longSignal && buyConditionPass) {
                    signals.push({
                        time: data[i].time,
                        type: 'buy',
                        price: data[i].close,
                        macd: this.params.useMACD && macdData[i] ? macdData[i].macd : null,
                        stochasticK: this.params.useStochastic && stochasticData[i] ? stochasticData[i].k : null,
                        stochasticD: this.params.useStochastic && stochasticData[i] ? stochasticData[i].d : null
                    });
                    if (debug && i < 10) addLog(`  -> BUY сигнал добавлен`);
                } else if (shortSignal && sellConditionPass) {
                    signals.push({
                        time: data[i].time,
                        type: 'sell',
                        price: data[i].close,
                        macd: this.params.useMACD && macdData[i] ? macdData[i].macd : null,
                        stochasticK: this.params.useStochastic && stochasticData[i] ? stochasticData[i].k : null,
                        stochasticD: this.params.useStochastic && stochasticData[i] ? stochasticData[i].d : null
                    });
                    if (debug && i < 10) addLog(`  -> SELL сигнал добавлен`);
                }
            }

            addLog(`Рассчитано сигналов: ${signals.length}`);
            return signals;
        } catch (error) {
            addLog(`Ошибка расчета сигналов: ${error.message}`);
            return [];
        }
    },

    // Очистить маркеры сигналов
    clearSignals: function(chart, series) {
        if (!chart || !series) {
            return;
        }
        // Если есть сохранённый примитив маркеров, очистить его
        if (series.markerPrimitive && typeof series.markerPrimitive.setMarkers === 'function') {
            series.markerPrimitive.setMarkers([]);
            addLog('Маркеры очищены (через markerPrimitive.setMarkers)');
            // Опционально: открепить примитив
            // series.markerPrimitive.detach();
            // series.markerPrimitive = null;
        } else if (typeof series.setMarkers === 'function') {
            // Fallback на стандартный метод (если работает)
            series.setMarkers([]);
            addLog('Маркеры очищены (setMarkers)');
        } else if (window.LightweightCharts && typeof window.LightweightCharts.createSeriesMarkers === 'function') {
            // Создать новый примитив с пустыми маркерами (не рекомендуется, но как крайний вариант)
            window.LightweightCharts.createSeriesMarkers(series, []);
            addLog('Маркеры очищены (createSeriesMarkers)');
        } else {
            addLog('Не удалось очистить маркеры: нет подходящего метода');
        }
        // Очистить глобальный массив временных меток
        if (window.MARKER_TIMESTAMPS) {
            window.MARKER_TIMESTAMPS.length = 0;
            if (window.curM !== undefined) window.curM = 0;
        }
    },

    // Добавить маркеры сигналов на график через createSeriesMarkers
    plotSignals: function(chart, series, signals) {
        if (!chart || !series) {
            addLog('Ошибка: график или серия не доступны для отображения маркеров');
            return;
        }
        if (!signals || signals.length === 0) {
            addLog('Нет сигналов для отображения');
            return;
        }

        addLog(`Добавление ${signals.length} маркеров на график`);

        // Преобразовать сигналы в маркеры
        const markers = signals.map(signal => ({
            time: signal.time,
            position: signal.type === 'buy' ? 'belowBar' : 'aboveBar',
            color: signal.type === 'buy' ? '#26a69a' : '#ef5350',
            shape: signal.type === 'buy' ? 'arrowUp' : 'arrowDown',
            text: signal.type === 'buy' ? 'BUY' : 'SELL'
        }));

        // Обновить глобальный массив временных меток для навигации
        if (window.MARKER_TIMESTAMPS) {
            window.MARKER_TIMESTAMPS.splice(0, window.MARKER_TIMESTAMPS.length, ...signals.map(s => s.time));
            if (window.curM !== undefined) window.curM = 0;
        }

        // Использовать createSeriesMarkers с сохранением примитива
        if (window.LightweightCharts && typeof window.LightweightCharts.createSeriesMarkers === 'function') {
            if (series.markerPrimitive && typeof series.markerPrimitive.setMarkers === 'function') {
                // Обновить существующие маркеры
                series.markerPrimitive.setMarkers(markers);
                addLog('Маркеры обновлены через markerPrimitive.setMarkers');
            } else {
                // Создать новый примитив
                series.markerPrimitive = window.LightweightCharts.createSeriesMarkers(series, markers);
                addLog('Маркеры созданы через createSeriesMarkers (новый примитив)');
            }
        } else if (typeof series.setMarkers === 'function') {
            // Fallback на стандартный метод
            series.setMarkers(markers);
            addLog('Маркеры созданы через setMarkers');
        } else {
            addLog('Ошибка: не найден метод для отображения маркеров');
        }
    },

    // Рассчитать PnL (прибыль/убыток) для бинарных опционов на основе Expiration
    calculatePnL: function(data, signals, initialDeposit = 100, tradeAmount = 1, winCoefficient = 0.8) {
        // Очистить историю сделок перед новым расчетом
        this.tradeHistory = [];
        window.tradeHistory = this.tradeHistory; // для глобального доступа

        // Создаем массив баланса для каждого момента времени (каждой свечи)
        const balance = [];
        let currentBalance = initialDeposit;

        // Если сигналов нет, возвращаем постоянный баланс для всех свечей
        if (!signals || signals.length === 0) {
            for (let i = 0; i < data.length; i++) {
                balance.push({
                    time: data[i].time,
                    value: currentBalance
                });
            }
            addLog(`Баланс (без сделок): ${currentBalance.toFixed(2)}`);
            return balance;
        }

        // Получаем время экспирации в секундах
        const expirationSeconds = this.getExpiration() * 60;

        // Создаем карту прибылей по индексу свечи закрытия
        const profitByCandleIndex = {};

        // Для каждого сигнала определяем результат
        for (const signal of signals) {
            // Находим индекс свечи входа
            const entryIndex = data.findIndex(candle => candle.time === signal.time);
            if (entryIndex === -1) {
                addLog(`Сигнал с временем ${signal.time} не найден в данных`);
                continue;
            }

            // Время закрытия сделки
            const closeTime = signal.time + expirationSeconds;

            // Находим индекс свечи закрытия (первая свеча с time >= closeTime)
            let closeIndex = -1;
            for (let i = entryIndex; i < data.length; i++) {
                if (data[i].time >= closeTime) {
                    closeIndex = i;
                    break;
                }
            }
            // Если не нашли, используем последнюю свечу
            if (closeIndex === -1) {
                closeIndex = data.length - 1;
            }

            // Цена входа и закрытия
            const entryPrice = signal.price;
            const closePrice = data[closeIndex].close;

            // Определяем результат
            let isWin = false;
            if (signal.type === 'buy') {
                isWin = closePrice > entryPrice;
            } else if (signal.type === 'sell') {
                isWin = closePrice < entryPrice;
            }

            // Прибыль
            const profit = isWin ? tradeAmount * winCoefficient : -tradeAmount;

            // Добавляем прибыль к соответствующей свече закрытия
            if (!profitByCandleIndex[closeIndex]) {
                profitByCandleIndex[closeIndex] = 0;
            }
            profitByCandleIndex[closeIndex] += profit;

            // Добавить сделку в историю
            const trade = {
                time: signal.time,
                type: signal.type,
                price: entryPrice,
                closeTime: data[closeIndex].time,
                closePrice: closePrice,
                result: isWin ? 'win' : 'loss',
                profit: profit,
                expiration: expirationSeconds / 60 // минуты
            };
            this.tradeHistory.push(trade);

            // Логирование деталей сделки (опционально)
            // addLog(`Сделка ${signal.type} на ${new Date(signal.time * 1000).toLocaleString()}: вход ${entryPrice}, закрытие ${closePrice}, результат ${isWin ? 'win' : 'loss'}, прибыль ${profit}`);
        }

        // Строим баланс по свечам
        for (let i = 0; i < data.length; i++) {
            // Добавляем прибыль, если есть
            if (profitByCandleIndex[i] !== undefined) {
                currentBalance += profitByCandleIndex[i];
            }
            balance.push({
                time: data[i].time,
                value: currentBalance
            });
        }

        addLog(`Конечный баланс: ${currentBalance.toFixed(2)} (сделок: ${signals.length})`);
        // Логирование истории сделок
        if (this.tradeHistory.length > 0) {
            addLog(`История сделок обновлена, записей: ${this.tradeHistory.length}`);
        }
        return balance;
    },

    // Запустить тест стратегии на текущих данных
    testStrategy: function() {
        if (!window.data || window.data.length === 0) {
            addLog('Нет данных для тестирования стратегии');
            return;
        }

        // Применить все настройки из панели настроек перед запуском
        if (typeof window.applyAllSettings === 'function') {
            window.applyAllSettings();
        } else {
            addLog('Предупреждение: функция applyAllSettings не найдена');
        }

        // Включить отладочный лог для этого запуска
        addLog('Установка window.debugLog = true (текущее значение: ' + (window.debugLog ? 'true' : 'false') + ')');
        window.debugLog = true;
        addLog('Запуск теста стратегии с текущими настройками (отладка включена)...');
        const signals = this.calculateSignals(window.data);
        addLog(`Найдено сигналов: ${signals.length}`);
        // Отключить отладку после расчёта (опционально)
        // window.debugLog = false;


        // Очистить предыдущие маркеры
        if (window.chartMain && window.candleSeries) {
            this.clearSignals(window.chartMain, window.candleSeries);
        }
        // Отобразить маркеры на графике
        if (window.chartMain && window.candleSeries) {
            this.plotSignals(window.chartMain, window.candleSeries, signals);
        }

        // Сохранить сигналы для использования
        window.lastSignals = signals;
        
        // Обновить график баланса, если он активен
        if (typeof window.updateBalance === 'function') {
            window.updateBalance();
        }
    },

    // Установить время экспирации (в минутах)
    setExpiration: function(minutes) {
        this.expiration = minutes;
        addLog(`Время экспирации установлено: ${minutes} минут`);
    },

    // Получить время экспирации
    getExpiration: function() {
        return this.expiration || 5; // по умолчанию 5 минут
    },

    // Применить настройки стратегии из UI
    applyStrategySettings: function(settings) {
        if (settings.useMACD !== undefined) this.params.useMACD = settings.useMACD;
        if (settings.useStochastic !== undefined) this.params.useStochastic = settings.useStochastic;
        if (settings.useSMA !== undefined) this.params.useSMA = settings.useSMA;
        if (settings.useBB !== undefined) this.params.useBB = settings.useBB;
        if (settings.overbought !== undefined) this.params.overbought = settings.overbought;
        if (settings.oversold !== undefined) this.params.oversold = settings.oversold;
        if (settings.customCondition !== undefined) this.params.customCondition = settings.customCondition;
        if (settings.buyCondition !== undefined) this.params.buyCondition = settings.buyCondition;
        if (settings.sellCondition !== undefined) this.params.sellCondition = settings.sellCondition;
        addLog('Настройки стратегии применены');
    },

    // Применить настройки индикаторов из UI
    applyIndicatorSettings: function(settings) {
        if (settings.macdFast !== undefined) this.params.macdFast = settings.macdFast;
        if (settings.macdSlow !== undefined) this.params.macdSlow = settings.macdSlow;
        if (settings.macdSignal !== undefined) this.params.macdSignal = settings.macdSignal;
        if (settings.stochasticK !== undefined) this.params.stochasticK = settings.stochasticK;
        if (settings.stochasticD !== undefined) this.params.stochasticD = settings.stochasticD;
        if (settings.stochasticSlowing !== undefined) this.params.stochasticSlowing = settings.stochasticSlowing;
        if (settings.smaPeriod !== undefined) this.params.smaPeriod = settings.smaPeriod;
        if (settings.bbPeriod !== undefined) this.params.bbPeriod = settings.bbPeriod;
        if (settings.bbStdDev !== undefined) this.params.bbStdDev = settings.bbStdDev;
        addLog('Настройки индикаторов применены');
    },
};