<?php
// dashboard.php  –  Chart dashboard (boss = view/filter; staff = same + file picker)
require_once 'includes/db.php';
requireLogin();

$user = currentUser();
$role = $user['role'];

if (!in_array($role, ['admin','staff','boss'])) {
    header('Location: index.php'); exit;
}

$pdo = getPDO();

$activeFile = $pdo->query(
    'SELECT * FROM uploaded_files WHERE is_active = 1 ORDER BY uploaded_at DESC LIMIT 1'
)->fetch();

$fileJson = 'null';
$fileName = '';
if ($activeFile) {
    $path = UPLOAD_DIR . $activeFile['stored_name'];
    if (file_exists($path)) {
        $fileName = htmlspecialchars($activeFile['original_name']);
        $fileJson = json_encode([
            'id'   => $activeFile['id'],
            'name' => $activeFile['original_name'],
            'url'  => 'file_serve.php?id=' . urlencode($activeFile['id']),
            'path' => $path  // Add direct path for debugging
        ]);
    }
}
?>
<!DOCTYPE html>
<html lang="en" data-theme="light" class="bg-white">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DataChart — Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { sans:['"IBM Plex Sans"','sans-serif'], mono:['"IBM Plex Mono"','monospace'] },
          colors: { brand: { 50:'#eff6ff', 500:'#3b82f6', 600:'#2563eb', 900:'#1e3a8a' } }
        }
      }
    }
  </script>
  <link rel="stylesheet" href="css/app.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
</head>
<body class="min-h-screen bg-white text-black font-sans m-0 p-0">

  <!-- ── NAVBAR ── -->
  <header id="navbar" class="sticky top-0 z-50 border-b border-transparent bg-brand-900 text-white backdrop-blur-sm">
    <div class="max-w-6xl mx-auto px-7 py-3 flex items-center gap-3">
      <div class="w-6 h-6 rounded-md bg-brand-600 flex items-center justify-center flex-shrink-0">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <rect x="1"  y="6"   width="2.5" height="6"    fill="white" rx="0.5"/>
          <rect x="5"  y="3.5" width="2.5" height="8.5"  fill="white" rx="0.5"/>
          <rect x="9"  y="1"   width="2.5" height="11"   fill="white" rx="0.5"/>
        </svg>
      </div>
      <span class="font-bold text-sm tracking-tight">DataChart</span>

      <div class="ml-auto flex items-center gap-3">
        <span class="role-badge role-<?= $role ?>">
          <?= ucfirst($role) ?>
        </span>
        <span class="text-white text-xs hidden sm:inline"><?= htmlspecialchars($user['full_name']) ?></span>

        <?php if ($role === 'staff' || $role === 'admin'): ?>
          <a href="staff.php" class="nav-link-btn">Files</a>
        <?php endif; ?>
        <?php if ($role === 'admin'): ?>
          <a href="admin.php" class="nav-link-btn">Admin</a>
        <?php endif; ?>

        <button id="btn-download-all" class="hidden bg-brand-600 hover:bg-brand-500 transition-colors text-white text-xs font-semibold rounded-md px-4 py-1.5 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          Download All
        </button>
        <a href="logout.php" class="logout-trigger border border-transparent hover:border-white/20 text-white hover:text-white transition-colors text-xs rounded-md px-4 py-1.5">
          Sign out
        </a>
      </div>
    </div>
  </header>

  <!-- ── MAIN ── -->
  <main class="max-w-6xl mx-auto px-7 py-8">

    <!-- ══ NO FILE STATE ══ -->
    <section id="no-file-screen" class="<?= $activeFile ? 'hidden' : '' ?>">
      <div class="text-center py-24">
        <div class="w-16 h-16 rounded-2xl border border-slate-200 bg-white flex items-center justify-center mx-auto mb-5">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5">
            <path d="M9 17H7A5 5 0 017 7h2M15 7h2a5 5 0 010 10h-2M8 12h8" stroke-linecap="round"/>
          </svg>
        </div>
        <h2 class="text-xl font-bold mb-2 text-slate-600">No active dataset</h2>
        <p class="text-slate-500 text-sm mb-6">
          <?php if ($role === 'staff' || $role === 'admin'): ?>
            Go to <a href="staff.php" class="text-brand-500 hover:underline">File Management</a> to upload and activate a file.
          <?php else: ?>
            Ask a staff member to upload and activate a data file.
          <?php endif; ?>
        </p>
      </div>
    </section>

    <!-- ══ DASHBOARD SCREEN ══ -->
    <section id="dashboard-screen" class="<?= $activeFile ? '' : 'hidden' ?>">

      <div id="filename-badge" class="<?= $fileName ? '' : 'hidden' ?> mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">
        Active file: <?= $fileName ?: '' ?>
      </div>

      <!-- Stat cards -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div class="bg-white rounded-xl border border-slate-200 p-4">
          <p class="text-slate-500 text-[10px] uppercase tracking-widest mb-1">Total Rows</p>
          <p id="stat-rows" class="text-blue-400 text-xl font-bold">—</p>
        </div>
        <div class="bg-white rounded-xl border border-slate-200 p-4">
          <p class="text-slate-500 text-[10px] uppercase tracking-widest mb-1">Columns</p>
          <p id="stat-cols" class="text-emerald-400 text-xl font-bold">—</p>
        </div>
        <div class="bg-white rounded-xl border border-slate-200 p-4">
          <p class="text-slate-500 text-[10px] uppercase tracking-widest mb-1">Numeric Series</p>
          <p id="stat-series" class="text-amber-400 text-xl font-bold">—</p>
        </div>
        <div class="bg-white rounded-xl border border-slate-200 p-4">
          <p class="text-slate-500 text-[10px] uppercase tracking-widest mb-1" id="stat-total-label">Value Total</p>
          <p id="stat-total" class="text-violet-400 text-xl font-bold">—</p>
        </div>
      </div>

      <!-- Controls bar -->
      <div id="label-row" class="bg-white rounded-xl border border-slate-200 p-4 mb-5">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div class="min-w-0">
            <p class="text-slate-500 text-[11px] uppercase tracking-widest mb-1">Group / Label</p>
            <p class="text-slate-400 text-xs leading-relaxed max-w-2xl">
              Choose one column to group the charts. Keep it simple so the whole dashboard stays readable.
            </p>
          </div>
          <div class="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:flex-1 lg:min-w-0">
            <select id="label-col-select"
              class="w-full lg:flex-1 lg:min-w-0 bg-white border border-slate-200 text-black rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand-500 text-color:text-black">
            </select>
            <button id="label-clear-btn" class="filter-btn clear-btn self-start sm:self-auto whitespace-nowrap" type="button" title="Reset all charts to their default group">Reset All Charts</button>
          </div>
        </div>
      </div>

      <!-- No numeric warning -->
      <div id="no-numeric-warn" class="hidden bg-white border border-red-200/20 rounded-xl p-4 mb-5 text-red-600 text-sm">
        No numeric columns detected. Try changing the Group / Label column above.
      </div>

      <!-- Chart grid -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4" id="chart-grid">
        <?php
        function chartCard(string $type, string $label): string {
          return <<<HTML
          <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-black font-semibold text-sm">{$label}</span>
                <span id="badge-entries-{$type}" class="bg-white text-slate-500 text-[10px] px-2 py-0.5 rounded-full border border-slate-200">— entries</span>
                <span id="badge-filter-{$type}" class="hidden bg-blue-950 text-blue-300 text-[10px] px-2 py-1 rounded-lg border border-blue-800 max-w-[220px] whitespace-normal break-words leading-tight text-left"></span>
              </div>
              <div class="flex gap-2">
                <select id="entries-limit-{$type}" class="bg-white border border-slate-200 text-slate-700 rounded-md px-2 py-1 text-[11px] focus:outline-none">
                  <option value="5">Rows: 5</option>
                  <option value="10">Rows: 10</option>
                  <option value="15">Rows: 15</option>
                  <option value="20">Rows: 20</option>
                  <option value="25">Rows: 25</option>
                  <option value="30" selected>Rows: 30</option>
                </select>
                <select id="sort-order-{$type}" class="bg-white border border-slate-200 text-slate-700 rounded-md px-2 py-1 text-[11px] focus:outline-none">
                  <option value="default">Order: default</option>
                  <option value="desc">Order: highest first</option>
                  <option value="asc">Order: lowest first</option>
                </select>
                <select id="selection-mode-{$type}" class="bg-white border border-slate-200 text-slate-700 rounded-md px-2 py-1 text-[11px] focus:outline-none">
                  <option value="current">Slice: current rows</option>
                  <option value="top">Slice: top highest rows</option>
                  <option value="bottom">Slice: bottom lowest rows</option>
                </select>
                <button data-type="{$type}" data-action="reset"
                  class="reset-btn clear-btn border border-slate-200 text-slate-600 hover:text-slate-700 hover:border-brand-500 transition-colors rounded-md px-3 py-1 text-[11px]">
                  Clear
                </button>
                <button data-type="{$type}" data-action="filter"
                  class="filter-btn border border-slate-200 text-slate-600 hover:text-slate-700 hover:border-brand-500 transition-colors rounded-md px-3 py-1 text-[11px]">
                  Filter
                </button>
                <button data-type="{$type}" data-action="download"
                  class="dl-btn border border-slate-200 text-slate-600 hover:text-slate-700 transition-colors rounded-md px-3 py-1 text-[11px]">
                  PNG
                </button>
              </div>
            </div>
            <div id="filter-panel-{$type}" class="hidden px-4 py-3 bg-slate-950 border-b border-slate-700">
              <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px] items-start">
                <div class="space-y-3">
                  <div>
                    <p class="text-slate-500 text-[10px] uppercase tracking-widest mb-2">Level 1 filter</p>
                    <div class="flex flex-wrap gap-2 items-center">
                      <select id="filter-col-{$type}" class="bg-white border border-slate-200 text-black rounded-md px-2 py-1 text-xs focus:outline-none min-w-[190px]">
                        <option value="">— none —</option>
                      </select>
                      <button id="filter-add-{$type}" class="hidden border border-brand-600 bg-brand-600 text-white rounded-md px-3 py-1 text-[11px] font-semibold hover:bg-brand-700">Add</button>
                      <button id="filter-clear-{$type}" class="hidden clear-btn border border-slate-700 text-slate-300 rounded-md px-2 py-1 text-[11px]">Clear</button>
                    </div>
                    <p class="mt-2 text-[10px] text-slate-400">Pick one region/value, then click Add if you want to keep more than one (up to 10).</p>
                  </div>

                  <div id="filter-level1-rows-{$type}" class="space-y-2"></div>

                  <div>
                    <p class="text-slate-500 text-[10px] uppercase tracking-widest mb-2">Series</p>
                    <div id="series-toggles-{$type}" class="flex flex-wrap gap-2"></div>
                  </div>
                </div>

                <div class="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                  <p class="text-slate-400 text-[10px] uppercase tracking-widest mb-2">Optional level 2 / 3</p>
                  <div class="flex flex-wrap gap-2 items-center mb-3">
                    <select id="filter-col2-{$type}" class="hidden bg-white border border-slate-200 text-black rounded-md px-2 py-1 text-xs focus:outline-none min-w-[180px]">
                      <option value="">More specific column</option>
                    </select>
                    <select id="filter-val2-{$type}" class="hidden bg-white border border-brand-600 text-black rounded-md px-2 py-1 text-xs max-w-[180px] focus:outline-none min-w-[170px]">
                      <option value="">Select value</option>
                    </select>
                  </div>
                  <div class="flex flex-wrap gap-2 items-center">
                    <select id="filter-col3-{$type}" class="hidden bg-white border border-slate-200 text-black rounded-md px-2 py-1 text-xs focus:outline-none min-w-[180px]">
                      <option value="">Most specific column</option>
                    </select>
                    <select id="filter-val3-{$type}" class="hidden bg-white border border-brand-600 text-black rounded-md px-2 py-1 text-xs max-w-[180px] focus:outline-none min-w-[170px]">
                      <option value="">Select value</option>
                    </select>
                  </div>
                </div>
              </div>
              <p id="filter-guide-{$type}" class="mt-2 text-[10px] text-slate-400">
                Choose a top-level column and value, then refine with more specific columns.
              </p>
            </div>
            <div class="p-4">
              <canvas id="canvas-{$type}" height="260"></canvas>
            </div>
            <div class="border-t border-slate-200">
              <div class="px-4 py-2 flex items-center justify-between gap-3">
                <p id="table-meta-{$type}" class="text-[11px] text-slate-500">No rows</p>
                <button id="btn-download-table-{$type}" type="button" class="hidden border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-brand-500 transition-colors rounded-md px-2.5 py-1 text-[11px] font-semibold">
                  Download Data
                </button>
              </div>
              <div class="max-h-44 overflow-auto">
                <table class="min-w-full text-[11px]">
                  <thead id="table-head-{$type}" class="sticky top-0 bg-slate-50"></thead>
                  <tbody id="table-body-{$type}" class="divide-y divide-slate-100"></tbody>
                </table>
              </div>
            </div>
          </div>
HTML;
        }
        echo chartCard('line', 'Line Chart');
        echo chartCard('bar',  'Bar Chart');
        echo chartCard('area', 'Area Chart');
        echo chartCard('pie',  'Pie / Donut');
        ?>
      </div>

      <!-- Philippines Map -->
      <section id="map-panel" class="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-5">
        <div class="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <p class="text-black font-semibold text-sm">Philippines Map</p>
            <p class="text-slate-400 text-[11px]">Click a region to show its rows below the map.</p>
          </div>
          <div id="map-legend" class="flex items-center gap-2 text-[10px] text-slate-500"></div>
        </div>
        <div id="ph-map" class="w-full h-[460px] bg-slate-50"></div>
      </section>

      <section id="map-results-panel" class="hidden bg-white rounded-2xl border border-slate-200 overflow-hidden mb-5">
        <div class="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <p class="text-black font-semibold text-sm">Map Region Data</p>
            <p class="text-slate-400 text-[11px]">Selected region: <span id="map-selected-region" class="font-semibold text-slate-700"></span></p>
          </div>
          <div class="flex items-center gap-3">
            <p id="map-table-meta" class="text-[11px] text-slate-500">Click a region on the map to show its rows here.</p>
            <button id="map-download-csv" type="button" class="hidden border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-brand-500 transition-colors rounded-md px-2.5 py-1 text-[11px] font-semibold">Download CSV</button>
          </div>
        </div>
        <div class="max-h-72 overflow-auto">
          <table class="min-w-full text-[11px]">
            <thead id="map-table-head" class="sticky top-0 bg-slate-50"></thead>
            <tbody id="map-table-body" class="divide-y divide-slate-100"></tbody>
          </table>
        </div>
      </section>

    </section>
  </main>

  <script>
    window.DATACHART = {
      role:       <?= json_encode($role) ?>,
      activeFile: <?= $fileJson ?>
    };
  </script>
  <div id="logout-modal" class="hidden fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4">
    <div class="w-80 max-w-[90vw] rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
      <h3 class="text-base font-bold text-slate-900 mb-2">Confirm Sign Out</h3>
      <p class="text-sm text-slate-600 mb-5">Are you sure you want to sign out?</p>
      <div class="flex gap-3">
        <button id="logout-cancel-btn" type="button" class="flex-1 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
        <button id="logout-confirm-btn" type="button" class="flex-1 rounded-md border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Sign out</button>
      </div>
    </div>
  </div>
  <script>
    (function () {
      const modal = document.getElementById('logout-modal');
      const cancelBtn = document.getElementById('logout-cancel-btn');
      const confirmBtn = document.getElementById('logout-confirm-btn');
      const triggers = document.querySelectorAll('.logout-trigger');
      let pendingHref = 'logout.php';

      function closeModal() { modal?.classList.add('hidden'); }

      triggers.forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          pendingHref = link.getAttribute('href') || 'logout.php';
          modal?.classList.remove('hidden');
        });
      });

      cancelBtn?.addEventListener('click', closeModal);
      confirmBtn?.addEventListener('click', () => { window.location.href = pendingHref; });
      modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) closeModal();
      });
    })();
  </script>
  <script src="js/dashboard-core.js"></script>
  <script src="js/dashboard-data.js"></script>
  <script src="js/dashboard-map.js"></script>
  <script src="js/dashboard-filters.js"></script>
  <script src="js/dashboard-charts.js"></script>
  <script src="js/dashboard-downloads.js"></script>
  <script src="js/dashboard-ui.js"></script>
</body>
</html>