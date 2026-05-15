'use strict';

const PALETTE = [
  '#3b82f6','#10b981','#f59e0b','#8b5cf6',
  '#ef4444','#06b6d4','#f97316','#ec4899'
];

const CHART_TYPES = ['line','bar','area','pie'];
const MAX_DISPLAY_ROWS = 50;
const MAX_CHART_POINTS = 30;
const MAX_PIE_SLICES = 6;

const state = {
  allRows:     [],
  displayRows: [],
  headers:     [],
  numericCols: [],
  labelCol:    '',
  filename:    '',
  theme:       localStorage.getItem('dc-theme') || 'dark',
  isRendering: false,
  renderTimeout: null,
  chartsToRender: new Set(),
  pieData: null, // Fixed pie data - never changes on filter
  charts: {
    line: { instance: null, activeKeys: [], filteredRows: [], filterCol: '', filterVal: '' },
    bar:  { instance: null, activeKeys: [], filteredRows: [], filterCol: '', filterVal: '' },
    area: { instance: null, activeKeys: [], filteredRows: [], filterCol: '', filterVal: '' },
    pie:  { instance: null, activeKeys: [], filteredRows: [], filterCol: '', filterVal: '' },
  }
};

function initializeLoadingOverlay() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    #render-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 9998;
    }
    
    #render-overlay.visible {
      display: flex;
    }
    
    .loader-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(59, 130, 246, 0.2);
      border-top: 3px solid #3b82f6;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    
    .loader-text {
      color: #94a3b8;
      font-size: 13px;
      font-family: 'IBM Plex Sans', sans-serif;
      letter-spacing: 0.3px;
    }
  `;
  document.head.appendChild(style);
  
  const overlay = document.createElement('div');
  overlay.id = 'render-overlay';
  overlay.innerHTML = `
    <div class="loader-container">
      <div class="spinner"></div>
      <div class="loader-text">Rendering charts...</div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function showLoadingOverlay() {
  const overlay = document.getElementById('render-overlay');
  if (overlay) {
    overlay.classList.add('visible');
  }
  state.isRendering = true;
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('render-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
  }
  state.isRendering = false;
}

function debounceRender() {
  if (state.renderTimeout) {
    clearTimeout(state.renderTimeout);
  }
  
  showLoadingOverlay();
  
  state.renderTimeout = setTimeout(() => {
    try {
      // Only render non-pie charts on filter change
      ['line', 'bar', 'area'].forEach(type => {
        if (state.chartsToRender.has(type)) {
          buildFilterPanel(type);
          buildSeriesPanel(type);
          renderChart(type);
        }
      });
      // Pie only renders if explicitly marked
      if (state.chartsToRender.has('pie')) {
        buildFilterPanel('pie');
        buildSeriesPanel('pie');
        renderChart('pie');
      }
      state.chartsToRender.clear();
    } catch (error) {
      console.error('Render error:', error);
    }
    hideLoadingOverlay();
  }, 600);
}

function renderAllCharts() {
  const hasNumeric = state.numericCols.length > 0;
  const noNumericWarn = document.getElementById('no-numeric-warn');
  if (noNumericWarn) {
    noNumericWarn.classList.toggle('hidden', hasNumeric);
  }
  
  CHART_TYPES.forEach(type => {
    buildFilterPanel(type);
    buildSeriesPanel(type);
    renderChart(type);
  });
  showDashboard();
}

function parseNum(v) {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'number') return v;
  const cleaned = String(v).replace(/[,\s$₱€£¥%]/g, '').trim();
  const n = Number(cleaned);
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
    numericCols.forEach(col => {
      const n = parseNum(row[col]);
      out[col] = isNaN(n) ? 0 : n;
    });
    return out;
  });
}

function stripBlankHeaders(rows, fields) {
  const validFields = fields.filter(isValidHeader);
  const cleanRows   = rows.map(row => {
    const clean = {};
    validFields.forEach(f => { clean[f] = row[f]; });
    return clean;
  });
  return { rows: cleanRows, fields: validFields };
}

function limitDisplayRows(rows, labelCol, numericCols) {
  const agg = aggregateByLabel(rows, labelCol, numericCols);
  if (agg.length <= MAX_DISPLAY_ROWS) {
    return agg;
  }
  
  const sortKey = numericCols[0];
  return agg
    .sort((a, b) => b[sortKey] - a[sortKey])
    .slice(0, MAX_DISPLAY_ROWS);
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

function processRows(rawRows, rawFields, name) {
  const { rows, fields } = stripBlankHeaders(rawRows, rawFields);

  if (!fields.length) {
    showToast('All columns have blank headers — nothing to display.', 'error');
    hideLoadingOverlay();
    return;
  }

  const numeric     = fields.filter(c => isNumericCol(rows, c)).slice(0, 6);
  const categorical = fields.find(c => !numeric.includes(c)) || fields[0];
  const normalized  = normalizeRows(rows, numeric);
  const limited     = limitDisplayRows(normalized, categorical, numeric);

  state.allRows     = normalized;
  state.displayRows = limited;
  state.headers     = fields;
  state.numericCols = numeric;
  state.labelCol    = categorical;
  state.filename    = name;

  // Pre-calculate pie data ONCE - it never changes
  const pieAgg = aggregateByLabel(state.displayRows, categorical, numeric);
  const pieSorted = pieAgg
    .map(r => ({ name: String(r[categorical] ?? ''), value: Number(r[numeric[0]] ?? 0) }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value);
  
  let pieSlices = pieSorted.slice(0, MAX_PIE_SLICES);
  const remaining = pieSorted.slice(MAX_PIE_SLICES);
  
  if (remaining.length > 0) {
    const otherValue = remaining.reduce((sum, d) => sum + d.value, 0);
    pieSlices.push({ name: `Other (${remaining.length})`, value: otherValue });
  }
  
  state.pieData = pieSlices;

  CHART_TYPES.forEach(t => {
    state.charts[t].activeKeys   = [...numeric];
    state.charts[t].filteredRows = [...limited];
    state.charts[t].filterCol    = '';
    state.charts[t].filterVal    = '';
  });

  updateStats(rows.length, limited.length, fields.length, numeric);
  populateLabelColSelect();
  renderAllCharts();
  hideLoadingOverlay();
}

function parseCSV(text, name) {
  Papa.parse(text, {
    header: true, dynamicTyping: false, skipEmptyLines: true,
    complete: ({ data: rows, meta }) => {
      if (!rows.length) { 
        showToast('No data found in file.', 'error');
        hideLoadingOverlay();
        return;
      }
      processRows(rows, meta.fields, name);
    },
    error: () => {
      showToast('Failed to parse CSV.', 'error');
      hideLoadingOverlay();
    }
  });
}

function parseExcel(buffer, name) {
  try {
    const wb   = XLSX.read(buffer, { type: 'array' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
    if (!rows.length) { 
      showToast('No data found in file.', 'error');
      hideLoadingOverlay();
      return;
    }
    processRows(rows, Object.keys(rows[0] || {}), name);
  } catch {
    showToast('Failed to parse Excel file.', 'error');
    hideLoadingOverlay();
  }
}

async function loadServerFile(fileInfo) {
  if (!fileInfo || !fileInfo.url) {
    showToast('File information is missing.', 'error');
    hideLoadingOverlay();
    return;
  }

  try {
    showLoadingOverlay();
    console.log('Loading file from:', fileInfo.url);
    const resp = await fetch(fileInfo.url, { 
      credentials: 'include',
      method: 'GET',
      headers: { 'Accept': '*/*' }
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }

    const contentType = resp.headers.get('content-type') || '';
    const name = fileInfo.name || 'data';
    const ext  = name.split('.').pop().toLowerCase();

    if (contentType.includes('application/json')) {
      const json = await resp.json();
      throw new Error(json.error || 'Server returned JSON error');
    }

    if (ext === 'csv' || ext === 'txt') {
      const text = await resp.text();
      if (!text || text.trim().length === 0) {
        throw new Error('File is empty');
      }
      parseCSV(text, name);
    } else if (ext === 'xlsx' || ext === 'xls') {
      const buf = await resp.arrayBuffer();
      if (!buf || buf.byteLength === 0) {
        throw new Error('File is empty or not readable');
      }
      parseExcel(new Uint8Array(buf), name);
    } else {
      try {
        const buf = await resp.arrayBuffer();
        parseExcel(new Uint8Array(buf), name);
      } catch {
        const text = await resp.text();
        parseCSV(text, name);
      }
    }
  } catch (error) {
    console.error('File load error:', error);
    showToast(`Could not load file: ${error.message}`, 'error');
    hideLoadingOverlay();
  }
}

function showToast(msg, type = 'info') {
  document.querySelectorAll('.dc-toast').forEach(el => el.remove());
  const t = document.createElement('div');
  t.className = 'dc-toast';
  const isDark = state.theme === 'dark';
  t.style.cssText = `
    position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
    background:${type === 'error' ? (isDark ? '#7f1d1d' : '#fef2f2') : (isDark ? '#1e3a8a' : '#dbeafe')};
    color:${type === 'error' ? (isDark ? '#fca5a5' : '#991b1b') : (isDark ? '#bfdbfe' : '#1e3a8a')};
    border:1px solid ${type === 'error' ? (isDark ? '#991b1b' : '#fca5a5') : (isDark ? '#1d4ed8' : '#3b82f6')};
    border-radius:8px; padding:10px 18px; font-size:13px;
    box-shadow:0 4px 24px rgba(0,0,0,0.5); z-index:9999;
    font-family:'IBM Plex Sans',sans-serif;
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.4s'; setTimeout(() => t.remove(), 400); }, 4000);
}

function showDashboard() {
  const noFile = document.getElementById('no-file-screen');
  const db     = document.getElementById('dashboard-screen');
  if (noFile) noFile.classList.add('hidden');
  db.classList.remove('hidden');
  db.classList.add('visible');

  const btn = document.getElementById('btn-download-all');
  if (btn) btn.classList.remove('hidden');

  const badge = document.getElementById('filename-badge');
  if (badge) {
    badge.textContent = '/ ' + state.filename;
    badge.classList.remove('hidden');
  }
}

function updateStats(totalRows, displayRows, colCount, numeric) {
  document.getElementById('stat-rows').textContent   = totalRows.toLocaleString();
  document.getElementById('stat-cols').textContent   = colCount;
  document.getElementById('stat-series').textContent = numeric.length;
  
  const total = numeric[0]
    ? state.allRows.reduce((s, r) => s + Number(r[numeric[0]] || 0), 0)
    : 0;
  
  document.getElementById('stat-total').textContent       = fmtNum(total);
  document.getElementById('stat-total-label').textContent = (numeric[0] || 'Value') + ' Total';
  
  const statsPanel = document.getElementById('stats-panel');
  if (statsPanel && displayRows < totalRows) {
    let infoEl = document.getElementById('display-info');
    if (!infoEl) {
      infoEl = document.createElement('div');
      infoEl.id = 'display-info';
      infoEl.style.cssText = `
        color: #94a3b8; font-size: 11px; margin-top: 8px; padding-top: 8px;
        border-top: 1px solid #334155;
      `;
      statsPanel.appendChild(infoEl);
    }
    infoEl.textContent = `Displaying top ${displayRows.toLocaleString()} of ${totalRows.toLocaleString()} rows`;
  }
}

function populateLabelColSelect() {
  const sel = document.getElementById('label-col-select');
  sel.innerHTML = '';
  state.headers.forEach(h => {
    const opt = document.createElement('option');
    opt.value = h; opt.textContent = h;
    if (h === state.labelCol) opt.selected = true;
    sel.appendChild(opt);
  });
}

function getChartDefaults() {
  const isDark = state.theme === 'dark';
  return {
    animation: false,
    animations: false,
    responsive: true,
    maintainAspectRatio: true,
    layout: { padding: 0 },
    plugins: {
      legend: { 
        display: true,
        labels: { 
          color: isDark ? '#64748b' : '#475569', 
          font: { size: 10, weight: '500' },
          padding: 12,
          usePointStyle: true,
          boxWidth: 6
        } 
      },
      tooltip: {
        enabled: true,
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        borderWidth: 1,
        titleColor: isDark ? '#f1f5f9' : '#0f172a',
        bodyColor: isDark ? '#94a3b8' : '#475569',
        titleFont: { size: 11, weight: '600' },
        bodyFont: { size: 10 },
        padding: 8,
        displayColors: true,
        boxPadding: 4,
        callbacks: {
          title: ctx => {
            const label = ctx[0]?.label ?? '';
            return Array.isArray(label) ? label.join(' ') : String(label).slice(0, 20);
          },
          label: ctx => '  ' + ctx.dataset.label + ': ' + Number(ctx.raw).toLocaleString()
        }
      }
    },
    scales: {
      x: {
        display: true,
        ticks: {
          color: isDark ? '#475569' : '#64748b',
          font: { size: 8 },
          maxRotation: 45,
          minRotation: 0,
          autoSkipPadding: 20,
          callback: function(val) {
            const label = this.getLabelForValue(val);
            return label.length > 12 ? label.slice(0, 12) + '…' : label;
          }
        },
        grid: { color: isDark ? '#1e3a5f' : '#e2e8f0', drawBorder: false }
      },
      y: {
        display: true,
        ticks: { 
          color: isDark ? '#475569' : '#64748b', 
          font: { size: 9 }, 
          callback: v => fmtTick(v)
        },
        grid: { color: isDark ? '#1e3a5f' : '#e2e8f0', drawBorder: false }
      }
    }
  };
}

function renderChart(type) {
  const canvas = document.getElementById('canvas-' + type);
  const cs     = state.charts[type];

  if (!canvas) return;

  // PIE CHART - USE FIXED DATA, NEVER FILTER
  if (type === 'pie') {
    const entryBadge = document.getElementById('badge-entries-' + type);
    if (entryBadge) {
      entryBadge.textContent = state.pieData.length + ' entries';
    }

    const filtBadge = document.getElementById('badge-filtered-' + type);
    if (filtBadge) {
      filtBadge.classList.add('hidden');
    }

    if (cs.instance) { 
      cs.instance.destroy(); 
      cs.instance = null;
    }
    
    if (!state.pieData || !state.pieData.length) return;

    const defaults = getChartDefaults();
    const isDark = state.theme === 'dark';

    const config = {
      type: 'doughnut',
      data: {
        labels:   state.pieData.map(d => d.name),
        datasets: [{
          data:            state.pieData.map(d => d.value),
          backgroundColor: PALETTE.slice(0, state.pieData.length),
          borderWidth: 2,
          borderColor: isDark ? '#1e293b' : '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        animation: false,
        animations: false,
        plugins: {
          ...defaults.plugins,
          legend: {
            ...defaults.plugins.legend,
            position: 'right',
            labels: {
              ...defaults.plugins.legend.labels,
              generateLabels: chart => chart.data.labels.map((label, i) => ({
                text: label.length > 25 ? label.slice(0, 25) + '…' : label,
                fillStyle: PALETTE[i % PALETTE.length],
                strokeStyle: isDark ? '#1e293b' : '#ffffff',
                lineWidth: 2,
                index: i
              }))
            }
          }
        }
      }
    };

    cs.instance = new Chart(canvas, config);
    return;
  }

  // OTHER CHARTS - USE FILTERED DATA
  const visibleKeys = cs.activeKeys.filter(k => state.numericCols.includes(k));
  let agg = aggregateByLabel(cs.filteredRows, state.labelCol, state.numericCols);
  
  if (agg.length > MAX_CHART_POINTS) {
    const step = Math.ceil(agg.length / MAX_CHART_POINTS);
    agg = agg.filter((_, i) => i % step === 0).slice(0, MAX_CHART_POINTS);
  }

  const entryBadge = document.getElementById('badge-entries-' + type);
  if (entryBadge) {
    entryBadge.textContent = agg.length + ' entries';
  }

  const filtBadge = document.getElementById('badge-filtered-' + type);
  if (filtBadge) {
    if (cs.filteredRows.length < state.displayRows.length) {
      filtBadge.textContent = cs.filteredRows.length.toLocaleString() + ' rows';
      filtBadge.classList.remove('hidden');
    } else {
      filtBadge.classList.add('hidden');
    }
  }

  if (cs.instance) { 
    cs.instance.destroy(); 
    cs.instance = null;
  }
  
  if (!visibleKeys.length || !agg.length) return;

  const labels = agg.map(r => String(r[state.labelCol] ?? ''));
  const defaults = getChartDefaults();
  const isDark = state.theme === 'dark';
  let config;

  if (type === 'area') {
    const datasets = visibleKeys.map((k, i) => {
      const color = PALETTE[i % PALETTE.length];
      return { 
        label: k, 
        data: agg.map(r => r[k]),
        backgroundColor: color + '15',
        borderColor: color,
        borderWidth: 1.5,
        fill: true,
        tension: 0.2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointBackgroundColor: color,
        clip: false
      };
    });

    config = {
      type: 'line',
      data: { labels, datasets },
      options: {
        ...defaults,
        plugins: defaults.plugins,
        scales: defaults.scales
      }
    };
  } else if (type === 'line') {
    const datasets = visibleKeys.map((k, i) => {
      const color = PALETTE[i % PALETTE.length];
      return { 
        label: k, 
        data: agg.map(r => r[k]),
        borderColor: color,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        fill: false,
        tension: 0.2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointBackgroundColor: color,
        pointBorderColor: color,
        clip: false
      };
    });

    config = {
      type: 'line',
      data: { labels, datasets },
      options: {
        ...defaults,
        plugins: defaults.plugins,
        scales: defaults.scales
      }
    };
  } else {
    const datasets = visibleKeys.map((k, i) => {
      const color = PALETTE[i % PALETTE.length];
      return { 
        label: k, 
        data: agg.map(r => r[k]),
        backgroundColor: color + 'bb', 
        borderRadius: 2,
        borderColor: 'transparent',
        borderWidth: 0
      };
    });

    config = {
      type: 'bar',
      data: { labels, datasets },
      options: {
        ...defaults,
        plugins: defaults.plugins,
        scales: defaults.scales,
        barPercentage: 0.7,
        categoryPercentage: 0.8
      }
    };
  }

  cs.instance = new Chart(canvas, config);
}

function buildFilterPanel(type) {
  const sel = document.getElementById('filter-col-' + type);
  if (!sel) return;
  
  sel.innerHTML = '<option value="">— none —</option>';
  state.headers
    .filter(h => h !== state.labelCol && !state.numericCols.includes(h))
    .forEach(h => {
      const opt = document.createElement('option');
      opt.value = h; opt.textContent = h;
      sel.appendChild(opt);
    });
  sel.value = state.charts[type].filterCol || '';
  
  sel.onchange = null;
  sel.onchange = () => {
    const col = sel.value;
    state.charts[type].filterCol = col;
    state.charts[type].filterVal = '';
    populateFilterVals(type, col);
    
    // Only re-render THIS chart type
    state.chartsToRender.add(type);
    debounceRender();
  };
}

function populateFilterVals(type, col) {
  const valSel   = document.getElementById('filter-val-' + type);
  const clearBtn = document.getElementById('filter-clear-' + type);
  
  if (!valSel || !clearBtn) return;
  
  if (!col) {
    valSel.classList.add('hidden');
    clearBtn.classList.add('hidden');
    valSel.onchange = null;
    clearBtn.onclick = null;
    return;
  }
  
  valSel.classList.remove('hidden');
  clearBtn.classList.remove('hidden');
  
  const unique = [...new Set(state.displayRows.map(r => String(r[col] ?? '').trim()))]
    .filter(Boolean).sort().slice(0, 500);
  
  valSel.innerHTML = '<option value="">All values</option>';
  unique.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v.length > 30 ? v.slice(0, 30) + '…' : v;
    valSel.appendChild(opt);
  });
  
  valSel.value = state.charts[type].filterVal || '';
  
  valSel.onchange = null;
  valSel.onchange = () => {
    state.charts[type].filterVal = valSel.value;
    applyFilter(type);
    
    state.chartsToRender.add(type);
    debounceRender();
  };
  
  clearBtn.onclick = null;
  clearBtn.onclick = () => {
    state.charts[type].filterCol = '';
    state.charts[type].filterVal = '';
    document.getElementById('filter-col-' + type).value = '';
    valSel.classList.add('hidden');
    clearBtn.classList.add('hidden');
    state.charts[type].filteredRows = [...state.displayRows];
    
    state.chartsToRender.add(type);
    debounceRender();
  };
}

function applyFilter(type) {
  const { filterCol, filterVal } = state.charts[type];
  let filtered = state.displayRows;
  if (filterCol && filterVal) {
    filtered = state.displayRows.filter(r => String(r[filterCol] ?? '').trim() === filterVal);
  }
  state.charts[type].filteredRows = filtered;
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
    btn.className         = 'series-btn' + (active ? ' active' : '');
    btn.textContent       = k;
    btn.dataset.key       = k;
    btn.dataset.type      = type;
    btn.style.borderColor = active ? color : (state.theme === 'dark' ? '#334155' : '#cbd5e1');
    btn.style.color       = active ? color : (state.theme === 'dark' ? '#64748b' : '#64748b');
    btn.style.background  = active ? color + '20' : 'transparent';
    
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = cs.activeKeys.indexOf(k);
      if (idx >= 0) cs.activeKeys.splice(idx, 1);
      else          cs.activeKeys.push(k);
      const isNowActive     = cs.activeKeys.includes(k);
      btn.style.borderColor = isNowActive ? color : (state.theme === 'dark' ? '#334155' : '#cbd5e1');
      btn.style.color       = isNowActive ? color : (state.theme === 'dark' ? '#64748b' : '#64748b');
      btn.style.background  = isNowActive ? color + '20' : 'transparent';
      
      state.chartsToRender.add(type);
      debounceRender();
    };
    
    container.appendChild(btn);
  });
}

function downloadChartPNG(type, filename) {
  const canvas = document.getElementById('canvas-' + type);
  if (!canvas) return;
  const link   = document.createElement('a');
  link.download = filename || type + '-chart.png';
  link.href     = canvas.toDataURL('image/png');
  link.click();
}

function downloadAll() {
  CHART_TYPES.forEach((type, i) => {
    setTimeout(() => downloadChartPNG(type, type + '-chart.png'), i * 400);
  });
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('dc-theme', state.theme);
  document.documentElement.setAttribute('data-theme', state.theme);
  
  if (state.allRows.length > 0) {
    CHART_TYPES.forEach(type => renderChart(type));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializeLoadingOverlay();
  
  document.documentElement.setAttribute('data-theme', state.theme);

  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', toggleTheme);
  }

  const labelColSelect = document.getElementById('label-col-select');
  if (labelColSelect) {
    labelColSelect.addEventListener('change', e => {
      state.labelCol = e.target.value;
      CHART_TYPES.forEach(t => {
        state.charts[t].filteredRows = [...state.displayRows];
        state.charts[t].filterCol   = '';
        state.charts[t].filterVal   = '';
      });
      showLoadingOverlay();
      setTimeout(() => {
        renderAllCharts();
        hideLoadingOverlay();
      }, 600);
    });
  }

  const btnAll = document.getElementById('btn-download-all');
  if (btnAll) {
    btnAll.addEventListener('click', downloadAll);
  }

  document.addEventListener('click', e => {
    if (state.isRendering) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    
    const type   = btn.dataset.type;
    const action = btn.dataset.action;

    if (action === 'filter') {
      e.preventDefault();
      const panel  = document.getElementById('filter-panel-' + type);
      if (!panel) return;
      
      const isOpen = !panel.classList.contains('hidden');
      panel.classList.toggle('hidden', isOpen);
      btn.classList.toggle('border-brand-500', !isOpen);
      btn.classList.toggle('text-blue-300', !isOpen);
      btn.classList.toggle('bg-blue-950', !isOpen);
      
      if (!isOpen) {
        buildFilterPanel(type);
        buildSeriesPanel(type);
        if (state.charts[type].filterCol) {
          populateFilterVals(type, state.charts[type].filterCol);
        }
      }
    }

    if (action === 'download') {
      e.preventDefault();
      downloadChartPNG(type);
    }
  }, true);

  const DC = window.DATACHART;
  if (DC && DC.activeFile) {
    loadServerFile(DC.activeFile);
  }
});