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

  async getNextBotId() {
    return this.incrementBotCount();
  }

  async getBotIds() {
    const indexStr = await this.kv.get('bot:index', 'text');
    if (indexStr) {
      try {
        const ids = JSON.parse(indexStr);
        if (Array.isArray(ids)) return ids;
      } catch (e) {}
    }

    // Migrate installations that only have the legacy high-water counter.
    const count = await this.getBotCount();
    const ids = [];
    for (let i = 1; i <= count; i++) {
      if (await this.kv.get('bot:' + i, 'text')) ids.push(i);
    }
    await this.kv.put('bot:index', JSON.stringify(ids));
    return ids;
  }

  async setBotIds(ids) {
    await this.kv.put('bot:index', JSON.stringify(ids));
  }

  async getAllBots() {
    const ids = await this.getBotIds();
    var bots = [];
    for (var i = 0; i < ids.length; i++) {
      const botId = ids[i];
      const data = await this.kv.get('bot:' + botId, 'text');
      if (data) {
        try {
          const bot = JSON.parse(data);
          bot.id = botId;
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
    const ids = await this.getBotIds();
    if (!ids.includes(botId)) {
      ids.push(botId);
      ids.sort(function(a, b) { return a - b; });
      await this.setBotIds(ids);
    }
  }

  async deleteBot(botId) {
    await this.kv.delete('bot:' + botId);
    const ids = await this.getBotIds();
    await this.setBotIds(ids.filter(function(id) { return id !== botId; }));
  }

  async decrementBotCount() {
    // Kept for compatibility. bot:count is a monotonic ID high-water mark.
  }

  // === 管理员认证 ===

  async hasAdminPassword() {
    return (await this.getAdminPassword()) !== null;
  }

  async getAdminPassword() {
    return this.kv.get('admin:password', 'text');
  }

  async setAdminPassword(passwordHash) {
    await this.kv.put('admin:password', passwordHash);
  }

  async setAdminToken(token) {
    await this.kv.put('admin:token', token, { expirationTtl: 7 * 24 * 60 * 60 });
  }

  async validateToken(token) {
    if (!token) return false;
    const storedToken = await this.kv.get('admin:token', 'text');
    return storedToken === token;
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

  async updateVerificationMessage(botId, chatId, userId, messageId) {
    var key = 'verify:' + botId + ':' + chatId + ':' + userId;
    var data = await this.kv.get(key, 'text');
    if (!data) return false;
    var record = JSON.parse(data);
    record.message_id = messageId;
    var remainingSeconds = Math.max(60, Math.ceil((record.time + 300000 - Date.now()) / 1000));
    await this.kv.put(key, JSON.stringify(record), { expirationTtl: remainingSeconds });
    await this.addPendingVerification(botId, chatId, userId, messageId, record.time);
    return true;
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
  async addPendingVerification(botId, chatId, userId, messageId, timestamp) {
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
      timestamp: timestamp || Date.now(),
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