<?php
// file_serve.php  –  Serves uploaded files to authenticated users
require_once 'includes/db.php';
requireLogin();

$id  = (int)($_GET['id'] ?? 0);
$pdo = getPDO();
$row = $pdo->prepare('SELECT * FROM uploaded_files WHERE id = ?');
$row->execute([$id]);
$row = $row->fetch();

if (!$row) {
    http_response_code(404);
    die('File not found.');
}

$path = UPLOAD_DIR . $row['stored_name'];
if (!file_exists($path)) {
    http_response_code(404);
    die('File missing from disk.');
}

$ext  = strtolower(pathinfo($row['stored_name'], PATHINFO_EXTENSION));
$mime = match($ext) {
    'csv','txt' => 'text/plain; charset=utf-8',
    'xlsx'      => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'xls'       => 'application/vnd.ms-excel',
    default     => 'application/octet-stream',
};

header('Content-Type: ' . $mime);
header('Content-Length: ' . filesize($path));
header('Cache-Control: no-cache');
readfile($path);
exit;
