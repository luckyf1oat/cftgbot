/**
 * Cloudflare KV 存储封装
 */
class KVStore {
  constructor(env) {
    this.kv = env.KV;
  }

  // === Bot 管理 ===

  async getBotCount() {
    const countStr = await this.kv.get('bot:count', 'text');
    return parseInt(countStr || '0');
  }

  async incrementBotCount() {
    const countStr = await this.kv.get('bot:count', 'text');
    const count = parseInt(countStr || '0') + 1;
    await this.kv.put('bot:count', String(count));
    return count;
  }

  async getAllBots() {
    const count = await this.getBotCount();
    var bots = [];
    for (var i = 1; i <= count; i++) {
      const data = await this.kv.get('bot:' + i, 'text');
      if (data) {
        try {
          const bot = JSON.parse(data);
          bot.id = i;
          bots.push(bot);
        } catch (e) {}
      }
    }
    return bots;
  }

  async getBot(botId) {
    const data = await this.kv.get('bot:' + botId, 'text');
    if (!data) return null;
    return JSON.parse(data);
  }

  async saveBot(botId, botConfig) {
    const { id, ...config } = botConfig;
    await this.kv.put('bot:' + botId, JSON.stringify(config));
  }

  async deleteBot(botId) {
    await this.kv.delete('bot:' + botId);
  }

  async decrementBotCount() {
    const countStr = await this.kv.get('bot:count', 'text');
    const count = parseInt(countStr || '0');
    if (count > 0) {
      await this.kv.put('bot:count', String(count - 1));
    }
  }

  // === 验证状态管理 ===

  /**
   * 创建验证记录
   * TTL 设为 300s (5分钟)，过期后 KV 自动删除
   */
  async createVerification(botId, chatId, userId, secret, messageId) {
    var key = 'verify:' + botId + ':' + chatId + ':' + userId;
    var data = JSON.stringify({
      secret: secret,
      verified: false,
      time: Date.now(),
      message_id: messageId,
      chat_id: chatId,
      user_id: userId,
    });
    // 5 分钟 TTL，过期后 KV 自动删除
    await this.kv.put(key, data, { expirationTtl: 300 });

    // 添加到待处理列表，用于定时清理（即使 messageId 为空，也需要跟踪以清理禁言用户）
    await this.addPendingVerification(botId, chatId, userId, messageId);
  }

  /**
   * 获取验证记录
   */
  async getVerification(botId, chatId, userId) {
    var key = 'verify:' + botId + ':' + chatId + ':' + userId;
    var data = await this.kv.get(key, 'text');
    if (!data) return null;
    return JSON.parse(data);
  }

  /**
   * 标记为已验证
   */
  async markVerified(botId, chatId, userId) {
    var key = 'verify:' + botId + ':' + chatId + ':' + userId;
    var data = await this.kv.get(key, 'text');
    if (data) {
      var record = JSON.parse(data);
      record.verified = true;
      // 更新后保留 60s 用于后续删除消息等操作
      await this.kv.put(key, JSON.stringify(record), { expirationTtl: 60 });
    }
    // 从待处理列表中移除
    await this.removePendingVerification(botId, chatId, userId);
  }

  /**
   * 删除验证记录
   */
  async deleteVerification(botId, chatId, userId) {
    var key = 'verify:' + botId + ':' + chatId + ':' + userId;
    await this.kv.delete(key);
    // 从待处理列表中移除
    await this.removePendingVerification(botId, chatId, userId);
  }

  // === 待处理验证列表（用于定时清理） ===

  /**
   * 添加待处理验证记录
   */
  async addPendingVerification(botId, chatId, userId, messageId) {
    var listKey = 'verify:pending';
    var listStr = await this.kv.get(listKey, 'text');
    var list = [];
    if (listStr) {
      try { list = JSON.parse(listStr); } catch(e) {}
    }
    // 移除可能存在的旧记录
    list = list.filter(function(item) {
      return !(item.botId === botId && item.chatId === chatId && item.userId === userId);
    });
    list.push({
      botId: botId,
      chatId: chatId,
      userId: userId,
      messageId: messageId,
      timestamp: Date.now(),
    });
    await this.kv.put(listKey, JSON.stringify(list));
  }

  /**
   * 从待处理列表中移除
   */
  async removePendingVerification(botId, chatId, userId) {
    var listKey = 'verify:pending';
    var listStr = await this.kv.get(listKey, 'text');
    if (!listStr) return;
    var list = [];
    try { list = JSON.parse(listStr); } catch(e) { return; }
    var newList = list.filter(function(item) {
      return !(item.botId === botId && item.chatId === chatId && item.userId === userId);
    });
    if (newList.length === list.length) return; // 没有变化
    await this.kv.put(listKey, JSON.stringify(newList));
  }

  /**
   * 获取所有待处理验证
   */
  async getAllPendingVerifications() {
    var listKey = 'verify:pending';
    var listStr = await this.kv.get(listKey, 'text');
    if (!listStr) return [];
    try {
      return JSON.parse(listStr);
    } catch(e) {
      return [];
    }
  }

  /**
   * 从待处理列表中批量移除已验证/已处理的记录
   */
  async removePendingVerifications(ids) {
    // ids: [{botId, chatId, userId}, ...]
    if (!ids || ids.length === 0) return;
    var listKey = 'verify:pending';
    var listStr = await this.kv.get(listKey, 'text');
    if (!listStr) return;
    var list = [];
    try { list = JSON.parse(listStr); } catch(e) { return; }
    var idSet = {};
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      idSet[id.botId + ':' + id.chatId + ':' + id.userId] = true;
    }
    var newList = list.filter(function(item) {
      return !idSet[item.botId + ':' + item.chatId + ':' + item.userId];
    });
    await this.kv.put(listKey, JSON.stringify(newList));
  }
}

export default KVStore;