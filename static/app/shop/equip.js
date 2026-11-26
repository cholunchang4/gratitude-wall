// T102 戴在身上的東西（equip/{uid}/{bd|ha|bg|tt}，docs/光點帳本規格.md 14.4）：
// - 稱號（tt）、徽章（bd）：具名卡的作者名旁，一個小字膠囊＋一枚小徽章；匿名、假面卡一律不顯示。
// - 頭像光環（ha）：卡片作者頭像外圈一道細光環；資料卡檢視的大頭像也有。
// - 說明書背景（bg）：資料卡檢視的底。
// - 到期：u != -1 && u < now 就當作沒戴（equip 不會自動清）。顯示要克制：不加動畫、不壓過卡片內容。
import { T, fmt } from './shop-text.js';
import { esc } from './shop-art.js';

export const SLOTS = Object.freeze({ bd: 'bd_', ha: 'halo_', bg: 'bg_', tt: 'ttl_' });
export const SLOT_OF_TY = Object.freeze({ badge: 'bd', halo: 'ha', bg: 'bg', title: 'tt' });
const ID = /^[a-z0-9_]{1,40}$/;

/** 一個人的 equip → 只留有效的格子 { bd?, ha?, bg?, tt? }（每格 { g, u, i? }） */
export function activeEquip(raw, now) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [slot, pre] of Object.entries(SLOTS)) {
    const v = raw[slot];
    if (!v || typeof v !== 'object' || typeof v.g !== 'string' || !ID.test(v.g) || !v.g.startsWith(pre)) continue;
    const u = Number(v.u);
    if (!Number.isFinite(u) || (u !== -1 && u < now)) continue;
    out[slot] = { g: v.g, u, ...(slot === 'tt' ? { i: Number.isInteger(v.i) && v.i >= 0 && v.i < 10 ? v.i : 0 } : {}) };
  }
  return out;
}
/** 稱號文字：自選稱號 10 款（i）、季節稱號 1 款 */
export function titleText(tt) {
  if (!tt) return '';
  const list = T.titles[tt.g] || null;
  if (!list) return '';
  const i = Number.isInteger(tt.i) && tt.i >= 0 && tt.i < list.length ? tt.i : 0;
  return list[i] || '';
}
/** 卡片作者要不要顯示（匿名、假面、沒有作者 id 的卡不顯示） */
export const showsEquip = (msg) => !!(msg && msg.authorKey && !msg.anonymous);

// 卡寬估算（給 app.js scCalcWidth）：稱號膠囊＋徽章＋間距，最多 56（都乘卡片縮放 s）。只用 canvas 量字，不碰版面
let measureCtx = null;
export const EQ_MAX_EXTRA = 56;
export function equipWidth(eq, s = 1, measure) {
  const t = titleText(eq.tt);
  if (!t && !eq.bd) return 0;
  let w = 0;
  if (t) {
    let tw = t.length * 10 * s;   // 量不到時：每字 10px
    if (measure) tw = measure(t, 10 * s);
    else if (typeof document !== 'undefined') {
      try { measureCtx = measureCtx || document.createElement('canvas').getContext('2d'); measureCtx.font = `700 ${10 * s}px "Segoe UI","Noto Sans TC","Microsoft JhengHei",sans-serif`; tw = measureCtx.measureText(t).width; } catch (e) { /* 用估計值 */ }
    }
    w += tw + 12 * s + 2 * s;   // 左右內距 6＋6、和名字的間距 2
  }
  if (eq.bd) w += 14 * s + 2 * s;
  return Math.min(w, EQ_MAX_EXTRA * s);
}
const BADGE_SVG = '<svg viewBox="0 0 60 60" aria-hidden="true" focusable="false"><circle cx="30" cy="30" r="26" fill="#fff3e2" stroke="#e9a23b" stroke-width="3"/><path d="M16 30h28a14 14 0 0 1-28 0z" fill="#c9184a"/><circle cx="25" cy="27" r="5" fill="#fff"/><circle cx="35" cy="27" r="5" fill="#ffd1dc"/></svg>';
/** 名字旁的稱號＋徽章（HTML，固定內容＋escape 過的稱號） */
export function nameExtraHtml(eq) {
  let h = '';
  const t = titleText(eq.tt);
  if (t) h += `<span class="eq-tt" title="${esc(t)}">${esc(t)}</span>`;
  if (eq.bd) h += `<span class="eq-bd" role="img" aria-label="${esc(fmt(T.eq.badgeAria, { name: T.badgeNames[eq.bd.g] || '' }))}">${BADGE_SVG}</span>`;
  return h;
}
export const haloClass = (eq) => (eq.ha ? ` eq-ha eq-ha-${eq.ha.g.replace(/^halo_/, '')}` : '');
export const bgClass = (eq) => (eq.bg ? ` eq-bg eq-bg-${eq.bg.g.replace(/^bg_/, '')}` : '');

/**
 * o = { get(uid) → equip 原始值, nowMs() }
 * apply(card, msg)：卡片作者旁加稱號、徽章、光環（每次 applyCardContent 之後叫；可以重複叫）
 */
export function createEquipView(o) {
  // 稱號放不下（膠囊至少 3.2em，作者列因此溢出）就整個不顯示，不要壓成細色塊；卡片尺寸變了（放大、重排）再判斷一次
  const RO = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => { for (const e of es) mark(e.target); }) : null;
  function mark(card) {
    if (!card.isConnected) return;
    const a = card.querySelector('.author'); card.classList.remove('eq-narrow');
    if (a && a.querySelector('.eq-tt') && a.clientWidth > 0 && a.scrollWidth > a.clientWidth + 1) card.classList.add('eq-narrow');
  }
  function apply(card, msg) {
    if (!card) return;
    const a = card.querySelector('.author'); if (!a) return;
    a.querySelectorAll('.eq-tt, .eq-bd').forEach(n => n.remove());
    a.className = a.className.replace(/\s*\beq-ha(-[a-z0-9_]+)?\b/g, '');
    if (!showsEquip(msg)) return;
    const eq = activeEquip(o.get(msg.authorKey), o.nowMs());
    const extra = nameExtraHtml(eq);
    if (extra) {
      const name = a.querySelector(':scope > span'); if (name) name.insertAdjacentHTML('afterend', extra); else a.insertAdjacentHTML('beforeend', extra);
      if (eq.tt) { mark(card); if (RO && !card._eqRO) { card._eqRO = true; RO.observe(card); } }
    }
    const h = haloClass(eq).trim(); if (h) a.classList.add(...h.split(/\s+/));
  }
  /** 清單列：名字旁的稱號（小字）＋徽章 */
  function listHtml(msg) { if (!showsEquip(msg)) return ''; return nameExtraHtml(activeEquip(o.get(msg.authorKey), o.nowMs())); }
  /** 資料卡檢視：背景與大頭像光環（profile-ui.js 畫完後叫） */
  function viewer(el, uid) {
    const box = el && el.querySelector('.pc-box'); if (!box) return;
    box.className = box.className.replace(/\s*\beq-bg(-[a-z0-9_]+)?\b/g, '');
    const eq = activeEquip(o.get(uid), o.nowMs());
    const b = bgClass(eq).trim(); if (b) box.classList.add(...b.split(/\s+/));
    box.querySelectorAll('.pc-id .pav, .pc-empty > .pav').forEach(p => { p.className = p.className.replace(/\s*\beq-ha(-[a-z0-9_]+)?\b/g, ''); const h = haloClass(eq).trim(); if (h) p.classList.add(...h.split(/\s+/)); });
  }
  /** app.js 算卡寬用：匿名卡、沒戴稱號／徽章回 0 */
  function width(msg, s) { if (!showsEquip(msg)) return 0; return equipWidth(activeEquip(o.get(msg.authorKey), o.nowMs()), s); }
  return { apply, listHtml, viewer, width };
}
