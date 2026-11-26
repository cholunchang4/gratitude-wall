// T102：發文時的光效與商店模板（給 fb/writes.js buildCreateMessage 呼叫；規則同一套，見 docs/T102-前端需求給後端.md 第 3 節）。
// - 光效：messages/{mid}/fx＝g；佔 fxd／fxw 格子（mine 記格位）；付費光效同一次寫入 inv/{me}/{g}/n − 1 和 inv/{me}/{g}/m＝mid；季節免費款不扣。
//   選了但不能用（匿名、今天用過、沒有次數、至尊模板）就不帶光效，卡片照樣送出（fxCreatePaths 回 null）。
// - 商店模板：永久或租用中不用扣；只有次數時同一次寫入 n − 1；沒有擁有、匿名 → 擋下並說明（模板是使用者主動選的，不能默默換掉）。
import { fxCreatePaths, tplUse } from './shop-logic.js';
import { SHOP_THEMES } from './shop-catalog.js';

export class ShopWriteError extends Error { constructor(code, message) { super(message); this.code = code; this.status = 403; } }
export const shopThemeOf = (theme, map = SHOP_THEMES) => map[theme] || '';

/**
 * a = { msg, mine, up, me, mid, now, TS, anonymous, theme, fx（選的光效 g）, fxCtx（shop-app.js sendFields 給的狀態）, isAdmin, exists(mid) }
 * 直接改 msg／mine／up。回傳 { fx: 用上的光效 g 或 ''、fxDropped: 選了但沒帶上 }
 */
export function applyShopToCreate(a) {
  const c = a.fxCtx || {};
  const map = c.themes || SHOP_THEMES;
  if (shopThemeOf(a.theme, map) && !a.isAdmin) {
    const u = tplUse(a.theme, c.inv || {}, a.now, { anon: a.anonymous, map });
    if (!u || !u.ok) throw new ShopWriteError(u && u.code === 'ANON' ? 'TPL_ANON' : 'TPL_NONE',
      u && u.code === 'ANON' ? '匿名卡不能用小舖的模板，請換一款樣式，或取消匿名。' : '這款模板的租期到了或次數用完了，請換一款樣式；想再用的話，小舖都在。');
    if (Number.isInteger(u.dec)) { a.up[`inv/${a.me}/${u.g}/n`] = u.dec; a.up[`inv/${a.me}/${u.g}/m`] = a.mid; }   // m：規則確認是同一張新卡
  }
  if (!a.fx) return { fx: '', fxDropped: false };
  const p = fxCreatePaths({ ...c, me: a.me, mid: a.mid, now: a.now, anon: a.anonymous, theme: a.theme, fx: a.fx, TS: a.TS, exists: a.exists || c.exists });
  if (!p) return { fx: '', fxDropped: true };
  a.msg.fx = p.msgFx;
  Object.assign(a.mine, p.mine);
  Object.assign(a.up, p.updates);
  return { fx: p.msgFx, fxDropped: false };
}
