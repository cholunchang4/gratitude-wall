// T102 拾光小舖＋留言光效：純邏輯（沒有 DOM、沒有 Firebase），node --test 可以直接測。
// 規格：design/拾光小舖/設計規格.md、game-design/商城貨幣提案.md v2 第 3.4～3.5、docs/T102-前端需求給後端.md。
// 時間一律台灣時間（UTC+8，沒有日光節約）：台灣日數 floor((ms + 8h) / 1 天)，和額度格子同一個公式。
import { T, fmt } from './shop-text.js';
import { SHOP_THEMES, FX_STYLES } from './shop-catalog.js';

export const DAY = 86400000;
const TPE = 8 * 3600000;
export const tpeDay = (ms) => Math.floor((Number(ms) + TPE) / DAY);
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
function tpeParts(ms) { const d = new Date(Number(ms) + TPE); return { m: d.getUTCMonth() + 1, d: d.getUTCDate(), w: d.getUTCDay(), y: d.getUTCFullYear() }; }
/** 「12/10（四）」 */
export function fmtDate(ms) { const p = tpeParts(ms); return `${p.m}/${p.d}（${WEEK[p.w]}）`; }
/** 「12/2」 */
export function fmtShort(ms) { const p = tpeParts(ms); return `${p.m}/${p.d}`; }
export function tpeMonth(ms) { const p = tpeParts(ms); return p.y * 100 + p.m; }

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const validId = (s) => typeof s === 'string' && ID_RE.test(s);
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : '');
const TY = new Set(['fx', 'tpl', 'seal', 'idea', 'halo', 'bg', 'title', 'badge', 'gift']);
const KD = new Set(['perm', 'rent', 'pack']);
const SH = new Set(['try', 'home', 'season']);

// ---------------------------------------------------------------- 商品
/** shop/items 的一筆 → 乾淨的商品（不合法回 null，畫面就不顯示它） */
export function normItem(sku, raw) {
  if (!validId(sku) || !raw || typeof raw !== 'object') return null;
  const k = KD.has(raw.k) ? raw.k : (raw.ty === 'perm' ? 'perm' : raw.ty === 'count' || raw.ty === 'consume' ? 'pack' : null);   // 帳本第一期的 ty perm／count／consume 也看得懂
  const ty = TY.has(raw.ty) ? raw.ty : (String(sku).startsWith('fx_') ? 'fx' : String(sku).startsWith('tpl_') ? 'tpl' : null);
  const p = int(raw.p, 1, 100000);
  if (!k || !ty || p === null) return null;
  const it = {
    sku, g: validId(raw.g) ? raw.g : sku, ty, k, p,
    d: k === 'rent' ? (int(raw.d, 1, 365) || 7) : 0,
    c: k === 'pack' ? (int(raw.c, 1, 100) || int(raw.n, 1, 100) || 1) : 0,
    on: raw.on === true, s: Number.isFinite(raw.s) ? raw.s : 0, e: Number.isFinite(raw.e) ? raw.e : 0,
    sh: SH.has(raw.sh) ? raw.sh : (raw.season ? 'season' : k === 'perm' ? 'home' : 'try'),
    ord: Number.isFinite(raw.ord) ? raw.ord : 999,
    stock: int(raw.stock, 1, 1e6), lim: int(raw.lim, 1, 1000),
    n: str(raw.n, 40) || sku, note: str(raw.note, 80), story: str(raw.story, 200),
    fx: ty === 'fx' ? (str(raw.fx, 20) || FX_STYLES[validId(raw.g) ? raw.g : sku] || 'firefly') : '',
    th: ty === 'tpl' ? str(raw.th, 40) : '',
    grp: validId(raw.grp) ? raw.grp : '', season: str(raw.season, 20),
  };
  return it;
}
export function normItems(raw) {
  const out = {};
  for (const [sku, v] of Object.entries(raw || {})) { const it = normItem(sku, v); if (it) out[sku] = it; }
  return out;
}
/** 現在買得到嗎（上架、期間內） */
export const onSale = (it, now) => !!it && it.on && (!it.s || now >= it.s) && (!it.e || now <= it.e);
/** 限量快沒了（剩 ≤ 10%，或只剩 5 個以內；畫面不寫數字） */
export function lowStock(it, sold) { if (!it || !it.stock) return false; const left = it.stock - (Number(sold) || 0); return left > 0 && (left <= 5 || left <= it.stock * 0.1); }
export function soldOut(it, sold) { return !!(it && it.stock && (Number(sold) || 0) >= it.stock); }

// ---------------------------------------------------------------- 擁有
/** inv/{uid}/{g} → { perm, until（租期還沒到）, expiredAt（租期過了）, count } */
export function invState(e, now) {
  const n = e && Number.isFinite(e.n) ? e.n : 0;
  const u = e && Number.isFinite(e.u) ? e.u : 0;
  return { perm: n === -1, count: n > 0 ? n : 0, until: u > now ? u : 0, expiredAt: u && u <= now ? u : 0, any: n === -1 || n > 0 || u > now };
}
/** 剩幾天：到期日（台灣日）當天＝今天到期；之前＝相差的日數 */
export function daysLeft(u, now) { const d = tpeDay(u) - tpeDay(now); return { days: Math.max(0, d), today: d <= 0 }; }
/** 這種買法可以買嗎：OWNED（已永久）、SOLD_OUT、CAP、NO_FUNDS（附 need）、ok */
export function offerCheck(it, { inv = {}, bal = 0, sold = {}, bought = {}, now }) {
  const st = invState(inv[it.g], now);
  if (st.perm && (it.k === 'perm' || it.ty === 'tpl' || it.ty === 'bg' || it.ty === 'badge')) return { ok: false, code: 'OWNED' };
  if (!onSale(it, now)) return { ok: false, code: 'NOT_FOUND' };
  if (soldOut(it, sold[it.sku])) return { ok: false, code: 'SOLD_OUT' };
  if (it.lim && (Number(bought[it.sku]) || 0) >= it.lim) return { ok: false, code: 'CAP', max: it.lim };
  if (bal < it.p) return { ok: false, code: 'NO_FUNDS', need: it.p - Math.max(0, bal) };
  return { ok: true };
}
/** 租了之後到哪天（租期內再租＝往後加） */
export function rentUntil(it, invEntry, now) { const u = invEntry && Number.isFinite(invEntry.u) ? invEntry.u : 0; return Math.max(now, u) + it.d * DAY; }

// ---------------------------------------------------------------- 貨架
/** 商品卡的分組 key：grp（例如「模板 3 次券」把各款模板的 3 次買法放在同一張卡）或 g＋貨架 */
const cardKey = (it) => (it.grp ? `grp:${it.grp}` : `${it.g}@${it.sh}`);
export function tagOf(it) {
  if (it.k === 'perm') return fmt(T.tags.perm);
  if (it.k === 'rent') return it.ty === 'badge' ? fmt(T.tags.badge, { d: it.d }) : it.ty === 'tpl' ? fmt(T.tags.rent, { d: it.d }) : fmt(T.tags.days, { d: it.d });
  return it.c === 1 ? T.tags.once : fmt(T.tags.pack, { c: it.c });
}
/**
 * 三排貨架。每張商品卡＝{ key, g, name, ty, fx, th, offers（這張卡的買法，便宜的在前）, all（同一個 g 的全部買法，詳情用）,
 *   featured（卡上顯示的買法）, own: 'perm'|'rent'|'pack'|'', ownDays, ownToday, ownN, short（還差多少）, low（限量快沒了）, tag }
 */
export function buildShelves(items, { now, inv = {}, bal = 0, sold = {} }) {
  const live = Object.values(items).filter(it => onSale(it, now) && !soldOut(it, sold[it.sku]));
  const groups = new Map();
  for (const it of live) { const k = cardKey(it); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  const shelves = { try: [], home: [], season: [] };
  for (const [key, offers] of groups) {
    offers.sort((a, b) => a.p - b.p || a.ord - b.ord);
    const f = offers[0];
    const isTicket = key.startsWith('grp:') && offers.every(o => o.ty === 'tpl' && o.k === 'pack') && new Set(offers.map(o => o.g)).size > 1;
    const all = isTicket ? offers : live.filter(o => o.g === f.g).sort((a, b) => kindOrder(a) - kindOrder(b) || a.p - b.p);
    const st = invState(inv[f.g], now);
    const card = { key, g: f.g, name: isTicket ? T.ticketName : f.n, ty: f.ty, fx: f.fx, th: f.th, offers, all, featured: f, ticket: isTicket,
      sh: f.sh, ord: Math.min(...offers.map(o => o.ord)), note: isTicket ? T.ticketNote : (offers.find(o => o.note) || {}).note || '',
      tag: isTicket ? fmt(T.tags.pack, { c: f.c }) : (f.k === 'rent' && f.ty === 'tpl' && all.length > 1 ? fmt(T.tags.rentFrom, { d: f.d }) : tagOf(f)),
      own: '', ownDays: 0, ownToday: false, ownN: 0, short: 0, low: offers.some(o => lowStock(o, sold[o.sku])) };
    if (!isTicket) {
      if (st.perm) card.own = 'perm';
      else if (st.until) { card.own = 'rent'; const dl = daysLeft(st.until, now); card.ownDays = dl.days; card.ownToday = dl.today; }
      else if (st.count) { card.own = 'pack'; card.ownN = st.count; }
    }
    if (card.own !== 'perm' && bal < f.p) card.short = f.p - Math.max(0, bal);
    // 永久品已擁有就只放「帶回家」那排的卡（試試看那排同一個東西的租用卡也顯示已帶回家）
    (shelves[f.sh] || shelves.try).push(card);
  }
  for (const k of Object.keys(shelves)) shelves[k].sort((a, b) => a.ord - b.ord);
  return shelves;
}
const kindOrder = (it) => (it.k === 'pack' ? (it.c === 1 ? 0 : 1) : it.k === 'rent' ? 2 + it.d / 1000 : 9);

// ---------------------------------------------------------------- 詳情、購買的文字
export function offerTexts(it, { now, inv = {}, all = [], ticket = false }) {
  const until = it.k === 'rent' ? rentUntil(it, inv[it.g], now) : 0;
  const date = until ? fmtDate(until) : '';
  const single = all.find(o => o.g === it.g && o.k === 'pack' && o.c === 1);
  const save = single && it.k === 'pack' && it.c > 1 ? single.p * it.c - it.p : 0;
  const shortName = it.ty === 'fx' ? (T.fxNames[it.fx] || it.n) : it.n;
  let opt, sub, btn, head, fine, ok;
  if (ticket) { opt = fmt(T.detail.optTicket, { name: it.n }); sub = T.detail.optTicketSub; }
  else if (it.k === 'perm') { opt = T.detail.optPerm; sub = T.detail.optPermSub; }
  else if (it.k === 'rent') { opt = it.ty === 'badge' ? fmt(T.detail.optBadge, { d: it.d }) : fmt(T.detail.optRent, { d: it.d }); sub = fmt(it.ty === 'badge' ? T.detail.optBadgeSub : T.detail.optRentSub, { date }); }
  else if (it.c === 1) { opt = T.detail.optOnce; sub = T.detail.optOnceSub; }
  else { opt = fmt(T.detail.optPack, { c: it.c }); sub = save > 0 ? fmt(T.detail.optPackSub, { save }) : T.detail.optPackSub0; }
  const v = { p: it.p, name: it.n, c: it.c, d: it.d, date };
  if (it.k === 'perm') { btn = fmt(T.detail.btnPerm, v); head = fmt(T.buy.hPerm, v); fine = T.buy.finePerm; ok = T.buy.okPerm; }
  else if (it.k === 'rent' && it.ty === 'badge') { btn = fmt(T.detail.btnBadge, v); head = fmt(T.buy.hBadge, v); fine = fmt(T.buy.fineBadge, v); ok = T.buy.okBadge; }
  else if (it.k === 'rent') { btn = fmt(T.detail.btnRent, v); head = fmt(T.buy.hRent, v); fine = fmt(T.buy.fineRent, v); ok = T.buy.okRent; }
  else if (it.c === 1) { btn = fmt(T.detail.btnOnce, { ...v, name: shortName }); head = fmt(T.buy.hOnce, v); fine = T.buy.finePack; ok = T.buy.okOnce; }
  else { btn = fmt(T.detail.btnPack, { ...v, name: shortName }); head = fmt(T.buy.hPack, v); fine = T.buy.finePack; ok = T.buy.okPack; }
  return { opt, sub, btn, head, fine, ok, until, date };
}
/** 買完的說明（用回傳或監聽到的新 inv） */
export function doneText(it, invEntry, now) {
  const st = invState(invEntry, now);
  if (['badge', 'bg', 'halo', 'title'].includes(it.ty)) return { text: fmt(T.buy.doneWear, { name: it.n }), write: false };
  if (it.k === 'rent') return { text: fmt(T.buy.doneRent, { name: it.n, date: fmtDate(st.until || now + it.d * DAY) }), write: true };
  if (it.k === 'perm') return { text: fmt(T.buy.donePerm, { name: it.n }), write: it.ty === 'tpl' || it.ty === 'seal' || it.ty === 'idea' };
  return { text: fmt(T.buy.donePack, { name: it.n, n: st.count || it.c }), write: true };
}
/** callable 錯誤 → 畫面文字與下一步（retry＝同一個 bid 再試；back＝回詳情；closed＝換暫停營業畫面；gone＝從貨架拿掉） */
export function errorView(code, details = {}, { bal = 0, price = 0 } = {}) {
  const c = String(code || '');
  if (c === 'NO_FUNDS') { const n = Number.isInteger(details.need) && details.need > 0 ? details.need : Math.max(1, price - bal); return { text: fmt(T.err.NO_FUNDS, { n }), next: 'back', need: n }; }
  if (c === 'OWNED') return { text: T.err.OWNED, next: 'owned' };
  if (c === 'SHOP_CLOSED') return { text: '', next: 'closed' };
  if (c === 'NOT_FOUND' || c === 'EVENT_CLOSED') return { text: T.err[c], next: 'gone' };
  if (c === 'SOLD_OUT') return { text: T.err.SOLD_OUT, next: 'gone' };
  if (c === 'CAP') return { text: Number.isInteger(details.max) ? fmt(T.err.CAP, { n: details.max }) : T.err.CAP0, next: 'back' };
  if (['PAUSED', 'NOT_STARTED', 'NOT_ELIGIBLE', 'BAD_INPUT', 'NOT_MEMBER'].includes(c)) return { text: T.err[c], next: c === 'PAUSED' || c === 'BAD_INPUT' ? 'retry' : 'back' };
  return { text: T.err._net, next: 'retry' };   // 網路、逾時、函式沒部署、其他：同一個 bid 再試，不會重複扣
}
/** 購買編號：開確認框時產生，重試沿用（規則／銀行 /^[A-Za-z0-9_-]{8,64}$/） */
export function newBid(now = Date.now(), rnd = () => Math.random()) {
  const A = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let r = ''; for (let i = 0; i < 12; i++) r += A[Math.floor(rnd() * A.length) % A.length];
  return `b${Math.floor(now).toString(36)}${r}`;
}

// ---------------------------------------------------------------- 我的小抽屜
export function drawerView(items, inv = {}, now, { lookup } = {}) {
  const byG = new Map();
  for (const it of Object.values(items)) { if (!byG.has(it.g)) byG.set(it.g, []); byG.get(it.g).push(it); }
  const out = { active: [], perm: [], expired: [] };
  for (const [g, e] of Object.entries(inv || {})) {
    const offers = byG.get(g) || [];
    const base = offers[0] || (lookup && lookup(g)) || null;
    if (!base) continue;   // 商品資料不見了（例如後台刪掉）：抽屜不顯示，但擁有的東西規則仍認得
    const st = invState(e, now);
    const rent7 = offers.filter(o => o.k === 'rent').sort((a, b) => a.d - b.d)[0] || null;
    const row = { g, name: base.n, ty: base.ty, fx: base.fx, th: base.th, again: rent7 && onSale(rent7, now) ? rent7 : null };
    if (st.perm) out.perm.push({ ...row, kind: 'perm' });
    else if (st.until) { const dl = daysLeft(st.until, now); out.active.push({ ...row, kind: 'rent', until: st.until, days: dl.days, today: dl.today, n: st.count }); }
    else if (st.count) out.active.push({ ...row, kind: 'pack', n: st.count });
    else if (st.expiredAt) out.expired.push({ ...row, kind: 'expired', until: st.expiredAt });
  }
  out.active.sort((a, b) => (a.until || 9e15) - (b.until || 9e15));
  out.expired.sort((a, b) => b.until - a.until);
  return out;
}
/** 到期提醒：租期已過、而且這次還沒提醒過的（seen＝{ g: 已提醒的到期時間 }），最多看 30 天內到期的 */
export function dueExpiries(items, inv = {}, seen = {}, now) {
  const out = [];
  for (const [g, e] of Object.entries(inv || {})) {
    const st = invState(e, now);
    if (!st.expiredAt || st.perm || st.count || now - st.expiredAt > 30 * DAY) continue;
    if (Number(seen[g]) === st.expiredAt) continue;
    const offers = Object.values(items).filter(o => o.g === g);
    const base = offers[0]; if (!base) continue;
    const rent7 = offers.filter(o => o.k === 'rent').sort((a, b) => a.d - b.d)[0] || null;
    out.push({ g, name: base.n, ty: base.ty, until: st.expiredAt, again: rent7 && onSale(rent7, now) ? rent7 : null, d: rent7 ? rent7.d : base.d });
  }
  return out.sort((a, b) => a.until - b.until);
}

// ---------------------------------------------------------------- 帳本
const IN_ICON = { write: 'send', daily: 'send', new: 'send', reunion: 'send', first: 'send', pcw: 'send', rcv: 'heart', pcr: 'heart', buy: 'bag' };
export function reasonText(r, key) {
  if (r === 'ev') { const m = /^ev_([A-Za-z0-9]+)_([A-Za-z0-9]+)/.exec(String(key || '')); const k = m ? `${m[1]}.${m[2]}` : ''; return T.reasons[k] || T.reasons.ev; }
  return T.reasons[r] || r || '';
}
/**
 * ledger/{uid} → 依台灣日期分組（新到舊）。ctx = { items, msgOf(mid) → { r, x, anon, author } | null, start（開店時間）, amounts }
 * 每列 { key, a, kind: 'in'|'out'|'x', icon, title, sub, t }。ctx.limit＝最多顯示幾筆（新的先）；回傳 { groups, more }
 */
export function ledgerView(ledger, ctx = {}) {
  const items = ctx.items || {}, start = ctx.start || 0, per = (ctx.amounts && ctx.amounts.retro_per_card) || 5;
  const rows = Object.entries(ledger || {}).filter(([, v]) => v && Number.isFinite(v.a) && Number.isFinite(v.t))
    .map(([key, v]) => ledgerRow(key, v, items, ctx.msgOf, per)).sort((a, b) => b.t - a.t || (a.key < b.key ? 1 : -1));
  const lim = ctx.limit || Infinity, more = rows.length > lim;
  const groups = [];
  for (const row of rows.slice(0, lim)) {
    const d = tpeDay(row.t);
    let g = groups[groups.length - 1];
    if (!g || g.d !== d) { g = { d, label: fmtDate(row.t), star: !!start && row.t < start, rows: [] }; groups.push(g); }
    g.rows.push(row);
  }
  return { groups, more };
}
function ledgerRow(key, v, items, msgOf, per) {
  const isX = v.r === 'x_del' || v.r === 'x_adm' || (/_x$/.test(key) && v.r !== 'refund');
  const kind = v.r === 'give' ? 'gift' : isX ? 'x' : v.a >= 0 ? 'in' : 'out';
  const row = { key, a: v.a, t: v.t, kind, icon: isX ? 'undo' : IN_ICON[v.r] || (v.a >= 0 ? 'gift' : 'bag'), title: reasonText(v.r, key), sub: '' };
  const m = v.m && msgOf ? msgOf(v.m) : null;
  const cut = (s) => { const a = [...String(s || '').replace(/\s+/g, ' ').trim()]; return a.length > 20 ? a.slice(0, 20).join('') + '…' : a.join(''); };
  switch (v.r) {
    case 'write': case 'new': row.sub = m ? fmt(T.ledger.toText, { r: m.r || '大家', x: cut(m.x) }) : ''; break;
    case 'daily': case 'reunion': case 'pcw': row.sub = m ? fmt(T.ledger.to, { r: m.r || '大家' }) : ''; break;
    case 'rcv': case 'pcr': row.sub = m ? (m.anon || !m.author ? T.ledger.anon : fmt(T.ledger.from, { a: m.author })) : T.ledger.anon; break;
    case 'retro': row.sub = fmt(T.ledger.retro, { n: Math.round(v.a / per) }); break;
    case 'ev': row.sub = /^ev_ev26_/.test(key) ? T.ledger.sky : ''; break;
    case 'admin': case 'x_adm': row.sub = v.n ? fmt(T.ledger.note, { n: String(v.n).slice(0, 60) }) : ''; break;
    case 'x_del': row.sub = fmt(T.ledger.del, { date: fmtShort(v.t) }); break;
    case 'buy': {
      const it = items[v.i] || null;
      const name = it ? it.n : (v.i || '');
      const k = v.k || (it && it.k) || '', ty = v.ty || (it && it.ty) || '';
      const c = Number.isInteger(v.c) ? v.c : it ? it.c : 0, d = Number.isInteger(v.d) ? v.d : it ? it.d : 0;
      if (ty === 'badge') row.title = fmt(T.ledger.buyBadge, { name, d });
      else if (ty === 'gift') row.title = fmt(T.ledger.buyGift, { name });
      else if (k === 'rent' || Number.isFinite(v.u)) row.title = fmt(T.ledger.buyRent, { name, d: d || Math.round(((v.u || v.t) - v.t) / DAY) });
      else if (k === 'perm') row.title = fmt(T.ledger.buyPerm, { name });
      else if (c > 1) row.title = fmt(T.ledger.buyPack, { name, c });
      else row.title = name ? fmt(T.ledger.buyOnce, { name }) : T.reasons.buy;
      row.sub = Number.isFinite(v.u) ? fmt(T.ledger.until, { date: fmtDate(v.u) }) : (it ? it.n : '');
      break;
    }
    case 'refund': {   // 管理員退回：光點回來、東西收回（金棕色＋，算在「亮起」，不是灰色的收回列）
      const it = items[v.i] || null;
      row.title = fmt(T.ledger.refund, { name: it ? it.n : (v.i || '') }); row.icon = 'undo';
      row.sub = v.n ? fmt(T.ledger.note, { n: String(v.n).slice(0, 60) }) : '';
      break;
    }
    case 'give': {     // 管理員補發商品：0 光點，金額欄改成禮盒＋「抽屜＋1」
      const it = items[v.i] || null, name = it ? it.n : (v.i || '');
      row.title = fmt(T.ledger.give, { name }); row.icon = 'gift'; row.aria = fmt(T.ledger.giveAria, { name });
      const k = v.k || (it && it.k) || '';
      const what = k === 'perm' ? T.ledger.givePerm : k === 'rent' && Number.isFinite(v.u) ? fmt(T.ledger.giveRent, { date: fmtDate(v.u) }) : k === 'pack' ? fmt(T.ledger.givePack, { n: Number.isInteger(v.c) ? v.c : it ? it.c : 1 }) : '';
      row.sub = [what, v.n ? fmt(T.ledger.note, { n: String(v.n).slice(0, 60) }) : ''].filter(Boolean).join('　');
      break;
    }
    default: break;
  }
  return row;
}
/** 這個月亮起（當月正數加總）、用掉（當月購買的負數，不含撤銷） */
export function monthSums(ledger, now) {
  const mo = tpeMonth(now); let inn = 0, out = 0;
  for (const [key, v] of Object.entries(ledger || {})) {
    if (!v || !Number.isFinite(v.a) || !Number.isFinite(v.t) || tpeMonth(v.t) !== mo) continue;
    const isX = v.r === 'x_del' || v.r === 'x_adm' || (/_x$/.test(key) && v.r !== 'refund');
    if (v.a > 0 && !isX) inn += v.a; else if (v.a < 0 && !isX) out += -v.a;   // 0 光點（補發商品 give）不算
  }
  return { in: inn, out };
}
/** 第一次進店的入帳小卡：見面禮、千光禮、星光存摺（開店前的入帳加總）、回溯 */
export function welcomeRows(ledger, start) {
  const L = ledger || {}; const rows = [];
  if (L.o_open) rows.push({ k: 'open', a: L.o_open.a });
  if (L.o_k1000) rows.push({ k: 'k1000', a: L.o_k1000.a });
  let star = 0;
  for (const [key, v] of Object.entries(L)) if (v && Number.isFinite(v.a) && v.t < start && !/^o_/.test(key)) star += v.a;
  if (star > 0) rows.push({ k: 'star', a: star });
  if (L.o_retro && L.o_retro.a > 0) rows.push({ k: 'retro', a: L.o_retro.a });
  return rows;
}
/** 光瓶裡的光點數（3／6／8 顆） */
export const jarDots = (b) => (b > 150 ? 8 : b > 60 ? 6 : 3);

// ---------------------------------------------------------------- 留言光效
export const FX_DEFAULT = Object.freeze({ desk: 4, big: 6, mobile: 2, loop: 7, still: false, off: {} });
export function fxSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const n = (v, d, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
  return { desk: n(r.desk, 4, 0, 12), big: n(r.big, 6, 0, 12), mobile: n(r.mobile, 2, 0, 12), loop: n(r.loop, 7, 1, 30), still: r.still === true,
    off: r.off && typeof r.off === 'object' ? Object.fromEntries(Object.entries(r.off).filter(([, v]) => v === true)) : {} };
}
/** 牆面同時在動的上限：≥ 2100 寬＝大螢幕、≤ 768＝手機；活動卡本身有動畫時減 1 */
export function maxAnimFor(width, s, eventOn = false) {
  const base = width >= 2100 ? s.big : width <= 768 ? s.mobile : s.desk;
  return Math.max(0, base - (eventOn ? 1 : 0));
}
export const ADMIN_THEMES = new Set(['theme-admin', 'theme-admin-neon']);
// 等級獎勵模板與活動模板：可以加光效，但只播進場，不循環（避免兩層動畫疊在一起）
export const ENTER_ONLY_THEMES = new Set(['theme-neon', 'theme-holo', 'theme-gold', 'theme-cosmic', 'theme-ultimate', 'theme-halloween', 'theme-moonlight', 'theme-k1000', 'theme-starnight']);
export const fxStyleOf = (g) => FX_STYLES[g] || '';
/**
 * 一張卡的光效顯示方式：'' 不顯示（沒有光效、管理員模板、不認得）；'off'＝停用款（只有光框）；
 * 'still'＝只有光框；'enter'＝只播進場（等級／活動模板、冬夜小燈）；'loop'＝7 天內可以拿動態名額
 */
export function fxModeOf(msg, s, now) {
  const g = msg && msg.fx; const style = fxStyleOf(g);
  if (!style || ADMIN_THEMES.has(msg.theme)) return { style: '', mode: '' };
  if (s.off[g]) return { style, mode: 'off' };
  if (style === 'frost' || ENTER_ONLY_THEMES.has(msg.theme)) return { style, mode: 'enter' };
  const t = Number(msg.timestamp || msg.t || 0);
  return { style, mode: t && now - t < s.loop * DAY ? 'loop' : 'still' };
}
/**
 * 動態名額：cands＝牆上拿得到名額的光效卡 [{ id, t }]；最新的先；每 20 秒（tick＋1）把名額往下傳給下一批。
 * 回傳 Set(id)。卡數 ≤ 名額時全部都動。
 */
export function allocateLive(cands, max, tick = 0) {
  if (!max || !cands.length) return new Set();
  const sorted = cands.slice().sort((a, b) => b.t - a.t || (a.id < b.id ? -1 : 1));
  if (sorted.length <= max) return new Set(sorted.map(c => c.id));
  const n = sorted.length, start = ((tick * max) % n + n) % n, out = new Set();
  for (let i = 0; i < max; i++) out.add(sorted[(start + i) % n].id);
  return out;
}

// ---------------------------------------------------------------- 撰寫區：可以選哪些光效
const MARGIN = 10 * 60000;   // 和 writes.js 的額度格子同一個安全邊界（電腦時間和伺服器差一點也不會被規則拒絕）
export function freeFxSlot(slots, size, isFree) {
  for (let i = 0; i < size; i++) { const s = slots ? slots[i] ?? slots[String(i)] : null; if (!s || isFree(s)) return String(i); }
  return null;
}
/**
 * ctx = { inv, items, now, anon, theme, fxd, fxw, exists(mid), settings, free: K.BANK.fx.free, quota: { per_day, per_week, window_days } }
 * 回傳 { opts: [{ g, style, name, n, free, disabled }], block: ''|'day'|'week'|'theme', nextAt, note }
 */
export function fxChoices(ctx) {
  const now = ctx.now, s = ctx.settings || FX_DEFAULT, q = ctx.quota || { per_day: 1, per_week: 4, window_days: 7 };
  const exists = ctx.exists || (() => true);
  const opts = [];
  for (const [g, w] of Object.entries(ctx.free || {})) {
    if (now >= w.start && now <= w.end && !s.off[g]) opts.push({ g, style: fxStyleOf(g) || 'frost', name: T.fxNames[fxStyleOf(g)] || T.frostName, n: 0, free: true });
  }
  const names = {};
  for (const it of Object.values(ctx.items || {})) if (it.ty === 'fx' && !names[it.g]) names[it.g] = T.fxNames[it.fx] || it.n;
  for (const [g, e] of Object.entries(ctx.inv || {})) {
    const st = invState(e, now), style = fxStyleOf(g);
    if (!style || style === 'frost' || !st.count || s.off[g]) continue;
    opts.push({ g, style, name: names[g] || T.fxNames[style] || g, n: st.count, free: false });
  }
  opts.sort((a, b) => (a.free === b.free ? 0 : a.free ? 1 : -1));
  let block = '', nextAt = 0;
  if (ADMIN_THEMES.has(ctx.theme)) block = 'theme';
  else {
    const today = tpeDay(now);
    const d = freeFxSlot(ctx.fxd, q.per_day, (x) => !(Number(x.d) >= today) || !exists(x.m));
    const w = freeFxSlot(ctx.fxw, q.per_week, (x) => Number(x.t) < now - q.window_days * DAY - MARGIN || !exists(x.m));
    if (d === null) block = 'day';
    else if (w === null) {
      block = 'week';
      const ts = Object.values(ctx.fxw || {}).filter(x => x && exists(x.m)).map(x => Number(x.t)).filter(Number.isFinite);
      nextAt = ts.length ? Math.min(...ts) + q.window_days * DAY + MARGIN : now + DAY;
    }
  }
  for (const o of opts) o.disabled = !!block || (ctx.anon && !o.free);
  const note = block === 'day' ? T.picker.day : block === 'week' ? fmt(T.picker.week, { date: fmtShort(nextAt) }) : block === 'theme' ? T.picker.theme : ctx.anon ? T.picker.anon : '';
  return { opts, block, nextAt, note };
}
/**
 * 發文時的光效路徑（併進 writes.js buildCreateMessage 的 updates）。fx 沒選或被擋：回 null（卡片照樣送出、不帶光效）。
 * ctx = { me, mid, now, anon, theme, fx, inv, fxd, fxw, exists, settings, free, quota, TS（伺服器時間佔位） }
 * 回傳 { msgFx, mine: { fxd, fxw }, updates: { 'fxd/..': {d,m}, 'fxw/..': {t,m}, 'inv/me/g/n'? } }
 */
export function fxCreatePaths(ctx) {
  const g = ctx.fx; if (!g) return null;
  const ch = fxChoices(ctx);
  const o = ch.opts.find(x => x.g === g);
  if (!o || o.disabled) return null;
  const q = ctx.quota || { per_day: 1, per_week: 4, window_days: 7 }, now = ctx.now, today = tpeDay(now), exists = ctx.exists || (() => true);
  const di = freeFxSlot(ctx.fxd, q.per_day, (x) => !(Number(x.d) >= today) || !exists(x.m));
  const wi = freeFxSlot(ctx.fxw, q.per_week, (x) => Number(x.t) < now - q.window_days * DAY - MARGIN || !exists(x.m));
  if (di === null || wi === null) return null;
  const up = { [`fxd/${ctx.me}/${di}`]: { d: today, m: ctx.mid }, [`fxw/${ctx.me}/${wi}`]: { t: ctx.TS === undefined ? now : ctx.TS, m: ctx.mid } };
  if (!o.free) { up[`inv/${ctx.me}/${g}/n`] = o.n - 1; up[`inv/${ctx.me}/${g}/m`] = ctx.mid; }   // m：規則用來確認是同一張新卡
  return { msgFx: g, mine: { fxd: di, fxw: wi }, updates: up };
}
/**
 * 用商店模板寫卡：theme → g；永久（n == -1）或租期內（u ≥ now）不用扣；只有次數時扣 1。
 * 回傳 null（不是商店模板）／{ ok: false, code: 'ANON'|'NONE' }／{ ok: true, g, path?, value? }
 */
export function tplUse(theme, inv, now, { anon = false, map = SHOP_THEMES } = {}) {
  const g = map[theme]; if (!g) return null;
  if (anon) return { ok: false, code: 'ANON', g };
  const st = invState((inv || {})[g], now);
  if (st.perm || st.until) return { ok: true, g };
  if (st.count) return { ok: true, g, dec: st.count - 1 };   // 扣 1：呼叫端同一次寫入 inv/{me}/{g}/n 和 /m（＝這張卡）
  return { ok: false, code: 'NONE', g };
}
/** 撰寫區樣式選單要多放的商店模板（擁有中的） */
export function ownedTemplates(inv, now, map = SHOP_THEMES) {
  const out = [];
  for (const [theme, g] of Object.entries(map)) {
    const st = invState((inv || {})[g], now);
    if (st.any) out.push({ theme, g, perm: st.perm, until: st.until, n: st.count });
  }
  return out;
}
