<?php
// Main entry point. Open this through your PHP server, not by tapping the file directly.
$config = require __DIR__ . '/config.php';
$appName = htmlspecialchars($config['app_name'] ?? 'Nexora AI', ENT_QUOTES, 'UTF-8');
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#171717">
  <title><?= $appName ?> — AI Chat</title>
  <link rel="stylesheet" href="style.css?v=2">
</head>
<body>
<div class="app-shell">
  <aside class="sidebar" id="sidebar">
    <div class="side-top">
      <div class="brand"><span class="brand-mark">✳</span><span><?= $appName ?></span></div>
      <button class="icon-btn mobile-close" id="closeSidebar" aria-label="Close menu">×</button>
    </div>
    <button class="new-chat" id="newChat"><span>＋</span> New chat</button>
    <div class="history-title">RECENT</div>
    <div id="historyList" class="history-list"></div>
    <div class="sidebar-bottom">
      <div class="profile-dot">A</div>
      <div><strong>AI Assistant</strong><small>AgentRouter API</small></div>
      <button class="icon-btn" id="clearHistory" title="Clear history">⋯</button>
    </div>
  </aside>
  <main class="main">
    <header class="topbar">
      <button class="icon-btn menu-btn" id="openSidebar" aria-label="Open menu">☰</button>
      <div class="top-brand"><span class="brand-mark">✳</span><strong><?= $appName ?></strong></div>
      <div class="top-actions">
        <span class="status" id="status"><i></i> Connecting</span>
        <select id="modelSelect" aria-label="Choose model"><option value="">Loading models…</option></select>
        <button class="icon-btn" id="newChatTop" title="New chat">＋</button>
      </div>
    </header>
    <section class="chat-area" id="chatArea">
      <div class="welcome" id="welcome">
        <div class="welcome-icon">✳</div>
        <h1>How can I help you today?</h1>
        <p>Ask a question, write something, or explore an idea.</p>
        <div class="suggestions">
          <button class="suggestion" data-prompt="Explain a difficult topic in simple language."><b>✧</b><span>Explain something</span></button>
          <button class="suggestion" data-prompt="Help me write a professional email."><b>✎</b><span>Write an email</span></button>
          <button class="suggestion" data-prompt="Help me debug this code."><b>⌘</b><span>Debug code</span></button>
          <button class="suggestion" data-prompt="Give me creative ideas for a project."><b>◇</b><span>Brainstorm ideas</span></button>
        </div>
      </div>
      <div id="messages" class="messages"></div>
    </section>
    <footer class="composer-wrap">
      <form id="chatForm" class="composer">
        <textarea id="messageInput" rows="1" placeholder="Message <?= $appName ?>…" autocomplete="off"></textarea>
        <div class="composer-bottom">
          <span class="composer-hint">AI can make mistakes. Check important information.</span>
          <button class="send-btn" id="sendBtn" type="submit" aria-label="Send message">↑</button>
        </div>
      </form>
      <div class="mobile-note">Powered by AgentRouter</div>
    </footer>
  </main>
</div>
<div class="toast" id="toast"></div>
<script src="script.js?v=2"></script>
</body>
</html>
