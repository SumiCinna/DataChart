<?php
// login.php  –  Login page
require_once 'includes/db.php';

startSession();

// Already logged in → redirect
if (loggedIn()) {
    $role = currentUser()['role'];
    header('Location: ' . ($role === 'admin' ? 'admin.php' : 'dashboard.php'));
    exit;
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verifyCsrf();

    $identifier = trim($_POST['identifier'] ?? '');
    $password   = $_POST['password'] ?? '';

    if ($identifier === '' || $password === '') {
        $error = 'Please enter your username/email and password.';
    } else {
        $pdo  = getPDO();
        $stmt = $pdo->prepare(
            'SELECT u.*, r.name AS role
               FROM users u
               JOIN roles r ON r.id = u.role_id
              WHERE (u.username = ? OR u.email = ?)
              LIMIT 1'
        );
        $stmt->execute([$identifier, $identifier]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password'])) {
            $error = 'Invalid credentials.';
        } elseif ($user['status'] === 'pending') {
            $error = 'Your account is awaiting admin approval.';
        } elseif ($user['status'] === 'inactive') {
            $error = 'Your account has been deactivated. Contact an admin.';
        } else {
            $_SESSION['user'] = [
                'id'        => $user['id'],
                'username'  => $user['username'],
                'full_name' => $user['full_name'],
                'role'      => $user['role'],
                'role_id'   => $user['role_id'],
            ];
            auditLog('login');
            header('Location: ' . ($user['role'] === 'admin' ? 'admin.php' : 'dashboard.php'));
            exit;
        }
    }
}

$token = csrfToken();
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DataChart — Sign In</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <script>
    tailwind.config = {
      theme: { extend: {
        fontFamily: { sans:['"IBM Plex Sans"','sans-serif'], mono:['"IBM Plex Mono"','monospace'] }
      }}
    }
  </script>
  <link rel="stylesheet" href="css/auth.css" />
</head>
<body class="min-h-screen bg-slate-950 text-slate-100 font-sans flex items-center justify-center p-4">

  <div class="auth-card w-full max-w-sm">
    <!-- Logo -->
    <a href="index.php" class="flex items-center gap-3 mb-8 no-underline" style="text-decoration:none">
      <div class="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
        <svg width="16" height="16" viewBox="0 0 13 13" fill="none">
          <rect x="1" y="6" width="2.5" height="6" fill="white" rx="0.5"/>
          <rect x="5" y="3.5" width="2.5" height="8.5" fill="white" rx="0.5"/>
          <rect x="9" y="1" width="2.5" height="11" fill="white" rx="0.5"/>
        </svg>
      </div>
      <span class="font-bold text-lg tracking-tight text-slate-100">DataChart</span>
    </a>

    <h1 class="text-2xl font-extrabold tracking-tight mb-1">Welcome back</h1>
    <p class="text-slate-500 text-sm mb-7">Sign in to your account</p>

    <?php if ($error): ?>
      <div class="alert-error mb-5">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" class="inline mr-1.5 -mt-0.5 opacity-80">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>
        <?= htmlspecialchars($error) ?>
      </div>
    <?php endif; ?>

    <?php $reg_success = flash('register_success'); if ($reg_success): ?>
      <div class="alert-success mb-5"><?= htmlspecialchars($reg_success) ?></div>
    <?php endif; ?>

    <form method="POST" action="login.php" novalidate>
      <input type="hidden" name="csrf_token" value="<?= $token ?>">

      <div class="field-group mb-4">
        <label class="field-label" for="identifier">Username or Email</label>
        <input class="field-input" type="text" id="identifier" name="identifier"
               value="<?= htmlspecialchars($_POST['identifier'] ?? '') ?>"
               autocomplete="username" autofocus placeholder="Username or Email" />
      </div>

      <div class="field-group mb-6">
        <label class="field-label" for="password">Password</label>
        <div class="relative">
          <input class="field-input pr-10" type="password" id="password" name="password"
                 autocomplete="current-password" placeholder="••••••••" />
          <button type="button" id="toggle-pw" class="pw-toggle" tabindex="-1" aria-label="Toggle password">
            <svg id="eye-icon" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>
      </div>

      <button type="submit" class="btn-primary w-full mb-4">Sign in</button>
    </form>

    <p class="text-center text-slate-500 text-sm">
      Don't have an account?
      <a href="register.php" class="text-blue-500 hover:text-blue-400 font-semibold transition-colors">Request access</a>
    </p>

    <div class="mt-6 text-center">
      <a href="index.php" class="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-400 text-xs font-medium transition-colors">
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
        Back to home
      </a>
    </div>

  </div>

  <script src="js/auth.js"></script>
</body>
</html>