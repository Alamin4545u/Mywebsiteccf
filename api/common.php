<?php
function json_response(array $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
function app_config(): array {
    $file = dirname(__DIR__) . '/config.php';
    if (!is_file($file)) json_response(['error' => 'config.php is missing from the project root.'], 500);
    $config = require $file;
    if (!is_array($config)) json_response(['error' => 'config.php must return a PHP array.'], 500);
    return $config;
}
function api_key_or_fail(array $config): string {
    $key = trim((string)($config['api_key'] ?? ''));
    if ($key === '' || $key === 'PASTE_YOUR_NEW_AGENTROUTER_API_KEY_HERE') {
        json_response(['error' => 'API key is not configured. Add your new AgentRouter key in config.php.'], 503);
    }
    return $key;
}
function ca_bundle_path(): ?string {
    // Prefer the bundled CA bundle. Otherwise try common PHP/Linux/Termux locations.
    $candidates = [
        dirname(__DIR__) . '/cacert.pem',
        ini_get('curl.cainfo'),
        ini_get('openssl.cafile'),
        '/data/data/com.termux/files/usr/etc/tls/cert.pem',
        '/data/data/com.termux/files/usr/etc/ssl/cert.pem',
        '/etc/ssl/certs/ca-certificates.crt',
        '/etc/pki/tls/certs/ca-bundle.crt',
        '/etc/ssl/cert.pem'
    ];
    foreach ($candidates as $path) {
        if (is_string($path) && $path !== '' && is_file($path) && is_readable($path) && filesize($path) > 1000) {
            return $path;
        }
    }
    return null;
}
function agentrouter_request(string $endpoint, string $method = 'GET', ?string $body = null): array {
    $config = app_config();
    $key = api_key_or_fail($config);
    if (!function_exists('curl_init')) json_response(['error' => 'PHP cURL extension is disabled in PHP Server Ready. Enable cURL first.'], 500);

    $base = rtrim(trim((string)($config['base_url'] ?? 'https://co.agentrouter.org/v1')), '/');
    if (!preg_match('~^https://~i', $base)) json_response(['error' => 'For security, base_url must use HTTPS.'], 500);

    $ch = curl_init($base . '/' . ltrim($endpoint, '/'));
    $headers = ['Authorization: Bearer ' . $key, 'Accept: application/json'];
    if ($body !== null) $headers[] = 'Content-Type: application/json';

    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 20,
        CURLOPT_TIMEOUT => ($endpoint === 'chat/completions') ? 120 : 40,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS
    ];
    if ($method === 'POST') {
        $options[CURLOPT_POST] = true;
        $options[CURLOPT_POSTFIELDS] = $body ?? '';
    }

    $ca = ca_bundle_path();
    if ($ca !== null) {
        $options[CURLOPT_CAINFO] = $ca;
    } else {
        // Do not pass a broken php.ini curl.cainfo path to cURL.
        // cURL will use its compiled/system trust store if available.
        if (defined('CURLOPT_CAINFO')) $options[CURLOPT_CAINFO] = '';
    }

    curl_setopt_array($ch, $options);
    $raw = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($raw === false) {
        $extra = $ca === null
            ? ' No readable CA bundle was found. Put the official cacert.pem beside config.php.'
            : '';
        json_response(['error' => 'Could not connect to AgentRouter: ' . $error . $extra], 502);
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) json_response(['error' => 'AgentRouter returned an invalid JSON response (HTTP ' . $status . ').'], 502);
    if ($status < 200 || $status >= 300) {
        $message = $data['error']['message'] ?? $data['error'] ?? $data['message'] ?? ('AgentRouter returned HTTP ' . $status);
        if (is_array($message)) $message = json_encode($message);
        json_response(['error' => (string)$message], $status ?: 502);
    }
    return $data;
}
