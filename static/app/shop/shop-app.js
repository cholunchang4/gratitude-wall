// T102 拾光小舖＋留言光效：接上正式站（app.js）的那一層。app.js 只要在幾個地方呼叫這裡（掛勾清單見 tools/apply_t102_appjs.py）。
// 這支把 shop-api（資料）、fx（卡片光效）、fx-picker（撰寫區）、shop-ui（小舖畫面）串起來，並處理：
// - 偏好 fx_static（別人的光效：只看靜態）讀寫；- 擁有的商店模板放進「樣式」選單、到期就拿掉；
// - 送出卡片時帶上光效與模板次數（給 fb/writes.js buildCreateMessage 用的 fxCtx）；被規則拒絕時拿掉光效再送一次（backend.js）。
import { createShopApi, makeCallable } from './shop-api.js';
import { createFx } from './fx.js';
import { createFxPicker } from './fx-picker.js';
import { createShopUI } from './shop-ui.js';
import { createEquipView } from './equip.js';
import { ownedTemplates, fxSettings } from './shop-logic.js';
import { SHOP_THEMES, SHOP_THEME_META } from './shop-catalog.js';
import { T, fmt } from './shop-text.js';
import { fmtDate } from './shop-logic.js';
import { K as K0 } from '../fb/constants.js';
import { ref, get } from '../../vendor/firebase-sdk.js';
import { filledFields, normalizeCard } from '../fb/profile-logic.js';

/**
 * d = {
 *   K?（預設 fb/constants.js）, session: { db, user, meId, isAdmin }, emulator, nowMs(), wall（#wall）,
 *   anonCheck, pickerBefore（撰寫區光效按鈕放在這個元素前面，例如 #emojiPicker）, tools（.tools）, mobileBar（.switch-bar）,
 *   getTheme(), setTheme(theme)（撰寫區選好模板）, addSwatch(theme, cls, name, cap) → btn, removeSwatch(btn),
 *   prefs() → ME.prefs, savePref(key, value) → Promise, toast(text), focusComposer(),
 *   meName(), meInitial(), meColor(), recentCard(), msgOf(mid), themeClass(theme), eventOn(), isPaused(), canPopup()
 * }
 */
export function createShopApp(d) {
  const K = d.K || K0, BANK = K.BANK || {};
  const start = Number(BANK.start) || Date.parse('2026-12-01T00:00:00+08:00');
  const call = makeCallable({ user: d.session.user, emulator: !!d.emulator });
  let ui = null, picker = null;
  // 開店時間（後端 bankSpend 也檢查，I6）：開關提早打開時，時間沒到前端也顯示暫停營業
  const openAt = Number(BANK.shop && BANK.shop.openAt) || 0;
  const api = createShopApi({ db: d.session.db, meId: d.session.meId, call, onChange: (k) => onData(k), nowMs: d.nowMs, openAt });
  const eqv = createEquipView({ get: (uid) => (api.st.equip || {})[uid], nowMs: d.nowMs });
  const fx = createFx({ wall: d.wall, settings: () => api.st.fx, nowMs: d.nowMs, eventOn: d.eventOn });
  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const free = () => (BANK.fx && BANK.fx.free) || {};
  const quota = () => ({ per_day: (BANK.fx && BANK.fx.per_day) || 1, per_week: (BANK.fx && BANK.fx.per_week) || 4, window_days: (BANK.fx && BANK.fx.window_days) || 7 });
  const themeMap = () => BANK.shop_themes || SHOP_THEMES;
  const fxCtx = () => ({ now: d.nowMs(), inv: api.st.inv, items: api.st.items, fxd: api.st.fxd, fxw: api.st.fxw, exists: d.msgExists || (() => true),
    settings: api.st.fx, free: free(), quota: quota(), themes: themeMap() });

  // 6.6 預覽用的「你」：頭像照片與說明書寫了幾格（pc）。照片優先用撰寫區自己的頭像（T098 已經下載好的）；沒有時每次打開小舖讀一次 avs（約 5KB，沒有頭像時只有幾個位元組）；換頭像、改說明書，下次打開就跟上
  const previewAt = Number(BANK.shop && BANK.shop.previewAt) || Date.parse('2026-11-25T00:00:00+08:00');
  const mine = { photo: '', filled: null };
  const domPhoto = () => { const img = document.querySelector('#userAvatar img'); const s = img && img.getAttribute('src'); return s && /^data:image\//.test(s) ? s : ''; };
  function loadMine() {
    const db = d.session.db, me = d.session.meId;
    if (!db || !me) return;
    if (!domPhoto()) get(ref(db, `avs/${me}`)).then((s) => { const v = s.val(); const ph = v && typeof v.d === 'string' ? v.d : ''; if (ph !== mine.photo) { mine.photo = ph; ui.refresh(); } }).catch(() => { /* 讀不到：用縮寫 */ });
    // 說明書寫了幾格（只影響說明書背景預覽的虛線格；約 1KB）
    get(ref(db, `pc/${me}`)).then((s) => { const v = s.val(); const n = v ? filledFields(normalizeCard(v)).length : 0; if (n !== mine.filled) { mine.filled = n; ui.refresh(); } }).catch(() => { /* 讀不到：當作寫完 */ });
  }

  ui = createShopUI({
    api, nowMs: d.nowMs, start, amounts: BANK.amounts, previewAt,
    meAvatar: () => domPhoto() || mine.photo, mePcFilled: () => mine.filled, onOpen: loadMine,
    meName: d.meName, meInitial: d.meInitial, meColor: d.meColor, recentCard: d.recentCard, msgOf: d.msgOf, themeClass: d.themeClass, fx,
    getStatic: () => String((d.prefs() || {}).fx_static || '') === '1',
    setStatic: async (v) => { fx.setStatic(v); await d.savePref('fx_static', v ? '1' : '0'); },
    reducedMotion: reduced, toast: d.toast, canPopup: d.canPopup, meId: d.session.meId, onEquip: () => reEquip(),
    // 和 T101 謝幕公告排隊（程式設計 4 的接口）：謝幕開著、或今天已經跳過謝幕，就不自動跳開店公告；
    // 謝幕按「去看看那盞小燈」會發 sky:open-shop-intro，這時才打開（按 ✕ 關謝幕的人，下次點牆角燈籠會先看到開店公告）
    canNotice: () => { const n = window.__skyNotice; try { return !(n && (n.isOpen() || n.shownToday())); } catch (e) { return true; } },
    useItem: (x) => {
      if (x.ty === 'fx' && picker) { picker.set(x.g); }
      else if (x.ty === 'tpl' && x.th) { syncSwatches(); d.setTheme(x.th); }
      else if (x.ty === 'idea') { window.dispatchEvent(new CustomEvent('compose-idea:open')); return; }   // 6.6 寫卡靈感包：直接打開撰寫區的開頭句清單（compose-idea.js，程式設計 17）
      if (d.focusComposer) d.focusComposer();
    },
  });
  if (d.anonCheck) {
    picker = createFxPicker({ before: d.pickerBefore, anonEl: d.anonCheck, getAnon: () => !!d.anonCheck.checked, getTheme: d.getTheme, ctx: fxCtx,
      openShop: () => ui.open('shop'), toast: d.toast });
  }

  // ---- 樣式選單：擁有的商店模板（永久、租用中、還有次數）才出現；到期、用完就拿掉
  const swatches = new Map();
  function syncSwatches() {
    const own = ownedTemplates(api.st.inv, d.nowMs(), themeMap());
    const want = new Set(own.map(x => x.theme));
    for (const [theme, btn] of swatches) if (!want.has(theme)) { d.removeSwatch(btn); swatches.delete(theme); }
    for (const x of own) {
      const meta = SHOP_THEME_META[x.theme] || { name: x.theme };
      const cap = x.perm ? `<b>${meta.name}</b>` : x.until ? `<b>${meta.name}</b><span>到 ${fmtDate(x.until)}</span>` : `<b>${meta.name}</b><span>${fmt(T.picker.left, { n: x.n })}</span>`;
      let btn = swatches.get(x.theme);
      if (!btn) { btn = d.addSwatch(x.theme, 'theme-shop-btn', meta.name, cap); if (btn) swatches.set(x.theme, btn); }
      else { const c = btn.closest('.sw-cell') && btn.closest('.sw-cell').querySelector('.swatch-cap'); if (c) c.innerHTML = cap; }
    }
  }
  // 頁面開著跨過到期時間：每分鐘看一次
  setInterval(() => { syncSwatches(); if (picker) picker.refresh(); reEquip(); ui.tick(); }, 60000);   // 租期、徽章到期；跨過櫥窗開始、開店時間

  // 戴的東西變了（自己換戴、別人買了新稱號、到期）：牆上的卡重新套一次作者旁的稱號／徽章／光環
  function reEquip() { if (d.wall) d.wall.querySelectorAll('.message-card').forEach(c => { const m = c._msg || c._lxMsg; if (m) eqv.apply(c, m); }); if (d.onEquipChange) d.onEquipChange(); }
  let equipSeen = false;
  function onData(k) {
    // 戴的東西比牆面晚到時：只有牆上真的有卡要加寬（作者有稱號／徽章）才重排一次，避免開站後牆面無故跳一下
    if (k === 'equip' && !equipSeen) {
      equipSeen = true;
      const affected = d.wall && [...d.wall.querySelectorAll('.message-card')].some(c => { const m = c._msg || c._lxMsg; return m && eqv.width(m, 1) > 0; });
      if (d.relayout && affected) { if (window.__shopRelayouts !== undefined) window.__shopRelayouts++; setTimeout(() => d.relayout(), 0); }
    }
    if (k === 'inv') syncSwatches();
    if (k === 'fx') fx.redecorate();
    if (picker && (k === 'inv' || k === 'fxq' || k === 'fx' || k === 'items')) picker.refresh();
    ui.onData(k);
  }

  window.addEventListener('sky:open-shop-intro', () => { if (d.nowMs() >= start) ui.showOpenNotice(); });
  function start_() {
    api.listen();
    // 每次登入呼叫一次 bankOpen（冪等）：開戶、補做「扣款成功但還沒放進抽屜」的購買。銀行沒上線時安靜失敗。
    // 點亮星空模組（sky-bank.js）開站時已經會呼叫一次：有它就不重複呼叫（整合問題 I7）；沒有時大家共用 window.__bankOpenOnce 這一次
    const skyCalls = !!(d.skyOpensBank && d.skyOpensBank()) && d.nowMs() >= (Number(BANK.start_profile) || 0);   // 星空模組在 start_profile 之後才開始（那時才呼叫 bankOpen）
    if (!skyCalls) {
      if (!window.__bankOpenOnce) window.__bankOpenOnce = call('bankOpen', {}).catch(() => null);
    }
    fx.setStatic(String((d.prefs() || {}).fx_static || '') === '1');
    fx.start();
    ui.mountEntry({ tools: d.tools, mobileBar: d.mobileBar });
    // 謝幕公告（T101）在開站後 1～9 秒才決定要不要跳：謝幕期間先等 window.__skyNotice 出現（最多 12 秒）再判斷，避免同一天疊兩個彈窗
    const sky = K.EVENTS && K.EVENTS.sky2026, now0 = d.nowMs();
    const inEpilogue = !!(sky && now0 > sky.end && now0 <= sky.epilogue_end);
    let waited = 0;
    const tryNotice = () => {
      if (inEpilogue && !window.__skyNotice && waited < 12000) { waited += 500; setTimeout(tryNotice, 500); return; }
      if (inEpilogue && waited < 12000) { try { if (!window.__skyNotice.shownToday() && !window.__skyNotice.isOpen()) { waited += 500; return setTimeout(tryNotice, 500); } } catch (e) { /* 照常 */ } }
      if (!ui.maybeOpenNotice()) ui.checkExpiry();
    };
    setTimeout(tryNotice, 1500);
    setTimeout(() => ui.checkExpiry(), 8000);   // 第一次開站有新手引導等視窗時，晚一點再看一次
  }
  return {
    api, fx, ui, picker, start: start_,
    /** app.js 送出前：要帶給 backend 的欄位（fx＝光效 g；fxCtx＝扣次數、佔格子要用的狀態） */
    sendFields() { return { fx: picker ? picker.sendFx() : '', fxCtx: fxCtx() }; },
    /** 送出成功後：撰寫區光效回到「不用」；被拿掉時說明 */
    afterSend(res) { if (picker) picker.reset(); if (res && res.fx_dropped) d.toast(T.picker.sendDrop); },
    /** 撰寫區樣式、匿名改了 */
    onComposerChange() { if (picker) picker.refresh(); },
    /** app.js applyCardContent 之後：光效＋作者旁戴的東西 */
    decorate(card, msg) { fx.decorate(card, msg); eqv.apply(card, msg); },
    /** 清單列：光效小圖示＋稱號／徽章 */
    listExtra(m) { return fx.listIcon(m) + eqv.listHtml(m); },
    /** 資料卡檢視畫完（profile-ui.js ext.viewerDecor）：說明書背景、大頭像光環 */
    viewerDecor: (el, uid) => eqv.viewer(el, uid),
    /** app.js scCalcWidth：作者旁稱號＋徽章要多的卡寬 */
    equipWidth: (m, s) => eqv.width(m, s),
    equip: eqv,
    /** 頭像選單的「別人的光效」 */
    menuExtra: () => ui.fxSettingEl(),
    /** 偏好在別的分頁改了（bootstrap、prefs 更新） */
    syncPrefs() { fx.setStatic(String((d.prefs() || {}).fx_static || '') === '1'); },
    redecorate: () => fx.redecorate(),
  };
}
export { fxSettings };
