<?php
require __DIR__ . '/common.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['error' => 'POST method required.'], 405);
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) json_response(['error' => 'Invalid request JSON.'], 400);
$messages = $input['messages'] ?? [];
$model = trim((string)($input['model'] ?? ''));
if (!is_array($messages) || count($messages) < 1 || count($messages) > 60) json_response(['error' => 'Send between 1 and 60 messages.'], 400);
if ($model === '') json_response(['error' => 'Please select a model first.'], 400);

$safe = [];
foreach ($messages as $message) {
    if (!is_array($message)) continue;
    $role = $message['role'] ?? 'user';
    if (!in_array($role, ['system', 'user', 'assistant'], true)) $role = 'user';
    $content = (string)($message['content'] ?? '');
    if (function_exists('mb_substr')) $content = mb_substr($content, 0, 30000, 'UTF-8');
    else $content = substr($content, 0, 30000);
    $safe[] = ['role' => $role, 'content' => $content];
}
if (!$safe) json_response(['error' => 'No valid messages received.'], 400);

$payload = json_encode([
    'model' => $model,
    'messages' => $safe,
    'temperature' => 0.7,
    'stream' => false
], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
if ($payload === false) json_response(['error' => 'Could not encode chat request.'], 400);

$data = agentrouter_request('chat/completions', 'POST', $payload);
$reply = $data['choices'][0]['message']['content'] ?? null;
if (is_array($reply)) {
    $parts = [];
    foreach ($reply as $part) {
        if (is_array($part) && isset($part['text'])) $parts[] = (string)$part['text'];
    }
    $reply = implode("\n", $parts);
}
if (!is_string($reply) || trim($reply) === '') json_response(['error' => 'AgentRouter returned an empty reply.'], 502);
json_response(['reply' => $reply, 'model' => $data['model'] ?? $model, 'usage' => $data['usage'] ?? null]);
