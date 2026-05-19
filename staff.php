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
    $action = $_POST['action'] ?? '';
    
    // Handle AJAX password verification (before CSRF check since it's AJAX)
    if ($action === 'verify_password') {
        header('Content-Type: application/json');
        
        // Verify CSRF token for this request
        if (!isset($_POST['csrf_token']) || !hash_equals($_POST['csrf_token'], $_SESSION['csrf_token'] ?? '')) {
            echo json_encode(['success' => false, 'error' => 'Invalid CSRF token']);
            exit;
        }
        
        $password = $_POST['password'] ?? '';
        $userRow = $pdo->prepare('SELECT password FROM users WHERE id = ?');
        $userRow->execute([$user['id']]);
        $userRow = $userRow->fetch();
        
        if ($userRow && password_verify($password, $userRow['password'])) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Incorrect password']);
        }
        exit;
    }

    // For all other POST actions, verify CSRF
    verifyCsrf();

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
<html lang="en" data-theme="light" class="bg-white">
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

  <!-- Navbar -->
  <header id="navbar" class="sticky top-0 z-50 border-b border-transparent bg-brand-900 text-white backdrop-blur-sm">
    <div class="max-w-6xl mx-auto px-7 py-3 flex items-center gap-3">
      <div class="w-6 h-6 rounded-md bg-brand-600 flex items-center justify-center flex-shrink-0">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <rect x="1" y="6" width="2.5" height="6" fill="white" rx="0.5"/>
          <rect x="5" y="3.5" width="2.5" height="8.5" fill="white" rx="0.5"/>
          <rect x="9" y="1" width="2.5" height="11" fill="white" rx="0.5"/>
        </svg>
      </div>
      <span class="font-bold text-sm tracking-tight">DataChart</span>
      <div class="ml-auto flex items-center gap-3">
        <span class="role-badge role-<?= $user['role'] ?>"><?= ucfirst($user['role']) ?></span>
        <span class="text-white text-xs hidden sm:inline"><?= htmlspecialchars($user['full_name']) ?></span>
        <a href="dashboard.php" class="nav-link-btn">Dashboard</a>
        <?php if ($user['role']==='admin'): ?>
          <a href="admin.php" class="nav-link-btn">Admin</a>
        <?php endif; ?>
        <a href="logout.php" class="logout-trigger border border-transparent hover:border-white/20 text-white hover:text-white transition-colors text-xs rounded-md px-4 py-1.5">Sign out</a>
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
          <div id="file-input-default">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5" class="mx-auto mb-3">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <p class="font-semibold text-sm mb-1">Drop file here or click to browse</p>
            <p class="text-slate-500 text-xs" id="file-label">CSV, XLSX, XLS — max <?= MAX_UPLOAD_MB ?> MB</p>
          </div>
          <div id="file-input-selected" class="hidden">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" class="mx-auto mb-2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <p class="font-semibold text-sm text-green-600 mb-1">File selected</p>
            <p class="text-slate-600 text-xs" id="selected-file-name"></p>
            <p class="text-slate-500 text-xs mt-1" id="selected-file-size"></p>
            <p class="text-amber-700 text-xs mt-2 font-semibold">Click to replace file</p>
          </div>
        </div>
        <div class="flex gap-2">
          <button type="submit" id="upload-btn" class="btn-primary">Upload File</button>
        </div>
        <input type="file" id="datafile" name="datafile" accept=".csv,.xlsx,.xls,.txt" class="hidden" />
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
                      <form method="POST" class="inline" data-file-id="<?= $f['id'] ?>" data-file-name="<?= htmlspecialchars($f['original_name']) ?>" onsubmit="return showDeleteModal(event, this)">
                        <input type="hidden" name="csrf_token" value="<?= $token ?>">
                        <input type="hidden" name="action" value="delete">
                        <input type="hidden" name="file_id" value="<?= $f['id'] ?>">
                        <button class="btn-sm btn-red" type="submit">Delete</button>
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

  <!-- Delete confirmation modal -->
  <div id="delete-modal" class="hidden fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
    <div class="bg-white rounded-xl shadow-lg p-6 w-90 max-w-sm">
      <h3 class="text-lg font-bold text-red-600 mb-2">Delete File</h3>
      <p class="text-slate-600 text-sm mb-4">
        Enter your password to confirm deletion of <span id="modal-file-name" class="font-semibold text-black"></span>
      </p>
      <div class="mb-4">
        <input type="password" id="delete-password-input" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500" placeholder="Enter your password">
        <p id="password-error" class="text-red-600 text-xs mt-1 hidden"></p>
      </div>
      <div class="flex gap-3">
        <button id="modal-cancel-btn" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg py-2 transition-colors">Cancel</button>
        <button id="modal-delete-btn" class="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg py-2 transition-colors">Delete File</button>
      </div>
    </div>
  </div>

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
    // File upload display
    const datafileInput = document.getElementById('datafile');
    const dropZone = document.getElementById('drop-zone-staff');
    const fileInputDefault = document.getElementById('file-input-default');
    const fileInputSelected = document.getElementById('file-input-selected');
    const uploadBtn = document.getElementById('upload-btn');
    const selectedFileName = document.getElementById('selected-file-name');
    const selectedFileSize = document.getElementById('selected-file-size');

    function formatFileSize(bytes) {
      if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
      if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return bytes + ' B';
    }

    function updateFileDisplay() {
      const file = datafileInput.files[0];
      if (file) {
        selectedFileName.textContent = file.name;
        selectedFileSize.textContent = formatFileSize(file.size);
        fileInputDefault.classList.add('hidden');
        fileInputSelected.classList.remove('hidden');
        dropZone.style.borderColor = '#86efac';
        dropZone.style.backgroundColor = '#f0fdf4';
        uploadBtn.textContent = 'Upload File';
      } else {
        fileInputDefault.classList.remove('hidden');
        fileInputSelected.classList.add('hidden');
        dropZone.style.borderColor = '';
        dropZone.style.backgroundColor = '';
        uploadBtn.textContent = 'Upload File';
      }
    }

    datafileInput.addEventListener('change', updateFileDisplay);

    // Drag and drop functionality
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#3b82f6';
      dropZone.style.backgroundColor = '#eff6ff';
    });

    dropZone.addEventListener('dragleave', () => {
      if (!datafileInput.files[0]) {
        dropZone.style.borderColor = '';
        dropZone.style.backgroundColor = '';
      }
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer.files[0]) {
        datafileInput.files = e.dataTransfer.files;
        updateFileDisplay();
      }
    });

    // Delete file password verification
    let pendingDeleteForm = null;

    function showDeleteModal(event, form) {
      event.preventDefault();
      pendingDeleteForm = form;
      const fileName = form.dataset.fileName;
      const modal = document.getElementById('delete-modal');
      const passwordInput = document.getElementById('delete-password-input');
      const errorMsg = document.getElementById('password-error');
      const fileNameSpan = document.getElementById('modal-file-name');
      
      fileNameSpan.textContent = '"' + fileName + '"';
      passwordInput.value = '';
      errorMsg.classList.add('hidden');
      modal.classList.remove('hidden');
      
      // Focus on password input
      setTimeout(() => passwordInput.focus(), 100);
    }

    document.getElementById('modal-cancel-btn').addEventListener('click', () => {
      document.getElementById('delete-modal').classList.add('hidden');
      pendingDeleteForm = null;
    });

    document.getElementById('modal-delete-btn').addEventListener('click', async () => {
      const passwordInput = document.getElementById('delete-password-input');
      const errorMsg = document.getElementById('password-error');
      const password = passwordInput.value;

      if (!password) {
        errorMsg.textContent = 'Please enter your password';
        errorMsg.classList.remove('hidden');
        return;
      }

      // Send password to verify
      try {
        const formData = new FormData();
        formData.append('action', 'verify_password');
        formData.append('password', password);
        formData.append('csrf_token', document.querySelector('input[name="csrf_token"]').value);

        const response = await fetch(window.location.href, {
          method: 'POST',
          body: formData
        });

        const result = await response.json();

        if (result.success) {
          // Password verified, submit the delete form
          document.getElementById('delete-modal').classList.add('hidden');
          pendingDeleteForm.submit();
        } else {
          errorMsg.textContent = result.error || 'Incorrect password';
          errorMsg.classList.remove('hidden');
          passwordInput.focus();
        }
      } catch (err) {
        console.error('Password verification error:', err);
        errorMsg.textContent = 'Error verifying password';
        errorMsg.classList.remove('hidden');
      }
    });

    // Allow Enter key to submit
    document.getElementById('delete-password-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('modal-delete-btn').click();
      }
    });

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.getElementById('delete-modal').classList.contains('hidden')) {
        document.getElementById('delete-modal').classList.add('hidden');
        pendingDeleteForm = null;
      }
    });

    // Logout confirmation modal
    const logoutModal = document.getElementById('logout-modal');
    const logoutTriggers = document.querySelectorAll('.logout-trigger');
    const logoutCancelBtn = document.getElementById('logout-cancel-btn');
    const logoutConfirmBtn = document.getElementById('logout-confirm-btn');
    let pendingLogoutHref = 'logout.php';

    function closeLogoutModal() {
      logoutModal.classList.add('hidden');
    }

    logoutTriggers.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        pendingLogoutHref = link.getAttribute('href') || 'logout.php';
        logoutModal.classList.remove('hidden');
      });
    });

    logoutCancelBtn.addEventListener('click', closeLogoutModal);
    logoutConfirmBtn.addEventListener('click', () => {
      window.location.href = pendingLogoutHref;
    });

    logoutModal.addEventListener('click', (e) => {
      if (e.target === logoutModal) closeLogoutModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !logoutModal.classList.contains('hidden')) {
        closeLogoutModal();
      }
    });
  </script>
  <script src="js/staff.js"></script>
</body>
</html>