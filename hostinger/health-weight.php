<?php
declare(strict_types=1);

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');

function reply(int $status, ?string $readingId = null): void
{
    http_response_code($status);
    $body = $readingId === null ? ['saved' => false] : ['saved' => true, 'reading_id' => $readingId];
    echo json_encode($body);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    reply(405);
}

try {
    $publicRoot = __DIR__;
    while (basename($publicRoot) !== 'public_html' && dirname($publicRoot) !== $publicRoot) {
        $publicRoot = dirname($publicRoot);
    }
    if (basename($publicRoot) !== 'public_html') reply(503);

    $configPath = realpath(dirname($publicRoot) . '/nathoeng-private-health/weight-config.php');
    if ($configPath === false || str_starts_with($configPath, $publicRoot . '/')) reply(503);
    $config = require $configPath;
    $token = $config['token'] ?? null;
    if (!is_string($token) || !preg_match('/\A[a-f0-9]{64}\z/', $token)) reply(503);
    if (!hash_equals($token, $_SERVER['HTTP_X_HEALTH_WEIGHT_TOKEN'] ?? '')) reply(401);

    $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '', 2)[0]));
    if ($contentType !== 'application/json') reply(415);
    $raw = file_get_contents('php://input', false, null, 0, 1025);
    if ($raw === false) reply(400);
    if (strlen($raw) > 1024) reply(413);
    $reading = json_decode($raw, true, 8);
    if (!is_array($reading) || count($reading) !== 4) reply(400);

    $uuid = '/\A[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\z/i';
    foreach (['reading_id', 'member_id', 'device_id'] as $field) {
        $value = $reading[$field] ?? null;
        if (!is_string($value) || !preg_match($uuid, $value)) reply(400);
        $reading[$field] = strtolower($value);
    }
    $weight = $reading['weight_hundredths'] ?? null;
    if (!is_int($weight) || $weight < 500 || $weight > 30000) reply(400);

    $db = new PDO($config['dsn'], $config['user'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 3,
    ]);
    $insert = $db->prepare(
        'insert into health_kiosk_weights (reading_id, member_id, device_id, weight_hundredths, measured_at_utc)
         values (:reading_id, :member_id, :device_id, :weight_hundredths, UTC_TIMESTAMP(6))'
    );
    try {
        $insert->execute($reading);
    } catch (PDOException $error) {
        if ((int) ($error->errorInfo[1] ?? 0) !== 1062) throw $error;
        $find = $db->prepare(
            'select member_id, device_id, weight_hundredths from health_kiosk_weights where reading_id = ?'
        );
        $find->execute([$reading['reading_id']]);
        $existing = $find->fetch(PDO::FETCH_ASSOC);
        if ($existing === false || $existing['member_id'] !== $reading['member_id']
            || $existing['device_id'] !== $reading['device_id'] || (int) $existing['weight_hundredths'] !== $weight) {
            reply(409);
        }
    }
    reply(200, $reading['reading_id']);
} catch (Throwable) {
    error_log('Health weight storage unavailable');
    reply(503);
}
