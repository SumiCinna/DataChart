'use strict';

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('dc-theme', state.theme);
  document.documentElement.setAttribute('data-theme', state.theme);
  if (state.allRows.length > 0) renderPhilippinesMap().catch(err => console.error('Map render error:', err));
  if (state.allRows.length > 0) CHART_TYPES.forEach(type => renderChart(type));
}

document.addEventListener('DOMContentLoaded', () => {
  initializeLoadingOverlay();
  document.documentElement.setAttribute('data-theme', state.theme);

  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  document.getElementById('btn-download-all')?.addEventListener('click', downloadAll);
  CHART_TYPES.forEach(type => {
    document.getElementById('btn-download-table-' + type)?.addEventListener('click', () => showTableDownloadModal(type));
    document.getElementById('entries-limit-' + type)?.addEventListener('change', e => {
      state.charts[type].entryLimit = Number(e.target.value) || (DEFAULT_ENTRY_LIMITS[type] || 30);
      renderChart(type);
    });
    document.getElementById('sort-order-' + type)?.addEventListener('change', e => {
      state.charts[type].sortOrder = e.target.value || 'default';
      renderChart(type);
    });
    document.getElementById('selection-mode-' + type)?.addEventListener('change', e => {
      state.charts[type].selectionMode = e.target.value || 'current';
      renderChart(type);
    });
  });

  document.addEventListener('click', e => {
    if (state.isRendering) { e.preventDefault(); e.stopPropagation(); return false; }
    const btn = e.target.closest('[data-action]'); if (!btn) return;
    const type = btn.dataset.type;
    const action = btn.dataset.action;

    if (action === 'filter') {
      e.preventDefault();
      const panel = document.getElementById('filter-panel-' + type); if (!panel) return;
      const isOpen = !panel.classList.contains('hidden');
      panel.classList.toggle('hidden', isOpen);
      if (!isOpen) { buildFilterPanel(type); buildSeriesPanel(type); buildChartNote(type); }
    }
    if (action === 'download') { e.preventDefault(); downloadChartPNG(type); }
    if (action === 'ai') { e.preventDefault(); aiFixChart(type); }
    if (action === 'reset') { e.preventDefault(); resetChartState(type); }
  }, true);

  const DC = window.DATACHART;
  if (DC?.activeFile) loadServerFile(DC.activeFile);
});