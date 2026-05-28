'use strict';

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
  if (cs.filterCol) {
    const selected = asFilterValues(cs.filterVal);
    if (selected.length) {
      agg = agg.filter(row => selected.some(value => matchesFilterValue(row[groupCol], value, cs.filterCol)));
    }
  }
  const availableCount = type === 'pie'
    ? agg.filter(r => Number(r[cs.activeKeys[0] || state.numericCols[0]] || 0) > 0).length
    : agg.length;
  const selectedCount = cs.filterCol ? asFilterValues(cs.filterVal).length : 0;
  const entryLimit  = Math.max(
    1,
    Math.min(
      getChartEntryCap(type, availableCount),
      Math.max(Number(cs.entryLimit) || DEFAULT_ENTRY_LIMITS[type] || 30, selectedCount)
    )
  );

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
            onClick: (event, legendItem) => {
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
  } catch (e) {
    console.error('AI fix error:', e);
    showToast('AI fix failed. Check console.', 'error');
  }

  btn.disabled      = false;
  btn.innerHTML     = origHTML;
  btn.style.opacity = '';
}

function buildChartNote(type) {
  const noteId = 'chart-note-' + type;
  let note = document.getElementById(noteId);
  const canvas = document.getElementById('canvas-' + type);
  if (!canvas) return;

  const chartCard = canvas.closest('.bg-white, .bg-slate-800');
  if (!chartCard) return;

  if (!note) {
    note = document.createElement('div');
    note.id = noteId;
    note.style.cssText = `
      margin-top:10px;padding:10px 12px;border-radius:6px;font-size:11px;line-height:1.5;
      font-family:'IBM Plex Sans',sans-serif;
      background:rgba(59,130,246,0.08);
      border:1px solid rgba(59,130,246,0.18);
      color:#94a3b8;`;
    chartCard.appendChild(note);
  }

  const cs = state.charts[type];
  const current = cs.displayCol || '—';

  let typeGuide = '';
  if (type === 'line') typeGuide = 'Line: best for trends over time or sequences.';
  else if (type === 'bar') typeGuide = 'Bar: best for comparing categories.';
  else if (type === 'area') typeGuide = 'Area: best for stacked trends and cumulative changes.';
  else if (type === 'pie') typeGuide = 'Pie: best for showing composition and proportions.';

  note.innerHTML = `
    <div style="margin-bottom:6px;">
      <span style="color:#3b82f6;font-weight:600;">Column:</span> <span style="color:#f1f5f9;font-weight:600;">${current}</span>
    </div>
    <div style="opacity:0.8;">
      ${typeGuide}
    </div>`;
}