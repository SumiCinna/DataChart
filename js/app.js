'use strict';

const PALETTE = [
  '#3b82f6','#10b981','#f59e0b','#8b5cf6',
  '#ef4444','#06b6d4','#f97316','#ec4899'
];

const CHART_TYPES = ['line','bar','area','pie'];
const MAX_CHART_POINTS = 30;
const MAX_PIE_SLICES   = 10;
const DEFAULT_ENTRY_LIMITS = {
  line: 30,
  bar: 25,
  area: 20,
  pie: 8,
};

const DEFAULT_SORT_ORDERS = {
  line: 'default',
  bar: 'default',
  area: 'default',
  pie: 'default',
};

const DEFAULT_SELECTION_MODES = {
  line: 'current',
  bar: 'current',
  area: 'current',
  pie: 'current',
};

const ENTRY_LIMIT_CHOICES = [5, 10, 15, 20, 25, 30];
const PH_MAP_GEOJSON_URL = 'https://raw.githubusercontent.com/faeldon/philippines-json-maps/master/2023/geojson/country/lowres/country.0.001.json';
const MAP_BUCKET_LOW_MAX = 90_000_000;
const MAP_BUCKET_MID_MAX = 180_000_000;

function formatMapAmount(value) {
  const v = Number(value || 0);
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(0) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
  return String(Math.round(v));
}

function getMapBucket(value, buckets) {
  if (value === null || value === undefined) return 'none';
  if (value <= buckets.lowMax) return 'low';
  if (value <= buckets.midMax) return 'mid';
  return 'high';
}

function buildMapBuckets(values) {
  const fixed = { lowMax: MAP_BUCKET_LOW_MAX, midMax: MAP_BUCKET_MID_MAX, mode: 'fixed' };
  if (!values.length) return fixed;

  const fixedKinds = new Set(values.map(v => getMapBucket(v, fixed)));
  if (fixedKinds.size > 1) return fixed;

  const sorted = [...values].sort((a, b) => a - b);
  const lowIdx = Math.floor((sorted.length - 1) * 0.33);
  const midIdx = Math.floor((sorted.length - 1) * 0.66);
  const lowMax = sorted[Math.max(0, lowIdx)] || fixed.lowMax;
  const midRaw = sorted[Math.max(0, midIdx)] || fixed.midMax;
  const midMax = Math.max(midRaw, lowMax + 1);

  return { lowMax, midMax, mode: 'adaptive' };
}

function hashText(text) {
  const input = String(text ?? '');
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getStablePieColor(label, index) {
  const name = String(label ?? '').trim();
  if (!name) return PALETTE[index % PALETTE.length];
  if (/^other(\s*\(|$)/i.test(name)) return '#94a3b8';
  return PALETTE[hashText(name) % PALETTE.length];
}

function getChartEntryCap(type, availableCount) {
  const dataCap = Math.max(1, Number(availableCount) || 1);
  const typeCap = type === 'pie' ? 10 : 30;
  return Math.min(typeCap, dataCap);
}

function getChartEntryChoices(type, availableCount) {
  const cap = getChartEntryCap(type, availableCount);
  const choices = ENTRY_LIMIT_CHOICES.filter(n => n <= cap);
  if (!choices.length || choices[choices.length - 1] !== cap) choices.push(cap);
  return Array.from(new Set(choices)).sort((a, b) => a - b);
}

function updateEntryLimitSelect(type, availableCount, currentValue) {
  const select = document.getElementById('entries-limit-' + type);
  if (!select) return;

  const choices = getChartEntryChoices(type, availableCount);
  const nextValue = Math.min(
    Math.max(1, Number(currentValue) || DEFAULT_ENTRY_LIMITS[type] || 30),
    getChartEntryCap(type, availableCount)
  );

  select.innerHTML = choices.map(value => `<option value="${value}">${value} entries</option>`).join('');
  select.value = String(choices.includes(nextValue) ? nextValue : choices[choices.length - 1]);
}

const state = {
  allRows:     [],
  headers:     [],
  numericCols: [],
  filename:    '',
  chartTableRows: { line: [], bar: [], area: [], pie: [] },
  map: { instance: null, layer: null, loaded: false },
  theme:       localStorage.getItem('dc-theme') || 'dark',
  isRendering: false,
  renderTimeout: null,
  chartsToRender: new Set(),
  charts: {
    line: { instance: null, activeKeys: [], displayCol: '', filterCol: '', filterVal: '', filterCol2: '', filterVal2: '', filterCol3: '', filterVal3: '', entryLimit: 30, sortOrder: 'default', selectionMode: 'current', drillLabel: '' },
    bar:  { instance: null, activeKeys: [], displayCol: '', filterCol: '', filterVal: '', filterCol2: '', filterVal2: '', filterCol3: '', filterVal3: '', entryLimit: 25, sortOrder: 'default', selectionMode: 'current', drillLabel: '' },
    area: { instance: null, activeKeys: [], displayCol: '', filterCol: '', filterVal: '', filterCol2: '', filterVal2: '', filterCol3: '', filterVal3: '', entryLimit: 20, sortOrder: 'default', selectionMode: 'current', drillLabel: '' },
    pie:  { instance: null, activeKeys: [], displayCol: '', filterCol: '', filterVal: '', filterCol2: '', filterVal2: '', filterCol3: '', filterVal3: '', entryLimit: 8, sortOrder: 'default', selectionMode: 'current', drillLabel: '' },
  }
};

// Intelligently pick the best column for each chart type based on actual data
function resolveDefault(type) {
  const nonNumeric = state.headers.filter(h => !state.numericCols.includes(h));
  
  if (nonNumeric.length === 0) {
    // Fallback: if no non-numeric columns, use first column
    return state.headers[0] || '';
  }
  
  // Type-specific smart selection
  if (type === 'line') {
    // Prefer date/time-like columns for line charts
    const dateKeywords = ['date', 'time', 'month', 'year', 'period', 'fy'];
    const dateCol = nonNumeric.find(h => dateKeywords.some(k => h.toLowerCase().includes(k)));
    return dateCol || nonNumeric[0];
  }
  
  if (type === 'bar') {
    // Prefer shorter category columns for bar charts
    const shortCol = nonNumeric.find(h => h.length < 15);
    return shortCol || nonNumeric[0];
  }
  
  if (type === 'area') {
    // Prefer location/category columns for area, but different from bar (which uses short columns)
    // Try to use the second non-numeric column if available to differentiate from bar
    const categoryKeywords = ['region', 'city', 'category', 'type', 'department', 'district'];
    const catCol = nonNumeric.find(h => categoryKeywords.some(k => h.toLowerCase().includes(k)));
    if (catCol && nonNumeric[0] !== catCol) return catCol;
    // If only one non-numeric column, use it; otherwise use second if available
    return nonNumeric.length > 1 ? nonNumeric[1] : nonNumeric[0];
  }
  
  if (type === 'pie') {
    // Prefer columns with few unique values for pie
    const uniqueCounts = nonNumeric.map(col => ({
      col,
      unique: new Set(state.allRows.map(r => r[col])).size
    }));
    const fewUnique = uniqueCounts.find(({ unique }) => unique <= 10);
    return fewUnique?.col || nonNumeric[0];
  }
  
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

function normFilterVal(v) {
  return String(v ?? '').trim();
}

function getUniqueValues(rows, col) {
  if (!col) return [];
  return Array.from(new Set(rows.map(r => normFilterVal(r[col])).filter(v => v !== ''))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

function getAggregateScore(row, numericKeys) {
  return numericKeys.reduce((sum, key) => sum + Number(row[key] || 0), 0);
}

function sortChartRows(rows, type, numericKeys, sortOrder) {
  const mode = sortOrder || 'default';
  if (mode === 'default' || !rows.length) return rows.slice();

  return rows.slice().sort((a, b) => {
    const diff = getAggregateScore(a, numericKeys) - getAggregateScore(b, numericKeys);
    return mode === 'asc' ? diff : -diff;
  });
}

function getChartSourceRows(type, groupCol) {
  const cs = state.charts[type];
  let rows = applyChartFilters(type);
  if (cs?.drillLabel && groupCol) {
    const target = normFilterVal(cs.drillLabel);
    rows = rows.filter(r => normFilterVal(r[groupCol]) === target);
  }
  return rows;
}

function selectChartRows(rows, entryLimit, selectionMode, numericKeys) {
  const mode = selectionMode || 'current';
  const limit = Math.max(1, Number(entryLimit) || 1);

  if (!rows.length) return [];

  if (mode === 'top' || mode === 'bottom') {
    const ranked = rows.slice().sort((a, b) => {
      const diff = getAggregateScore(a, numericKeys) - getAggregateScore(b, numericKeys);
      return mode === 'top' ? -diff : diff;
    });
    return ranked.slice(0, limit);
  }

  return rows.slice(0, limit);
}

function setChartDrillLabel(type, label) {
  const cs = state.charts[type];
  if (!cs) return;
  const nextLabel = String(label ?? '').trim();
  if (!nextLabel) return;
  cs.drillLabel = nextLabel;
  renderChart(type);
}

function resetChartState(type) {
  const cs = state.charts[type];
  if (!cs) return;

  cs.filterCol = '';
  cs.filterVal = '';
  cs.filterCol2 = '';
  cs.filterVal2 = '';
  cs.filterCol3 = '';
  cs.filterVal3 = '';
  cs.sortOrder = DEFAULT_SORT_ORDERS[type] || 'default';
  cs.selectionMode = DEFAULT_SELECTION_MODES[type] || 'current';
  cs.entryLimit = DEFAULT_ENTRY_LIMITS[type] || 30;
  cs.drillLabel = '';
  cs.displayCol = resolveDefault(type);
  cs.activeKeys = [...state.numericCols];

  renderChart(type);
  buildFilterPanel(type);
  buildSeriesPanel(type);
  buildChartNote(type);
}

function findHeaderByKeywords(keywords, exclude = []) {
  const skip = new Set(exclude);
  return state.headers.find(h => {
    if (skip.has(h)) return false;
    const low = String(h).toLowerCase();
    return keywords.some(k => low.includes(k));
  }) || '';
}

function getHierarchyHints() {
  const level1 = findHeaderByKeywords(['region', 'province', 'state', 'district', 'area']);
  const level2 = findHeaderByKeywords(['city', 'municipality', 'town'], [level1]);
  const level3 = findHeaderByKeywords(['barangay', 'project', 'site', 'location', 'name'], [level1, level2]);

  return {
    level1: level1 || 'Region/Area',
    level2: level2 || 'City/Municipality',
    level3: level3 || 'Specific location/project'
  };
}

function applyChartFilters(type, sourceRows = state.allRows) {
  const cs = state.charts[type];
  if (!cs) return sourceRows;

  let out = sourceRows;
  if (cs.filterCol && cs.filterVal) {
    const v1 = normFilterVal(cs.filterVal);
    out = out.filter(r => normFilterVal(r[cs.filterCol]) === v1);
  }
  if (cs.filterCol2 && cs.filterVal2) {
    const v2 = normFilterVal(cs.filterVal2);
    out = out.filter(r => normFilterVal(r[cs.filterCol2]) === v2);
  }
  if (cs.filterCol3 && cs.filterVal3) {
    const v3 = normFilterVal(cs.filterVal3);
    out = out.filter(r => normFilterVal(r[cs.filterCol3]) === v3);
  }
  return out;
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
    state.charts[t].filterCol   = '';
    state.charts[t].filterVal   = '';
    state.charts[t].filterCol2  = '';
    state.charts[t].filterVal2  = '';
    state.charts[t].filterCol3  = '';
    state.charts[t].filterVal3  = '';
    state.charts[t].entryLimit  = DEFAULT_ENTRY_LIMITS[t] || 30;
    state.charts[t].sortOrder   = DEFAULT_SORT_ORDERS[t] || 'default';
    state.charts[t].selectionMode = DEFAULT_SELECTION_MODES[t] || 'current';
    state.charts[t].drillLabel   = '';
    state.chartTableRows[t]     = [];
  });

  const total = numeric[0] ? normalized.reduce((s, r) => s + Number(r[numeric[0]] || 0), 0) : 0;
  updateStats(rows.length, fields.length, numeric, total);
  renderPhilippinesMap().catch(err => console.error('Map render error:', err));
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
  if (badge) { badge.textContent = 'Active file: ' + state.filename; badge.classList.remove('hidden'); }
}

function updateStats(totalRows, colCount, numeric, total) {
  document.getElementById('stat-rows').textContent        = totalRows.toLocaleString();
  document.getElementById('stat-cols').textContent        = colCount;
  document.getElementById('stat-series').textContent      = numeric.length;
  document.getElementById('stat-total').textContent       = fmtNum(total);
  document.getElementById('stat-total-label').textContent = (numeric[0] || 'Value') + ' Total';
}

function normalizeMapText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '');
  const expanded = clean.length === 3 ? clean.split('').map(ch => ch + ch).join('') : clean;
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

function mixHex(start, end, amount) {
  const from = hexToRgb(start);
  const to = hexToRgb(end);
  return rgbToHex({
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
  });
}

function getMapRegionColumn() {
  return findHeaderByKeywords(['region']);
}

function getMapCostColumn() {
  const exact = state.headers.find(h => /cost/i.test(h));
  if (exact) return exact;
  return state.numericCols[0] || '';
}

function buildRegionCostRows() {
  const regionCol = getMapRegionColumn();
  const costCol = getMapCostColumn();
  if (!regionCol || !costCol) return { regionCol: '', costCol: '', items: [], maxCost: 0 };

  const totals = new Map();
  state.allRows.forEach(row => {
    const region = String(row[regionCol] ?? '').trim();
    if (!region) return;
    const cost = Number(row[costCol] || 0);
    totals.set(region, (totals.get(region) || 0) + (Number.isFinite(cost) ? cost : 0));
  });

  const items = Array.from(totals.entries()).map(([name, value]) => ({ name, value }));
  const maxCost = items.reduce((max, item) => Math.max(max, item.value), 0);
  return { regionCol, costCol, items, maxCost };
}

function findRegionCost(featureName, items) {
  const target = normalizeMapText(featureName);
  if (!target) return null;
  for (const item of items) {
    const name = normalizeMapText(item.name);
    if (!name) continue;
    if (target === name || target.includes(name) || name.includes(target)) return item.value;
  }
  return null;
}

async function renderPhilippinesMap() {
  const mapEl = document.getElementById('ph-map');
  const legendEl = document.getElementById('map-legend');
  if (!mapEl || !legendEl || typeof L === 'undefined') return;

  if (!state.allRows.length) {
    mapEl.innerHTML = '<div class="h-full flex items-center justify-center text-slate-400 text-sm">Load a dataset to view the map.</div>';
    legendEl.innerHTML = '';
    return;
  }

  const { regionCol, costCol, items } = buildRegionCostRows();
  if (!regionCol || !costCol || !items.length) {
    mapEl.innerHTML = '<div class="h-full flex items-center justify-center text-slate-400 text-sm">No region or cost column found for the map.</div>';
    legendEl.innerHTML = '';
    return;
  }

  const values = items
    .map(item => Number(item.value))
    .filter(v => Number.isFinite(v) && v >= 0);
  const buckets = buildMapBuckets(values);

  if (!state.map.instance) {
    state.map.instance = L.map('ph-map', { zoomControl: true, scrollWheelZoom: false, minZoom: 4, maxZoom: 10 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.map.instance);
  }

  if (state.map.layer) {
    state.map.layer.remove();
    state.map.layer = null;
  }

  const dk = state.theme === 'dark';
  const lowColor = dk ? '#1d4ed8' : '#93c5fd';
  const midColor = dk ? '#3b82f6' : '#3b82f6';
  const highColor = dk ? '#7c3aed' : '#1e3a8a';
  const borderColor = dk ? '#dbeafe' : '#1e3a8a';

  const geo = await fetch(PH_MAP_GEOJSON_URL, { credentials: 'omit' }).then(resp => {
    if (!resp.ok) throw new Error('Map data fetch failed');
    return resp.json();
  });

  state.map.layer = L.geoJSON(geo, {
    style: feature => {
      const regionName = feature.properties?.adm1_en || feature.properties?.name || '';
      const value = findRegionCost(regionName, items);
      const hasValue = value !== null;
      let fillColor = dk ? '#334155' : '#e2e8f0';
      if (hasValue) {
        const bucket = getMapBucket(value, buckets);
        if (bucket === 'low') fillColor = lowColor;
        else if (bucket === 'mid') fillColor = midColor;
        else fillColor = highColor;
      }
      return {
        color: borderColor,
        weight: 1,
        fillColor,
        fillOpacity: hasValue ? 0.68 : 0.28,
      };
    },
    onEachFeature: (feature, layer) => {
      const regionName = feature.properties?.adm1_en || feature.properties?.name || 'Unknown region';
      const value = findRegionCost(regionName, items);
      const hasValue = value !== null;
      const formatted = hasValue ? value.toLocaleString() : 'No data';
      let bucketLabel = 'No data';
      if (hasValue) {
        const bucket = getMapBucket(value, buckets);
        const lowText = formatMapAmount(buckets.lowMax);
        const midText = formatMapAmount(buckets.midMax);
        if (bucket === 'low') bucketLabel = `Low (0-${lowText})`;
        else if (bucket === 'mid') bucketLabel = `Mid (${lowText}-${midText})`;
        else bucketLabel = `High (${midText}+)`;
      }

      layer.bindTooltip(
        `<div style="font-family: IBM Plex Sans, sans-serif; font-size: 12px;">
          <div style="font-weight: 700; margin-bottom: 4px;">${escHtml(regionName)}</div>
          <div>Cost: ${formatted}</div>
          <div>Bucket: ${bucketLabel}</div>
        </div>`,
        { sticky: true, direction: 'top', opacity: 0.95 }
      );

      layer.on({
        mouseover: e => {
          e.target.setStyle({ weight: 2, fillOpacity: 0.9 });
          e.target.bringToFront();
        },
        mouseout: e => {
          state.map.layer && state.map.layer.resetStyle(e.target);
        },
      });
    }
  }).addTo(state.map.instance);

  const bounds = state.map.layer.getBounds();
  if (bounds.isValid()) state.map.instance.fitBounds(bounds.pad(0.08));
  else state.map.instance.setView([12.8797, 121.7740], 5);

  const lowText = formatMapAmount(buckets.lowMax);
  const midText = formatMapAmount(buckets.midMax);
  const bucketNote = buckets.mode === 'adaptive' ? ' (auto-scaled)' : '';

  legendEl.innerHTML = `
    <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded-sm" style="background:${lowColor}"></span> Low 0-${lowText}</span>
    <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded-sm" style="background:${midColor}"></span> Mid ${lowText}-${midText}</span>
    <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded-sm" style="background:${highColor}"></span> High ${midText}+</span>
    <span class="text-[10px] text-slate-400">${bucketNote}</span>
  `;

  state.map.loaded = true;
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
  // Wire up the Clear button next to the global select (if present)
  const clearBtn = document.getElementById('label-clear-btn');
  if (clearBtn) {
    clearBtn.onclick = () => {
      sel.value = '';
      // restore each chart's default display column
      CHART_TYPES.forEach(t => { state.charts[t].displayCol = resolveDefault(t); state.chartsToRender.add(t); });
      showLoadingOverlay();
      setTimeout(() => { renderAllCharts(); hideLoadingOverlay(); }, 400);
    };
  }
}

// Per-chart FILTER BY VALUE with three cascading levels
function buildFilterPanel(type) {
  const filterColSel = document.getElementById('filter-col-' + type);
  const valSel       = document.getElementById('filter-val-' + type);
  const col2Sel      = document.getElementById('filter-col2-' + type);
  const val2Sel      = document.getElementById('filter-val2-' + type);
  const col3Sel      = document.getElementById('filter-col3-' + type);
  const val3Sel      = document.getElementById('filter-val3-' + type);
  const clearBtn     = document.getElementById('filter-clear-' + type);
  if (!filterColSel || !valSel || !col2Sel || !val2Sel || !col3Sel || !val3Sel || !clearBtn) return;

  const cs = state.charts[type];
  const hints = getHierarchyHints();
  const guide = document.getElementById('filter-guide-' + type);
  const hasLevel1 = !!cs.filterCol;
  const hasLevel1Value = hasLevel1 && !!cs.filterVal;
  const hasLevel2 = hasLevel1Value && !!cs.filterCol2;
  const hasLevel2Value = hasLevel2 && !!cs.filterVal2;
  const hasLevel3 = hasLevel2Value && !!cs.filterCol3;

  const opt = (value, selected = false) => `<option value="${String(value).replace(/"/g, '&quot;')}"${selected ? ' selected' : ''}>${escHtml(value)}</option>`;

  const primaryColOptions = [`<option value="">Level 1 column (e.g., ${escHtml(hints.level1)})</option>`].concat(
    state.headers.map(h => opt(h, h === cs.filterCol))
  );
  filterColSel.innerHTML = primaryColOptions.join('');
  valSel.classList.toggle('hidden', !hasLevel1);
  valSel.disabled = !hasLevel1;

  const secondaryCols = state.headers.filter(h => h !== cs.filterCol);
  const secondaryColOptions = [`<option value="">Level 2 column (e.g., ${escHtml(hints.level2)})</option>`].concat(
    secondaryCols.map(h => opt(h, h === cs.filterCol2))
  );

  col2Sel.classList.toggle('hidden', !hasLevel1Value);
  col2Sel.disabled = !hasLevel1Value;
  col2Sel.innerHTML = secondaryColOptions.join('');

  const primaryValues = cs.filterCol ? getUniqueValues(state.allRows, cs.filterCol) : [];
  valSel.innerHTML = `<option value="">All ${escHtml(cs.filterCol || hints.level1)}</option>` + primaryValues.map(v => opt(v, v === cs.filterVal)).join('');

  const rowsAfterPrimary = cs.filterCol && cs.filterVal
    ? state.allRows.filter(r => normFilterVal(r[cs.filterCol]) === normFilterVal(cs.filterVal))
    : state.allRows;

  const secondaryValues = cs.filterCol2 ? getUniqueValues(rowsAfterPrimary, cs.filterCol2) : [];
  val2Sel.classList.toggle('hidden', !hasLevel1Value || !cs.filterCol2);
  val2Sel.disabled = !hasLevel1Value || !cs.filterCol2;
  val2Sel.innerHTML = `<option value="">All ${escHtml(cs.filterCol2 || hints.level2)}</option>` + secondaryValues.map(v => opt(v, v === cs.filterVal2)).join('');

  const tertiaryCols = state.headers.filter(h => h !== cs.filterCol && h !== cs.filterCol2);
  const tertiaryColOptions = [`<option value="">Level 3 column (e.g., ${escHtml(hints.level3)})</option>`].concat(
    tertiaryCols.map(h => opt(h, h === cs.filterCol3))
  );
  col3Sel.classList.toggle('hidden', !hasLevel2Value);
  col3Sel.disabled = !hasLevel2Value;
  col3Sel.innerHTML = tertiaryColOptions.join('');

  const rowsAfterSecondary = cs.filterCol2 && cs.filterVal2
    ? rowsAfterPrimary.filter(r => normFilterVal(r[cs.filterCol2]) === normFilterVal(cs.filterVal2))
    : rowsAfterPrimary;
  const tertiaryValues = cs.filterCol3 ? getUniqueValues(rowsAfterSecondary, cs.filterCol3) : [];
  val3Sel.classList.toggle('hidden', !hasLevel2Value || !cs.filterCol3);
  val3Sel.disabled = !hasLevel2Value || !cs.filterCol3;
  val3Sel.innerHTML = `<option value="">All ${escHtml(cs.filterCol3 || hints.level3)}</option>` + tertiaryValues.map(v => opt(v, v === cs.filterVal3)).join('');

  if (guide) {
    guide.textContent = hasLevel3
      ? `1) Choose ${cs.filterCol}. 2) Choose ${cs.filterCol2}. 3) Choose ${cs.filterCol3}.`
      : hasLevel2Value
        ? `1) Choose ${cs.filterCol}. 2) Choose ${cs.filterCol2}. Now pick the third column if needed.`
        : hasLevel1Value
          ? `1) Choose ${cs.filterCol}. Now pick the second column.`
          : `Start with the first column, then pick a value before the next filter unlocks.`;
  }

  clearBtn.classList.toggle('hidden', !(cs.filterCol || cs.filterVal || cs.filterCol2 || cs.filterVal2 || cs.filterCol3 || cs.filterVal3));

  filterColSel.onchange = null;
  valSel.onchange = null;
  col2Sel.onchange = null;
  val2Sel.onchange = null;
  col3Sel.onchange = null;
  val3Sel.onchange = null;
  clearBtn.onclick = null;

  filterColSel.onchange = () => {
    cs.filterCol = filterColSel.value;
    cs.filterVal = '';
    cs.filterCol2 = '';
    cs.filterVal2 = '';
    cs.filterCol3 = '';
    cs.filterVal3 = '';
    cs.drillLabel = '';
    cs.displayCol = cs.filterCol || resolveDefault(type);
    buildFilterPanel(type);
    updateFilterBadge(type);
    state.chartsToRender.add(type);
    debounceRender();
  };

  valSel.onchange = () => {
    cs.filterVal = valSel.value;
    cs.drillLabel = '';
    if (cs.filterCol2 && cs.filterVal2) {
      const rowsScoped = cs.filterVal
        ? state.allRows.filter(r => normFilterVal(r[cs.filterCol]) === normFilterVal(cs.filterVal))
        : state.allRows;
      const allowed = getUniqueValues(rowsScoped, cs.filterCol2);
      if (!allowed.includes(cs.filterVal2)) cs.filterVal2 = '';
    }
    cs.filterVal3 = '';
    buildFilterPanel(type);
    updateFilterBadge(type);
    state.chartsToRender.add(type);
    debounceRender();
  };

  col2Sel.onchange = () => {
    cs.filterCol2 = col2Sel.value;
    cs.filterVal2 = '';
    cs.filterCol3 = '';
    cs.filterVal3 = '';
    cs.drillLabel = '';
    buildFilterPanel(type);
    updateFilterBadge(type);
    state.chartsToRender.add(type);
    debounceRender();
  };

  val2Sel.onchange = () => {
    cs.filterVal2 = val2Sel.value;
    cs.filterVal3 = '';
    cs.drillLabel = '';
    buildFilterPanel(type);
    updateFilterBadge(type);
    state.chartsToRender.add(type);
    debounceRender();
  };

  col3Sel.onchange = () => {
    cs.filterCol3 = col3Sel.value;
    cs.filterVal3 = '';
    cs.drillLabel = '';
    buildFilterPanel(type);
    updateFilterBadge(type);
    state.chartsToRender.add(type);
    debounceRender();
  };

  val3Sel.onchange = () => {
    cs.filterVal3 = val3Sel.value;
    cs.drillLabel = '';
    updateFilterBadge(type);
    state.chartsToRender.add(type);
    debounceRender();
  };

  clearBtn.onclick = () => {
    cs.filterCol = '';
    cs.filterVal = '';
    cs.filterCol2 = '';
    cs.filterVal2 = '';
    cs.filterCol3 = '';
    cs.filterVal3 = '';
    cs.drillLabel = '';
    cs.displayCol = resolveDefault(type);
    buildFilterPanel(type);
    updateFilterBadge(type);
    state.chartsToRender.add(type);
    debounceRender();
  };

  updateFilterBadge(type);
}

function updateFilterBadge(type) {
  const badge      = document.getElementById('badge-filter-' + type);
  const cs         = state.charts[type];
  const displayCol = cs.displayCol;
  if (!badge) return;
  const esc = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const parts = [];
  if (displayCol) parts.push(['Group', displayCol]);
  if (cs.filterCol) parts.push(['Filter', cs.filterVal ? cs.filterCol + ': ' + cs.filterVal : cs.filterCol]);
  if (cs.drillLabel) parts.push(['Clicked', cs.drillLabel]);
  if (cs.filterCol2) parts.push(['Level 2', cs.filterVal2 ? cs.filterCol2 + ': ' + cs.filterVal2 : cs.filterCol2]);
  if (cs.filterCol3) parts.push(['Level 3', cs.filterVal3 ? cs.filterCol3 + ': ' + cs.filterVal3 : cs.filterCol3]);
  if (parts.length) {
    badge.innerHTML = parts.map(([label, value]) => {
      return '<span class="block"><span class="font-semibold text-blue-200">' + esc(label) + ':</span> ' + esc(value) + '</span>';
    }).join('');
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

  const selectionSelect = document.getElementById('selection-mode-' + type);
  if (selectionSelect && selectionSelect.value !== (cs.selectionMode || 'current')) {
    selectionSelect.value = cs.selectionMode || 'current';
  }

  const groupCol      = cs.filterCol || cs.displayCol || state.headers.find(h => !state.numericCols.includes(h)) || state.headers[0];
  const sourceRows    = getChartSourceRows(type, groupCol);
  const visibleKeys = cs.activeKeys.filter(k => state.numericCols.includes(k));
  let agg           = aggregateByLabel(sourceRows, groupCol, state.numericCols);
  const availableCount = type === 'pie'
    ? agg.filter(r => Number(r[cs.activeKeys[0] || state.numericCols[0]] || 0) > 0).length
    : agg.length;
  const entryLimit  = Math.max(1, Math.min(getChartEntryCap(type, availableCount), Number(cs.entryLimit) || DEFAULT_ENTRY_LIMITS[type] || 30));

  cs.entryLimit = entryLimit;

  updateEntryLimitSelect(type, availableCount, entryLimit);

  const numericForSort = visibleKeys.length ? visibleKeys : (state.numericCols.length ? [state.numericCols[0]] : []);
  agg = selectChartRows(agg, entryLimit, cs.selectionMode, numericForSort);

  if (cs.sortOrder && cs.sortOrder !== 'default') {
    agg = sortChartRows(agg, type, numericForSort, cs.sortOrder);
  }

  renderChartTable(type, sourceRows, entryLimit, cs.selectionMode, numericForSort);

  const entryBadge = document.getElementById('badge-entries-' + type);

  if (type === 'pie') {
    const pieCol    = cs.activeKeys[0] || state.numericCols[0];
    const pieSorted = agg
      .map(r => ({ name: String(r[groupCol] ?? ''), value: Number(r[pieCol] ?? 0) }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);

    let pieSlices = pieSorted.slice();
    if (cs.sortOrder === 'asc') pieSlices = pieSlices.reverse();
    const pieCap = Math.min(entryLimit, MAX_PIE_SLICES, pieSlices.length || 1);
    let slices = pieSlices.slice(0, pieCap);
    const rem  = pieSlices.slice(pieCap);
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
          backgroundColor: slices.map((d, i) => getStablePieColor(d.name, i)),
          hoverBackgroundColor: slices.map((d, i) => getStablePieColor(d.name, i)),
          hoverOffset: 10,
          borderWidth: 2, borderColor: dk ? '#1e293b' : '#ffffff'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, resizeDelay: 100,
        animation: { duration: 700, easing: 'easeOutQuart', animateRotate: true, animateScale: true },
        layout: { padding: { right: 10 } },
        onClick: (event, elements, chart) => {
          if (!elements?.length) return;
          const index = elements[0].index;
          const label = chart.data.labels?.[index];
          if (label !== undefined) setChartDrillLabel(type, label);
        },
        plugins: {
          legend: {
            display: true, position: 'right',
            onClick: (event, legendItem, legend) => {
              const label = legendItem?.text;
              if (label !== undefined) setChartDrillLabel(type, label);
            },
            labels: {
              color: dk ? '#64748b' : '#475569', font: { size: 10 }, padding: 12, usePointStyle: true, boxWidth: 6,
              generateLabels: chart => chart.data.labels.map((label, i) => ({
                text: String(label), fillStyle: getStablePieColor(label, i),
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

  if (agg.length > entryLimit) {
    const step = Math.ceil(agg.length / entryLimit);
    agg = agg.filter((_, i) => i % step === 0).slice(0, entryLimit);
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
      options: {
        ...defaults,
        onClick: (event, elements, chart) => {
          if (!elements?.length) return;
          const index = elements[0].index;
          const label = chart.data.labels?.[index];
          if (label !== undefined) setChartDrillLabel(type, label);
        }
      }
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
      options: {
        ...defaults,
        plugins: { ...defaults.plugins, filler: { propagate: false } },
        onClick: (event, elements, chart) => {
          if (!elements?.length) return;
          const index = elements[0].index;
          const label = chart.data.labels?.[index];
          if (label !== undefined) setChartDrillLabel(type, label);
        }
      }
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
      options: {
        ...defaults,
        barPercentage: 0.7,
        categoryPercentage: 0.8,
        onClick: (event, elements, chart) => {
          if (!elements?.length) return;
          const index = elements[0].index;
          const label = chart.data.labels?.[index];
          if (label !== undefined) setChartDrillLabel(type, label);
        }
      }
    };
  }

  if (type === 'pie') {
    config.options = {
      ...config.options,
      onClick: (event, elements, chart) => {
        if (!elements?.length) return;
        const index = elements[0].index;
        const label = chart.data.labels?.[index];
        if (label !== undefined) setChartDrillLabel(type, label);
      }
    };
  }

  lockCanvasHeight(canvas, 260);
  cs.instance = new Chart(canvas, config);
}

function renderChartTable(type, rows, entryLimit = 30, selectionMode = 'current', numericKeys = []) {
  const head = document.getElementById('table-head-' + type);
  const body = document.getElementById('table-body-' + type);
  const meta = document.getElementById('table-meta-' + type);
  const btn  = document.getElementById('btn-download-table-' + type);
  if (!head || !body || !meta || !btn) return;

  const limit = Math.max(5, Math.min(30, Number(entryLimit) || 30));
  const mode = selectionMode || 'current';
  const sortedRows = (mode === 'top' || mode === 'bottom')
    ? rows.slice().sort((a, b) => {
        const diff = getAggregateScore(a, numericKeys) - getAggregateScore(b, numericKeys);
        return mode === 'top' ? -diff : diff;
      })
    : rows.slice();
  const limitedRows = sortedRows.slice(0, limit);
  state.chartTableRows[type] = limitedRows;

  if (!state.headers.length || !limitedRows.length) {
    head.innerHTML = '';
    body.innerHTML = '<tr><td class="px-4 py-3 text-slate-500" colspan="1">No rows match the current filter.</td></tr>';
    meta.textContent = 'No matching rows';
    btn.classList.add('hidden');
    return;
  }

  const previewRows = limitedRows;
  head.innerHTML = '<tr>' + state.headers.map(h => `<th class="px-3 py-2 text-left font-semibold text-slate-700 whitespace-nowrap border-b border-slate-200">${escHtml(h)}</th>`).join('') + '</tr>';
  body.innerHTML = previewRows.map(r => (
    '<tr>' + state.headers.map(h => `<td class="px-3 py-2 text-slate-700 whitespace-nowrap">${escHtml(r[h])}</td>`).join('') + '</tr>'
  )).join('');

  meta.textContent = `${limitedRows.length.toLocaleString()} of ${rows.length.toLocaleString()} row(s) shown`;
  btn.classList.remove('hidden');
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function escHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// XLSX download: uses SheetJS to create a workbook and set column widths
function downloadChartTableXLSX(type) {
  const rows = state.chartTableRows[type] || [];
  if (!rows.length || !state.headers.length) { showToast('No table data to download.', 'error'); return; }

  const headers = state.headers.slice();
  const data = [headers].concat(rows.map(r => headers.map(h => r[h] == null ? '' : r[h])));

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Estimate reasonable column widths based on max content length
  ws['!cols'] = headers.map((h, i) => {
    const maxLen = data.reduce((m, row) => Math.max(m, String(row[i] ?? '').length), 0);
    const w = Math.min(80, Math.max(8, Math.ceil(maxLen * 1.15)));
    return { wch: w };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (type || 'Sheet1').slice(0,31));

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const fname = (state.filename ? state.filename.replace(/\.[^.]+$/, '') : 'data') + '-' + type + '-filtered.xlsx';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function downloadChartTableCSV(type) {
  const rows = state.chartTableRows[type] || [];
  if (!rows.length || !state.headers.length) {
    showToast('No table data to download.', 'error');
    return;
  }
  const lines = [];
  lines.push(state.headers.map(csvEscape).join(','));
  rows.forEach(r => {
    lines.push(state.headers.map(h => csvEscape(r[h])).join(','));
  });
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.download = (state.filename || 'data') + '-' + type + '-filtered.csv';
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
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
          cursor:pointer;text-align:left;transition:background 0.15s;display:flex;align-items:center;gap:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="M21 15l-5-5L5 21"></path></svg>
          Single image — all 4 charts combined
        </button>
        <button id="dl-individual" style="
          padding:12px 16px;border-radius:8px;border:1px solid ${dk?'#334155':'#cbd5e1'};
          background:transparent;color:${dk?'#94a3b8':'#475569'};font-size:13px;font-weight:600;
          cursor:pointer;text-align:left;transition:background 0.15s;display:flex;align-items:center;gap:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          ZIP archive — all 4 charts in one file
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
  modal.querySelector('#dl-individual').onclick = () => { modal.remove(); downloadZip(); };
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

async function downloadZip() {
  if (typeof JSZip === 'undefined') {
    alert('ZIP library not available. Please try individual downloads instead.');
    return;
  }

  const zip = new JSZip();
  const chartFolder = zip.folder('DataChart Charts');
  
  // Add all 4 chart images to the ZIP
  for (const type of CHART_TYPES) {
    const canvas = document.getElementById('canvas-' + type);
    if (!canvas) continue;
    
    // Convert canvas to blob and add to ZIP
    const dataUrl = canvas.toDataURL('image/png');
    const data = dataUrl.split(',')[1]; // Remove data:image/png;base64, prefix
    chartFolder.file(type + '-chart.png', data, { base64: true });
  }
  
  // Generate and download the ZIP
  try {
    const blob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.download = 'DataChart-Export.zip';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (err) {
    console.error('ZIP generation failed:', err);
    alert('Failed to create ZIP file.');
  }
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

  note.innerHTML = `
    <div style="margin-bottom:6px;">
      <span style="color:#3b82f6;font-weight:600;">Column:</span> <span style="color:#f1f5f9;font-weight:600;">${current}</span>
    </div>
    <div style="opacity:0.8;">
      ${typeGuide}
    </div>`;
}

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
    document.getElementById('btn-download-table-' + type)?.addEventListener('click', () => downloadChartTableXLSX(type));
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
    if (action === 'reset') { e.preventDefault(); resetChartState(type); }
  }, true);

  const DC = window.DATACHART;
  if (DC?.activeFile) loadServerFile(DC.activeFile);
});