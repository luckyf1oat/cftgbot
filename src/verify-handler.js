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
      '<button type="submit" class="verify-btn" id="verify-btn" disabled>等待验证</button>' +
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
    '<meta name="theme-color" content="#f4f6f8">' +
    '<title>安全验证</title>' +
    '<style>' +
    '*{margin:0;padding:0;box-sizing:border-box}' +
    'html,body{height:100%}' +
    'body{' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;' +
    'background:#f4f6f8;color:#17212b;' +
    'display:flex;align-items:center;justify-content:center;' +
    'min-height:100vh;padding:24px 16px;' +
    '-webkit-font-smoothing:antialiased' +
    '}' +
    '.card{' +
    'background:#fff;' +
    'border:1px solid #e2e7ec;border-radius:8px;' +
    'box-shadow:0 8px 28px rgba(23,33,43,.07);' +
    'padding:36px 32px 30px;' +
    'width:100%;max-width:390px;' +
    'text-align:center' +
    '}' +
    '.card .shield{' +
    'width:48px;height:48px;' +
    'background:#eaf6fc;border:1px solid #d4ecf8;' +
    'border-radius:8px;' +
    'display:flex;align-items:center;justify-content:center;' +
    'margin:0 auto 18px;padding:11px' +
    '}' +
    '.card .shield svg{width:100%;height:100%;fill:none;stroke:#168acd;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}' +
    '.card h1{font-size:21px;font-weight:650;color:#17212b;margin-bottom:8px;letter-spacing:0}' +
    '.card .sub{font-size:14px;color:#697782;margin-bottom:16px;line-height:1.6}' +
    '.card .bot-tag{' +
    'display:inline-block;' +
    'max-width:100%;padding:5px 10px;' +
    'background:#f4f6f8;border:1px solid #e5e9ed;' +
    'border-radius:6px;font-size:12px;color:#53616d;' +
    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
    'margin-bottom:24px' +
    '}' +
    '#verify-form{border-top:1px solid #edf0f2;padding-top:24px}' +
    '.turnstile-wrap{display:flex;justify-content:center;min-height:65px;margin-bottom:12px;overflow:hidden}' +
    '.turnstile-wrap iframe{margin:0 auto}' +
    '.result{border-top:1px solid #edf0f2;padding:24px 0 4px}' +
    '.result .icon{width:48px;height:48px;margin:0 auto 14px}' +
    '.result .icon svg{width:100%;height:100%}' +
    '.result h2{font-size:18px;font-weight:650;margin-bottom:7px;color:#17212b}' +
    '.result p{font-size:14px;color:#697782;line-height:1.6;margin:0 auto 8px;max-width:280px}' +
    '.result.success h2{color:#168447}' +
    '.result.error h2{color:#c93636}' +
    '.close-hint{font-size:12px;color:#9aa5ad}' +
    '.verify-btn{' +
    'background:#168acd;color:#fff;border:1px solid #168acd;' +
    'height:44px;padding:0 20px;border-radius:7px;' +
    'font-size:14px;font-weight:600;cursor:pointer;' +
    'transition:background .15s,border-color .15s,box-shadow .15s;' +
    'width:100%;letter-spacing:0' +
    '}' +
    '.verify-btn:hover:not(:disabled){background:#087bbb;border-color:#087bbb;box-shadow:0 3px 10px rgba(22,138,205,.18)}' +
    '.verify-btn:active:not(:disabled){background:#076fa8}' +
    '.verify-btn:focus-visible,.retry-btn:focus-visible{outline:3px solid rgba(22,138,205,.22);outline-offset:2px}' +
    '.verify-btn:disabled{color:#8c98a1;background:#eef1f3;border-color:#e1e6e9;cursor:not-allowed}' +
    '.retry-btn{' +
    'display:inline-flex;align-items:center;justify-content:center;' +
    'height:40px;margin-top:14px;padding:0 24px;' +
    'background:#168acd;color:#fff;border-radius:7px;' +
    'text-decoration:none;font-size:14px;font-weight:600;' +
    'transition:background .15s,box-shadow .15s' +
    '}' +
    '.retry-btn:hover{background:#087bbb;box-shadow:0 3px 10px rgba(22,138,205,.18)}' +
    '@media(max-width:380px){' +
    'body{padding:12px}.card{padding:28px 16px 24px}' +
    '.turnstile-wrap{width:100%;justify-content:flex-start}' +
    '#turnstile-widget{transform:scale(.9);transform-origin:top left}' +
    '}' +
    '@media(prefers-reduced-motion:reduce){*{transition:none!important}}' +
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
      // 同时清理待处理列表
      await kv.deleteVerification(parseInt(botId), parseInt(chatId), parseInt(userId));
      var expiredPage = getVerifyPage(bot.site_key, bot.name, botId, chatId, userId, secret, 'expired', 
        '验证时间已过，你已被移出群组。', url.pathname);
      return new Response(expiredPage, {
        headers: { 'Content-Type': 'text/html;charset=utf-8' },
      });
    }

    if (record.secret !== secret) {
      var invalidPage = getVerifyPage(bot.site_key, bot.name, botId, chatId, userId, secret, 'error',
        '验证链接无效。', url.pathname);
      return new Response(invalidPage, {
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
    await kv.deleteVerification(parseInt(botId), parseInt(chatId), parseInt(userId));
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

  // 立即编辑消息并删除
  if (record.message_id) {
    try {
      await tg.editMessageText(bot.token, parseInt(chatId), record.message_id, '你已成功通过验证！');
      await tg.deleteMessage(bot.token, parseInt(chatId), record.message_id);
    } catch (e) {
      // 忽略删除消息失败
    }
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