// strategy-editor.js
// Strategy code editor and setting sync with indicator checkboxes.

(function() {
    'use strict';

    function log(message) {
        if (typeof window.addLog === 'function') {
            window.addLog(message);
        }
    }

    function syncIndicatorSelectionFromStrategyParams() {
        const checkbox = document.querySelector('#indicator-menu input[data-id="BB"]');
        if (checkbox && !checkbox.checked) {
            checkbox.checked = true;
            window.toggleIndicator('BB', true);
        }
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

    function getEditor() {
        return document.getElementById('strategy-code-editor');
    }

    function getSelectedEditorFile() {
        return 'strategy-params.js';
    }

    function getSourceCache() {
        if (!window.__strategySourceByFile || typeof window.__strategySourceByFile !== 'object') {
            window.__strategySourceByFile = {};
        }
        return window.__strategySourceByFile;
    }

    function validateAppliedFile(fileName) {
        if (fileName === 'strategy-params.js') {
            return window.StrategyParams && typeof window.StrategyParams.getDefaultParams === 'function';
        }
        return true;
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
            })
            .catch(err => {
                log('Не удалось загрузить файл ' + fileName + ': ' + err.message);
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
            return;
        }

        const fileName = getSelectedEditorFile();
        const sourceCache = getSourceCache();
        const previousDefaults = window.StrategyParams;
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
                window.StrategyParams = previousDefaults;
                window.__strategySourceByFile = previousCache;
                log('Ошибка: код не прошел проверку для файла ' + fileName);
            }
        } catch (err) {
            window.StrategyParams = previousDefaults;
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
        applyAllSettings
    };

    window.loadStrategyCode = loadStrategyCode;
    window.applyStrategyCode = applyStrategyCode;
    window.resetStrategyCode = resetStrategyCode;
    window.applyAllSettings = applyAllSettings;

    document.addEventListener('DOMContentLoaded', function() {
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
