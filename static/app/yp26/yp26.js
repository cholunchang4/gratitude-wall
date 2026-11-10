// T108「手心的光」活動頁：版頭入口、活動頁、實體卡預覽、寫卡後的連結。
// 規格：game-design/實體卡片活動-v1.md 第 2、5、9 節；畫面照 design/手心的光/（設計規格 v1.1、mockup.html、entry.html、yp26.css）。
// - 期間一律看伺服器時間（app.js 的 nowMs）；入口只在 start～show_until 出現。
// - 只用自己的資料：mine/{我}（自己寫過的卡，含匿名）＋messages（卡片內容）＋yp26/pick/{我}＋yp26/n（全公司總數）。收件人看不到任何挑選資料。
// - 使用者文字一律經過 esc() 或 textContent（不會變成程式）。
// - 重畫原則：結構（哪些卡、哪些名字、哪些格子）沒變時只更新狀態，不換掉按鈕（換掉會吃掉點擊、弄丟焦點）。
// - 和主牆的介面：app.js 只呼叫 createYp26(...)、afterSend(res)；這個模組出錯不影響主牆。
import { K } from '../fb/constants.js';
import * as Y from './yp26-logic.js';
import { createYp26Api } from './yp26-api.js';

const CFG = K.YP26;
const PAGE = 30;
const DAY = 86_400_000, TPE = 8 * 3_600_000;
const LS = { story: 'yp26_story_seen', coach: 'yp26_coach_done', intro: 'yp26_intro_seen', entry: 'yp26_entry_seen' };
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 無痕模式 */ } };

const tpe = (ms) => { const d = new Date(ms + TPE); return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes() }; };
const WD = '日一二三四五六';
const END = tpe(CFG.end), PARTY = tpe(CFG.party || CFG.show_until - DAY);
const DUE = `${END.mo}/${END.d}（${WD[END.wd]}）${String(END.h).padStart(2, '0')}:${String(END.mi).padStart(2, '0')}`;   // 11/30（一）23:59
const PARTY_MD = `${PARTY.mo}/${PARTY.d}`;                                                                          // 12/11
const SOON = CFG.end + 1 - 2 * DAY;          // 最後兩天（11/29～11/30）入口改成封箱倒數

export const TEXT = Object.freeze({           // GDD 5.4＋設計規格（文字美學官潤飾後在這裡改）
  entry: '手心的光', title: '手心的光', sub: '把六道光，帶到年終派對上', kicker: `Year-end Party · ${PARTY_MD}`,
  trayTitle: (n) => `已選 ${n}／${CFG.cap} 張`,
  noteEmpty: '點下面任一張卡的收件人名字，就能選。',
  noteSome: `點了就存好了，${DUE} 前隨時換。`,
  noteFull: '六道光都亮了。想換的話，先放回一張。',
  full: '六道光都挑好了。想換的話，先放回一張。',
  picked: (name) => `這道光，會帶到 ${name} 手上`, removed: '放回去了',
  gone: '已不在通訊錄', unknown: '找不到這位同事', unknownHint: '找不到這位同事。想把這份謝謝帶去，可以另外寫一張給他本人。',
  afterSend: '這張卡，也可以帶到年終派對 →',
  count: (n) => `已經有 ${n} 道光，等著被帶到派對上`,
  soon: `${DUE} 封箱`, sealedEntry: '信封封好了，派對見', sealedEntryM: `信封封好了，${PARTY_MD} 派對見`,
  sealedH: '信封封好了', sealedP: '你挑的這幾道光，會在年終派對那天，交到他們手上。',
  noneH: '這次的信封已經封好了', noneP: '牆上的光還在，下一張卡，一樣會被看見。',
  saveFail: '剛剛沒存到，再點一次試試', sealed: '信封已經封好了', notStarted: '手心的光還沒開始，到時候再來挑。',
  loadFail: '讀不到你挑的卡，請重新整理頁面再試一次。', rate: '點得有點快，休息一下再試。', notOk: '這張不能挑',
  deleted: '這張卡已經刪除，不會印出來', textOnly: '印出時只有文字', imgNote: '這張的照片不會印出來，只印文字。',
  emptyH: '你還沒有寫過卡', emptyP: '第一張，就從現在開始吧。寫好回到這裡，就能把它帶去派對。', emptyBtn: '去寫第一張',
  coach: '點名字就能挑', moreHint: '往下捲，會再載入更早的卡',
  story: [
    '這一季，感謝牆一直很亮。十月的夜裡，一群愛說謝謝的吸血鬼來過，一百三十六位同事跟著變了身；十一月，留言破了一千，一千道光鋪滿整面牆；接著，光升上了夜空，每被讀懂一次，就有一顆星亮起來。',
    '可是這些光，一直待在螢幕裡。',
    '星空在 11/30 散場以前，從你寫過的卡裡，挑出六道光。我們會把它們印下來、收進信封，在年終派對那天，交到收件人的手上。',
  ],
  storyTurn: '這一次，謝謝不用再隔著螢幕。',
  how: [['點名字就挑好', '寫給三個人的卡，會分成三張，各自可以挑。'], ['一共六張', '給六個人，或都給同一個人，都可以。11/30 前隨時換。'],
        ['還想帶一張', '想謝謝的人還沒寫過？現在寫，回來就挑得到。'], ['匿名的卡', '當初匿名寫的，印出來也一樣匿名。']],
  intro: '這一季牆上的光，一直待在螢幕裡。11/30 以前，從你寫過的卡裡挑六張，我們會印成實體卡，在年終派對那天交到收件人手上。',
});

/** 錯誤代碼 → 給同事看的話 */
export function errorText(code) {
  switch (code) {
    case 'FULL': return TEXT.full;
    case 'CLOSED': return TEXT.sealed;
    case 'NOT_STARTED': return TEXT.notStarted;
    case 'RATE': return TEXT.rate;
    case 'NOT_ACTIVE': return TEXT.gone;
    case 'SELF': case 'NOT_RECIPIENT': case 'NOT_AUTHOR': case 'BAD_INPUT': return TEXT.notOk;
    default: return TEXT.saveFail;
  }
}

// ---------------------------------------------------------------- 圖示、插圖（設計稿 mockup.html，自己畫的 SVG）
const ICON = {
  yp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12.5c.7 4.4 4 7.5 8.5 7.5s7.8-3.1 8.5-7.5"/><path d="M7 12.5c.6 2.3 2.6 3.9 5 3.9s4.4-1.6 5-3.9"/><path class="yp-star" d="M12 2.6l1.15 3.15L16.3 6.9l-3.15 1.15L12 11.2l-1.15-3.15L7.7 6.9l3.15-1.15z"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/></svg>',
  card: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M9.5 7h5"/><circle cx="12" cy="13" r="2.2"/></svg>',
  chev: '<svg class="yp-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  go: '<svg class="yp-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  mask: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9c3-1 6-1 9 0 3-1 6-1 9 0 0 5-3 8-6 8-1.5 0-2.3-1.5-3-3-.7 1.5-1.5 3-3 3-3 0-6-3-6-8z"/></svg>',
  img: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>',
  alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>',
};
const ART = `<svg viewBox="0 0 220 200" aria-hidden="true"><defs><radialGradient id="ypOrb" cx="50%" cy="45%" r="50%"><stop offset="0" stop-color="#fffbe8"/><stop offset=".35" stop-color="#ffe19a"/><stop offset=".7" stop-color="rgba(245,185,66,.55)"/><stop offset="1" stop-color="rgba(245,185,66,0)"/></radialGradient><linearGradient id="ypHand" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd27a" stop-opacity=".3"/><stop offset=".5" stop-color="#ffe7b0"/><stop offset="1" stop-color="#ffd27a" stop-opacity=".3"/></linearGradient></defs>
  <path d="M28 8 C 70 30, 92 62, 110 112" fill="none" stroke="#ffe7b0" stroke-width="1.6" stroke-dasharray="1 7" stroke-linecap="round" opacity=".8"/><circle cx="44" cy="17" r="1.8" fill="#fff"/><circle cx="66" cy="34" r="2.2" fill="#ffe7b0"/><circle cx="86" cy="58" r="2.6" fill="#fff3cf"/>
  <circle cx="110" cy="118" r="44" fill="url(#ypOrb)"/><circle cx="110" cy="118" r="9" fill="#fffdf3"/><path d="M40 132 C 52 182, 168 182, 180 132" fill="none" stroke="url(#ypHand)" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M58 136 C 70 166, 150 166, 162 136" fill="none" stroke="#ffe7b0" stroke-width="1.6" stroke-linecap="round" opacity=".7"/><path d="M40 132 c -3 -9 1 -16 8 -16" fill="none" stroke="#ffd27a" stroke-width="2.4" stroke-linecap="round" opacity=".75"/><path d="M180 132 c 3 -9 -1 -16 -8 -16" fill="none" stroke="#ffd27a" stroke-width="2.4" stroke-linecap="round" opacity=".75"/>
  <path d="M168 40 l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2z" fill="#fff3cf"/><path d="M190 76 l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3-3.3-1.2 3.3-1.2z" fill="#ffe7b0"/></svg>`;
const EMPTY_ART = '<svg viewBox="0 0 120 104" aria-hidden="true"><path d="M14 60 C 22 98, 98 98, 106 60" fill="none" stroke="#e2b765" stroke-width="3" stroke-linecap="round"/><path d="M26 62 C 34 84, 86 84, 94 62" fill="none" stroke="#f0d49a" stroke-width="2" stroke-linecap="round"/><circle cx="60" cy="36" r="13" fill="none" stroke="#e2b765" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round"/><path d="M60 28 l2 5.6 5.6 2-5.6 2-2 5.6-2-5.6-5.6-2 5.6-2z" fill="#f5b942"/></svg>';
const ENV_ART = '<svg class="yp-env" viewBox="0 0 180 120" aria-hidden="true"><rect x="10" y="20" width="160" height="94" rx="8" fill="#f3e9da" stroke="#d9c3a2"/><path d="M10 28 L90 74 L170 28" fill="#ead9c1" stroke="#d9c3a2"/><circle cx="90" cy="72" r="13" fill="#f5b942" stroke="#c98a12"/><path d="M90 64.5l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6z" fill="#fff8e0"/><circle cx="40" cy="10" r="1.6" fill="#f5b942"/><circle cx="140" cy="8" r="2" fill="#f5b942"/><circle cx="160" cy="16" r="1.2" fill="#f5b942"/></svg>';
const MARK = '<svg class="yp-pc-mark" viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="pcOrb" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fffbe8"/><stop offset=".4" stop-color="#ffe19a"/><stop offset="1" stop-color="rgba(245,185,66,0)"/></radialGradient></defs><circle cx="50" cy="40" r="26" fill="url(#pcOrb)"/><path d="M50 26l3.4 9.6 9.6 3.4-9.6 3.4L50 52l-3.4-9.6L37 39l9.6-3.4z" fill="#c98a12"/><path d="M14 58 C 20 88, 80 88, 86 58" fill="none" stroke="#c98a12" stroke-width="3" stroke-linecap="round"/><path d="M26 61 C 32 77, 68 77, 74 61" fill="none" stroke="#e2b765" stroke-width="2" stroke-linecap="round"/></svg>';
// 漸層放進 index.html 既有的 #sharedDefs（同名 id 放在隱藏元素裡會失效，理由同至尊皇冠）
const DEFS = '<radialGradient id="ypRayG" cx="0" cy="0" r="50" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff6d6"/><stop offset=".45" stop-color="#ffd36b"/><stop offset="1" stop-color="#e59a12"/></radialGradient><radialGradient id="ypHalo" cx="0" cy="0" r="60" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="rgba(255,214,120,.75)"/><stop offset=".55" stop-color="rgba(245,185,66,.25)"/><stop offset="1" stop-color="rgba(245,185,66,0)"/></radialGradient>';

/** 模板色條（同清單 lt-*），key＝牆面 theme class */
const BAR = { 't-classic': '#d4c4c9', 't-sage': '#6fa07f', 't-lemon': '#e0b93a', 't-slate': '#7d90ab', 't-lavender': '#9b7fd0', 't-matcha': '#8ea64c', 't-ice': '#5aa8dc', 't-midnight': '#2f3650', 't-wine': '#8a3648', 't-terracotta': '#9a462f',
  't-r-neon': '#22d3ee', 't-r-holo': 'linear-gradient(90deg,#5eead4,#818cf8,#c084fc)', 't-r-gold': 'linear-gradient(90deg,#fff4c2,#d4a52a 40%,#7a5a12 60%,#f7dc85)', 't-r-cosmic': 'linear-gradient(90deg,#c4b5fd,#22d3ee,#f472b6)', 't-r-ultimate': 'linear-gradient(90deg,#ff6ad5,#ad8cff,#94d0ff,#7af0c4,#ffe66d)',
  't-admin': 'linear-gradient(90deg,#ffd978,#ff9ad5,#7dd3fc,#ffd978)', 't-admin-neon': 'linear-gradient(90deg,#f0abfc,#a78bfa,#67e8f9)', 't-halloween': '#fb923c', 'k1000-card': 'linear-gradient(90deg,#ffe7a8,#f5b942,#e08a00)',
  't-starnight': '#3b4b8a', 'sn-card': '#3b4b8a', 't-moon': '#d9b45a' };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ymd = (ms) => { const t = tpe(ms); return `${t.y}/${String(t.mo).padStart(2, '0')}/${String(t.d).padStart(2, '0')}`; };
const md = (ms) => { const t = tpe(ms); return `${t.mo}/${String(t.d).padStart(2, '0')}`; };
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 六道光的星（方案 A：六道光芒）。n＝亮幾道（從正上方順時針）。不是交疊三角形。 */
export function starSvg(n, cls = '') {
  const P = (r, deg) => { const a = (deg - 90) * Math.PI / 180; return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`; };
  let rays = '';
  for (let i = 0; i < 6; i++) { const d = i * 60; rays += `<path class="yp-ray${i < n ? ' on' : ''}" style="--i:${i}" d="M${P(11, d)}L${P(21, d - 12)}L${P(48, d)}L${P(21, d + 12)}Z"/>`; }
  return `<svg class="yp-star6 yp-star6-a${n >= 6 ? ' is-full' : ''} ${cls}" viewBox="-60 -60 120 120" aria-hidden="true" focusable="false"><circle class="yp-halo" r="60" fill="url(#ypHalo)"/><g class="yp-rays" style="--g:url(#ypRayG)">${rays}</g><circle class="yp-core" r="7.5"/></svg>`;
}

// ---------------------------------------------------------------- 實體卡（預覽與之後的印製檔用同一份）
const PT_MAX = 20, PT_MIN = 6, PT_STEP = 0.5;
/**
 * 字級：從 20pt 每次減 0.5pt，整段放得下就停（預覽版面以 A6 尺寸繪製，等比放大到 A5，所以 6pt 實際約 8.5pt）。
 * 卓倫 11/10：實體卡印牆上卡片原樣、不考慮超長卡 → 不再把後半段接到背面。6pt 還放不下（極少數）就照樣縮在正面，標 data-overflow。
 * back 參數保留（呼叫端不用改），背面不放內文。
 */
export function fitPair(front, back, text) {
  void back; void text;
  const card = front.querySelector('.yp-pc-card'), p = card.querySelector('.card-text');
  const over = () => p.scrollHeight > p.clientHeight + 1;
  for (let pt = PT_MAX; pt >= PT_MIN; pt -= PT_STEP) { card.style.setProperty('--pc-fs', pt + 'pt'); card.classList.toggle('is-long', pt <= 12); if (!over()) return { pt, overflow: false }; }
  card.dataset.overflow = '1';
  return { pt: PT_MIN, overflow: true };
}
export function scaleFits(scope) {
  scope.querySelectorAll('.yp-pc-fit').forEach(f => { const pc = f.firstElementChild; if (pc && pc.offsetWidth) f.style.setProperty('--k', f.clientWidth / pc.offsetWidth); });
}

/**
 * o = { db, user, meId, emulator, store（WallStore）, onBackend(fn), nowMs(), writeTo(name),
 *       look: { cls(theme), name(theme), decor(theme), avatarColor(uid, name), initials(name) }, cssHref? }
 * 回傳 { open, close, update, afterSend, state }（state 只給測試看）
 */
export function createYp26(o) {
  const L = Object.assign({ cls: () => 't-classic', name: () => '', decor: () => '', avatarColor: () => '#0369a1', initials: (n) => String(n || '?').slice(0, 1) }, o.look || {});
  const st = {
    phase: 'before', open: false, picks: null, picksErr: null, count: null, busy: new Map(),
    shown: PAGE, q: '', filter: 'all', highlight: null, fromPage: false, lastFocus: null, listening: false, modal: null,
  };
  const api = createYp26Api({ db: o.db, user: o.user, meId: o.meId, emulator: o.emulator,
    onPicks: (v, err) => { st.picks = v; st.picksErr = err || null; render(); },
    onCount: (n) => { st.count = n; renderEntry(); } });

  // ---------------------------------------------------------------- 樣式、漸層、入口
  if (!document.getElementById('yp26Css')) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', id: 'yp26Css', href: o.cssHref || new URL('./yp26.css', import.meta.url).href }));
  const defs = document.querySelector('#sharedDefs defs');
  if (defs && !document.getElementById('ypRayG')) defs.insertAdjacentHTML('beforeend', DEFS);
  else if (!defs && !document.getElementById('ypRayG')) document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false"><defs>${DEFS}</defs></svg>`);

  const tpl = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const dotNew = lsGet(LS.entry) ? '' : '<i class="dot-new" aria-hidden="true"></i>';
  const entry = tpl(`<button type="button" class="yp-ent" id="yp26Entry" hidden aria-haspopup="dialog" aria-label="手心的光：挑卡印成實體卡">${dotNew}<span class="yp-ico">${ICON.yp}</span><b>手心的光</b><span class="yp-sep" aria-hidden="true"></span><span class="yp-meta"></span></button>`);
  const entryM = tpl(`<button type="button" class="yp-ent-m" id="yp26EntryM" hidden aria-haspopup="dialog" aria-label="手心的光：挑卡印成實體卡">${dotNew}<span class="yp-ico">${ICON.yp}</span><b>手心的光</b><span class="yp-meta"></span>${ICON.go}</button>`);
  const topbar = document.querySelector('header.topbar'), tools = topbar && topbar.querySelector('.tools');
  if (tools) tools.after(entry); else if (topbar) topbar.append(entry);
  const sbar = document.querySelector('.switch-bar');
  if (sbar) sbar.append(entryM);
  for (const b of [entry, entryM]) b.addEventListener('click', () => { lsSet(LS.entry, '1'); document.querySelectorAll('.yp-ent .dot-new, .yp-ent-m .dot-new').forEach(d => d.remove()); open(); });

  function renderEntry() {
    const show = st.phase === 'open' || st.phase === 'closed';
    entry.hidden = entryM.hidden = !show;
    if (sbar) sbar.classList.toggle('has-yp', show);
    if (!show) return;
    const now = o.nowMs(), n = st.count;
    let d = '', m = '', cls = '';
    if (st.phase === 'closed') { d = `信封封好了<span class="yp-meta-long">，派對見</span>`; m = esc(TEXT.sealedEntryM); cls = 'is-sealed'; }
    else if (now >= SOON) { d = `<span>${esc(TEXT.soon)}</span>`; m = esc(TEXT.soon); cls = 'is-soon'; }
    else if (n > 0) { d = `已經有 <em>${n}</em> 道光，<span class="yp-meta-long">等著被帶到派對上</span>`; m = `已經有 <em>${n}</em> 道光，等著被帶到派對上`; }
    else { d = '挑六道光，<span class="yp-meta-long">帶到年終派對上</span>'; m = '挑六道光，帶到年終派對上'; }
    for (const [b, html] of [[entry, d], [entryM, m]]) {
      b.classList.toggle('is-soon', cls === 'is-soon'); b.classList.toggle('is-sealed', cls === 'is-sealed');
      const meta = b.querySelector('.yp-meta'); if (meta.innerHTML !== html) meta.innerHTML = html;
    }
  }

  const hint = tpl(`<div class="yp26-hint" id="yp26Hint" hidden role="status"><button type="button" class="yp26-hint-go">${ICON.yp}<span>${esc(TEXT.afterSend)}</span></button><button type="button" class="yp26-hint-x" aria-label="關閉">${ICON.x}</button></div>`);
  document.body.append(hint);
  let hintTimer = null, hintMid = null;
  const hideHint = () => { hint.hidden = true; clearTimeout(hintTimer); };
  hint.querySelector('.yp26-hint-go').addEventListener('click', () => { hideHint(); open({ highlight: hintMid }); });
  hint.querySelector('.yp26-hint-x').addEventListener('click', hideHint);

  // ---------------------------------------------------------------- 活動頁骨架（只建一次）
  const howHtml = `<ul class="yp-how" aria-label="怎麼挑">${TEXT.how.map(([b, s], i) => `<li><span class="yp-n">${i + 1}</span><div><b>${esc(b)}</b><span>${esc(s)}</span></div></li>`).join('')}</ul>`;
  const progHtml = (sz) => `<div class="yp-prog" role="img" aria-label="已選 0 張，最多 ${CFG.cap} 張">${starSvg(0, sz)}<h2 class="yp-tray-title">${esc(TEXT.trayTitle(0))}</h2></div>`;
  const layer = tpl(`<section class="yp-layer" id="yp26Page" hidden role="dialog" aria-modal="true" aria-labelledby="ypTitle">
    <div class="yp-bar"><button type="button" class="yp-back">${ICON.back}回到感謝牆</button><div class="yp-bar-title" aria-hidden="true">手心的光</div>
      <span class="yp-due">${ICON.clock}<span class="yp-due-l">${esc(DUE)} 封箱</span><span class="yp-due-s">${END.mo}/${END.d} 封箱</span></span></div>
    <header class="yp-hero"><div class="yp-hero-in"><div>
      <p class="yp-kicker">${esc(TEXT.kicker)}</p><h1 class="yp-title" id="ypTitle">${esc(TEXT.title)}</h1><p class="yp-sub">${esc(TEXT.sub)}</p>
      <div class="yp-story" id="ypStory">${TEXT.story.map(p => `<p>${esc(p)}</p>`).join('')}<p class="yp-turn">${esc(TEXT.storyTurn)}</p></div>
      <button type="button" class="yp-story-toggle" aria-expanded="true" aria-controls="ypStory"><span>收起故事</span>${ICON.down}</button>
    </div><div class="yp-art">${ART}</div></div></header>
    <main class="yp-main yp-main-open"><section aria-labelledby="listH">${howHtml}
      <div class="yp-list-head"><h2 class="yp-h2" id="listH">我寫過的卡<small>新到舊</small></h2></div>
      <div class="yp-tools" role="search"><label class="yp-search">${ICON.search}<input type="search" placeholder="找收件人" aria-label="用收件人名字找卡" autocomplete="off"></label>
        <div class="yp-seg" role="group" aria-label="篩選"><button type="button" data-f="all" aria-pressed="true">全部</button><button type="button" data-f="picked" aria-pressed="false">已挑</button><button type="button" data-f="ok" aria-pressed="false">可以挑的</button></div></div>
      <button type="button" class="yp-write"><span>想謝謝的人<b>還沒寫過？</b></span><span class="yp-write-go">寫一張 →</span></button>
      <div class="yp26-banner" role="alert" hidden></div>
      <ul class="yp-rows"></ul>
      <div class="yp-more-row" hidden><button type="button" class="yp26-more-btn"></button></div>
      <div class="yp-empty" hidden>${EMPTY_ART}<h3>${esc(TEXT.emptyH)}</h3><p>${esc(TEXT.emptyP)}</p><button type="button" class="yp-btn yp26-empty-btn">${esc(TEXT.emptyBtn)}</button></div>
      <div class="yp-search-none" hidden></div>
    </section>
    <aside class="yp-side" aria-label="已選的卡"><div class="yp-tray">
      <button type="button" class="yp-drawer-handle" aria-expanded="false">${progHtml('is-s')}${ICON.chev}</button>
      <div class="yp-tray-head">${progHtml('is-l')}</div>
      <div class="yp-tray-body"><p class="yp-tray-note" aria-live="polite"></p><ol class="yp-slots"></ol>
        <button type="button" class="yp-pv-btn" disabled>${ICON.card}看實體卡預覽</button>
        <p class="yp-tray-foot">A5 卡片（148×210mm）· 年終派對 ${esc(PARTY_MD)} 交到對方手上</p></div></div></aside></main>
    <main class="yp-main yp-main-sealed" hidden style="grid-template-columns:minmax(0,1fr)"><section class="yp-sealed" aria-labelledby="sealH">${ENV_ART}
      <h2 id="sealH"></h2><p class="yp-sealed-p"></p><button type="button" class="yp-btn is-ghost yp26-sealed-back" hidden>回到感謝牆</button><ul class="yp-sealed-grid"></ul></section></main>
    <div class="yp-toast" hidden></div>
  </section>`);
  document.body.append(layer);
  const $ = (s) => layer.querySelector(s);
  const E = { hero: $('.yp-hero'), story: $('.yp-story-toggle'), mainOpen: $('.yp-main-open'), mainSealed: $('.yp-main-sealed'), rows: $('.yp-rows'), more: $('.yp-more-row'),
    moreBtn: $('.yp26-more-btn'), empty: $('.yp-empty'), none: $('.yp-search-none'), tools: $('.yp-tools'), write: $('.yp-write'), banner: $('.yp26-banner'),
    q: $('.yp-search input'), seg: $('.yp-seg'), side: $('.yp-side'), tray: $('.yp-tray'), handle: $('.yp-drawer-handle'), note: $('.yp-tray-note'),
    slots: $('.yp-slots'), pv: $('.yp-pv-btn'), toast: $('.yp-toast'), sealGrid: $('.yp-sealed-grid') };

  // 互動（事件委派：重畫不會讓監聽消失）
  $('.yp-back').addEventListener('click', () => close());
  $('.yp26-sealed-back').addEventListener('click', () => close());
  E.story.addEventListener('click', () => setStory(!E.hero.classList.contains('is-collapsed')));
  E.q.addEventListener('input', () => { st.q = E.q.value; st.shown = PAGE; renderList(); });
  E.seg.addEventListener('click', (e) => { const b = e.target.closest('button[data-f]'); if (b) { st.filter = b.dataset.f; st.shown = PAGE; renderList(); } });
  E.write.addEventListener('click', () => goWrite(''));
  $('.yp26-empty-btn').addEventListener('click', () => goWrite(''));
  E.moreBtn.addEventListener('click', () => { st.shown += PAGE; renderList(); });
  E.handle.addEventListener('click', () => { const on = E.side.classList.toggle('is-open'); E.handle.setAttribute('aria-expanded', on ? 'true' : 'false'); });
  E.side.addEventListener('click', (e) => { if (e.target === E.side) { E.side.classList.remove('is-open'); E.handle.setAttribute('aria-expanded', 'false'); } });   // 點遮罩收合
  E.pv.addEventListener('click', () => openPreview(orderedPicks(), 0));
  E.slots.addEventListener('click', (e) => {
    const x = e.target.closest('.yp-slot-x'); if (x) return unpick(x.closest('.yp-slot').dataset.key);
    const b = e.target.closest('.yp-slot-btn'); if (b) { const keys = orderedPicks(); openPreview(keys, Math.max(0, keys.indexOf(b.closest('.yp-slot').dataset.key))); }
  });
  E.rows.addEventListener('click', (e) => {
    const row = e.target.closest('.yp-row'); if (!row) return;
    const card = cardsByMid.get(row.dataset.mid); if (!card) return;
    if (e.target.closest('.yp-peek')) { const c = card.chips.find(x => x.rid && pickedSet().has(x.key)) || card.chips.find(x => x.rid) || card.chips[0]; return openPreview([c ? (c.key || `${card.mid}~`) : `${card.mid}~`], 0, card); }
    const more = e.target.closest('.yp-more'); if (more) { const on = row.classList.toggle('is-open'); more.textContent = on ? '收起' : '全文'; more.setAttribute('aria-expanded', on ? 'true' : 'false'); return; }
    const w = e.target.closest('.yp26-tip-write'); if (w) return goWrite('');
    const chip = e.target.closest('.yp-chip'); if (!chip) return;
    const x = card.chips[Number(chip.dataset.i)]; if (!x) return;
    if (x.state !== 'ok') return toggleTip(chip, true);
    toggle(x, card, chip);
  });
  const tipOf = (chip) => chip.parentElement.querySelector('.yp-tip');
  function toggleTip(chip, on) { const t = tipOf(chip); if (t) t.hidden = !on; }
  E.rows.addEventListener('mouseover', (e) => { const c = e.target.closest('.yp-chip.is-off'); if (c) toggleTip(c, true); });
  E.rows.addEventListener('mouseout', (e) => { const c = e.target.closest('.yp-chip-wrap'); if (c && !c.contains(e.relatedTarget)) { const ch = c.querySelector('.yp-chip.is-off'); if (ch && document.activeElement !== ch) toggleTip(ch, false); } });
  E.rows.addEventListener('focusin', (e) => { const c = e.target.closest('.yp-chip.is-off'); if (c) toggleTip(c, true); });
  E.rows.addEventListener('focusout', (e) => { const c = e.target.closest('.yp-chip.is-off'); if (c && !c.parentElement.contains(e.relatedTarget)) toggleTip(c, false); });
  E.none.addEventListener('click', (e) => { if (e.target.closest('button')) goWrite(st.q.trim()); });
  layer.addEventListener('scroll', () => layer.classList.toggle('is-scrolled', layer.scrollTop > 220), { passive: true });
  // Esc：先關預覽／彈窗，再關活動頁（capture，不讓主牆的 Esc 同時作用）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (st.modal || st.open)) { e.stopPropagation(); e.preventDefault(); if (st.modal) closeModal(); else close(); }
    else if (e.key === 'Tab' && st.modal) trapFocus(e, st.modal.el);
    else if (e.key === 'Tab' && st.open) trapFocus(e, layer);
  }, true);
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { if (es.some(x => x.isIntersecting) && !E.more.hidden) { st.shown += PAGE; renderList(); } }, { root: layer, rootMargin: '200px' }) : null;
  if (io) io.observe(E.more);

  let toastTimer = null;
  function say(text, kind = 'ok', ms = 2000) {
    E.toast.className = `yp-toast is-${kind}`; E.toast.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    E.toast.innerHTML = (kind === 'err' ? ICON.alert : '<i aria-hidden="true"></i>') + `<span>${esc(text)}</span>`;
    E.toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { E.toast.hidden = true; }, kind === 'err' ? Math.max(ms, 4000) : ms);
  }
  function setStory(collapsed) {
    E.hero.classList.toggle('is-collapsed', collapsed);
    E.story.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    E.story.querySelector('span').textContent = collapsed ? '看這一季的故事' : '收起故事';
  }

  // ---------------------------------------------------------------- 資料整理
  let cardsByMid = new Map();
  /** 我寫過、還沒刪除的卡（新到舊），每張展開成收件人膠囊；沒有任何收件人膠囊的卡（只寫給自己、寫給「大家」）不列 */
  function myCards() {
    const s = o.store, idx = Y.nameIndex(s.people), out = [];
    for (const mid of Object.keys(s.mine || {})) {
      const m = s.messages.get(mid);
      if (!m) continue;
      const chips = Y.expandCard(mid, { r: m.receiver, ri: m.receiver_ids }, o.meId, s.people, idx);
      if (!chips.length) continue;
      out.push({ mid, m, chips, img: !!m.image });                       // img：有照片或塗鴉 → 印出時只有文字
    }
    out.sort((a, b) => b.m.created_at - a.m.created_at || (a.mid < b.mid ? 1 : -1));
    cardsByMid = new Map(out.map(c => [c.mid, c]));
    return out;
  }
  function pickedSet() {
    const set = new Set(Y.pickList(st.picks));
    for (const [k, a] of st.busy) { if (a === 'add') set.add(k); else set.delete(k); }
    return set;
  }
  function orderedPicks() {
    const set = pickedSet();
    return Y.pickList(st.picks).filter(k => set.has(k)).concat([...set].filter(k => !(st.picks && st.picks[k])));
  }

  // ---------------------------------------------------------------- 挑／放回
  function applyResult(res) {
    if (!res || !Array.isArray(res.picks)) return;
    const cur = st.picks || {}, t = o.nowMs();
    st.picks = Object.fromEntries(res.picks.filter(k => Y.parsePickKey(k)).map(k => [k, cur[k] || { t }]));
  }
  async function toggle(chip, card, el) {
    if (st.phase !== 'open') return say(st.phase === 'before' ? TEXT.notStarted : TEXT.sealed, 'err');
    if (st.busy.has(chip.key) || st.picks == null) return;
    const set = pickedSet(), on = set.has(chip.key);
    if (!on && set.size >= CFG.cap) return say(TEXT.full, 'ok', 3000);
    if (!lsGet(LS.coach)) { lsSet(LS.coach, '1'); layer.querySelectorAll('.yp-coach').forEach(c => c.remove()); }
    st.busy.set(chip.key, on ? 'remove' : 'add'); render();
    try {
      applyResult(await (on ? api.remove(card.mid, chip.rid) : api.add(card.mid, chip.rid)));
      st.busy.delete(chip.key); render();
      if (!on) fly(el, E.slots.querySelector(`.yp-slot[data-key="${CSS.escape(chip.key)}"]`));
      say(on ? TEXT.removed : TEXT.picked(chip.name));
    } catch (e) {
      st.busy.delete(chip.key); render();
      const b = E.rows.querySelector(`.yp-chip[data-key="${CSS.escape(chip.key)}"]`);
      if (b && !reduced()) { b.classList.remove('is-bounce'); void b.offsetWidth; b.classList.add('is-bounce'); setTimeout(() => b.classList.remove('is-bounce'), 600); }
      say(errorText(e && e.code), 'err');
      if (e && e.code === 'CLOSED') update();
    }
  }
  async function unpick(key) {
    if (st.phase !== 'open') return say(TEXT.sealed, 'err');
    const p = Y.parsePickKey(key);
    if (!p || st.busy.has(key)) return;
    st.busy.set(key, 'remove'); render();
    try { applyResult(await api.remove(p.mid, p.rid)); say(TEXT.removed); }
    catch (e) { say(errorText(e && e.code), 'err'); }
    finally { st.busy.delete(key); render(); }
  }
  /** 挑一張時，一小點光從名字飛進格子（0.4 秒）；減少動態時不飛 */
  function fly(from, to) {
    if (!from || !to || reduced() || typeof from.animate !== 'function') return;
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    if (!a.width || !b.width) return;
    const dot = document.createElement('i'); dot.className = 'yp-fly'; dot.setAttribute('aria-hidden', 'true');
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
    dot.style.left = x0 + 'px'; dot.style.top = y0 + 'px'; document.body.append(dot);
    const dx = x1 - x0, dy = y1 - y0;
    dot.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${dx * .5}px,${dy * .5 - 60}px)`, offset: .5 }, { transform: `translate(${dx}px,${dy}px)` }], { duration: 400, easing: 'ease-out' })
      .finished.then(() => { dot.remove(); to.classList.add('is-landing'); setTimeout(() => to.classList.remove('is-landing'), 600); }, () => dot.remove());
  }
  function goWrite(name) { st.fromPage = true; close(false); o.writeTo(name || ''); }

  // ---------------------------------------------------------------- 畫面
  function render() {
    if (!st.open) return;
    const sealed = st.phase !== 'open';
    E.mainOpen.hidden = sealed; E.mainSealed.hidden = !sealed;
    $('.yp-due-l').textContent = sealed ? '信封封好了' : `${DUE} 封箱`; $('.yp-due-s').textContent = sealed ? '已封箱' : `${END.mo}/${END.d} 封箱`;
    if (sealed) return renderSealed();
    E.banner.hidden = !st.picksErr; E.banner.textContent = st.picksErr ? TEXT.loadFail : '';
    renderTray(); renderList();
  }

  function renderTray() {
    const keys = orderedPicks(), n = keys.length, loading = st.picks == null;
    E.tray.classList.toggle('is-full', n >= CFG.cap);
    for (const prog of layer.querySelectorAll('.yp-tray .yp-prog')) {
      prog.setAttribute('aria-label', loading ? '讀取中' : `已選 ${n} 張，最多 ${CFG.cap} 張`);
      prog.querySelectorAll('.yp-ray').forEach((r, i) => r.classList.toggle('on', !loading && i < n));
      prog.querySelector('.yp-star6').classList.toggle('is-full', n >= CFG.cap);
      const t = prog.querySelector('.yp-tray-title');
      const html = loading ? '已選 <em>–</em><span>／' + CFG.cap + ' 張</span>' : `已選 <em>${n}</em><span>／${CFG.cap} 張</span>`;
      if (t.innerHTML !== html) t.innerHTML = html;
    }
    E.note.textContent = loading ? '讀取中…' : n === 0 ? TEXT.noteEmpty : n >= CFG.cap ? TEXT.noteFull : TEXT.noteSome;
    E.pv.disabled = loading || n === 0;
    const sig = keys.map(k => k + (o.store.messages.has(Y.parsePickKey(k).mid) ? '' : '!')).join(',');
    if (E.slots.dataset.sig !== sig) {
      E.slots.dataset.sig = sig;
      E.slots.innerHTML = Array.from({ length: CFG.cap }, (_, i) => {
        const k = keys[i];
        if (!k) return '<li class="yp-slot is-empty" aria-label="空格"><i></i></li>';
        const p = Y.parsePickKey(k), m = o.store.messages.get(p.mid), name = o.store.nameOf(p.rid) || '（已不在通訊錄）';
        return `<li class="yp-slot${m ? '' : ' is-deleted'}" data-key="${esc(k)}"><button type="button" class="yp-slot-btn" style="--bar:${m ? BAR[L.cls(m.theme)] || BAR['t-classic'] : '#ccc'}" aria-label="看給 ${esc(name)} 的實體卡預覽"><b>${esc(name)}</b><span>${esc(m ? m.text : TEXT.deleted)}</span></button>`
          + `<button type="button" class="yp-slot-x" aria-label="把給 ${esc(name)} 的這張放回">${ICON.x}</button></li>`;
      }).join('');
    }
    for (const li of E.slots.querySelectorAll('.yp-slot[data-key]')) {
      const busy = st.busy.has(li.dataset.key);
      li.classList.toggle('is-busy', busy);
      li.querySelector('.yp-slot-x').setAttribute('aria-disabled', busy ? 'true' : 'false');
    }
  }

  function renderList() {
    if (!st.open || st.phase !== 'open') return;
    for (const b of E.seg.querySelectorAll('button')) b.setAttribute('aria-pressed', b.dataset.f === st.filter ? 'true' : 'false');
    if (st.picks == null && !st.picksErr) {
      E.rows.dataset.sig = ''; E.rows.setAttribute('aria-busy', 'true');
      E.rows.innerHTML = Array.from({ length: 4 }, () => '<li class="yp-row is-skel" aria-hidden="true"><div class="yp-skel" style="width:120px;height:14px"></div><div class="yp-skel" style="grid-column:1/-1;height:16px;margin-top:10px"></div><div class="yp-skel" style="grid-column:1/-1;width:70%;height:16px;margin-top:6px"></div><div style="grid-column:1/-1;display:flex;gap:8px;margin-top:12px"><div class="yp-skel" style="width:96px;height:44px;border-radius:999px"></div><div class="yp-skel" style="width:96px;height:44px;border-radius:999px"></div></div></li>').join('');
      E.more.hidden = E.empty.hidden = E.none.hidden = true; return;
    }
    E.rows.removeAttribute('aria-busy');
    const all = myCards();
    E.empty.hidden = all.length > 0;
    E.tools.hidden = E.write.hidden = all.length === 0;
    const set = pickedSet(), full = set.size >= CFG.cap, q = Y.foldName(st.q);
    const busyIn = (c) => c.chips.some(x => st.busy.has(x.key));        // 送出中的那張不會馬上從篩選結果消失
    let rows = all;
    if (q) rows = rows.filter(c => c.chips.some(x => Y.foldName(x.name).includes(q)));
    if (st.filter === 'picked') rows = rows.filter(c => busyIn(c) || c.chips.some(x => set.has(x.key)));
    if (st.filter === 'ok') rows = rows.filter(c => busyIn(c) || c.chips.some(x => x.state === 'ok' && !set.has(x.key)));
    const list = rows.slice(0, st.shown);
    const showNone = all.length > 0 && rows.length === 0;
    E.none.hidden = !showNone;
    if (showNone) E.none.innerHTML = q ? `沒有寫給 <b>「${esc(st.q.trim())}」</b> 的卡。<br><button type="button" class="yp-btn is-ghost" style="margin-top:12px">寫一張給他 →</button>` : '沒有符合的卡。';
    const coachOn = !lsGet(LS.coach);
    const sig = list.map(c => `${c.mid}:${c.m.text.length}:${c.chips.map(x => `${x.key || x.name}/${x.state}`).join('|')}`).join(',');                                   // 新手提示消失時不重建（用 DOM 拿掉），焦點才不會掉
    if (E.rows.dataset.sig !== sig) {
      E.rows.dataset.sig = sig;
      let coachDone = !coachOn;
      E.rows.innerHTML = list.map(c => { const h = rowHtml(c, !coachDone); if (!coachDone && c.chips.some(x => x.state === 'ok')) coachDone = true; return h; }).join('');
    }
    for (const li of E.rows.querySelectorAll('.yp-row[data-mid]')) {
      const c = cardsByMid.get(li.dataset.mid); if (!c) continue;
      li.classList.toggle('has-pick', c.chips.some(x => x.key && set.has(x.key)));
      if (c.mid === st.highlight && !li.classList.contains('is-new')) li.classList.add('is-new');
      li.querySelectorAll('.yp-chip[data-i]').forEach(b => syncChip(b, c.chips[Number(b.dataset.i)], set, full));
    }
    E.more.hidden = rows.length <= st.shown;
    E.moreBtn.textContent = `${TEXT.moreHint}（再 ${Math.min(PAGE, Math.max(0, rows.length - st.shown))} 張）`;
  }

  function rowHtml(c, coach) {
    const m = c.m, cls = L.cls(m.theme), tname = L.name(m.theme);
    const tags = (c.mid === st.highlight ? '<span class="yp-tag is-new">剛寫的</span>' : '')
      + (m.mode === 'anonymous' ? '<span class="yp-tag">匿名</span>' : '')
      + (m.mode === 'mask' ? `<span class="yp-tag">${ICON.mask}假面｜${esc(String(m.mask || '').replace(/^\S+\s/, '') || '假面')}</span>` : '')
      + (c.img ? `<span class="yp-tag yp26-textonly">${ICON.img}${esc(TEXT.textOnly)}</span>` : '');
    const long = [...String(m.text || '')].length > 60;
    let coachPut = !coach;
    const chips = c.chips.map((x, i) => {
      if (x.state !== 'ok') {
        const why = x.state === 'gone' ? TEXT.gone : TEXT.unknown;
        const tip = x.state === 'gone' ? esc(TEXT.gone) : `${esc(TEXT.unknownHint)}<button type="button" class="yp26-tip-write">寫一張 →</button>`;
        return `<span class="yp-chip-wrap"><button type="button" class="yp-chip is-off" data-i="${i}" aria-disabled="true" aria-describedby="yptip-${esc(c.mid)}-${i}">${esc(x.name)}<small>${why}</small></button><span class="yp-tip" role="tooltip" id="yptip-${esc(c.mid)}-${i}" hidden>${tip}</span></span>`;
      }
      const ch = !coachPut ? `<span class="yp-coach" aria-hidden="true">${esc(TEXT.coach)}</span>` : '';
      coachPut = true;
      return `<button type="button" class="yp-chip" data-i="${i}" data-key="${esc(x.key)}" aria-pressed="false" aria-label="${esc(x.name)}"><span class="yp-box">${ICON.check}</span>${esc(x.name)}${ch}</button>`;
    }).join('');
    return `<li class="yp-row" data-mid="${esc(c.mid)}" data-theme="${esc(m.theme)}" style="--bar:${BAR[cls] || BAR['t-classic']}">
      <div class="yp-row-meta"><time datetime="${new Date(m.created_at).toISOString()}">${md(m.created_at)}</time>${tags}<span class="yp-theme">${esc(tname)}</span></div>
      <p class="yp-row-text">${esc(m.text || '（只有圖片）')}</p>
      <div class="yp-row-side"><button type="button" class="yp-peek" aria-label="看這張印出來的樣子" title="看印出來的樣子">${ICON.eye}</button>${long ? '<button type="button" class="yp-more" aria-expanded="false">全文</button>' : ''}</div>
      <div class="yp-to"><span class="yp-to-label">印給</span>${chips}</div></li>`;
  }

  /** 名字膠囊的狀態：只改屬性，不換元素 */
  function syncChip(b, x, set, full) {
    if (!b || !x || x.state !== 'ok') return;
    const on = set.has(x.key), busy = st.busy.has(x.key);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.classList.toggle('is-saving', busy);
    if (!on && full) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
    b.setAttribute('aria-label', `${x.name}${on ? '，已挑' : ''}`);
  }

  function renderSealed() {
    const keys = orderedPicks().filter(k => o.store.messages.has(Y.parsePickKey(k).mid));
    const none = st.picks != null && keys.length === 0;
    $('#sealH').textContent = st.picks == null ? '讀取中…' : none ? TEXT.noneH : TEXT.sealedH;
    $('.yp-sealed-p').textContent = st.picks == null ? '' : none ? TEXT.noneP : TEXT.sealedP;
    $('.yp26-sealed-back').hidden = !none;
    const sig = keys.join(',');
    if (E.sealGrid.dataset.sig === sig) return;
    E.sealGrid.dataset.sig = sig;
    E.sealGrid.innerHTML = keys.map((k, i) => `<li><div class="yp-pc-fit" data-i="${i}"></div><b>給 ${esc(o.store.nameOf(Y.parsePickKey(k).rid))}</b></li>`).join('');
    E.sealGrid.querySelectorAll('.yp-pc-fit').forEach((f) => {
      const k = keys[Number(f.dataset.i)], p = Y.parsePickKey(k), m = o.store.messages.get(p.mid);
      f.innerHTML = frontHtml(m, p.rid); fitPair(f.firstElementChild, null, m.text || '');
    });
    requestAnimationFrame(() => scaleFits(E.sealGrid));
  }

  // ---------------------------------------------------------------- 實體卡 HTML（正面＝牆面卡片的放大版；作者一律姓名縮寫色塊，不印頭像照片）
  function toLine(m, rid) {
    const toks = Y.matchReceivers(m.receiver, o.store.people);
    if (!toks.length) return esc(m.receiver || '');
    return toks.map(t => (t.uid && t.uid === rid ? `<b>${esc(t.text)}</b>` : esc(t.text))).join('、');
  }
  function authorHtml(m) {
    if (m.mode === 'mask') return `<i class="av" style="background:#5b5470" aria-hidden="true">?</i><span>${esc(m.mask || '假面')}</span>`;
    if (m.mode === 'anonymous' || !m.author_name) return '<i class="av" style="background:#5b5470" aria-hidden="true">?</i><span>一位同事</span>';
    return `<i class="av" style="background:${esc(L.avatarColor(m.author_id, m.author_name))}" aria-hidden="true">${esc(L.initials(m.author_name))}</i><span>${esc(m.author_name)}</span>${m.theme === 'theme-admin' ? '<em class="sig">系統管理員</em>' : ''}`;
  }
  function frontHtml(m, rid) {
    const cls = L.cls(m.theme), t = m.theme;
    const badge = t === 'theme-admin-neon' ? '<span class="badge admin-neon admin-badge">🛡️ 系統管理員</span>' : t === 'theme-admin' ? '<span class="badge supreme admin-badge">至尊</span>' : '';
    return `<div class="yp-pc" data-t="${esc(cls)}" data-side="front"><article class="message-card card ${esc(cls)} yp-pc-card" aria-label="實體卡正面">${L.decor(t)}${badge}
      <div class="card-to">To: ${toLine(m, rid)}</div><p class="card-text">${esc(m.text || '')}</p>
      <div class="card-foot"><span class="author">${authorHtml(m)}</span><time class="yp-pc-date">${ymd(m.created_at)}</time></div></article></div>`;
  }
  function backHtml(m) {
    const cls = L.cls(m.theme);
    return `<div class="yp-pc yp-pc-back" data-t="${esc(cls)}" data-side="back" style="--bar:${BAR[cls] || BAR['t-classic']}"><span class="yp-pc-dots" aria-hidden="true"></span>
      <div class="yp-pc-sign">${MARK}<div><p class="yp-pc-name">手心的光</p><p class="yp-pc-org">RDTW 感謝牆 2026</p><p class="yp-pc-tag2">每一個微小的感謝，都是照亮團隊的光</p></div>
        <span class="yp-pc-rule" aria-hidden="true"></span><p class="yp-pc-line">每一個微小的感謝，<br>都是照亮團隊的光</p></div></div>`;
  }

  // ---------------------------------------------------------------- 彈窗（預覽、開站說明）：焦點困在視窗內、Esc 關閉、關閉後焦點回原處
  function trapFocus(e, root) {
    const f = [...root.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.getClientRects().length && !x.closest('[hidden]'));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!root.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }
  function openModal(html, host) {
    closeModal(false);
    const el = tpl(html);
    (host || layer).append(el);
    st.modal = { el, back: document.activeElement };
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('.yp-x')) closeModal(); });
    return el;
  }
  function closeModal(restore = true) {
    if (!st.modal) return;
    const { el, back } = st.modal; st.modal = null; el.remove();
    if (restore && back && back.isConnected && back.focus) back.focus();
  }

  /** 預覽：keys＝要翻的那幾張（mid~rid）；peek＝從清單的「看印出來的樣子」來（還沒挑也能看） */
  function openPreview(keys, i, peek = null) {
    if (!keys.length) return;
    const k = keys[i], p = Y.parsePickKey(k) || { mid: String(k).split('~')[0], rid: '' };
    const m = o.store.messages.get(p.mid);
    if (!m) return say(TEXT.deleted, 'err');
    const name = p.rid ? o.store.nameOf(p.rid) : '';
    const el = openModal(`<div class="yp-modal" id="yp26Preview" role="dialog" aria-modal="true" aria-labelledby="pvT"><div class="yp-dialog">
      <div class="yp-dialog-head"><div><h2 id="pvT">${name ? `給 ${esc(name)} 的實體卡` : '印出來的樣子'}</h2><p>A5（148×210mm）· 卡片內容預覽，正式版面以實際印製為準</p></div></div>
      <button type="button" class="yp-x" aria-label="關閉預覽">${ICON.x}</button>
      <div class="yp-stage"><div class="yp-pc-fit" id="pvF" style="width:min(340px, 62vh * 105 / 148)"></div><div class="yp-pc-fit" id="pvB" style="width:min(340px, 62vh * 105 / 148);position:absolute;visibility:hidden"></div></div>
      <p class="yp-pv-note" id="pvNote" hidden></p>
      <div class="yp-flip"><div class="yp-seg" role="group" aria-label="正面或背面"><button type="button" aria-pressed="true" data-side="front">正面</button><button type="button" aria-pressed="false" data-side="back">背面</button></div>
        <div class="yp-nav"><button type="button" data-nav="-1" aria-label="上一張"${i === 0 ? ' disabled' : ''}>${ICON.left}</button><span>${i + 1}／${keys.length}</span><button type="button" data-nav="1" aria-label="下一張"${i >= keys.length - 1 ? ' disabled' : ''}>${ICON.right}</button></div></div>
    </div></div>`);
    const F = el.querySelector('#pvF'), B = el.querySelector('#pvB');
    F.innerHTML = frontHtml(m, p.rid); B.innerHTML = backHtml(m);
    const r = fitPair(F.firstElementChild, B.firstElementChild, m.text || '');
    const note = el.querySelector('#pvNote');
    void r;
    note.textContent = m.image ? TEXT.imgNote : '';
    note.hidden = !note.textContent;
    const show = (s) => {
      F.style.visibility = s === 'front' ? 'visible' : 'hidden'; B.style.visibility = s === 'back' ? 'visible' : 'hidden';
      F.style.position = s === 'front' ? 'relative' : 'absolute'; B.style.position = s === 'back' ? 'relative' : 'absolute';
      el.querySelectorAll('.yp-flip [data-side]').forEach(b => b.setAttribute('aria-pressed', b.dataset.side === s ? 'true' : 'false')); scaleFits(el);
    };
    show('front');
    el.querySelectorAll('.yp-flip [data-side]').forEach(b => b.addEventListener('click', () => show(b.dataset.side)));
    el.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => { const back = st.modal && st.modal.back; openPreview(keys, i + Number(b.dataset.nav), peek); if (st.modal) st.modal.back = back; }));
    el.querySelector('.yp-x').focus();
  }

  /** 開站說明（只跳一次；同一次開站有點亮星空的彈窗時，這次不跳，下次開站才輪到這個） */
  let skySeen = false;
  function maybeIntro() {
    if (st.phase !== 'open' || lsGet(LS.intro) || st.open) return;
    const busy = document.querySelector('#skIntro, #skAct, .pc-overlay, .k1000-sky, .focus-overlay.active, #luScrim, #onboardingOverlay.active');
    if (busy) { if (busy.matches('#skIntro, #skAct')) skySeen = true; return; }
    if (skySeen) return;
    lsSet(LS.intro, '1');
    const el = openModal(`<div class="yp-modal" id="yp26Intro" role="dialog" aria-modal="true" aria-labelledby="ypIntroT"><div class="yp-intro">
      <div class="yp-hero"><div class="yp-hero-in" style="grid-template-columns:1fr 96px"><div><p class="yp-kicker">${esc(TEXT.kicker)}</p><h2 class="yp-title" id="ypIntroT">${esc(TEXT.title)}</h2><p class="yp-sub">${esc(TEXT.sub)}</p></div><div class="yp-art" style="width:96px;height:100px">${ART}</div></div></div>
      <div class="yp-intro-body"><p>${esc(TEXT.intro)}</p><div class="yp-intro-act"><button type="button" class="yp-btn is-ghost" data-act="later">先看看牆</button><button type="button" class="yp-btn" data-act="go">去挑卡</button></div></div>
      <button type="button" class="yp-x" aria-label="關閉" style="background:rgba(255,255,255,.14);color:#fff">${ICON.x}</button></div></div>`, document.body);
    el.querySelector('[data-act="later"]').addEventListener('click', () => closeModal());
    el.querySelector('[data-act="go"]').addEventListener('click', () => { closeModal(false); open(); });
    el.querySelector('[data-act="go"]').focus();
  }

  // ---------------------------------------------------------------- 開關
  function open(opts = {}) {
    update();
    if (st.phase === 'over' || st.phase === 'before') return;
    api.listen(); st.listening = true;
    if (opts.highlight) st.highlight = opts.highlight;
    st.open = true; st.shown = PAGE;
    st.lastFocus = document.activeElement;
    const seen = lsGet(LS.story) === '1'; lsSet(LS.story, '1');
    setStory(seen || st.phase !== 'open');                     // 第一次進來展開故事，之後收合；封箱後一律收合
    E.rows.dataset.sig = ''; E.slots.dataset.sig = ''; E.sealGrid.dataset.sig = '';
    layer.hidden = false; layer.scrollTop = 0; document.body.classList.add('yp26-open');
    render();
    $('.yp-back').focus();
    if (st.highlight) {
      const row = E.rows.querySelector(`.yp-row[data-mid="${CSS.escape(st.highlight)}"]`);
      if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
      const h = st.highlight; setTimeout(() => { if (st.highlight === h) st.highlight = null; }, 2600);
    }
  }
  function close(restoreFocus = true) {
    if (!st.open) return;
    closeModal(false);
    st.open = false; layer.hidden = true; document.body.classList.remove('yp26-open');
    E.side.classList.remove('is-open'); E.handle.setAttribute('aria-expanded', 'false');
    const back = window.innerWidth <= 768 ? entryM : entry;
    if (restoreFocus) { const f = st.lastFocus && st.lastFocus.isConnected && st.lastFocus !== document.body ? st.lastFocus : back; try { f.focus(); } catch (e) { /* 已移除 */ } }
  }

  /** 依伺服器時間切換階段：入口顯示／隱藏、開著的頁面跟著切成唯讀 */
  function update() {
    const ph = Y.phaseOf(o.nowMs(), CFG), changed = ph !== st.phase;
    st.phase = ph;
    if ((ph === 'open' || ph === 'closed') && !st.listening) { api.listen(); st.listening = true; }
    if (ph === 'over' && st.open) close();
    renderEntry();
    if (changed) { E.rows.dataset.sig = ''; render(); }
  }

  /** 寫卡成功之後（app.js 呼叫）：活動期間多一句連結；從活動頁出去寫的，直接回到活動頁並讓新卡亮一下 */
  function afterSend(res) {
    update();
    const mid = res && res.message && res.message.id;
    if (st.phase !== 'open') { st.fromPage = false; return; }
    if (st.fromPage) {                                          // 升級慶祝視窗開著時等它關掉再回來（不要疊在一起）
      st.fromPage = false;
      let tries = 0;
      const back = () => { if (document.querySelector('#luScrim, .pc-overlay') && ++tries < 240) return setTimeout(back, 500); open({ highlight: mid }); };
      setTimeout(back, 600); return;
    }
    hintMid = mid || null;
    hint.hidden = false; clearTimeout(hintTimer); hintTimer = setTimeout(hideHint, 8000);
  }

  // 資料變動時重畫：只管和「我寫的卡」有關的變動（別人發文、按讚不重畫）
  let rerender = null;
  if (o.onBackend) o.onBackend((type, d) => {
    if (!st.open) return;
    if (/^message\./.test(type)) { const id = (d && (d.id || (d.message && d.message.id))) || ''; if (!id || !(o.store.mine || {})[id]) return; }
    else if (!/^resync|^me\./.test(type)) return;
    clearTimeout(rerender); rerender = setTimeout(render, 150);
  });
  window.addEventListener('resize', () => { if (st.modal) scaleFits(st.modal.el); if (st.open && st.phase !== 'open') scaleFits(E.sealGrid); });
  update();
  const timer = setInterval(update, 30_000);
  setTimeout(maybeIntro, 2500); setTimeout(maybeIntro, 7000);
  return { open, close, update, afterSend, openPreview, stop: () => { clearInterval(timer); api.stop(); }, state: st, TEXT };
}
