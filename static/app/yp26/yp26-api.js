// T108「手心的光」前台和伺服器之間的連線。
// - 只「讀」yp26/pick/{我}（自己挑的）和 yp26/n（全公司總張數）；挑、放回一律呼叫 callable yp26Pick（規則不讓前台寫 yp26）。
// - callable 用 fetch 打 Firebase callable 協定（和 sky/sky-bank.js 同一套做法），不用把 firebase/functions 打包進 SDK。
import { ref, onValue } from '../../vendor/firebase-sdk.js';
import { FIREBASE_CONFIG, EMULATOR } from '../fb/firebase-config.js';

const REGION = 'asia-southeast1';
const TIMEOUT_MS = 20000;

export class PickError extends Error {
  constructor(code, status = 0) { super(code); this.code = code; this.status = status; }
}

/** o = { db, user（Firebase Auth user）, meId, emulator, onPicks(obj|null, err), onCount(n) } */
export function createYp26Api(o) {
  const base = o.emulator
    ? `http://${EMULATOR.host}:${EMULATOR.fnPort || 5001}/${EMULATOR.projectId}/${REGION}`
    : `https://${REGION}-${FIREBASE_CONFIG.projectId}.cloudfunctions.net`;
  const offs = [];

  async function call(data) {
    if (typeof fetch !== 'function') throw new PickError('NETWORK');
    let token = '';
    try { token = await o.user.getIdToken(); } catch (e) { throw new PickError('UNAUTH'); }
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), TIMEOUT_MS);
    let res, body = null;
    try {
      res = await fetch(`${base}/yp26Pick`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data }), signal: ctl ? ctl.signal : undefined, credentials: 'omit' });
      try { body = await res.json(); } catch (e) { body = null; }
    } catch (e) {
      throw new PickError(e && e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK');
    } finally { clearTimeout(timer); }
    if (body && body.error) throw new PickError((body.error.details && body.error.details.code) || String(body.error.status || 'INTERNAL'), res.status);
    if (!res.ok || !body || !('result' in body)) throw new PickError(res.status === 404 ? 'NOT_DEPLOYED' : 'UNAVAILABLE', res.status);
    return body.result;
  }

  return {
    listen() {
      if (offs.length || !o.meId) return;
      offs.push(onValue(ref(o.db, `yp26/pick/${o.meId}`), (s) => o.onPicks(s.val() || {}, null), (err) => o.onPicks(null, err)));
      offs.push(onValue(ref(o.db, 'yp26/n'), (s) => o.onCount(Number(s.val()) || 0), () => o.onCount(null)));
    },
    stop() { while (offs.length) { try { offs.pop()(); } catch (e) { /* 已經停了 */ } } },
    add: (mid, rid) => call({ action: 'add', mid, rid }),
    remove: (mid, rid) => call({ action: 'remove', mid, rid }),
    stats: (fix = false) => call(fix ? { action: 'stats', fix: true } : { action: 'stats' }),   // 只有管理員：只回數字
    admin: (action, extra = {}) => call({ ...extra, action }),                                  // 只有管理員：封箱後補卡（adminList／adminCards／adminSet）
  };
}
