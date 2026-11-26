// 6.6 拾光小舖：詳情「套在你身上」預覽、商品圖鑑、小螢帶你逛一圈（畫面 HTML，純函式）。
// 設計：design/拾光小舖-預覽/設計規格.md 第 4～6 節、mockup.html；文字：shop-text.js（文案定稿）。
// 只用固定字串＋escape 過的本人姓名、縮寫、顏色、最近一張卡的文字（店是個人畫面，別人看不到）。
// ctx = { me: { name, ini, color, photo }, rc: { text, to }, mobile, now, themeOf(th)→卡片 class, cardCls（最近一張卡的 class）, pre（櫥窗期） }
import { T, fmt } from './shop-text.js';
import { fmtShort } from './shop-logic.js';
import { esc, ic, fxIcon, xiaoying, realCard, pcMini, composerMini, lensB, pavHtml, sealFace, BADGE_ART, realThumb } from './shop-art.js';

// ---------------------------------------------------------------- 詳情：每一類的預覽分頁
export const VIEWS = Object.freeze({ fx: ['live', 'static', 'list'], tpl: ['live', 'list'], halo: ['card', 'pc'], title: ['card', 'list'], badge: ['card', 'list'], bg: ['pc'], idea: ['cp'], seal: ['card'], gift: ['card'] });
export const CMP_TY = new Set(['halo', 'bg']);
export const viewLabel = (ty, v) => (ty === 'fx' || ty === 'tpl' ? (v === 'list' ? T.detail.seg.list : T.detail.seg[v]) : ty === 'bg' && v === 'pc' ? T.views.pcMine : T.views[v]) || '';
export function capOf(ty, v) {
  if (ty === 'fx') return T.detail.cap[v === 'static' ? 'static' : v === 'list' ? 'list' : 'live'];
  if (ty === 'tpl') return v === 'list' ? T.caps.list : T.detail.cap.tpl;
  return T.caps[v] || T.caps.card;
}
/** 規則（每類 3 條）的圖示 */
export const RULE_ICONS = Object.freeze({ halo: ['user', 'eye', 'home'], title: ['tag', 'repeat', 'card'], badge: ['tag', 'clock', 'cal'], bg: ['book', 'check', 'clock'], idea: ['pen', 'card', 'home'], seal: ['corner', 'eye', 'home'], gift: ['corner', 'eye', 'cal'] });
/** 「誰看得到」說明條：冒號前加粗；只有你看得到用淡紫＋鎖 */
export function whoHtml(ty) {
  const s = T.who[ty === 'badge' ? 'badge' : ty] || '';
  if (!s) return '';
  const me = ty === 'idea';
  const i = s.indexOf('：');
  const body = i > 0 ? `<b>${esc(s.slice(0, i))}</b>${esc(s.slice(i))}` : `<b>${esc(s)}</b>`;
  return `<p class="pv-who${me ? ' is-me' : ''}">${ic(me ? 'lock' : 'eye')}<span>${body}</span></p>`;
}
const pair = (a, b) => `<div class="pv-pair"><figure>${a}<figcaption>${esc(T.cmp.before)}</figcaption></figure><figure>${b}<figcaption class="on">${esc(T.cmp.after)}</figcaption></figure></div>`;
const lead = (left) => `<svg class="pv-lead" viewBox="0 0 40 60" style="left:${left}px" aria-hidden="true" focusable="false"><path d="M14 4 L22 40" stroke="#b48a5a" stroke-width="1.5" stroke-dasharray="3 3" fill="none"/></svg>`;
/** 預覽裡的清單列（正式站 .list-row 的樣子）；extra＝名字旁的稱號／徽章，li＝光效小圖示 */
function listRow(ctx, extra = '', li = '') {
  const me = ctx.me || {}, rc = ctx.rc || {};
  const av = me.photo ? `<span class="av is-photo"><img src="${esc(me.photo)}" alt=""></span>` : `<span class="av" style="background:${esc(me.color)}">${esc(me.ini)}</span>`;
  return `<div class="pv-lr" aria-hidden="true">${av}<div><div class="h"><b>${esc(me.name)}</b>${extra} → <span class="to">${esc(rc.to)}</span>${li}</div><p class="t">${esc(rc.text)}</p></div><time>${esc(fmtShort(ctx.now || Date.now()))}</time></div>`;
}
const haOf = (it) => String(it.g || '').replace(/^halo_/, '');
const bgOf = (it) => String(it.g || '').replace(/^bg_/, '');
/** 稱號款式：自選稱號 10 款、季節稱號 1 款 */
export const titleList = (g) => T.titles[g] || T.titles.ttl_pick;

/**
 * 預覽本體。d＝{ cmp, tt（稱號款式 index）, seal（光印 index）}
 * 光效的動畫由呼叫端用 fx.decorate 加在 [data-pv] 這張卡上（和牆上同一套）。
 */
export function previewStage(it, view, d, ctx) {
  const m = !!ctx.mobile, big = m ? 1 : 1.12, w = m ? 250 : 280;
  const base = { me: ctx.me, rc: ctx.rc };
  const card = (o) => realCard({ ...base, th: ctx.cardCls || 't-classic', s: big, w, rot: -1.5, pv: true, ...o });
  switch (it.ty) {
    case 'fx':
      if (view === 'list') return listRow(ctx, '', `<span class="lx-li${it.fx === 'snow' ? ' is-snow' : ''}" role="img" aria-label="${esc(fmt(T.fxListAria, { name: T.fxNames[it.fx] || '' }))}">${fxIcon(it.fx)}</span>`);
      return card({});
    case 'tpl': {
      const th = (ctx.themeOf && ctx.themeOf(it.th)) || 't-classic';
      if (view === 'list') return listRow(ctx);
      return card({ th });
    }
    case 'halo':
      if (view === 'pc') return d.cmp ? pair(pcMini({ me: ctx.me, k: m ? 0.5 : 0.62 }), pcMini({ me: ctx.me, ha: haOf(it), k: m ? 0.5 : 0.62 })) : pcMini({ me: ctx.me, ha: haOf(it), k: m ? 0.86 : 1 });
      if (d.cmp) return pair(realCard({ ...base, s: 0.9, w: m ? 150 : 200, pv: true }), realCard({ ...base, s: 0.9, w: m ? 150 : 200, eq: { ha: haOf(it) } }));
      return `<div class="pv-wrap pv-lensed">${card({ eq: { ha: haOf(it) } })}${lead(14)}${lensB(pavHtml(ctx.me, 40, haOf(it)), 8, -92, 64, T.lens.halo)}</div>`;
    case 'title': {
      const list = titleList(it.g), t = list[Math.max(0, Math.min(list.length - 1, Number(d.tt) || 0))];
      return view === 'list' ? listRow(ctx, `<span class="eq-tt">${esc(t)}</span>`) : card({ w: w + 10, eq: { tt: t } });
    }
    case 'badge':
      return view === 'list' ? listRow(ctx, `<span class="eq-bd">${BADGE_ART}</span>`)
        : `<div class="pv-wrap pv-lensed">${card({ eq: { bd: true } })}${lead(98)}${lensB(BADGE_ART, 92, -92, 60, T.lens.badge)}</div>`;
    case 'bg':
      return d.cmp ? pair(pcMini({ me: ctx.me, k: m ? 0.5 : 0.62 }), pcMini({ me: ctx.me, bg: bgOf(it), k: m ? 0.5 : 0.62 }))
        : pcMini({ me: ctx.me, bg: bgOf(it), k: m ? 0.86 : 1, filled: Number.isInteger(ctx.filled) ? ctx.filled : null });
    case 'idea': return composerMini({ k: m ? 0.95 : 1.05, n: 3 });
    case 'seal': return card({ seal: sealFace(it.g, d.seal) });
    case 'gift': return card({ gift: true });
    default: return '';
  }
}
/** 款式小籤：稱號 10 款、光印 3 枚（radiogroup） */
export function chipsHtml(it, d) {
  if (it.ty === 'title') {
    const list = titleList(it.g); if (list.length < 2) return '';
    const at = Math.max(0, Math.min(list.length - 1, Number(d.tt) || 0));
    return `<div class="pv-chips" role="radiogroup" aria-label="${esc(T.chips.titleAria)}"><p>${esc(T.chips.title)}</p>${list.map((t, i) => `<button type="button" role="radio" data-pd="tt" data-i="${i}" aria-checked="${i === at}" tabindex="${i === at ? 0 : -1}">${esc(t)}</button>`).join('')}</div>`;
  }
  if (it.ty === 'seal') {
    const list = T.sealFaces[it.g] || T.sealFaces.st_basic; if (list.length < 2) return '';
    const at = Math.max(0, Math.min(list.length - 1, Number(d.seal) || 0));
    return `<div class="pv-chips" role="radiogroup" aria-label="${esc(T.chips.sealAria)}"><p>${esc(T.chips.seal)}</p>${list.map((t, i) => `<button type="button" role="radio" data-pd="seal" data-i="${i}" aria-checked="${i === at}" tabindex="${i === at ? 0 : -1}">${esc(t.replace(/\n/g, ''))}</button>`).join('')}</div>`;
  }
  return '';
}

// ---------------------------------------------------------------- 商品圖鑑
const DEX_GROUPS = [['card', 'card', ['fx', 'tpl', 'later']], ['you', 'user', ['title', 'halo', 'bg']], ['me', 'lock', ['idea']]];
const TY_OF_DEX = { fx: ['fx'], tpl: ['tpl'], later: ['seal', 'gift'], title: ['title', 'badge'], halo: ['halo'], bg: ['bg'], idea: ['idea'] };
const shortName = (c) => (c.ticket ? T.ticketName : String(c.name || '').includes('・') ? String(c.name).split('・').slice(1).join('・') : c.name);
/** 一類的買法膠囊（從上架的買法產生） */
function kindsOf(cards) {
  const out = [], seen = new Set(), rents = new Set();
  const add = (icon, text, perm = false) => { if (!seen.has(text)) { seen.add(text); out.push([icon, text, perm]); } };
  for (const c of cards) for (const x of (c.ticket ? c.offers : c.all)) {
    if (c.ticket) add('repeat', T.dex.kinds.ticket);
    else if (x.k === 'perm') continue;
    else if (x.k === 'pack' && x.grp && x.ty === 'tpl') continue;   // 模板的 3 次是「模板 3 次券」那張卡
    else if (x.k === 'rent' && x.ty === 'badge') add('clock', fmt(T.dex.kinds.badge, { d: x.d }));
    else if (x.k === 'rent') rents.add(x.d);
    else if (x.c === 1) add('once', T.dex.kinds.once);
    else add('repeat', fmt(T.dex.kinds.pack, { c: x.c }));
  }
  if (rents.size) out.push(['clock', fmt(T.dex.kinds.rent, { d: [...rents].sort((a, b) => a - b).join('／') }), false]);
  if (cards.some(c => !c.ticket && c.all.some(x => x.k === 'perm'))) out.push(['home', T.dex.kinds.perm, true]);
  return out;
}
/**
 * 圖鑑。cards＝目前貨架上的商品卡（buildShelves 的 try＋home＋season）；later＝之後上架的 [{ sku, name }]（光印、節日小物還沒上架時）
 * 按鈕：data-sh="item" data-key（上架的）／data-sh="later" data-sku（之後上架）
 */
export function dexHtml(cards, later, ctx) {
  const me = ctx.me, rc = ctx.rc, m = !!ctx.mobile;
  const pics = {
    fx: () => realCard({ me, rc, fx: 'firefly', s: 0.82, w: 176, rot: -2 }),
    tpl: () => realCard({ me, rc, th: (ctx.themeOf && ctx.themeOf('theme-lamp')) || 't-lamp', s: 0.82, w: 176, rot: -2 }),
    later: () => realCard({ me, rc, s: 0.82, w: 176, rot: -2, seal: sealFace('st_basic', 0), gift: true }),
    title: () => realCard({ me, rc, strip: true, noLike: true, s: m ? 1 : 1.15, w: m ? 200 : 190, eq: { tt: T.titles.ttl_pick[0], bd: true } }),
    halo: () => `<div class="pv-halo">${pavHtml(me, 64, 'dawn')}<span>${esc(me.name)}</span></div>`,
    bg: () => pcMini({ me, bg: 'win', k: 0.58 }),
    idea: () => composerMini({ k: 0.6, n: 2 }),
  };
  const item = (k) => {
    const tys = TY_OF_DEX[k], all = cards.filter(c => tys.includes(c.ty));
    // 同一樣東西（g）在兩排貨架都有卡（例如租 7 天在試試看、帶回家在帶回家）：按鈕只放一顆（詳情裡兩種買法都選得到）
    const seenG = new Set(), mine = all.filter(c => { const id = c.ticket ? c.key : c.g; if (seenG.has(id)) return false; seenG.add(id); return true; });
    const isLater = k === 'later' && !mine.length;
    const info = T.dex.items[k];
    const isMe = k === 'idea';
    const kinds = isLater ? [] : kindsOf(mine);
    const go = isLater ? later.map(x => `<button type="button" data-sh="later" data-sku="${esc(x.sku)}">${esc(x.name)}${ic('chev')}</button>`).join('')
      : mine.length ? mine.map(c => `<button type="button" data-sh="item" data-key="${esc(c.key)}">${esc(shortName(c))}${c.sh === 'season' ? esc(T.dex.winter) : ''}${ic('chev')}</button>`).join('')
        : `<p class="dx-empty">${esc(T.dex.empty)}</p>`;
    return `<li class="dx-item${isLater ? ' is-later' : ''}"><div class="pic">${pics[k]()}</div><div class="inf"><h4>${esc(info.n)}${isLater ? `<span class="sh-chip is-later">${esc(T.later.tag)}</span>` : ''}</h4><p class="what">${esc(info.what)}</p>`
      + `<dl><dt>${ic('card')}${esc(T.dex.f.where)}</dt><dd>${esc(info.where)}</dd><dt>${ic(isMe ? 'lock' : 'eye')}${esc(T.dex.f.who)}</dt><dd${isMe ? ' class="me"' : ''}>${esc(info.who)}</dd>`
      + (kinds.length ? `<dt>${ic('tag')}${esc(T.dex.f.buy)}</dt><dd><span class="kinds">${kinds.map(([i, t, perm]) => `<span class="sh-chip${perm ? ' is-perm' : ''}">${ic(i)}${esc(t)}</span>`).join('')}</span></dd>` : '')
      + `</dl><div class="go">${go}</div></div></li>`;
  };
  return `<div class="dx-intro">${xiaoying('point', '')}<p><b>${esc(T.dex.introB)}</b>${esc(T.dex.intro)}</p><button class="sk-btn light" type="button" data-sh="tour">${ic('help')}${esc(T.help)}</button></div>`
    + DEX_GROUPS.map(([g, iconId, ks]) => `<section class="dx-grp" aria-labelledby="dx-${g}"><h3 id="dx-${g}">${ic(iconId)}${esc(T.dex.grp[g][0])}<small>${esc(T.dex.grp[g][1])}</small></h3><ul class="dx-list">${ks.map(item).join('')}</ul></section>`).join('');
}

// ---------------------------------------------------------------- 小螢帶你逛一圈（插畫＋內文）
function skyBg(seed = 1) {
  const st = Array.from({ length: 34 }, (_, i) => { const x = (i * 97 * seed + 31) % 640, y = (i * 53 + seed * 7) % 120; return `<circle cx="${x}" cy="${y}" r="${i % 6 ? 0.9 : 1.7}" fill="#fff6e0" opacity="${i % 3 ? 0.55 : 0.85}"/>`; }).join('');
  return `<svg class="bg" viewBox="0 0 640 210" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${st}<ellipse cx="320" cy="230" rx="420" ry="70" fill="rgba(255,170,90,.22)"/><path d="M0 188q160-26 320-6t320-8V210H0z" fill="rgba(20,12,30,.38)"/></svg>`;
}
const fg = (inner) => `<svg class="fg" viewBox="0 0 640 210" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${inner}</svg>`;
const xfG = (x, y, s, mood = 'smile') => `<g transform="translate(${x} ${y}) scale(${s})">${xiaoying(mood, '', '').replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>`;
const glowDot = (x, y, r = 5) => `<circle cx="${x}" cy="${y}" r="${r * 2.6}" fill="rgba(255,194,74,.22)"/><circle cx="${x}" cy="${y}" r="${r}" fill="#ffc24a"/><circle cx="${x}" cy="${y}" r="${r * 0.45}" fill="#fff6d0"/>`;
const ART = {
  1: () => fg('<g transform="translate(96 70) rotate(-8)"><rect width="150" height="96" rx="14" fill="#fff"/><rect x="14" y="16" width="60" height="8" rx="4" fill="#c9184a" opacity=".75"/><rect x="14" y="34" width="118" height="7" rx="3.5" fill="#2b2b33" opacity=".18"/><rect x="14" y="48" width="96" height="7" rx="3.5" fill="#2b2b33" opacity=".18"/><circle cx="24" cy="76" r="9" fill="#7c3aed"/><rect x="38" y="72" width="40" height="7" rx="3.5" fill="#2b2b33" opacity=".22"/><path d="M128 70c-4-5-11-2-9 3 1 3 9 8 9 8s8-5 9-8c2-5-5-8-9-3z" fill="#c9184a"/></g>'
    + `<path d="M250 96 Q 330 10 440 82" stroke="rgba(255,226,160,.55)" stroke-width="2" stroke-dasharray="2 9" stroke-linecap="round" fill="none"/>${glowDot(276, 70, 4)}${glowDot(318, 46, 5)}${glowDot(362, 42, 5.5)}${glowDot(404, 56, 6)}`
    + `<g transform="translate(452 54) scale(3.3)"><rect x="10" y="1.5" width="10" height="5" rx="1.5" fill="#b07a3c"/><path d="M9 6.5h12v3c4 1.5 6 4.5 6 8.5v9a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-9c0-4 2-7 6-8.5z" fill="url(#jarG)" stroke="#7d93b8" stroke-width=".6"/>${[[13, 25], [18, 27], [10, 21], [16, 21], [21, 22], [13, 16], [19, 16]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.1" fill="#ffc24a"/>`).join('')}</g><circle cx="502" cy="122" r="60" fill="rgba(255,194,74,.12)"/>${xfG(272, 92, 0.9, 'happy')}`),
  2: () => fg('<rect x="70" y="150" width="500" height="12" rx="4" fill="#8a5a2a"/><rect x="70" y="160" width="500" height="20" rx="4" fill="#5a3418"/>'
    + [[110, 'card'], [175, 'tpl'], [240, 'halo'], [305, 'tag'], [370, 'win'], [435, 'idea'], [500, 'seal']].map(([x, k]) => {
      const sh = { card: '<rect x="-24" y="-18" width="48" height="34" rx="7" fill="#fff" stroke="#ffc24a" stroke-width="2.5"/><circle cx="14" cy="-8" r="3" fill="#ffc24a"/><rect x="-16" y="-6" width="24" height="4" rx="2" fill="#2b2b33" opacity=".2"/>',
        tpl: '<rect x="-24" y="-18" width="48" height="34" rx="7" fill="#fff3dc"/><path d="M-24 -6h48M-24 4h48" stroke="rgba(160,100,40,.25)"/><circle cx="16" cy="-12" r="12" fill="rgba(255,200,110,.5)"/>',
        halo: '<circle r="17" fill="#7c3aed"/><circle r="20" fill="none" stroke="#ffc0a8" stroke-width="3.5"/><circle r="24" fill="none" stroke="rgba(255,190,160,.35)" stroke-width="4"/>',
        tag: '<rect x="-27" y="-10" width="54" height="20" rx="10" fill="#fff1d6" stroke="#c48c3c"/><rect x="-17" y="-2" width="34" height="4" rx="2" fill="#7a4300" opacity=".6"/>',
        win: '<rect x="-22" y="-20" width="44" height="38" rx="6" fill="#ffe0a3" stroke="#a8693a" stroke-width="3"/><path d="M0 -20v38M-22 -1h44" stroke="#a8693a" stroke-width="3"/>',
        idea: '<rect x="-24" y="-16" width="48" height="32" rx="8" fill="#fff"/><path d="M-14 -4h28M-14 6h18" stroke="#c98a3c" stroke-width="2.5" stroke-linecap="round"/><circle cx="18" cy="-16" r="6" fill="#ffc24a"/>',
        seal: '<circle r="18" fill="#fff" stroke="#c9184a" stroke-width="2.5"/><circle r="13" fill="none" stroke="#c9184a" stroke-dasharray="2 3" opacity=".6"/>' }[k];
      return `<g transform="translate(${x} 124)"><circle r="34" fill="rgba(255,190,90,.14)"/>${sh}</g>`;
    }).join('') + xfG(268, 4, 0.78, 'point')),
  4: () => fg([[110, 'once'], [320, 'home'], [530, 'snow']].map(([x, k]) => `<g transform="translate(${x} 0)"><rect x="-80" y="128" width="160" height="10" rx="3" fill="#8a5a2a"/><rect x="-80" y="72" width="160" height="10" rx="3" fill="#8a5a2a" opacity=".85"/>`
      + (k === 'once' ? `${glowDot(-46, 112, 6)}<rect x="-24" y="96" width="40" height="30" rx="6" fill="#fff" stroke="#ffc24a" stroke-width="2"/>${glowDot(44, 58, 5)}<rect x="-50" y="44" width="34" height="26" rx="5" fill="#fff3dc"/>`
        : k === 'home' ? '<rect x="-52" y="92" width="44" height="34" rx="6" fill="#fff3dc"/><circle cx="34" cy="108" r="17" fill="#7c3aed"/><circle cx="34" cy="108" r="21" fill="none" stroke="#ffc0a8" stroke-width="3"/><rect x="-30" y="48" width="60" height="22" rx="11" fill="#fff1d6" stroke="#c48c3c"/>'
          : '<rect x="-46" y="92" width="44" height="34" rx="6" fill="#22305e"/><circle cx="-12" cy="100" r="7" fill="rgba(255,180,90,.6)"/><path d="M30 92v30M17 99.5l26 15M17 114.5l26-15" stroke="#cfe3ff" stroke-width="2.5" stroke-linecap="round"/><path d="M-20 50v18M-28 54l16 10M-28 64l16-10" stroke="#cfe3ff" stroke-width="2" stroke-linecap="round"/>')
      + '</g>').join('') + [0, 1, 2].map(i => `<path d="M${30 + i * 210} 30 q 80 22 160 0" stroke="rgba(255,230,190,.45)" fill="none"/>`).join('')),
  5: () => fg([[170, 'clock'], [320, 'repeat'], [470, 'home']].map(([x, k]) => `<g transform="translate(${x} 0)"><path d="M0 0v34" stroke="#8a4b1a" stroke-width="2"/><circle cy="94" r="62" fill="rgba(255,180,80,.16)"/><rect x="-14" y="32" width="28" height="7" rx="3" fill="#8a4b1a"/><rect x="-40" y="38" width="80" height="104" rx="34" fill="url(#xfLamp)"/><path d="M-14 40v100M14 40v100" stroke="rgba(140,60,10,.25)"/><rect x="-14" y="141" width="28" height="7" rx="3" fill="#8a4b1a"/>`
    + `<g transform="translate(-20 70) scale(1.7)" fill="none" stroke="#5a2a08" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#si-${k}" width="24" height="24"/></g></g>`).join('') + '<path d="M60 4q260 40 520 0" stroke="rgba(255,230,190,.5)" fill="none"/>'),
};
function tourMap(ctx) {
  const m = !!ctx.mobile, me = ctx.me, rc = ctx.rc;
  const C = T.tour.p3.calls;
  const call = (i, x, y, isMe = false) => `<span class="tr-call${isMe ? ' is-me' : ''}" style="left:${x}px;top:${y}px">${esc(C[i][0])}${m ? '' : `　${esc(C[i][1])}`}</span>`;
  return `<div class="tr-map${m ? ' is-m' : ''}" aria-hidden="true">`
    + `<div class="tr-pos" style="left:186px;top:46px">${realCard({ me, rc, fx: 'firefly', s: 1, w: 236, rot: -2, eq: { ha: 'dawn', tt: T.titles.ttl_pick[0] } })}</div>`
    + `<div class="tr-pos" style="left:470px;top:62px">${pcMini({ me, bg: 'win', ha: 'dawn', k: 0.4 })}</div>`
    + `<div class="tr-pos" style="left:454px;top:148px">${composerMini({ k: 0.52, pop: false })}</div>`
    + (m ? call(0, 170, 40) + call(1, 166, 150) + call(2, 300, 168) + call(3, 470, 40) + call(4, 440, 150, true)
      : call(0, 24, 64) + call(1, 50, 148) + call(2, 262, 182) + call(3, 432, 34) + call(4, 486, 182, true)) + '</div>';
}
/** 導覽第 p 頁（1～5）的內容：{ art, h, body } */
export function tourPage(p, ctx) {
  const P = T.tour, me = ctx.me, rc = ctx.rc;
  if (p === 1) {
    const icons = ['send', 'heart', 'book', 'once'];
    return { art: ART[1](), h: P.p1.h, body: `<p>${esc(P.p1.body)}${ctx.pre ? esc(P.p1.pre) : ''}${esc(P.p1.lead)}</p><ul class="tr-list">${P.p1.list.map((t, i) => `<li>${ic(icons[i])}${esc(t)}</li>`).join('')}</ul><p class="tr-note">${ic('lock')}<span>${esc(P.p1.note)}</span></p>` };
  }
  if (p === 2) {
    const pics = [[realCard({ me, rc, fx: 'firefly', s: 0.62, w: 150 }), 0.66], [realCard({ me, rc, th: (ctx.themeOf && ctx.themeOf('theme-lamp')) || 't-lamp', s: 0.62, w: 150 }), 0.66],
      [realCard({ me, rc, strip: true, noLike: true, s: 1, w: 176, eq: { tt: T.titles.ttl_pick[0] } }), 0.62], [`<div class="pv-halo">${pavHtml(me, 48, 'dawn')}</div>`, 0.85],
      [pcMini({ me, bg: 'win', k: 0.44 }), 0.72], [composerMini({ k: 0.5, n: 1 }), 0.66], [realCard({ me, rc, s: 0.62, w: 150, seal: sealFace('st_basic', 0), gift: true }), 0.66]];
    return { art: ART[2](), h: P.p2.h, body: `<p>${esc(P.p2.body)}</p><ul class="tr-dex">${P.p2.items.map(([n, s], i) => `<li${i === 6 ? ' class="is-later"' : ''}><span class="pic" style="--z:${pics[i][1]}">${pics[i][0]}</span><b>${esc(n)}</b><small>${esc(s)}</small></li>`).join('')}</ul>` };
  }
  if (p === 3) {
    const row = (cls, icon, [b, t]) => `<li class="${cls}">${ic(icon)}<span><b>${esc(b)}</b>：${esc(t)}</span></li>`;
    return { art: tourMap(ctx), h: P.p3.h, body: `<ul class="tr-who">${row('all', 'eye', P.p3.all)}${row('all', 'book', P.p3.pc)}${row('me', 'lock', P.p3.me)}${row('anon', 'mask', P.p3.anon)}</ul>` };
  }
  if (p === 4) {
    const icons = ['once', 'home', 'snow'];
    return { art: ART[4](), h: P.p4.h, body: `<ul class="tr-three">${P.p4.cols.map((c, i) => `<li><h4>${ic(icons[i])}${esc(c.h)}</h4><p>${esc(c.p)}</p><small>${esc(c.ex)}</small></li>`).join('')}</ul>` };
  }
  const icons = ['clock', 'repeat', 'home'];
  return { art: ART[5](), h: P.p5.h, body: `<ul class="tr-three">${P.p5.cols.map((c, i) => `<li><h4>${ic(icons[i])}${esc(c.h)}</h4><p>${esc(c.p)}</p></li>`).join('')}</ul><p class="tr-note">${ic('heart')}<span>${esc(P.p5.note)}</span></p>` };
}
export const TOUR_PAGES = 5;
export { skyBg, realThumb };
