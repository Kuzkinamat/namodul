#!/usr/bin/env node

/**
 * Скрипт для конвертации CSV файлов котировок в JS файлы с данными.
 * Обрабатывает все файлы с расширением .csv в текущей директории.
 * Для каждого CSV создаёт JS файл с именем [базовое_имя]_data.js,
 * содержащий ES-модуль с экспортом массива свечей по умолчанию.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Конфигурация
const CSV_EXT = '.csv';
const JS_SUFFIX = '_data.js';
const ENCODING = 'utf8';

/**
 * Парсит строку CSV в объект свечи.
 * Формат: "YYYY-MM-DD HH:MM,open,high,low,close,volume"
 * Возвращает {time, open, high, low, close, volume} или null при ошибке.
 */
function parseCSVLine(line) {
    line = line.trim();
    if (!line || line.startsWith('#')) return null;
    let parts;
    if (line.includes('\t')) {
        parts = line.split('\t');
    } else if (line.includes(';')) {
        parts = line.split(';');
    } else {
        parts = line.split(',');
    }

    parts = parts.map(p => p.trim());
    if (parts.length !== 6) {
        console.warn(`Пропущена строка с неправильным количеством полей: ${line}`);
        return null;
    }
    const [datetime, openStr, highStr, lowStr, closeStr, volumeStr] = parts;
    // Парсим дату и время (предполагаем UTC)
    // Формат: "YYYY-MM-DD HH:MM"
    const match = datetime.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
    if (!match) {
        console.warn(`Некорректный формат даты: ${datetime}`);
        return null;
    }
    const [, year, month, day, hour, minute] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
    if (isNaN(date.getTime())) {
        console.warn(`Некорректная дата: ${datetime}`);
        return null;
    }
    const time = Math.floor(date.getTime() / 1000); // секунды
    const open = parseFloat(openStr);
    const high = parseFloat(highStr);
    const low = parseFloat(lowStr);
    const close = parseFloat(closeStr);
    const volume = parseInt(volumeStr, 10);
    if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) || isNaN(volume)) {
        console.warn(`Некорректные числовые значения в строке: ${line}`);
        return null;
    }
    return { time, open, high, low, close, volume };
}

/**
 * Конвертирует один CSV файл в JS.
 * @param {string} csvPath - путь к CSV файлу
 * @returns {Promise<number>} количество успешно обработанных свечей
 */
async function convertCSV(csvPath) {
    const basename = path.basename(csvPath, CSV_EXT);
    const jsFilename = basename + JS_SUFFIX;
    const jsPath = path.join(path.dirname(csvPath), jsFilename);

    console.log(`Обработка ${csvPath} -> ${jsPath}`);

    const readStream = fs.createReadStream(csvPath, { encoding: ENCODING });
    const rl = readline.createInterface({
        input: readStream,
        crlfDelay: Infinity
    });

    const candles = [];
    let lineNumber = 0;
    let skipped = 0;

    for await (const line of rl) {
        lineNumber++;
        if (lineNumber === 1 && (line.includes('Date') || line.includes('Time'))) {
            // Пропускаем заголовок
            continue;
        }
        const candle = parseCSVLine(line);
        if (candle) {
            candles.push(candle);
        } else {
            skipped++;
        }
    }

    if (candles.length === 0) {
        console.warn(`В файле ${csvPath} не найдено корректных данных.`);
        return 0;
    }

    // Сортируем по времени (на всякий случай)
    candles.sort((a, b) => a.time - b.time);

    // Генерируем JS код (ES-модуль)
    const jsCode = `// Автоматически сгенерировано из ${basename}.csv
export default ${JSON.stringify(candles, null, 2)};`;

    // Записываем в файл
    fs.writeFileSync(jsPath, jsCode, ENCODING);
    console.log(`  -> Записано ${candles.length} свечей, пропущено ${skipped} строк.`);
    return candles.length;
}

/**
 * Основная функция: находит все CSV файлы в текущей директории и конвертирует их.
 */
async function main() {
    const dir = process.cwd();
    const argPath = process.argv[2];
    let files = [];

    if (argPath) {
        const resolved = path.isAbsolute(argPath) ? argPath : path.join(dir, argPath);
        if (!fs.existsSync(resolved)) {
            console.error(`Файл не найден: ${resolved}`);
            process.exit(1);
        }
        if (!resolved.endsWith(CSV_EXT)) {
            console.error(`Ожидался файл с расширением ${CSV_EXT}: ${resolved}`);
            process.exit(1);
        }
        files = [resolved];
    } else {
        files = fs.readdirSync(dir)
            .filter(f => f.endsWith(CSV_EXT))
            .map(f => path.join(dir, f));
    }

    if (files.length === 0) {
        console.log('CSV файлы не найдены в текущей директории.');
        return;
    }
    console.log(`Найдено CSV файлов: ${files.length}`);
    for (const file of files) {
        try {
            await convertCSV(file);
        } catch (err) {
            console.error(`Ошибка при обработке ${path.basename(file)}:`, err.message);
        }
    }
    console.log('Готово.');
}

// Запуск
if (require.main === module) {
    main().catch(err => {
        console.error('Фатальная ошибка:', err);
        process.exit(1);
    });
}

module.exports = { convertCSV };