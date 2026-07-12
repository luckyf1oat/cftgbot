var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-jpqZ9Z/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// .wrangler/tmp/bundle-jpqZ9Z/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// src/kv.js
var KVStore = class {
  constructor(env) {
    this.kv = env.KV;
  }
  // === Bot 管理 ===
  async getBotCount() {
    const countStr = await this.kv.get("bot:count", "text");
    return parseInt(countStr || "0");
  }
  async incrementBotCount() {
    const countStr = await this.kv.get("bot:count", "text");
    const count = parseInt(countStr || "0") + 1;
    await this.kv.put("bot:count", String(count));
    return count;
  }
  async getNextBotId() {
    return this.incrementBotCount();
  }
  async getBotIds() {
    const indexStr = await this.kv.get("bot:index", "text");
    if (indexStr) {
      try {
        const ids2 = JSON.parse(indexStr);
        if (Array.isArray(ids2))
          return ids2;
      } catch (e) {
      }
    }
    const count = await this.getBotCount();
    const ids = [];
    for (let i = 1; i <= count; i++) {
      if (await this.kv.get("bot:" + i, "text"))
        ids.push(i);
    }
    await this.kv.put("bot:index", JSON.stringify(ids));
    return ids;
  }
  async setBotIds(ids) {
    await this.kv.put("bot:index", JSON.stringify(ids));
  }
  async getAllBots() {
    const ids = await this.getBotIds();
    var bots = [];
    for (var i = 0; i < ids.length; i++) {
      const botId = ids[i];
      const data = await this.kv.get("bot:" + botId, "text");
      if (data) {
        try {
          const bot = JSON.parse(data);
          bot.id = botId;
          bots.push(bot);
        } catch (e) {
        }
      }
    }
    return bots;
  }
  async getBot(botId) {
    const data = await this.kv.get("bot:" + botId, "text");
    if (!data)
      return null;
    return JSON.parse(data);
  }
  async saveBot(botId, botConfig) {
    const { id, ...config } = botConfig;
    await this.kv.put("bot:" + botId, JSON.stringify(config));
    const ids = await this.getBotIds();
    if (!ids.includes(botId)) {
      ids.push(botId);
      ids.sort(function(a, b) {
        return a - b;
      });
      await this.setBotIds(ids);
    }
  }
  async deleteBot(botId) {
    await this.kv.delete("bot:" + botId);
    const ids = await this.getBotIds();
    await this.setBotIds(ids.filter(function(id) {
      return id !== botId;
    }));
  }
  async decrementBotCount() {
  }
  // === 管理员认证 ===
  async hasAdminPassword() {
    return await this.getAdminPassword() !== null;
  }
  async getAdminPassword() {
    return this.kv.get("admin:password", "text");
  }
  async setAdminPassword(passwordHash) {
    await this.kv.put("admin:password", passwordHash);
  }
  async setAdminToken(token) {
    await this.kv.put("admin:token", token, { expirationTtl: 7 * 24 * 60 * 60 });
  }
  async validateToken(token) {
    if (!token)
      return false;
    const storedToken = await this.kv.get("admin:token", "text");
    return storedToken === token;
  }
  // === 验证状态管理 ===
  /**
   * 创建验证记录
   * TTL 设为 300s (5分钟)，过期后 KV 自动删除
   */
  async createVerification(botId, chatId, userId, secret, messageId) {
    var key = "verify:" + botId + ":" + chatId + ":" + userId;
    var data = JSON.stringify({
      secret,
      verified: false,
      time: Date.now(),
      message_id: messageId,
      chat_id: chatId,
      user_id: userId
    });
    await this.kv.put(key, data, { expirationTtl: 300 });
    await this.addPendingVerification(botId, chatId, userId, messageId);
  }
  async updateVerificationMessage(botId, chatId, userId, messageId) {
    var key = "verify:" + botId + ":" + chatId + ":" + userId;
    var data = await this.kv.get(key, "text");
    if (!data)
      return false;
    var record = JSON.parse(data);
    record.message_id = messageId;
    var remainingSeconds = Math.max(60, Math.ceil((record.time + 3e5 - Date.now()) / 1e3));
    await this.kv.put(key, JSON.stringify(record), { expirationTtl: remainingSeconds });
    await this.addPendingVerification(botId, chatId, userId, messageId, record.time);
    return true;
  }
  /**
   * 获取验证记录
   */
  async getVerification(botId, chatId, userId) {
    var key = "verify:" + botId + ":" + chatId + ":" + userId;
    var data = await this.kv.get(key, "text");
    if (!data)
      return null;
    return JSON.parse(data);
  }
  /**
   * 标记为已验证
   */
  async markVerified(botId, chatId, userId) {
    var key = "verify:" + botId + ":" + chatId + ":" + userId;
    var data = await this.kv.get(key, "text");
    if (data) {
      var record = JSON.parse(data);
      record.verified = true;
      await this.kv.put(key, JSON.stringify(record), { expirationTtl: 60 });
    }
    await this.removePendingVerification(botId, chatId, userId);
  }
  /**
   * 删除验证记录
   */
  async deleteVerification(botId, chatId, userId) {
    var key = "verify:" + botId + ":" + chatId + ":" + userId;
    await this.kv.delete(key);
    await this.removePendingVerification(botId, chatId, userId);
  }
  // === 待处理验证列表（用于定时清理） ===
  /**
   * 添加待处理验证记录
   */
  async addPendingVerification(botId, chatId, userId, messageId, timestamp) {
    var listKey = "verify:pending";
    var listStr = await this.kv.get(listKey, "text");
    var list = [];
    if (listStr) {
      try {
        list = JSON.parse(listStr);
      } catch (e) {
      }
    }
    list = list.filter(function(item) {
      return !(item.botId === botId && item.chatId === chatId && item.userId === userId);
    });
    list.push({
      botId,
      chatId,
      userId,
      messageId,
      timestamp: timestamp || Date.now()
    });
    await this.kv.put(listKey, JSON.stringify(list));
  }
  /**
   * 从待处理列表中移除
   */
  async removePendingVerification(botId, chatId, userId) {
    var listKey = "verify:pending";
    var listStr = await this.kv.get(listKey, "text");
    if (!listStr)
      return;
    var list = [];
    try {
      list = JSON.parse(listStr);
    } catch (e) {
      return;
    }
    var newList = list.filter(function(item) {
      return !(item.botId === botId && item.chatId === chatId && item.userId === userId);
    });
    if (newList.length === list.length)
      return;
    await this.kv.put(listKey, JSON.stringify(newList));
  }
  /**
   * 获取所有待处理验证
   */
  async getAllPendingVerifications() {
    var listKey = "verify:pending";
    var listStr = await this.kv.get(listKey, "text");
    if (!listStr)
      return [];
    try {
      return JSON.parse(listStr);
    } catch (e) {
      return [];
    }
  }
  /**
   * 从待处理列表中批量移除已验证/已处理的记录
   */
  async removePendingVerifications(ids) {
    if (!ids || ids.length === 0)
      return;
    var listKey = "verify:pending";
    var listStr = await this.kv.get(listKey, "text");
    if (!listStr)
      return;
    var list = [];
    try {
      list = JSON.parse(listStr);
    } catch (e) {
      return;
    }
    var idSet = {};
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      idSet[id.botId + ":" + id.chatId + ":" + id.userId] = true;
    }
    var newList = list.filter(function(item) {
      return !idSet[item.botId + ":" + item.chatId + ":" + item.userId];
    });
    await this.kv.put(listKey, JSON.stringify(newList));
  }
};
__name(KVStore, "KVStore");
var kv_default = KVStore;

// src/telegram.js
var TG_API_BASE = "https://api.telegram.org/bot";
async function callTelegramAPI(botToken, method, params) {
  params = params || {};
  var url = TG_API_BASE + botToken + "/" + method;
  try {
    var response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params)
    });
    var result = await response.json();
    return result;
  } catch (err) {
    return { ok: false, description: err.message };
  }
}
__name(callTelegramAPI, "callTelegramAPI");
async function restrictUser(botToken, chatId, userId) {
  return callTelegramAPI(botToken, "restrictChatMember", {
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
      can_pin_messages: false
    }
  });
}
__name(restrictUser, "restrictUser");
async function unrestrictUser(botToken, chatId, userId) {
  var chatResult = await callTelegramAPI(botToken, "getChat", { chat_id: chatId });
  var defaultPermissions = chatResult.ok && chatResult.result && chatResult.result.permissions;
  return callTelegramAPI(botToken, "restrictChatMember", {
    chat_id: chatId,
    user_id: userId,
    permissions: defaultPermissions || {
      can_send_messages: true,
      can_send_media_messages: true,
      can_send_polls: true,
      can_send_other_messages: true,
      can_add_web_page_previews: true,
      can_change_info: false,
      can_invite_users: false,
      can_pin_messages: false
    }
  });
}
__name(unrestrictUser, "unrestrictUser");
async function kickUser(botToken, chatId, userId) {
  var banResult = await callTelegramAPI(botToken, "banChatMember", {
    chat_id: chatId,
    user_id: userId
  });
  if (banResult.ok) {
    var unbanResult = await callTelegramAPI(botToken, "unbanChatMember", {
      chat_id: chatId,
      user_id: userId,
      only_if_banned: true
    });
    if (!unbanResult.ok)
      return unbanResult;
  }
  return banResult;
}
__name(kickUser, "kickUser");
async function deleteMessage(botToken, chatId, messageId) {
  return callTelegramAPI(botToken, "deleteMessage", {
    chat_id: chatId,
    message_id: messageId
  });
}
__name(deleteMessage, "deleteMessage");
async function sendMessage(botToken, chatId, text, replyMarkup) {
  replyMarkup = replyMarkup || null;
  var params = {
    chat_id: chatId,
    text,
    parse_mode: "HTML"
  };
  if (replyMarkup) {
    params.reply_markup = replyMarkup;
  }
  return callTelegramAPI(botToken, "sendMessage", params);
}
__name(sendMessage, "sendMessage");
async function editMessageText(botToken, chatId, messageId, text, replyMarkup) {
  replyMarkup = replyMarkup || null;
  var params = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML"
  };
  if (replyMarkup) {
    params.reply_markup = replyMarkup;
  }
  return callTelegramAPI(botToken, "editMessageText", params);
}
__name(editMessageText, "editMessageText");
async function answerCallbackQuery(botToken, callbackQueryId, text, showAlert) {
  text = text || null;
  showAlert = showAlert || false;
  var params = {
    callback_query_id: callbackQueryId
  };
  if (text)
    params.text = text;
  params.show_alert = showAlert;
  return callTelegramAPI(botToken, "answerCallbackQuery", params);
}
__name(answerCallbackQuery, "answerCallbackQuery");
async function getMe(botToken) {
  return callTelegramAPI(botToken, "getMe");
}
__name(getMe, "getMe");
async function setWebhook(botToken, webhookUrl) {
  return callTelegramAPI(botToken, "setWebhook", {
    url: webhookUrl,
    allowed_updates: ["message", "chat_member", "callback_query"]
  });
}
__name(setWebhook, "setWebhook");
async function deleteWebhook(botToken) {
  return callTelegramAPI(botToken, "deleteWebhook");
}
__name(deleteWebhook, "deleteWebhook");

// src/webhook.js
function generateSecret() {
  var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  var result = "";
  var array = new Uint8Array(16);
  crypto.getRandomValues(array);
  for (var i = 0; i < 16; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}
__name(generateSecret, "generateSecret");
function escapeHtml(text) {
  if (!text)
    return "";
  var s = String(text);
  var amp = "&amp;";
  var lt = "&lt;";
  var gt = "&gt;";
  s = s.replace(new RegExp("&", "g"), amp);
  s = s.replace(new RegExp("<", "g"), lt);
  s = s.replace(new RegExp(">", "g"), gt);
  return s;
}
__name(escapeHtml, "escapeHtml");
function isInChat(member) {
  if (!member)
    return false;
  if (member.status === "member" || member.status === "administrator" || member.status === "creator") {
    return true;
  }
  return member.status === "restricted" && member.is_member === true;
}
__name(isInChat, "isInChat");
async function handleWebhookUpdate(update, bot, botId, kv, workerUrl) {
  if (update.chat_member) {
    return handleChatMember(update.chat_member, bot, botId, kv, workerUrl);
  }
  if (update.callback_query) {
    return handleCallbackQuery(update.callback_query, bot, botId, kv, workerUrl);
  }
  return { ok: true };
}
__name(handleWebhookUpdate, "handleWebhookUpdate");
async function handleChatMember(chatMember, bot, botId, kv, workerUrl) {
  var chat = chatMember.chat;
  var oldMember = chatMember.old_chat_member;
  var newMember = chatMember.new_chat_member;
  var chatId = chat.id;
  var userId = newMember.user.id;
  if (!isInChat(newMember) || isInChat(oldMember)) {
    return { ok: true };
  }
  if (newMember.user.is_bot) {
    return { ok: true };
  }
  if (bot.allowed_chat_ids && bot.allowed_chat_ids.length > 0) {
    if (!bot.allowed_chat_ids.includes(String(chatId)) && !bot.allowed_chat_ids.includes(chatId)) {
      return { ok: true };
    }
  }
  var existingRecord = await kv.getVerification(botId, chatId, userId);
  if (existingRecord) {
    return { ok: true };
  }
  try {
    var secret = generateSecret();
    await kv.createVerification(botId, chatId, userId, secret, null);
    var restrictResult = await restrictUser(bot.token, chatId, userId);
    if (!restrictResult.ok) {
      await kv.deleteVerification(botId, chatId, userId);
      return { ok: false };
    }
    var verifyUrl = workerUrl + "/verify?bot_id=" + botId + "&chat_id=" + chatId + "&user_id=" + userId + "&secret=" + secret;
    var userName = escapeHtml(newMember.user.first_name || "\u65B0\u670B\u53CB");
    var msgText = "\u6B22\u8FCE <b>" + userName + "</b> \u52A0\u5165\u7FA4\u7EC4\uFF01\n\u8BF7\u70B9\u51FB\u4E0B\u65B9\u94FE\u63A5\u5B8C\u6210\u4EBA\u673A\u9A8C\u8BC1\u3002\n\u9A8C\u8BC1\u6709\u6548\u671F 5 \u5206\u949F\uFF0C\u8D85\u65F6\u5C06\u88AB\u79FB\u51FA\u7FA4\u7EC4\u3002";
    var sentMsg = await sendMessage(bot.token, chatId, msgText, {
      inline_keyboard: [[
        { text: "\u70B9\u51FB\u9A8C\u8BC1", url: verifyUrl }
      ]]
    });
    if (!sentMsg.ok || !sentMsg.result) {
      await unrestrictUser(bot.token, chatId, userId);
      await kv.deleteVerification(botId, chatId, userId);
      return { ok: false, error: sentMsg.description || "Failed to send verification message" };
    }
    await kv.updateVerificationMessage(botId, chatId, userId, sentMsg.result.message_id);
    return { ok: true };
  } catch (err) {
    console.error("Error in handleChatMember:", err.message);
    await unrestrictUser(bot.token, chatId, userId);
    await kv.deleteVerification(botId, chatId, userId);
    return { ok: false, error: err.message };
  }
}
__name(handleChatMember, "handleChatMember");
async function handleCallbackQuery(callbackQuery, bot, botId, kv, workerUrl) {
  var callbackId = callbackQuery.id;
  var message = callbackQuery.message;
  var data = callbackQuery.data || "";
  var from = callbackQuery.from;
  var userId = from.id;
  var chatId = message.chat.id;
  try {
    var parts = data.split(":");
    if (parts[0] !== "verify" || parts.length < 4) {
      await answerCallbackQuery(bot.token, callbackId, "\u672A\u77E5\u64CD\u4F5C", true);
      return { ok: true };
    }
    var targetUserId = parseInt(parts[2]);
    var secret = parts[3];
    if (userId !== targetUserId) {
      await answerCallbackQuery(bot.token, callbackId, "\u8FD9\u4E0D\u662F\u4F60\u7684\u9A8C\u8BC1\u6309\u94AE", true);
      return { ok: true };
    }
    var record = await kv.getVerification(botId, chatId, targetUserId);
    if (!record) {
      await answerCallbackQuery(bot.token, callbackId, "\u9A8C\u8BC1\u5DF2\u8FC7\u671F\uFF01", true);
      if (message && message.message_id) {
        await deleteMessage(bot.token, chatId, message.message_id);
      }
      await kv.deleteVerification(botId, chatId, targetUserId);
      return { ok: true };
    }
    if (record.verified) {
      await answerCallbackQuery(bot.token, callbackId, "\u4F60\u5DF2\u7ECF\u9A8C\u8BC1\u901A\u8FC7\u4E86\uFF01", false);
      return { ok: true };
    }
    if (record.secret !== secret) {
      await answerCallbackQuery(bot.token, callbackId, "\u9A8C\u8BC1\u5BC6\u94A5\u65E0\u6548", true);
      return { ok: true };
    }
    var unrestrictResult = await unrestrictUser(bot.token, chatId, targetUserId);
    if (!unrestrictResult.ok) {
      await answerCallbackQuery(bot.token, callbackId, "\u89E3\u9664\u9650\u5236\u5931\u8D25", true);
      return { ok: true };
    }
    await kv.markVerified(botId, chatId, targetUserId);
    await editMessageText(
      bot.token,
      chatId,
      message.message_id,
      "\u4F60\u5DF2\u6210\u529F\u901A\u8FC7\u9A8C\u8BC1\uFF01"
    );
    await deleteMessage(bot.token, chatId, message.message_id);
    await answerCallbackQuery(bot.token, callbackId, "\u9A8C\u8BC1\u901A\u8FC7\uFF01");
    return { ok: true };
  } catch (err) {
    console.error("Error in handleCallbackQuery:", err.message);
    await answerCallbackQuery(bot.token, callbackId, "\u5904\u7406\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5", true);
    return { ok: false, error: err.message };
  }
}
__name(handleCallbackQuery, "handleCallbackQuery");

// src/turnstile.js
var TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
async function verifyTurnstile(token, secret) {
  if (!token || !secret) {
    return { success: false, error: "Missing token or secret" };
  }
  try {
    const formData = new FormData();
    formData.append("secret", secret);
    formData.append("response", token);
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body: formData
    });
    const result = await response.json();
    return {
      success: result.success === true,
      error: result["error-codes"]?.[0] || null
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
__name(verifyTurnstile, "verifyTurnstile");

// src/verify-handler.js
var AMP_PLACEHOLDER = String.fromCharCode(1);
function escHtml(s) {
  if (!s)
    return "";
  s = String(s);
  s = s.replace(new RegExp("&", "g"), AMP_PLACEHOLDER);
  s = s.replace(new RegExp("<", "g"), "&#60;");
  s = s.replace(new RegExp(">", "g"), "&#62;");
  s = s.replace(new RegExp(AMP_PLACEHOLDER, "g"), "&#38;");
  return s;
}
__name(escHtml, "escHtml");
function escAttr(s) {
  if (!s)
    return "";
  s = String(s);
  s = s.replace(new RegExp("&", "g"), AMP_PLACEHOLDER);
  s = s.replace(new RegExp('"', "g"), "&#34;");
  s = s.replace(new RegExp("<", "g"), "&#60;");
  s = s.replace(new RegExp(">", "g"), "&#62;");
  s = s.replace(new RegExp(AMP_PLACEHOLDER, "g"), "&#38;");
  return s;
}
__name(escAttr, "escAttr");
function getVerifyPage(siteKey, botName, botId, chatId, userId, secret, status, errorMsg, currentPath) {
  var contentHtml = "";
  var extraScript = "";
  if (status === "success") {
    contentHtml = '<div class="result success"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><h2>\u9A8C\u8BC1\u901A\u8FC7</h2><p>\u4F60\u73B0\u5728\u53EF\u4EE5\u5728\u7FA4\u7EC4\u4E2D\u53D1\u8A00\u4E86</p><span class="close-hint">\u9875\u9762\u5373\u5C06\u5173\u95ED</span></div><script>setTimeout(function(){window.close()},3000)<\/script>';
  } else if (status === "expired") {
    contentHtml = '<div class="result error"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="8"/></svg></div><h2>\u9A8C\u8BC1\u5DF2\u8FC7\u671F</h2><p>' + escHtml(errorMsg || "\u9A8C\u8BC1\u65F6\u95F4\u5DF2\u8FC7\uFF0C\u4F60\u5DF2\u88AB\u79FB\u51FA\u7FA4\u7EC4") + "</p></div>";
  } else if (status === "error") {
    contentHtml = '<div class="result error"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div><h2>\u9A8C\u8BC1\u5931\u8D25</h2><p>' + escHtml(errorMsg || "\u8BF7\u91CD\u8BD5\u6216\u8054\u7CFB\u7BA1\u7406\u5458") + '</p><a href="' + currentPath + "?" + buildRetryParams(botId, chatId, userId, secret) + '" class="retry-btn">\u91CD\u8BD5</a></div>';
  } else {
    contentHtml = '<form id="verify-form" action="' + currentPath + '" method="POST"><input type="hidden" name="bot_id" value="' + escAttr(String(botId)) + '"><input type="hidden" name="chat_id" value="' + escAttr(String(chatId)) + '"><input type="hidden" name="user_id" value="' + escAttr(String(userId)) + '"><input type="hidden" name="secret" value="' + escAttr(String(secret)) + '"><div class="turnstile-wrap"><div id="turnstile-widget"></div></div><button type="submit" class="verify-btn" id="verify-btn" disabled>\u9A8C\u8BC1\u4E2D...</button></form>';
    extraScript = '<script>function turnstileReady(){turnstile.render("#turnstile-widget",{sitekey:"' + siteKey + '",callback:function(){var btn=document.getElementById("verify-btn");btn.disabled=false;btn.textContent="\u63D0\u4EA4\u9A8C\u8BC1";}});}<\/script><script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=turnstileReady" async defer><\/script>';
  }
  var html = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>\u9A8C\u8BC1</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%}body{font-family:"Inter","PingFang SC","Microsoft YaHei",-apple-system,sans-serif;background:#f5f7fa;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}.card{background:#fff;border-radius:20px;box-shadow:0 4px 24px rgba(0,0,0,0.06),0 1px 4px rgba(0,0,0,0.04);padding:48px 40px 40px;width:100%;max-width:400px;text-align:center}.card .shield{width:56px;height:56px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;padding:14px;box-shadow:0 8px 24px rgba(102,126,234,0.25)}.card .shield svg{width:100%;height:100%;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.card h1{font-size:20px;font-weight:600;color:#1a1a2e;margin-bottom:6px;letter-spacing:-0.3px}.card .sub{font-size:14px;color:#8892a4;margin-bottom:32px;line-height:1.5}.card .bot-tag{display:inline-block;padding:4px 12px;background:#f0f2f5;border-radius:20px;font-size:12px;color:#667eea;margin-bottom:28px}.turnstile-wrap{display:flex;justify-content:center;margin-bottom:4px}.turnstile-wrap iframe{margin:0 auto}.result{padding:8px 0 4px}.result .icon{width:56px;height:56px;margin:0 auto 16px}.result .icon svg{width:100%;height:100%}.result h2{font-size:18px;font-weight:600;margin-bottom:6px;color:#1a1a2e}.result p{font-size:14px;color:#8892a4;line-height:1.5;margin-bottom:8px}.result.success h2{color:#16a34a}.result.error h2{color:#dc2626}.close-hint{font-size:12px;color:#c0c4cc}.verify-btn{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;border:none;padding:12px 24px;border-radius:12px;font-size:15px;font-weight:500;cursor:pointer;transition:all 0.2s;width:100%;margin-top:8px;letter-spacing:0.3px}.verify-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 8px 20px rgba(102,126,234,0.35)}.verify-btn:active:not(:disabled){transform:translateY(0)}.verify-btn:disabled{opacity:0.5;cursor:not-allowed;background:linear-gradient(135deg,#a0aec0 0%,#8892a4 100%)}.retry-btn{display:inline-block;margin-top:16px;padding:10px 28px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;border-radius:10px;text-decoration:none;font-size:14px;font-weight:500;transition:all 0.2s}.retry-btn:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(102,126,234,0.3)}@media(max-width:480px){.card{padding:36px 24px 28px}}</style></head><body><div class="card"><div class="shield"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div><h1>\u4EBA\u673A\u9A8C\u8BC1</h1><p class="sub">\u8BF7\u5B8C\u6210\u4E0B\u65B9\u9A8C\u8BC1\u4EE5\u8BC1\u660E\u4F60\u4E0D\u662F\u673A\u5668\u4EBA</p><div class="bot-tag">' + escHtml(botName || "\u9A8C\u8BC1") + "</div>" + contentHtml + "</div>" + extraScript + "</body></html>";
  return html;
}
__name(getVerifyPage, "getVerifyPage");
function buildRetryParams(botId, chatId, userId, secret) {
  return "bot_id=" + botId + "&chat_id=" + chatId + "&user_id=" + userId + "&secret=" + secret;
}
__name(buildRetryParams, "buildRetryParams");
async function handleVerifyRequest(request, kv, url, waitUntil) {
  var botId, chatId, userId, secret, status, errorMsg, turnstileToken;
  if (request.method === "GET") {
    botId = url.searchParams.get("bot_id");
    chatId = url.searchParams.get("chat_id");
    userId = url.searchParams.get("user_id");
    secret = url.searchParams.get("secret");
    status = url.searchParams.get("status");
    errorMsg = url.searchParams.get("msg");
  } else if (request.method === "POST") {
    try {
      var fd = await request.formData();
      botId = fd.get("bot_id");
      chatId = fd.get("chat_id");
      userId = fd.get("user_id");
      secret = fd.get("secret");
      turnstileToken = fd.get("cf-turnstile-response");
    } catch (e) {
      return textResponse("Bad request", 400);
    }
  } else {
    return textResponse("Method not allowed", 405);
  }
  if (!botId || !chatId || !userId || !secret) {
    return textResponse("Missing parameters", 400);
  }
  var bot = await kv.getBot(parseInt(botId));
  if (!bot) {
    return textResponse("Bot not found", 404);
  }
  if (request.method === "GET") {
    if (status === "success" || status === "error" || status === "expired") {
      var page = getVerifyPage(bot.site_key, bot.name, botId, chatId, userId, secret, status, errorMsg, url.pathname);
      return new Response(page, {
        headers: { "Content-Type": "text/html;charset=utf-8" }
      });
    }
    var record = await kv.getVerification(parseInt(botId), parseInt(chatId), parseInt(userId));
    if (!record) {
      await kv.deleteVerification(parseInt(botId), parseInt(chatId), parseInt(userId));
      var expiredPage = getVerifyPage(
        bot.site_key,
        bot.name,
        botId,
        chatId,
        userId,
        secret,
        "expired",
        "\u9A8C\u8BC1\u65F6\u95F4\u5DF2\u8FC7\uFF0C\u4F60\u5DF2\u88AB\u79FB\u51FA\u7FA4\u7EC4\u3002",
        url.pathname
      );
      return new Response(expiredPage, {
        headers: { "Content-Type": "text/html;charset=utf-8" }
      });
    }
    if (record.secret !== secret) {
      var invalidPage = getVerifyPage(
        bot.site_key,
        bot.name,
        botId,
        chatId,
        userId,
        secret,
        "error",
        "\u9A8C\u8BC1\u94FE\u63A5\u65E0\u6548\u3002",
        url.pathname
      );
      return new Response(invalidPage, {
        headers: { "Content-Type": "text/html;charset=utf-8" }
      });
    }
    var page = getVerifyPage(bot.site_key, bot.name, botId, chatId, userId, secret, null, null, url.pathname);
    return new Response(page, {
      headers: { "Content-Type": "text/html;charset=utf-8" }
    });
  }
  if (!turnstileToken) {
    return redirectResult2(url, botId, chatId, userId, secret, "error", "\u672A\u5B8C\u6210\u4EBA\u673A\u9A8C\u8BC1");
  }
  var tsResult = await verifyTurnstile(turnstileToken, bot.secret_key);
  if (!tsResult.success) {
    return redirectResult2(url, botId, chatId, userId, secret, "error", "\u4EBA\u673A\u9A8C\u8BC1\u5931\u8D25");
  }
  var record = await kv.getVerification(parseInt(botId), parseInt(chatId), parseInt(userId));
  if (!record) {
    await kv.deleteVerification(parseInt(botId), parseInt(chatId), parseInt(userId));
    return redirectResult2(url, botId, chatId, userId, secret, "expired", "\u9A8C\u8BC1\u5DF2\u8FC7\u671F");
  }
  if (record.secret !== secret) {
    return redirectResult2(url, botId, chatId, userId, secret, "error", "\u9A8C\u8BC1\u5BC6\u94A5\u65E0\u6548");
  }
  var unrestrictResult = await unrestrictUser(bot.token, parseInt(chatId), parseInt(userId));
  if (!unrestrictResult.ok) {
    return redirectResult2(url, botId, chatId, userId, secret, "error", "\u89E3\u9664\u9650\u5236\u5931\u8D25");
  }
  await kv.markVerified(parseInt(botId), parseInt(chatId), parseInt(userId));
  if (record.message_id) {
    try {
      await editMessageText(bot.token, parseInt(chatId), record.message_id, "\u4F60\u5DF2\u6210\u529F\u901A\u8FC7\u9A8C\u8BC1\uFF01");
      await deleteMessage(bot.token, parseInt(chatId), record.message_id);
    } catch (e) {
    }
  }
  return redirectResult2(url, botId, chatId, userId, secret, "success");
}
__name(handleVerifyRequest, "handleVerifyRequest");
function redirectResult2(url, botId, chatId, userId, secret, status, msg) {
  var p = new URLSearchParams();
  p.set("bot_id", String(botId));
  p.set("chat_id", String(chatId));
  p.set("user_id", String(userId));
  p.set("secret", String(secret));
  p.set("status", status);
  if (msg)
    p.set("msg", msg);
  return Response.redirect(url.origin + url.pathname + "?" + p.toString(), 302);
}
__name(redirectResult2, "redirectResult2");
function textResponse(msg, statusCode) {
  return new Response(msg, { status: statusCode || 200 });
}
__name(textResponse, "textResponse");

// src/auth.js
function generateToken() {
  const chars = "abcdef0123456789";
  let result = "";
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  for (let i = 0; i < 32; i++) {
    result += chars[array[i] % 16];
  }
  return result;
}
__name(generateToken, "generateToken");
async function hashPassword(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hashPassword, "hashPassword");
function extractBearerToken(request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}
__name(extractBearerToken, "extractBearerToken");
function extractTokenFromCookie(request) {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader)
    return null;
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    const [name, value] = cookie.split("=");
    if (name === "token")
      return value;
  }
  return null;
}
__name(extractTokenFromCookie, "extractTokenFromCookie");
function getToken(request) {
  return extractTokenFromCookie(request) || extractBearerToken(request);
}
__name(getToken, "getToken");

// src/admin-handler.js
function getAdminHTML(isSetup) {
  const baseUrl = self.location?.origin || "";
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Telegram \u5165\u7FA4\u9A8C\u8BC1 Bot \u7BA1\u7406</title>
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

// API \u8BF7\u6C42\u5C01\u88C5
async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(BASE_URL + '/api' + path, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Toast \u901A\u77E5
function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ========== \u8DEF\u7531 ==========
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
    document.getElementById('app').innerHTML = '<div class="auth-page"><div class="auth-card"><h1>404</h1><p>\u9875\u9762\u672A\u627E\u5230</p><button class="btn btn-primary btn-block" onclick="window.location.href='/'">\u8FD4\u56DE\u9996\u9875</button></div></div>';
  }
}

// ========== \u8BBE\u7F6E\u5BC6\u7801\u9875 ==========
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
        <h1>\u{1F510} \u9996\u6B21\u8BBE\u7F6E</h1>
        <p>\u8BBE\u7F6E\u7BA1\u7406\u5458\u5BC6\u7801\uFF0C\u7528\u4E8E\u7BA1\u7406 Bot \u914D\u7F6E</p>
        <div id="setup-form">
          <div class="form-group">
            <label>\u7BA1\u7406\u5458\u5BC6\u7801</label>
            <input type="password" id="setup-password" placeholder="\u8F93\u5165\u5BC6\u7801" autocomplete="new-password"/>
          </div>
          <div class="form-group">
            <label>\u786E\u8BA4\u5BC6\u7801</label>
            <input type="password" id="setup-confirm" placeholder="\u518D\u6B21\u8F93\u5165\u5BC6\u7801" autocomplete="new-password"/>
          </div>
          <button class="btn btn-primary btn-block" id="setup-btn" onclick="handleSetup()">\u8BBE\u7F6E\u5BC6\u7801</button>
        </div>
      </div>
    </div>
  \`;
}

async function handleSetup() {
  const password = document.getElementById('setup-password').value;
  const confirm = document.getElementById('setup-confirm').value;
  const btn = document.getElementById('setup-btn');
  if (!password) { showToast('\u8BF7\u8F93\u5165\u5BC6\u7801', 'error'); return; }
  if (password !== confirm) { showToast('\u4E24\u6B21\u5BC6\u7801\u4E0D\u4E00\u81F4', 'error'); return; }
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
    showToast('\u5BC6\u7801\u8BBE\u7F6E\u6210\u529F\uFF01', 'success');
    setTimeout(() => { window.location.href = '/dashboard'; }, 500);
  } catch (e) {
    showToast(e.message, 'error');
    btn.disabled = false;
    btn.textContent = '\u8BBE\u7F6E\u5BC6\u7801';
  }
}

// ========== \u767B\u5F55\u9875 ==========
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
        <h1>\u{1F44B} \u7BA1\u7406\u5458\u767B\u5F55</h1>
        <p>\u8BF7\u8F93\u5165\u7BA1\u7406\u5458\u5BC6\u7801\u4EE5\u7BA1\u7406 Bot</p>
        <div class="form-group">
          <label>\u7BA1\u7406\u5458\u5BC6\u7801</label>
          <input type="password" id="login-password" placeholder="\u8F93\u5165\u5BC6\u7801" autocomplete="current-password" onkeydown="if(event.key==='Enter')handleLogin()"/>
        </div>
        <button class="btn btn-primary btn-block" id="login-btn" onclick="handleLogin()">\u767B\u5F55</button>
      </div>
    </div>
  \`;
  document.getElementById('login-password').focus();
}

async function handleLogin() {
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  if (!password) { showToast('\u8BF7\u8F93\u5165\u5BC6\u7801', 'error'); return; }
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
    showToast('\u767B\u5F55\u6210\u529F\uFF01', 'success');
    setTimeout(() => { window.location.href = '/dashboard'; }, 500);
  } catch (e) {
    showToast(e.message, 'error');
    btn.disabled = false;
    btn.textContent = '\u767B\u5F55';
  }
}

// ========== \u4EEA\u8868\u76D8 ==========
let bots = [];

async function renderDashboard() {
  // \u68C0\u67E5\u662F\u5426\u5DF2\u767B\u5F55
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '/login'; return; }

  const app = document.getElementById('app');
  app.innerHTML = \`
    <div class="navbar">
      <div class="brand">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        Bot \u7BA1\u7406
      </div>
      <div class="user-area">
        <span>\u7BA1\u7406\u5458</span>
        <button class="btn btn-outline btn-sm" onclick="handleLogout()">\u767B\u51FA</button>
      </div>
    </div>
    <div class="dashboard">
      <div class="dashboard-header">
        <h2>\u{1F916} \u9A8C\u8BC1 Bot</h2>
        <p>\u7BA1\u7406\u4F60\u7684 Telegram \u5165\u7FA4\u9A8C\u8BC1\u673A\u5668\u4EBA</p>
      </div>
      <div id="bot-list" class="bot-list">
        <div class="empty-state" id="loading-state">
          <div class="spinner" style="border-color:rgba(0,0,0,0.1);border-top-color:var(--primary);width:40px;height:40px;border-width:3px;margin:0 auto 16px"></div>
          <p>\u52A0\u8F7D\u4E2D...</p>
        </div>
      </div>
    </div>
    <button class="fab" onclick="openAddModal()" title="\u6DFB\u52A0 Bot">+</button>
  \`;
  
  await loadBots();
}

async function loadBots() {
  try {
    const data = await api('/bots');
    bots = data.bots || [];
    renderBotList();
  } catch (e) {
    document.getElementById('bot-list').innerHTML = '<div class="empty-state"><p>\u52A0\u8F7D\u5931\u8D25: ' + e.message + '</p></div>';
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
        <h3>\u8FD8\u6CA1\u6709\u6DFB\u52A0 Bot</h3>
        <p>\u70B9\u51FB\u53F3\u4E0B\u89D2\u7684 + \u6309\u94AE\u6DFB\u52A0\u4F60\u7684\u7B2C\u4E00\u4E2A Bot</p>
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
          <button class="btn btn-outline btn-sm" onclick="openEditModal(\${bot.id})">\u270F\uFE0F \u7F16\u8F91</button>
          <button class="btn btn-danger btn-sm" onclick="deleteBot(\${bot.id})">\u{1F5D1}\uFE0F \u5220\u9664</button>
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
      <button class="close-btn" onclick="closeModal()">\xD7</button>
      <h3>\${isEdit ? '\u270F\uFE0F \u7F16\u8F91 Bot' : '\u2795 \u6DFB\u52A0 Bot'}</h3>
      <form id="bot-form" onsubmit="return false;">
        <div class="form-group">
          <label>Bot \u540D\u79F0</label>
          <input type="text" id="form-name" placeholder="\u4F8B\u5982\uFF1A\u6211\u7684\u9A8C\u8BC1 Bot" value="\${isEdit ? escapeHtml(bot.name || '') : ''}" required/>
        </div>
        <div class="form-group">
          <label>Bot Token</label>
          <input type="text" id="form-token" placeholder="123456:ABCdef..." value="\${isEdit ? escapeHtml(bot.token || '') : ''}" required/>
          <div class="hint">\u4ECE @BotFather \u83B7\u53D6\u7684 Bot Token</div>
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
          <label>\u7BA1\u7406\u7FA4\u7EC4 ID\uFF08\u53EF\u9009\uFF0C\u9017\u53F7\u5206\u9694\uFF09</label>
          <input type="text" id="form-chat-ids" placeholder="-100123456,-100789012" value="\${isEdit ? escapeHtml((bot.allowed_chat_ids || []).join(',')) : ''}"/>
          <div class="hint">\u7559\u7A7A\u5219\u8868\u793A\u5141\u8BB8\u6240\u6709\u7FA4\u7EC4\u4F7F\u7528\u6B64 Bot</div>
        </div>
        <button type="submit" class="btn btn-primary btn-block" id="form-submit-btn">
          \${isEdit ? '\u4FDD\u5B58\u4FEE\u6539' : '\u6DFB\u52A0 Bot'}
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
      showToast('\u8BF7\u586B\u5199\u6240\u6709\u5FC5\u586B\u5B57\u6BB5', 'error');
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
        showToast('Bot \u5DF2\u66F4\u65B0', 'success');
      } else {
        await api('/bots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        showToast('Bot \u5DF2\u6DFB\u52A0', 'success');
      }
      closeModal();
      await loadBots();
    } catch (e) {
      showToast(e.message, 'error');
      btn.disabled = false;
      btn.textContent = isEdit ? '\u4FDD\u5B58\u4FEE\u6539' : '\u6DFB\u52A0 Bot';
    }
  });
}

function closeModal() {
  const modal = document.getElementById('bot-modal');
  if (modal) modal.remove();
}

async function deleteBot(id) {
  if (!confirm('\u786E\u5B9A\u8981\u5220\u9664\u8FD9\u4E2A Bot \u5417\uFF1F')) return;
  try {
    await api('/bots/' + id, { method: 'DELETE' });
    showToast('Bot \u5DF2\u5220\u9664', 'success');
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

// ========== \u542F\u52A8 ==========
navigate();
window.addEventListener('popstate', navigate);
<\/script>
</body>
</html>`;
}
__name(getAdminHTML, "getAdminHTML");
async function handleAdminRequest(request, kv, url) {
  const path = url.pathname.replace(/\/$/, "") || "/";
  const method = request.method;
  if (method === "GET") {
    const hasPassword = await kv.hasAdminPassword();
    if (path === "/setup" && !hasPassword) {
      return new Response(getAdminHTML(true), {
        headers: { "Content-Type": "text/html;charset=utf-8" }
      });
    }
    if (path === "/setup" && hasPassword) {
      return Response.redirect(url.origin + "/login", 302);
    }
    if (path === "/login" && !hasPassword) {
      return Response.redirect(url.origin + "/setup", 302);
    }
    if (path === "/login" && hasPassword) {
      return new Response(getAdminHTML(false), {
        headers: { "Content-Type": "text/html;charset=utf-8" }
      });
    }
    if (path === "/dashboard" || path === "/") {
      if (!hasPassword) {
        return Response.redirect(url.origin + "/setup", 302);
      }
      return new Response(getAdminHTML(false), {
        headers: { "Content-Type": "text/html;charset=utf-8" }
      });
    }
  }
  if (path.startsWith("/api/")) {
    const apiPath = path.slice(5);
    if (apiPath === "setup" && method === "POST") {
      return handleSetupAPI(request, kv);
    }
    if (apiPath === "login" && method === "POST") {
      return handleLoginAPI(request, kv);
    }
    const token = getToken(request);
    if (!token || !await kv.validateToken(token)) {
      return jsonResponse({ error: "\u672A\u6388\u6743\uFF0C\u8BF7\u5148\u767B\u5F55" }, 401);
    }
    if (apiPath === "bots" && method === "GET") {
      return handleGetBots(kv);
    }
    if (apiPath === "bots" && method === "POST") {
      return handleCreateBot(request, kv, url);
    }
    const botMatch = apiPath.match(/^bots\/(\d+)$/);
    if (botMatch) {
      const botId = parseInt(botMatch[1]);
      if (method === "PUT")
        return handleUpdateBot(request, kv, botId, url);
      if (method === "DELETE")
        return handleDeleteBot(request, kv, botId);
    }
    const webhookMatch = apiPath.match(/^bots\/(\d+)\/webhook$/);
    if (webhookMatch) {
      const botId = parseInt(webhookMatch[1]);
      if (method === "POST")
        return handleSetWebhook(request, kv, botId, url);
    }
  }
  return jsonResponse({ error: "Not Found" }, 404);
}
__name(handleAdminRequest, "handleAdminRequest");
async function handleSetupAPI(request, kv) {
  try {
    if (await kv.hasAdminPassword()) {
      return jsonResponse({ error: "\u7BA1\u7406\u5458\u5BC6\u7801\u5DF2\u8BBE\u7F6E\uFF0C\u8BF7\u76F4\u63A5\u767B\u5F55" }, 409);
    }
    const { password } = await request.json();
    if (!password) {
      return jsonResponse({ error: "\u5BC6\u7801\u4E0D\u80FD\u4E3A\u7A7A" }, 400);
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
__name(handleSetupAPI, "handleSetupAPI");
async function handleLoginAPI(request, kv) {
  try {
    const { password } = await request.json();
    if (!password) {
      return jsonResponse({ error: "\u5BC6\u7801\u4E0D\u80FD\u4E3A\u7A7A" }, 400);
    }
    const storedHash = await kv.getAdminPassword();
    if (!storedHash) {
      return jsonResponse({ error: "\u5C1A\u672A\u8BBE\u7F6E\u7BA1\u7406\u5458\u5BC6\u7801\uFF0C\u8BF7\u5148\u8BBF\u95EE /setup" }, 400);
    }
    const hashed = await hashPassword(password);
    if (hashed !== storedHash) {
      return jsonResponse({ error: "\u5BC6\u7801\u9519\u8BEF" }, 401);
    }
    const token = generateToken();
    await kv.setAdminToken(token);
    return jsonResponse({ success: true, token });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}
__name(handleLoginAPI, "handleLoginAPI");
async function handleGetBots(kv) {
  const bots = await kv.getAllBots();
  return jsonResponse({ bots });
}
__name(handleGetBots, "handleGetBots");
async function handleCreateBot(request, kv, url) {
  try {
    const body = await request.json();
    const { name, token, site_key, secret_key, allowed_chat_ids } = body;
    if (!name || !token || !site_key || !secret_key) {
      return jsonResponse({ error: "\u8BF7\u586B\u5199\u6240\u6709\u5FC5\u586B\u5B57\u6BB5" }, 400);
    }
    const botInfo = await getMe(token);
    if (!botInfo.ok) {
      return jsonResponse({ error: "Bot Token \u65E0\u6548: " + (botInfo.description || "\u672A\u77E5\u9519\u8BEF") }, 400);
    }
    const botId = await kv.getNextBotId();
    const config = {
      name,
      token,
      site_key,
      secret_key,
      allowed_chat_ids: allowed_chat_ids || [],
      created_at: Date.now(),
      webhook_set: false
    };
    await kv.saveBot(botId, config);
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
__name(handleCreateBot, "handleCreateBot");
async function handleUpdateBot(request, kv, botId, url) {
  try {
    const existing = await kv.getBot(botId);
    if (!existing) {
      return jsonResponse({ error: "Bot \u4E0D\u5B58\u5728" }, 404);
    }
    const body = await request.json();
    const { name, token, site_key, secret_key, allowed_chat_ids } = body;
    if (!name || !token || !site_key || !secret_key) {
      return jsonResponse({ error: "\u8BF7\u586B\u5199\u6240\u6709\u5FC5\u586B\u5B57\u6BB5" }, 400);
    }
    if (token !== existing.token) {
      const botInfo = await getMe(token);
      if (!botInfo.ok) {
        return jsonResponse({ error: "\u65B0\u7684 Bot Token \u65E0\u6548: " + (botInfo.description || "\u672A\u77E5\u9519\u8BEF") }, 400);
      }
    }
    const config = {
      ...existing,
      name,
      token,
      site_key,
      secret_key,
      allowed_chat_ids: allowed_chat_ids || [],
      updated_at: Date.now()
    };
    if (token !== existing.token) {
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
__name(handleUpdateBot, "handleUpdateBot");
async function handleDeleteBot(request, kv, botId) {
  try {
    const bot = await kv.getBot(botId);
    if (!bot) {
      return jsonResponse({ error: "Bot \u4E0D\u5B58\u5728" }, 404);
    }
    if (bot.token) {
      await deleteWebhook(bot.token);
    }
    await kv.deleteBot(botId);
    return jsonResponse({ success: true });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}
__name(handleDeleteBot, "handleDeleteBot");
async function handleSetWebhook(request, kv, botId, url) {
  try {
    const bot = await kv.getBot(botId);
    if (!bot) {
      return jsonResponse({ error: "Bot \u4E0D\u5B58\u5728" }, 404);
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
__name(handleSetWebhook, "handleSetWebhook");
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(jsonResponse, "jsonResponse");

// src/index.js
function errorResponse(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status: status || 500,
    headers: { "Content-Type": "application/json" }
  });
}
__name(errorResponse, "errorResponse");
async function cleanupExpiredVerifications(env) {
  var kv = new kv_default(env);
  var pendingList = await kv.getAllPendingVerifications();
  if (!pendingList || pendingList.length === 0)
    return;
  var now = Date.now();
  var VERIFY_TIMEOUT = 5 * 60 * 1e3;
  var processedIds = [];
  var failedIds = [];
  for (var i = 0; i < pendingList.length; i++) {
    var item = pendingList[i];
    var elapsed = now - item.timestamp;
    if (elapsed < VERIFY_TIMEOUT)
      continue;
    var record = await kv.getVerification(item.botId, item.chatId, item.userId);
    if (!record) {
    } else if (record.verified) {
      processedIds.push({ botId: item.botId, chatId: item.chatId, userId: item.userId });
      continue;
    }
    var bot = await kv.getBot(item.botId);
    if (!bot) {
      processedIds.push({ botId: item.botId, chatId: item.chatId, userId: item.userId });
      continue;
    }
    try {
      var latestRecord = await kv.getVerification(item.botId, item.chatId, item.userId);
      if (latestRecord && latestRecord.verified) {
        processedIds.push({ botId: item.botId, chatId: item.chatId, userId: item.userId });
        continue;
      }
      var kickResult = await kickUser(bot.token, item.chatId, item.userId);
      if (!kickResult.ok) {
        await unrestrictUser(bot.token, item.chatId, item.userId);
      }
      if (item.messageId) {
        try {
          await deleteMessage(bot.token, item.chatId, item.messageId);
        } catch (e) {
        }
      }
      await kv.deleteVerification(item.botId, item.chatId, item.userId);
      processedIds.push({ botId: item.botId, chatId: item.chatId, userId: item.userId });
    } catch (err) {
      console.error("Error kicking expired user:", err.message);
      failedIds.push({ botId: item.botId, chatId: item.chatId, userId: item.userId });
    }
  }
  if (processedIds.length > 0) {
    await kv.removePendingVerifications(processedIds);
  }
}
__name(cleanupExpiredVerifications, "cleanupExpiredVerifications");
var src_default = {
  async fetch(request, env, ctx) {
    try {
      var url = new URL(request.url);
      var path = url.pathname;
      var kv = new kv_default(env);
      var webhookMatch = path.match(/^\/webhook\/(\d+)$/);
      if (webhookMatch && request.method === "POST") {
        var botId = parseInt(webhookMatch[1]);
        var bot = await kv.getBot(botId);
        if (!bot) {
          return errorResponse("Bot not found", 404);
        }
        var update = await request.json();
        var result = await handleWebhookUpdate(update, bot, botId, kv, url.origin);
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" }
        });
      }
      if (path === "/verify" || path === "/verify/") {
        var waitUntil = /* @__PURE__ */ __name(function(promise) {
          ctx.waitUntil(promise);
        }, "waitUntil");
        return await handleVerifyRequest(request, kv, url, waitUntil);
      }
      if (path === "/api/setup" || path === "/api/login" || path === "/api/bots" || path.match(/^\/api\/bots\//) || path === "/login" || path === "/setup" || path === "/dashboard" || path === "/" || path.match(/^\/dashboard\/*/)) {
        return await handleAdminRequest(request, kv, url);
      }
      return new Response("Not Found", { status: 404 });
    } catch (err) {
      console.error("Unhandled error:", err.message, err.stack);
      return errorResponse("Internal Server Error: " + err.message, 500);
    }
  },
  /**
   * 定时清理过期验证（Cloudflare Cron Triggers）
   * 每 1 分钟执行一次
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanupExpiredVerifications(env));
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-jpqZ9Z/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-jpqZ9Z/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
