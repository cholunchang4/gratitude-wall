// 後台 API 呼叫：路徑和回應形狀和 5.5 相同，實際由 ../app/fb/admin-backend.js 讀寫 Firebase（只有管理員讀寫得到）。
export class ApiError extends Error {
  constructor(status, code, message, retryAfter) { super(message); this.status = status; this.code = code; this.retryAfter = retryAfter ?? null; }
}
let backend = null;
export function setBackend(b) { backend = b; }
export function requestId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
const wrap = (e) => (e instanceof ApiError ? e : new ApiError(typeof e?.status === 'number' ? e.status : 503, e?.code || 'ERROR', e?.message || '操作沒有成功，請稍後再試一次。', e?.retryAfter));
async function send(method, path, body) {
  if (!backend) throw new ApiError(401, 'UNAUTHENTICATED', '請先登入。');
  try { return await backend.call(method, path, body); } catch (e) { throw wrap(e); }
}
export const apiGet = (path) => send('GET', path);
export const apiPost = (path, body) => send('POST', path, { request_id: requestId(), ...body });
export async function apiDownload(path) {
  if (!backend) throw new ApiError(401, 'UNAUTHENTICATED', '請先登入。');
  const mode = new URL(path, 'http://x/').searchParams.get('mode') || 'none';
  try { return await backend.exportLurkers(mode); } catch (e) { throw wrap(e); }
}
export const streamUrl = () => null;
