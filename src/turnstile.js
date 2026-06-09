/**
 * Turnstile 验证模块
 * 调用 Cloudflare Turnstile API 验证用户令牌
 */

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * 验证 Turnstile token
 * @param {string} token - 用户完成 Turnstile 后获得的令牌
 * @param {string} secret - Turnstile Secret Key
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function verifyTurnstile(token, secret) {
  if (!token || !secret) {
    return { success: false, error: 'Missing token or secret' };
  }

  try {
    const formData = new FormData();
    formData.append('secret', secret);
    formData.append('response', token);

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    return {
      success: result.success === true,
      error: result['error-codes']?.[0] || null,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}