<?php
/**
 * TapIn Golf — MySQL HTTP Proxy
 * Upload this file to your web root: https://tapingolf.co.za/db-proxy.php
 *
 * This script lets the Replit API server query MySQL over HTTPS,
 * bypassing the port-3306 firewall restriction on Replit's network.
 */

header('Content-Type: application/json');
header('X-Robots-Tag: noindex');

// ── Config ────────────────────────────────────────────────────────────────────
// Change DB_ values to match your local MySQL (usually localhost on cPanel).
// PROXY_KEY must match the DB_PROXY_KEY secret in Replit.
define('DB_HOST',     'localhost');
define('DB_NAME',     'tapingr7e9e4_tapingolf');
define('DB_USER',     'tapingr7e9e4_tapinadmin');
define('DB_PASS',     'TapinGolf2026!_');
define('PROXY_KEY',   getenv('TAPIN_PROXY_KEY') ?: 'tapin-proxy-2026-xK9mQzR7pL');

// ── Auth ──────────────────────────────────────────────────────────────────────
$incoming = $_SERVER['HTTP_X_PROXY_KEY'] ?? '';
if (!hash_equals(PROXY_KEY, $incoming)) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

// ── Parse request ─────────────────────────────────────────────────────────────
$body   = json_decode(file_get_contents('php://input'), true);
$sql    = trim($body['sql']    ?? '');
$params = $body['params']      ?? [];
$type   = $body['type']        ?? 'query'; // query | row | exec | run

if (!$sql) {
    http_response_code(400);
    echo json_encode(['error' => 'No SQL provided']);
    exit;
}

// ── Connect ───────────────────────────────────────────────────────────────────
try {
    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES 'utf8mb4'",
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'DB connect failed: ' . $e->getMessage()]);
    exit;
}

// ── Execute ───────────────────────────────────────────────────────────────────
try {
    $stmt = $pdo->prepare($sql);

    // Bind each param with the correct PDO type so MariaDB gets integers
    // for LIMIT/OFFSET (MariaDB rejects quoted integer literals there).
    foreach ($params as $i => $v) {
        if ($v === null) {
            $stmt->bindValue($i + 1, $v, PDO::PARAM_NULL);
        } elseif (is_int($v)) {
            $stmt->bindValue($i + 1, $v, PDO::PARAM_INT);
        } elseif (is_float($v) && floor($v) == $v && $v >= PHP_INT_MIN && $v <= PHP_INT_MAX) {
            // JSON numbers that are whole numbers arrive as float on 32-bit — cast to int
            $stmt->bindValue($i + 1, (int)$v, PDO::PARAM_INT);
        } else {
            $stmt->bindValue($i + 1, $v, PDO::PARAM_STR);
        }
    }
    $stmt->execute();

    switch ($type) {
        case 'row':
            $row = $stmt->fetch();
            echo json_encode($row !== false ? $row : null);
            break;

        case 'exec':
            echo json_encode([
                'insertId'     => (int) $pdo->lastInsertId(),
                'affectedRows' => $stmt->rowCount(),
            ]);
            break;

        case 'run':
            echo json_encode(['affectedRows' => $stmt->rowCount()]);
            break;

        default: // query
            echo json_encode($stmt->fetchAll());
            break;
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Query failed: ' . $e->getMessage(), 'sql' => $sql]);
}
