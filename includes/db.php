<?php
// includes/db.php  –  PDO connection + shared helpers

// ── Database credentials (edit these) ────────────────────────
define('DB_HOST', 'localhost');
define('DB_PORT', '3306');
define('DB_NAME', 'datachart');
define('DB_USER', 'root');          // change to your MySQL user
define('DB_PASS', 'DREAMTEAM');              // change to your MySQL password
define('DB_CHARSET', 'utf8mb4');

// ── Uploads folder (absolute path) ───────────────────────────
define('UPLOAD_DIR', __DIR__ . '/../uploads/');
define('MAX_UPLOAD_MB', 20);

function getPDO(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;

    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=%s',
        DB_HOST, DB_PORT, DB_NAME, DB_CHARSET
    );
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    } catch (PDOException $e) {
        http_response_code(500);
        // In production, log $e->getMessage() and show a generic error
        die('<p style="color:red;font-family:sans-serif;padding:2rem">
             Database connection failed. Check <code>includes/db.php</code> credentials.<br>
             <small>' . htmlspecialchars($e->getMessage()) . '</small></p>');
    }
    return $pdo;
}

// ── Session bootstrap ─────────────────────────────────────────
function startSession(): void {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
}

// ── Auth helpers ──────────────────────────────────────────────
function currentUser(): ?array {
    startSession();
    return $_SESSION['user'] ?? null;
}

function requireLogin(): void {
    if (!currentUser()) {
        header('Location: index.php');
        exit;
    }
}

function requireRole(string ...$roles): void {
    requireLogin();
    $user = currentUser();
    if (!in_array($user['role'], $roles, true)) {
        header('Location: dashboard.php');
        exit;
    }
}

function loggedIn(): bool {
    return currentUser() !== null;
}

// ── CSRF ──────────────────────────────────────────────────────
function csrfToken(): string {
    startSession();
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function verifyCsrf(): void {
    $token = $_POST['csrf_token'] ?? '';
    if (!hash_equals(csrfToken(), $token)) {
        http_response_code(403);
        die('Invalid CSRF token.');
    }
}

// ── Flash messages ────────────────────────────────────────────
function flash(string $key, string $msg = ''): string {
    startSession();
    if ($msg !== '') {
        $_SESSION['flash'][$key] = $msg;
        return '';
    }
    $val = $_SESSION['flash'][$key] ?? '';
    unset($_SESSION['flash'][$key]);
    return $val;
}

// ── Audit log helper ──────────────────────────────────────────
function auditLog(string $action, string $detail = ''): void {
    try {
        $u = currentUser();
        getPDO()->prepare('INSERT INTO audit_log (user_id,action,detail) VALUES (?,?,?)')
                ->execute([$u['id'] ?? null, $action, $detail]);
    } catch (Throwable $e) { /* non-fatal */ }
}
