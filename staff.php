<?php
// staff.php  –  File management (staff + admin only)
require_once 'includes/db.php';
requireRole('staff', 'admin');

$user = currentUser();
$pdo  = getPDO();
$msg  = '';
$err  = '';

/* ── Handle POST actions ───────────────────────────────────── */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verifyCsrf();
    $action = $_POST['action'] ?? '';

    if ($action === 'upload') {
        $file = $_FILES['datafile'] ?? null;
        if (!$file || $file['error'] !== UPLOAD_ERR_OK) {
            $err = 'Upload failed or no file selected.';
        } else {
            $origName = $file['name'];
            $ext      = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
            if (!in_array($ext, ['csv','xlsx','xls','txt'])) {
                $err = 'Only CSV, XLSX, XLS, or TXT files allowed.';
            } elseif ($file['size'] > MAX_UPLOAD_MB * 1024 * 1024) {
                $err = 'File exceeds ' . MAX_UPLOAD_MB . ' MB limit.';
            } else {
                $stored = uniqid('dc_', true) . '.' . $ext;
                if (move_uploaded_file($file['tmp_name'], UPLOAD_DIR . $stored)) {
                    $pdo->prepare(
                        'INSERT INTO uploaded_files (uploaded_by,original_name,stored_name,file_size)
                         VALUES (?,?,?,?)'
                    )->execute([$user['id'], $origName, $stored, $file['size']]);
                    auditLog('file_upload', $origName);
                    $msg = 'File "' . htmlspecialchars($origName) . '" uploaded successfully.';
                } else {
                    $err = 'Could not move uploaded file. Check server permissions.';
                }
            }
        }
    }

    if ($action === 'activate') {
        $id = (int)$_POST['file_id'];
        $pdo->exec('UPDATE uploaded_files SET is_active = 0');
        $pdo->prepare('UPDATE uploaded_files SET is_active = 1 WHERE id = ?')->execute([$id]);
        auditLog('file_activate', "id=$id");
        $msg = 'File activated on dashboard.';
    }

    if ($action === 'deactivate') {
        $pdo->exec('UPDATE uploaded_files SET is_active = 0');
        auditLog('file_deactivate_all');
        $msg = 'Dashboard cleared (no active file).';
    }

    if ($action === 'delete') {
        $id  = (int)$_POST['file_id'];
        $row = $pdo->prepare('SELECT * FROM uploaded_files WHERE id=?');
        $row->execute([$id]);
        $row = $row->fetch();
        if ($row) {
            @unlink(UPLOAD_DIR . $row['stored_name']);
            $pdo->prepare('DELETE FROM uploaded_files WHERE id=?')->execute([$id]);
            auditLog('file_delete', $row['original_name']);
            $msg = 'File deleted.';
        }
    }
}

/* ── Fetch files ───────────────────────────────────────────── */
$files = $pdo->query(
    'SELECT f.*, u.username, u.full_name
       FROM uploaded_files f
       JOIN users u ON u.id = f.uploaded_by
      ORDER BY f.uploaded_at DESC'
)->fetchAll();

$token = csrfToken();

function fmtSize(int $bytes): string {
    if ($bytes >= 1048576) return round($bytes/1048576,1).' MB';
    if ($bytes >= 1024)    return round($bytes/1024,1).' KB';
    return $bytes.' B';
}
?>
<!DOCTYPE html>
<html lang="en" class="bg-white">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DataChart — File Management</title>
  <script src="https://cdn.tailwindcss.com"></script>
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
  <link rel="stylesheet" href="css/admin.css" />
</head>
<body class="min-h-screen bg-white text-black font-sans">

  <!-- Navbar — flush to top, full width -->
  <header class="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
    <div class="max-w-5xl mx-auto px-6 h-14 flex items-center gap-3">
      <div class="w-6 h-6 rounded-md bg-brand-600 flex items-center justify-center flex-shrink-0">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <rect x="1" y="6" width="2.5" height="6" fill="white" rx="0.5"/>
          <rect x="5" y="3.5" width="2.5" height="8.5" fill="white" rx="0.5"/>
          <rect x="9" y="1" width="2.5" height="11" fill="white" rx="0.5"/>
        </svg>
      </div>
      <span class="font-bold text-sm tracking-tight">DataChart</span>
      <span class="text-slate-600 text-xs">/ File Management</span>
      <div class="ml-auto flex items-center gap-3">
        <span class="role-badge role-<?= $user['role'] ?>"><?= ucfirst($user['role']) ?></span>
        <a href="dashboard.php" class="nav-link-btn">Dashboard</a>
        <?php if ($user['role']==='admin'): ?>
          <a href="admin.php" class="nav-link-btn">Admin</a>
        <?php endif; ?>
        <a href="logout.php" class="nav-link-btn">Sign out</a>
      </div>
    </div>
  </header>

  <main class="max-w-5xl mx-auto px-6 py-8">

    <h1 class="text-2xl font-extrabold tracking-tight mb-6">File Management</h1>

    <?php if ($msg): ?><div class="alert-success mb-5"><?= htmlspecialchars($msg) ?></div><?php endif; ?>
    <?php if ($err): ?><div class="alert-error mb-5"><?= htmlspecialchars($err) ?></div><?php endif; ?>

    <!-- Upload card -->
    <div class="card mb-6">
      <h2 class="section-title mb-4">Upload New File</h2>
      <form method="POST" enctype="multipart/form-data" id="upload-form">
        <input type="hidden" name="csrf_token" value="<?= $token ?>">
        <input type="hidden" name="action" value="upload">
        <div id="drop-zone-staff"
          class="border-2 border-dashed border-slate-200 hover:border-brand-500 rounded-xl p-10 text-center cursor-pointer bg-white transition-all mb-3"
          onclick="document.getElementById('datafile').click()">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5" class="mx-auto mb-3">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <p class="font-semibold text-sm mb-1">Drop file here or click to browse</p>
          <p class="text-slate-500 text-xs" id="file-label">CSV, XLSX, XLS — max <?= MAX_UPLOAD_MB ?> MB</p>
          <input type="file" id="datafile" name="datafile" accept=".csv,.xlsx,.xls,.txt" class="hidden" />
        </div>
        <button type="submit" class="btn-primary">Upload File</button>
      </form>
    </div>

    <!-- File list -->
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h2 class="section-title">Uploaded Files</h2>
        <?php if (array_filter($files, fn($f)=>$f['is_active'])): ?>
          <form method="POST">
            <input type="hidden" name="csrf_token" value="<?= $token ?>">
            <input type="hidden" name="action" value="deactivate">
            <button class="btn-ghost text-xs">Clear Active</button>
          </form>
        <?php endif; ?>
      </div>

      <?php if (empty($files)): ?>
        <p class="text-slate-500 text-sm text-center py-8">No files uploaded yet.</p>
      <?php else: ?>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Size</th>
                <th>Uploaded by</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <?php foreach ($files as $f): ?>
                <tr class="<?= $f['is_active'] ? 'row-active' : '' ?>">
                  <td>
                    <div class="flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5" class="flex-shrink-0">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span class="font-medium text-black text-sm"><?= htmlspecialchars($f['original_name']) ?></span>
                    </div>
                  </td>
                  <td class="text-slate-400 text-xs"><?= fmtSize($f['file_size']) ?></td>
                  <td class="text-slate-400 text-xs"><?= htmlspecialchars($f['full_name'] ?: $f['username']) ?></td>
                  <td class="text-slate-400 text-xs"><?= date('M j, Y g:ia', strtotime($f['uploaded_at'])) ?></td>
                  <td>
                    <?php if ($f['is_active']): ?>
                      <span class="status-badge status-active">Active</span>
                    <?php else: ?>
                      <span class="status-badge status-inactive">Inactive</span>
                    <?php endif; ?>
                  </td>
                  <td>
                    <div class="flex gap-2">
                      <?php if (!$f['is_active']): ?>
                        <form method="POST" class="inline">
                          <input type="hidden" name="csrf_token" value="<?= $token ?>">
                          <input type="hidden" name="action" value="activate">
                          <input type="hidden" name="file_id" value="<?= $f['id'] ?>">
                          <button class="btn-sm btn-blue">Show</button>
                        </form>
                      <?php endif; ?>
                      <form method="POST" class="inline" onsubmit="return confirm('Delete this file permanently?')">
                        <input type="hidden" name="csrf_token" value="<?= $token ?>">
                        <input type="hidden" name="action" value="delete">
                        <input type="hidden" name="file_id" value="<?= $f['id'] ?>">
                        <button class="btn-sm btn-red">Delete</button>
                      </form>
                    </div>
                  </td>
                </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      <?php endif; ?>
    </div>

  </main>
  <script src="js/staff.js"></script>
</body>
</html>