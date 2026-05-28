'use strict';

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
    CHART_TYPES.forEach(t => { state.charts[t].displayCol = sel.value; });
    showLoadingOverlay();
    setTimeout(() => { renderAllCharts(); hideLoadingOverlay(); }, 600);
  };

  const clearBtn = document.getElementById('label-clear-btn');
  if (clearBtn) {
    clearBtn.onclick = () => {
      sel.value = '';
      resetAllCharts();
      showLoadingOverlay();
      setTimeout(() => { renderAllCharts(); hideLoadingOverlay(); }, 400);
    };
  }
}

function buildFilterPanel(type) {
  const filterColSel = document.getElementById('filter-col-' + type);
  const addBtn       = document.getElementById('filter-add-' + type);
  const level1Rows   = document.getElementById('filter-level1-rows-' + type);
  const col2Sel      = document.getElementById('filter-col2-' + type);
  const val2Sel      = document.getElementById('filter-val2-' + type);
  const col3Sel      = document.getElementById('filter-col3-' + type);
  const val3Sel      = document.getElementById('filter-val3-' + type);
  const clearBtn     = document.getElementById('filter-clear-' + type);
  if (!filterColSel || !addBtn || !level1Rows || !col2Sel || !val2Sel || !col3Sel || !val3Sel || !clearBtn) return;

  const cs = state.charts[type];
  const hints = getHierarchyHints();
  const guide = document.getElementById('filter-guide-' + type);
  const hasLevel1 = !!cs.filterCol;
  const hasLevel1Value = hasLevel1 && asFilterValues(cs.filterVal).length > 0;
  const hasLevel2 = hasLevel1 && !!cs.filterCol2;
  const hasLevel2Value = hasLevel2 && asFilterValues(cs.filterVal2).length > 0;
  const hasLevel3 = hasLevel2Value && !!cs.filterCol3;

  const level1Values = asFilterValues(cs.filterVal);
  const level2Values = asFilterValues(cs.filterVal2);
  const level3Values = asFilterValues(cs.filterVal3);

  const opt = (value, selected = false) => `<option value="${String(value).replace(/"/g, '&quot;')}"${selected ? ' selected' : ''}>${escHtml(value)}</option>`;

  const primaryColOptions = [`<option value="">Level 1 column (e.g., ${escHtml(hints.level1)})</option>`].concat(
    state.headers.map(h => opt(h, h === cs.filterCol))
  );
  filterColSel.innerHTML = primaryColOptions.join('');

  const secondaryCols = state.headers.filter(h => h !== cs.filterCol);
  const secondaryColOptions = [`<option value="">Level 2 column (e.g., ${escHtml(hints.level2)})</option>`].concat(
    secondaryCols.map(h => opt(h, h === cs.filterCol2))
  );

  col2Sel.classList.toggle('hidden', !hasLevel1Value);
  col2Sel.disabled = !hasLevel1Value;
  col2Sel.innerHTML = secondaryColOptions.join('');

  const primaryValues = cs.filterCol ? getUniqueValues(state.allRows, cs.filterCol) : [];
  addBtn.classList.toggle('hidden', !hasLevel1);

  const renderLevel1Rows = () => {
    const currentValues = Array.isArray(cs.filterVal) ? cs.filterVal.slice() : asFilterValues(cs.filterVal);
    const renderValues = currentValues.length ? currentValues.slice() : [''];
    const maxRows = 10;
    const rowCount = Math.min(maxRows, Math.max(1, renderValues.length));

    level1Rows.innerHTML = '';

    for (let index = 0; index < rowCount; index += 1) {
      const selectedElsewhere = renderValues.filter((value, valueIndex) => valueIndex !== index && value);
      const allowedValues = primaryValues.filter(value => !selectedElsewhere.includes(value) || renderValues[index] === value);
      const rowWrap = document.createElement('div');
      rowWrap.className = 'flex flex-wrap gap-2 items-center';

      const select = document.createElement('select');
      select.className = 'bg-white border border-brand-600 text-black rounded-md px-2 py-1 text-xs focus:outline-none min-w-[170px]';
      const options = [`<option value="">Select value</option>`].concat(allowedValues.map(v => opt(v, renderValues[index] === v)));
      select.innerHTML = options.join('');
      select.value = renderValues[index] || '';
      select.onchange = () => {
        const next = Array.isArray(cs.filterVal) ? cs.filterVal.slice() : asFilterValues(cs.filterVal);
        while (next.length < rowCount) next.push('');
        next[index] = select.value;
        cs.filterVal = next;
        if (cs.filterCol2 && cs.filterVal2.length) {
          const rowsScoped = cs.filterVal.length
            ? state.allRows.filter(r => cs.filterVal.includes(normFilterVal(r[cs.filterCol])))
            : state.allRows;
          const allowed = getUniqueValues(rowsScoped, cs.filterCol2);
          cs.filterVal2 = cs.filterVal2.filter(v => allowed.includes(v));
        }
        cs.filterVal3 = [];
        buildFilterPanel(type);
        updateFilterBadge(type);
        state.chartsToRender.add(type);
        debounceRender();
      };

      rowWrap.appendChild(select);

      if (index > 0) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'border border-slate-700 text-slate-300 rounded-md px-2 py-1 text-[11px]';
        removeBtn.textContent = 'Remove';
        removeBtn.onclick = () => {
          const next = Array.isArray(cs.filterVal) ? cs.filterVal.slice() : asFilterValues(cs.filterVal);
          next.splice(index, 1);
          cs.filterVal = next;
          if (cs.filterCol2 && cs.filterVal2.length) {
            const rowsScoped = cs.filterVal.length
              ? state.allRows.filter(r => cs.filterVal.includes(normFilterVal(r[cs.filterCol])))
              : state.allRows;
            const allowed = getUniqueValues(rowsScoped, cs.filterCol2);
            cs.filterVal2 = cs.filterVal2.filter(v => allowed.includes(v));
          }
          cs.filterVal3 = [];
          buildFilterPanel(type);
          updateFilterBadge(type);
          state.chartsToRender.add(type);
          debounceRender();
        };
        rowWrap.appendChild(removeBtn);
      }

      level1Rows.appendChild(rowWrap);
    }
  };

  renderLevel1Rows();

  const currentCount = asFilterValues(cs.filterVal).length;
  const totalRows = Array.isArray(cs.filterVal)
    ? Math.max(1, cs.filterVal.length)
    : Math.max(1, currentCount);
  const atLimit = totalRows >= 10;
  addBtn.disabled = !hasLevel1 || atLimit;
  addBtn.classList.toggle('opacity-50', atLimit);
  addBtn.classList.toggle('cursor-not-allowed', atLimit);
  addBtn.onclick = () => {
    if (!cs.filterCol) return;
    const currentValues = Array.isArray(cs.filterVal) ? cs.filterVal.slice() : asFilterValues(cs.filterVal);
    if (currentValues.length >= 10) return;
    currentValues.push('');
    cs.filterVal = currentValues;
    buildFilterPanel(type);
    updateFilterBadge(type);
    state.chartsToRender.add(type);
    debounceRender();
  };
  const rowsAfterPrimary = cs.filterCol && level1Values.length
    ? state.allRows.filter(r => level1Values.includes(normFilterVal(r[cs.filterCol])))
    : state.allRows;

  const secondaryValues = cs.filterCol2 ? getUniqueValues(rowsAfterPrimary, cs.filterCol2) : [];
  col2Sel.classList.toggle('hidden', !hasLevel1);
  col2Sel.disabled = !hasLevel1;
  val2Sel.classList.toggle('hidden', !hasLevel2);
  val2Sel.disabled = !hasLevel2;
  const level2Current = level2Values[0] || '';
  const level2Options = secondaryValues.slice();
  if (level2Current && !level2Options.includes(level2Current)) level2Options.unshift(level2Current);
  val2Sel.innerHTML = level2Options.map(v => opt(v, v === level2Current)).join('');
  val2Sel.value = level2Current;

  const tertiaryCols = state.headers.filter(h => h !== cs.filterCol && h !== cs.filterCol2);
  const tertiaryColOptions = [`<option value="">Level 3 column (e.g., ${escHtml(hints.level3)})</option>`].concat(
    tertiaryCols.map(h => opt(h, h === cs.filterCol3))
  );
  col3Sel.classList.toggle('hidden', !hasLevel2Value);
  col3Sel.disabled = !hasLevel2Value;
  col3Sel.innerHTML = tertiaryColOptions.join('');

  const rowsAfterSecondary = cs.filterCol2 && level2Values.length
    ? rowsAfterPrimary.filter(r => level2Values.includes(normFilterVal(r[cs.filterCol2])))
    : rowsAfterPrimary;
  const tertiaryValues = cs.filterCol3 ? getUniqueValues(rowsAfterSecondary, cs.filterCol3) : [];
  val3Sel.classList.toggle('hidden', !hasLevel3);
  val3Sel.disabled = !hasLevel3;
  const level3Current = level3Values[0] || '';
  const level3Options = tertiaryValues.slice();
  if (level3Current && !level3Options.includes(level3Current)) level3Options.unshift(level3Current);
  val3Sel.innerHTML = level3Options.map(v => opt(v, v === level3Current)).join('');
  val3Sel.value = level3Current;

  if (guide) {
    guide.textContent = hasLevel3
      ? `1) Choose ${cs.filterCol}. 2) Choose ${cs.filterCol2}. 3) Choose ${cs.filterCol3}.`
      : hasLevel2
        ? `1) Choose ${cs.filterCol}. 2) Choose ${cs.filterCol2}. Now pick the third column if needed.`
        : hasLevel1Value
          ? `1) Choose ${cs.filterCol}. Now pick the second column.`
            : 'Start with the first column. Pick a value and click Add to include it, or click map regions to load rows below the map.';
  }

  clearBtn.classList.toggle('hidden', !(cs.filterCol || cs.filterVal || cs.filterCol2 || cs.filterVal2 || cs.filterCol3 || cs.filterVal3));

  filterColSel.onchange = null;
  col2Sel.onchange = null;
  val2Sel.onchange = null;
  col3Sel.onchange = null;
  val3Sel.onchange = null;
  clearBtn.onclick = null;

  filterColSel.onchange = () => {
    cs.filterCol = filterColSel.value;
    cs.filterVal = [];
    cs.filterCol2 = '';
    cs.filterVal2 = [];
    cs.filterCol3 = '';
    cs.filterVal3 = [];
    cs.drillLabel = '';
    cs.displayCol = cs.filterCol || resolveDefault(type);
    buildFilterPanel(type);
    updateFilterBadge(type);
    state.chartsToRender.add(type);
    debounceRender();
  };


  col2Sel.onchange = () => {
    cs.filterCol2 = col2Sel.value;
    cs.filterVal2 = [];
    cs.filterCol3 = '';
    cs.filterVal3 = [];
    cs.drillLabel = '';
    buildFilterPanel(type);
    updateFilterBadge(type);
    state.chartsToRender.add(type);
    debounceRender();
  };

  val2Sel.onchange = () => {
    cs.filterVal2 = val2Sel.value ? [val2Sel.value] : [];
    cs.filterVal3 = [];
    cs.drillLabel = '';
    buildFilterPanel(type);
    updateFilterBadge(type);
    state.chartsToRender.add(type);
    debounceRender();
  };

  col3Sel.onchange = () => {
    cs.filterCol3 = col3Sel.value;
    cs.filterVal3 = [];
    cs.drillLabel = '';
    buildFilterPanel(type);
    updateFilterBadge(type);
    state.chartsToRender.add(type);
    debounceRender();
  };

  val3Sel.onchange = () => {
    cs.filterVal3 = val3Sel.value ? [val3Sel.value] : [];
    cs.drillLabel = '';
    updateFilterBadge(type);
    state.chartsToRender.add(type);
    debounceRender();
  };

  clearBtn.onclick = () => {
    cs.filterCol = '';
    cs.filterVal = [];
    cs.filterCol2 = '';
    cs.filterVal2 = [];
    cs.filterCol3 = '';
    cs.filterVal3 = [];
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
  const badge = document.getElementById('badge-filter-' + type);
  const cs = state.charts[type];
  const displayCol = cs.displayCol;
  if (!badge) return;
  const esc = value => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const parts = [];
  if (displayCol) parts.push(['Group', displayCol]);
  if (cs.filterCol) parts.push(['Filter', asFilterValues(cs.filterVal).length ? cs.filterCol + ': ' + valuesToSummary(cs.filterVal, 3) : cs.filterCol]);
  if (cs.drillLabel) parts.push(['Clicked', cs.drillLabel]);
  if (cs.filterCol2) parts.push(['Level 2', asFilterValues(cs.filterVal2).length ? cs.filterCol2 + ': ' + valuesToSummary(cs.filterVal2, 3) : cs.filterCol2]);
  if (cs.filterCol3) parts.push(['Level 3', asFilterValues(cs.filterVal3).length ? cs.filterCol3 + ': ' + valuesToSummary(cs.filterVal3, 3) : cs.filterCol3]);
  if (parts.length) {
    badge.innerHTML = parts.map(([label, value]) => {
      return '<span class="block"><span class="font-semibold text-blue-200">' + esc(label) + ':</span> ' + esc(value) + '</span>';
    }).join('');
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}