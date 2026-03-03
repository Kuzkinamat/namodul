window.CsvProvider = (() => {
    let directoryHandle = null;
    let files = [];
    let config = { 
        headline: true, separator: '\t', columns: [], 
        dateformat: '', timeformat: '', colMap: {} 
    };

    const parseCustomTimestamp = (dateStr, timeStr) => {
        try {
            if (config.dateformat === 'YYYYMMDD' && config.timeformat === 'HHMMSS') {
                const y = parseInt(dateStr.substring(0, 4));
                const m = parseInt(dateStr.substring(4, 6)) - 1;
                const d = parseInt(dateStr.substring(6, 8));
                const hh = timeStr ? parseInt(timeStr.substring(0, 2)) : 0;
                const mm = timeStr ? parseInt(timeStr.substring(2, 4)) : 0;
                const ss = timeStr ? parseInt(timeStr.substring(4, 6)) : 0;
                return Math.floor(Date.UTC(y, m, d, hh, mm, ss) / 1000);
            }
            let combined = timeStr ? `${dateStr}T${timeStr}` : dateStr.replace(' ', 'T');
            if (!combined.includes('Z')) combined += 'Z';
            const dt = new Date(combined);
            const ts = Math.floor(dt.getTime() / 1000);
            return isNaN(ts) ? null : ts;
        } catch (e) { return null; }
    };

    return {
        requestAccess: async () => {
            try {
                directoryHandle = await window.showDirectoryPicker();
                await window.CsvProvider._loadConfig();
                return true;
            } catch (e) { return false; }
        },

        _loadConfig: async () => {
            try {
                config.colMap = {};
                for await (const entry of directoryHandle.values()) {
                    if (entry.name === 'dataformat.txt') {
                        const file = await entry.getFile();
                        const text = await file.text();
                        text.split(/\r?\n/).forEach(line => {
                            const eqIdx = line.indexOf('=');
                            if (eqIdx === -1) return;
                            const key = line.substring(0, eqIdx).trim().toLowerCase();
                            const val = line.substring(eqIdx + 1).trim();
                            if (key === 'headline') config.headline = val === 'true';
                            if (key === 'separator') config.separator = val === '\\t' ? '\t' : val.substring(0, 1);
                            if (key === 'columns') {
                                config.columns = val.split(',').map(c => c.trim());
                                config.columns.forEach((name, idx) => config.colMap[name] = idx);
                            }
                            if (key === 'dateformat') config.dateformat = val;
                            if (key === 'timeformat') config.timeformat = val;
                        });
                    }
                }
            } catch (e) { console.error("Config error", e); }
        },

        scanFiles: async () => {
            if (!directoryHandle) return [];
            files = [];
            for await (const entry of directoryHandle.values()) {
                if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.csv')) files.push(entry);
            }
            return files.map(f => f.name);
        },

        fetchData: async (range, fileName) => {
            const fileHandle = files.find(f => f.name === fileName);
            if (!fileHandle) return [];
            const file = await fileHandle.getFile();
            const text = await file.text();
            const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
            const m = config.colMap;

            // ИСПРАВЛЕНО: Сбор данных в цепочку
            const fullData = lines.slice(config.headline ? 1 : 0)
                .map(line => {
                    const parts = line.split(config.separator);
                    if (parts.length < config.columns.length) return null;
                    const ts = parseCustomTimestamp(parts[m['date']]?.trim(), m['time'] !== undefined ? parts[m['time']]?.trim() : null);
                    if (!ts) return null;
                    return {
                        time: ts,
                        open: parseFloat(parts[m['open']]),
                        high: parseFloat(parts[m['high']]),
                        low: parseFloat(parts[m['low']]),
                        close: parseFloat(parts[m['close']])
                    };
                })
                .filter(d => d && !isNaN(d.time) && !isNaN(d.close))
                .sort((a, b) => a.time - b.time);

            if (!fullData.length) return [];

            // Фильтрация диапазона
            const lastTs = fullData[fullData.length - 1].time;
            const rangeMap = { '1D': 86400, '1W': 604800, '1M': 2592000, '1Y': 31536000 };
            const startTime = lastTs - (rangeMap[range] || 86400);

            return fullData.filter(d => d.time >= startTime);
        }
    };
})();
