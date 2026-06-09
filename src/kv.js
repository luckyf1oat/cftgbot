/**
 * KV 存储操作封装
 */
class KVStore {
  constructor(env) {
    this.kv = env.KV;
  }

  // === 管理员相关 ===

  async getAdminPassword() {
    return await this.kv.get('admin:password', 'text');
  }

  async setAdminPassword(hash) {
    await this.kv.put('admin:password', hash);
  }

  async hasAdminPassword() {
    const pw = await this.getAdminPassword();
    return pw !== null;
  }

  async getAdminToken() {
    return await this.kv.get('admin:token', 'text');
  }

  async setAdminToken(token) {
    await this.kv.put('admin:token', token, { expirationTtl: 604800 });
  }

  async validateToken(token) {
    const stored = await this.getAdminToken();
    return stored === token;
  }

  // === Bot 配置管理 ===

  async getNextBotId() {
    const countStr = await this.kv.get('bot:count', 'text');
    const count = parseInt(countStr || '0');
    await this.kv.put('bot:count', String(count + 1));
    return count + 1;
  }

  async getAllBots() {
    const countStr = await this.kv.get('bot:count', 'text');
    const count = parseInt(countStr || '0');
    const bots = [];
    for (let i = 1; i <= count; i++) {
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
  }

  /**
   * 删除验证记录
   */
  async deleteVerification(botId, chatId, userId) {
    var key = 'verify:' + botId + ':' + chatId + ':' + userId;
    await this.kv.delete(key);
  }
}

export default KVStore;