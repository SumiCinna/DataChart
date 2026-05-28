'use strict';

function processRows(rawRows, rawFields, name) {
  const { rows, fields } = stripBlankHeaders(rawRows, rawFields);
  if (!fields.length) { showToast('All columns have blank headers.', 'error'); hideLoadingOverlay(); return; }

  const numeric    = fields.filter(c => isNumericCol(rows, c)).slice(0, 8);
  const normalized = normalizeRows(rows, numeric);

  state.allRows     = normalized;
  state.headers     = fields;
  state.numericCols = numeric;
  state.filename    = name;

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
  } catch {
    showToast('Failed to parse Excel.', 'error');
    hideLoadingOverlay();
  }
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
  } catch (e) {
    showToast(`Could not load file: ${e.message}`, 'error');
    hideLoadingOverlay();
  }
}