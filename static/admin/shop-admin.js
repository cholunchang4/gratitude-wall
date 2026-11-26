// T102 後台：拾光小舖（商品上下架、調價、全年檔期）、光點帳本（查帳、發放／扣除、撤銷、補帳、本月經濟）、光效（同時動態上限、循環天數、各款停用、緊急開關）。
// 設計：design/拾光小舖/設計規格.md 第 14 節。介面：docs/T102-前端需求給後端.md 第 4、6 節；docs/光點帳本規格.md 第 6 節。
// - 商品、帳本、暫停一律透過 callable bankAdmin（伺服器檢查管理員身分、留稽核）；前台不直接寫 shop、wallet、ledger、bankcfg。
// - 光效設定 settings/fx：管理員直接寫（規則：settings 只有管理員能寫），同一次寫入加一筆 audit。
// - 不提供依餘額或購買量排序的同事名單；查帳一次一位，查帳本身也留紀錄（銀行端）。
// - 查帳要先選原因（同事詢問／系統補帳／補償＋說明 ≥ 5 字，6.6）；銀行端再驗一次並寫進稽核。同一位、同一類別 24 小時內記在 sessionStorage 不重填。
import * as L from '../app/shop/shop-logic.js';
import { DEFAULT_ITEMS } from '../app/shop/shop-catalog.js';
import { T as ST } from '../app/shop/shop-text.js';
import { ensureDefs, smallThumb, fxIcon, esc } from '../app/shop/shop-art.js';

export const AT = Object.freeze({
  tabs: { shop: '拾光小舖', bank: '光點帳本', fx: '光效' },
  shopH: '拾光小舖：商品', shopLead: '上下架、價格、期間都在這裡設定；到時間會自動上下架。',
  kpi: { on: '上架中', sch: '排程中', sold: '本月賣出', spent: '本月用掉的光點' },
  filt: { all: '全部', on: '上架中', sch: '排程', off: '已下架' }, search: '搜尋商品', cal: '全年檔期', add: '新增商品', seed: '匯入預設商品',
  col: ['商品', '類型', '價格', '狀態', '期間', '限量', '賣出', ''], st: { on: '上架中', sch: '排程', end: '已結束', off: '已下架' }, always: '常駐', none: '—',
  edit: '編輯', up: '上架', down: '下架', kinds: { perm: '永久', rent: '租 {d} 天', pack: '{c} 次', once: '單次' },
  calH: '全年檔期', calP: '節氣、節日、季節一次排好，之後自動上下架。',
  empty: '還沒有商品。按「匯入預設商品」放入第一期的商品，或「新增商品」。', loadFail: '讀不到商品資料（規則或連線還沒好）。',
  drawerNew: '新增商品', drawerEdit: '編輯商品：{n}',
  f: { n: '名稱（同事看到的）', sku: '商品代碼（英數，建立後不能改）', g: '擁有的東西（同一個東西的不同買法填一樣的）', ty: '種類', k: '買法', p: '價格（光點）', d: '租期（天）', c: '次數',
    s: '開始（台灣時間）', e: '結束（台灣時間）', sh: '貨架', season: '季節標籤', stock: '全站限量', lim: '每人上限', ord: '排序', on: '上架', note: '卡上小字', story: '詳情故事', fx: '光效樣式', th: '卡片主題',
    stockHint: '畫面只寫「這批還有不多」，不寫數字。', priceHint: '價格只能調降，不能調升（已經買的人不受影響）。', offHint: '下架只是不能再買；已經擁有、租用中的人照常可以用到期。', blank: '不限' },
  tyName: { fx: '留言光效', tpl: '卡片模板', seal: '光印', idea: '靈感包', halo: '頭像光環', bg: '說明書背景', title: '稱號', badge: '徽章', gift: '節日小物' },
  shName: { try: '試試看', home: '帶回家', season: '這一季' },
  noUseYet: '已儲存。提醒：光印和節日小物第一期還不能用在卡上，建議先不要上架。',
  save: '儲存', cancel: '取消', reason: '原因（只有後台看得到）', reasonHint: '必填，會留在操作紀錄', saved: '已儲存', priceUp: '價格只能調降。要調高請新增一個商品代碼。',
  bankH: '光點帳本：查帳', bankLead: '只用來處理問題（漏算、補償、撤銷）。查帳會留在操作紀錄；這裡不提供依餘額排序的名單。',
  // 查帳原因（6.6；類別三選一，沒有「異常」；銀行端 bankAdmin op:'ledger' 也會驗）
  lookTitle: '查帳：{n}', lookLead: '查帳只用來處理問題。原因只有後台看得到，會留在操作紀錄。',
  lookCat: '類別', lookPick: '請選擇', lookCats: { ask: '同事詢問', fix: '系統補帳', comp: '補償' }, lookNoCat: '請先選擇類別。',
  lookWhy: '說明', lookHint: '至少 5 字；不要寫個資（例：11/30 詢問光效次數少一次）',
  lookBatch: '批次編號（選填）', lookBatchHint: '同一次系統補帳要查好幾位時，填一樣的編號（英數）。', lookBadBatch: '批次編號只能用英文、數字、底線、減號（40 字內）。',
  lookNow: '查帳原因：{c}・{r}', lookChange: '換原因', lookKeep: '24 小時內再查同一位、同一類別不用重填。',
  who: '同事姓名', look: '查帳', fix: '補帳（輸入卡片 id）', grant: '發放／扣除光點', pickFirst: '先選一位同事、按「查帳」。',
  bk: { b: '餘額', e: '累計得到', s: '累計花掉', inv: '租用中・次數' }, lgH: '帳本（新到舊）', lgCol: ['時間', '原因', 'key', '同事看到的文字', '卡片', '金額', ''],
  lgFilt: { all: '全部', in: '入帳', out: '花費', x: '撤銷' }, revoke: '撤銷', noRevoke: '不能撤銷',
  refund: '退回光點', refunded: '已退回', refundBody: '退回 {p} 光點給 {n}，並收回「{i}」。次數已經用掉一部分的不能退（銀行會擋下）。',
  revokeNote: '撤銷要填原因（只有後台看得到）；給同事看的備註另外填（60 字內）。撤銷是新增一筆負的，原紀錄不會刪。',
  econH: '本月經濟', econP: '每月 1 號看一次就好。', econ: { issued: '發出', spent: '花掉', circ: '流通', fxRatio: '光效卡比例' }, econGoal: '目標 20～40%', econNA: '銀行還沒提供本月統計（bankAdmin stats）。',
  grantAmt: '光點（正數＝發放、負數＝扣除，±1～1000）', grantNote: '給同事看的備註（選填，60 字內）', fixMid: '卡片 id',
  fxH: '光效管理', fxLead: '牆面太花、或某一款出問題時，在這裡調。', maxH: '牆面同時在動的上限', maxP: '超過的光效卡只顯示靜態光框。',
  fxF: { mobile: '手機（≤ 768）', desk: '桌機（769～2099）', big: '大螢幕（≥ 2100）', loop: '循環天數' }, loopHint: '之後只剩光框', fxSave: '儲存上限',
  each: '各款光效', eachP: '停用後，已經用了這款的卡改成靜態光框。', fxCol: ['光效', '狀態', '啟用'], inUse: '使用中', offSt: '已停用',
  emH: '緊急開關', emP: '出問題時用；每次切換都要填原因，會留在操作紀錄。', em: { still: '全站光效改靜態', shop: '暫停小舖', earn: '暫停入帳' }, emShopSub: '（小螢去收光了，很快回來）',
  fail: '沒有成功：{m}', bankDown: '銀行（Cloud Functions）還沒上線或連不上，這個操作現在不能用。', confirmOn: '確定要{a}「{n}」嗎？',
  seedConfirm: '要匯入 {n} 個預設商品嗎？已經存在的商品代碼不會覆蓋。',
});
const fmt = (s, v = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] ?? ''));
const TPE = 8 * 3600000;
function toLocalInput(ms) { if (!ms) return ''; const d = new Date(ms + TPE); return d.toISOString().slice(0, 16); }
function fromLocalInput(s) { if (!s) return 0; const ms = Date.parse(s + ':00+08:00'); return Number.isFinite(ms) ? ms : NaN; }
const dt = (ms) => { if (!ms) return ''; const d = new Date(ms + TPE); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const BANK_DOWN = new Set(['NETWORK', 'TIMEOUT', 'NOT_FOUND_FN', 'UNAVAILABLE', 'INTERNAL']);
const ERRMSG = { PRICE_UP: AT.priceUp, NOT_ELIGIBLE: '次數已經用掉一部分，不能退回。', OWNED: '這位同事已經擁有這樣東西了。', NOT_ADMIN: '這個帳號不是管理員。', BAD_INPUT: '有欄位格式不對，請檢查後再存一次。', NOT_FOUND: '找不到這筆資料。', ALREADY: '這筆已經處理過了。' };
const errText = (e) => (e && BANK_DOWN.has(e.code) ? AT.bankDown : (e && ERRMSG[e.code]) || fmt(AT.fail, { m: (e && (e.code || e.message)) || '' }));

// ---- 查帳原因：同一位同事、同一類別 24 小時內不用重填（記在這個分頁的 sessionStorage；關掉分頁就重來）
export const LOOK_CATS = Object.freeze(['ask', 'fix', 'comp']);
export const LOOK_TTL = 24 * 3600000;
const LOOK_KEY = 'sa_look_v1';
const BATCH_RE = /^[A-Za-z0-9_-]{1,40}$/;
/** 驗證查帳原因（和銀行端同一套）：回傳 { reasonCat, reason, batch? } 或丟中文 Error */
export function checkLookReason(cat, reason, batch) {
  if (!LOOK_CATS.includes(cat)) throw new Error(AT.lookNoCat);
  const r = String(reason || '').trim();
  if (r.length < 5 || r.length > 200) throw new Error('說明要 5～200 字。');
  const b = String(batch || '').trim();
  if (b && (cat !== 'fix' || !BATCH_RE.test(b))) throw new Error(AT.lookBadBatch);
  return { reasonCat: cat, reason: r, ...(b ? { batch: b } : {}) };
}
function readLook() { try { const v = JSON.parse(sessionStorage.getItem(LOOK_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } }
function writeLook(v) { try { sessionStorage.setItem(LOOK_KEY, JSON.stringify(v)); } catch (e) { /* 無痕或停用 storage：每次都問 */ } }
/** 24 小時內記住的原因：給 cat 回那一類；沒給回這位同事最近填的那一類。過期的順便清掉。 */
export function rememberedLook(uid, now, cat) {
  const all = readLook(); let dirty = false;
  for (const [u, m] of Object.entries(all)) {
    for (const [c, e] of Object.entries(m || {})) if (!e || !LOOK_CATS.includes(c) || !(now - e.t < LOOK_TTL && now >= e.t)) { delete m[c]; dirty = true; }
    if (!m || !Object.keys(m).length) { delete all[u]; dirty = true; }
  }
  if (dirty) writeLook(all);
  const m = all[uid] || {};
  const pick = cat ? m[cat] && [cat, m[cat]] : Object.entries(m).sort((x, y) => y[1].t - x[1].t)[0];
  if (!pick) return null;
  try { return { ...checkLookReason(pick[0], pick[1].r, pick[1].b), t: pick[1].t }; } catch (e) { return null; }
}
/** 記下來（只在銀行接受之後）。同一類別 24 小時內重複使用不延長，避免一直沿用。 */
export function saveLook(uid, why, now) {
  const all = readLook(); const m = all[uid] = all[uid] || {};
  const old = m[why.reasonCat];
  const keep = old && old.r === why.reason && (old.b || '') === (why.batch || '') && now - old.t < LOOK_TTL;
  m[why.reasonCat] = { r: why.reason, ...(why.batch ? { b: why.batch } : {}), t: keep ? old.t : now };
  writeLook(all);
}
function forgetLook(uid, cat) { const all = readLook(); if (all[uid]) { delete all[uid][cat]; writeLook(all); } }

/** 商品狀態：上架中／排程／已結束／已下架 */
export function itemStatus(it, now) { if (!it.on) return 'off'; if (it.s && now < it.s) return 'sch'; if (it.e && now > it.e) return 'end'; return 'on'; }
export function kindText(it) { return it.k === 'perm' ? AT.kinds.perm : it.k === 'rent' ? fmt(AT.kinds.rent, { d: it.d }) : it.c === 1 ? AT.kinds.once : fmt(AT.kinds.pack, { c: it.c }); }
/** 編輯表單的值 → shop/items 的一筆（驗證不過丟 Error，訊息是中文） */
export function formToItem(f, old) {
  const n = String(f.n || '').trim(); if (!n || n.length > 40) throw new Error('名稱要 1～40 字。');
  const sku = String(f.sku || '').trim(); if (!L.validId(sku)) throw new Error('商品代碼只能用英文、數字、底線、減號（1～64 字）。');
  const g = String(f.g || sku).trim(); if (!L.validId(g)) throw new Error('「擁有的東西」代碼格式不對。');
  const p = Number(f.p); if (!Number.isInteger(p) || p < 1 || p > 100000) throw new Error('價格要是 1 以上的整數。');
  if (old && Number.isInteger(old.p) && p > old.p) throw new Error(AT.priceUp);
  const k = ['perm', 'rent', 'pack'].includes(f.k) ? f.k : 'perm';
  const it = { n, g, ty: f.ty, k, p, on: !!f.on, sh: f.sh || 'try', ord: Number.isFinite(Number(f.ord)) ? Number(f.ord) : 999 };
  if (k === 'rent') { const d = Number(f.d); if (!Number.isInteger(d) || d < 1 || d > 365) throw new Error('租期要是 1～365 天。'); it.d = d; }
  if (k === 'pack') { const c = Number(f.c); if (!Number.isInteger(c) || c < 1 || c > 100) throw new Error('次數要是 1～100。'); it.c = c; }
  const s = fromLocalInput(f.s), e = fromLocalInput(f.e);
  if (Number.isNaN(s) || Number.isNaN(e)) throw new Error('開始或結束時間格式不對。');
  if (s && e && e <= s) throw new Error('結束時間要在開始時間之後。');
  if (s) it.s = s; if (e) it.e = e;
  for (const key of ['stock', 'lim']) { if (f[key] !== '' && f[key] != null) { const v = Number(f[key]); if (!Number.isInteger(v) || v < 1) throw new Error(`${AT.f[key]}要是 1 以上的整數，或留空。`); it[key] = v; } }
  for (const key of ['note', 'story', 'season', 'fx', 'th', 'grp']) { const v = String(f[key] || '').trim(); if (v) it[key] = v.slice(0, key === 'story' ? 200 : 80); }
  if (it.ty === 'fx' && !it.fx) throw new Error('光效商品要選樣式。');
  if (it.ty === 'tpl' && !it.th) throw new Error('模板商品要填卡片主題（例如 theme-lamp）。');
  if (!L.normItem(sku, it)) throw new Error('商品資料不完整。');
  return { sku, item: it };
}

/**
 * o = { root（放分頁內容的元素）, which: 'shop'|'bank'|'fx', watch(path, cb) → off, call(name, data) → Promise（bankAdmin 等）,
 *       writeFx(next, reason) → Promise（寫 settings/fx＋audit）, nowMs(), toast(text, bad), modal（util.js actionModal）, people() → [{ uid, name }], h }
 */
export function createShopAdmin(o) {
  const S = { items: {}, raw: {}, itemsOk: true, sold: {}, fx: L.fxSettings(null), cfg: {}, filter: 'all', q: '', stats: null, statsErr: '', who: null, why: null, ledger: null, lgFilter: 'all', busy: false };
  const offs = [];
  ensureDefs(document);
  const now = () => o.nowMs();
  function start() {
    offs.push(o.watch('shop/items', (v, err) => { S.raw = v || {}; S.items = L.normItems(v); S.itemsOk = !err; render(); }));
    offs.push(o.watch('shop/sold', (v) => { S.sold = v || {}; render(); }));
    offs.push(o.watch('settings/fx', (v) => { S.fx = L.fxSettings(v); S.fxRaw = v || {}; render(); }));
    offs.push(o.watch('bankcfg', (v) => { S.cfg = v || {}; render(); }));
    loadStats();
  }
  async function loadStats() {
    try { const m = Math.floor(L.tpeMonth(now())); S.stats = await o.call('bankAdmin', { op: 'stats', month: String(m) }); S.statsErr = ''; }
    catch (e) { S.stats = null; S.statsErr = errText(e); }
    render();
  }
  const el = (sel) => o.root.querySelector(sel);
  function render() {
    if (!o.root) return;
    const keep = document.activeElement && o.root.contains(document.activeElement) ? document.activeElement.dataset.sa : null;
    o.root.innerHTML = o.which === 'bank' ? bankHtml() : o.which === 'fx' ? fxHtml() : shopHtml();
    if (keep) { const f = o.root.querySelector(`[data-sa="${keep}"]`); if (f) f.focus(); }
  }

  // ---------------------------------------------------------------- 商品
  function shopHtml() {
    const n = now(), list = Object.values(S.items).sort((a, b) => a.ord - b.ord || (a.sku < b.sku ? -1 : 1));
    const cnt = { all: list.length, on: 0, sch: 0, off: 0 };
    for (const it of list) { const s = itemStatus(it, n); if (s === 'on') cnt.on++; else if (s === 'sch') cnt.sch++; else cnt.off++; }
    const soldMonth = S.stats && S.stats.sold ? Object.values(S.stats.sold).reduce((a, b) => a + (Number(b) || 0), 0) : null;
    const q = S.q.trim().toLowerCase();
    const rows = list.filter(it => (S.filter === 'all' || (S.filter === 'off' ? ['off', 'end'].includes(itemStatus(it, n)) : itemStatus(it, n) === S.filter))
      && (!q || it.n.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q)));
    const stTag = (s) => `<span class="st ${s === 'on' ? 'on' : s === 'sch' ? 'sch' : 'off'}">${esc(AT.st[s])}</span>`;
    const period = (it) => (it.s || it.e ? `${it.s ? esc(dt(it.s)) : ''}～${it.e ? esc(dt(it.e)) : ''}` : esc(AT.always));
    const table = rows.length ? `<div class="table-wrap sa-wide-wrap"><table class="sa-tbl sa-wide"><thead><tr>${AT.col.map((c, i) => `<th${[2, 6].includes(i) ? ' class="num"' : ''}>${esc(c)}</th>`).join('')}</tr></thead><tbody>`
      + rows.map(it => { const s = itemStatus(it, n); return `<tr><td><div class="it"><span class="th">${smallThumb(it, 0.34)}</span><div>${esc(it.n)}<small><code>${esc(it.sku)}</code>${it.g !== it.sku ? ` → <code>${esc(it.g)}</code>` : ''}</small></div></div></td>`
        + `<td>${esc(AT.tyName[it.ty] || it.ty)}・${esc(kindText(it))}</td><td class="num">${it.p}</td><td>${stTag(s)}</td><td>${period(it)}</td><td>${it.stock ? it.stock : esc(AT.none)}</td><td class="num">${Number(S.sold[it.sku]) || 0}</td>`
        + `<td><div class="sa-row nowrap"><button class="btn btn-sm" type="button" data-sa="edit" data-sku="${esc(it.sku)}">${esc(AT.edit)}</button><button class="btn btn-sm${it.on ? ' btn-ghost-danger' : ''}" type="button" data-sa="onoff" data-sku="${esc(it.sku)}">${esc(it.on ? AT.down : AT.up)}</button></div></td></tr>`; }).join('')
      + '</tbody></table></div>' : `<p class="hint">${esc(S.itemsOk ? AT.empty : AT.loadFail)}</p>`;
    return `<h2>${esc(AT.shopH)}</h2><p class="hint">${esc(AT.shopLead)}</p>`
      + `<div class="sa-kpi"><div><small>${esc(AT.kpi.on)}</small><b>${cnt.on}</b></div><div><small>${esc(AT.kpi.sch)}</small><b>${cnt.sch}</b></div><div><small>${esc(AT.kpi.sold)}</small><b>${soldMonth ?? '—'}</b></div><div><small>${esc(AT.kpi.spent)}</small><b>${S.stats && Number.isFinite(S.stats.spent) ? S.stats.spent.toLocaleString('en-US') : '—'}</b></div></div>`
      + `<div class="card"><div class="sa-row" style="margin-bottom:12px"><span class="sa-pills" role="group" aria-label="篩選">${['all', 'on', 'sch', 'off'].map(k => `<button type="button" data-sa="filter" data-v="${k}" aria-pressed="${S.filter === k}">${esc(AT.filt[k])} ${cnt[k]}</button>`).join('')}</span>`
      + `<span style="margin-left:auto"></span><input class="sa-fld" type="search" data-sa="q" placeholder="${esc(AT.search)}" aria-label="${esc(AT.search)}" value="${esc(S.q)}">`
      + `<button class="btn" type="button" data-sa="seed">${esc(AT.seed)}</button><button class="btn btn-primary" type="button" data-sa="add">${esc(AT.add)}</button></div>${table}</div>`
      + calHtml(list);
  }
  function calHtml(list) {
    const n = now(), base = L.tpeDay(n) - ((L.tpeDay(n) + 3) % 7);   // 這週一
    const weeks = Array.from({ length: 13 }, (_, i) => (base + i * 7) * L.DAY - TPE);
    const end = weeks[12] + 7 * L.DAY;
    const rows = new Map();
    for (const it of list) { if (!it.s && !it.e) continue; const k = it.grp || it.g; if (!rows.has(k)) rows.set(k, { n: it.n, s: it.s || weeks[0], e: it.e || end, ty: it.ty }); }
    if (!rows.size) return '';
    const COL = { tpl: ['#e8effc', '#2a4f8f'], fx: ['#fff3d6', '#8a5a00'], badge: ['#fde7ec', '#9f1239'], gift: ['#e5f4ec', '#1f7a4d'] };
    const bar = (r) => { const a = Math.max(0, Math.floor((r.s - weeks[0]) / (7 * L.DAY))), b = Math.min(13, Math.ceil((r.e - weeks[0]) / (7 * L.DAY)));
      if (b <= 0 || a >= 13) return '<div style="grid-column:span 13"></div>';
      const c = COL[r.ty] || ['#f1eeee', '#5c5c68'];
      return (a ? `<div style="grid-column:span ${a}"></div>` : '') + `<div style="grid-column:span ${b - a}"><div class="bar" style="background:${c[0]};color:${c[1]}">${esc(L.fmtShort(r.s))}～${esc(L.fmtShort(r.e))}</div></div>` + (13 - b ? `<div style="grid-column:span ${13 - b}"></div>` : ''); };
    return `<div class="card"><h3>${esc(AT.calH)}</h3><p class="hint">${esc(AT.calP)}</p><div class="sa-cal-wrap"><div class="sa-cal"><div class="h">商品</div>${weeks.map(w => `<div class="h">${esc(L.fmtShort(w + TPE))}</div>`).join('')}`
      + [...rows.values()].map(r => `<div>${esc(r.n)}</div>${bar(r)}`).join('') + '</div></div></div>';
  }
  function openEditor(sku) {
    const old = sku ? S.items[sku] : null, raw = sku ? (S.raw[sku] || {}) : {};
    const v = old ? { ...old, s: toLocalInput(old.s), e: toLocalInput(old.e), stock: old.stock || '', lim: old.lim || '' } : { k: 'perm', ty: 'seal', sh: 'try', on: false, ord: 999, p: '' };
    const back = document.createElement('div'); back.className = 'sa-drawer-back';
    const opt = (arr, cur) => arr.map(([k, t]) => `<option value="${esc(k)}"${String(cur) === k ? ' selected' : ''}>${esc(t)}</option>`).join('');
    const fld = (k, type = 'text', extra = '') => `<label class="sa-f"><span>${esc(AT.f[k])}</span><input class="sa-fld" name="${k}" type="${type}" value="${esc(v[k] ?? '')}" ${extra}></label>`;
    back.innerHTML = `<aside class="sa-drawer" role="dialog" aria-modal="true" aria-labelledby="saDT"><header><h3 id="saDT">${esc(old ? fmt(AT.drawerEdit, { n: old.n }) : AT.drawerNew)}</h3><button class="btn btn-sm" type="button" data-sa="dx" aria-label="${esc(AT.cancel)}" style="margin-left:auto">✕</button></header>`
      + `<form class="bd" novalidate>${fld('n', 'text', 'maxlength="40" required')}`
      + `<div class="sa-f2">${fld('sku', 'text', old ? 'readonly' : 'required pattern="[A-Za-z0-9_-]{1,64}"')}${fld('g', 'text', old && raw.g ? 'readonly' : '')}</div>`
      + `<div class="sa-f2"><label class="sa-f"><span>${esc(AT.f.ty)}</span><select class="sa-fld" name="ty">${opt(Object.entries(AT.tyName), v.ty)}</select></label><label class="sa-f"><span>${esc(AT.f.k)}</span><select class="sa-fld" name="k"${old ? ' disabled' : ''}>${opt([['perm', '永久'], ['rent', '租用'], ['pack', '單次／次數包']], v.k)}</select></label></div>`
      + `<div class="sa-f2">${fld('p', 'number', 'min="1" step="1" required')}${fld('d', 'number', 'min="1" max="365"')}</div><small class="hint">${esc(AT.f.priceHint)}</small>`
      + `<div class="sa-f2">${fld('c', 'number', 'min="1" max="100"')}${fld('ord', 'number')}</div>`
      + `<div class="sa-f2">${fld('s', 'datetime-local')}${fld('e', 'datetime-local')}</div>`
      + `<div class="sa-f2"><label class="sa-f"><span>${esc(AT.f.sh)}</span><select class="sa-fld" name="sh">${opt(Object.entries(AT.shName), v.sh)}</select></label>${fld('season')}</div>`
      + `<div class="sa-f2">${fld('stock', 'number', `min="1" placeholder="${esc(AT.f.blank)}"`)}${fld('lim', 'number', `min="1" placeholder="${esc(AT.f.blank)}"`)}</div><small class="hint">${esc(AT.f.stockHint)}</small>`
      + `<div class="sa-f2"><label class="sa-f"><span>${esc(AT.f.fx)}</span><select class="sa-fld" name="fx"><option value="">—</option>${opt([['firefly', '螢火'], ['stream', '流光'], ['snow', '雪光']], v.fx)}</select></label>${fld('th')}</div>`
      + `${fld('note', 'text', 'maxlength="80"')}<label class="sa-f"><span>${esc(AT.f.story)}</span><textarea class="sa-fld" name="story" maxlength="200" rows="3">${esc(v.story || '')}</textarea></label>`
      + `<label class="sa-chk"><input type="checkbox" name="on"${v.on ? ' checked' : ''}> ${esc(AT.f.on)}</label><p class="sa-note">${esc(AT.f.offHint)}</p>`
      + `<label class="sa-f"><span>${esc(AT.reason)}</span><input class="sa-fld" name="reason" maxlength="200" required placeholder="${esc(AT.reasonHint)}"></label>`
      + `<p class="gate-msg" role="alert" hidden></p></form>`
      + `<footer><button class="btn" type="button" data-sa="dx">${esc(AT.cancel)}</button><button class="btn btn-primary" type="button" data-sa="dsave">${esc(AT.save)}</button></footer></aside>`;
    document.body.appendChild(back);
    const prev = document.activeElement;
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); if (prev && prev.focus) prev.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('click', async (e) => {
      if (e.target === back) { close(); return; }
      const b = e.target.closest('[data-sa]'); if (!b) return;
      if (b.dataset.sa === 'dx') { close(); return; }
      if (b.dataset.sa !== 'dsave' || b.disabled) return;
      const form = back.querySelector('form'), msg = back.querySelector('.gate-msg');
      const f = Object.fromEntries(new FormData(form).entries()); f.on = form.on.checked; if (old) { f.k = old.k; f.sku = old.sku; }
      let out;
      try { out = formToItem(f, old); if (!String(f.reason || '').trim()) throw new Error('請填寫原因。'); }
      catch (err) { msg.textContent = err.message; msg.hidden = false; return; }
      b.disabled = true; b.textContent = '處理中…';
      try {
        const r = await o.call('bankAdmin', { op: 'item', id: out.sku, item: out.item, reason: String(f.reason).trim() });
        o.toast(r && r.warn === 'NO_USE_YET' ? AT.noUseYet : AT.saved); close();
      } catch (err) { msg.textContent = errText(err) + (err && err.details && err.details.field ? `（欄位：${AT.f[err.details.field] || err.details.field}）` : ''); msg.hidden = false; b.disabled = false; b.textContent = AT.save; }
    });
    back.querySelector('input[name="n"]').focus();
  }
  async function onoff(sku) {
    const it = S.items[sku]; if (!it) return;
    const a = it.on ? AT.down : AT.up;
    const body = document.createElement('div'); body.textContent = fmt(AT.confirmOn, { a, n: it.n }) + (it.on ? ' ' + AT.f.offHint : '');
    await o.modal({ title: `${a}：${it.n}`, body, confirmText: a, danger: it.on, input: { label: AT.reason, hint: AT.reasonHint, maxlength: 200, multiline: false },
      run: async (reason) => { try { await o.call('bankAdmin', { op: 'onoff', id: sku, on: !it.on, reason }); } catch (e) { throw new Error(errText(e)); } } });
  }
  async function seed() {
    const todo = Object.entries(DEFAULT_ITEMS).filter(([k]) => !S.raw[k]);
    if (!todo.length) { o.toast('預設商品都已經在了。'); return; }
    const body = document.createElement('div'); body.textContent = fmt(AT.seedConfirm, { n: todo.length });
    await o.modal({ title: AT.seed, body, confirmText: AT.seed, danger: false, input: { label: AT.reason, hint: AT.reasonHint, maxlength: 200, multiline: false },
      run: async (reason) => { for (const [k, v] of todo) { try { await o.call('bankAdmin', { op: 'item', id: k, item: v, reason }); } catch (e) { throw new Error(`${k}：${errText(e)}`); } } } });
  }

  // ---------------------------------------------------------------- 帳本
  function bankHtml() {
    const ppl = (o.people && o.people()) || [];
    const L0 = S.ledger, w = L0 && L0.wallet ? L0.wallet : null;
    const invTxt = L0 && L0.inv ? Object.entries(L0.inv).map(([g, e]) => { const s = L.invState(e, now()); const it = Object.values(S.items).find(x => x.g === g); const nm = it ? it.n : g;
      return s.perm ? `${nm}・永久` : s.until ? `${nm}・剩 ${L.daysLeft(s.until, now()).days} 天` : s.count ? `${nm}・${s.count} 次` : ''; }).filter(Boolean).join('、') : '';
    const ents = L0 && Array.isArray(L0.entries) ? L0.entries : [];
    const isX = (e) => e.r === 'x_del' || e.r === 'x_adm' || (/_x$/.test(e.key || '') && e.r !== 'refund');
    const shown = ents.filter(e => S.lgFilter === 'all' || (S.lgFilter === 'x' ? isX(e) : S.lgFilter === 'in' ? e.a > 0 && !isX(e) : e.a < 0 && !isX(e)));
    const revoked = new Set(ents.filter(e => isX(e) || e.r === 'refund').map(e => e.of).filter(Boolean));
    const table = L0 ? `<div class="card"><div class="sa-row" style="margin-bottom:12px"><h3 style="margin:0">${esc(AT.lgH)}</h3><span class="sa-pills" style="margin-left:auto" role="group" aria-label="篩選">${Object.entries(AT.lgFilt).map(([k, t]) => `<button type="button" data-sa="lgf" data-v="${k}" aria-pressed="${S.lgFilter === k}">${esc(t)}</button>`).join('')}</span></div>`
      + `<div class="table-wrap sa-wide-wrap"><table class="sa-tbl sa-wide"><thead><tr>${AT.lgCol.map((c, i) => `<th${i === 5 ? ' class="num"' : ''}>${esc(c)}</th>`).join('')}</tr></thead><tbody>`
      + shown.map(e => `<tr><td>${esc(dt(e.t))}</td><td><code>${esc(e.r)}</code></td><td><code>${esc(e.key || '')}</code></td><td>${esc(seenText(e))}</td><td>${esc(e.m || '—')}</td><td class="num" style="font-weight:800;color:${e.a > 0 ? '#8a5a00' : '#2b2b33'}">${e.a > 0 ? '+' : ''}${e.a}</td>`
        + `<td>${revoked.has(e.key) ? `<span class="hint">${esc(e.r === 'buy' ? AT.refunded : '已撤銷')}</span>`
          : e.r === 'buy' ? `<button class="btn btn-sm" type="button" data-sa="refund" data-key="${esc(e.key)}">${esc(AT.refund)}</button>`
          : isX(e) || e.r === 'refund' || e.r === 'give' ? `<span class="hint">${esc(AT.noRevoke)}</span>`
          : `<button class="btn btn-sm btn-danger" type="button" data-sa="revoke" data-key="${esc(e.key)}">${esc(AT.revoke)}</button>`}</td></tr>`).join('')
      + `</tbody></table></div><p class="sa-note">${esc(AT.revokeNote)}</p></div>` : `<p class="hint">${esc(AT.pickFirst)}</p>`;
    const econ = S.stats ? `<div class="sa-kpi" style="margin:0"><div><small>${esc(AT.econ.issued)}</small><b>${fmtN(S.stats.issued)}</b></div><div><small>${esc(AT.econ.spent)}</small><b>${fmtN(S.stats.spent)}</b></div><div><small>${esc(AT.econ.circ)}</small><b>${fmtN(S.stats.circ)}</b></div><div><small>${esc(AT.econ.fxRatio)}</small><b>${Number.isFinite(S.stats.fxRatio) ? Math.round(S.stats.fxRatio * 100) + '%' : '—'}</b><small>${esc(AT.econGoal)}</small></div></div>` : `<p class="hint">${esc(S.statsErr || AT.econNA)}</p>`;
    return `<h2>${esc(AT.bankH)}</h2><p class="hint">${esc(AT.bankLead)}</p>`
      + `<div class="card"><div class="sa-row"><input class="sa-fld" list="saPeople" data-sa="who" placeholder="${esc(AT.who)}" aria-label="${esc(AT.who)}" value="${esc(S.who ? S.who.name : '')}" style="width:260px"><datalist id="saPeople">${ppl.map(p => `<option value="${esc(p.name)}"></option>`).join('')}</datalist>`
      + `<button class="btn" type="button" data-sa="look">${esc(AT.look)}</button><span style="margin-left:auto"></span><button class="btn" type="button" data-sa="fix">${esc(AT.fix)}</button><button class="btn btn-primary" type="button" data-sa="grant"${S.who ? '' : ' disabled'}>${esc(AT.grant)}</button></div>`
      + (S.who && S.why && S.why.uid === S.who.uid ? `<div class="sa-row sa-why" style="margin-top:10px"><span class="hint">${esc(fmt(AT.lookNow, { c: AT.lookCats[S.why.reasonCat], r: S.why.reason }))}${S.why.batch ? `（${esc(S.why.batch)}）` : ''}</span><button class="btn btn-sm" type="button" data-sa="lookwhy">${esc(AT.lookChange)}</button><small class="hint">${esc(AT.lookKeep)}</small></div>` : '')
      + `</div>`
      + (w ? `<div class="sa-kpi"><div><small>${esc(AT.bk.b)}</small><b>${fmtN(w.b)}</b></div><div><small>${esc(AT.bk.e)}</small><b>${fmtN(w.e)}</b></div><div><small>${esc(AT.bk.s)}</small><b>${fmtN(w.s)}</b></div><div><small>${esc(AT.bk.inv)}</small><b style="font-size:15px;line-height:1.7">${esc(invTxt || '—')}</b></div></div>` : '')
      + table + `<div class="card"><h3>${esc(AT.econH)}</h3><p class="hint">${esc(AT.econP)}</p>${econ}</div>`;
  }
  // 同事在帳本看到的那句（和前台同一套組句，例如「租了 7 天『燈下手寫信』」）
  const seenText = (e) => { const g = L.ledgerView({ [e.key || 'k']: e }, { items: S.items }).groups; return g.length ? g[0].rows[0].title : L.reasonText(e.r, e.key); };
  const fmtN = (v) => (Number.isFinite(v) ? Number(v).toLocaleString('en-US') : '—');
  // 查帳原因視窗：類別（三選一）＋說明（≥ 5 字）＋系統補帳的批次編號（選填）。選到 24 小時內填過的類別會自動帶入說明。
  async function askLook(p) {
    const body = document.createElement('div');
    body.innerHTML = `<p class="hint" style="margin:0 0 12px">${esc(AT.lookLead)}</p>`
      + `<label class="sa-f"><span>${esc(AT.lookCat)}</span><select class="sa-fld" id="saCat" required><option value="">${esc(AT.lookPick)}</option>${LOOK_CATS.map(c => `<option value="${c}">${esc(AT.lookCats[c])}</option>`).join('')}</select></label>`
      + `<label class="sa-f" id="saBatchRow" hidden><span>${esc(AT.lookBatch)}</span><input class="sa-fld" id="saBatch" maxlength="40" autocomplete="off"><small class="hint">${esc(AT.lookBatchHint)}</small></label>`;
    const sel = body.querySelector('#saCat'), batch = body.querySelector('#saBatch');
    sel.addEventListener('change', () => {
      body.querySelector('#saBatchRow').hidden = sel.value !== 'fix';
      const m = sel.value && rememberedLook(p.uid, now(), sel.value), f = document.getElementById('modalInput');
      if (m && f) { f.value = m.reason; f.dispatchEvent(new Event('input')); batch.value = m.batch || ''; }
    });
    const pr = o.modal({ title: fmt(AT.lookTitle, { n: p.name }), body, confirmText: AT.look, danger: false,
      input: { label: AT.lookWhy, hint: AT.lookHint, minLength: 5, maxlength: 200, multiline: false },
      run: async (reason) => checkLookReason(sel.value, reason, sel.value === 'fix' ? batch.value : '') });
    sel.focus();
    const res = await pr;
    return res && res.ok ? res.result : null;
  }
  /** 查帳。reuse：發放／撤銷／退款後重新整理同一位（沿用剛剛的原因）；ask：按「換原因」一定重填。 */
  async function look({ reuse = false, ask = false } = {}) {
    const name = (el('[data-sa="who"]') || {}).value || '';
    const p = ((o.people && o.people()) || []).find(x => x.name === name.trim());
    if (!p) { o.toast('找不到這位同事，請從清單選。', true); return; }
    let why = reuse && S.why && S.why.uid === p.uid ? S.why : (!ask && rememberedLook(p.uid, now())) || null;
    if (!why) { why = await askLook(p); if (!why) { if (S.who) render(); return; } }   // 取消：什麼都不查；已經在看某位時，姓名欄回到那位
    const { reasonCat, reason, batch } = why;
    S.who = p; S.why = { uid: p.uid, reasonCat, reason, ...(batch ? { batch } : {}) }; S.ledger = null; render();
    try {
      const r = await o.call('bankAdmin', { op: 'ledger', uid: p.uid, limit: 200, reasonCat, reason, ...(batch ? { batch } : {}) });
      S.ledger = { wallet: r.wallet || null, entries: (r.entries || []).map(e => ({ ...e, key: e.key || e.k })), inv: r.inv || null };
      saveLook(p.uid, S.why, now());
    } catch (e) {
      if (e && e.code === 'BAD_INPUT') { forgetLook(p.uid, reasonCat); S.why = null; }   // 銀行不收這個原因：下次重填
      o.toast(errText(e), true);
    }
    render();
  }
  async function grant() {
    if (!S.who) return;
    const body = document.createElement('div');
    body.innerHTML = `<p>對象：<b>${esc(S.who.name)}</b></p><label class="sa-f"><span>${esc(AT.grantAmt)}</span><input class="sa-fld" id="saAmt" type="number" min="-1000" max="1000" step="1"></label><label class="sa-f"><span>${esc(AT.grantNote)}</span><input class="sa-fld" id="saNote" maxlength="60"></label>`;
    await o.modal({ title: AT.grant, body, confirmText: '確定', danger: false, input: { label: AT.reason, hint: AT.reasonHint, maxlength: 200, multiline: false },
      run: async (reason) => {
        const a = Number(body.querySelector('#saAmt').value);
        if (!Number.isInteger(a) || a === 0 || Math.abs(a) > 1000) throw new Error('光點要是 ±1～1000 的整數。');
        const note = body.querySelector('#saNote').value.trim();
        try { await o.call('bankAdmin', { op: 'grant', uids: [S.who.uid], amount: a, reason, ...(note ? { note } : {}), rid: `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}` }); }
        catch (e) { throw new Error(errText(e)); }
      } });
    look({ reuse: true });
  }
  async function revoke(key) {
    const body = document.createElement('div'); body.innerHTML = `<p>撤銷 <code>${esc(key)}</code>（${esc(S.who ? S.who.name : '')}）</p><label class="sa-f"><span>${esc(AT.grantNote)}</span><input class="sa-fld" id="saNote" maxlength="60"></label>`;
    await o.modal({ title: AT.revoke, body, confirmText: AT.revoke, input: { label: AT.reason, hint: AT.reasonHint, maxlength: 200, multiline: false },
      run: async (reason) => { const note = body.querySelector('#saNote').value.trim(); try { await o.call('bankAdmin', { op: 'revoke', uid: S.who.uid, key, reason, ...(note ? { note } : {}) }); } catch (e) { throw new Error(errText(e)); } } });
    look({ reuse: true });
  }
  async function refund(key) {
    const e = (S.ledger && S.ledger.entries || []).find(x => x.key === key); if (!e || !S.who) return;
    const it = S.items[e.i];
    const body = document.createElement('p'); body.textContent = fmt(AT.refundBody, { p: -e.a, n: S.who.name, i: it ? it.n : e.i || '' });
    await o.modal({ title: AT.refund, body, confirmText: AT.refund, input: { label: AT.reason, hint: AT.reasonHint, maxlength: 200, multiline: false },
      run: async (reason) => { try { await o.call('bankAdmin', { op: 'refund', uid: S.who.uid, bid: key.replace(/^buy_/, ''), reason }); } catch (err) { throw new Error(errText(err)); } } });
    look({ reuse: true });
  }
  async function fix() {
    const body = document.createElement('div'); body.innerHTML = `<label class="sa-f"><span>${esc(AT.fixMid)}</span><input class="sa-fld" id="saMid" maxlength="64"></label>`;
    await o.modal({ title: AT.fix, body, confirmText: AT.fix, danger: false, input: { label: AT.reason, hint: AT.reasonHint, maxlength: 200, multiline: false },
      run: async (reason) => { const mid = body.querySelector('#saMid').value.trim(); if (!L.validId(mid)) throw new Error('卡片 id 格式不對。'); try { await o.call('bankAdmin', { op: 'reprocess', mid, reason }); } catch (e) { throw new Error(errText(e)); } } });
  }

  // ---------------------------------------------------------------- 光效
  function fxHtml() {
    const s = S.fx;
    const num = (k) => `<label class="sa-f"><span>${esc(AT.fxF[k])}</span><input class="sa-fld" data-sa="n-${k}" type="number" min="${k === 'loop' ? 1 : 0}" max="${k === 'loop' ? 30 : 12}" value="${s[k]}">${k === 'loop' ? `<small class="hint">${esc(AT.loopHint)}</small>` : ''}</label>`;
    const fxRows = [['fx_firefly', 'firefly'], ['fx_stream', 'stream'], ['fx_snow', 'snow'], ['fx_frost', 'frost']].map(([g, style]) => {
      const off = !!s.off[g];
      return `<tr><td><div class="it"><span class="lx-li${style === 'snow' ? ' is-snow' : style === 'frost' ? ' is-frost' : ''}">${fxIcon(style)}</span>${esc(ST.fxNames[style])}<small><code>${esc(g)}</code></small></div></td><td><span class="st ${off ? 'off' : 'on'}">${esc(off ? AT.offSt : AT.inUse)}</span></td>`
        + `<td><button class="sa-sw${off ? '' : ' on'}" type="button" role="switch" aria-checked="${!off}" data-sa="fxoff" data-g="${g}" aria-label="${esc(ST.fxNames[style])}"></button></td></tr>`;
    }).join('');
    const sw = (k, on, label, sub = '') => `<div class="sa-row"><button class="sa-sw${on ? ' on' : ''}" type="button" role="switch" aria-checked="${on}" data-sa="em" data-k="${k}" aria-label="${esc(label)}"></button><b>${esc(label)}</b>${sub ? `<span class="hint">${esc(sub)}</span>` : ''}</div>`;
    return `<h2>${esc(AT.fxH)}</h2><p class="hint">${esc(AT.fxLead)}</p>`
      + `<div class="card"><h3>${esc(AT.maxH)}</h3><p class="hint">${esc(AT.maxP)}</p><div class="sa-f4">${['mobile', 'desk', 'big', 'loop'].map(num).join('')}</div><div class="sa-row" style="margin-top:12px"><button class="btn btn-primary" type="button" data-sa="fxsave">${esc(AT.fxSave)}</button></div></div>`
      + `<div class="card"><h3>${esc(AT.each)}</h3><p class="hint">${esc(AT.eachP)}</p><div class="table-wrap"><table class="sa-tbl"><thead><tr>${AT.fxCol.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${fxRows}</tbody></table></div></div>`
      + `<div class="card sa-em"><h3>${esc(AT.emH)}</h3><p class="hint">${esc(AT.emP)}</p><div class="sa-row" style="gap:28px">${sw('still', s.still, AT.em.still)}${sw('shop', S.cfg.shopOpen !== true, AT.em.shop, AT.emShopSub)}${sw('earn', S.cfg.pauseEarn === true, AT.em.earn)}</div></div>`;
  }
  const fxPlain = () => ({ desk: S.fx.desk, big: S.fx.big, mobile: S.fx.mobile, loop: S.fx.loop, still: S.fx.still, off: { ...S.fx.off } });
  async function saveFx(next, title) {
    await o.modal({ title, body: document.createTextNode(''), confirmText: AT.save, danger: false, input: { label: AT.reason, hint: AT.reasonHint, maxlength: 200, multiline: false },
      run: async (reason) => { await o.writeFx(next, reason); } });
  }
  async function onFxSave() {
    const next = fxPlain();
    for (const k of ['desk', 'big', 'mobile', 'loop']) {
      const v = Number(el(`[data-sa="n-${k}"]`).value), lo = k === 'loop' ? 1 : 0, hi = k === 'loop' ? 30 : 12;
      if (!Number.isInteger(v) || v < lo || v > hi) { o.toast(`${AT.fxF[k]}要是 ${lo}～${hi} 的整數。`, true); return; }
      next[k] = v;
    }
    await saveFx(next, AT.maxH);
  }
  async function onEm(k) {
    if (k === 'still') { const next = fxPlain(); next.still = !next.still; await saveFx(next, AT.em.still); return; }
    const paused = k === 'shop' ? S.cfg.shopOpen !== true : S.cfg.pauseEarn === true;
    const label = k === 'shop' ? AT.em.shop : AT.em.earn;
    await o.modal({ title: `${paused ? '恢復' : ''}${label}`, body: document.createTextNode(''), confirmText: '確定', danger: !paused, input: { label: AT.reason, hint: AT.reasonHint, maxlength: 200, multiline: false },
      run: async (reason) => { try { await o.call('bankAdmin', { op: 'pause', ...(k === 'shop' ? { shopOpen: paused } : { pauseEarn: !paused }), reason }); } catch (e) { throw new Error(errText(e)); } } });
  }

  // ---------------------------------------------------------------- 事件
  function onClick(e) {
    const b = e.target.closest('[data-sa]'); if (!b || !o.root.contains(b)) return;
    const k = b.dataset.sa;
    if (k === 'filter') { S.filter = b.dataset.v; render(); }
    else if (k === 'edit') openEditor(b.dataset.sku);
    else if (k === 'add') openEditor('');
    else if (k === 'onoff') onoff(b.dataset.sku);
    else if (k === 'seed') seed();
    else if (k === 'look') look();
    else if (k === 'lookwhy') look({ ask: true });
    else if (k === 'grant') grant();
    else if (k === 'fix') fix();
    else if (k === 'revoke') revoke(b.dataset.key);
    else if (k === 'refund') refund(b.dataset.key);
    else if (k === 'lgf') { S.lgFilter = b.dataset.v; render(); }
    else if (k === 'fxsave') onFxSave();
    else if (k === 'fxoff') { const next = fxPlain(); if (next.off[b.dataset.g]) delete next.off[b.dataset.g]; else next.off[b.dataset.g] = true; saveFx(next, AT.each); }
    else if (k === 'em') onEm(b.dataset.k);
  }
  function onInput(e) { const t = e.target; if (t.dataset && t.dataset.sa === 'q') { S.q = t.value; const pos = t.selectionStart; render(); const n = el('[data-sa="q"]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } } }
  function onKey(e) { if (e.key === 'Enter' && e.target.dataset && e.target.dataset.sa === 'who') look(); }
  o.root.addEventListener('click', onClick);
  o.root.addEventListener('input', onInput);
  o.root.addEventListener('keydown', onKey);
  return { start, render, stop() { offs.forEach(f => { try { f(); } catch (e) { /* 略 */ } }); }, state: S, reloadStats: loadStats };
}
