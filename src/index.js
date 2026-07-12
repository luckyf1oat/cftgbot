/**
 * Cloudflare Workers 入口
 * Telegram 入群验证 Bot 管理 + 验证系统
 */
import KVStore from './kv.js';
import { handleWebhookUpdate } from './webhook.js';
import { handleVerifyRequest } from './verify-handler.js';
import { handleAdminRequest } from './admin-handler.js';
import { kickUser, deleteMessage, unrestrictUser } from './telegram.js';

/**
 * 全局错误响应
 */
function errorResponse(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status: status || 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 清理过期验证（每 1 分钟执行一次）
 */
async function cleanupExpiredVerifications(env) {
  var kv = new KVStore(env);
  var pendingList = await kv.getAllPendingVerifications();
  if (!pendingList || pendingList.length === 0) return;

  var now = Date.now();
  var VERIFY_TIMEOUT = 5 * 60 * 1000; // 5 分钟
  var processedIds = []; // 已处理的记录 ID
  var failedIds = [];    // 处理失败的记录 ID

  for (var i = 0; i < pendingList.length; i++) {
    var item = pendingList[i];
    var elapsed = now - item.timestamp;

    // 只处理超过 5 分钟的记录
    if (elapsed < VERIFY_TIMEOUT) continue;

    // 获取当前验证记录，检查是否已验证
    var record = await kv.getVerification(item.botId, item.chatId, item.userId);
    if (!record) {
      // KV 记录已不存在（可能已过期自动删除），但还在 pending 列表中
      // 说明该用户未验证，需要踢出
    } else if (record.verified) {
      // 已验证，从待处理列表中移除
      processedIds.push({ botId: item.botId, chatId: item.chatId, userId: item.userId });
      continue;
    }

    // 获取 Bot 配置
    var bot = await kv.getBot(item.botId);
    if (!bot) {
      // Bot 不存在，跳过清理
      processedIds.push({ botId: item.botId, chatId: item.chatId, userId: item.userId });
      continue;
    }

    // 踢出未验证用户
    try {
      // Recheck immediately before kicking in case verification completed while cleanup was running.
      var latestRecord = await kv.getVerification(item.botId, item.chatId, item.userId);
      if (latestRecord && latestRecord.verified) {
        processedIds.push({ botId: item.botId, chatId: item.chatId, userId: item.userId });
        continue;
      }
      var kickResult = await kickUser(bot.token, item.chatId, item.userId);
      // 如果踢出失败（如 Bot 权限不足），解除禁言，避免用户卡在禁言状态
      if (!kickResult.ok) {
        await unrestrictUser(bot.token, item.chatId, item.userId);
      }
      // 删除验证消息（如果有）
      if (item.messageId) {
        try {
          await deleteMessage(bot.token, item.chatId, item.messageId);
        } catch (e) {
          // 忽略删除消息失败
        }
      }
      // 删除验证记录
      await kv.deleteVerification(item.botId, item.chatId, item.userId);
      processedIds.push({ botId: item.botId, chatId: item.chatId, userId: item.userId });
    } catch (err) {
      console.error('Error kicking expired user:', err.message);
      failedIds.push({ botId: item.botId, chatId: item.chatId, userId: item.userId });
    }
  }

  // 清理已处理的记录
  if (processedIds.length > 0) {
    await kv.removePendingVerifications(processedIds);
  }
}

/**
 * Worker 入口
 */
export default {
  async fetch(request, env, ctx) {
    try {
      var url = new URL(request.url);
      var path = url.pathname;
      var kv = new KVStore(env);

      // === 1. Telegram Webhook 回调 ===
      // 路径格式: /webhook/:botId
      var webhookMatch = path.match(/^\/webhook\/(\d+)$/);
      if (webhookMatch && request.method === 'POST') {
        var botId = parseInt(webhookMatch[1]);
        
        // 获取 Bot 配置
        var bot = await kv.getBot(botId);
        if (!bot) {
          return errorResponse('Bot not found', 404);
        }

        // 解析 Telegram update
        var update = await request.json();
        
        // 处理更新
        var result = await handleWebhookUpdate(update, bot, botId, kv, url.origin);
        
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // === 2. 验证页面 ===
      if (path === '/verify' || path === '/verify/') {
        var waitUntil = function(promise) {
          ctx.waitUntil(promise);
        };
        return await handleVerifyRequest(request, kv, url, waitUntil);
      }

      // === 3. API 路由 (由 admin-handler.js 处理) ===
      if (path === '/api/setup' || path === '/api/login' || 
          path === '/api/bots' || path.match(/^\/api\/bots\//) ||
          path === '/login' || path === '/setup' || 
          path === '/dashboard' || path === '/' || path.match(/^\/dashboard\/*/)) {
        return await handleAdminRequest(request, kv, url);
      }

      // === 4. 404 ===
      return new Response('Not Found', { status: 404 });

    } catch (err) {
      console.error('Unhandled error:', err.message, err.stack);
      return errorResponse('Internal Server Error: ' + err.message, 500);
    }
  },

  /**
   * 定时清理过期验证（Cloudflare Cron Triggers）
   * 每 1 分钟执行一次
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanupExpiredVerifications(env));
  },
};