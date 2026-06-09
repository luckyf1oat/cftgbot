/**
 * Telegram Bot API 封装
 */

const TG_API_BASE = 'https://api.telegram.org/bot';

async function callTelegramAPI(botToken, method, params) {
  params = params || {};
  var url = TG_API_BASE + botToken + '/' + method;
  try {
    var response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    var result = await response.json();
    return result;
  } catch (err) {
    return { ok: false, description: err.message };
  }
}

/**
 * 禁言用户（限制发言权限）
 */
export async function restrictUser(botToken, chatId, userId) {
  return callTelegramAPI(botToken, 'restrictChatMember', {
    chat_id: chatId,
    user_id: userId,
    permissions: {
      can_send_messages: false,
      can_send_media_messages: false,
      can_send_polls: false,
      can_send_other_messages: false,
      can_add_web_page_previews: false,
      can_change_info: false,
      can_invite_users: false,
      can_pin_messages: false,
    },
  });
}

/**
 * 解除禁言
 */
export async function unrestrictUser(botToken, chatId, userId) {
  return callTelegramAPI(botToken, 'restrictChatMember', {
    chat_id: chatId,
    user_id: userId,
    permissions: {
      can_send_messages: true,
      can_send_media_messages: true,
      can_send_polls: true,
      can_send_other_messages: true,
      can_add_web_page_previews: true,
      can_change_info: true,
      can_invite_users: true,
      can_pin_messages: true,
    },
  });
}

/**
 * 踢出用户（封禁 + 立即解封，实现"踢出"效果）
 */
export async function kickUser(botToken, chatId, userId) {
  // 先封禁
  var banResult = await callTelegramAPI(botToken, 'banChatMember', {
    chat_id: chatId,
    user_id: userId,
  });
  // 再解封（让用户能重新申请加入）
  if (banResult.ok) {
    await callTelegramAPI(botToken, 'unbanChatMember', {
      chat_id: chatId,
      user_id: userId,
      only_if_banned: true,
    });
  }
  return banResult;
}

/**
 * 删除消息
 */
export async function deleteMessage(botToken, chatId, messageId) {
  return callTelegramAPI(botToken, 'deleteMessage', {
    chat_id: chatId,
    message_id: messageId,
  });
}

/**
 * 发送消息
 */
export async function sendMessage(botToken, chatId, text, replyMarkup) {
  replyMarkup = replyMarkup || null;
  var params = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
  };
  if (replyMarkup) {
    params.reply_markup = replyMarkup;
  }
  return callTelegramAPI(botToken, 'sendMessage', params);
}

/**
 * 编辑消息文本
 */
export async function editMessageText(botToken, chatId, messageId, text, replyMarkup) {
  replyMarkup = replyMarkup || null;
  var params = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: 'HTML',
  };
  if (replyMarkup) {
    params.reply_markup = replyMarkup;
  }
  return callTelegramAPI(botToken, 'editMessageText', params);
}

/**
 * 回复 Callback Query
 */
export async function answerCallbackQuery(botToken, callbackQueryId, text, showAlert) {
  text = text || null;
  showAlert = showAlert || false;
  var params = {
    callback_query_id: callbackQueryId,
  };
  if (text) params.text = text;
  params.show_alert = showAlert;
  return callTelegramAPI(botToken, 'answerCallbackQuery', params);
}

/**
 * 获取 Bot 信息
 */
export async function getMe(botToken) {
  return callTelegramAPI(botToken, 'getMe');
}

/**
 * 设置 Webhook
 */
export async function setWebhook(botToken, webhookUrl) {
  return callTelegramAPI(botToken, 'setWebhook', {
    url: webhookUrl,
    allowed_updates: ['message', 'chat_member', 'callback_query'],
  });
}

/**
 * 删除 Webhook
 */
export async function deleteWebhook(botToken) {
  return callTelegramAPI(botToken, 'deleteWebhook');
}