'use strict';

function getTableExportRows(type, scope) {
  const chartState = state.charts[type];
  const groupCol = chartState?.filterCol || chartState?.displayCol || state.headers.find(h => !state.numericCols.includes(h)) || state.headers[0];
  if (scope === 'entries') return (state.chartTableRows[type] || []).slice();
  return getChartSourceRows(type, groupCol).slice();
}

function exportTableRows(type, format, scope) {
  const rows = getTableExportRows(type, scope);
  if (!rows.length || !state.headers.length) {
    showToast('No table data to download.', 'error');
    return;
  }

  const scopeLabel = scope === 'entries' ? 'entries' : 'filtered';
  const baseName = (state.filename || 'data').replace(/\.[^.]+$/, '') + '-' + type + '-' + scopeLabel;

  if (format === 'csv') {
    const lines = [];
    lines.push(state.headers.map(csvEscape).join(','));
    rows.forEach(r => {
      lines.push(state.headers.map(h => csvEscape(r[h])).join(','));
    });
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.download = baseName + '.csv';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    return;
  }

  const headers = state.headers.slice();
  const data = [headers].concat(rows.map(r => headers.map(h => r[h] == null ? '' : r[h])));
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = headers.map((h, i) => {
    const maxLen = data.reduce((m, row) => Math.max(m, String(row[i] ?? '').length), 0);
    const w = Math.min(80, Math.max(8, Math.ceil(maxLen * 1.15)));
    return { wch: w };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (type || 'Sheet1').slice(0, 31));
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = baseName + '.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadChartPNG(type, filename) {
  const canvas = document.getElementById('canvas-' + type); if (!canvas) return;
  const link = document.createElement('a');
  link.download = filename || type + '-chart.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function downloadAll() {
  showDownloadModal();
}

function showTableDownloadModal(type) {
  document.getElementById('dc-table-download-modal')?.remove();
  const dk = state.theme === 'dark';
  const modal = document.createElement('div');
  modal.id = 'dc-table-download-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999;';
  modal.innerHTML = `
    <div style="background:${dk ? '#1e293b' : '#ffffff'};border:1px solid ${dk ? '#334155' : '#e2e8f0'};border-radius:14px;padding:24px 26px;min-width:320px;max-width:460px;width:92%;box-shadow:0 20px 60px rgba(0,0,0,0.4);font-family:'IBM Plex Sans',sans-serif;">
      <div style="font-size:15px;font-weight:700;color:${dk ? '#f1f5f9' : '#0f172a'};margin-bottom:6px;">Download Table Data</div>
      <div style="font-size:12px;color:${dk ? '#64748b' : '#94a3b8'};margin-bottom:16px;">Choose the format and whether to export only the visible entries or the full filtered data.</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <button data-format="csv" data-scope="entries" class="table-export-option" style="padding:11px 14px;border-radius:8px;border:1px solid ${dk ? '#334155' : '#cbd5e1'};background:transparent;color:${dk ? '#e2e8f0' : '#0f172a'};text-align:left;cursor:pointer;">CSV · entries only</button>
        <button data-format="xlsx" data-scope="entries" class="table-export-option" style="padding:11px 14px;border-radius:8px;border:1px solid ${dk ? '#334155' : '#cbd5e1'};background:transparent;color:${dk ? '#e2e8f0' : '#0f172a'};text-align:left;cursor:pointer;">XLSX · entries only</button>
        <button data-format="csv" data-scope="filtered" class="table-export-option" style="padding:11px 14px;border-radius:8px;border:1px solid ${dk ? '#334155' : '#cbd5e1'};background:transparent;color:${dk ? '#e2e8f0' : '#0f172a'};text-align:left;cursor:pointer;">CSV · full filtered data</button>
        <button data-format="xlsx" data-scope="filtered" class="table-export-option" style="padding:11px 14px;border-radius:8px;border:1px solid ${dk ? '#334155' : '#cbd5e1'};background:transparent;color:${dk ? '#e2e8f0' : '#0f172a'};text-align:left;cursor:pointer;">XLSX · full filtered data</button>
        <button id="table-export-cancel" style="padding:10px 16px;border-radius:8px;border:none;background:transparent;color:${dk ? '#64748b' : '#94a3b8'};font-size:12px;cursor:pointer;margin-top:4px;">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('.table-export-option').forEach(btn => {
    btn.addEventListener('click', () => {
      exportTableRows(type, btn.dataset.format, btn.dataset.scope);
      modal.remove();
    });
  });
  modal.querySelector('#table-export-cancel').onclick = () => modal.remove();
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
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

    ctx.fillStyle = dk ? '#64748b' : '#94a3b8';
    ctx.font      = '600 11px IBM Plex Sans, sans-serif';
    const label   = type.charAt(0).toUpperCase() + type.slice(1) + ' Chart' + (col_ ? '  ·  ' + col_ : '');
    ctx.fillText(label, x, y + 14);

    ctx.strokeStyle = dk ? '#1e3a5f' : '#e2e8f0';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.roundRect(x - 1, y + LABEL_H - 1, cw + 2, ch + 2, 6);
    ctx.stroke();

    ctx.drawImage(canvas, x, y + LABEL_H, cw, ch);
  });

  const link = document.createElement('a');
  link.download = 'datachart-all.png';
  link.href = out.toDataURL('image/png');
  link.click();
}

async function downloadZip() {
  if (typeof JSZip === 'undefined') {
    alert('ZIP library not available. Please try individual downloads instead.');
    return;
  }

  const zip = new JSZip();
  const chartFolder = zip.folder('DataChart Charts');

  for (const type of CHART_TYPES) {
    const canvas = document.getElementById('canvas-' + type);
    if (!canvas) continue;

    const dataUrl = canvas.toDataURL('image/png');
    const data = dataUrl.split(',')[1];
    chartFolder.file(type + '-chart.png', data, { base64: true });
  }

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