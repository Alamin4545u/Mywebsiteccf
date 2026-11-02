<?php
require __DIR__ . '/common.php';
$config = app_config();
$ca = ca_bundle_path();
json_response([
    'php' => PHP_VERSION,
    'curl_enabled' => function_exists('curl_init'),
    'config_found' => is_file(dirname(__DIR__) . '/config.php'),
    'ca_bundle_found' => $ca !== null,
    'ca_bundle_path' => $ca,
    'api_key_configured' => !empty($config['api_key']) && $config['api_key'] !== 'PASTE_YOUR_NEW_AGENTROUTER_API_KEY_HERE'
]);
