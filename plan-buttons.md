# План рефакторинга кнопок и загрузки данных

## Цель
1. Унифицировать стили кнопок (шрифты, размеры, цвета, рамки) для сокращения кода стилей.
2. Преобразовать кнопки таймфрейма (TF) в выпадающий список с переименованием в m1, m5, m15.
3. Добавить заголовки "Range" и "TF" в первые строки соответствующих выпадающих списков.
4. Настроить автоматическую перезагрузку данных при изменении Range или TF, если источник данных выбран.

## Изменения по файлам

### 1. index.html

#### 1.1. Замена блока TF
Заменить текущий блок (строки 21-26):
```html
<div class="menu-item" style="display: flex; align-items: center; gap: 4px;">
    <span style="font-size: 11px; color: #787b86; margin-right: 4px;">TF:</span>
    <button id="tf-1m" class="nav-btn active" onclick="setTimeframe('1m')" style="padding: 4px 8px; font-size: 10px;">1m</button>
    <button id="tf-5m" class="nav-btn" onclick="setTimeframe('5m')" style="padding: 4px 8px; font-size: 10px;">5m</button>
    <button id="tf-15m" class="nav-btn" onclick="setTimeframe('15m')" style="padding: 4px 8px; font-size: 10px;">15m</button>
</div>
```
на выпадающий список:
```html
<div class="menu-item">
    <button id="tf-btn" class="nav-btn">m1 ▾</button>
    <div class="dropdown">
        <div class="ind-row header">TF</div>
        <div class="ind-row" data-value="1m">m1</div>
        <div class="ind-row" data-value="5m">m5</div>
        <div class="ind-row" data-value="15m">m15</div>
    </div>
</div>
```

#### 1.2. Добавление заголовка в список Range
В блоке Range (строки 12-19) добавить первую строку с классом `header`:
```html
<div class="menu-item">
    <button id="range-btn" class="nav-btn">1W ▾</button>
    <div class="dropdown">
        <div class="ind-row header">Range</div>
        <div class="ind-row" onclick="setRange('1D')">1D</div>
        <div class="ind-row" onclick="setRange('1W')">1W</div>
        <div class="ind-row" onclick="setRange('1M')">1M</div>
        <div class="ind-row" onclick="setRange('1Y')">1Y</div>
    </div>
</div>
```

#### 1.3. Удаление inline-стилей у кнопок TF
Inline-стили `style="padding: 4px 8px; font-size: 10px;"` должны быть удалены, так как будут заданы через CSS.

#### 1.4. Обновление других кнопок
Убедиться, что все кнопки в topbar используют класс `.nav-btn` без inline-стилей (кроме особых случаев). Проверить кнопки в `marker-nav` и `settings-panel`.

### 2. style.css

#### 2.1. Добавление CSS-переменных
В начало файла добавить:
```css
:root {
    --ps-width: 80px;
    --log-height: 200px;
    --btn-font-family: 'Segoe UI', sans-serif;
    --btn-font-size: 11px;
    --btn-padding: 6px 12px;
    --btn-border-radius: 4px;
    --btn-bg: #363c4e;
    --btn-color: #d1d4dc;
    --btn-hover-bg: #4c5265;
    --btn-active-bg: #2196f3;
    --btn-active-color: white;
}
```

#### 2.2. Унификация стилей кнопок
Обновить селектор `button, .btn`:
```css
button, .btn {
    border: none;
    border-radius: var(--btn-border-radius);
    cursor: pointer;
    outline: none;
    font-family: var(--btn-font-family);
    font-size: var(--btn-font-size);
    padding: var(--btn-padding);
    background: var(--btn-bg);
    color: var(--btn-color);
    font-weight: bold;
}
```

#### 2.3. Стили для .nav-btn
Убрать дублирование, оставить только специфичные стили (например, margin-right):
```css
.nav-btn {
    margin-right: 8px;
}
.nav-btn:hover {
    background: var(--btn-hover-bg);
}
.nav-btn.active {
    background: var(--btn-active-bg);
    color: var(--btn-active-color);
}
```

#### 2.4. Стили для заголовков в dropdown
Добавить:
```css
.ind-row.header {
    color: #787b86;
    cursor: default;
    font-weight: bold;
    margin-bottom: 8px;
    pointer-events: none;
}
.ind-row.header:hover {
    color: #787b86;
}
```

#### 2.5. Удаление специфичных правил
Убрать правило `#settings-panel .nav-btn`, если оно не нужно, или переопределить через переменные.

### 3. main.js

#### 3.1. Обновление функции setTimeframe
Переписать `setTimeframe` для работы с новой кнопкой:
- Удалить логику управления активным состоянием старых кнопок.
- Обновлять текст кнопки `#tf-btn` в формате "m1 ▾".
- Сохранять `currentTimeframe`.
- Вызывать `reloadDataIfNeeded()`.

#### 3.2. Обработка кликов в dropdown TF
Добавить обработчик событий для элементов `.ind-row[data-value]` внутри dropdown TF. Можно добавить в `DOMContentLoaded` или изменить HTML, чтобы использовать `onclick`.

Предлагается добавить атрибут `onclick="setTimeframeFromDropdown(this)"` и определить функцию:
```javascript
function setTimeframeFromDropdown(el) {
    const tf = el.getAttribute('data-value');
    setTimeframe(tf);
}
```

#### 3.3. Функция reloadDataIfNeeded
Создать функцию, которая проверяет, выбран ли источник данных (currentSource !== 'none') и загружена ли пара (есть ли `document.getElementById('pair-btn').innerText` не равен 'PAIR ▾'). Если да, то вызвать `setPair` с текущей парой для перезагрузки данных.

#### 3.4. Интеграция с setRange и setTimeframe
Модифицировать `setRange` и `setTimeframe` для вызова `reloadDataIfNeeded` после изменения значения.

#### 3.5. Удаление старых обработчиков
Удалить старые кнопки TF из HTML, соответственно их id больше не используются. Убедиться, что нет обращений к `tf-1m` и т.д.

### 4. Проверка и тестирование

#### 4.1. Визуальная проверка
- Убедиться, что все кнопки выглядят единообразно.
- Проверить работу выпадающих списков (Range, TF, Source, Pair).
- Убедиться, что заголовки "Range" и "TF" отображаются и не кликабельны.

#### 4.2. Функциональная проверка
- Выбор Range и TF должен обновлять данные, если источник выбран.
- При смене источника данных перезагрузка не должна происходить, пока не выбрана пара.
- Сохранение активного состояния кнопки TF (выделение цветом) должно работать.

## Порядок выполнения
1. Внести изменения в `index.html`.
2. Обновить `style.css`.
3. Обновить `main.js`.
4. Протестировать в браузере.

## Риски
- Нарушение работы существующего функционала (например, синхронизация графиков).
- Несовместимость с другими скриптами (strategy.js, ind.js).
- Ошибки в CSS, приводящие к нарушению макета.

## Следующие шаги
Переключиться в режим **code** и приступить к реализации.