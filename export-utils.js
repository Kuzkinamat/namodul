// export-utils.js - Утилиты для экспорта данных

/**
 * Экспортирует данные в CSV или JSON.
 * @param {string} format - 'csv' или 'json'
 */
window.exportData = function(format) {
    if (!window.data || window.data.length === 0) {
        addLog('Нет данных для экспорта');
        return;
    }
    let content, mime, filename;
    if (format === 'csv') {
        const headers = ['time', 'open', 'high', 'low', 'close'];
        const rows = window.data.map(d => [d.time, d.open, d.high, d.low, d.close].join(','));
        content = [headers.join(','), ...rows].join('\n');
        mime = 'text/csv';
        filename = `data-${new Date().toISOString().slice(0,10)}.csv`;
    } else if (format === 'json') {
        content = JSON.stringify(window.data, null, 2);
        mime = 'application/json';
        filename = `data-${new Date().toISOString().slice(0,10)}.json`;
    } else {
        addLog('Неизвестный формат экспорта');
        return;
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog(`Данные экспортированы в ${format.toUpperCase()}`);
};

/**
 * Экспортирует текущие значения индикаторов в CSV.
 */
window.exportIndicatorValues = function() {
    if (!window.currentIndicatorValues) {
        if (typeof window.updateIndicatorValues === 'function') {
            window.updateIndicatorValues({ force: true });
        }
    }
    if (!window.currentIndicatorValues) {
        addLog('Нет значений индикаторов для экспорта');
        return;
    }
    const headers = Object.keys(window.currentIndicatorValues);
    const row = headers.map(h => window.currentIndicatorValues[h]).join(',');
    const content = [headers.join(','), row].join('\n');
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `indicators-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog('Значения индикаторов экспортированы');
};