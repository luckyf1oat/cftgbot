/**
 * Telegram Webhook 处理模块
 */
import * as tg from './telegram.js';

function generateSecret() {
  var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var result = '';
  var array = new Uint8Array(16);
  crypto.getRandomValues(array);
  for (var i = 0; i < 16; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

function escapeHtml(text) {
  if (!text) return '';
  var s = String(text);
  var amp = '&' + 'amp;';
  var lt = '&' + 'lt;';
  var gt = '&' + 'gt;';
  s = s.replace(new RegExp('&', 'g'), amp);
  s = s.replace(new RegExp('<', 'g'), lt);
  s = s.replace(new RegExp('>', 'g'), gt);
  return s;
}

/**
 * 主入口
 */
export async function handleWebhookUpdate(update, bot, botId, kv, workerUrl) {
  if (update.chat_member) {
    return handleChatMember(update.chat_member, bot, botId, kv, workerUrl);
  }

  if (update.callback_query) {
    return handleCallbackQuery(update.callback_query, bot, botId, kv, workerUrl);
  }

  return { ok: true };
}

/**
 * 处理新成员加入
 */
async function handleChatMember(chatMember, bot, botId, kv, workerUrl) {
  var chat = chatMember.chat;
  var oldMember = chatMember.old_chat_member;
  var newMember = chatMember.new_chat_member;
  var chatId = chat.id;
  var userId = newMember.user.id;

  if (newMember.status !== 'member') {
    return { ok: true };
  }

  // 用户已经在群组中（非 left/kicked 状态），说明是权限变更事件（禁言/解禁等），忽略
  if (oldMember && oldMember.status !== 'left' && oldMember.status !== 'kicked') {
    return { ok: true };
  }

  var botInfo = await tg.getMe(bot.token);
  if (botInfo.ok && botInfo.result && botInfo.result.id === userId) {
    return { ok: true };
  }

  if (bot.allowed_chat_ids && bot.allowed_chat_ids.length > 0) {
    if (!bot.allowed_chat_ids.includes(String(chatId)) && !bot.allowed_chat_ids.includes(chatId)) {
      return { ok: true };
    }
  }

  var existingRecord = await kv.getVerification(botId, chatId, userId);
  if (existingRecord) {
    // 如果已有未验证的记录（用户被踢出后重新加入），删除旧记录以创建新验证
    if (!existingRecord.verified) {
      await kv.deleteVerification(botId, chatId, userId);
    } else {
      return { ok: true };
    }
  }

  try {
    var secret = generateSecret();

    // 先保存记录，防重复
    await kv.createVerification(botId, chatId, userId, secret, null);

    // 禁言用户
    var restrictResult = await tg.restrictUser(bot.token, chatId, userId);
    if (!restrictResult.ok) {
      await kv.deleteVerification(botId, chatId, userId);
      return { ok: false };
    }

    // 发送验证消息（已去除 emoji）
    var verifyUrl = workerUrl + '/verify?bot_id=' + botId + '&chat_id=' + chatId + '&user_id=' + userId + '&secret=' + secret;
    var userName = escapeHtml(newMember.user.first_name || '新朋友');
    var msgText = '欢迎 <b>' + userName + '</b> 加入群组！\n' +
      '请点击下方链接完成人机验证。\n' +
      '验证有效期 5 分钟，超时将被移出群组。';

    var sentMsg = await tg.sendMessage(bot.token, chatId, msgText, {
      inline_keyboard: [[
        { text: '点击验证', url: verifyUrl }
      ]]
    });

    var messageId = null;
    if (sentMsg.ok && sentMsg.result) {
      messageId = sentMsg.result.message_id;
    }

    await kv.createVerification(botId, chatId, userId, secret, messageId);

    return { ok: true };
  } catch (err) {
    console.error('Error in handleChatMember:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * 处理 callback_query
 */
async function handleCallbackQuery(callbackQuery, bot, botId, kv, workerUrl) {
  var callbackId = callbackQuery.id;
  var message = callbackQuery.message;
  var data = callbackQuery.data || '';
  var from = callbackQuery.from;
  var userId = from.id;
  var chatId = message.chat.id;

  try {
    var parts = data.split(':');
    if (parts[0] !== 'verify' || parts.length < 4) {
      await tg.answerCallbackQuery(bot.token, callbackId, '未知操作', true);
      return { ok: true };
    }

    var targetUserId = parseInt(parts[2]);
    var secret = parts[3];

    if (userId !== targetUserId) {
      await tg.answerCallbackQuery(bot.token, callbackId, '这不是你的验证按钮', true);
      return { ok: true };
    }

    var record = await kv.getVerification(botId, chatId, targetUserId);
    if (!record) {
      await tg.answerCallbackQuery(bot.token, callbackId, '验证已过期！', true);
      await tg.kickUser(bot.token, chatId, targetUserId);
      if (message && message.message_id) {
        await tg.deleteMessage(bot.token, chatId, message.message_id);
      }
      // 清理待处理列表中的记录
      await kv.deleteVerification(botId, chatId, targetUserId);
      return { ok: true };
    }

    if (record.verified) {
      await tg.answerCallbackQuery(bot.token, callbackId, '你已经验证通过了！', false);
      return { ok: true };
    }

    if (record.secret !== secret) {
      await tg.answerCallbackQuery(bot.token, callbackId, '验证密钥无效', true);
      return { ok: true };
    }

    var unrestrictResult = await tg.unrestrictUser(bot.token, chatId, targetUserId);
    if (!unrestrictResult.ok) {
      await tg.answerCallbackQuery(bot.token, callbackId, '解除限制失败', true);
      return { ok: true };
    }

    await kv.markVerified(botId, chatId, targetUserId);

    // 先编辑消息移除按钮，再删除（不需要等待 10 秒，已标记已验证）
    await tg.editMessageText(bot.token, chatId, message.message_id,
      '你已成功通过验证！'
    );
    await tg.deleteMessage(bot.token, chatId, message.message_id);
    await tg.answerCallbackQuery(bot.token, callbackId, '验证通过！');

    return { ok: true };
  } catch (err) {
    console.error('Error in handleCallbackQuery:', err.message);
    await tg.answerCallbackQuery(bot.token, callbackId, '处理失败，请重试', true);
    return { ok: false, error: err.message };
  }
}

export function delayDeleteMessage(botToken, chatId, messageId, delayMs) {
  return new Promise(function(resolve) {
    setTimeout(function() {
      tg.deleteMessage(botToken, chatId, messageId).then(resolve).catch(resolve);
    }, delayMs);
  });
}