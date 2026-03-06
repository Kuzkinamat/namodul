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
        oversold: 15
    },

    // Вычислить сигналы на основе данных
    calculateSignals: function(data) {
        try {
            if (!data || data.length < 30) {
                console.warn('Недостаточно данных для расчета сигналов');
                addLog('Недостаточно данных для расчета сигналов (нужно минимум 30 свечей)');
                return [];
            }
            addLog(`Данные для стратегии: ${data.length} свечей`);

            // Проверить наличие функций индикаторов
            if (typeof window.calcMACD !== 'function') {
                addLog('Ошибка: функция calcMACD не найдена');
                return [];
            }
            if (typeof window.calcStochastic !== 'function') {
                addLog('Ошибка: функция calcStochastic не найдена');
                return [];
            }

            // Рассчитать индикаторы
            addLog('Расчет MACD...');
            const macdData = window.calcMACD(data, this.params.macdFast, this.params.macdSlow, this.params.macdSignal);
            addLog('Расчет Stochastic...');
            const stochasticData = window.calcStochastic(data, this.params.stochasticK, this.params.stochasticD, this.params.stochasticSlowing);

            // Проверить соответствие длин
            if (macdData.length !== data.length || stochasticData.length !== data.length) {
                console.error('Длины данных индикаторов не совпадают');
                addLog(`Ошибка: длины индикаторов не совпадают с данными (MACD: ${macdData.length}, Stochastic: ${stochasticData.length}, данные: ${data.length})`);
                return [];
            }

            // Логирование информации об индикаторах
            const macdNonNull = macdData.filter(d => d.macd !== null).length;
            const stochNonNull = stochasticData.filter(d => d.k !== null && d.d !== null).length;
            addLog(`MACD не-null: ${macdNonNull}, Stochastic не-null: ${stochNonNull}`);

            const signals = [];

            // Анализ начиная с достаточного количества баров
            for (let i = 1; i < data.length; i++) {
                const prevMacd = macdData[i - 1];
                const currMacd = macdData[i];
                const prevStoch = stochasticData[i - 1];
                const currStoch = stochasticData[i];

                // Пропустить если нет значений
                if (currMacd.macd === null || currStoch.k === null || currStoch.d === null) continue;

                // Условия для LONG
                const macdAboveZero = currMacd.macd > 0;
                const macdHistogramRising = currMacd.histogram > prevMacd.histogram && prevMacd.histogram < 0;
                const stochasticOversold = currStoch.k < this.params.oversold && currStoch.d < this.params.oversold;
                const stochasticCrossUp = prevStoch.k < prevStoch.d && currStoch.k > currStoch.d;

                const longCondition = (macdAboveZero || macdHistogramRising) && stochasticOversold && stochasticCrossUp;

                // Условия для SHORT
                const macdBelowZero = currMacd.macd < 0;
                const macdHistogramFalling = currMacd.histogram < prevMacd.histogram && prevMacd.histogram > 0;
                const stochasticOverbought = currStoch.k > this.params.overbought && currStoch.d > this.params.overbought;
                const stochasticCrossDown = prevStoch.k > prevStoch.d && currStoch.k < currStoch.d;

                const shortCondition = (macdBelowZero || macdHistogramFalling) && stochasticOverbought && stochasticCrossDown;

                if (longCondition) {
                    signals.push({
                        time: data[i].time,
                        type: 'buy',
                        price: data[i].close,
                        macd: currMacd.macd,
                        stochasticK: currStoch.k,
                        stochasticD: currStoch.d
                    });
                } else if (shortCondition) {
                    signals.push({
                        time: data[i].time,
                        type: 'sell',
                        price: data[i].close,
                        macd: currMacd.macd,
                        stochasticK: currStoch.k,
                        stochasticD: currStoch.d
                    });
                }
            }

            addLog(`Рассчитано сигналов: ${signals.length}`);
            return signals;
        } catch (error) {
            console.error('Ошибка в calculateSignals:', error);
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
            window.MARKER_TIMESTAMPS = [];
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
            window.MARKER_TIMESTAMPS = signals.map(s => s.time);
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
                console.warn(`Сигнал с временем ${signal.time} не найден в данных`);
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
        return balance;
    },

    // Запустить тест стратегии на текущих данных
    testStrategy: function() {
        if (!window.data || window.data.length === 0) {
            addLog('Нет данных для тестирования стратегии');
            return;
        }

        addLog('Запуск теста стратегии MACD + Stochastic...');
        const signals = this.calculateSignals(window.data);
        addLog(`Найдено сигналов: ${signals.length}`);


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
    }
};

// Инициализация по умолчанию
window.Strategy.setExpiration(5);