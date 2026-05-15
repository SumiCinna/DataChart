<?php
// logout.php
require_once 'includes/db.php';
startSession();
auditLog('logout');
session_destroy();
header('Location: index.php');
exit;
