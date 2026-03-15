// Тест интеграции StrategyCore и Strategy
const fs = require('fs');
const vm = require('vm');

console.log('=== Тест интеграции StrategyCore и Strategy ===');

// Загружаем файлы
let strategyCoreContent, strategyContent, mainContent;
try {
    strategyCoreContent = fs.readFileSync('./strategy_core.js', 'utf8');
    strategyContent = fs.readFileSync('./strategy.js', 'utf8');
    mainContent = fs.readFileSync('./main.js', 'utf8');
    console.log('Файлы успешно прочитаны.');
} catch (err) {
    console.error('Ошибка чтения файлов:', err.message);
    process.exit(1);
}

// Создаём контекст, имитирующий браузерное окружение
const context = {
    window: {},
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    addLog: (msg) => console.log('[LOG]', msg),
    LightweightCharts: { // заглушка
        createChart: () => ({ 
            addSeries: () => ({}),
            timeScale: () => ({ 
                subscribeVisibleLogicalRangeChange: () => {},
                getVisibleLogicalRange: () => ({ from: 0, to: 100 }),
                setVisibleLogicalRange: () => {},
                fitContent: () => {}
            }),
            resize: () => {}
        }),
        CrosshairMode: { Hidden: 0 },
        CandlestickSeries: {},
        LineSeries: {},
        HistogramSeries: {},
        createSeriesMarkers: () => ({ setMarkers: () => {} })
    },
    calcMACD: () => [],
    calcStochastic: () => [],
    calcSMA: () => [],
    calcBB: () => [],
    data: [],
    MARKER_TIMESTAMPS: [],
    curM: 0,
    debugLog: false
};
context.window = context;
const sandbox = vm.createContext(context);

// Выполняем strategy_core.js
try {
    vm.runInContext(strategyCoreContent, sandbox);
    console.log('strategy_core.js выполнен успешно.');
    if (sandbox.window.StrategyCore) {
        console.log('StrategyCore создан:', Object.keys(sandbox.window.StrategyCore));
    } else {
        console.error('StrategyCore не создан!');
        process.exit(1);
    }
} catch (err) {
    console.error('Ошибка выполнения strategy_core.js:', err);
    process.exit(1);
}

// Выполняем strategy.js
try {
    vm.runInContext(strategyContent, sandbox);
    console.log('strategy.js выполнен успешно.');
    if (sandbox.window.Strategy) {
        console.log('Strategy создан:', Object.keys(sandbox.window.Strategy));
    } else {
        console.error('Strategy не создан!');
        process.exit(1);
    }
} catch (err) {
    console.error('Ошибка выполнения strategy.js:', err);
    process.exit(1);
}

// Проверяем интеграцию
const Strategy = sandbox.window.Strategy;
const StrategyCore = sandbox.window.StrategyCore;

// Тест 1: createConditionContext
console.log('\n--- Тест createConditionContext ---');
const mockData = [{ time: 1, close: 100, open: 95, high: 105, low: 90 }];
const mockIndicators = {
    macd: [{ macd: 0.5, signal: 0.3, histogram: 0.2 }],
    stochastic: [{ k: 30, d: 25 }],
    sma: [{ value: 98 }],
    bb: [{ upper: 110, middle: 100, lower: 90 }]
};
const context1 = Strategy.createConditionContext(0, mockData, mockIndicators, []);
console.log('Контекст создан:', context1);
if (context1.close === 100 && context1.macd === 0.5) {
    console.log('✓ Контекст корректный');
} else {
    console.log('✗ Контекст некорректный');
}

// Тест 2: evaluateCondition
console.log('\n--- Тест evaluateCondition ---');
const condition = 'close > 95';
const result = Strategy.evaluateCondition(condition, context1);
console.log(`Условие "${condition}" = ${result}`);
if (result === true) {
    console.log('✓ Условие выполнено корректно');
} else {
    console.log('✗ Ошибка оценки условия');
}

// Тест 3: calculateSignals (с пустыми данными)
console.log('\n--- Тест calculateSignals (без данных) ---');
const emptySignals = Strategy.calculateSignals([]);
console.log('Сигналы для пустых данных:', emptySignals);
if (Array.isArray(emptySignals) && emptySignals.length === 0) {
    console.log('✓ Корректная обработка пустых данных');
} else {
    console.log('✗ Неверная обработка пустых данных');
}

// Тест 4: обновление StrategyCore через applyStrategyCode (имитация)
console.log('\n--- Тест обновления StrategyCore ---');
const newCode = `
window.StrategyCore = {
    createConditionContext: function(i, data, indicators, tradeHistory) {
        return { test: 'updated' };
    },
    evaluateCondition: function(cond, ctx) { return true; },
    calculateSignals: function(data, params, indicators) { return []; }
};
`;
try {
    vm.runInContext(newCode, sandbox);
    console.log('Код применён, StrategyCore обновлён:', Object.keys(sandbox.window.StrategyCore));
    const updatedContext = Strategy.createConditionContext(0, mockData, mockIndicators, []);
    console.log('Контекст после обновления:', updatedContext);
    if (updatedContext.test === 'updated') {
        console.log('✓ StrategyCore успешно обновлён');
    } else {
        console.log('✗ StrategyCore не обновился');
    }
} catch (err) {
    console.error('Ошибка применения кода:', err);
}

console.log('\n=== Тест завершён ===');