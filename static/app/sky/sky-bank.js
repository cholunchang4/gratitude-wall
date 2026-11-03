// T101：前台和光點銀行（Cloud Functions）、星空計數之間的連線。規格：docs/光點帳本規格.md。
// - 前端只「讀」wallet/{我}、ledger/{我}、ev/stars，只「呼叫」callable（bankOpen、bankClaim、skyPool）；入帳全在伺服器。
// - callable 用 fetch 打 Firebase callable 協定（POST {data}，Authorization: Bearer ID token），不用把 firebase/functions 打包進 SDK。
// - 銀行還沒部署（404、網路錯、讀不到 wallet）時 status＝'down'：畫面改說「小螢記下了」，不顯示錯誤。
import { ref, onValue } from '../../vendor/firebase-sdk.js';
import { FIREBASE_CONFIG, EMULATOR } from '../fb/firebase-config.js';

const REGION = 'asia-southeast1';
const TIMEOUT_MS = 15000;
const DOWN_CODES = new Set(['NOT_FOUND_FN', 'NETWORK', 'UNAVAILABLE', 'UNAUTH']);   // 逾時、伺服器錯誤是暫時的（冷啟動），不算「沒上線」
const TRANSIENT = new Set(['TIMEOUT', 'INTERNAL']);

export class BankError extends Error {
  constructor(code, status = 0, message = code) { super(message); this.code = code; this.status = status; }
  get down() { return DOWN_CODES.has(this.code); }
  get transient() { return TRANSIENT.has(this.code); }
}

/**
 * o = { db, user（Firebase Auth user，取 ID token）, meId, emulator: boolean, onChange(kind) }
 * kind：'wallet' | 'ledger' | 'stars' | 'status'
 */
export function createBank(o) {
  const st = { status: 'unknown', wallet: null, ledger: null, ledgerOk: false, stars: null, starsOk: false, offs: [] };
  const fire = (k) => { try { o.onChange && o.onChange(k); } catch (e) { console.error(e); } };
  const setStatus = (s) => { if (st.status !== s) { st.status = s; fire('status'); } };
  const base = o.emulator
    ? `http://${EMULATOR.host}:${EMULATOR.fnPort || 5001}/${EMULATOR.projectId}/${REGION}`
    : `https://${REGION}-${FIREBASE_CONFIG.projectId}.cloudfunctions.net`;

  async function call(name, data = {}, timeoutMs = TIMEOUT_MS) {
    if (typeof fetch !== 'function') throw new BankError('NETWORK');
    let token = '';
    try { token = await o.user.getIdToken(); } catch (e) { throw new BankError('UNAUTH'); }
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), timeoutMs);
    let res, body = null;
    try {
      res = await fetch(`${base}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data }), signal: ctl ? ctl.signal : undefined, credentials: 'omit' });
      try { body = await res.json(); } catch (e) { body = null; }
    } catch (e) {
      throw new BankError(e && e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK');
    } finally { clearTimeout(timer); }
    if (body && body.error) {
      const code = (body.error.details && body.error.details.code) || String(body.error.status || 'INTERNAL');
      const err = new BankError(code === 'NOT_FOUND' && res.status === 404 && !body.error.details ? 'NOT_FOUND_FN' : code, res.status, body.error.message);
      if (err.down) setStatus('down');
      throw err;
    }
    if (!res.ok || !body || !('result' in body)) { setStatus('down'); throw new BankError(res.status === 404 ? 'NOT_FOUND_FN' : 'UNAVAILABLE', res.status); }
    setStatus('ok');
    return body.result;
  }

  function listen() {
    const me = o.meId;
    if (!me) return;
    st.offs.push(onValue(ref(o.db, `wallet/${me}`), (s) => { st.wallet = s.val(); if (st.wallet && st.status !== 'ok') setStatus('ok'); fire('wallet'); }   // 錢包只有銀行寫得進去：有錢包＝銀行上線了
      , () => { st.wallet = null; setStatus('down'); }));
    st.offs.push(onValue(ref(o.db, `ledger/${me}`), (s) =>   // 只有自己的帳本（每人每年約 200 筆、25KB）
       { st.ledger = s.val() || {}; st.ledgerOk = true; fire('ledger'); },
      () => { st.ledger = null; st.ledgerOk = false; setStatus('down'); }));
    st.offs.push(onValue(ref(o.db, 'ev/stars'), (s) => { const v = s.val(); st.stars = v && typeof v === 'object' ? v : null; st.starsOk = true; fire('stars'); },
      () => { st.stars = null; st.starsOk = false; fire('stars'); }));
  }

  /** 開站：沒開戶就開（冪等）；失敗不報錯，只把狀態設成 down */
  let retried = false;
  async function open() {
    try { return await call('bankOpen', {}, 30000); }
    catch (e) {
      if (!(e instanceof BankError) || e.down) setStatus('down');
      if (!retried) { retried = true; setTimeout(open, 30000); }        // 冷啟動或剛部署：30 秒後再試一次
      return null;
    }
  }
  /** 活動自領：成功或已領回 { ok, dup, a }；銀行沒上回 { pending: true }；條件不符等回 { ok:false, code } */
  async function claim(code, ref_ = null) {
    try { return await call('bankClaim', ref_ ? { ev: 'ev26', code, ref: ref_ } : { ev: 'ev26', code }); }
    catch (e) { if (e instanceof BankError && (e.down || e.transient)) return { pending: true }; return { ok: false, code: e && e.code }; }
  }
  return {
    st, call, open, claim, listen,
    get up() { return st.status === 'ok' || (st.status === 'unknown' && !!st.wallet); },
    get down() { return st.status === 'down'; },
    stop() { st.offs.forEach(f => { try { f(); } catch (e) { /* 略 */ } }); st.offs = []; },
  };
}
