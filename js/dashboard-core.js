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

const state = {
  allRows:     [],
  headers:     [],
  numericCols: [],
  filename:    '',
  chartTableRows: { line: [], bar: [], area: [], pie: [] },
  map: { instance: null, layer: null, loaded: false, selectedRegion: '', tableRows: [] },
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

function resolveDefault(type) {
  const nonNumeric = state.headers.filter(h => !state.numericCols.includes(h));

  if (nonNumeric.length === 0) return state.headers[0] || '';

  if (type === 'line') {
    const dateKeywords = ['date', 'time', 'month', 'year', 'period', 'fy'];
    const dateCol = nonNumeric.find(h => dateKeywords.some(k => h.toLowerCase().includes(k)));
    return dateCol || nonNumeric[0];
  }

  if (type === 'bar') {
    const shortCol = nonNumeric.find(h => h.length < 15);
    return shortCol || nonNumeric[0];
  }

  if (type === 'area') {
    const categoryKeywords = ['region', 'city', 'category', 'type', 'department', 'district'];
    const catCol = nonNumeric.find(h => categoryKeywords.some(k => h.toLowerCase().includes(k)));
    if (catCol && nonNumeric[0] !== catCol) return catCol;
    return nonNumeric.length > 1 ? nonNumeric[1] : nonNumeric[0];
  }

  if (type === 'pie') {
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
  if (document.getElementById('render-overlay')) return;
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
    } catch (e) {
      console.error('Render error:', e);
    }
    hideLoadingOverlay();
  }, 600);
}

function parseNum(v) {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[,\s$₱€£¥%]/g, '').trim());
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

function asFilterValues(value) {
  if (Array.isArray(value)) {
    return value.map(normFilterVal).filter(Boolean);
  }
  const single = normFilterVal(value);
  return single ? [single] : [];
}

function valuesToSummary(values, limit = 3) {
  const list = asFilterValues(values);
  if (!list.length) return '';
  if (list.length <= limit) return list.join(', ');
  return list.slice(0, limit).join(', ') + ` +${list.length - limit} more`;
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
  cs.filterVal = [];
  cs.filterCol2 = '';
  cs.filterVal2 = [];
  cs.filterCol3 = '';
  cs.filterVal3 = [];
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

function resetAllCharts() {
  CHART_TYPES.forEach(type => resetChartState(type));
  state.map.selectedRegion = '';
  state.map.tableRows = [];
  if (typeof renderMapSelectionTable === 'function') renderMapSelectionTable();
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
  const v1List = asFilterValues(cs.filterVal);
  const v2List = asFilterValues(cs.filterVal2);
  const v3List = asFilterValues(cs.filterVal3);

  if (cs.filterCol && v1List.length) {
    out = out.filter(r => v1List.some(v => matchesFilterValue(r[cs.filterCol], v, cs.filterCol)));
  }
  if (cs.filterCol2 && v2List.length) {
    out = out.filter(r => v2List.some(v => matchesFilterValue(r[cs.filterCol2], v, cs.filterCol2)));
  }
  if (cs.filterCol3 && v3List.length) {
    out = out.filter(r => v3List.some(v => matchesFilterValue(r[cs.filterCol3], v, cs.filterCol3)));
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

function isRegionLikeColumn(col) {
  return /region|province|state|district|area/i.test(String(col || ''));
}

function matchesFilterValue(cellValue, selectedValue, col) {
  const cell = normFilterVal(cellValue);
  const selected = normFilterVal(selectedValue);
  if (!cell || !selected) return false;
  if (isRegionLikeColumn(col)) {
    const cellNorm = normalizeMapText(cell);
    const selectedNorm = normalizeMapText(selected);
    return cellNorm === selectedNorm;
  }
  return cell === selected;
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