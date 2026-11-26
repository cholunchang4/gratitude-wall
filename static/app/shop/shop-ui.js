// T102 拾光小舖：畫面（入口燈籠＋光瓶、店面三分頁、商品詳情、購買、抽屜、帳本、第一次進店、暫停營業、到期提醒、開店公告）。
// 設計：design/拾光小舖/設計規格.md 第 4～13 節；文字：shop-text.js（文字美學官定稿）。
// 資料只透過 o.api（shop-api.js 的介面）；購買只呼叫 api.spend(sku, bid)，bid 在打開確認框時產生，重試沿用同一個。
// 不催、不炫富：沒有倒數秒數、沒有紅字餘額不足、沒有熱賣；光點不夠只寫「還差 N 光點」。
import { T, fmt } from './shop-text.js';
import * as L from './shop-logic.js';
import { DEFAULT_ITEMS } from './shop-catalog.js';
import { slot } from '../popup-slot.js';   // T113（6.6.1）一次開頁最多一個自己跳出來的東西：開店公告＝優先 3、到期提醒＝優先 5
import { activeEquip, titleText, SLOT_OF_TY } from './equip.js';
import { esc, ensureDefs, ic, dot, xiaoying, lantern, jar, pack, smallThumb, typeIcon, realThumb, whereHtml, whereOf, safePhoto } from './shop-art.js';
import { VIEWS, CMP_TY, viewLabel, capOf, RULE_ICONS, whoHtml, previewStage, chipsHtml, dexHtml, tourPage, skyBg, TOUR_PAGES } from './shop-preview.js';

const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 無痕視窗存不了：這次照樣 */ } },
};
// tour＝小螢帶你逛一圈看過了（6.6；一打開就記，按跳過也算）
export const SHOP_KEYS = { first: 'shop_first_seen', exp: 'shop_exp_seen', notice: 'shop_open_notice', dot: 'shop_entry_seen', tour: 'shop_tour_seen' };
const THEME_CLS = { 'theme-lamp': 't-lamp', 'theme-snowlantern': 't-snowlantern' };
// 第一期還沒上架、圖鑑標「之後上架」的東西（光印、節日小物）；上架後（shop/items on:true）就照一般商品
const LATER_SKUS = ['st_basic', 'gf_tangyuan'];
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';
const OPEN_NOTICE_DAYS = 14;

/**
 * o = {
 *   api（shop-api.js）, nowMs(), start（開店時間 ms）, amounts?（K.BANK.amounts）,
 *   meName(), meInitial(), meColor(), recentCard() → { text, receiver, theme } | null, msgOf(mid) → { r, x, anon, author } | null,
 *   fx（fx.js 的 createFx 結果，用來畫預覽）, getStatic() → bool, setStatic(v) → Promise, reducedMotion() → bool,
 *   useItem({ g, ty, th, fx }) 關掉小舖、撰寫區選好, toast(text), visible?() → 入口要不要出現（預設：開店後）,
 *   canPopup?() → 現在能不能跳到期提醒／開店公告（其他視窗開著時先等）
 * }
 */
export function createShopUI(o) {
  const doc = o.doc || document;
  const now = () => o.nowMs();
  const api = o.api;
  const st = { tab: 'shop', layers: [], buy: null, detail: null, gone: new Set(), lastBal: null, ent: null, entM: null, bottles: [], welcomeT: null, loaded: false, expShown: false };
  ensureDefs(doc);

  // ---------------------------------------------------------------- 資料
  const items = () => { const v = api.st.items || {}; const out = {}; for (const [k, it] of Object.entries(v)) if (!st.gone.has(k)) out[k] = it; return out; };
  const inv = () => api.st.inv || {};
  const bal = () => api.balance;
  const allItemsForLookup = () => ({ ...L.normItems(DEFAULT_ITEMS), ...(api.st.items || {}) });
  const isOpen = () => api.shopOpen && Object.keys(items()).length > 0;

  // ---------------------------------------------------------------- 6.6 預覽櫥窗、真實小樣用的「你」
  // 櫥窗期＝previewAt（K.BANK.shop.previewAt）～開店：入口提前出現、能逛不能買（伺服器本來就擋開店前購買）
  const previewAt = Number(o.previewAt) || 0;
  const isPreview = () => !!previewAt && now() >= previewAt && now() < (o.start || 0);
  const mode = () => (isPreview() ? 'pre' : now() >= (o.start || 0) ? 'open' : 'before');
  let preDefaults = null;   // shop/items 還沒匯入時，櫥窗用預設商品裡上架的那些
  const shopItems = () => {
    if (!isPreview()) return items();
    const v = items(); if (Object.keys(v).length) return v;
    if (!preDefaults) preDefaults = L.normItems(Object.fromEntries(Object.entries(DEFAULT_ITEMS).filter(([, x]) => x.on === true)));
    return preDefaults;
  };
  // 貨架：櫥窗期用「開店那一刻」排（冬季光櫃看得到、冬至商品還沒有），而且不看擁有、不算還差多少
  const shelves = () => (isPreview()
    ? L.buildShelves(shopItems(), { now: o.start, inv: {}, bal: Infinity, sold: api.st.sold || {} })
    : L.buildShelves(items(), { now: now(), inv: inv(), bal: bal(), sold: api.st.sold || {} }));
  const tabList = () => (isPreview() ? ['shop', 'dex'] : ['shop', 'dex', 'drawer', 'ledger']);
  const isMobile = () => { try { return doc.defaultView.matchMedia('(max-width: 767px)').matches; } catch (e) { return false; } };
  const themeOf = (th) => (o.themeClass && o.themeClass(th)) || THEME_CLS[th] || 't-classic';
  /** 預覽用的 ctx（shop-preview.js）：本人姓名、縮寫、顏色、頭像照片、最近一張卡（沒有就用示範句） */
  function pctx() {
    const rc0 = o.recentCard ? o.recentCard() : null;
    const has = !!(rc0 && rc0.text);
    const theme = has && rc0.theme && !L.ADMIN_THEMES.has(rc0.theme) ? rc0.theme : 'theme-classic';
    const filled = o.mePcFilled ? o.mePcFilled() : null;
    return {
      me: { name: o.meName ? o.meName() : '', ini: o.meInitial ? o.meInitial() : '', color: o.meColor ? o.meColor() : '#7c3aed', photo: safePhoto(o.meAvatar ? o.meAvatar() : '') },
      rc: has ? { text: rc0.text, to: rc0.receiver || T.detail.demoTo } : { text: T.detail.demoText, to: T.detail.demoTo },
      demo: !has, mobile: isMobile(), now: now(), themeOf, cardCls: themeOf(theme), pre: isPreview(), filled: Number.isInteger(filled) ? filled : null,
    };
  }
  /** 星光存摺的數字（櫥窗期店頭用）：錢包有就用錢包，沒有就把帳本加起來；都讀不到回 null（畫面寫「小螢記下了」） */
  function passbookN() {
    const w = api.st.wallet;
    if (w && Number.isFinite(w.b)) return w.b;
    if (api.st.ledgerOk) return Object.values(api.st.ledger || {}).reduce((s, v) => s + (v && typeof v.a === 'number' ? v.a : 0), 0);
    return null;
  }

  // ---------------------------------------------------------------- 入口：牆角燈籠＋光瓶
  function bottleHtml(dark) {
    const b = bal();
    return `<button class="bt${dark ? ' is-dark' : ''}" type="button" data-sh="ledger" title="${esc(`${b} ${T.bottleUnit}`)}" aria-label="${esc(fmt(T.bottleAria, { n: b }))}">${jar(L.jarDots(b))}<b class="bt-num">${b}</b><small>${esc(T.bottleUnit)}</small></button>`;
  }
  /** tools：桌機右上工具列（光瓶放在最前面）；mobileBar：手機「牆面／清單」切換列（燈籠＋光瓶合一顆） */
  function mountEntry({ tools = null, mobileBar = null } = {}) {
    if (!st.ent) {
      st.ent = doc.createElement('button');
      st.ent.type = 'button'; st.ent.className = 'ent'; st.ent.dataset.label = T.entryLabel; st.ent.setAttribute('aria-label', T.entryLabel);
      st.ent.innerHTML = lantern() + `<span class="ent-bal" aria-hidden="true"><b class="bt-num">0</b><small>${esc(T.bottleUnit)}</small></span>` + '<span class="dot-new" aria-hidden="true" hidden></span>';   // ent-bal：769～1279 寬時右上放不下光瓶，餘額改放在燈籠旁
      st.ent.addEventListener('click', onEntry);
      doc.body.appendChild(st.ent);
    }
    if (tools && !tools.querySelector('.bt[data-sh-own]')) {
      tools.insertAdjacentHTML('afterbegin', bottleHtml(false));
      const b = tools.querySelector('.bt'); b.dataset.shOwn = '1'; b.addEventListener('click', () => open('ledger'));
    }
    if (mobileBar && !st.entM) {
      st.entM = doc.createElement('button');
      st.entM.type = 'button'; st.entM.className = 'ent-bt';
      mobileBar.appendChild(st.entM);
      st.entM.addEventListener('click', onEntry);
    }
    paintEntry();
  }
  function paintEntry() {
    // 入口：櫥窗期（previewAt 起）就出現；光瓶（右上工具列）開店後才出現（光點 12/1 才倒進光瓶）
    const pre = isPreview();
    const from = previewAt && previewAt < (o.start || 0) ? previewAt : (o.start || 0);
    const vis = o.visible ? o.visible() : now() >= from;
    const bottleVis = vis && !pre;
    const newDot = !LS.get(SHOP_KEYS.dot);
    const b = bal();
    if (st.ent) {
      st.ent.hidden = !vis; const d = st.ent.querySelector('.dot-new'); if (d) d.hidden = !newDot;
      st.ent.classList.toggle('is-pre', pre);
      const n = st.ent.querySelector('.ent-bal .bt-num'); if (n) n.textContent = String(b);
      st.ent.setAttribute('aria-label', pre ? T.pre.entryAria : fmt(T.entryMobileAria, { n: b }));
    }
    // 櫥窗期：燈籠上方一張小籤（第一次點進小舖之後收起；不跳任何彈窗）
    if (st.ent && pre && newDot && !st.preTag) {
      st.preTag = doc.createElement('span');
      st.preTag.className = 'pre-tag'; st.preTag.setAttribute('aria-hidden', 'true');   // 燈籠本身的 aria-label 已經寫「12/1 開張」
      st.preTag.innerHTML = `${ic('shop')}<span>${esc(T.pre.tagA)} <b>${esc(T.pre.tagB)}</b>${esc(T.pre.tagC)}</span>`;   // 6.6r 小修：包成一段，flex gap 不再把「，先來逛逛」前面撐出空格
      st.preTag.addEventListener('click', onEntry);
      doc.body.appendChild(st.preTag);
    }
    if (st.preTag) st.preTag.hidden = !(vis && pre && newDot);
    if (st.entM) {
      st.entM.hidden = !vis;
      st.entM.setAttribute('aria-label', pre ? T.pre.entryAria : fmt(T.entryMobileAria, { n: b }));
      st.entM.innerHTML = lantern() + (pre ? `<span class="pre-m">${esc(T.pre.mobile)}</span>` : `<b class="bt-num">${b}</b><small>${esc(T.bottleUnit)}</small>`) + (newDot ? '<span class="dot-new" aria-hidden="true"></span>' : '');
    }
    doc.querySelectorAll('.bt[data-sh-own]').forEach(btn => {
      btn.hidden = !bottleVis;
      btn.setAttribute('aria-label', fmt(T.bottleAria, { n: b })); btn.title = `${b} ${T.bottleUnit}`;
      const svg = btn.querySelector('svg'); if (svg) svg.outerHTML = jar(L.jarDots(b));
      const num = btn.querySelector('.bt-num'); if (num) num.textContent = String(b);
    });
    doc.querySelectorAll('.sh-head .bt').forEach(btn => { btn.setAttribute('aria-label', fmt(T.bottleAria, { n: b })); const num = btn.querySelector('.bt-num'); if (num) num.textContent = String(b); });
  }
  function onEntry() {
    if (noticeDue() && LS.get(SHOP_KEYS.notice) !== 'go') { showOpenNotice(); return; }
    open('shop');
  }
  /** 光點亮起：光瓶放大發光 0.6 秒、一顆光點飛進去（減少動態時只換數字） */
  function catchLight(from) {
    const target = [...doc.querySelectorAll('.bt[data-sh-own], .ent-bt, .sh-head .bt')].find(x => !x.hidden && x.getClientRects().length);
    if (!target) return;
    target.classList.remove('is-catch'); void target.offsetWidth; target.classList.add('is-catch');
    setTimeout(() => target.classList.remove('is-catch'), 700);
    if (o.reducedMotion && o.reducedMotion()) return;
    const r = target.getBoundingClientRect(), W = doc.defaultView.innerWidth, H = doc.defaultView.innerHeight;
    const f = from || { x: W / 2, y: H - 90 };
    const s = doc.createElement('span'); s.className = 'bt-fly'; s.style.left = `${f.x - 7}px`; s.style.top = `${f.y - 7}px`;
    doc.body.appendChild(s);
    const dx = r.left + 16 - f.x, dy = r.top + 18 - f.y;
    const an = s.animate ? s.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(.6)`, opacity: .4 }], { duration: 700, easing: 'cubic-bezier(.22,1,.36,1)' }) : null;
    setTimeout(() => s.remove(), an ? 720 : 0);
  }

  // ---------------------------------------------------------------- 圖層（店面、詳情、購買疊在一起；Esc 關最上層，焦點回原處）
  function pushLayer(el, onClose) {
    const back = doc.activeElement;
    doc.body.appendChild(el);
    const layer = { el, back, onClose };
    st.layers.push(layer);
    return layer;
  }
  function popLayer(layer, { silent = false } = {}) {
    const i = st.layers.indexOf(layer); if (i < 0) return;
    st.layers.splice(i, 1);
    layer.el.remove();
    if (layer.onClose) layer.onClose();
    if (!silent && layer.back && layer.back.isConnected && layer.back.focus) layer.back.focus();
  }
  // 鍵盤：只處理最上層（焦點可能在停用的按鈕上、落在 body，所以掛在 document）
  doc.addEventListener('keydown', (e) => { const top = st.layers[st.layers.length - 1]; if (top) onLayerKey(e, top); });
  function onLayerKey(e, layer) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (layer === (st.buy && st.buy.layer) && st.buy.busy) return; popLayer(layer); return; }
    if (e.key !== 'Tab') return;
    const f = [...layer.el.querySelectorAll(FOCUSABLE)].filter(x => x.getClientRects().length && !x.closest('[hidden]'));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!layer.el.contains(doc.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
    if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  const shopLayer = () => st.layers.find(l => l.el.classList.contains('is-shop')) || null;

  // ---------------------------------------------------------------- 店面
  function headHtml(mood, say) {
    const stars = Array.from({ length: 30 }, (_, i) => `<circle cx="${(i * 191) % 1120}" cy="${(i * 37) % 90}" r="${i % 5 ? 0.9 : 1.6}" fill="#fff6e0" opacity=".6"/>`).join('');
    const lamps = [520, 575, 630, 685, 740, 795, 850].map((x, i) => `<g transform="translate(${x} ${(44 + Math.sin(i) * 6).toFixed(1)})"><path d="M0 0v6" stroke="#8a4b1a"/><rect x="-7" y="6" width="14" height="16" rx="6" fill="url(#xfLamp)" opacity=".95"/><circle cy="14" r="18" fill="rgba(255,180,80,.18)"/></g>`).join('');
    const jars = [630, 680, 730, 780, 830, 870].map((x, i) => `<g transform="translate(${x} 78)"><rect x="-9" y="0" width="18" height="24" rx="5" fill="rgba(220,235,255,.35)" stroke="rgba(255,255,255,.5)"/><circle cy="14" r="${3 + (i % 2)}" fill="#ffc24a"/><circle cy="14" r="10" fill="rgba(255,194,74,.25)"/></g>`).join('');
    return `<header class="sh-head"><svg class="scene" viewBox="0 0 1120 168" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${stars}`
      + `<g class="deco"><path d="M490 40q130 30 260 0q70-16 130 2" stroke="rgba(255,230,190,.5)" stroke-width="1.4" fill="none"/>${lamps}<rect x="600" y="104" width="300" height="80" rx="6" fill="#5a3418"/><rect x="600" y="100" width="300" height="10" rx="3" fill="#8a5a2a"/>${jars}</g>`
      + '<path d="M0 150q280-30 560 0t560-6V168H0z" fill="rgba(20,12,30,.35)"/></svg>'
      + `<div class="title"><h2 id="shT"><small>${esc(T.shopKicker)}</small>${esc(T.shop)}</h2></div>`
      + `<div class="xfw">${xiaoying(mood)}</div><div class="say"><p class="xf-say" role="status">${esc(say)}</p></div>`
      + `<div class="right">${isPreview() ? passbookHtml() : bottleHtml(true)}<button class="pv-help" type="button" data-sh="tour" aria-label="${esc(T.help)}" title="${esc(T.help)}"><svg aria-hidden="true" focusable="false"><use href="#si-help"/></svg></button></div>`
      + `<button class="sh-x" type="button" data-sh="close" aria-label="${esc(T.close)}">${ic('x')}</button></header>`;
  }
  /** 櫥窗期店頭右上：星光存摺（只有自己看得到） */
  function passbookHtml() {
    const n = passbookN();
    const aria = n === null ? T.pre.pbAriaFail : fmt(T.pre.pbAria, { n });
    return `<span class="pre-pb" role="img" aria-label="${esc(aria)}">${jar(L.jarDots(n || 0))}<span class="t"><small><span class="l">${esc(T.pre.pb)}</span><span class="s">${esc(T.pre.pbShort)}</span></small>`
      + `<b>${n === null ? esc(T.pre.pbFail) : `${n}<em>${esc(T.bottleUnit)}</em>`}</b></span></span>`;
  }
  function open(tab = 'shop') {
    LS.set(SHOP_KEYS.dot, '1');
    if (api.watchLedger) api.watchLedger();
    if (o.onOpen) { try { o.onOpen(); } catch (e) { /* 頭像、說明書讀不到：預覽照樣用縮寫 */ } }
    if (!tabList().includes(tab)) tab = 'shop';
    const exist = shopLayer();
    if (exist) { setTab(tab); return; }
    const first = !LS.get(SHOP_KEYS.first) && tab === 'shop' && isOpen();
    st.tab = tab; st.first = first; st.closing = false;
    const ov = doc.createElement('div');
    ov.className = 'sh-overlay is-shop';
    ov.innerHTML = '<section class="sh-box" role="dialog" aria-modal="true" aria-labelledby="shT"></section>';
    const layer = pushLayer(ov, () => { clearTimeout(st.welcomeT); st.first = false; paintEntry(); });
    ov.addEventListener('click', onShopClick);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) popLayer(layer); });
    renderShop();
    const f = ov.querySelector('.sh-tab[aria-selected="true"]') || ov.querySelector('.sh-x'); if (f) f.focus();
    // 第一次打開（開店後或櫥窗期都算）：先「小螢帶你逛一圈」，關掉之後才播「光瓶亮起來了」；暫停營業時不自動跳
    const tour = !LS.get(SHOP_KEYS.tour) && (isOpen() || isPreview());
    if (first) LS.set(SHOP_KEYS.first, String(now()));
    if (tour) openTour(1, { after: first ? () => { if (!st.closing && shopLayer()) showWelcome(); } : null });
    else if (first) showWelcome();
    paintEntry();
  }
  function close() { st.closing = true; const l = shopLayer(); while (st.layers.length) popLayer(st.layers[st.layers.length - 1], { silent: true }); if (l && l.back && l.back.focus) l.back.focus(); }
  function setTab(tab) { if (!tabList().includes(tab)) tab = 'shop'; st.tab = tab; renderShop(); const t = doc.querySelector(`.sh-tab[data-tab="${tab}"]`); if (t) t.focus(); }
  function sayFor() {
    if (isPreview()) return ['smile', T.pre.say];
    if (st.tab === 'drawer') return ['smile', T.say.drawer];
    if (st.tab === 'ledger') return api.st.ledgerOk && !Object.keys(api.st.ledger || {}).length ? ['smile', T.say.ledgerEmpty] : ['smile', T.say.ledger];
    if (!isOpen() && api.st.itemsOk !== false) return ['sleepy', T.say.closed];
    if (st.tab === 'dex') return ['smile', T.dex.say];
    if (st.first) return ['happy', T.say.first];
    return ['smile', T.say.shop];
  }
  const TAB_ICON = { shop: 'shop', dex: 'book', drawer: 'drawer', ledger: 'ledger' };
  function renderShop() {
    const l = shopLayer(); if (!l) return;
    if (!tabList().includes(st.tab)) st.tab = 'shop';   // 櫥窗期只有小舖、圖鑑
    st.mode = mode();
    const box = l.el.querySelector('.sh-box');
    const [mood, say] = sayFor();
    const tab = (k) => `<button class="sh-tab" role="tab" type="button" id="shTab-${k}" data-tab="${k}" aria-selected="${st.tab === k}" aria-controls="shPanel" tabindex="${st.tab === k ? 0 : -1}">${ic(TAB_ICON[k])}${esc(T.tabs[k])}</button>`;
    const scroll = box.querySelector('.sh-body') ? box.querySelector('.sh-body').scrollTop : 0;
    const keepWelcome = box.querySelector('.sh-welcome');
    st.pctx = pctx();
    box.innerHTML = headHtml(mood, say)
      + `<nav class="sh-tabs" role="tablist" aria-label="${esc(T.shop)}">${tabList().map(tab).join('')}</nav>`
      + `<div class="sh-body" id="shPanel" role="tabpanel" aria-labelledby="shTab-${st.tab}" tabindex="-1">${st.tab === 'drawer' ? drawerHtml() : st.tab === 'ledger' ? ledgerHtml() : st.tab === 'dex' ? dexTabHtml() : shelvesHtml()}</div>`;
    if (keepWelcome) box.appendChild(keepWelcome);
    if (st.lastTab === st.tab) box.querySelector('.sh-body').scrollTop = scroll;
    st.lastTab = st.tab;
    box.querySelectorAll('.sh-mini.lx').forEach(m => { if (o.reducedMotion && o.reducedMotion()) m.classList.remove('lx-live'); });
  }
  function shelvesHtml() {
    const pre = isPreview();
    if (!pre && api.st.itemsOk === false && !Object.keys(api.st.items || {}).length) return `<div class="sh-load">${xiaoying('sleepy', '')}<p>${esc(T.readFail)}</p></div>`;
    if (!pre && !isOpen()) return closedHtml();
    const sh = shelves();
    st.rec = st.first && !pre ? recommend(sh) : null;
    const sec = (k, iconId, extra = '') => !sh[k].length ? '' : `<section class="sh-shelf" aria-labelledby="h-${k}"><header><h3 id="h-${k}">${ic(iconId)}${esc(T.shelves[k].h)}</h3><p>${esc(T.shelves[k].p)}</p>${extra}</header>`
      + `<ul class="sh-grid">${sh[k].map(itemCardHtml).join('')}</ul></section>`;
    const hl = st.rec;
    const tp = hl && hl.g === 'fx_stream' ? T.tipStream : T.tip;
    const tip = hl ? `<div class="sh-tip">${xiaoying('point', '')}<p>${esc(tp.lead)}<small>${esc(tp.small)}</small></p><button class="sk-btn primary" type="button" data-sh="item" data-key="${esc(hl.key)}">${esc(tp.btn)}</button></div>` : '';
    const bar = pre ? `<div class="pre-bar" role="note"><span class="cal" aria-hidden="true"><small>${esc(T.pre.cal[0])}</small><b>${esc(T.pre.cal[1])}</b></span><p><strong>${esc(T.pre.barH)}</strong>${esc(T.pre.barP)}</p>`
      + `<button class="sk-btn dark" type="button" data-sh="tour">${ic('help')}${esc(T.help)}</button></div>` : '';
    return tip + bar + sec('try', 'once') + sec('home', 'home') + sec('season', 'snow', `<span class="season">${esc(T.shelves.season.pill)}</span>`)
      + `<p class="sh-foot">${ic('lock')}${esc(T.footLock)}</p>`;
  }
  /** 圖鑑分頁：七類，依貨架上的商品分組；光印、節日小物還沒上架時標「之後上架」 */
  function dexTabHtml() {
    const pre = isPreview();
    if (!pre && api.st.itemsOk === false && !Object.keys(api.st.items || {}).length) return `<div class="sh-load">${xiaoying('sleepy', '')}<p>${esc(T.readFail)}</p></div>`;
    const sh = pre || isOpen() ? shelves() : { try: [], home: [], season: [] };
    const cards = [...sh.try, ...sh.home, ...sh.season];
    const later = LATER_SKUS.filter(k => DEFAULT_ITEMS[k]).map(k => ({ sku: k, name: DEFAULT_ITEMS[k].n }));
    return dexHtml(cards, later, st.pctx || pctx()) + `<p class="sh-foot">${ic('lock')}${esc(T.footLock)}</p>`;
  }
  // 新手推薦：沒有螢火推螢火；已經有螢火（次數）就推流光；兩樣都有就不推
  function recommend(sh) {
    const has = (g) => L.invState(inv()[g], now()).count > 0;
    if (!has('fx_firefly')) return sh.try.find(c => c.key === 'fx_firefly@try') || null;
    if (!has('fx_stream')) return sh.try.find(c => c.key === 'fx_stream@try') || null;
    return null;
  }
  function closedHtml() {
    return `<div class="sh-closed">${xiaoying('sleepy', '')}<h3>${esc(T.closed.h)}</h3><p>${esc(api.earnPaused ? T.closed.pPaused : T.closed.p)}</p></div>`;
  }
  function itemCardHtml(c) {
    // 櫥窗期 shelves() 不看擁有、不算還差（c.own、c.short 都是空的）
    const ownTxt = c.own === 'perm' ? T.card.owned : c.own === 'rent' ? (c.ownToday ? T.card.rentToday : fmt(T.card.rentLeft, { d: c.ownDays })) : c.own === 'pack' ? fmt(T.card.packLeft, { n: c.ownN }) : '';
    const price = c.own === 'perm' ? `<span class="price">${esc(T.card.owned)}</span>` : c.own ? `<span class="price">${esc(ownTxt)}</span>` : `<span class="price">${dot()}${c.featured.p}<small>${esc(T.bottleUnit)}</small></span>`;
    const short = c.short && c.own !== 'perm' ? `<span class="short">${esc(fmt(T.card.short, { n: c.short }))}</span>` : '';
    const where = T.where[whereOf(c.featured)[1]];
    const aria = fmt(T.card.aria, { name: c.name, tag: c.tag, p: c.featured.p }) + (c.own === 'perm' ? T.card.ariaOwned : c.own ? T.card.ariaDrawer : '') + fmt(T.whereAria, { w: where });
    const isHl = !!st.rec && st.rec.key === c.key;
    const ctx = st.pctx || pctx();
    return `<li><button class="pc-item${c.own === 'perm' ? ' is-owned' : ''}${isHl ? ' is-hl' : ''}${isPreview() ? ' is-pre' : ''}" type="button" data-sh="item" data-key="${esc(c.key)}" aria-label="${esc(aria)}">`
      + `<span class="th">${realThumb(c, ctx)}${c.own ? `<span class="own">${ic('check')}${esc(c.own === 'perm' ? T.card.owned : T.card.inDrawer)}</span>` : ''}${whereHtml(c.featured)}</span>`
      + `<span class="meta"><h4>${esc(c.name)}</h4><span class="sh-chip${c.featured.k === 'perm' ? ' is-perm' : ''}">${typeIcon(c.featured)}${esc(c.tag)}</span>`
      + (c.note ? `<span class="note">${esc(c.note)}</span>` : '') + (c.low ? `<span class="low">${esc(T.card.lowStock)}</span>` : '')
      + `<span class="row">${price}${short}</span></span></button></li>`;
  }
  function onShopClick(e) {
    const t = e.target.closest('[data-sh], [data-tab]'); if (!t) return;
    if (t.dataset.tab) { setTab(t.dataset.tab); return; }
    const k = t.dataset.sh;
    if (k === 'close') close();
    else if (k === 'ledger') setTab('ledger');
    else if (k === 'item') openDetail(t.dataset.key);
    else if (k === 'later') openDetail(`later:${t.dataset.sku}`);
    else if (k === 'tour') openTour(1);
    else if (k === 'more') { api.moreLedger(); }
    else if (k === 'filter') { st.lgFilter = t.dataset.v; renderShop(); const b = doc.querySelector(`[data-sh="filter"][data-v="${t.dataset.v}"]`); if (b) b.focus(); }
    else if (k === 'use') { const r = t.dataset.g; const it = Object.values(allItemsForLookup()).find(x => x.g === r); close(); if (o.useItem && it) o.useItem({ g: it.g, ty: it.ty, th: it.th, fx: it.fx }); }
    else if (k === 'again') openBuyBySku(t.dataset.sku);
    else if (k === 'static') setStatic(t.dataset.v === '1', t);
    else if (k === 'eq-on') wear(t.dataset.slot, t.dataset.g);
    else if (k === 'eq-off') wear(t.dataset.slot, null);
    else if (k === 'eq-pick') openTitlePicker(t.dataset.g);
  }
  // 方向鍵切換分頁（role=tablist）
  doc.addEventListener('keydown', (e) => {
    const t = e.target.closest && e.target.closest('.sh-tab'); if (!t || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    const order = tabList(), n = order.length; const i = Math.max(0, order.indexOf(t.dataset.tab));
    e.preventDefault(); setTab(order[(i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n]);
  });

  // ---------------------------------------------------------------- 小螢帶你逛一圈（5 頁；← → 換頁、Esc＝跳過、Tab 鎖在框內、關掉後焦點回原處）
  function openTour(p = 1, { after = null } = {}) {
    LS.set(SHOP_KEYS.tour, String(now()));   // 一打開就記（按跳過也算看過）
    if (st.tour) { st.tour.p = p; renderTour(); return; }
    const ov = doc.createElement('div'); ov.className = 'tr-ov';
    ov.innerHTML = '<section class="tr-box" role="dialog" aria-modal="true" aria-labelledby="trH" aria-describedby="trStep"></section>';
    const layer = pushLayer(ov, () => { st.tour = null; if (after) after(); });
    st.tour = { layer, p: Math.max(1, Math.min(TOUR_PAGES, p)) };
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tr]'); if (!b || !st.tour) return;
      const k = b.dataset.tr;
      if (k === 'x') popLayer(layer);
      else if (k === 'prev') goTour(-1);
      else if (k === 'next') { if (st.tour.p >= TOUR_PAGES) popLayer(layer); else goTour(1); }
    });
    ov.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault(); goTour(e.key === 'ArrowRight' ? 1 : -1);
    });
    renderTour();
  }
  function goTour(d) { if (!st.tour) return; const p = Math.max(1, Math.min(TOUR_PAGES, st.tour.p + d)); if (p === st.tour.p) return; st.tour.p = p; renderTour(); }
  function renderTour() {
    const t = st.tour; if (!t) return;
    const box = t.layer.el.querySelector('.tr-box');
    const p = t.p, last = p === TOUR_PAGES, pre = isPreview();
    const pg = tourPage(p, pctx());
    box.innerHTML = `<div class="tr-art">${skyBg(p)}${pg.art}<span class="tr-step" id="trStep">${esc(fmt(T.tour.step, { p }))}</span><button class="tr-skip" type="button" data-tr="x">${esc(last ? T.tour.close : T.tour.skip)}</button></div>`
      + `<div class="tr-body"><h3 id="trH" tabindex="-1" aria-describedby="trStep">${esc(pg.h)}</h3>${pg.body}</div>`
      + `<div class="tr-foot"><span class="tr-dots" aria-hidden="true">${Array.from({ length: TOUR_PAGES }, (_, i) => `<i class="${i + 1 === p ? 'on' : ''}"></i>`).join('')}</span>`
      + (p > 1 ? `<button class="sk-btn light" type="button" data-tr="prev">${esc(T.tour.prev)}</button>` : '')
      + `<button class="sk-btn primary" type="button" data-tr="next">${esc(last ? (pre ? T.tour.startPre : T.tour.start) : T.tour.next)}</button></div>`;
    const h = box.querySelector('#trH'); if (h) h.focus();   // 換頁後焦點移到標題（讀出標題＋「N／5」）
  }

  // ---------------------------------------------------------------- 第一次進店：光瓶亮起來了
  function showWelcome() {
    const l = shopLayer(); if (!l) return;
    const rows = L.welcomeRows(api.st.ledger || {}, o.start || 0);
    if (!rows.length) return;
    const box = l.el.querySelector('.sh-box');
    const w = doc.createElement('div');
    w.className = 'sh-welcome'; w.setAttribute('role', 'status');
    w.innerHTML = `<h4>${esc(T.welcome.title)}</h4><ul>${rows.map((r, i) => `<li style="${o.reducedMotion && o.reducedMotion() ? '' : `opacity:0;animation:shRow .3s ease-out ${i * 0.3}s forwards`}">${dot(false)}<span>${esc(T.welcome[r.k])}</span><span class="lp-amt">＋${r.a}</span></li>`).join('')}</ul>`
      + `<p class="tot"><span>${esc(T.welcome.total)}</span><span>${esc(fmt(T.welcome.totalN, { n: bal() }))}</span></p>`;
    box.appendChild(w);
    rows.forEach((r, i) => setTimeout(() => catchLight({ x: doc.defaultView.innerWidth - 200, y: 200 + i * 28 }), 300 * i + 200));
    const done = () => { clearTimeout(st.welcomeT); w.remove(); doc.removeEventListener('pointerdown', done, true); };
    st.welcomeT = setTimeout(done, 5000);
    setTimeout(() => doc.addEventListener('pointerdown', done, true), 50);
  }

  // ---------------------------------------------------------------- 商品詳情
  function findCard(key) {
    if (String(key).startsWith('later:')) return laterCard(String(key).slice(6));
    const sh = shelves();
    return [...sh.try, ...sh.home, ...sh.season].find(c => c.key === key) || null;
  }
  /** 之後上架（光印、節日小物）：從圖鑑進來，用預設商品資料建一張只能看、不能買的卡 */
  function laterCard(sku) {
    if (!LATER_SKUS.includes(sku) || !DEFAULT_ITEMS[sku]) return null;
    const it = L.normItem(sku, DEFAULT_ITEMS[sku]); if (!it) return null;
    return { key: `later:${sku}`, g: it.g, name: it.n, ty: it.ty, offers: [it], all: [it], featured: it, ticket: false, tag: L.tagOf(it), later: true, sh: it.sh };
  }
  function openDetail(key, { sku = '', err = '' } = {}) {
    const c = findCard(key); if (!c) return;
    if (st.detail) popLayer(st.detail.layer, { silent: true });
    const ov = doc.createElement('div'); ov.className = 'sh-overlay is-detail';
    const layer = pushLayer(ov, () => { st.detail = null; });
    const own = isPreview() || c.later ? { perm: false } : L.invState(inv()[c.g], now());
    const offers = c.ticket ? c.offers : c.all;
    const pick = offers.find(x => x.sku === sku) || (own.perm ? offers.find(x => x.k === 'perm') : null) || c.featured;
    // 稱號款式：已經戴著同一個稱號就從戴著的那款開始看
    const worn = activeEquip((api.st.equip || {})[o.meId], now()).tt;
    const views = VIEWS[c.ty] || ['card'];
    st.detail = { layer, key, card: c, sku: pick.sku, view: views[0], err, cmp: false, tt: worn && worn.g === c.g ? worn.i : 0, seal: 0 };
    ov.addEventListener('click', onDetailClick);
    ov.addEventListener('change', (e) => { const r = e.target.closest('input[name="pdo"]'); if (r) { st.detail.sku = r.value; st.detail.err = ''; renderDetail(); const n = ov.querySelector(`input[value="${r.value}"]`); if (n) n.focus(); } });
    ov.addEventListener('keydown', onChipKey);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) popLayer(layer); });
    renderDetail();
    const f = ov.querySelector('.pd-cta .sk-btn:not([disabled])') || ov.querySelector('.pd-x'); if (f) f.focus();
  }
  function renderDetail() {
    const d = st.detail; if (!d) return;
    const c = d.card, offers = c.ticket ? c.offers : c.all;
    const it = offers.find(x => x.sku === d.sku) || c.featured;
    const pre = isPreview(), later = !!c.later, look = pre || later;   // 只能看、不能買
    const inv0 = look ? {} : inv(), b = bal(), n = now();
    const own = L.invState(inv0[it.g], n);
    const chk = L.offerCheck(it, { inv: inv0, bal: b, sold: api.st.sold || {}, now: n });
    const tx = L.offerTexts(it, { now: pre ? o.start : n, inv: inv0, all: offers, ticket: c.ticket });
    // ---- 左欄：預覽分頁＋和原本比一比、款式、預覽本體、誰看得到
    const ctx = pctx();
    const views = VIEWS[it.ty] || ['card'];
    const view = views.includes(d.view) ? d.view : views[0];
    const seg = views.length > 1 ? `<div class="seg" role="group" aria-label="${esc(T.detail.previewAria)}">${views.map(v => `<button type="button" data-pd="view" data-v="${v}" aria-pressed="${view === v}">${esc(viewLabel(it.ty, v))}</button>`).join('')}</div>` : '';
    const cmpBtn = CMP_TY.has(it.ty) ? `<button class="pv-cmp" type="button" data-pd="cmp" aria-pressed="${!!d.cmp}"><i aria-hidden="true"></i>${esc(T.cmp.btn)}</button>` : '';
    const stage = `<div class="pd-stage pv-st">${previewStage(it, view, d, ctx)}${ctx.demo ? `<span class="demo">${esc(T.detail.demoTag)}</span>` : ''}<span class="cap">${esc(capOf(it.ty, view))}</span></div>`;
    const left = (seg || cmpBtn ? `<div class="pv-top">${seg}${cmpBtn}</div>` : '') + chipsHtml(it, d) + stage + whoHtml(it.ty);
    // ---- 右欄：類型、名稱、故事、3 條規則、買法、按鈕
    const rules = it.ty === 'fx' ? T.detail.fxRules.map((r, i) => [i === 0 ? 'check' : i === 1 ? 'clock' : 'lock', i === 0 ? fmt(r, { n: own.count }) : r])
      : it.ty === 'tpl' ? T.detail.tplRules.map((r, i) => [['clock', 'repeat', 'home'][i], r])
        : (T.rules[it.ty] || [T.detail.otherRules[it.ty] || '']).map((r, i) => [(RULE_ICONS[it.ty] || [])[i] || 'check', r]);
    const optsHtml = offers.map(x => {
      const t = L.offerTexts(x, { now: pre ? o.start : n, inv: inv0, all: offers, ticket: c.ticket });
      const owned = own.perm && x.k === 'perm';
      return `<label class="pd-opt${owned ? ' is-owned' : ''}"><input type="radio" name="pdo" value="${esc(x.sku)}"${x.sku === it.sku ? ' checked' : ''}${owned || later ? ' disabled' : ''}><span><b>${esc(owned ? T.detail.optOwned : t.opt)}</b><small>${esc(t.sub)}</small></span><span class="price">${dot()}${x.p}</span></label>`;
    }).join('');
    const one = `<p class="pv-one">${dot()}${it.p} <small>${esc(fmt(T.oneOfferSub, { t: L.tagOf(it) }))}</small></p>`;
    let cta;
    if (later) cta = `<div class="pv-later"><b>${esc(T.later.h)}</b>${esc(T.later.p)}</div>`;
    else if (pre) cta = `<button class="sk-btn primary pre-cta" type="button" disabled aria-disabled="true">${ic('cal')}${esc(T.pre.cta)}</button><p class="short">${esc(T.pre.ctaNote)}</p>`;
    else if (chk.code === 'OWNED') cta = `<button class="sk-btn primary" type="button" disabled aria-disabled="true">${esc(T.detail.btnOwned)}</button>`;
    else if (chk.code === 'NO_FUNDS') cta = `<button class="sk-btn primary" type="button" disabled aria-disabled="true">${esc(fmt(T.detail.shortBtn, { n: chk.need }))}</button><p class="short">${esc(T.detail.shortNote)}</p>`;
    else if (!chk.ok) cta = `<button class="sk-btn primary" type="button" disabled aria-disabled="true">${esc(tx.btn)}</button><p class="short">${esc(L.errorView(chk.code, { max: chk.max }).text)}</p>`;
    else cta = `<button class="sk-btn primary" type="button" data-pd="buy">${esc(tx.btn)}</button><p class="short">${esc(fmt(T.detail.bal, { n: b })).replace(String(b) + ' ' + T.bottleUnit, `<b>${b} ${esc(T.bottleUnit)}</b>`)}</p>`;
    const chip = later ? `<span class="sh-chip is-later">${ic('clock')}${esc(T.later.tag)}</span>`
      : `<span class="sh-chip${it.k === 'perm' && !c.ticket ? ' is-perm' : ''}">${typeIcon(it)}${esc(c.ticket ? fmt(T.tags.pack, { c: it.c }) : c.tag)}</span>`;
    const box = `<section class="pd-box" role="dialog" aria-modal="true" aria-labelledby="pdT"><button class="pd-x" type="button" data-pd="x" aria-label="${esc(T.detail.closeAria)}">${ic('x')}</button>`
      + `<div class="pd-pre">${left}</div>`
      + `<div class="pd-info">${chip}<h2 id="pdT">${esc(c.ticket ? T.ticketName : c.name)}</h2><p class="story">${esc(c.ticket ? T.ticketStory : it.story)}</p>`
      + `<ul>${rules.map(([i, r]) => `<li>${ic(i)}<span>${esc(r)}</span></li>`).join('')}</ul>`
      + (offers.length > 1 || c.ticket ? `<div class="pd-opts" role="radiogroup" aria-label="${esc(T.detail.optsAria)}">${optsHtml}</div>` : one)
      + (d.err ? `<p class="err" role="alert">${ic('alert')}<span>${esc(d.err)}</span></p>` : '')
      + `<div class="pd-cta">${cta}</div></div></section>`;
    d.layer.el.innerHTML = box;
    // 光效預覽：和牆上同一套（fx.decorate）；7 天後、減少動態＝只有光框
    if (o.fx && it.ty === 'fx' && view !== 'list') { const pc = d.layer.el.querySelector('.message-card[data-pv]'); if (pc) o.fx.decorate(pc, { id: 'preview', fx: it.g, theme: 'theme-classic', timestamp: n }, view === 'static' || (o.reducedMotion && o.reducedMotion()) ? 'still' : 'preview'); }
  }
  function onDetailClick(e) {
    const t = e.target.closest('[data-pd]'); if (!t || !st.detail) return;
    const d = st.detail, k = t.dataset.pd;
    const refocus = (sel) => { const b = d.layer.el.querySelector(sel); if (b) b.focus(); };
    if (k === 'x') popLayer(d.layer);
    else if (k === 'view') { d.view = t.dataset.v; renderDetail(); refocus(`[data-pd="view"][data-v="${t.dataset.v}"]`); }
    else if (k === 'cmp') { d.cmp = !d.cmp; renderDetail(); refocus('[data-pd="cmp"]'); }
    else if (k === 'tt' || k === 'seal') { d[k] = Number(t.dataset.i) || 0; renderDetail(); refocus(`[data-pd="${k}"][data-i="${d[k]}"]`); }
    else if (k === 'buy') openBuy(d.sku);
  }
  // 款式（radiogroup）：方向鍵換一款，焦點跟著走
  function onChipKey(e) {
    const t = e.target.closest && e.target.closest('.pv-chips [role="radio"]'); if (!t || !st.detail) return;
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const k = t.dataset.pd, all = [...t.parentElement.querySelectorAll('[role="radio"]')];
    const i = (all.indexOf(t) + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length;
    st.detail[k] = i; renderDetail();
    const b = st.detail.layer.el.querySelector(`[data-pd="${k}"][data-i="${i}"]`); if (b) b.focus();
  }

  // ---------------------------------------------------------------- 購買
  function openBuyBySku(sku) { const it = items()[sku]; if (it) openBuy(sku); }
  function openBuy(sku) {
    const it = items()[sku]; if (!it) return;
    if (st.buy) popLayer(st.buy.layer, { silent: true });
    const ov = doc.createElement('div'); ov.className = 'sh-overlay is-buy';
    const layer = pushLayer(ov, () => { st.buy = null; });
    st.buy = { layer, sku, bid: L.newBid(now()), phase: 'confirm', err: '', busy: false, tries: 0 };
    ov.addEventListener('click', onBuyClick);
    renderBuy();
    const c = ov.querySelector('[data-buy="cancel"]'); if (c) c.focus();   // 預設焦點「再想想」
  }
  function renderBuy() {
    const B = st.buy; if (!B) return;
    const it = items()[B.sku] || allItemsForLookup()[B.sku]; if (!it) return;
    const el = B.layer.el;
    if (B.phase === 'pack') {
      el.innerHTML = `<section class="buy-box" role="status" aria-live="polite">${pack()}<h3>${esc(T.buy.packH)}</h3><p class="fine">${esc(T.buy.packP)}</p></section>`;
      return;
    }
    if (B.phase === 'done') {
      const d = L.doneText(it, inv()[it.g] || B.invAfter, now());
      el.innerHTML = `<section class="buy-box buy-done" role="dialog" aria-modal="true" aria-labelledby="bT">${xiaoying('happy', '')}<h3 id="bT">${esc(T.buy.doneH)}</h3><p class="fine">${esc(d.text)}</p>`
        + `<div class="acts"><button class="sk-btn light" type="button" data-buy="more">${esc(T.buy.more)}</button>${d.write ? `<button class="sk-btn primary" type="button" data-buy="write">${ic('send')}${esc(T.buy.write)}</button>` : ''}</div></section>`;
      const f = el.querySelector('[data-buy="write"]') || el.querySelector('[data-buy="more"]'); if (f) f.focus();
      return;
    }
    const tx = L.offerTexts(it, { now: now(), inv: inv(), all: Object.values(items()).filter(x => x.g === it.g) });
    const b = bal(), after = b - it.p;
    el.innerHTML = `<section class="buy-box" role="alertdialog" aria-modal="true" aria-labelledby="bT" aria-describedby="bD"${B.busy ? ' aria-busy="true"' : ''}>`
      + `<span class="th">${smallThumb(it, 0.7)}</span><h3 id="bT">${esc(tx.head)}</h3>`
      + `<p class="bal" aria-label="${esc(fmt(T.buy.balAria, { a: b, b: after }))}"><span style="width:18px;height:22px;display:inline-block">${jar(L.jarDots(b))}</span><span>${esc(fmt(T.buy.bal, { a: b, b: after })).replace(`${b} → ${after}`, `<b>${b}</b> → <b>${after}</b>`)}</span></p>`
      + `<p class="fine" id="bD">${esc(tx.fine)}</p>`
      + (B.err ? `<p class="err" role="alert">${ic('alert')}<span>${esc(B.err)}</span></p>` : '')
      + `<div class="acts"><button class="sk-btn light" type="button" data-buy="cancel"${B.busy ? ' disabled' : ''}>${esc(T.buy.cancel)}</button>`
      + `<button class="sk-btn primary" type="button" data-buy="ok"${B.busy ? ' disabled aria-disabled="true"' : ''}>${esc(B.busy ? T.buy.busy : B.err ? T.buy.retry : tx.ok)}</button></div></section>`;
  }
  async function doBuy() {
    const B = st.buy; if (!B || B.busy) return;   // 連點兩下：第二下不送
    const it = items()[B.sku]; if (!it) { finishError('NOT_FOUND', {}); return; }
    B.busy = true; B.err = ''; B.tries++; renderBuy();
    const t0 = Date.now();
    let res = null, err = null;
    try { res = await api.spend(B.sku, B.bid); } catch (e) { err = e; }
    if (st.buy !== B) return;   // 等的時候被關掉了（只有網路很慢、按 Esc 也擋住，所以通常不會）
    B.busy = false;
    if (err) { finishError(err.code || '', err.details || {}); return; }
    B.invAfter = res && res.inv ? res.inv[it.g] : null;
    if (res && res.wallet && Number.isFinite(res.wallet.b) && api.st.wallet) api.st.wallet = { ...api.st.wallet, ...res.wallet };   // 監聽還沒到也先顯示新的數字
    if (res && res.inv && api.st.inv) api.st.inv = { ...api.st.inv, ...res.inv };
    const reduced = o.reducedMotion && o.reducedMotion();
    B.phase = 'pack'; renderBuy(); paintEntry();
    const wait = reduced ? 400 : Math.max(900, 1400 - (Date.now() - t0));
    setTimeout(() => { if (st.buy === B) { B.phase = 'done'; renderBuy(); refreshAll(); } }, wait);
  }
  function finishError(code, details) {
    const B = st.buy; if (!B) return;
    const it = items()[B.sku];
    const v = L.errorView(code, details, { bal: bal(), price: it ? it.p : 0 });
    if (v.next === 'retry') { B.err = v.text; renderBuy(); const ok = B.layer.el.querySelector('[data-buy="ok"]'); if (ok) ok.focus(); return; }
    popLayer(B.layer, { silent: true });
    if (v.next === 'closed') { if (st.detail) popLayer(st.detail.layer, { silent: true }); api.st.cfg = { ...api.st.cfg, shopOpen: false }; renderShop(); return; }
    if (v.next === 'gone') { st.gone.add(B.sku); if (st.detail) popLayer(st.detail.layer, { silent: true }); renderShop(); toast(v.text); return; }
    if (st.detail) { st.detail.err = v.next === 'owned' ? '' : v.text; renderDetail(); if (v.next === 'owned') toast(v.text); const f = st.detail.layer.el.querySelector('.pd-cta .sk-btn'); if (f) f.focus(); }
    else toast(v.text);
  }
  function onBuyClick(e) {
    const t = e.target.closest('[data-buy]'); if (!t || !st.buy) return;
    const k = t.dataset.buy;
    if (k === 'cancel') popLayer(st.buy.layer);
    else if (k === 'ok') doBuy();
    else if (k === 'more') { const B = st.buy; popLayer(B.layer, { silent: true }); if (st.detail) popLayer(st.detail.layer, { silent: true }); renderShop(); const f = doc.querySelector('.sh-tab[aria-selected="true"]'); if (f) f.focus(); }
    else if (k === 'write') { const it = items()[st.buy.sku] || allItemsForLookup()[st.buy.sku]; close(); if (o.useItem && it) o.useItem({ g: it.g, ty: it.ty, th: it.th, fx: it.fx }); }
  }

  // ---------------------------------------------------------------- 我的小抽屜
  function staticSegHtml(inMenu = false) {
    const rm = o.reducedMotion && o.reducedMotion(), on = rm || (o.getStatic && o.getStatic());
    // 頭像選單裡用 menuitemradio（方向鍵走得到）；抽屜裡用一般的切換按鈕
    const b = (v, label, pressed) => inMenu
      ? `<button type="button" role="menuitemradio" data-sh="static" data-v="${v}" aria-checked="${pressed}"${rm ? ' aria-disabled="true" disabled' : ''}>${esc(label)}</button>`
      : `<button type="button" data-sh="static" data-v="${v}" aria-pressed="${pressed}"${rm ? ' disabled' : ''}>${esc(label)}</button>`;
    return `<div class="seg" role="group" aria-label="${esc(T.fxSet.h)}">${b(0, T.fxSet.anim, !on)}${b(1, T.fxSet.still, !!on)}</div>`;
  }
  function drawerHtml() {
    const d = L.drawerView(items(), inv(), now(), { lookup: (g) => Object.values(allItemsForLookup()).find(x => x.g === g) || null });
    const row = (r, sub, act = '', cls = '') => `<li class="dr-item ${cls}"><span class="th">${smallThumb(r, r.ty === 'seal' ? 0.38 : 0.46)}</span><div><b>${esc(r.name)}</b><small>${sub}</small></div>${act}</li>`;
    const mine = activeEquip((api.st.equip || {})[o.meId], now());
    const useBtn = (r) => {
      if (['fx', 'tpl'].includes(r.ty)) return `<button class="sk-btn light" type="button" data-sh="use" data-g="${esc(r.g)}">${esc(T.drawer.use)}</button>`;
      const slot = SLOT_OF_TY[r.ty]; if (!slot || !o.meId) return '';
      const worn = mine[slot] && mine[slot].g === r.g;
      const pick = r.ty === 'title' && (T.titles[r.g] || []).length > 1 ? `<button class="sk-btn light" type="button" data-sh="eq-pick" data-g="${esc(r.g)}">${esc(T.eq.pick)}</button>` : '';
      const swap = !worn && slot === 'bd' && !!mine.bd;   // 徽章格已經戴著別枚：同一格只能戴 1 枚
      return `<span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${pick}${worn ? `<button class="sk-btn light" type="button" data-sh="eq-off" data-slot="${slot}">${esc(T.drawer.off)}</button>`
        : `<button class="sk-btn light" type="button" data-sh="eq-on" data-g="${esc(r.g)}" data-slot="${slot}">${esc(swap ? T.eq.swap : T.eq.wear)}</button>`}</span>`;
    };
    const isWorn = (r) => { const slot = SLOT_OF_TY[r.ty]; return !!(slot && mine[slot] && mine[slot].g === r.g); };
    const wearSub = (r) => { if (!isWorn(r) || r.ty === 'badge') return ''; const t = r.ty === 'title' ? titleText(mine[SLOT_OF_TY[r.ty]]) : ''; return `<span class="wear">${esc(T.eq.wearing)}</span>${t ? `　${esc(fmt(T.eq.titleNow, { t }))}` : ''}　`; };
    const active = d.active.map(r => r.kind === 'rent'
      ? row(r, r.ty === 'badge' ? `<span class="left">${esc(r.today ? T.drawer.rentToday : fmt(isWorn(r) ? T.drawer.badge : T.drawer.rent, { d: r.days }))}</span>　${esc(T.drawer.badgeSub)}` : `${wearSub(r)}<span class="left">${esc(r.today ? T.drawer.rentToday : fmt(T.drawer.rent, { d: r.days }))}</span>　${esc(fmt(T.drawer.until, { date: L.fmtDate(r.until) }))}`, useBtn(r))
      : row(r, `<span class="left">${esc(fmt(T.drawer.pack, { n: r.n }))}</span>　${esc(T.drawer.packSub)}`, useBtn(r))).join('');
    const perm = d.perm.map(r => row(r, wearSub(r) + esc(r.ty === 'tpl' ? T.tags.perm : (Object.values(items()).find(x => x.g === r.g && x.note) || {}).note || T.tags.perm), useBtn(r))).join('');
    const exp = d.expired.map(r => row(r, esc(fmt(T.drawer.expired, { date: L.fmtShort(r.until) })), r.again ? `<button class="sk-btn light" type="button" data-sh="again" data-sku="${esc(r.again.sku)}">${esc(fmt(T.drawer.again, { d: r.again.d, p: r.again.p }))}</button>` : '', 'is-expired')).join('');
    const empty = !active && !perm && !exp;
    const rm = o.reducedMotion && o.reducedMotion();
    return (empty ? `<p class="dr-empty">${esc(T.drawer.empty)}</p>` : '')
      + (active ? `<section class="dr-sec"><h3>${esc(T.drawer.h1)}</h3><ul class="dr-list">${active}</ul></section>` : '')
      + (perm ? `<section class="dr-sec"><h3>${esc(T.drawer.h2)} <small>${esc(T.drawer.h2s)}</small></h3><ul class="dr-list">${perm}</ul></section>` : '')
      + (exp ? `<section class="dr-sec"><h3>${esc(T.drawer.h3)} <small>${esc(T.drawer.h3s)}</small></h3><ul class="dr-list">${exp}</ul></section>` : '')
      + `<div class="dr-set"><div><b>${esc(T.fxSet.h)}</b><small>${esc(rm ? T.fxSet.rm : T.fxSet.long)}</small></div>${staticSegHtml()}</div>`;
  }
  // ---------------------------------------------------------------- 換戴／取下（規則只收抽屜裡有效的：永久寫 u = -1，租用寫 inv 的 u）
  async function wear(slot, g, i) {
    if (!api.setEquip) return;
    let value = null;
    if (g) {
      const s0 = L.invState(inv()[g], now());
      if (!s0.perm && !s0.until) { toast(T.eq.expired); return; }
      value = { g, u: s0.perm ? -1 : Number(inv()[g].u) };
      if (slot === 'tt') { const cur = activeEquip((api.st.equip || {})[o.meId], now()).tt; value.i = Number.isInteger(i) ? i : (cur && cur.g === g ? cur.i : 0); }
    }
    try {
      await api.setEquip(slot, value);
      api.st.equip = { ...(api.st.equip || {}), [o.meId]: { ...((api.st.equip || {})[o.meId] || {}), [slot]: value } };   // 監聽還沒回來也先顯示
      toast(g ? T.eq.on : T.eq.offDone);
      if (o.onEquip) o.onEquip();
    } catch (e) { toast(T.eq.fail); }
    renderShop();
  }
  function openTitlePicker(g) {
    const list = T.titles[g] || []; if (!list.length) return;
    const cur = activeEquip((api.st.equip || {})[o.meId], now()).tt;
    const at = cur && cur.g === g ? cur.i : -1;
    const ov = doc.createElement('div'); ov.className = 'sh-overlay is-buy';
    ov.innerHTML = `<section class="buy-box" role="dialog" aria-modal="true" aria-labelledby="eqT"><h3 id="eqT">${esc(T.eq.pickH)}</h3><p class="fine">${esc(T.eq.pickP)}</p>`
      + `<ul class="eq-pick-list" role="radiogroup" aria-label="${esc(T.eq.pickH)}">${list.map((t, i) => `<li><button type="button" role="radio" aria-checked="${i === at}" data-eqi="${i}">${esc(t)}</button></li>`).join('')}</ul>`
      + `<div class="acts"><button class="sk-btn light" type="button" data-eqi="x">${esc(T.buy.cancel)}</button></div></section>`;
    const layer = pushLayer(ov);
    ov.addEventListener('click', (e) => { const b = e.target.closest('[data-eqi]'); if (!b) return; popLayer(layer); if (b.dataset.eqi !== 'x') wear('tt', g, Number(b.dataset.eqi)); });
    const f = ov.querySelector('[aria-checked="true"]') || ov.querySelector('[data-eqi]'); if (f) f.focus();
  }
  async function setStatic(v, btn) {
    if (!o.setStatic) return;
    try { await o.setStatic(v); } catch (e) { toast(T.fxSet.saveFail); }
    renderShop(); paintMenuSetting();
    const b = doc.querySelector(`[data-sh="static"][data-v="${v ? 1 : 0}"]`); if (b && btn) b.focus();
  }
  /** 頭像選單裡的「別人的光效」（T098 選單，在「更換頭像」和「登出」之間）：回傳元素，由 app.js 放進選單 */
  function fxSettingEl() {
    const el = doc.createElement('div'); el.className = 'lxset';
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-sh="static"]'); if (b) { e.stopPropagation(); setStatic(b.dataset.v === '1', b); } });
    st.menuSet = el; paintMenuSetting();
    return el;
  }
  function paintMenuSetting() {
    const el = st.menuSet; if (!el) return;
    const rm = o.reducedMotion && o.reducedMotion();
    el.innerHTML = `<b>${esc(T.fxSet.h)}</b><small>${esc(rm ? T.fxSet.rm : T.fxSet.short)}</small>${staticSegHtml(true)}`;
  }

  // ---------------------------------------------------------------- 帳本
  function ledgerHtml() {
    if (!api.st.ledgerOk) return `<div class="sh-load">${xiaoying('smile', '')}<p>${esc(T.loading)}</p></div>`;
    const led = api.st.ledger || {};
    if (!Object.keys(led).length) return `<div class="lg-empty">${xiaoying('smile', '')}<h3 style="color:var(--sh-ink);margin:8px 0 0">${esc(T.ledger.emptyH)}</h3><p>${esc(T.ledger.emptyP)}</p></div>`;
    const f = st.lgFilter || 'all';
    const filtered = Object.fromEntries(Object.entries(led).filter(([k, v]) => f === 'all' || (f === 'in' ? v.a > 0 : v.a < 0)));
    const { groups, more } = L.ledgerView(filtered, { items: allItemsForLookup(), msgOf: o.msgOf, start: o.start, amounts: o.amounts, limit: api.st.ledgerLimit });
    const sums = L.monthSums(led, now());
    const rows = groups.map(g => `<h4 class="lg-day">${esc(g.label)}${g.star ? `<span class="star">${esc(T.ledger.starEra)}</span>` : ''}</h4><ul class="lg-list">`
      + g.rows.map(r => `<li class="lg-row is-${r.kind === 'x' ? 'out is-x' : r.kind}"${r.aria ? ` aria-label="${esc(r.aria)}"` : ''}><span class="ic">${ic(r.icon)}</span><div><b>${esc(r.title)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</div>`
        + (r.kind === 'gift' ? `<span class="amt is-gift">${ic('gift')}${esc(T.ledger.giveAmt)}</span>` : `<span class="amt ${r.a > 0 ? 'is-pos' : r.a < 0 ? 'is-neg' : ''}">${Math.abs(r.a)}</span>`) + '</li>').join('') + '</ul>').join('');
    return `<div class="lg-sum"><div><small>${esc(T.ledger.sumBal)}</small><b>${dot()}${bal()}<span style="font-size:15px;color:var(--sh-muted)">${esc(T.bottleUnit)}</span></b></div>`
      + `<div class="in"><small>${esc(T.ledger.sumIn)}</small><b>${sums.in ? '＋' : ''}${sums.in}</b></div><div class="out"><small>${esc(T.ledger.sumOut)}</small><b>${sums.out ? '−' : ''}${sums.out}</b></div></div>`
      + `<div class="lg-bar"><div class="seg" role="group" aria-label="${esc(T.ledger.filterAria)}">${['all', 'in', 'out'].map(k => `<button type="button" data-sh="filter" data-v="${k}" aria-pressed="${f === k}">${esc(T.ledger.filter[k])}</button>`).join('')}</div><p>${ic('ledger')}${esc(T.ledger.mine)}</p></div>`
      + rows + (more ? `<div class="lg-more"><button class="sk-btn light" type="button" data-sh="more">${esc(T.ledger.more)}</button></div>` : '');
  }

  // ---------------------------------------------------------------- 租期到期提醒（到期後第一次開網站時一次；不提前倒數、不重複、不寄 Email）
  const expSeen = () => { try { return JSON.parse(LS.get(SHOP_KEYS.exp) || '{}') || {}; } catch (e) { return {}; } };
  function checkExpiry() {
    if (st.expShown || doc.querySelector('.exp-card')) return;
    if (o.canPopup && !o.canPopup()) return;
    if (!L.dueExpiries(allItemsForLookup(), inv(), expSeen(), now()).length) return;
    // T113：向 popup-slot 要名額；名額給了別人＝這次不提醒、不記看過，下次開站再提醒
    slot.request('shop-exp', 5, () => showExpiry() !== false);
  }
  function showExpiry() {
    if (st.expShown || doc.querySelector('.exp-card') || (o.canPopup && !o.canPopup())) return false;
    const seen = expSeen();
    const due = L.dueExpiries(allItemsForLookup(), inv(), seen, now());
    if (!due.length) return false;
    st.expShown = true;
    for (const d of due) seen[d.g] = d.until;
    LS.set(SHOP_KEYS.exp, JSON.stringify(seen));
    const one = due.length === 1 ? due[0] : null;
    const text = one ? (one.ty === 'badge' ? fmt(T.expire.badge, { name: one.name, d: one.d }) : fmt(T.expire.one, { name: one.name }))
      : fmt(T.expire.many, { n: due.length, names: due.map(x => x.name).join('、') });
    const card = doc.createElement('div'); card.className = 'exp-card'; card.setAttribute('role', 'status');
    card.innerHTML = `<div class="top">${xiaoying('smile', '')}<p>${esc(text)}</p></div><div class="acts"><button class="sk-btn light" type="button" data-exp="ok">${esc(T.expire.ok)}</button>`
      + (one && one.again && one.ty !== 'badge' ? `<button class="sk-btn primary" type="button" data-exp="again" data-sku="${esc(one.again.sku)}">${esc(fmt(T.expire.again, { d: one.again.d, p: one.again.p }))}</button>` : '') + '</div>';
    card.addEventListener('click', (e) => {
      const t = e.target.closest('[data-exp]'); if (!t) return;
      card.remove();
      if (t.dataset.exp === 'again') { open('drawer'); openBuyBySku(t.dataset.sku); }
    });
    doc.body.appendChild(card);
  }

  // ---------------------------------------------------------------- 開店公告（12/1 起兩週內，第一次開網站；按「晚點再去」或 ✕ 的人，下次點燈籠先看到公告）
  function noticeDue() { const s = o.start || 0, n = now(); return n >= s && n < s + OPEN_NOTICE_DAYS * L.DAY; }
  const noticeOk = () => noticeDue() && !LS.get(SHOP_KEYS.notice) && (!o.canPopup || o.canPopup()) && (!o.canNotice || o.canNotice());
  // T113：開店公告向 popup-slot 要名額（優先 3）；排隊中也算「處理了」（到期提醒這次就不另外要）
  function maybeOpenNotice() {
    if (!noticeOk()) return false;
    return slot.request('shop-notice', 3, () => { if (!noticeOk() || doc.querySelector('.sh-overlay.is-notice')) return false; showOpenNotice(); return true; }) !== false;
  }
  function showOpenNotice() {
    if (doc.querySelector('.sh-overlay.is-notice')) return;
    const ov = doc.createElement('div'); ov.className = 'sh-overlay is-notice'; ov.style.background = 'rgba(6,10,28,.6)';
    const stars = Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 137) % 640}" cy="${(i * 41) % 130}" r="${i % 6 ? 0.9 : 1.7}" fill="#fff6e0" opacity=".6"/>`).join('');
    ov.innerHTML = `<section class="sk-modal" role="dialog" aria-modal="true" aria-labelledby="onT" style="background:var(--sh-paper)"><div class="sk-modal-scroll">`
      + '<div style="position:relative;background:linear-gradient(180deg,#1d2350,#4a2f55 80%,#6a3a4a);height:220px;overflow:hidden">'
      + `<svg viewBox="0 0 640 220" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%" aria-hidden="true">${stars}<path d="M0 190q160-30 320-6t320-10v46H0z" fill="#2a1f3a"/><rect x="450" y="120" width="180" height="80" rx="8" fill="#5a3418"/><path d="M440 120h200l-14-24H454z" fill="#c9184a"/><path d="M454 96h172" stroke="#fff3e0" stroke-width="6" stroke-dasharray="20 20"/><rect x="480" y="140" width="50" height="40" rx="4" fill="#ffd27a" opacity=".85"/><rect x="550" y="140" width="50" height="60" rx="4" fill="#3a2410"/><circle cx="505" cy="160" r="30" fill="rgba(255,194,74,.25)"/></svg>`
      + `<div style="position:absolute;left:70px;top:46px;width:130px;height:130px">${xiaoying('smile')}</div>`
      + `<h2 class="sk-hero-title" id="onT"><small>${esc(T.open.kicker)}</small>${esc(T.open.h)}</h2>`
      + `<button class="sk-close" type="button" data-on="x" aria-label="${esc(T.open.closeAria)}">${ic('x')}</button></div>`
      + `<div class="sk-body"><div class="sk-story" style="color:#4a3424">${T.open.story.map(p => `<p>${esc(p)}</p>`).join('')}<p><strong>${esc(T.open.strong)}</strong>${esc(T.open.strongTail)}</p><p>${esc(T.open.last)}</p></div></div></div>`
      + `<footer class="sk-foot"><button class="sk-btn light" type="button" data-on="later">${esc(T.open.later)}</button><button class="sk-btn primary" type="button" data-on="go">${lantern().replace('<svg class=""', '<svg style="width:18px;height:22px"')}${esc(T.open.go)}</button></footer></section>`;
    const layer = pushLayer(ov);
    ov.addEventListener('click', (e) => {
      const t = e.target.closest('[data-on]'); if (!t) return;
      LS.set(SHOP_KEYS.notice, t.dataset.on === 'go' ? 'go' : 'later');
      popLayer(layer, { silent: t.dataset.on === 'go' });
      if (t.dataset.on === 'go') open('shop');
    });
    const g = ov.querySelector('[data-on="go"]'); if (g) g.focus();
  }

  // ---------------------------------------------------------------- 小提示
  function toast(text) {
    if (o.toast) { o.toast(text); return; }
    const t = doc.createElement('div'); t.className = 'sh-toast'; t.setAttribute('role', 'status'); t.innerHTML = `${ic('alert')}<span>${esc(text)}</span>`;
    doc.body.appendChild(t); setTimeout(() => t.remove(), 5000);
  }

  // ---------------------------------------------------------------- 資料更新
  function refreshAll() {
    paintEntry();
    if (shopLayer() && !(st.buy && st.buy.busy)) renderShop();
    if (st.detail && !st.buy) renderDetail();
  }
  /** shop-api.js 的 onChange 接到這裡 */
  function onData(kind) {
    if (kind === 'wallet') {
      const b = bal();
      if (st.lastBal !== null && b > st.lastBal) catchLight();
      st.lastBal = b;
    }
    if (kind === 'inv' || kind === 'items') { st.loaded = true; setTimeout(checkExpiry, 0); }
    if (kind === 'equip' && o.onEquip) o.onEquip();
    refreshAll();
  }

  /** 每分鐘叫一次（shop-app.js）：跨過櫥窗開始／開店時間時，入口與開著的小舖換成新的樣子（不必重新整理） */
  function tick() {
    paintEntry();
    if (shopLayer() && st.mode && st.mode !== mode() && !(st.buy && st.buy.busy)) {
      if (st.detail) popLayer(st.detail.layer, { silent: true });
      renderShop();
    }
  }

  return {
    mountEntry, open, close, setTab, openDetail, openBuy: openBuyBySku, onData, refresh: refreshAll, checkExpiry, maybeOpenNotice, showOpenNotice,
    fxSettingEl, catchLight, paintEntry, openTour, tick, isPreview,
    get isOpen() { return !!shopLayer(); },
    get state() { return st; },
  };
}
