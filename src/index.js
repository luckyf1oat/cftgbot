/**
 * Cloudflare Workers 入口
 * Telegram 入群验证 Bot 管理 + 验证系统
 */
import KVStore from './kv.js';
import { handleWebhookUpdate } from './webhook.js';
import { handleVerifyRequest } from './verify-handler.js';
import { handleAdminRequest } from './admin-handler.js';

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
};