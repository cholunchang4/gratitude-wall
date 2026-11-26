// T102 拾光小舖：自繪 SVG（小螢、燈籠、光瓶、商品縮圖、圖示）。來源：design/拾光小舖/mockup.html（美術總監，可商用、沒有外部圖檔）。
// 只放固定字串與數字，不放使用者資料（呼叫端已經 escape）。
import { T, fmt } from './shop-text.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 共用 <defs>：漸層與圖示只定義一次（重複的 id 會讓瀏覽器參照到藏起來的那一份，見現況 SVG 漸層 id 重複的坑）
export const DEFS_ID = 'shDefs';
export const DEFS = `<svg id="${DEFS_ID}" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<radialGradient id="xfTail" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#fffbe0"/><stop offset=".45" stop-color="#ffe17a"/><stop offset="1" stop-color="#ffb02e"/></radialGradient>
<radialGradient id="xfLamp" cx=".5" cy=".45" r=".65"><stop offset="0" stop-color="#ffe9b0"/><stop offset=".6" stop-color="#ff9a3c"/><stop offset="1" stop-color="#e2602a"/></radialGradient>
<linearGradient id="jarG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8f1ff" stop-opacity=".9"/><stop offset="1" stop-color="#c9daf5" stop-opacity=".9"/></linearGradient>
<symbol id="si-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>
<symbol id="si-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></symbol>
<symbol id="si-shop" viewBox="0 0 24 24"><path d="M4 9.5L5.5 4h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 11.5V20h13v-8.5M10 20v-5h4v5"/></symbol>
<symbol id="si-drawer" viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 12h17M10 8.3h4M10 15.8h4"/></symbol>
<symbol id="si-ledger" viewBox="0 0 24 24"><path d="M6 3.5h10.5A2.5 2.5 0 0 1 19 6v14.5H7.5A2.5 2.5 0 0 1 5 18V4.5"/><path d="M5 18a2 2 0 0 1 2-2h12M9 7.5h6M9 11h6"/></symbol>
<symbol id="si-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></symbol>
<symbol id="si-repeat" viewBox="0 0 24 24"><path d="M4 11V9a3 3 0 0 1 3-3h11l-3-3M20 13v2a3 3 0 0 1-3 3H6l3 3"/></symbol>
<symbol id="si-once" viewBox="0 0 24 24"><path d="M12 3.5l2.2 5.2 5.3.6-4 3.6 1.2 5.3L12 15.4l-4.7 2.8 1.2-5.3-4-3.6 5.3-.6z"/></symbol>
<symbol id="si-home" viewBox="0 0 24 24"><path d="M3.5 11.5L12 4l8.5 7.5"/><path d="M6 10v9.5h12V10"/><path d="M10 19.5v-5h4v5"/></symbol>
<symbol id="si-snow" viewBox="0 0 24 24"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5"/></symbol>
<symbol id="si-lock" viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></symbol>
<symbol id="si-alert" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.8v5M12 16.2h.01"/></symbol>
<symbol id="si-send" viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/></symbol>
<symbol id="si-bag" viewBox="0 0 24 24"><path d="M5.5 8h13l-1 12h-11z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></symbol>
<symbol id="si-gift" viewBox="0 0 24 24"><rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9c-1.5-3-5-3.5-5-1.5S10 9 12 9zm0 0c1.5-3 5-3.5 5-1.5S14 9 12 9z"/></symbol>
<symbol id="si-undo" viewBox="0 0 24 24"><path d="M9 7L4.5 11.5 9 16"/><path d="M5 11.5h9a5.5 5.5 0 0 1 0 11h-2"/></symbol>
<symbol id="si-heart" viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9-9c-1.4-3.2.6-7 4.2-7 2 0 3.4 1.1 4.8 2.8C13.4 5.1 14.8 4 16.8 4c3.6 0 5.6 3.8 4.2 7-2 4.6-9 9-9 9z"/></symbol>
<symbol id="si-eye" viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></symbol>
<symbol id="si-book" viewBox="0 0 24 24"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11a1 1 0 0 1 1 1v15a2 2 0 0 0-2-2H4z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13a1 1 0 0 0-1 1v15a2 2 0 0 1 2-2h6z"/></symbol>
<symbol id="si-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.1-2.4 3.6M12 16.8h.01"/></symbol>
<symbol id="si-card" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M7 10h10M7 14h6"/></symbol>
<symbol id="si-user" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="10" r="3"/><path d="M6.6 18a6 6 0 0 1 10.8 0"/></symbol>
<symbol id="si-tag" viewBox="0 0 24 24"><path d="M3.5 12.5V5a1.5 1.5 0 0 1 1.5-1.5h7.5L21 12l-8.5 8.5z"/><circle cx="8" cy="8" r="1.4"/></symbol>
<symbol id="si-pen" viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></symbol>
<symbol id="si-cal" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></symbol>
<symbol id="si-mask" viewBox="0 0 24 24"><path d="M3 8.5c3-1.5 6-1.5 9 0 3-1.5 6-1.5 9 0v2.5c0 4-3 6.5-5.5 6.5-1.8 0-2.6-1.6-3.5-1.6s-1.7 1.6-3.5 1.6C6 17.5 3 15 3 11z"/><path d="M7 11.5h2.5M14.5 11.5H17"/></symbol>
<symbol id="si-corner" viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="16" cy="15" r="2.6"/></symbol>
<symbol id="si-chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></symbol>
<symbol id="lf-firefly" viewBox="0 0 12 12"><ellipse cx="3.6" cy="4.4" rx="2.4" ry="1.6" fill="#c7d7ef" transform="rotate(-25 3.6 4.4)"/><ellipse cx="8.4" cy="4.4" rx="2.4" ry="1.6" fill="#c7d7ef" transform="rotate(25 8.4 4.4)"/><circle cx="6" cy="7" r="2.6" fill="#f2a20f"/><circle cx="6" cy="7" r="1.2" fill="#fff3c4"/></symbol>
<symbol id="lf-stream" viewBox="0 0 12 12"><path d="M1.5 9.5C4 8 6.5 5.5 8.5 2.5" stroke="#e39a10" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="9" cy="2.6" r="2" fill="#f2a20f"/></symbol>
<symbol id="lf-snow" viewBox="0 0 12 12"><path d="M6 1v10M1.7 3.5l8.6 5M1.7 8.5l8.6-5" stroke="#4f7fc4" stroke-width="1.4" stroke-linecap="round"/></symbol>
<symbol id="lf-frost" viewBox="0 0 12 12"><rect x="3.4" y="3" width="5.2" height="6.4" rx="2.4" fill="#ffd68a" stroke="#6f8fbf" stroke-width="1"/><path d="M6 1.2V3M4.6 9.6h2.8" stroke="#6f8fbf" stroke-width="1" stroke-linecap="round"/></symbol>
</defs></svg>`;
/** 確保頁面上有一份共用 defs */
export function ensureDefs(doc = document) { if (!doc.getElementById(DEFS_ID)) doc.body.insertAdjacentHTML('afterbegin', DEFS); }

export const ic = (id, cls = '') => `<svg class="ico ${cls}" aria-hidden="true" focusable="false"><use href="#si-${id}"/></svg>`;
export const dot = (light = true) => `<span class="lp-dot ${light ? 'on-light' : ''}" aria-hidden="true"></span>`;
export const fxIcon = (style) => `<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><use href="#lf-${esc(style)}"/></svg>`;

/** 小螢：mood＝smile／happy／sleepy／point */
export function xiaoying(mood = 'smile', cls = 'is-bob', label = T.keeper) {
  const eyes = mood === 'happy' ? '<path d="M48 41q4-5 8 0M64 41q4-5 8 0" stroke="#1b1530" stroke-width="2.6" fill="none" stroke-linecap="round"/>'
    : mood === 'sleepy' ? '<path d="M47 42h9M64 42h9" stroke="#1b1530" stroke-width="2.6" stroke-linecap="round"/>'
    : '<circle cx="52" cy="41" r="5.6" fill="#fff"/><circle cx="68" cy="41" r="5.6" fill="#fff"/><circle cx="53" cy="42" r="3.3" fill="#1b1530"/><circle cx="69" cy="42" r="3.3" fill="#1b1530"/><circle cx="54.3" cy="40.4" r="1.2" fill="#fff"/><circle cx="70.3" cy="40.4" r="1.2" fill="#fff"/>';
  const mouth = mood === 'sleepy' ? '<ellipse cx="60" cy="52" rx="2.4" ry="1.8" fill="#7a2e3c"/>' : '<path d="M55 50q5 5 10 0" stroke="#7a2e3c" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
  const zz = mood === 'sleepy' ? '<text x="86" y="24" font-size="13" font-weight="800" fill="#ffd98a" font-family="sans-serif">z</text><text x="96" y="14" font-size="10" font-weight="800" fill="#ffd98a" font-family="sans-serif">z</text>' : '';
  const arm = mood === 'point'
    ? '<path d="M71 66q12-2 20-12" stroke="#4b3d78" stroke-width="3.4" fill="none" stroke-linecap="round"/><circle cx="92" cy="53" r="3" fill="#4b3d78"/>'
    : '<path d="M50 70q-12 4-16 14" stroke="#4b3d78" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M34 84v6" stroke="#8a5a2a" stroke-width="1.6"/><g class="lamp"><rect x="26" y="90" width="16" height="19" rx="6" fill="url(#xfLamp)"/><rect x="29" y="88" width="10" height="3" rx="1.4" fill="#8a4b1a"/><rect x="29" y="108" width="10" height="3" rx="1.4" fill="#8a4b1a"/><path d="M34 92v15" stroke="rgba(140,60,10,.35)"/></g>';
  return `<svg class="xf ${cls}" viewBox="0 0 120 120" role="img" aria-label="${esc(label)}">`
    + '<ellipse cx="40" cy="58" rx="13" ry="22" transform="rotate(-32 40 58)" fill="rgba(220,232,255,.55)" stroke="rgba(255,255,255,.8)"/>'
    + '<ellipse cx="80" cy="58" rx="13" ry="22" transform="rotate(32 80 58)" fill="rgba(220,232,255,.55)" stroke="rgba(255,255,255,.8)"/>'
    + '<ellipse class="tail" cx="60" cy="90" rx="14" ry="16" fill="url(#xfTail)"/><path d="M47 86q13 5 26 0M48 94q12 4 24 0" stroke="rgba(180,110,10,.35)" stroke-width="1.4" fill="none"/>'
    + '<ellipse cx="60" cy="68" rx="12" ry="11" fill="#4b3d78"/><path d="M52 22q-6-9-10-12M68 22q6-9 10-12" stroke="#4b3d78" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
    + '<circle cx="41" cy="9.5" r="3.4" fill="#ffd27a"/><circle cx="79" cy="9.5" r="3.4" fill="#ffd27a"/><circle cx="60" cy="42" r="20" fill="#5b4b8c"/><ellipse cx="60" cy="47" rx="15" ry="11" fill="#6a5a9c" opacity=".55"/>'
    + `${eyes}<ellipse cx="45" cy="49" rx="3.6" ry="2.4" fill="#ff9fb4" opacity=".75"/><ellipse cx="75" cy="49" rx="3.6" ry="2.4" fill="#ff9fb4" opacity=".75"/>${mouth}${arm}${zz}</svg>`;
}
export function lantern(cls = '') {
  return `<svg class="${cls}" viewBox="0 0 34 40" aria-hidden="true" focusable="false"><circle class="glow" cx="17" cy="22" r="16" fill="rgba(255,190,90,.45)"/><path d="M17 1v4" stroke="#8a4b1a" stroke-width="1.6"/>`
    + '<rect x="9" y="5" width="16" height="3" rx="1.4" fill="#8a4b1a"/><rect x="6.5" y="8" width="21" height="24" rx="9" fill="url(#xfLamp)"/><path d="M13 9v22M21 9v22" stroke="rgba(140,60,10,.3)"/>'
    + '<rect x="9" y="32" width="16" height="3" rx="1.4" fill="#8a4b1a"/><path d="M17 35v4" stroke="#c9184a" stroke-width="1.6"/></svg>';
}
export function jar(n = 6) {
  const d = [[13, 25], [18, 27], [10, 21], [16, 21], [21, 22], [13, 16], [19, 16], [16, 12]].slice(0, n);
  return '<svg viewBox="0 0 30 34" aria-hidden="true" focusable="false"><rect x="10" y="1.5" width="10" height="5" rx="1.5" fill="#b07a3c"/>'
    + '<path d="M9 6.5h12v3c4 1.5 6 4.5 6 8.5v9a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-9c0-4 2-7 6-8.5z" fill="url(#jarG)" stroke="#7d93b8" stroke-width="1.2"/>'
    + d.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.3" fill="#ffc24a"/>`).join('') + '</svg>';
}
export const pack = () => '<div class="pack" aria-hidden="true"><svg class="box" viewBox="0 0 58 70"><rect x="4" y="12" width="50" height="54" rx="14" fill="url(#xfLamp)"/><rect x="14" y="4" width="30" height="10" rx="3" fill="#8a4b1a"/><path class="ribbon" d="M29 12v54M4 38h50" stroke="#c9184a" stroke-width="4"/></svg>'
  + Array.from({ length: 6 }, (_, i) => `<i style="--i:${i}"></i>`).join('') + '</div>';

// ---------------------------------------------------------------- 縮圖（商品卡、抽屜、後台、確認框）
const LAYERS = { firefly: 4, stream: 0, snow: 5, frost: 4 };
/** 光效的圖層（卡片裡的 .lx-layer） */
export const fxLayer = (style) => `<span class="lx-layer" aria-hidden="true">${'<i></i>'.repeat(LAYERS[style] ?? 0)}</span>`;
export const fxBadge = (style) => `<span class="lx-ic${style === 'snow' || style === 'frost' ? ' is-cool' : ''}" role="img" aria-label="${esc((T.fxNames[style] || '') + '光效')}">${fxIcon(style)}</span>`;
const THEME_CLS = { 'theme-lamp': 't-lamp', 'theme-snowlantern': 't-snowlantern' };
export function miniCard(themeCls = '', style = '', live = true) {
  const fx = style ? ` lx lx-${style}${live && style !== 'frost' ? ' lx-live' : ''}` : '';
  return `<div class="sh-mini ${themeCls}${fx}">${style ? fxLayer(style) + `<span class="lx-ic" aria-hidden="true">${fxIcon(style)}</span>` : ''}<div class="to">To: 王小明</div><div class="ln"></div><div class="ln s"></div></div>`;
}
const stamps = (t, cols = ['#c9184a', '#b45309', '#2f6b48']) => `<div class="sh-stamps">${t.map((s, i) => `<span style="border-color:${cols[i % 3]};color:${cols[i % 3]};transform:rotate(${[-8, 4, -3][i % 3]}deg)">${s}</span>`).join('')}</div>`;
const bgwin = (frost) => `<svg viewBox="0 0 120 80" width="116" aria-hidden="true"><rect x="2" y="2" width="116" height="76" rx="12" fill="${frost ? '#e9f1fb' : '#fff3dc'}"/><rect x="34" y="12" width="52" height="56" rx="6" fill="${frost ? '#cfe0f4' : '#ffe0a3'}" stroke="#a8693a" stroke-width="3"/><path d="M60 12v56M34 40h52" stroke="#a8693a" stroke-width="3"/>${frost ? '<path d="M40 20l6 6M44 18l-2 8M70 50l6 6M74 48l-2 8" stroke="#fff" stroke-width="2"/>' : '<path d="M86 20L118 6v30z" fill="rgba(255,210,120,.5)"/>'}</svg>`;
const halo = (warm) => `<span class="sh-halo${warm ? ' is-warm' : ''}"><span>曉雯</span></span>`;
const title = (t) => `<span class="sh-title"><i>雯</i>周曉雯 <b>${t}</b></span>`;
const ticket = () => '<svg viewBox="0 0 120 70" width="112" aria-hidden="true"><path d="M8 10h104v16a9 9 0 0 0 0 18v16H8V44a9 9 0 0 0 0-18z" fill="#fff" stroke="#e3c08e" stroke-width="2"/><path d="M40 12v46" stroke="#e3c08e" stroke-dasharray="4 4"/><text x="76" y="44" text-anchor="middle" font-size="22" font-weight="800" fill="#8a4b0a" font-family="sans-serif">×3</text><rect x="14" y="22" width="20" height="26" rx="4" fill="#fff8ea" stroke="#f0d9b5"/></svg>';
const badge = () => '<svg viewBox="0 0 60 60" width="56" aria-hidden="true"><circle cx="30" cy="30" r="26" fill="#fff3e2" stroke="#e9a23b" stroke-width="2.5"/><path d="M16 30h28a14 14 0 0 1-28 0z" fill="#c9184a"/><circle cx="25" cy="27" r="5" fill="#fff"/><circle cx="35" cy="27" r="5" fill="#ffd1dc"/><path d="M30 10v6" stroke="#ff9a3c" stroke-width="3" stroke-linecap="round"/></svg>';
const tangyuan = () => '<svg viewBox="0 0 60 50" width="64" aria-hidden="true"><path d="M8 24h44a22 22 0 0 1-44 0z" fill="#fff" stroke="#e3c08e" stroke-width="2"/><circle cx="24" cy="22" r="7" fill="#fff" stroke="#f0d9b5"/><circle cx="36" cy="21" r="7" fill="#ffd1dc"/><path d="M20 8q2-4 0-7M30 8q2-4 0-7M40 8q2-4 0-7" stroke="#d9c3a0" stroke-width="1.6" fill="none"/></svg>';
const idea = () => '<div class="sh-idea">謝謝你那天在<u>＿＿</u>的時候<u>＿＿</u>⋯</div>';
/** 商品（或抽屜一列）的縮圖。it＝{ sku?, g, ty, fx, th, c } */
export function thumbOf(it, { ticketCard = false, live = true } = {}) {
  if (!it) return '';
  if (ticketCard) return ticket();
  const g = it.g || it.sku || '';
  switch (it.ty) {
    case 'fx': {
      const card = miniCard(it.fx === 'snow' ? 't-midnight' : '', it.fx, live);
      return it.c > 1 ? `<div class="sh-pack">${card}<span class="sh-cnt">×${Number(it.c) || ''}</span></div>` : card;
    }
    case 'tpl': return `<div class="sh-pack">${miniCard(THEME_CLS[it.th] || '')}${it.th === 'theme-snowlantern' ? '<svg viewBox="0 0 20 24" width="18" class="sh-lampmark" aria-hidden="true"><rect x="3" y="3" width="14" height="17" rx="6" fill="url(#xfLamp)"/></svg>' : ''}${it.k === 'pack' && it.c > 1 ? `<span class="sh-cnt">×${it.c}</span>` : ''}</div>`;
    case 'seal': return g === 'st_field' ? stamps(['一次<br>修好', '及時<br>救援', '客戶<br>笑了']) : g === 'st_winter' ? stamps(['熱可可', '圍巾']) : stamps(['謝謝<br>你在', '救援<br>成功', '超給力']);
    case 'idea': return idea();
    case 'halo': return halo(g === 'halo_candle');
    case 'bg': return bgwin(g === 'bg_frost');
    case 'title': return title(g === 'ttl_winter' ? '冬夜守燈人' : '清晨巡燈人');
    case 'badge': return badge();
    case 'gift': return tangyuan();
    default: return '';
  }
}
/** 小框（抽屜、後台）用縮小版：--k 縮放倍率 */
export const smallThumb = (it, k = 0.5, o) => `<div class="sc" style="--k:${k}">${thumbOf(it, o)}</div>`;
export const TYPE_ICON = { perm: 'home', rent: 'clock', pack: 'repeat', once: 'once' };
export const typeIcon = (it) => ic(it.k === 'perm' ? 'home' : it.k === 'rent' ? 'clock' : it.c === 1 ? 'once' : 'repeat');

// ==================================================================== 6.6 真實小樣（design/拾光小舖-預覽/設計規格.md 第 2 節）
// 用牆上真正的卡片 class（.message-card.card、.eq-tt、.eq-ha-*、.eq-bg-*、.lx-*），縮放用 --pvs（不是 --s，手機 app.css 會把 --s 鎖成 1）。
// 只放固定字串＋escape 過的本人姓名、縮寫、顏色、最近一張卡的文字；不放價格。
// me＝{ name, ini, color, photo }（photo＝data:image 或 https 網址，沒有就空字串）；rc＝{ text, to }
export const HEART = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 20s-7-4.4-9-9c-1.4-3.2.6-7 4.2-7 2 0 3.4 1.1 4.8 2.8C13.4 5.1 14.8 4 16.8 4c3.6 0 5.6 3.8 4.2 7-2 4.6-9 9-9 9z"/></svg>';
export const BADGE_ART = '<svg viewBox="0 0 60 60" aria-hidden="true" focusable="false"><circle cx="30" cy="30" r="26" fill="#fff3e2" stroke="#e9a23b" stroke-width="3"/><path d="M16 30h28a14 14 0 0 1-28 0z" fill="#c9184a"/><circle cx="25" cy="27" r="5" fill="#fff"/><circle cx="35" cy="27" r="5" fill="#ffd1dc"/></svg>';
const TANG_ART = '<svg viewBox="0 0 60 50" aria-hidden="true" focusable="false"><path d="M8 24h44a22 22 0 0 1-44 0z" fill="#fff" stroke="#e3c08e" stroke-width="2.5"/><path d="M8 24h44" stroke="#c9184a" stroke-width="3"/><circle cx="24" cy="21" r="7" fill="#fff" stroke="#f0d9b5" stroke-width="1.5"/><circle cx="36" cy="20" r="7" fill="#ffd1dc"/><path d="M20 9q2-4 0-7M30 9q2-4 0-7M40 9q2-4 0-7" stroke="#d9c3a0" stroke-width="1.8" fill="none"/></svg>';
export const SEAL_COLORS = ['#c9184a', '#b45309', '#2f6b48'];
/** 光印的字（T.sealFaces，\n 換行）→ { t（HTML）, c（顏色）} */
export function sealFace(g, i = 0) {
  const list = T.sealFaces[g] || T.sealFaces.st_basic;
  const k = Math.max(0, Math.min(list.length - 1, Number(i) || 0));
  return { t: esc(list[k]).replace(/\n/g, '<br>'), c: SEAL_COLORS[k % 3], label: list[k].replace(/\n/g, '') };
}
const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : '#7c3aed');
export const safePhoto = (u) => (typeof u === 'string' && (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(u) || /^https:\/\//i.test(u)) ? u : '');
/** 卡片作者列的頭像（.av） */
export const avHtml = (me = {}) => (safePhoto(me.photo) ? `<img class="av" src="${esc(me.photo)}" alt="">`
  : `<i class="av" style="background:${safeColor(me.color)}" aria-hidden="true">${esc(me.ini)}</i>`);
/** 資料卡用的圓頭像（.pav）；sz＝0 時不寫行內大小（迷你說明書要靠 --k 縮放，見設計規格第 11 節第 2 點） */
export const pavHtml = (me = {}, sz = 0, ha = '') => `<span class="pav${safePhoto(me.photo) ? ' is-photo' : ''}${ha ? ` eq-ha eq-ha-${esc(ha)}` : ''}" style="${sz ? `--size:${Number(sz)}px;` : ''}${safePhoto(me.photo) ? '' : `background:${safeColor(me.color)}`}" aria-hidden="true">${safePhoto(me.photo) ? `<img src="${esc(me.photo)}" alt="">` : esc(me.ini)}</span>`;

/**
 * 真實卡片小樣。o = { me, rc, th（卡片 class，例如 t-classic）, fx（光效樣式）, fxm（frame 靜態幀｜live｜still｜''）, s（縮放）, w（寬 px）, rot, ln（行數）,
 *   eq: { ha（光環代號 dawn）, tt（稱號文字）, bd（true＝戴徽章） }, seal: sealFace(), gift, likes, strip（只有名字列）, noLike, pv（詳情主預覽，加 data-pv） }
 */
export function realCard(o = {}) {
  const me = o.me || {}, rc = o.rc || {};
  const { th = 't-classic', fx = '', fxm = 'frame', s = 1, w = 0, rot = 0, ln = 2, eq = {}, seal = null, gift = false, likes = 3, strip = false, noLike = false, pv = false } = o;
  const fxCls = fx ? ` lx lx-${esc(fx)}${fxm === 'live' ? ' lx-live' : ''}${fxm === 'frame' ? ' pv-frame' : ''}` : '';
  const layer = fx ? fxLayer(fx) + `<span class="lx-ic${fx === 'snow' || fx === 'frost' ? ' is-cool' : ''}" aria-hidden="true">${fxIcon(fx)}</span>` : '';
  const extra = (eq.tt ? `<span class="eq-tt">${esc(eq.tt)}</span>` : '') + (eq.bd ? `<span class="eq-bd" aria-hidden="true">${BADGE_ART}</span>` : '');
  const foot = `<div class="card-foot"><span class="author${eq.ha ? ` eq-ha eq-ha-${esc(eq.ha)}` : ''}">${avHtml(me)}<span>${esc(me.name)}</span>${extra}</span>${noLike ? '' : `<span class="like">${HEART}${Number(likes) || 0}</span>`}</div>`;
  const st = `--pvs:${Number(s)};${w ? `--w:${Number(w)}px;` : ''}--rot:${Number(rot)}deg;--ln:${Number(ln)}`;
  if (strip) return `<div class="message-card card ${esc(th)} pv-c pv-strip" style="${st}" aria-hidden="true">${foot}</div>`;
  return `<div class="message-card card ${esc(th)}${fxCls} pv-c"${pv ? ' data-pv="1"' : ' aria-hidden="true"'} style="${st}">${layer}${gift ? `<span class="pv-gift">${TANG_ART}</span>` : ''}`
    + `<div class="card-to">To: ${esc(rc.to)}</div><p class="card-text">${esc(rc.text)}</p>${foot}${seal ? `<span class="pv-seal" style="--sc:${seal.c}">${seal.t}</span>` : ''}</div>`;
}
/** 迷你說明書 3×3（中間是頭像＋姓名）。filled＝寫了幾格（0～8；null＝不知道，全部畫成有寫） */
export function pcMini({ me = {}, bg = '', ha = '', k = 1, filled = null } = {}) {
  const n = Number.isInteger(filled) ? filled : 8;
  const cell = (i) => `<span class="cl${i >= n ? ' is-empty' : ''}"><i></i><b></b><u></u><u></u></span>`;
  const cells = [0, 1, 2, 3].map(cell).join('') + `<span class="id">${pavHtml(me, 0, ha)}<strong>${esc(me.name)}</strong><small>${esc(T.myCard)}</small></span>` + [4, 5, 6, 7].map(cell).join('');
  return `<div class="pv-pc${bg ? ` eq-bg-${esc(bg)}` : ''}" style="--k:${Number(k)}" aria-hidden="true">${cells}</div>`;
}
const ideaHtml = (s) => esc(s).replace(/＿＿/g, '<u></u>');
/** 迷你撰寫區＋「小螢給你的開頭句」（前 n 句） */
export function composerMini({ k = 1, n = 3, pop = true } = {}) {
  const all = T.ideas;
  return `<div class="pv-cp" style="--k:${Number(k)}" aria-hidden="true">${pop ? `<div class="pop"><h5>${dot()}${esc(T.ideaPop.h)}</h5><ol>${all.slice(0, n).map(t => `<li>${ideaHtml(t)}</li>`).join('')}</ol>${n < all.length ? `<div class="more">${esc(fmt(T.ideaPop.more, { n: all.length - n }))}</div>` : ''}</div>` : ''}`
    + `<div class="bar"><span class="idea">${dot()}${esc(T.ideaPop.btn)}</span><span class="fld">${esc(T.ideaPop.field)}</span><span class="snd">${esc(T.ideaPop.send)}</span></div></div>`;
}
/** 放大鏡（以左下角定位，放在卡片下方，虛線指回去） */
export const lensB = (inner, x, b, z = 60, tag = '') => `<span class="pv-lens" style="left:${x}px;bottom:${b}px;--lz:${z}px" aria-hidden="true">${inner}</span>${tag ? `<span class="pv-lens-tag" style="left:${x + z + 8}px;bottom:${b + z / 2}px;transform:translateY(50%)" aria-hidden="true">${esc(tag)}</span>` : ''}`;
/** 放大鏡（以左上角定位，店面徽章縮圖用） */
export const lensT = (inner, x, y, z = 56) => `<span class="pv-lens" style="left:${x}px;top:${y}px;--lz:${z}px" aria-hidden="true">${inner}</span>`;
/** 用在哪裡：[圖示, 文字 key] */
export function whereOf(it) {
  switch (it && it.ty) {
    case 'halo': return ['user', 'halo'];
    case 'title': case 'badge': return ['tag', 'name'];
    case 'bg': return ['book', 'pc'];
    case 'idea': return ['lock', 'me'];
    case 'seal': case 'gift': return ['corner', 'corner'];
    default: return ['card', 'card'];
  }
}
export const whereHtml = (it) => { const [i, k] = whereOf(it); return `<span class="pv-where${k === 'me' ? ' is-me' : ''}" aria-hidden="true">${ic(i)}${esc(T.where[k])}</span>`; };
const firstTitle = (g) => (T.titles[g] || T.titles.ttl_pick)[0];
/**
 * 店面格子的真實小樣（設計規格第 3 節表格）。c＝buildShelves 的商品卡（或 { ty, g, fx, th, c, k, featured }）；
 * ctx＝{ me, rc, mobile, themeOf(th)→class }
 */
export function realThumb(c, ctx = {}) {
  const it = c.featured || c, me = ctx.me || {}, rc = ctx.rc || {};
  const m = !!ctx.mobile, s = m ? 0.56 : 0.6, w = m ? 138 : 150;
  const base = { me, rc, s, w, rot: -2 };
  const cls = (th) => (ctx.themeOf && ctx.themeOf(th)) || THEME_CLS[th] || 't-classic';
  if (c.ticket) {
    const ths = [...new Set((c.offers || []).map(x => x.th))].slice(0, 2);
    const a = ths[1] || 'theme-snowlantern', b = ths[0] || 'theme-lamp';
    return `<div class="pv-fan">${realCard({ ...base, th: cls(a), s: 0.5, w: 124, rot: 6 })}${realCard({ ...base, th: cls(b), s: 0.5, w: 124, rot: -6 })}<span class="sh-cnt pv-fan-n">×${Number(it.c) || 3}</span></div>`;
  }
  switch (it.ty) {
    case 'fx': { const card = realCard({ ...base, fx: it.fx, th: it.fx === 'snow' ? 't-midnight' : 't-classic' }); return it.c > 1 ? `<div class="sh-pack">${card}<span class="sh-cnt">×${Number(it.c)}</span></div>` : card; }
    case 'tpl': return realCard({ ...base, th: cls(it.th) });
    case 'bg': return pcMini({ me, bg: String(it.g || '').replace(/^bg_/, ''), k: m ? 0.42 : 0.46 });
    case 'halo': return `<div class="pv-halo">${pavHtml(me, 52, String(it.g || '').replace(/^halo_/, ''))}<span>${esc(me.name)}</span></div>`;
    case 'title': return realCard({ ...base, strip: true, noLike: true, s: m ? 0.92 : 1.1, w: m ? 156 : 176, rot: 0, eq: { tt: firstTitle(it.g) } });
    case 'badge': return `<div class="pv-wrap pv-bdw">${realCard({ ...base, strip: true, noLike: true, s: m ? 0.92 : 1.1, w: m ? 112 : 128, rot: 0, eq: { bd: true } })}${lensT(BADGE_ART, m ? 82 : 96, -36, 38)}</div>`;
    case 'idea': return composerMini({ k: m ? 0.52 : 0.56, n: 2 });
    case 'seal': return realCard({ ...base, seal: sealFace(it.g, 0) });
    case 'gift': return realCard({ ...base, gift: true });
    default: return thumbOf(it);
  }
}
