<?php
// register.php  –  Registration / Request Access page
require_once 'includes/db.php';

startSession();

if (loggedIn()) {
    $role = currentUser()['role'];
    header('Location: ' . ($role === 'admin' ? 'admin.php' : 'dashboard.php'));
    exit;
}

$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verifyCsrf();

    $first_name  = trim($_POST['first_name']  ?? '');
    $middle_name = trim($_POST['middle_name'] ?? '');
    $last_name   = trim($_POST['last_name']   ?? '');
    $username    = trim($_POST['username']    ?? '');
    $email       = trim($_POST['email']       ?? '');
    $password    = $_POST['password']         ?? '';
    $password2   = $_POST['password2']        ?? '';
    $role_id     = (int)($_POST['role_id']    ?? 3);

    // Validation
    if ($first_name === '')  $errors[] = 'First name is required.';
    if ($last_name  === '')  $errors[] = 'Last name is required.';
    if ($username   === '')  $errors[] = 'Username is required.';
    elseif (!preg_match('/^[a-z0-9_]{3,32}$/i', $username))
                             $errors[] = 'Username: 3–32 chars, letters/numbers/underscores only.';
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL))
                             $errors[] = 'A valid email address is required.';
    if (strlen($password) < 8)    $errors[] = 'Password must be at least 8 characters.';
    if ($password !== $password2) $errors[] = 'Passwords do not match.';
    if (!in_array($role_id, [2, 3], true)) $role_id = 3;

    if (empty($errors)) {
        $pdo = getPDO();

        $chk = $pdo->prepare('SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1');
        $chk->execute([$username, $email]);
        if ($chk->fetch()) {
            $errors[] = 'That username or email is already registered.';
        } else {
            // Store in the three new columns AND keep full_name in sync
            $full_name = $middle_name !== ''
                ? "$first_name $middle_name $last_name"
                : "$first_name $last_name";

            $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
            $ins  = $pdo->prepare(
                'INSERT INTO users
                   (username, email, password, first_name, middle_name, last_name, full_name, role_id, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, "pending")'
            );
            $ins->execute([
                $username, $email, $hash,
                $first_name, $middle_name, $last_name, $full_name,
                $role_id
            ]);

            $_SESSION['flash']['register_success'] =
                'Account requested! An admin will review and activate it shortly.';
            header('Location: login.php');
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
  <title>DataChart — Request Access</title>
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
  <style>
    .name-grid   { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .name-grid-3 { display: grid; grid-template-columns: 1fr 0.75fr 1fr; gap: 10px; }
  </style>
</head>
<body class="min-h-screen bg-slate-950 text-slate-100 font-sans flex items-center justify-center p-4">

  <div class="auth-card w-full" style="max-width:440px">
    <!-- Logo -->
    <a href="index.php" class="flex items-center gap-3 mb-8" style="text-decoration:none">
      <div class="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
        <svg width="16" height="16" viewBox="0 0 13 13" fill="none">
          <rect x="1" y="6" width="2.5" height="6" fill="white" rx="0.5"/>
          <rect x="5" y="3.5" width="2.5" height="8.5" fill="white" rx="0.5"/>
          <rect x="9" y="1" width="2.5" height="11" fill="white" rx="0.5"/>
        </svg>
      </div>
      <span class="font-bold text-lg tracking-tight text-slate-100">DataChart</span>
    </a>

    <h1 class="text-2xl font-extrabold tracking-tight mb-1">Request access</h1>
    <p class="text-slate-500 text-sm mb-7">An admin will approve your account before you can sign in.</p>

    <?php if (!empty($errors)): ?>
      <div class="alert-error mb-5">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" class="inline mr-1.5 -mt-0.5 opacity-80">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>
        <?php foreach ($errors as $e): ?>
          <?= htmlspecialchars($e) ?><br>
        <?php endforeach; ?>
      </div>
    <?php endif; ?>

    <form method="POST" action="register.php" novalidate>
      <input type="hidden" name="csrf_token" value="<?= $token ?>">

      <!-- Name row -->
      <div class="field-group mb-4">
        <label class="field-label">Full Name</label>
        <div class="name-grid-3">
          <div>
            <input class="field-input" type="text" name="first_name" id="first_name"
                   value="<?= htmlspecialchars($_POST['first_name'] ?? '') ?>"
                   autocomplete="given-name" autofocus placeholder="First" />
          </div>
          <div>
            <input class="field-input" type="text" name="middle_name" id="middle_name"
                   value="<?= htmlspecialchars($_POST['middle_name'] ?? '') ?>"
                   autocomplete="additional-name" placeholder="Middle" />
            <p class="text-slate-600 text-[10px] mt-1 text-center">optional</p>
          </div>
          <div>
            <input class="field-input" type="text" name="last_name" id="last_name"
                   value="<?= htmlspecialchars($_POST['last_name'] ?? '') ?>"
                   autocomplete="family-name" placeholder="Last" />
          </div>
        </div>
      </div>

      <!-- Username + Role -->
      <div class="name-grid mb-4">
        <div class="field-group">
          <label class="field-label" for="username">Username</label>
          <input class="field-input" type="text" id="username" name="username"
                 value="<?= htmlspecialchars($_POST['username'] ?? '') ?>"
                 autocomplete="username" placeholder="janesmith" />
        </div>
        <div class="field-group">
          <label class="field-label" for="role_id">Role</label>
          <select class="field-input" id="role_id" name="role_id">
            <option value="3" <?= (($_POST['role_id'] ?? 3) == 3) ? 'selected' : '' ?>>Boss (read-only)</option>
            <option value="2" <?= (($_POST['role_id'] ?? '') == 2) ? 'selected' : '' ?>>Staff (upload)</option>
          </select>
        </div>
      </div>

      <!-- Email -->
      <div class="field-group mb-4">
        <label class="field-label" for="email">Email</label>
        <input class="field-input" type="email" id="email" name="email"
               value="<?= htmlspecialchars($_POST['email'] ?? '') ?>"
               autocomplete="email" placeholder="jane@company.com" />
      </div>

      <!-- Password + Confirm -->
      <div class="name-grid mb-6">
        <div class="field-group">
          <label class="field-label" for="password">Password</label>
          <div class="relative">
            <input class="field-input pr-10" type="password" id="password" name="password"
                   autocomplete="new-password" placeholder="Min. 8 chars" />
            <button type="button" id="toggle-pw" class="pw-toggle" tabindex="-1" aria-label="Toggle password">
              <svg id="eye-icon" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="field-group">
          <label class="field-label" for="password2">Confirm</label>
          <input class="field-input" type="password" id="password2" name="password2"
                 autocomplete="new-password" placeholder="Repeat" />
        </div>
      </div>

      <button type="submit" class="btn-primary w-full mb-4">Submit request</button>
    </form>

    <p class="text-center text-slate-500 text-sm">
      Already have an account?
      <a href="login.php" class="text-blue-500 hover:text-blue-400 font-semibold transition-colors">Sign in</a>
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