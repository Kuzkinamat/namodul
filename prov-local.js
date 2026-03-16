// prov-local.js
// Local Data Provider (загрузка данных из ES-модулей)

window.LocalJsProvider = {
    // Кэш загруженных модулей: { [modulePath]: { pair, timeframe, data } }
    _moduleCache: {},

    // Список известных модулей данных (можно расширить)
    _knownModules: [
        { path: './EURUSD_M5_data.js', pair: 'EUR/USD', timeframe: '5m' },
        { path: './CADCHF_M5_data.js', pair: 'CAD/CHF', timeframe: '5m' },
        { path: './AUDCAD_M5_data.js', pair: 'AUD/CAD', timeframe: '5m' }
    ],

    /**
     * Загружает модуль по пути и возвращает данные.
     * Использует динамический import().
     */
    async _loadModule(modulePath) {
        if (this._moduleCache[modulePath]) {
            return this._moduleCache[modulePath];
        }
        try {
            const module = await import(modulePath);
            // Отладочный вывод полного модуля
            console.log('Module object keys:', Object.keys(module));
            console.log('Module.default:', module.default);
            // Ожидаем, что модуль экспортирует default как массив свечей
            const data = module.default;
            // Отладочный вывод
            console.log('Loaded module:', modulePath, 'data type:', typeof data, 'isArray:', Array.isArray(data), 'data sample:', data ? data.slice(0,1) : null);
            if (!Array.isArray(data)) {
                throw new Error(`Модуль ${modulePath} не экспортирует массив данных (тип: ${typeof data})`);
            }
            // Найти пару и таймфрейм из известных или извлечь из имени файла
            const known = this._knownModules.find(m => m.path === modulePath);
            let pair = known ? known.pair : '';
            let timeframe = known ? known.timeframe : '1m';
            if (!pair) {
                // Извлечь из имени файла (например, EURUSD_M5_data.js)
                const basename = modulePath.split('/').pop().replace('_data.js', '');
                pair = this._extractPair(basename);
                timeframe = this._extractTimeframe(basename);
            }
            const cached = { pair, timeframe, data };
            this._moduleCache[modulePath] = cached;
            return cached;
        } catch (importErr) {
            console.warn('Dynamic import failed, falling back to global variable:', importErr.message);
            // Попробовать получить данные из глобальной переменной (для обратной совместимости)
            const basename = modulePath.split('/').pop().replace('_data.js', '');
            const globalVarName = basename + '_data';
            if (window[globalVarName] && Array.isArray(window[globalVarName])) {
                addLog(`Используются глобальные данные из ${globalVarName}`);
                const data = window[globalVarName];
                const known = this._knownModules.find(m => m.path === modulePath);
                let pair = known ? known.pair : '';
                let timeframe = known ? known.timeframe : '1m';
                if (!pair) {
                    pair = this._extractPair(basename);
                    timeframe = this._extractTimeframe(basename);
                }
                const cached = { pair, timeframe, data };
                this._moduleCache[modulePath] = cached;
                return cached;
            }
            addLog(`Ошибка загрузки модуля ${modulePath}: ${importErr.message}`);
            throw importErr;
        }
    },

    /**
     * Извлекает пару из базового имени (например, EURUSD_M5 -> EUR/USD)
     */
    _extractPair(basename) {
        // Удалить суффикс таймфрейма
        const withoutTF = basename.replace(/_[MHDW]\d+$/, '');
        if (withoutTF.length === 6 && !withoutTF.includes('/')) {
            return withoutTF.slice(0,3) + '/' + withoutTF.slice(3);
        }
        return withoutTF;
    },

    /**
     * Извлекает таймфрейм из базового имени (например, EURUSD_M5 -> 5m)
     */
    _extractTimeframe(basename) {
        const tfMatch = basename.match(/_([MHDW])(\d+)$/);
        if (tfMatch) {
            const type = tfMatch[1];
            const num = parseInt(tfMatch[2]);
            if (type === 'M') return num + 'm';
            else if (type === 'H') return num + 'H';
            else if (type === 'D') return num + 'D';
            else if (type === 'W') return num + 'W';
            else if (type === 'MN') return num + 'M';
        }
        return '1m';
    },

    /**
     * Сканирует все известные модули и возвращает массив datasets.
     */
    async scanModules() {
        const datasets = [];
        for (const mod of this._knownModules) {
            try {
                const cached = await this._loadModule(mod.path);
                datasets.push({
                    variable: mod.path,
                    pair: cached.pair,
                    timeframe: cached.timeframe,
                    data: cached.data
                });
            } catch (err) {
                // Пропустить модуль, который не загрузился
                continue;
            }
        }
        // Также сканируем глобальные переменные для обратной совместимости (опционально)
        // Можно оставить, но по требованию убираем.
        return datasets;
    },

    /**
     * Получить список доступных торговых пар (уникальные)
     */
    async getPairs() {
        const datasets = await this.scanModules();
        const pairs = [...new Set(datasets.map(d => d.pair))];
        return pairs;
    },

    /**
     * Получить пары, отфильтрованные по таймфрейму (если таймфрейм выбран)
     */
    async getPairsByTimeframe(timeframe) {
        const datasets = await this.scanModules();
        return datasets.filter(d => d.timeframe === timeframe).map(d => d.pair);
    },

    /**
     * Запрос доступа (всегда успешен для локальных данных)
     */
    async requestAccess() {
        addLog("Local data provider initialized (ES modules).");
        return true;
    },

    /**
     * Загрузить данные для конкретной пары, таймфрейма и диапазона.
     * Возвращает последние N свечей, где N = DataUtils.calculateOutputSize(range, timeframe).
     */
    async fetchData(range, timeframe, pair) {
        addLog(`Loading local data: ${pair}, Timeframe: ${timeframe}, Range: ${range}`);
        const datasets = await this.scanModules();
        // Логирование доступных наборов данных для отладки
        if (datasets.length === 0) {
            addLog(`No local data modules found.`);
        } else {
            addLog(`Available datasets: ${datasets.map(d => `${d.pair} (${d.timeframe})`).join(', ')}`);
        }
        const dataset = datasets.find(d => d.pair === pair && d.timeframe === timeframe);
        if (!dataset) {
            addLog(`No data for ${pair} - ${timeframe}`);
            throw new Error(`No local data found for ${pair} (TF: ${timeframe})`);
        }
        // Вычислить, сколько свечей нужно на основе диапазона и таймфрейма
        const outputSize = window.DataUtils.calculateOutputSize(range, timeframe);
        // Вернуть последние 'outputSize' свечей (или все, если набор меньше)
        const sliceStart = Math.max(0, dataset.data.length - outputSize);
        const slicedData = dataset.data.slice(sliceStart);
        addLog(`Local data sliced: ${dataset.data.length} -> ${slicedData.length} candles (Range: ${range})`);
        // Вернуть копию, чтобы избежать мутаций
        return slicedData.slice();
    }
};