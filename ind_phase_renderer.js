/**
 * Phase Indicator Renderer - Simple Version
 * Отображает текущую фазу рынка в виде цветной панели
 */

window.renderPhaseIndicator = (function() {
  'use strict';

  const PHASE_COLORS = {
    squeeze: { bg: '#2a2a3e', text: '#00ffff', label: '🔷 Squeeze' },
    flat: { bg: '#2a3a2a', text: '#00ff00', label: '📊 Flat' },
    trend_up: { bg: '#1a3a1a', text: '#00ff00', label: '📈 Trend Up' },
    trend_down: { bg: '#3a1a1a', text: '#ff4444', label: '📉 Trend Down' },
    chaos: { bg: '#3a2a1a', text: '#ffaa00', label: '🌪️ Chaos' }
  };

  function getPhaseColor(phase) {
    return PHASE_COLORS[phase] || PHASE_COLORS.chaos;
  }

  function createPhasePanel() {
    const panelId = 'phase-indicator-panel';
    let panel = document.getElementById(panelId);
    
    if (!panel) {
      panel = document.createElement('div');
      panel.id = panelId;
      panel.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 1000;
        font-family: monospace;
        font-size: 14px;
        padding: 12px 16px;
        border-radius: 4px;
        border: 2px solid #666;
        min-width: 200px;
        display: none;
      `;
      
      const chartContainer = document.getElementById('chart-main');
      if (chartContainer) {
        chartContainer.style.position = 'relative';
        chartContainer.parentElement.appendChild(panel);
      }
    }
    
    return panel;
  }

  function updatePhasePanel(currentIndex, data, indicators) {
    if (!indicators || !indicators.phase || !Array.isArray(indicators.phase.phase) || !data.length) {
      return;
    }

    const panel = createPhasePanel();
    if (!panel) return;

    if (currentIndex < 0 || currentIndex >= indicators.phase.phase.length) {
      panel.style.display = 'none';
      return;
    }

    const phase = indicators.phase.phase[currentIndex];
    const confidence = indicators.phase.confidence[currentIndex];
    const phaseInfo = getPhaseColor(phase);

    const candle = data[currentIndex];
    const time = new Date(candle.time * 1000).toLocaleString();

    // Полоса уверенности
    const confPercent = (confidence * 100).toFixed(0);
    const confBar = '█'.repeat(Math.round(confidence * 10)) + '░'.repeat(10 - Math.round(confidence * 10));

    panel.innerHTML = `
      <div style="background-color: ${phaseInfo.bg}; color: ${phaseInfo.text}; padding: 8px; border-radius: 3px; margin-bottom: 8px; font-weight: bold;">
        ${phaseInfo.label}
      </div>
      <div style="color: #ccc; font-size: 12px; margin-bottom: 6px;">
        Confidence: ${confPercent}%<br>
        <span style="color: ${phaseInfo.text}; font-size: 11px;">${confBar}</span>
      </div>
      <div style="color: #888; font-size: 11px;">
        ${time}
      </div>
    `;

    panel.style.backgroundColor = phaseInfo.bg;
    panel.style.borderColor = phaseInfo.text;
    panel.style.color = phaseInfo.text;
    panel.style.display = 'block';
  }

  function onCrosshairMove(param, data, indicators) {
    if (!param || !param.time) {
      const panel = document.getElementById('phase-indicator-panel');
      if (panel) panel.style.display = 'none';
      return;
    }

    const index = timeToIndex(param.time, data);
    if (index >= 0 && index < data.length) {
      updatePhasePanel(index, data, indicators);
    }
  }

  function timeToIndex(time, data) {
    for (let i = 0; i < data.length; i++) {
      if (data[i].time >= time) {
        return i;
      }
    }
    return data.length - 1;
  }

  return {
    updatePhasePanel,
    createPhasePanel,
    onCrosshairMove,
    getPhaseColor,
    PHASE_COLORS
  };
})();
