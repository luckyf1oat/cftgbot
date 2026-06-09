/**
 * 管理员身份验证模块
 */

/**
 * 生成随机令牌（32 字节 hex 字符串）
 */
export function generateToken() {
  const chars = 'abcdef0123456789';
  let result = '';
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  for (let i = 0; i < 32; i++) {
    result += chars[array[i] % 16];
  }
  return result;
}

/**
 * 计算 SHA-256 哈希（用于密码存储和验证）
 * @param {string} str - 要哈希的字符串
 * @returns {Promise<string>} 十六进制哈希字符串
 */
export async function hashPassword(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 从请求中提取 Bearer Token
 */
export function extractBearerToken(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * 验证请求是否为已认证的管理员
 * @returns {Promise<{authenticated: boolean, token?: string}>}
 */
export async function authenticateRequest(request, kv) {
  const token = extractBearerToken(request);
  if (!token) {
    return { authenticated: false };
  }
  const valid = await kv.validateToken(token);
  return { authenticated: valid, token: valid ? token : null };
}

/**
 * 从 Cookie 中提取 token
 */
export function extractTokenFromCookie(request) {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    const [name, value] = cookie.split('=');
    if (name === 'token') return value;
  }
  return null;
}

/**
 * 从请求中获取 token（优先从 Cookie，其次从 Authorization header）
 */
export function getToken(request) {
  return extractTokenFromCookie(request) || extractBearerToken(request);
}