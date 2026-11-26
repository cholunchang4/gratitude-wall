// T102 留言光效：牆面、放大卡、清單的顯示（設計規格第 12 節；商城提案 3.5、3.5.1）。
// 光效是卡片本身帶的光（messages/{mid}/fx），所有人都看得到；這支只管「怎麼顯示」，不管能不能用（那是規則與 fx-picker.js）。
// - 靜態光框一直在；第一次出現或輪播換進來播一次進場（lx-enter，≤1.5 秒；冬夜小燈 0.8 秒）。
// - 上牆頭 N 天（settings/fx.loop，預設 7）而且拿到動態名額才循環（lx-live）。名額：桌機 4／≥2100 寬 6／手機 2（活動期間減 1），
//   每 20 秒換給下一批，最新的先。等級獎勵、活動模板、冬夜小燈只播進場，不佔名額。至尊／管理員模板完全不顯示光效。
// - 放大卡：打開時進場，之後循環（不佔名額），關掉就停。清單、我的回憶：不加光框，只在作者旁放小圖示。
// - 只看靜態（個人偏好 fx_static）、系統減少動態、後台全站改靜態：一律只剩光框（body.lx-static／lx-rm／lx-off-anim，CSS 處理）。
// - 分頁在背景、拖曳、看大圖時 app.js 的 body.is-paused 會暫停所有動畫；輪替計時器也跟著停。
import { fxModeOf, maxAnimFor, allocateLive, FX_DEFAULT } from './shop-logic.js';
import { fxLayer, fxBadge, fxIcon, esc } from './shop-art.js';
import { T, fmt } from './shop-text.js';

const ROTATE_MS = 20000;
const ENTER_MS = { frost: 800, default: 1500 };
const FOCUS_ENTER_MS = 2000;
const CLASSES = ['lx', 'lx-firefly', 'lx-stream', 'lx-snow', 'lx-frost', 'lx-live', 'lx-enter', 'lx-off'];

/**
 * o = {
 *   wall: HTMLElement（牆面容器）, settings: () => fxSettings 物件, nowMs: () => 伺服器時間,
 *   width?: () => 視窗寬, eventOn?: () => 活動卡本身有動畫的期間（名額減 1）, doc?: document
 * }
 */
export function createFx(o) {
  const doc = o.doc || document, win = doc.defaultView || window;
  const entered = new WeakSet();
  const S = () => (o.settings && o.settings()) || FX_DEFAULT;
  const width = () => (o.width ? o.width() : win.innerWidth);
  let tick = 0, timer = null, pending = null, staticPref = false;
  const mq = win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!(mq && mq.matches);

  function syncBody() {
    const b = doc.body; if (!b) return;
    b.classList.toggle('lx-static', staticPref);
    b.classList.toggle('lx-rm', reduced());
    b.classList.toggle('lx-off-anim', !!S().still);
  }
  const noMotion = () => staticPref || reduced() || !!S().still;

  function clear(card) {
    CLASSES.forEach(c => card.classList.remove(c));
    card.querySelectorAll(':scope > .lx-layer, :scope > .lx-ic').forEach(n => n.remove());
    clearTimeout(card._lxEnterT);
  }
  function playEnter(card, style, ms) {
    if (noMotion()) return;
    card.classList.remove('lx-enter'); void card.offsetWidth;   // 重新觸發動畫
    card.classList.add('lx-enter');
    clearTimeout(card._lxEnterT);
    card._lxEnterT = setTimeout(() => { card.classList.remove('lx-enter'); schedule(); }, ms || ENTER_MS[style] || ENTER_MS.default);
  }

  /**
   * app.js applyCardContent 之後呼叫（每次重畫卡片內容都要叫，可以重複叫）。
   * msg = { id, fx, theme, timestamp }；place：'wall'（預設）／'preview'（小舖預覽，固定循環）／'still'（預覽 7 天後）
   */
  function decorate(card, msg, place = 'wall') {
    if (!card) return;
    clear(card);
    card._lxMsg = msg || null;
    const { style, mode } = fxModeOf(msg || {}, S(), o.nowMs());
    if (!style) { card._lx = null; return; }
    card._lx = { id: msg.id || card.getAttribute('data-id') || '', style, mode, t: Number(msg.timestamp || 0) };
    card.classList.add('lx', `lx-${style}`);
    if (mode === 'off') card.classList.add('lx-off');
    card.insertAdjacentHTML('afterbegin', fxLayer(style) + fxBadge(style));
    if (place === 'preview') { if (mode !== 'off' && style !== 'frost') card.classList.add('lx-live'); return; }
    if (place === 'still') return;
    if (card.classList.contains('focused')) { focus(card); return; }
    if (!entered.has(card)) { entered.add(card); if (mode !== 'off') playEnter(card, style); }
    else if (card._lxLive && mode === 'loop') card.classList.add('lx-live');
    schedule();
  }
  /** 設定改了（後台停用某款、循環天數）：牆上的卡重新套一次（不重播進場） */
  function redecorate() {
    if (!o.wall) return;
    o.wall.querySelectorAll('.message-card').forEach(c => { if (c._lxMsg) { const live = c._lxLive; decorate(c, c._lxMsg); c._lxLive = live && c._lx && c._lx.mode === 'loop'; } });
    refresh();
  }
  /** 輪播換進來（同一個元素換了另一張卡的內容）：當作第一次出現 */
  function swapped(card) { if (card) entered.delete(card); }

  /** 放大卡：打開時進場一次，之後循環（不佔名額）；關掉回牆面規則 */
  function focus(card) {
    if (!card || !card._lx) return;
    const { style, mode } = card._lx;
    if (mode === 'off') return;
    card.classList.remove('lx-live');
    playEnter(card, style, style === 'frost' ? ENTER_MS.frost : FOCUS_ENTER_MS);
    if (mode === 'loop' || mode === 'still') {
      clearTimeout(card._lxFocusT);
      card._lxFocusT = setTimeout(() => { if (card.classList.contains('focused') && style !== 'frost') card.classList.add('lx-live'); }, style === 'frost' ? 0 : FOCUS_ENTER_MS);
    }
  }
  function unfocus(card) {
    if (!card) return;
    clearTimeout(card._lxFocusT); card.classList.remove('lx-enter');
    if (!card._lxLive) card.classList.remove('lx-live');
    schedule();
  }

  /** 重新分配牆面動態名額 */
  function refresh() {
    pending = null;
    syncBody();
    const wall = o.wall; if (!wall) return;
    const cards = [...wall.querySelectorAll('.message-card.lx')];
    if (noMotion()) { cards.forEach(c => { c._lxLive = false; if (!c.classList.contains('focused')) c.classList.remove('lx-live'); }); return; }
    const cands = [];
    for (const c of cards) {
      const x = c._lx; if (!x || x.mode !== 'loop' || c.classList.contains('focused')) continue;
      if (c.style.visibility === 'hidden' || c.hidden || !c.isConnected) continue;
      cands.push({ id: x.id || String(cands.length), t: x.t, el: c });
    }
    const live = allocateLive(cands, maxAnimFor(width(), S(), !!(o.eventOn && o.eventOn())), tick);
    for (const c of cands) {
      const on = live.has(c.id);
      c.el._lxLive = on;
      // 正在播進場的卡等進場播完再開始循環（避免兩個動畫疊在一起）
      if (on && !c.el.classList.contains('lx-enter')) c.el.classList.add('lx-live');
      else if (!on) c.el.classList.remove('lx-live');
    }
  }
  function schedule() { if (pending) return; pending = setTimeout(refresh, 60); }
  function rotate() { if (doc.hidden || doc.body.classList.contains('is-paused')) return; tick++; refresh(); }
  function start() {
    syncBody();
    if (!timer) timer = setInterval(rotate, ROTATE_MS);
    if (mq && mq.addEventListener) mq.addEventListener('change', refresh);
    doc.addEventListener('visibilitychange', onVis);
  }
  function onVis() { if (!doc.hidden) refresh(); }
  function stop() { clearInterval(timer); timer = null; clearTimeout(pending); pending = null; doc.removeEventListener('visibilitychange', onVis); }

  /** 清單、我的回憶：作者旁的小圖示（不動、不加光框）。回傳 HTML 字串（固定內容，沒有使用者資料） */
  function listIcon(msg) {
    const { style } = fxModeOf(msg || {}, S(), o.nowMs());
    if (!style) return '';
    const name = T.fxNames[style] || '';
    return `<span class="lx-li${style === 'snow' ? ' is-snow' : style === 'frost' ? ' is-frost' : ''}" role="img" aria-label="${esc(fmt(T.fxListAria, { name }))}">${fxIcon(style)}</span>`;
  }

  return {
    decorate, redecorate, swapped, focus, unfocus, refresh, schedule, start, stop, listIcon, syncBody,
    /** 個人偏好「別人的光效：只看靜態」 */
    setStatic(v) { staticPref = !!v; refresh(); },
    get isStatic() { return staticPref; },
    get reduced() { return reduced(); },
    get tick() { return tick; },
    _rotate: rotate,   // 測試用：不等 20 秒
  };
}
