// 後台呼叫 Cloud Functions（callable）的共用小工具：用 fetch 打 Firebase callable 協定（POST {data}，Authorization: Bearer ID token），
// 和前台 sky-bank.js、yp26-api.js 同一套做法，不用把 firebase/functions 打包進 SDK。
import { FIREBASE_CONFIG, EMULATOR } from '../app/fb/firebase-config.js';

const REGION = 'asia-southeast1';
const TIMEOUT_MS = 30000;

export class FnError extends Error {
  constructor(code, status = 0) { super(code); this.code = code; this.status = status; }
}

/** o = { user（Firebase Auth user）, emulator: boolean } → call(name, data) */
export function createFnCaller(o) {
  const base = o.emulator
    ? `http://${EMULATOR.host}:${EMULATOR.fnPort || 5001}/${EMULATOR.projectId}/${REGION}`
    : `https://${REGION}-${FIREBASE_CONFIG.projectId}.cloudfunctions.net`;
  return async function call(name, data = {}) {
    if (typeof fetch !== 'function') throw new FnError('NETWORK');
    let token = '';
    try { token = await o.user.getIdToken(); } catch (e) { throw new FnError('UNAUTH'); }
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), TIMEOUT_MS);
    let res, body = null;
    try {
      res = await fetch(`${base}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data }), signal: ctl ? ctl.signal : undefined, credentials: 'omit' });
      try { body = await res.json(); } catch (e) { body = null; }
    } catch (e) {
      throw new FnError(e && e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK');
    } finally { clearTimeout(timer); }
    if (body && body.error) throw new FnError((body.error.details && body.error.details.code) || String(body.error.status || 'INTERNAL'), res.status);
    if (!res.ok || !body || !('result' in body)) throw new FnError(res.status === 404 ? 'NOT_DEPLOYED' : 'UNAVAILABLE', res.status);
    return body.result;
  };
}
