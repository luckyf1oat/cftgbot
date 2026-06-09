/**
 * Turnstile 验证页面和处理模块
 */
import { verifyTurnstile } from './turnstile.js';
import * as tg from './telegram.js';

var AMP_PLACEHOLDER = String.fromCharCode(1);

function escHtml(s) {
  if (!s) return '';
  s = String(s);
  s = s.replace(new RegExp('&', 'g'), AMP_PLACEHOLDER);
  s = s.replace(new RegExp('<', 'g'), '&#60;');
  s = s.replace(new RegExp('>', 'g'), '&#62;');
  s = s.replace(new RegExp(AMP_PLACEHOLDER, 'g'), '&#38;');
  return s;
}

function escAttr(s) {
  if (!s) return '';
  s = String(s);
  s = s.replace(new RegExp('&', 'g'), AMP_PLACEHOLDER);
  s = s.replace(new RegExp('"', 'g'), '&#34;');
  s = s.replace(new RegExp('<', 'g'), '&#60;');
  s = s.replace(new RegExp('>', 'g'), '&#62;');
  s = s.replace(new RegExp(AMP_PLACEHOLDER, 'g'), '&#38;');
  return s;
}

/**
 * 生成验证页面 HTML - 简洁美观风格
 */
function getVerifyPage(siteKey, botName, botId, chatId, userId, secret, status, errorMsg, currentPath) {
  var contentHtml = '';
  var extraScript = '';

  if (status === 'success') {
    contentHtml =
      '<div class="result success">' +
      '<div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>' +
      '<h2>验证通过</h2>' +
      '<p>你现在可以在群组中发言了</p>' +
      '<span class="close-hint">页面即将关闭</span>' +
      '</div>' +
      '<script>setTimeout(function(){window.close()},3000)</script>';
  } else if (status === 'expired') {
    contentHtml =
      '<div class="result error">' +
      '<div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="8"/></svg></div>' +
      '<h2>验证已过期</h2>' +
      '<p>' + escHtml(errorMsg || '验证时间已过，你已被移出群组') + '</p>' +
      '</div>';
  } else if (status === 'error') {
    contentHtml =
      '<div class="result error">' +
      '<div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div>' +
      '<h2>验证失败</h2>' +
      '<p>' + escHtml(errorMsg || '请重试或联系管理员') + '</p>' +
      '<a href="' + currentPath + '?' + buildRetryParams(botId, chatId, userId, secret) + '" class="retry-btn">重试</a>' +
      '</div>';
  } else {
    contentHtml =
      '<form id="verify-form" action="' + currentPath + '" method="POST">' +
      '<input type="hidden" name="bot_id" value="' + escAttr(String(botId)) + '">' +
      '<input type="hidden" name="chat_id" value="' + escAttr(String(chatId)) + '">' +
      '<input type="hidden" name="user_id" value="' + escAttr(String(userId)) + '">' +
      '<input type="hidden" name="secret" value="' + escAttr(String(secret)) + '">' +
      '<div class="turnstile-wrap"><div id="turnstile-widget"></div></div>' +
      '<button type="submit" class="verify-btn" id="verify-btn" disabled>验证中...</button>' +
      '</form>';

    extraScript =
      '<script>' +
      'function turnstileReady(){' +
      'turnstile.render("#turnstile-widget",{' +
      'sitekey:"' + siteKey + '",' +
      'callback:function(){' +
      'var btn=document.getElementById("verify-btn");' +
      'btn.disabled=false;' +
      'btn.textContent="提交验证";' +
      '}});}' +
      '</script>' +
      '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=turnstileReady" async defer></script>';
  }

  var html =
    '<!DOCTYPE html>' +
    '<html lang="zh-CN">' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>验证</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">' +
    '<style>' +
    '*{margin:0;padding:0;box-sizing:border-box}' +
    'html,body{height:100%}' +
    'body{' +
    'font-family:"Inter","PingFang SC","Microsoft YaHei",-apple-system,sans-serif;' +
    'background:#f5f7fa;' +
    'display:flex;align-items:center;justify-content:center;' +
    'min-height:100vh;padding:16px' +
    '}' +
    '.card{' +
    'background:#fff;' +
    'border-radius:20px;' +
    'box-shadow:0 4px 24px rgba(0,0,0,0.06),0 1px 4px rgba(0,0,0,0.04);' +
    'padding:48px 40px 40px;' +
    'width:100%;max-width:400px;' +
    'text-align:center' +
    '}' +
    '.card .shield{' +
    'width:56px;height:56px;' +
    'background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);' +
    'border-radius:16px;' +
    'display:flex;align-items:center;justify-content:center;' +
    'margin:0 auto 24px;' +
    'padding:14px;' +
    'box-shadow:0 8px 24px rgba(102,126,234,0.25)' +
    '}' +
    '.card .shield svg{width:100%;height:100%;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
    '.card h1{font-size:20px;font-weight:600;color:#1a1a2e;margin-bottom:6px;letter-spacing:-0.3px}' +
    '.card .sub{font-size:14px;color:#8892a4;margin-bottom:32px;line-height:1.5}' +
    '.card .bot-tag{' +
    'display:inline-block;' +
    'padding:4px 12px;' +
    'background:#f0f2f5;' +
    'border-radius:20px;' +
    'font-size:12px;color:#667eea;' +
    'margin-bottom:28px' +
    '}' +
    '.turnstile-wrap{display:flex;justify-content:center;margin-bottom:4px}' +
    '.turnstile-wrap iframe{margin:0 auto}' +
    '.result{padding:8px 0 4px}' +
    '.result .icon{width:56px;height:56px;margin:0 auto 16px}' +
    '.result .icon svg{width:100%;height:100%}' +
    '.result h2{font-size:18px;font-weight:600;margin-bottom:6px;color:#1a1a2e}' +
    '.result p{font-size:14px;color:#8892a4;line-height:1.5;margin-bottom:8px}' +
    '.result.success h2{color:#16a34a}' +
    '.result.error h2{color:#dc2626}' +
    '.close-hint{font-size:12px;color:#c0c4cc}' +
    '.verify-btn{' +
    'background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);' +
    'color:#fff;border:none;' +
    'padding:12px 24px;' +
    'border-radius:12px;' +
    'font-size:15px;font-weight:500;' +
    'cursor:pointer;' +
    'transition:all 0.2s;' +
    'width:100%;margin-top:8px;' +
    'letter-spacing:0.3px' +
    '}' +
    '.verify-btn:hover:not(:disabled){' +
    'transform:translateY(-1px);' +
    'box-shadow:0 8px 20px rgba(102,126,234,0.35)' +
    '}' +
    '.verify-btn:active:not(:disabled){transform:translateY(0)}' +
    '.verify-btn:disabled{opacity:0.5;cursor:not-allowed;background:linear-gradient(135deg,#a0aec0 0%,#8892a4 100%)}' +
    '.retry-btn{' +
    'display:inline-block;' +
    'margin-top:16px;' +
    'padding:10px 28px;' +
    'background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);' +
    'color:#fff;border-radius:10px;' +
    'text-decoration:none;font-size:14px;font-weight:500;' +
    'transition:all 0.2s' +
    '}' +
    '.retry-btn:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(102,126,234,0.3)}' +
    '@media(max-width:480px){.card{padding:36px 24px 28px}}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="card">' +
    '<div class="shield">' +
    '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
    '</div>' +
    '<h1>人机验证</h1>' +
    '<p class="sub">请完成下方验证以证明你不是机器人</p>' +
    '<div class="bot-tag">' + escHtml(botName || '验证') + '</div>' +
    contentHtml +
    '</div>' +
    extraScript +
    '</body>' +
    '</html>';

  return html;
}

function buildRetryParams(botId, chatId, userId, secret) {
  return 'bot_id=' + botId + '&chat_id=' + chatId + '&user_id=' + userId + '&secret=' + secret;
}

function delay(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

/**
 * 后台任务：编辑消息后 10 秒删除
 */
async function cleanupVerificationMessage(botToken, chatId, messageId) {
  await tg.editMessageText(botToken, chatId, messageId, '你已成功通过验证！');
  await delay(10000);
  await tg.deleteMessage(botToken, chatId, messageId);
}

/**
 * 处理验证请求
 */
export async function handleVerifyRequest(request, kv, url, waitUntil) {
  var botId, chatId, userId, secret, status, errorMsg, turnstileToken;

  if (request.method === 'GET') {
    botId = url.searchParams.get('bot_id');
    chatId = url.searchParams.get('chat_id');
    userId = url.searchParams.get('user_id');
    secret = url.searchParams.get('secret');
    status = url.searchParams.get('status');
    errorMsg = url.searchParams.get('msg');
  } else if (request.method === 'POST') {
    try {
      var fd = await request.formData();
      botId = fd.get('bot_id');
      chatId = fd.get('chat_id');
      userId = fd.get('user_id');
      secret = fd.get('secret');
      turnstileToken = fd.get('cf-turnstile-response');
    } catch (e) {
      return textResponse('Bad request', 400);
    }
  } else {
    return textResponse('Method not allowed', 405);
  }

  if (!botId || !chatId || !userId || !secret) {
    return textResponse('Missing parameters', 400);
  }

  var bot = await kv.getBot(parseInt(botId));
  if (!bot) {
    return textResponse('Bot not found', 404);
  }

  if (request.method === 'GET') {
    if (status === 'success' || status === 'error' || status === 'expired') {
      var page = getVerifyPage(bot.site_key, bot.name, botId, chatId, userId, secret, status, errorMsg, url.pathname);
      return new Response(page, {
        headers: { 'Content-Type': 'text/html;charset=utf-8' },
      });
    }

    var record = await kv.getVerification(parseInt(botId), parseInt(chatId), parseInt(userId));
    
    if (!record) {
      await tg.kickUser(bot.token, parseInt(chatId), parseInt(userId));
      var expiredPage = getVerifyPage(bot.site_key, bot.name, botId, chatId, userId, secret, 'expired', 
        '验证时间已过，你已被移出群组。', url.pathname);
      return new Response(expiredPage, {
        headers: { 'Content-Type': 'text/html;charset=utf-8' },
      });
    }

    var page = getVerifyPage(bot.site_key, bot.name, botId, chatId, userId, secret, null, null, url.pathname);
    return new Response(page, {
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }

  if (!turnstileToken) {
    return redirectResult2(url, botId, chatId, userId, secret, 'error', '未完成人机验证');
  }

  var tsResult = await verifyTurnstile(turnstileToken, bot.secret_key);
  if (!tsResult.success) {
    return redirectResult2(url, botId, chatId, userId, secret, 'error', '人机验证失败');
  }

  var record = await kv.getVerification(parseInt(botId), parseInt(chatId), parseInt(userId));
  if (!record) {
    await tg.kickUser(bot.token, parseInt(chatId), parseInt(userId));
    return redirectResult2(url, botId, chatId, userId, secret, 'expired', '验证已过期');
  }

  if (record.secret !== secret) {
    return redirectResult2(url, botId, chatId, userId, secret, 'error', '验证密钥无效');
  }

  var unrestrictResult = await tg.unrestrictUser(bot.token, parseInt(chatId), parseInt(userId));
  if (!unrestrictResult.ok) {
    return redirectResult2(url, botId, chatId, userId, secret, 'error', '解除限制失败');
  }

  await kv.markVerified(parseInt(botId), parseInt(chatId), parseInt(userId));

  if (record.message_id && waitUntil) {
    waitUntil(cleanupVerificationMessage(bot.token, parseInt(chatId), record.message_id));
  }

  return redirectResult2(url, botId, chatId, userId, secret, 'success');
}

function redirectResult2(url, botId, chatId, userId, secret, status, msg) {
  var p = new URLSearchParams();
  p.set('bot_id', String(botId));
  p.set('chat_id', String(chatId));
  p.set('user_id', String(userId));
  p.set('secret', String(secret));
  p.set('status', status);
  if (msg) p.set('msg', msg);
  return Response.redirect(url.origin + url.pathname + '?' + p.toString(), 302);
}

function textResponse(msg, statusCode) {
  return new Response(msg, { status: statusCode || 200 });
}