'use strict';

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
  state.map.regionCol = regionCol;

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
  const lowColor = dk ? '#facc15' : '#facc15';
  const midColor = dk ? '#fb923c' : '#fb923c';
  const highColor = dk ? '#22c55e' : '#22c55e';
  const borderColor = dk ? '#dbeafe' : '#1e3a8a';

  const geo = await fetch(PH_MAP_GEOJSON_URL, { credentials: 'omit' }).then(resp => {
    if (!resp.ok) throw new Error('Map data fetch failed');
    return resp.json();
  });

  state.map.regionIndex = [];
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
      const regionKey = normalizeMapText(regionName);
      if (regionKey) state.map.regionIndex.push({ key: regionKey, name: regionName, layer });
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
        click: () => {
          selectMapRegion(regionName, regionCol);
        },
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


function renderMapSelectionTable() {
  const panel = document.getElementById('map-results-panel');
  const regionBadge = document.getElementById('map-selected-region');
  const meta = document.getElementById('map-table-meta');
  const head = document.getElementById('map-table-head');
  const body = document.getElementById('map-table-body');
  const downloadBtn = document.getElementById('map-download-csv');
  const downloadScope = document.getElementById('map-download-scope');
  if (!panel || !regionBadge || !meta || !head || !body || !downloadBtn || !downloadScope) return;

  const region = state.map.selectedRegion || '';
  const rows = state.map.tableRows || [];
  const query = String(state.map.searchQuery || '').trim();
  const scope = state.map.searchScope || 'region';
  const baseRows = scope === 'all' ? state.allRows : rows;
  const filteredRows = filterMapRows(baseRows, query);
  const scopeLabel = scope === 'all' ? 'All regions' : (region || 'Selected region');

  if (!region && scope === 'region' && !query) {
    panel.classList.add('hidden');
    regionBadge.textContent = '';
    meta.textContent = 'Click a region on the map to show its rows here.';
    head.innerHTML = '';
    body.innerHTML = '<tr><td class="px-3 py-3 text-slate-500" colspan="1">No region selected.</td></tr>';
    downloadBtn.classList.add('hidden');
    downloadScope.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  regionBadge.textContent = scopeLabel;
  if (scope === 'all' && !query) {
    meta.textContent = 'Enter a search term to scan all data.';
  } else if (query) {
    meta.textContent = filteredRows.length
      ? filteredRows.length.toLocaleString() + ' row(s) matching "' + query + '"'
      : 'No matching rows found for "' + query + '".';
  } else {
    meta.textContent = filteredRows.length
      ? filteredRows.length.toLocaleString() + ' row(s) for the selected region'
      : 'No matching rows found for this region.';
  }
  const hasRows = filteredRows.length > 0;
  downloadBtn.classList.toggle('hidden', !hasRows);
  downloadScope.classList.toggle('hidden', !hasRows);

  head.innerHTML = state.headers.length
    ? '<tr>' + state.headers.map(h => `<th class="px-3 py-2 text-left font-semibold text-slate-700 whitespace-nowrap border-b border-slate-200">${escHtml(h)}</th>`).join('') + '</tr>'
    : '';
  body.innerHTML = filteredRows.length
    ? filteredRows.map(row => (
        '<tr>' + state.headers.map(h => `<td class="px-3 py-2 text-slate-700 whitespace-nowrap">${escHtml(row[h])}</td>`).join('') + '</tr>'
      )).join('')
    : '<tr><td class="px-3 py-3 text-slate-500" colspan="' + Math.max(state.headers.length, 1) + '">No matching rows found.</td></tr>';
}

function filterMapRows(rows, query) {
  if (!query) return rows;
  const q = query.toLowerCase();
  return rows.filter(row => state.headers.some(h => String(row[h] ?? '').toLowerCase().includes(q)));
}

function selectMapRegion(regionName, regionCol) {
  const region = String(regionName ?? '').trim();
  if (!region || !regionCol) return;

  const targetKeys = getRegionAliasKeys(region);
  const rows = state.allRows.filter(row => {
    const cellKeys = getRegionAliasKeys(row[regionCol]);
    if (!cellKeys.length || !targetKeys.length) return false;
    return targetKeys.some(key => cellKeys.includes(key));
  });
  state.map.selectedRegion = region;
  state.map.tableRows = rows;
  renderMapSelectionTable();
}

function downloadMapSelectionCsv() {
  const region = state.map.selectedRegion || '';
  const query = String(state.map.searchQuery || '').trim();
  const scope = state.map.searchScope || 'region';
  const baseRows = scope === 'all' ? state.allRows : (state.map.tableRows || []);
  const downloadScope = document.getElementById('map-download-scope');
  const mode = downloadScope ? downloadScope.value : 'shown';
  const rows = mode === 'all' ? baseRows : filterMapRows(baseRows, query);
  if (!rows.length) return;
  const headers = state.headers || [];
  const csvLines = [headers.map(csvEscape).join(',')];
  rows.forEach(row => {
    csvLines.push(headers.map(h => csvEscape(row[h])).join(','));
  });
  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const label = scope === 'all' ? 'all_regions' : (region || 'region');
  const safeRegion = String(label).trim().replace(/[^a-z0-9\-_. ]/gi, '').replace(/\s+/g, '_') || 'region';
  link.href = url;
  link.download = `map_${safeRegion}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

document.addEventListener('click', e => {
  const btn = e.target.closest('#map-download-csv');
  if (!btn) return;
  e.preventDefault();
  downloadMapSelectionCsv();
});

document.addEventListener('click', e => {
  const btn = e.target.closest('#map-search-btn');
  if (!btn) return;
  e.preventDefault();
  const input = document.getElementById('map-search-input');
  if (!input) return;
  state.map.searchQuery = String(input.value || '').trim();
  renderMapSelectionTable();
});

document.addEventListener('input', e => {
  const input = e.target.closest('#map-search-input');
  if (!input) return;
  state.map.searchQuery = String(input.value || '').trim();
  renderMapSelectionTable();
});

document.addEventListener('change', e => {
  const scope = e.target.closest('#map-search-scope');
  if (!scope) return;
  state.map.searchScope = scope.value || 'region';
  renderMapSelectionTable();
});

document.addEventListener('keydown', e => {
  const input = e.target.closest('#map-search-input');
  if (!input || e.key !== 'Enter') return;
  e.preventDefault();
  state.map.searchQuery = String(input.value || '').trim();
  renderMapSelectionTable();
});