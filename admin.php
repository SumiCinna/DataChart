<?php
// admin.php  –  Account management (admin only)
require_once 'includes/db.php';
requireRole('admin');

$user = currentUser();
$pdo  = getPDO();
$msg  = '';
$err  = '';

/* ── Handle POST actions ───────────────────────────────────── */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verifyCsrf();
    $action    = $_POST['action'] ?? '';
    $targetId  = (int)($_POST['user_id'] ?? 0);

    // Prevent self-modification on destructive actions
    $selfActions = ['deactivate','delete','demote'];
    if (in_array($action, $selfActions) && $targetId === (int)$user['id']) {
        $err = 'You cannot perform this action on your own account.';
    } else {

        if ($action === 'approve') {
            $pdo->prepare("UPDATE users SET status='active' WHERE id=?")->execute([$targetId]);
            auditLog('admin_approve_user', "id=$targetId");
            $msg = 'Account approved.';
        }
        if ($action === 'reject') {
            $pdo->prepare("UPDATE users SET status='inactive' WHERE id=? AND status='pending'")->execute([$targetId]);
            auditLog('admin_reject_user', "id=$targetId");
            $msg = 'Account request rejected.';
        }
        if ($action === 'activate') {
            $pdo->prepare("UPDATE users SET status='active' WHERE id=?")->execute([$targetId]);
            auditLog('admin_activate_user', "id=$targetId");
            $msg = 'Account activated.';
        }
        if ($action === 'deactivate') {
            $pdo->prepare("UPDATE users SET status='inactive' WHERE id=?")->execute([$targetId]);
            auditLog('admin_deactivate_user', "id=$targetId");
            $msg = 'Account deactivated.';
        }
        if ($action === 'grant_admin') {
            $pdo->prepare("UPDATE users SET role_id=1 WHERE id=?")->execute([$targetId]);
            auditLog('admin_grant_admin', "id=$targetId");
            $msg = 'Admin access granted.';
        }
        if ($action === 'set_role') {
            $newRole = (int)$_POST['new_role_id'];
            if (in_array($newRole, [1,2,3])) {
                $pdo->prepare("UPDATE users SET role_id=? WHERE id=?")->execute([$newRole, $targetId]);
                auditLog('admin_set_role', "id=$targetId role=$newRole");
                $msg = 'Role updated.';
            }
        }
        if ($action === 'delete') {
            $pdo->prepare('DELETE FROM users WHERE id=?')->execute([$targetId]);
            auditLog('admin_delete_user', "id=$targetId");
            $msg = 'Account deleted.';
        }
    }
}

/* ── Fetch users ───────────────────────────────────────────── */
$pending = $pdo->query(
    "SELECT u.*, r.name AS role FROM users u JOIN roles r ON r.id=u.role_id
      WHERE u.status='pending' ORDER BY u.created_at ASC"
)->fetchAll();

$active = $pdo->query(
    "SELECT u.*, r.name AS role FROM users u JOIN roles r ON r.id=u.role_id
      WHERE u.status IN ('active','inactive') ORDER BY u.role_id, u.username ASC"
)->fetchAll();

$token = csrfToken();
?>
<!DOCTYPE html>
<html lang="en" data-theme="light" class="bg-white">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DataChart — Admin</title>
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
        <span class="role-badge role-admin">Admin</span>
        <span class="text-white text-xs hidden sm:inline"><?= htmlspecialchars($user['full_name']) ?></span>
        <a href="dashboard.php" class="nav-link-btn">Dashboard</a>
        <a href="staff.php" class="nav-link-btn">Files</a>
        <a href="logout.php" class="logout-trigger nav-link-btn">Sign out</a>
      </div>
    </div>
  </header>

  <main class="max-w-5xl mx-auto px-6 py-8">

    <h1 class="text-2xl font-extrabold tracking-tight mb-6">Account Management</h1>

    <?php if ($msg): ?><div class="alert-success mb-5"><?= htmlspecialchars($msg) ?></div><?php endif; ?>
    <?php if ($err): ?><div class="alert-error mb-5"><?= htmlspecialchars($err) ?></div><?php endif; ?>

    <!-- ── Pending requests ─────────────────────────────────── -->
    <div class="card mb-6">
      <div class="flex items-center gap-3 mb-4">
        <h2 class="section-title">Pending Requests</h2>
        <?php if (!empty($pending)): ?>
          <span class="bg-amber-900/50 text-amber-300 text-[10px] px-2 py-0.5 rounded-full border border-amber-700">
            <?= count($pending) ?> waiting
          </span>
        <?php endif; ?>
      </div>

      <?php if (empty($pending)): ?>
        <p class="text-slate-500 text-sm text-center py-6">No pending requests.</p>
      <?php else: ?>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Requested Role</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <?php foreach ($pending as $u): ?>
                <tr>
                  <td class="font-medium"><?= htmlspecialchars($u['full_name']) ?></td>
                  <td class="text-slate-400 text-xs font-mono"><?= htmlspecialchars($u['username']) ?></td>
                  <td class="text-slate-400 text-xs"><?= htmlspecialchars($u['email']) ?></td>
                  <td><span class="role-badge role-<?= $u['role'] ?>"><?= ucfirst($u['role']) ?></span></td>
                  <td class="text-slate-400 text-xs"><?= date('M j, Y', strtotime($u['created_at'])) ?></td>
                  <td>
                    <div class="flex gap-2">
                      <form method="POST" class="inline">
                        <input type="hidden" name="csrf_token" value="<?= $token ?>">
                        <input type="hidden" name="action" value="approve">
                        <input type="hidden" name="user_id" value="<?= $u['id'] ?>">
                        <button class="btn-sm btn-blue">Approve</button>
                      </form>
                      <form method="POST" class="inline" onsubmit="return confirm('Reject this request?')">
                        <input type="hidden" name="csrf_token" value="<?= $token ?>">
                        <input type="hidden" name="action" value="reject">
                        <input type="hidden" name="user_id" value="<?= $u['id'] ?>">
                        <button class="btn-sm btn-red">Reject</button>
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

    <!-- ── All accounts ─────────────────────────────────────── -->
    <div class="card">
      <h2 class="section-title mb-4">All Accounts</h2>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <?php foreach ($active as $u): ?>
              <tr class="<?= (int)$u['id']===(int)$user['id'] ? 'row-self' : '' ?>">
                <td>
                  <div>
                    <div class="font-medium text-sm"><?= htmlspecialchars($u['full_name'] ?: $u['username']) ?></div>
                    <div class="text-slate-500 text-[11px]"><?= htmlspecialchars($u['email']) ?></div>
                  </div>
                </td>
                <td class="text-slate-400 text-xs font-mono"><?= htmlspecialchars($u['username']) ?></td>
                <td>
                  <?php if ((int)$u['id'] !== (int)$user['id']): ?>
                    <form method="POST" class="inline flex items-center gap-1">
                      <input type="hidden" name="csrf_token" value="<?= $token ?>">
                      <input type="hidden" name="action" value="set_role">
                      <input type="hidden" name="user_id" value="<?= $u['id'] ?>">
                      <select name="new_role_id" onchange="this.form.submit()" class="role-select">
                        <option value="1" <?= $u['role']==='admin'?'selected':'' ?>>Admin</option>
                        <option value="2" <?= $u['role']==='staff'?'selected':'' ?>>Staff</option>
                        <option value="3" <?= $u['role']==='boss'?'selected':'' ?>>Boss</option>
                      </select>
                    </form>
                  <?php else: ?>
                    <span class="role-badge role-admin">Admin (you)</span>
                  <?php endif; ?>
                </td>
                <td>
                  <span class="status-badge status-<?= $u['status'] ?>">
                    <?= ucfirst($u['status']) ?>
                  </span>
                </td>
                <td class="text-slate-400 text-xs"><?= date('M j, Y', strtotime($u['created_at'])) ?></td>
                <td>
                  <?php if ((int)$u['id'] !== (int)$user['id']): ?>
                    <div class="flex gap-2 flex-wrap">
                      <?php if ($u['status'] === 'inactive' || $u['status'] === 'pending'): ?>
                        <form method="POST" class="inline">
                          <input type="hidden" name="csrf_token" value="<?= $token ?>">
                          <input type="hidden" name="action" value="activate">
                          <input type="hidden" name="user_id" value="<?= $u['id'] ?>">
                          <button class="btn-sm btn-blue">Activate</button>
                        </form>
                      <?php else: ?>
                        <form method="POST" class="inline">
                          <input type="hidden" name="csrf_token" value="<?= $token ?>">
                          <input type="hidden" name="action" value="deactivate">
                          <input type="hidden" name="user_id" value="<?= $u['id'] ?>">
                          <button class="btn-sm btn-ghost">Deactivate</button>
                        </form>
                      <?php endif; ?>
                      <form method="POST" class="inline" onsubmit="return confirm('Permanently delete this account?')">
                        <input type="hidden" name="csrf_token" value="<?= $token ?>">
                        <input type="hidden" name="action" value="delete">
                        <input type="hidden" name="user_id" value="<?= $u['id'] ?>">
                        <button class="btn-sm btn-red">Delete</button>
                      </form>
                    </div>
                  <?php else: ?>
                    <span class="text-slate-600 text-xs">—</span>
                  <?php endif; ?>
                </td>
              </tr>
            <?php endforeach; ?>
          </tbody>
        </table>
      </div>
    </div>

  </main>
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
  <script src="js/admin.js"></script>
</body>
</html>
