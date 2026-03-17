// strategy-editor.js
// Strategy code editor and setting sync with indicator checkboxes.

(function() {
    'use strict';

    const helperTemplates = [
        {
            id: 'buy-breakout',
            title: 'BUY: breakout below lower BB',
            insert: 'buyCondition: "close < bbLower"',
            wrapPrefix: '(',
            wrapSuffix: ') && close < bbLower'
        },
        {
            id: 'sell-breakout',
            title: 'SELL: breakout above upper BB',
            insert: 'sellCondition: "close > bbUpper"',
            wrapPrefix: '(',
            wrapSuffix: ') && close > bbUpper'
        },
        {
            id: 'hour-filter',
            title: 'Condition: trading hours only',
            insert: 'filterTradingHours: true',
            wrapPrefix: '(',
            wrapSuffix: ') && data[i].isTradingHour !== false'
        },
        {
            id: 'deals-safe',
            title: 'Condition: enough win rate',
            insert: 'dealStats(10).winRate >= 0.55',
            wrapPrefix: '(',
            wrapSuffix: ') && dealStats(10).winRate >= 0.55'
        },
        {
            id: 'bb-params',
            title: 'Params: Bollinger defaults',
            insert: 'useBB: true,\nbbPeriod: 20,\nbbStdDev: 2',
            wrapPrefix: '',
            wrapSuffix: ''
        }
    ];

    function log(message) {
        if (typeof window.addLog === 'function') {
            window.addLog(message);
        }
    }

    function syncIndicatorSelectionFromStrategyParams() {
        const strategyParams = window.Strategy && window.Strategy.params ? window.Strategy.params : {};
        const map = {
            BB: Boolean(strategyParams.useBB)
        };

        Object.keys(map).forEach(indicatorId => {
            const checkbox = document.querySelector(`#indicator-menu input[data-id="${indicatorId}"]`);
            if (checkbox) {
                checkbox.checked = false;
            }
            window.toggleIndicator(indicatorId, false);
        });

        Object.entries(map).forEach(([indicatorId, isEnabled]) => {
            if (!isEnabled) {
                return;
            }

            const checkbox = document.querySelector(`#indicator-menu input[data-id="${indicatorId}"]`);
            if (checkbox) {
                checkbox.checked = true;
            }
            window.toggleIndicator(indicatorId, true);
        });
    }

    function refreshActiveIndicators(options = {}) {
        const includeBalance = options.includeBalance !== false;
        const checkboxes = document.querySelectorAll('#indicator-menu input[type="checkbox"]');
        if (!checkboxes.length) {
            return;
        }

        checkboxes.forEach(cb => {
            if (!cb.checked) {
                return;
            }

            const indicatorId = cb.getAttribute('data-id');
            if (!indicatorId) {
                return;
            }

            if (indicatorId === 'Balance') {
                if (!includeBalance) {
                    return;
                }
                window.toggleBalance(true);
                return;
            }

            window.toggleIndicator(indicatorId, true);
        });

        if (typeof window.updateIndicatorValues === 'function') {
            window.updateIndicatorValues();
        }
    }

    function updateStrategyCodeStatus(message, type) {
        // Status line is intentionally disabled.
        void message;
        void type;
    }

    function getEditor() {
        return document.getElementById('strategy-code-editor');
    }

    function getHelperTemplate() {
        const select = document.getElementById('strategy-helper-template');
        if (!select) {
            return helperTemplates[0];
        }
        return helperTemplates.find(item => item.id === select.value) || helperTemplates[0];
    }

    function getSelectedEditorFile() {
        const select = document.getElementById('strategy-editor-target');
        if (!select || !select.value) {
            return 'strategy-params.js';
        }
        return select.value;
    }

    function getSourceCache() {
        if (!window.__strategySourceByFile || typeof window.__strategySourceByFile !== 'object') {
            window.__strategySourceByFile = {};
        }
        return window.__strategySourceByFile;
    }

    function validateAppliedFile(fileName) {
        if (fileName === 'strategy-core.js') {
            return window.StrategyCore && typeof window.StrategyCore.createConditionContext === 'function';
        }
        if (fileName === 'strategy-params.js') {
            return window.StrategyParams && typeof window.StrategyParams.getDefaultParams === 'function';
        }
        if (fileName === 'strategy-core-context.js') {
            return window.StrategyCoreContext && typeof window.StrategyCoreContext.createConditionContext === 'function';
        }
        if (fileName === 'strategy-core-signals.js') {
            return window.StrategyCoreSignals && typeof window.StrategyCoreSignals.calculateSignals === 'function';
        }
        return true;
    }

    function setEditorSelection(editor, start, end) {
        editor.focus();
        editor.selectionStart = start;
        editor.selectionEnd = end;
    }

    function insertTextAtCursor(text) {
        const editor = getEditor();
        if (!editor) {
            log('Ошибка: текстовое поле strategy-code-editor не найдено');
            return;
        }

        const start = editor.selectionStart || 0;
        const end = editor.selectionEnd || 0;
        const current = editor.value || '';
        const before = current.slice(0, start);
        const after = current.slice(end);
        const needsBreak = before && !before.endsWith('\n');
        const insertion = (needsBreak ? '\n' : '') + text;

        editor.value = before + insertion + after;
        const caret = before.length + insertion.length;
        setEditorSelection(editor, caret, caret);
    }

    function wrapSelectedText(prefix, suffix) {
        const editor = getEditor();
        if (!editor) {
            log('Ошибка: текстовое поле strategy-code-editor не найдено');
            return;
        }

        const start = editor.selectionStart || 0;
        const end = editor.selectionEnd || 0;
        if (start === end) {
            log('Выделите выражение для обертки');
            return;
        }

        const current = editor.value || '';
        const selected = current.slice(start, end);
        const replaced = `${prefix}${selected}${suffix}`;

        editor.value = current.slice(0, start) + replaced + current.slice(end);
        setEditorSelection(editor, start, start + replaced.length);
    }

    function strategyInsertTemplate() {
        const item = getHelperTemplate();
        insertTextAtCursor(item.insert);
        log('Шаблон вставлен: ' + item.title);
    }

    function strategyWrapSelection() {
        const item = getHelperTemplate();
        if (!item.wrapPrefix && !item.wrapSuffix) {
            log('Для этого шаблона доступна только вставка');
            return;
        }
        wrapSelectedText(item.wrapPrefix, item.wrapSuffix);
        log('Выражение расширено шаблоном: ' + item.title);
    }

    function initHelperUi() {
        const select = document.getElementById('strategy-helper-template');
        if (!select) {
            return;
        }

        select.innerHTML = '';
        helperTemplates.forEach(function(item) {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.title;
            select.appendChild(option);
        });
    }

    function loadStrategyCode(options = {}) {
        const editor = document.getElementById('strategy-code-editor');
        if (!editor) {
            log('Ошибка: текстовое поле strategy-code-editor не найдено');
            return;
        }

        const fileName = getSelectedEditorFile();
        const sourceCache = getSourceCache();
        const forceReload = options.forceReload === true;
        if (!forceReload && sourceCache[fileName]) {
            editor.value = sourceCache[fileName];
            log('Код загружен из памяти: ' + fileName);
            updateStrategyCodeStatus('Код загружен из памяти', 'info');
            return;
        }

        const sourceUrl = forceReload
            ? ('./' + fileName + '?v=' + Date.now())
            : ('./' + fileName);

        fetch(sourceUrl, { cache: 'no-store' })
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.text();
            })
            .then(text => {
                sourceCache[fileName] = text;
                window.__strategyCoreSource = text;
                editor.value = text;
                log('Код загружен из файла: ' + fileName);
                updateStrategyCodeStatus('Код загружен из файла', 'success');
            })
            .catch(err => {
                log('Не удалось загрузить файл ' + fileName + ': ' + err.message);
                updateStrategyCodeStatus('Ошибка загрузки', 'error');
            });
    }

    function applyStrategyCode() {
        const editor = document.getElementById('strategy-code-editor');
        if (!editor) {
            log('Ошибка: текстовое поле strategy-code-editor не найдено');
            return;
        }

        const code = editor.value.trim();
        if (!code) {
            log('Код стратегии пуст');
            updateStrategyCodeStatus('Код пуст', 'warning');
            return;
        }

        const fileName = getSelectedEditorFile();
        const sourceCache = getSourceCache();
        const previousCore = window.StrategyCore;
        const previousDefaults = window.StrategyParams;
        const previousContext = window.StrategyCoreContext;
        const previousSignals = window.StrategyCoreSignals;
        const previousIndicators = window.StrategyCoreIndicators;
        const previousCache = { ...sourceCache };

        try {
            const execute = new Function(code);
            execute();

            if (validateAppliedFile(fileName)) {
                sourceCache[fileName] = code;
                window.__strategyCoreSource = code;
                log('Код успешно применён: ' + fileName);

                if (window.Strategy && window.Strategy.updateFromCore) {
                    window.Strategy.updateFromCore();
                }

                syncIndicatorSelectionFromStrategyParams();

                if (window.Strategy && typeof window.Strategy.testStrategy === 'function') {
                    const chart = window.chartMain;
                    const ts = chart && typeof chart.timeScale === 'function' ? chart.timeScale() : null;
                    const previousRange = ts && typeof ts.getVisibleLogicalRange === 'function'
                        ? ts.getVisibleLogicalRange()
                        : null;

                    window.Strategy.testStrategy();

                    if (ts && previousRange && typeof ts.setVisibleLogicalRange === 'function') {
                        ts.setVisibleLogicalRange(previousRange);
                    }

                    log('Перерисовка и пересчёт выполнены по Apply');
                } else if (window.data && window.data.length > 0) {
                    refreshActiveIndicators();
                }
            } else {
                window.StrategyCore = previousCore;
                window.StrategyParams = previousDefaults;
                window.StrategyCoreContext = previousContext;
                window.StrategyCoreSignals = previousSignals;
                window.StrategyCoreIndicators = previousIndicators;
                window.__strategySourceByFile = previousCache;
                log('Ошибка: код не прошел проверку для файла ' + fileName);
            }
        } catch (err) {
            window.StrategyCore = previousCore;
            window.StrategyParams = previousDefaults;
            window.StrategyCoreContext = previousContext;
            window.StrategyCoreSignals = previousSignals;
            window.StrategyCoreIndicators = previousIndicators;
            window.__strategySourceByFile = previousCache;
            log('Ошибка выполнения кода: ' + err.message);
        }
    }

    function resetStrategyCode() {
        const editor = document.getElementById('strategy-code-editor');
        if (!editor) {
            log('Ошибка: текстовое поле strategy-code-editor не найдено');
            return;
        }

        const fileName = getSelectedEditorFile();
        const sourceCache = getSourceCache();
        delete sourceCache[fileName];
        loadStrategyCode({ forceReload: true });
        log('Код сброшен к исходному файлу: ' + fileName);
    }

    function applyAllSettings() {
        refreshActiveIndicators({ includeBalance: false });
    }

    window.StrategyEditor = {
        syncIndicatorSelectionFromStrategyParams,
        refreshActiveIndicators,
        loadStrategyCode,
        applyStrategyCode,
        resetStrategyCode,
        applyAllSettings,
        strategyInsertTemplate,
        strategyWrapSelection
    };

    window.loadStrategyCode = loadStrategyCode;
    window.applyStrategyCode = applyStrategyCode;
    window.resetStrategyCode = resetStrategyCode;
    window.applyAllSettings = applyAllSettings;
    window.strategyInsertTemplate = strategyInsertTemplate;
    window.strategyWrapSelection = strategyWrapSelection;

    document.addEventListener('DOMContentLoaded', function() {
        initHelperUi();
        loadStrategyCode({ forceReload: true });

        setTimeout(function() {
            const panel = document.getElementById('settings-panel');
            if (!panel) {
                return;
            }

            const observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    if (mutation.attributeName === 'class' && panel.classList.contains('open')) {
                        loadStrategyCode({ forceReload: true });
                    }
                });
            });

            observer.observe(panel, { attributes: true });
        }, 500);
    });
})();
