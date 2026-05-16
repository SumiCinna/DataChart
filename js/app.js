'use strict';

const PALETTE = [
  '#3b82f6','#10b981','#f59e0b','#8b5cf6',
  '#ef4444','#06b6d4','#f97316','#ec4899'
];

const CHART_TYPES = ['line','bar','area','pie'];
const MAX_CHART_POINTS = 30;
const MAX_PIE_SLICES   = 10;

// Default display column per chart type — falls back if column doesn't exist in data
const CHART_DEFAULTS = {
  line: 'Contractor_1',
  bar:  'FY',
  area: 'Location',
  pie:  'Region',
};

const state = {
  allRows:     [],
  headers:     [],
  numericCols: [],
  filename:    '',
  theme:       localStorage.getItem('dc-theme') || 'dark',
  isRendering: false,
  renderTimeout: null,
  chartsToRender: new Set(),
  charts: {
    line: { instance: null, activeKeys: [], displayCol: '' },
    bar:  { instance: null, activeKeys: [], displayCol: '' },
    area: { instance: null, activeKeys: [], displayCol: '' },
    pie:  { instance: null, activeKeys: [], displayCol: '' },
  }
};

// Pick the best default column for a chart type from available headers
function resolveDefault(type) {
  const preferred = CHART_DEFAULTS[type];
  const nonNumeric = state.headers.filter(h => !state.numericCols.includes(h));
  // exact match first
  if (preferred && state.headers.includes(preferred)) return preferred;
  // case-insensitive match
  const ci = nonNumeric.find(h => h.toLowerCase() === (preferred || '').toLowerCase());
  if (ci) return ci;
  // fallback: first non-numeric col
  return nonNumeric[0] || state.headers[0] || '';
}

function initializeLoadingOverlay() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
    #render-overlay {
      position:fixed;top:0;left:0;right:0;bottom:0;
      background:rgba(15,23,42,0.85);
      backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
      display:none;align-items:center;justify-content:center;z-index:9998;
    }
    #render-overlay.visible{display:flex;}
    .loader-container{display:flex;flex-direction:column;align-items:center;gap:16px;}
    .spinner{
      width:40px;height:40px;
      border:3px solid rgba(59,130,246,0.2);
      border-top:3px solid #3b82f6;
      border-radius:50%;animation:spin 0.8s linear infinite;
    }
    .loader-text{color:#94a3b8;font-size:13px;font-family:'IBM Plex Sans',sans-serif;letter-spacing:0.3px;}
  `;
  document.head.appendChild(style);
  const overlay = document.createElement('div');
  overlay.id = 'render-overlay';
  overlay.innerHTML = `<div class="loader-container"><div class="spinner"></div><div class="loader-text">Rendering charts…</div></div>`;
  document.body.appendChild(overlay);
}

function showLoadingOverlay() {
  document.getElementById('render-overlay')?.classList.add('visible');
  state.isRendering = true;
}
function hideLoadingOverlay() {
  document.getElementById('render-overlay')?.classList.remove('visible');
  state.isRendering = false;
}

function debounceRender() {
  if (state.renderTimeout) clearTimeout(state.renderTimeout);
  showLoadingOverlay();
  state.renderTimeout = setTimeout(() => {
    try {
      CHART_TYPES.forEach(type => {
        if (state.chartsToRender.has(type)) {
          buildFilterPanel(type);
          buildSeriesPanel(type);
          renderChart(type);
          buildChartNote(type);
        }
      });
      state.chartsToRender.clear();
    } catch(e) { console.error('Render error:', e); }
    hideLoadingOverlay();
  }, 600);
}

function renderAllCharts() {
  const noNumericWarn = document.getElementById('no-numeric-warn');
  if (noNumericWarn) noNumericWarn.classList.toggle('hidden', state.numericCols.length > 0);
  CHART_TYPES.forEach(type => {
    buildFilterPanel(type);
    buildSeriesPanel(type);
    renderChart(type);
    buildChartNote(type);
  });
  showDashboard();
}

function parseNum(v) {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[,\s$₱€£¥%]/g,'').trim());
  return isNaN(n) ? NaN : n;
}
function isValidHeader(h) {
  return typeof h === 'string' && h.trim() !== '' && h !== 'undefined' && h !== 'null';
}
function isNumericCol(rows, col) {
  const nonEmpty = rows.filter(r => r[col] !== null && r[col] !== undefined && r[col] !== '');
  if (!nonEmpty.length) return false;
  return nonEmpty.filter(r => !isNaN(parseNum(r[col]))).length / nonEmpty.length > 0.7;
}
function normalizeRows(rows, numericCols) {
  return rows.map(row => {
    const out = { ...row };
    numericCols.forEach(col => { const n = parseNum(row[col]); out[col] = isNaN(n) ? 0 : n; });
    return out;
  });
}
function stripBlankHeaders(rows, fields) {
  const validFields = fields.filter(isValidHeader);
  return {
    rows: rows.map(row => { const c = {}; validFields.forEach(f => { c[f] = row[f]; }); return c; }),
    fields: validFields
  };
}
function aggregateByLabel(rows, labelCol, numericCols) {
  const map = new Map();
  rows.forEach(row => {
    const key = String(row[labelCol] ?? '').trim().slice(0, 40);
    if (!map.has(key)) {
      const init = { [labelCol]: key };
      numericCols.forEach(c => { init[c] = 0; });
      map.set(key, init);
    }
    const entry = map.get(key);
    numericCols.forEach(c => { entry[c] += Number(row[c] || 0); });
  });
  return Array.from(map.values());
}
function fmtNum(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
  return Number(v).toLocaleString();
}
function fmtTick(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
  return Number(v).toLocaleString();
}
function wrapLabel(raw, maxLen = 44) {
  const full = Array.isArray(raw) ? raw.join(' ') : String(raw ?? '');
  const words = full.split(' ');
  const lines = []; let line = '';
  words.forEach(w => {
    if ((line + ' ' + w).trim().length > maxLen) { if (line) lines.push(line.trim()); line = w; }
    else line = (line + ' ' + w).trim();
  });
  if (line) lines.push(line.trim());
  return lines;
}

function processRows(rawRows, rawFields, name) {
  const { rows, fields } = stripBlankHeaders(rawRows, rawFields);
  if (!fields.length) { showToast('All columns have blank headers.', 'error'); hideLoadingOverlay(); return; }

  const numeric    = fields.filter(c => isNumericCol(rows, c)).slice(0, 8);
  const normalized = normalizeRows(rows, numeric);

  state.allRows     = normalized;
  state.headers     = fields;
  state.numericCols = numeric;
  state.filename    = name;

  // Assign each chart its default display column
  CHART_TYPES.forEach(t => {
    state.charts[t].activeKeys  = [...numeric];
    state.charts[t].displayCol  = resolveDefault(t);
  });

  const total = numeric[0] ? normalized.reduce((s, r) => s + Number(r[numeric[0]] || 0), 0) : 0;
  updateStats(rows.length, fields.length, numeric, total);
  populateLabelColSelect();
  renderAllCharts();
  hideLoadingOverlay();
}

function parseCSV(text, name) {
  Papa.parse(text, {
    header: true, dynamicTyping: false, skipEmptyLines: true,
    complete: ({ data: rows, meta }) => {
      if (!rows.length) { showToast('No data found.', 'error'); hideLoadingOverlay(); return; }
      processRows(rows, meta.fields, name);
    },
    error: () => { showToast('Failed to parse CSV.', 'error'); hideLoadingOverlay(); }
  });
}
function parseExcel(buffer, name) {
  try {
    const wb = XLSX.read(buffer, { type: 'array' }), ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
    if (!rows.length) { showToast('No data found.', 'error'); hideLoadingOverlay(); return; }
    processRows(rows, Object.keys(rows[0] || {}), name);
  } catch { showToast('Failed to parse Excel.', 'error'); hideLoadingOverlay(); }
}
async function loadServerFile(fileInfo) {
  if (!fileInfo?.url) { showToast('File information missing.', 'error'); hideLoadingOverlay(); return; }
  try {
    showLoadingOverlay();
    const resp = await fetch(fileInfo.url, { credentials: 'include', method: 'GET', headers: { 'Accept': '*/*' } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const name = fileInfo.name || 'data';
    const ext  = name.split('.').pop().toLowerCase();
    if (ext === 'csv' || ext === 'txt') {
      const text = await resp.text();
      if (!text?.trim()) throw new Error('File is empty');
      parseCSV(text, name);
    } else if (ext === 'xlsx' || ext === 'xls') {
      const buf = await resp.arrayBuffer();
      if (!buf?.byteLength) throw new Error('File empty');
      parseExcel(new Uint8Array(buf), name);
    } else {
      try { parseExcel(new Uint8Array(await resp.arrayBuffer()), name); }
      catch { parseCSV(await resp.text(), name); }
    }
  } catch(e) { showToast(`Could not load file: ${e.message}`, 'error'); hideLoadingOverlay(); }
}

function showToast(msg, type = 'info') {
  document.querySelectorAll('.dc-toast').forEach(el => el.remove());
  const t = document.createElement('div'); t.className = 'dc-toast';
  const dk = state.theme === 'dark';
  t.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:${type === 'error' ? (dk ? '#7f1d1d' : '#fef2f2') : (dk ? '#1e3a8a' : '#dbeafe')};
    color:${type === 'error' ? (dk ? '#fca5a5' : '#991b1b') : (dk ? '#bfdbfe' : '#1e3a8a')};
    border:1px solid ${type === 'error' ? (dk ? '#991b1d' : '#fca5a5') : (dk ? '#1d4ed8' : '#3b82f6')};
    border-radius:8px;padding:10px 18px;font-size:13px;
    box-shadow:0 4px 24px rgba(0,0,0,0.5);z-index:9999;
    font-family:'IBM Plex Sans',sans-serif;`;
  t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.4s'; setTimeout(() => t.remove(), 400); }, 4000);
}

function showDashboard() {
  document.getElementById('no-file-screen')?.classList.add('hidden');
  const db = document.getElementById('dashboard-screen');
  db.classList.remove('hidden'); db.classList.add('visible');
  document.getElementById('btn-download-all')?.classList.remove('hidden');
  const badge = document.getElementById('filename-badge');
  if (badge) { badge.textContent = '/ ' + state.filename; badge.classList.remove('hidden'); }
}

function updateStats(totalRows, colCount, numeric, total) {
  document.getElementById('stat-rows').textContent        = totalRows.toLocaleString();
  document.getElementById('stat-cols').textContent        = colCount;
  document.getElementById('stat-series').textContent      = numeric.length;
  document.getElementById('stat-total').textContent       = fmtNum(total);
  document.getElementById('stat-total-label').textContent = (numeric[0] || 'Value') + ' Total';
}

// Global GROUP / LABEL — starts blank, user selects once to override ALL charts
function populateLabelColSelect() {
  const sel = document.getElementById('label-col-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">— select column —</option>';
  state.headers.forEach(h => {
    const opt = document.createElement('option');
    opt.value = h; opt.textContent = h;
    sel.appendChild(opt);
  });
  sel.value = '';
  sel.onchange = null;
  sel.onchange = () => {
    if (!sel.value) return;
    // Override every chart's displayCol with the global pick
    CHART_TYPES.forEach(t => { state.charts[t].displayCol = sel.value; });
    showLoadingOverlay();
    setTimeout(() => { renderAllCharts(); hideLoadingOverlay(); }, 600);
  };
}

// Per-chart FILTER BY COLUMN — changes only that chart's displayCol
function buildFilterPanel(type) {
  const sel = document.getElementById('filter-col-' + type);
  if (!sel) return;

  const current = state.charts[type].displayCol;
  sel.innerHTML = '';
  state.headers.forEach(h => {
    const opt = document.createElement('option');
    opt.value = h; opt.textContent = h;
    if (h === current) opt.selected = true;
    sel.appendChild(opt);
  });

  sel.onchange = null;
  sel.onchange = () => {
    state.charts[type].displayCol = sel.value;
    updateFilterBadge(type);
    state.chartsToRender.add(type);
    debounceRender();
  };

  updateFilterBadge(type);
}

function updateFilterBadge(type) {
  const badge      = document.getElementById('badge-filter-' + type);
  const displayCol = state.charts[type].displayCol;
  if (!badge) return;
  if (displayCol) {
    badge.textContent = displayCol;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function getChartDefaults() {
  const dk = state.theme === 'dark';
  return {
    animation: false, animations: false,
    responsive: true, maintainAspectRatio: false, resizeDelay: 100,
    layout: { padding: 0 },
    interaction: { mode: 'index', intersect: false, axis: 'x' },
    plugins: {
      legend: {
        display: true,
        labels: { color: dk ? '#64748b' : '#475569', font: { size: 10, weight: '500' }, padding: 12, usePointStyle: true, boxWidth: 6 }
      },
      tooltip: {
        enabled: true, mode: 'index', intersect: false,
        backgroundColor: dk ? '#1e293b' : '#ffffff',
        borderColor: dk ? '#475569' : '#cbd5e1', borderWidth: 1,
        titleColor: dk ? '#f1f5f9' : '#0f172a', bodyColor: dk ? '#94a3b8' : '#475569',
        titleFont: { size: 11, weight: '600', family: "'IBM Plex Sans',sans-serif" },
        bodyFont:  { size: 11, family: "'IBM Plex Sans',sans-serif" },
        padding: 12, displayColors: true, boxPadding: 4, caretSize: 6,
        callbacks: {
          title: ctx => wrapLabel(ctx[0]?.label ?? '', 44),
          label: ctx => '  ' + ctx.dataset.label + ': ' + Number(ctx.raw).toLocaleString()
        }
      }
    },
    scales: {
      x: {
        display: true,
        ticks: {
          color: dk ? '#475569' : '#64748b', font: { size: 8 },
          maxRotation: 45, minRotation: 0, autoSkipPadding: 20,
          callback: function(val) { const l = this.getLabelForValue(val); return l.length > 14 ? l.slice(0, 14) + '…' : l; }
        },
        grid: { color: dk ? '#1e3a5f' : '#e2e8f0', drawBorder: false }
      },
      y: {
        display: true,
        ticks: { color: dk ? '#475569' : '#64748b', font: { size: 9 }, callback: v => fmtTick(v) },
        grid: { color: dk ? '#1e3a5f' : '#e2e8f0', drawBorder: false }
      }
    }
  };
}

function lockCanvasHeight(canvas, height) {
  canvas.style.height = height + 'px';
  const w = canvas.parentElement;
  if (w) { w.style.position = 'relative'; w.style.height = height + 'px'; }
}

function renderChart(type) {
  const canvas = document.getElementById('canvas-' + type);
  const cs     = state.charts[type];
  if (!canvas) return;

  const groupCol    = cs.displayCol || state.headers.find(h => !state.numericCols.includes(h)) || state.headers[0];
  const visibleKeys = cs.activeKeys.filter(k => state.numericCols.includes(k));
  let agg           = aggregateByLabel(state.allRows, groupCol, state.numericCols);

  const entryBadge = document.getElementById('badge-entries-' + type);

  if (type === 'pie') {
    const pieCol    = cs.activeKeys[0] || state.numericCols[0];
    const pieSorted = agg
      .map(r => ({ name: String(r[groupCol] ?? ''), value: Number(r[pieCol] ?? 0) }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);

    let slices = pieSorted.slice(0, MAX_PIE_SLICES);
    const rem  = pieSorted.slice(MAX_PIE_SLICES);
    if (rem.length) slices.push({ name: `Other (${rem.length})`, value: rem.reduce((s, d) => s + d.value, 0) });

    if (entryBadge) entryBadge.textContent = slices.length + ' entries';
    if (cs.instance) { cs.instance.destroy(); cs.instance = null; }
    if (!slices.length) return;

    const dk = state.theme === 'dark';
    lockCanvasHeight(canvas, 280);
    cs.instance = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: slices.map(d => d.name),
        datasets: [{
          data: slices.map(d => d.value),
          backgroundColor: PALETTE.slice(0, slices.length),
          borderWidth: 2, borderColor: dk ? '#1e293b' : '#ffffff'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, resizeDelay: 100, animation: false, animations: false,
        layout: { padding: { right: 10 } },
        plugins: {
          legend: {
            display: true, position: 'right',
            labels: {
              color: dk ? '#64748b' : '#475569', font: { size: 10 }, padding: 12, usePointStyle: true, boxWidth: 6,
              generateLabels: chart => chart.data.labels.map((label, i) => ({
                text: String(label), fillStyle: PALETTE[i % PALETTE.length],
                strokeStyle: dk ? '#1e293b' : '#ffffff', lineWidth: 2, index: i
              }))
            }
          },
          tooltip: {
            enabled: true,
            backgroundColor: dk ? '#1e293b' : '#ffffff', borderColor: dk ? '#475569' : '#cbd5e1', borderWidth: 1,
            titleColor: dk ? '#f1f5f9' : '#0f172a', bodyColor: dk ? '#94a3b8' : '#475569',
            titleFont: { size: 11, weight: '600' }, bodyFont: { size: 11 }, padding: 12,
            callbacks: {
              title: ctx => wrapLabel(ctx[0]?.label ?? '', 36),
              label: ctx => {
                const val   = Number(ctx.raw);
                const total = ctx.chart.data.datasets[0].data.reduce((s, v) => s + Number(v), 0);
                const pct   = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
                return '  ' + pieCol + ': ' + val.toLocaleString() + '  (' + pct + '%)';
              }
            }
          }
        }
      }
    });
    return;
  }

  if (agg.length > MAX_CHART_POINTS) {
    const step = Math.ceil(agg.length / MAX_CHART_POINTS);
    agg = agg.filter((_, i) => i % step === 0).slice(0, MAX_CHART_POINTS);
  }

  if (entryBadge) entryBadge.textContent = agg.length + ' entries';
  if (cs.instance) { cs.instance.destroy(); cs.instance = null; }
  if (!visibleKeys.length || !agg.length) return;

  const labels   = agg.map(r => String(r[groupCol] ?? ''));
  const defaults = getChartDefaults();
  const dk       = state.theme === 'dark';
  let config;

  if (type === 'line') {
    config = {
      type: 'line',
      data: {
        labels,
        datasets: visibleKeys.map((k, i) => {
          const color = PALETTE[i % PALETTE.length];
          return {
            label: k, data: agg.map(r => r[k]),
            borderColor: color, backgroundColor: color + '30', borderWidth: 2,
            fill: false, tension: 0.3,
            pointRadius: 3, pointHoverRadius: 7,
            pointBackgroundColor: color,
            pointBorderColor: dk ? '#1e293b' : '#ffffff', pointBorderWidth: 2,
            pointHoverBackgroundColor: color,
            pointHoverBorderColor: dk ? '#f1f5f9' : '#0f172a', pointHoverBorderWidth: 2,
            clip: false
          };
        })
      },
      options: { ...defaults }
    };
  } else if (type === 'area') {
    config = {
      type: 'line',
      data: {
        labels,
        datasets: visibleKeys.map((k, i) => {
          const color = PALETTE[i % PALETTE.length];
          return {
            label: k, data: agg.map(r => r[k]),
            backgroundColor: color + '35', borderColor: color, borderWidth: 2,
            fill: 'origin', tension: 0.3,
            pointRadius: 3, pointHoverRadius: 7,
            pointBackgroundColor: color,
            pointBorderColor: dk ? '#1e293b' : '#ffffff', pointBorderWidth: 2,
            pointHoverBackgroundColor: color,
            pointHoverBorderColor: dk ? '#f1f5f9' : '#0f172a', pointHoverBorderWidth: 2,
            clip: false
          };
        })
      },
      options: { ...defaults, plugins: { ...defaults.plugins, filler: { propagate: false } } }
    };
  } else {
    config = {
      type: 'bar',
      data: {
        labels,
        datasets: visibleKeys.map((k, i) => {
          const color = PALETTE[i % PALETTE.length];
          return {
            label: k, data: agg.map(r => r[k]),
            backgroundColor: color + 'bb', hoverBackgroundColor: color,
            borderRadius: 2, borderColor: 'transparent', borderWidth: 0
          };
        })
      },
      options: { ...defaults, barPercentage: 0.7, categoryPercentage: 0.8 }
    };
  }

  lockCanvasHeight(canvas, 260);
  cs.instance = new Chart(canvas, config);
}

function buildSeriesPanel(type) {
  const container = document.getElementById('series-toggles-' + type);
  if (!container) return;
  container.innerHTML = '';
  const cs = state.charts[type];
  state.numericCols.forEach((k, i) => {
    const color  = PALETTE[i % PALETTE.length];
    const active = cs.activeKeys.includes(k);
    const btn    = document.createElement('button');
    btn.className   = 'series-btn' + (active ? ' active' : '');
    btn.textContent = k; btn.dataset.key = k; btn.dataset.type = type;
    btn.style.borderColor = active ? color : (state.theme === 'dark' ? '#334155' : '#cbd5e1');
    btn.style.color       = active ? color : '#64748b';
    btn.style.background  = active ? color + '20' : 'transparent';
    btn.onclick = e => {
      e.stopPropagation();
      const idx = cs.activeKeys.indexOf(k);
      if (idx >= 0) cs.activeKeys.splice(idx, 1); else cs.activeKeys.push(k);
      const on = cs.activeKeys.includes(k);
      btn.style.borderColor = on ? color : (state.theme === 'dark' ? '#334155' : '#cbd5e1');
      btn.style.color       = on ? color : '#64748b';
      btn.style.background  = on ? color + '20' : 'transparent';
      state.chartsToRender.add(type);
      debounceRender();
    };
    container.appendChild(btn);
  });
}

async function aiFixChart(type) {
  const btn = document.getElementById('ai-btn-' + type);
  if (!btn || !state.allRows.length) return;

  const origHTML    = btn.innerHTML;
  btn.disabled      = true;
  btn.innerHTML     = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 0.8s linear infinite"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg> Thinking…`;
  btn.style.opacity = '0.6';

  const sampleRows = state.allRows.slice(0, 5);
  const nonNumeric = state.headers.filter(h => !state.numericCols.includes(h));

  const prompt = `You are a data visualization expert. Pick the best display column for a ${type} chart.

Current display column: "${state.charts[type].displayCol}"
All columns: ${JSON.stringify(state.headers)}
Numeric columns: ${JSON.stringify(state.numericCols)}
Non-numeric columns: ${JSON.stringify(nonNumeric)}
Sample rows: ${JSON.stringify(sampleRows)}

Pick the best non-numeric column to group/display this ${type} chart by on the X-axis.
For line/area prefer date/time. For bar prefer short category. For pie prefer few unique values.

Respond ONLY with valid JSON, no markdown:
{"displayCol":"<column name>","reason":"<one short sentence>"}`;

  try {
    const resp   = await fetch('ai_fix.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
    const data   = await resp.json();
    if (data.error) throw new Error(data.error);
    const clean  = (data.text || '').trim().replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    if (result.displayCol && state.headers.includes(result.displayCol)) {
      state.charts[type].displayCol = result.displayCol;
      buildFilterPanel(type);
      buildSeriesPanel(type);
      renderChart(type);
      buildChartNote(type);
      const panel = document.getElementById('filter-panel-' + type);
      if (panel) panel.classList.remove('hidden');
      showToast(`AI set ${type}: grouped by "${result.displayCol}". ${result.reason}`, 'info');
    } else {
      showToast('AI returned an unrecognized column. Try again.', 'error');
    }
  } catch(e) {
    console.error('AI fix error:', e);
    showToast('AI fix failed. Check console.', 'error');
  }

  btn.disabled      = false;
  btn.innerHTML     = origHTML;
  btn.style.opacity = '';
}

function downloadChartPNG(type, filename) {
  const canvas = document.getElementById('canvas-' + type); if (!canvas) return;
  const link   = document.createElement('a');
  link.download = filename || type + '-chart.png'; link.href = canvas.toDataURL('image/png'); link.click();
}

function downloadAll() {
  showDownloadModal();
}

function showDownloadModal() {
  document.getElementById('dc-download-modal')?.remove();
  const dk  = state.theme === 'dark';
  const modal = document.createElement('div');
  modal.id = 'dc-download-modal';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);
    display:flex;align-items:center;justify-content:center;z-index:9999;`;
  modal.innerHTML = `
    <div style="
      background:${dk?'#1e293b':'#ffffff'};border:1px solid ${dk?'#334155':'#e2e8f0'};
      border-radius:14px;padding:28px 32px;min-width:320px;max-width:420px;width:90%;
      box-shadow:0 20px 60px rgba(0,0,0,0.4);font-family:'IBM Plex Sans',sans-serif;">
      <div style="font-size:15px;font-weight:700;color:${dk?'#f1f5f9':'#0f172a'};margin-bottom:6px;">Download Charts</div>
      <div style="font-size:12px;color:${dk?'#64748b':'#94a3b8'};margin-bottom:22px;">Choose how you want to export the charts.</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <button id="dl-combined" style="
          padding:12px 16px;border-radius:8px;border:1px solid #3b82f6;
          background:#3b82f620;color:#3b82f6;font-size:13px;font-weight:600;
          cursor:pointer;text-align:left;transition:background 0.15s;">
          🖼️ &nbsp;Single image — all 4 charts combined
        </button>
        <button id="dl-individual" style="
          padding:12px 16px;border-radius:8px;border:1px solid ${dk?'#334155':'#cbd5e1'};
          background:transparent;color:${dk?'#94a3b8':'#475569'};font-size:13px;font-weight:600;
          cursor:pointer;text-align:left;transition:background 0.15s;">
          📁 &nbsp;Individual files — one PNG per chart
        </button>
        <button id="dl-cancel" style="
          padding:10px 16px;border-radius:8px;border:none;
          background:transparent;color:${dk?'#475569':'#94a3b8'};font-size:12px;
          cursor:pointer;margin-top:4px;">
          Cancel
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelector('#dl-combined').onclick   = () => { modal.remove(); downloadCombined(); };
  modal.querySelector('#dl-individual').onclick = () => { modal.remove(); CHART_TYPES.forEach((t,i) => setTimeout(() => downloadChartPNG(t, t+'-chart.png'), i*400)); };
  modal.querySelector('#dl-cancel').onclick     = () => modal.remove();
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

async function downloadCombined() {
  const COLS = 2, GAP = 20, PAD = 24, LABEL_H = 32;
  const canvases = CHART_TYPES.map(t => document.getElementById('canvas-' + t)).filter(Boolean);
  if (!canvases.length) return;

  const cw = canvases[0].width  || canvases[0].offsetWidth  || 600;
  const ch = canvases[0].height || canvases[0].offsetHeight || 300;
  const ROWS = Math.ceil(canvases.length / COLS);
  const dk   = state.theme === 'dark';

  const totalW = COLS * cw + (COLS - 1) * GAP + PAD * 2;
  const totalH = ROWS * (ch + LABEL_H) + (ROWS - 1) * GAP + PAD * 2 + 40;

  const out = document.createElement('canvas');
  out.width  = totalW;
  out.height = totalH;
  const ctx  = out.getContext('2d');

  ctx.fillStyle = dk ? '#0f172a' : '#f8fafc';
  ctx.fillRect(0, 0, totalW, totalH);

  // header
  ctx.fillStyle = dk ? '#f1f5f9' : '#0f172a';
  ctx.font      = 'bold 15px IBM Plex Sans, sans-serif';
  ctx.fillText('DataChart — ' + (state.filename || 'export'), PAD, PAD + 16);

  canvases.forEach((canvas, i) => {
    const col  = i % COLS;
    const row  = Math.floor(i / COLS);
    const x    = PAD + col * (cw + GAP);
    const y    = PAD + 40 + row * (ch + LABEL_H + GAP);
    const type = CHART_TYPES[i];
    const col_ = state.charts[type]?.displayCol || '';

    // chart label
    ctx.fillStyle = dk ? '#64748b' : '#94a3b8';
    ctx.font      = '600 11px IBM Plex Sans, sans-serif';
    const label   = type.charAt(0).toUpperCase() + type.slice(1) + ' Chart' + (col_ ? '  ·  ' + col_ : '');
    ctx.fillText(label, x, y + 14);

    // border
    ctx.strokeStyle = dk ? '#1e3a5f' : '#e2e8f0';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.roundRect(x - 1, y + LABEL_H - 1, cw + 2, ch + 2, 6);
    ctx.stroke();

    ctx.drawImage(canvas, x, y + LABEL_H, cw, ch);
  });

  const link     = document.createElement('a');
  link.download  = 'datachart-all.png';
  link.href      = out.toDataURL('image/png');
  link.click();
}

// Build and inject the per-chart info note showing defaults, current state, and guidance
function buildChartNote(type) {
  const noteId  = 'chart-note-' + type;
  let note      = document.getElementById(noteId);
  const canvas  = document.getElementById('canvas-' + type);
  if (!canvas) return;
  
  const chartCard = canvas.closest('.bg-slate-800');
  if (!chartCard) return;

  if (!note) {
    note    = document.createElement('div');
    note.id = noteId;
    note.style.cssText = `
      margin-top:10px;padding:10px 12px;border-radius:6px;font-size:11px;line-height:1.5;
      font-family:'IBM Plex Sans',sans-serif;
      background:rgba(59,130,246,0.08);
      border:1px solid rgba(59,130,246,0.18);
      color:#94a3b8;`;
    chartCard.appendChild(note);
  }

  const cs      = state.charts[type];
  const current = cs.displayCol || '—';
  const def     = CHART_DEFAULTS[type] || '—';
  const isDef   = current === def || (current.toLowerCase() === def.toLowerCase());
  
  // Type-specific guidance
  let typeGuide = '';
  if (type === 'line') {
    typeGuide = 'Line: best for trends over time or sequences.';
  } else if (type === 'bar') {
    typeGuide = 'Bar: best for comparing categories.';
  } else if (type === 'area') {
    typeGuide = 'Area: best for stacked trends and cumulative changes.';
  } else if (type === 'pie') {
    typeGuide = 'Pie: best for showing composition and proportions.';
  }

  // Data limits info
  const dataLimitNote = type === 'pie' 
    ? `up to <b>${MAX_PIE_SLICES}</b> slices`
    : `up to <b>${MAX_CHART_POINTS}</b> data points`;

  // Current vs default status
  const currentStatus = isDef 
    ? `<span style="color:#10b981;font-weight:600;">${current}</span> (default)`
    : `<span style="color:#f1f5f9;font-weight:600;">${current}</span> (default: ${def})`;

  note.innerHTML = `
    <div style="margin-bottom:6px;">
      <span style="color:#3b82f6;font-weight:600;">Default column:</span> ${currentStatus}
    </div>
    <div style="opacity:0.8;">
      ${typeGuide}
    </div>`;
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('dc-theme', state.theme);
  document.documentElement.setAttribute('data-theme', state.theme);
  if (state.allRows.length > 0) CHART_TYPES.forEach(type => renderChart(type));
}

document.addEventListener('DOMContentLoaded', () => {
  initializeLoadingOverlay();
  document.documentElement.setAttribute('data-theme', state.theme);

  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  document.getElementById('btn-download-all')?.addEventListener('click', downloadAll);

  document.addEventListener('click', e => {
    if (state.isRendering) { e.preventDefault(); e.stopPropagation(); return false; }
    const btn    = e.target.closest('[data-action]'); if (!btn) return;
    const type   = btn.dataset.type;
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
  }, true);

  const DC = window.DATACHART;
  if (DC?.activeFile) loadServerFile(DC.activeFile);
});