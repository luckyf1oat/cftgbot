/**
 * 管理后台处理模块
 * 提供管理页面渲染和 API 接口
 */
import { hashPassword, generateToken, getToken } from './auth.js';
import { setWebhook, deleteWebhook, getMe } from './telegram.js';

/**
 * 生成管理后台 SPA 页面 HTML
 */
function getAdminHTML(isSetup) {
  // Base URL for the worker
  const baseUrl = self.location?.origin || '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Telegram 入群验证 Bot 管理</title>
<style>
  :root {
    --bg: #f0f2f5;
    --card-bg: #ffffff;
    --primary: #0088cc;
    --primary-hover: #006fa3;
    --danger: #e74c3c;
    --danger-hover: #c0392b;
    --text: #222;
    --text-secondary: #666;
    --border: #e0e0e0;
    --shadow: 0 2px 12px rgba(0,0,0,0.08);
    --radius: 12px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
  }

  /* Auth Pages */
  .auth-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 20px;
  }
  .auth-card {
    background: var(--card-bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 40px;
    width: 100%;
    max-width: 420px;
  }
  .auth-card .logo {
    text-align: center;
    margin-bottom: 30px;
  }
  .auth-card .logo svg { width: 64px; height: 64px; }
  .auth-card h1 {
    text-align: center;
    font-size: 22px;
    font-weight: 600;
    margin-bottom: 6px;
  }
  .auth-card p {
    text-align: center;
    color: var(--text-secondary);
    font-size: 14px;
    margin-bottom: 24px;
  }

  /* Dashboard Layout */
  .dashboard {
    max-width: 900px;
    margin: 0 auto;
    padding: 0 16px 80px;
  }
  .navbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    background: var(--card-bg);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 100;
  }
  .navbar .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 18px;
    font-weight: 600;
  }
  .navbar .brand svg { width: 30px; height: 30px; }
  .navbar .user-area {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .navbar .user-area span { font-size: 14px; color: var(--text-secondary); }

  .dashboard-header {
    padding: 28px 0 20px;
  }
  .dashboard-header h2 { font-size: 24px; font-weight: 600; }
  .dashboard-header p { color: var(--text-secondary); font-size: 14px; margin-top: 4px; }

  /* Bot Cards */
  .bot-list { display: flex; flex-direction: column; gap: 16px; }
  .bot-card {
    background: var(--card-bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 20px 24px;
    transition: box-shadow 0.2s;
  }
  .bot-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.12); }
  .bot-card .bot-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .bot-card .bot-info { flex: 1; }
  .bot-card .bot-name {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .bot-card .bot-name .status {
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #2ecc71;
  }
  .bot-card .bot-token {
    font-size: 13px;
    color: var(--text-secondary);
    font-family: 'Courier New', monospace;
  }
  .bot-card .bot-actions { display: flex; gap: 8px; }
  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--text-secondary);
  }
  .empty-state svg { width: 80px; height: 80px; opacity: 0.4; margin-bottom: 16px; }
  .empty-state h3 { font-size: 18px; margin-bottom: 8px; }
  .empty-state p { font-size: 14px; }

  /* Modal */
  .modal-overlay {
    display: none;
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5);
    z-index: 1000;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .modal-overlay.active { display: flex; }
  .modal {
    background: var(--card-bg);
    border-radius: var(--radius);
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    width: 100%;
    max-width: 520px;
    max-height: 90vh;
    overflow-y: auto;
    padding: 32px;
    position: relative;
  }
  .modal h3 { font-size: 20px; margin-bottom: 20px; }
  .modal .close-btn {
    position: absolute;
    top: 16px; right: 16px;
    background: none; border: none;
    font-size: 24px;
    cursor: pointer;
    color: var(--text-secondary);
    width: 32px; height: 32px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%;
  }
  .modal .close-btn:hover { background: var(--bg); }

  /* Forms */
  .form-group { margin-bottom: 16px; }
  .form-group label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 6px;
    color: var(--text);
  }
  .form-group input, .form-group textarea {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 14px;
    font-family: inherit;
    transition: border-color 0.2s;
    background: #fafafa;
  }
  .form-group input:focus, .form-group textarea:focus {
    outline: none;
    border-color: var(--primary);
    background: #fff;
  }
  .form-group textarea { resize: vertical; min-height: 60px; }
  .form-group .hint {
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 4px;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
  }
  .btn:active { transform: scale(0.97); }
  .btn-primary { background: var(--primary); color: #fff; }
  .btn-primary:hover { background: var(--primary-hover); }
  .btn-danger { background: var(--danger); color: #fff; }
  .btn-danger:hover { background: var(--danger-hover); }
  .btn-outline {
    background: transparent;
    color: var(--text);
    border: 1px solid var(--border);
  }
  .btn-outline:hover { background: var(--bg); }
  .btn-sm { padding: 6px 14px; font-size: 13px; }
  .btn-block { width: 100%; }
  .btn-icon {
    width: 36px; height: 36px;
    padding: 0;
    border-radius: 50%;
  }

  .fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--primary);
    color: #fff;
    border: none;
    font-size: 28px;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(0,136,204,0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    z-index: 50;
  }
  .fab:hover { transform: scale(1.05); background: var(--primary-hover); }
  .fab:active { transform: scale(0.95); }

  .toast {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 2000;
    animation: slideIn 0.3s ease;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }
  .toast.success { background: #2ecc71; color: #fff; }
  .toast.error { background: var(--danger); color: #fff; }
  .toast.info { background: var(--primary); color: #fff; }

  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  .spinner {
    display: inline-block;
    width: 20px; height: 20px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 600px) {
    .auth-card { padding: 24px; }
    .navbar { padding: 12px 16px; }
    .bot-card { padding: 16px; }
    .bot-card .bot-header { flex-direction: column; align-items: flex-start; gap: 12px; }
    .bot-card .bot-actions { width: 100%; }
    .bot-card .bot-actions .btn { flex: 1; }
    .modal { padding: 24px; }
  }
</style>
</head>
<body>
<div id="app"></div>
<script>
const BASE_URL = '${baseUrl}';

// API 请求封装
async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(BASE_URL + '/api' + path, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Toast 通知
function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ========== 路由 ==========
function navigate() {
  const path = window.location.pathname;
  if (path === '/login') renderLogin();
  else if (path === '/setup') renderSetup();
  else if (path === '/dashboard') renderDashboard();
  else if (path === '/' || path === '') {
    const setupDone = localStorage.getItem('setupDone');
    if (setupDone === 'true') window.location.href = '/login';
    else window.location.href = '/setup';
  } else {
    document.getElementById('app').innerHTML = '<div class="auth-page"><div class="auth-card"><h1>404</h1><p>页面未找到</p><button class="btn btn-primary btn-block" onclick="window.location.href=\'/\'">返回首页</button></div></div>';
  }
}

// ========== 设置密码页 ==========
function renderSetup() {
  const app = document.getElementById('app');
  app.innerHTML = \`
    <div class="auth-page">
      <div class="auth-card">
        <div class="logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <h1>🔐 首次设置</h1>
        <p>设置管理员密码，用于管理 Bot 配置</p>
        <div id="setup-form">
          <div class="form-group">
            <label>管理员密码</label>
            <input type="password" id="setup-password" placeholder="输入密码" autocomplete="new-password"/>
          </div>
          <div class="form-group">
            <label>确认密码</label>
            <input type="password" id="setup-confirm" placeholder="再次输入密码" autocomplete="new-password"/>
          </div>
          <button class="btn btn-primary btn-block" id="setup-btn" onclick="handleSetup()">设置密码</button>
        </div>
      </div>
    </div>
  \`;
}

async function handleSetup() {
  const password = document.getElementById('setup-password').value;
  const confirm = document.getElementById('setup-confirm').value;
  const btn = document.getElementById('setup-btn');
  if (!password) { showToast('请输入密码', 'error'); return; }
  if (password !== confirm) { showToast('两次密码不一致', 'error'); return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const data = await api('/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    localStorage.setItem('token', data.token);
    localStorage.setItem('setupDone', 'true');
    showToast('密码设置成功！', 'success');
    setTimeout(() => { window.location.href = '/dashboard'; }, 500);
  } catch (e) {
    showToast(e.message, 'error');
    btn.disabled = false;
    btn.textContent = '设置密码';
  }
}

// ========== 登录页 ==========
function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = \`
    <div class="auth-page">
      <div class="auth-card">
        <div class="logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <h1>👋 管理员登录</h1>
        <p>请输入管理员密码以管理 Bot</p>
        <div class="form-group">
          <label>管理员密码</label>
          <input type="password" id="login-password" placeholder="输入密码" autocomplete="current-password" onkeydown="if(event.key==='Enter')handleLogin()"/>
        </div>
        <button class="btn btn-primary btn-block" id="login-btn" onclick="handleLogin()">登录</button>
      </div>
    </div>
  \`;
  document.getElementById('login-password').focus();
}

async function handleLogin() {
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  if (!password) { showToast('请输入密码', 'error'); return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const data = await api('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    localStorage.setItem('token', data.token);
    localStorage.setItem('setupDone', 'true');
    showToast('登录成功！', 'success');
    setTimeout(() => { window.location.href = '/dashboard'; }, 500);
  } catch (e) {
    showToast(e.message, 'error');
    btn.disabled = false;
    btn.textContent = '登录';
  }
}

// ========== 仪表盘 ==========
let bots = [];

async function renderDashboard() {
  // 检查是否已登录
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '/login'; return; }

  const app = document.getElementById('app');
  app.innerHTML = \`
    <div class="navbar">
      <div class="brand">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        Bot 管理
      </div>
      <div class="user-area">
        <span>管理员</span>
        <button class="btn btn-outline btn-sm" onclick="handleLogout()">登出</button>
      </div>
    </div>
    <div class="dashboard">
      <div class="dashboard-header">
        <h2>🤖 验证 Bot</h2>
        <p>管理你的 Telegram 入群验证机器人</p>
      </div>
      <div id="bot-list" class="bot-list">
        <div class="empty-state" id="loading-state">
          <div class="spinner" style="border-color:rgba(0,0,0,0.1);border-top-color:var(--primary);width:40px;height:40px;border-width:3px;margin:0 auto 16px"></div>
          <p>加载中...</p>
        </div>
      </div>
    </div>
    <button class="fab" onclick="openAddModal()" title="添加 Bot">+</button>
  \`;
  
  await loadBots();
}

async function loadBots() {
  try {
    const data = await api('/bots');
    bots = data.bots || [];
    renderBotList();
  } catch (e) {
    document.getElementById('bot-list').innerHTML = '<div class="empty-state"><p>加载失败: ' + e.message + '</p></div>';
  }
}

function renderBotList() {
  const container = document.getElementById('bot-list');
  if (bots.length === 0) {
    container.innerHTML = \`
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
        <h3>还没有添加 Bot</h3>
        <p>点击右下角的 + 按钮添加你的第一个 Bot</p>
      </div>
    \`;
    return;
  }
  container.innerHTML = bots.map(bot => \`
    <div class="bot-card">
      <div class="bot-header">
        <div class="bot-info">
          <div class="bot-name">
            <span class="status" style="background:\${bot.webhook_set ? '#2ecc71' : '#e74c3c'}"></span>
            \${escapeHtml(bot.name || 'Unnamed Bot')}
          </div>
          <div class="bot-token">\${maskToken(bot.token)}</div>
        </div>
        <div class="bot-actions">
          <button class="btn btn-outline btn-sm" onclick="openEditModal(\${bot.id})">✏️ 编辑</button>
          <button class="btn btn-danger btn-sm" onclick="deleteBot(\${bot.id})">🗑️ 删除</button>
        </div>
      </div>
    </div>
  \`).join('');
}

function maskToken(token) {
  if (!token) return '';
  if (token.length < 10) return '****';
  return token.substring(0, 6) + '****' + token.substring(token.length - 4);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ========== Modal ==========
function openAddModal() { openBotModal(null); }
function openEditModal(id) {
  const bot = bots.find(b => b.id === id);
  if (bot) openBotModal(bot);
}

function openBotModal(bot) {
  const isEdit = !!bot;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.id = 'bot-modal';
  overlay.innerHTML = \`
    <div class="modal">
      <button class="close-btn" onclick="closeModal()">×</button>
      <h3>\${isEdit ? '✏️ 编辑 Bot' : '➕ 添加 Bot'}</h3>
      <form id="bot-form" onsubmit="return false;">
        <div class="form-group">
          <label>Bot 名称</label>
          <input type="text" id="form-name" placeholder="例如：我的验证 Bot" value="\${isEdit ? escapeHtml(bot.name || '') : ''}" required/>
        </div>
        <div class="form-group">
          <label>Bot Token</label>
          <input type="text" id="form-token" placeholder="123456:ABCdef..." value="\${isEdit ? escapeHtml(bot.token || '') : ''}" required/>
          <div class="hint">从 @BotFather 获取的 Bot Token</div>
        </div>
        <div class="form-group">
          <label>Turnstile Site Key</label>
          <input type="text" id="form-site-key" placeholder="0x4AAAA..." value="\${isEdit ? escapeHtml(bot.site_key || '') : ''}" required/>
        </div>
        <div class="form-group">
          <label>Turnstile Secret Key</label>
          <input type="text" id="form-secret-key" placeholder="0x4AAAA..." value="\${isEdit ? escapeHtml(bot.secret_key || '') : ''}" required/>
        </div>
        <div class="form-group">
          <label>管理群组 ID（可选，逗号分隔）</label>
          <input type="text" id="form-chat-ids" placeholder="-100123456,-100789012" value="\${isEdit ? escapeHtml((bot.allowed_chat_ids || []).join(',')) : ''}"/>
          <div class="hint">留空则表示允许所有群组使用此 Bot</div>
        </div>
        <button type="submit" class="btn btn-primary btn-block" id="form-submit-btn">
          \${isEdit ? '保存修改' : '添加 Bot'}
        </button>
      </form>
    </div>
  \`;
  document.body.appendChild(overlay);

  document.getElementById('bot-form').addEventListener('submit', async () => {
    const name = document.getElementById('form-name').value.trim();
    const token = document.getElementById('form-token').value.trim();
    const siteKey = document.getElementById('form-site-key').value.trim();
    const secretKey = document.getElementById('form-secret-key').value.trim();
    const chatIdsStr = document.getElementById('form-chat-ids').value.trim();
    const btn = document.getElementById('form-submit-btn');

    if (!name || !token || !siteKey || !secretKey) {
      showToast('请填写所有必填字段', 'error');
      return;
    }

    const allowedChatIds = chatIdsStr ? chatIdsStr.split(',').map(s => s.trim()).filter(Boolean) : [];
    const payload = { name, token, site_key: siteKey, secret_key: secretKey, allowed_chat_ids: allowedChatIds };

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    try {
      if (isEdit) {
        await api('/bots/' + bot.id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        showToast('Bot 已更新', 'success');
      } else {
        await api('/bots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        showToast('Bot 已添加', 'success');
      }
      closeModal();
      await loadBots();
    } catch (e) {
      showToast(e.message, 'error');
      btn.disabled = false;
      btn.textContent = isEdit ? '保存修改' : '添加 Bot';
    }
  });
}

function closeModal() {
  const modal = document.getElementById('bot-modal');
  if (modal) modal.remove();
}

async function deleteBot(id) {
  if (!confirm('确定要删除这个 Bot 吗？')) return;
  try {
    await api('/bots/' + id, { method: 'DELETE' });
    showToast('Bot 已删除', 'success');
    await loadBots();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function handleLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('setupDone');
  window.location.href = '/login';
}

// ========== 启动 ==========
navigate();
window.addEventListener('popstate', navigate);
</script>
</body>
</html>`;
}

/**
 * 处理管理后台请求路由
 */
export async function handleAdminRequest(request, kv, url) {
  const path = url.pathname.replace(/\/$/, '') || '/';
  const method = request.method;

  // 静态页面路由
  if (method === 'GET') {
    // 检查是否已设置密码
    const hasPassword = await kv.hasAdminPassword();
    
    if (path === '/setup' && !hasPassword) {
      return new Response(getAdminHTML(true), {
        headers: { 'Content-Type': 'text/html;charset=utf-8' },
      });
    }
    if (path === '/setup' && hasPassword) {
      return Response.redirect(url.origin + '/login', 302);
    }
    
    if (path === '/login' && !hasPassword) {
      return Response.redirect(url.origin + '/setup', 302);
    }
    if (path === '/login' && hasPassword) {
      return new Response(getAdminHTML(false), {
        headers: { 'Content-Type': 'text/html;charset=utf-8' },
      });
    }
    
    if (path === '/dashboard' || path === '/') {
      if (!hasPassword) {
        return Response.redirect(url.origin + '/setup', 302);
      }
      return new Response(getAdminHTML(false), {
        headers: { 'Content-Type': 'text/html;charset=utf-8' },
      });
    }
  }

  // API 路由
  if (path.startsWith('/api/')) {
    const apiPath = path.slice(5); // Remove '/api/'
    
    // 设置密码（不需要认证）
    if (apiPath === 'setup' && method === 'POST') {
      return handleSetupAPI(request, kv);
    }
    
    // 登录（不需要认证）
    if (apiPath === 'login' && method === 'POST') {
      return handleLoginAPI(request, kv);
    }
    
    // 其他 API 需要认证
    const token = getToken(request);
    if (!token || !(await kv.validateToken(token))) {
      return jsonResponse({ error: '未授权，请先登录' }, 401);
    }
    
    // Bot CRUD
    if (apiPath === 'bots' && method === 'GET') {
      return handleGetBots(kv);
    }
    if (apiPath === 'bots' && method === 'POST') {
      return handleCreateBot(request, kv, url);
    }
    
    // /api/bots/:id
    const botMatch = apiPath.match(/^bots\/(\d+)$/);
    if (botMatch) {
      const botId = parseInt(botMatch[1]);
      if (method === 'PUT') return handleUpdateBot(request, kv, botId, url);
      if (method === 'DELETE') return handleDeleteBot(request, kv, botId);
    }
    
    // Bot webhook 操作
    const webhookMatch = apiPath.match(/^bots\/(\d+)\/webhook$/);
    if (webhookMatch) {
      const botId = parseInt(webhookMatch[1]);
      if (method === 'POST') return handleSetWebhook(request, kv, botId, url);
    }
  }

  return jsonResponse({ error: 'Not Found' }, 404);
}

// === API Handlers ===

async function handleSetupAPI(request, kv) {
  try {
    const { password } = await request.json();
    if (!password) {
      return jsonResponse({ error: '密码不能为空' }, 400);
    }
    const hashed = await hashPassword(password);
    await kv.setAdminPassword(hashed);
    const token = generateToken();
    await kv.setAdminToken(token);
    return jsonResponse({ success: true, token });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

async function handleLoginAPI(request, kv) {
  try {
    const { password } = await request.json();
    if (!password) {
      return jsonResponse({ error: '密码不能为空' }, 400);
    }
    const storedHash = await kv.getAdminPassword();
    if (!storedHash) {
      return jsonResponse({ error: '尚未设置管理员密码，请先访问 /setup' }, 400);
    }
    const hashed = await hashPassword(password);
    if (hashed !== storedHash) {
      return jsonResponse({ error: '密码错误' }, 401);
    }
    const token = generateToken();
    await kv.setAdminToken(token);
    return jsonResponse({ success: true, token });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

async function handleGetBots(kv) {
  const bots = await kv.getAllBots();
  // 返回时隐藏完整的 token（前端不需要完整 token）
  const safeBots = bots.map(b => ({
    ...b,
    token: maskBotToken(b.token),
  }));
  return jsonResponse({ bots: safeBots });
}

async function handleCreateBot(request, kv, url) {
  try {
    const body = await request.json();
    const { name, token, site_key, secret_key, allowed_chat_ids } = body;
    
    if (!name || !token || !site_key || !secret_key) {
      return jsonResponse({ error: '请填写所有必填字段' }, 400);
    }

    // 验证 Bot Token 有效性
    const botInfo = await getMe(token);
    if (!botInfo.ok) {
      return jsonResponse({ error: 'Bot Token 无效: ' + (botInfo.description || '未知错误') }, 400);
    }

    const botId = await kv.getNextBotId();
    const config = {
      name,
      token,
      site_key,
      secret_key,
      allowed_chat_ids: allowed_chat_ids || [],
      created_at: Date.now(),
      webhook_set: false,
    };
    await kv.saveBot(botId, config);

    // 设置 Webhook
    const workerUrl = url.origin;
    const webhookResult = await setWebhook(token, `${workerUrl}/webhook/${botId}`);
    if (webhookResult.ok) {
      config.webhook_set = true;
      await kv.saveBot(botId, { ...config, webhook_set: true });
    }

    return jsonResponse({ success: true, id: botId, webhook_set: config.webhook_set });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

async function handleUpdateBot(request, kv, botId, url) {
  try {
    const existing = await kv.getBot(botId);
    if (!existing) {
      return jsonResponse({ error: 'Bot 不存在' }, 404);
    }

    const body = await request.json();
    const { name, token, site_key, secret_key, allowed_chat_ids } = body;

    if (!name || !token || !site_key || !secret_key) {
      return jsonResponse({ error: '请填写所有必填字段' }, 400);
    }

    // 如果 token 被修改，重新验证
    if (token !== existing.token) {
      const botInfo = await getMe(token);
      if (!botInfo.ok) {
        return jsonResponse({ error: '新的 Bot Token 无效: ' + (botInfo.description || '未知错误') }, 400);
      }
    }

    const config = {
      ...existing,
      name,
      token,
      site_key,
      secret_key,
      allowed_chat_ids: allowed_chat_ids || [],
      updated_at: Date.now(),
    };

    // 如果 token 变了，重新设置 webhook
    if (token !== existing.token) {
      // 删除旧的 webhook
      if (existing.token) {
        await deleteWebhook(existing.token);
      }
      const workerUrl = url.origin;
      const webhookResult = await setWebhook(token, `${workerUrl}/webhook/${botId}`);
      config.webhook_set = webhookResult.ok;
    }

    await kv.saveBot(botId, config);
    return jsonResponse({ success: true, webhook_set: config.webhook_set });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

async function handleDeleteBot(request, kv, botId) {
  try {
    const bot = await kv.getBot(botId);
    if (!bot) {
      return jsonResponse({ error: 'Bot 不存在' }, 404);
    }

    // 删除 webhook
    if (bot.token) {
      await deleteWebhook(bot.token);
    }

    await kv.deleteBot(botId);
    await kv.decrementBotCount();
    return jsonResponse({ success: true });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

async function handleSetWebhook(request, kv, botId, url) {
  try {
    const bot = await kv.getBot(botId);
    if (!bot) {
      return jsonResponse({ error: 'Bot 不存在' }, 404);
    }
    
    const workerUrl = url.origin;
    const result = await setWebhook(bot.token, `${workerUrl}/webhook/${botId}`);
    if (result.ok) {
      bot.webhook_set = true;
      await kv.saveBot(botId, bot);
    }
    return jsonResponse({ success: result.ok, description: result.description });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

// === Helper ===

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function maskBotToken(token) {
  if (!token) return '';
  if (token.length < 10) return '****';
  return token.substring(0, 6) + '****' + token.substring(token.length - 4);
}