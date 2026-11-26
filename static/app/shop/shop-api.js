// T102 拾光小舖：和 Firebase 的連線（只讀＋呼叫 callable）。規格：docs/光點帳本規格.md、docs/T102-前端需求給後端.md。
// - 只「讀」wallet/{我}、ledger/{我}、inv/{我}、fxd/{我}、fxw/{我}、shop/items、shop/sold、bankcfg、settings/fx。
// - 購買只「呼叫」bankSpend({ item, bid })；前端不寫錢包、帳本、擁有（規則也全部拒絕）。
// - callable 用 fetch 打 Firebase callable 協定（和 sky/sky-bank.js 同一套），錯誤保留 error.details（code、need、max）。
// 畫面（shop-ui.js、fx.js）只認得這個介面；測試台用同樣介面的假資料（tests/shop/harness.js）。
import { ref, onValue, update } from '../../vendor/firebase-sdk.js';
import { FIREBASE_CONFIG, EMULATOR } from '../fb/firebase-config.js';
import { normItems, fxSettings } from './shop-logic.js';

const REGION = 'asia-southeast1';
const TIMEOUT_MS = 15000;
export const LEDGER_PAGE = 50;

export class ShopError extends Error {
  constructor(code, details = {}, status = 0) { super(code); this.code = code; this.details = details || {}; this.status = status; }
}

/** Firebase callable（POST {data}，Authorization: Bearer ID token）。失敗丟 ShopError（code＝details.code，網路類＝NETWORK／TIMEOUT／NOT_FOUND_FN／UNAVAILABLE） */
export function makeCallable({ user, emulator = false, fetchFn = (...a) => fetch(...a) }) {
  const base = emulator ? `http://${EMULATOR.host}:${EMULATOR.fnPort || 5001}/${EMULATOR.projectId}/${REGION}` : `https://${REGION}-${FIREBASE_CONFIG.projectId}.cloudfunctions.net`;
  return async function call(name, data = {}) {
    let token = '';
    try { token = await user.getIdToken(); } catch (e) { throw new ShopError('NOT_MEMBER'); }
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), TIMEOUT_MS);
    let res, body = null;
    try {
      res = await fetchFn(`${base}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data }), signal: ctl ? ctl.signal : undefined, credentials: 'omit' });
      try { body = await res.json(); } catch (e) { body = null; }
    } catch (e) {
      throw new ShopError(e && e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK');
    } finally { clearTimeout(timer); }
    if (body && body.error) {
      const det = body.error.details && typeof body.error.details === 'object' ? body.error.details : {};
      const code = det.code || (res.status === 404 ? 'NOT_FOUND_FN' : String(body.error.status || 'INTERNAL'));
      throw new ShopError(code, det, res.status);
    }
    if (!res.ok || !body || !('result' in body)) throw new ShopError(res.status === 404 ? 'NOT_FOUND_FN' : 'UNAVAILABLE', {}, res.status);
    return body.result;
  };
}

/**
 * o = { db, meId, call（makeCallable 的結果）, onChange(kind) }
 * kind：'wallet'|'ledger'|'inv'|'items'|'sold'|'cfg'|'fx'|'fxq'|'status'
 * 讀不到（規則還沒部署、離線）時 ok 對應的欄位是 false，畫面自己降級。
 */
export function createShopApi(o) {
  const st = { wallet: null, ledger: {}, ledgerOk: false, ledgerLimit: LEDGER_PAGE, inv: {}, items: {}, itemsOk: false, sold: {},
    cfg: {}, fx: fxSettings(null), fxd: {}, fxw: {}, equip: {}, offs: [], ledgerOff: null };
  const fire = (k) => { try { o.onChange && o.onChange(k); } catch (e) { console.error(e); } };
  const me = o.meId;
  function watch(path, kind, set) {
    st.offs.push(onValue(ref(o.db, path), (s) => { set(s.val()); fire(kind); }, () => { set(null, true); fire(kind); }));
  }
  // 帳本：打開小舖時才開始監聽（沒進過小舖的人不用下載）。整份讀（每人每年約 200 筆、25 KB），畫面一次顯示 50 筆、「看更早的」再多 50 筆。
  // 不用 query／limitToLast：目前的 vendor/firebase-sdk.js 沒有打包這兩個函式。
  function watchLedger() {
    if (st.ledgerOff || !me) return;
    st.ledgerOff = onValue(ref(o.db, `ledger/${me}`), (s) => {
      const v = s.val() || {}; st.ledger = v; st.ledgerOk = true; fire('ledger');
    }, () => { st.ledgerOk = false; fire('ledger'); });
  }
  function listen() {
    if (!me) return;
    watch(`wallet/${me}`, 'wallet', (v) => { st.wallet = v && typeof v === 'object' ? v : null; });
    watch(`inv/${me}`, 'inv', (v) => { st.inv = v && typeof v === 'object' ? v : {}; });
    watch(`fxd/${me}`, 'fxq', (v) => { st.fxd = v || {}; });
    watch(`fxw/${me}`, 'fxq', (v) => { st.fxw = v || {}; });
    watch('shop/items', 'items', (v, err) => { st.items = normItems(v); st.itemsOk = !err; });
    watch('shop/sold', 'sold', (v) => { st.sold = v && typeof v === 'object' ? v : {}; });
    watch('bankcfg', 'cfg', (v) => { st.cfg = v && typeof v === 'object' ? v : {}; });
    watch('settings/fx', 'fx', (v) => { st.fx = fxSettings(v); });
    watch('equip', 'equip', (v) => { st.equip = v && typeof v === 'object' ? v : {}; });   // 名單上的同事都讀得到（全站約 200 人、每人 4 格）
  }
  return {
    st,
    listen,
    get balance() { const w = st.wallet; return w && Number.isFinite(w.b) ? w.b : (w && Number.isFinite(w.e) && Number.isFinite(w.s) ? w.e - w.s : 0); },
    get shopOpen() { return st.cfg.shopOpen === true && !(o.openAt && o.nowMs && o.nowMs() < o.openAt); },   // 開關打開＋到了開店時間（K.BANK.shop.openAt）
    get earnPaused() { return st.cfg.pauseEarn === true; },
    /** 打開小舖時呼叫（之後一直監聽） */
    watchLedger,
    /** 看更早的：畫面多顯示 50 筆 */
    moreLedger() { st.ledgerLimit += LEDGER_PAGE; fire('ledger'); },
    /** 換戴／取下（規則只允許戴自己抽屜裡有效的：u 要等於 inv 的 u，永久寫 -1）；value＝null 取下 */
    async setEquip(slot, value) { await update(ref(o.db), { [`equip/${me}/${slot}`]: value }); },
    /** 購買：成功回 { ok, dup, wallet, inv }；失敗丟 ShopError */
    async spend(item, bid) { return o.call('bankSpend', { item, bid }); },
    stop() { st.offs.forEach(f => { try { f(); } catch (e) { /* 略 */ } }); st.offs = []; if (st.ledgerOff) st.ledgerOff(); st.ledgerOff = null; },
  };
}
