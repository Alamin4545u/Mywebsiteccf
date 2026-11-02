<?php
require __DIR__ . '/common.php';
if ($_SERVER['REQUEST_METHOD'] !== 'GET') json_response(['error' => 'GET method required.'], 405);
$config = app_config();
$data = agentrouter_request('models');
$models = [];
foreach (($data['data'] ?? []) as $item) {
    if (is_array($item) && !empty($item['id'])) {
        $models[] = ['id' => (string)$item['id'], 'name' => (string)($item['name'] ?? $item['id'])];
    }
}
json_response(['models' => $models, 'defaultModel' => (string)($config['default_model'] ?? '')]);
