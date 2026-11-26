// 撰寫區「給我一點靈感」（拾光小舖「寫卡靈感包」的實際功能，6.6）。
// - 只有抽屜裡有靈感包（inv/{我}/idea，判斷用 shop-logic.js invState）的人看得到入口；沒買的人不顯示、不推銷。
// - 只是寫字輔助：不寫任何資料、不記錄誰用了哪一句；匿名卡照樣能用；發文規則與字數檢查都不動。
// - 互動：撰寫區空白＝放進那一句；內容還是上一次放進的那句（沒改過）＝換成新的一句；其他情況＝插在游標位置，不動已經打的字。
//   放進去後選取第一個「＿＿」空格，直接打字就會取代它。放不下（超過字數上限）的句子停用並說明。
import { ref, onValue } from '../vendor/firebase-sdk.js';
import { invState } from './shop/shop-logic.js';
import { countWords } from './fb/wordcount.js';

/** 寫卡靈感包 8 句（文字美學官 2 定稿：design/拾光小舖-預覽/文案定稿.md 第 5 節）。＿＿是空格。要換句子只改這裡。 */
export const IDEAS = Object.freeze([
  '謝謝你那天在＿＿的時候，＿＿。',
  '那時候我正卡在＿＿，是你＿＿。',
  '一直想好好跟你說聲謝謝：＿＿。',
  '你可能不記得了，＿＿那次，你真的幫了我大忙。',
  '因為你＿＿，那天的＿＿順利多了。',
  '跟你一起＿＿，讓我學到＿＿。',
  '謝謝你總是＿＿，讓大家＿＿。',
  '今天想把這一點光送給你，因為＿＿。',
]);
export const IDEA_TEXT = Object.freeze({
  btn: '給我一點靈感',
  btnShort: '靈感',
  title: '小螢給你的開頭句',
  foot: '挑一句開頭・空格自己填',
  tooLong: '放不下（上限 {max} 字）',
  tooLongNote: '灰色的句子放不下了：可以先刪掉一些字，或挑短一點的。',
});
export const IDEA_ITEM = 'idea';   // 抽屜裡的商品 g（shop-catalog.js idea）
const BLANK = '＿＿';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BULB = '<svg class="ci-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>';

/**
 * 決定放進一句之後的內容（純函式，測試用）。
 * value：目前內容；sel：[start, end] 游標／選取；idea：要放的句子；last：上一次放進去的句子；max：字數上限（0＝不限）；
 * count：怎麼算字數（預設字元數；撰寫區傳 countWords＝T107 英文以單字計）；cap：字元安全網（輸入框 maxLength，0＝不限）
 * 回傳 { ok, value, caret: [start, end]（放好後要選取的範圍）, mode: 'fill'|'swap'|'insert' } 或 { ok:false, reason:'TOO_LONG' }
 */
export function applyIdea({ value = '', sel = null, idea, last = '', max = 0, count = (s) => s.length, cap = 0 }) {
  let mode, before, after;
  if (!value.trim()) { mode = 'fill'; before = ''; after = ''; }
  else if (last && value === last) { mode = 'swap'; before = ''; after = ''; }
  else {
    mode = 'insert';
    // 不覆蓋：有選取時插在選取範圍後面；沒有游標資訊時接在最後
    const at = sel && Number.isInteger(sel[1]) ? Math.max(0, Math.min(value.length, sel[1])) : value.length;
    before = value.slice(0, at); after = value.slice(at);
  }
  const next = before + idea + after;
  if ((max > 0 && count(next) > max) || (cap > 0 && next.length > cap)) return { ok: false, reason: 'TOO_LONG' };
  const b = idea.indexOf(BLANK);
  const caret = b >= 0 ? [before.length + b, before.length + b + BLANK.length] : [before.length + idea.length, before.length + idea.length];
  return { ok: true, value: next, caret, mode };
}
/** 這一句現在放得下嗎（給清單停用用） */
export function fits(o) { return applyIdea(o).ok; }

/**
 * o = { db, meId, nowMs(), input（#msgInput）, composer（#composer）, before?（按鈕放在這個元素前面，預設 input）,
 *       maxWords?(): 字數上限（T107 英文以單字計；沒給就用輸入框 maxLength 當字元上限）,
 *       inv?(): 目前的抽屜（有 shop-api 時直接用它的資料，例如 () => SHOP.api.st.inv）, onChange?(): 內容改了之後（例如存草稿）, doc? }
 * 有 db＋meId 時自己監聽 inv/{我}/idea（Firebase SDK 和小舖監聽的 inv/{我} 共用同一條連線，不會多下載）。
 */
export function createComposeIdea(o) {
  const doc = o.doc || document, win = doc.defaultView;
  const input = o.input, composer = o.composer;
  let entry = null, owned = false, pop = null, last = '', off = null;

  const btn = doc.createElement('button');
  btn.type = 'button'; btn.className = 'ci-btn'; btn.id = 'ideaBtn'; btn.hidden = true;
  btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', IDEA_TEXT.btn);
  btn.title = IDEA_TEXT.btn;
  btn.innerHTML = `${BULB}<span aria-hidden="true">${esc(IDEA_TEXT.btnShort)}</span>`;
  const anchor = o.before || input;
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(btn, anchor);

  const nowMs = () => (o.nowMs ? o.nowMs() : Date.now());
  function refresh() {
    const e = o.inv ? ((o.inv() || {})[IDEA_ITEM]) : entry;
    const has = invState(e, nowMs()).any;
    if (has === owned && btn.hidden === !has) return;
    owned = has; btn.hidden = !has;
    if (!has) close(true);
  }
  if (o.db && o.meId) {
    try { off = onValue(ref(o.db, `inv/${o.meId}/${IDEA_ITEM}`), (s) => { entry = s.val(); refresh(); }, () => { entry = null; refresh(); }); }
    catch (e) { off = null; }
  }

  const maxLen = () => (input.maxLength > 0 ? input.maxLength : 0);
  const ctx = (idea) => (o.maxWords
    ? { value: input.value, sel: [input.selectionStart, input.selectionEnd], idea, last, max: o.maxWords(), count: countWords, cap: maxLen() }
    : { value: input.value, sel: [input.selectionStart, input.selectionEnd], idea, last, max: maxLen() });

  function open() {
    if (pop || !owned) return;
    pop = doc.createElement('div');
    pop.className = 'ci-pop'; pop.id = 'ideaPop';
    pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', IDEA_TEXT.title);
    let anyBlocked = false;
    const rows = IDEAS.map((t, i) => {
      const ok = fits(ctx(t)); if (!ok) anyBlocked = true;
      const html = esc(t).split(BLANK).join('<u aria-hidden="true">　　</u>');
      return `<li><button type="button" class="ci-opt" data-i="${i}" aria-label="${esc(t.split(BLANK).join('空格'))}${ok ? '' : `，${esc(IDEA_TEXT.tooLong.replace('{max}', o.maxWords ? o.maxWords() : maxLen()))}`}"${ok ? '' : ' aria-disabled="true"'}>${html}</button></li>`;
    }).join('');
    pop.innerHTML = `<h4>${BULB}${esc(IDEA_TEXT.title)}</h4><ul class="ci-list">${rows}</ul>`
      + (anyBlocked ? `<p class="ci-note">${esc(IDEA_TEXT.tooLongNote)}</p>` : '')
      + `<p class="ci-foot">${esc(IDEA_TEXT.foot)}</p>`;
    composer.appendChild(pop);   // 放在撰寫列裡面：點清單不會讓手機撰寫列收起來
    place();
    pop.addEventListener('click', onPick);
    pop.addEventListener('keydown', onKey);
    btn.setAttribute('aria-expanded', 'true');
    const first = pop.querySelector('.ci-opt:not([aria-disabled])') || pop.querySelector('.ci-opt');
    if (first) first.focus({ preventScroll: true });
    setTimeout(() => { if (pop) doc.addEventListener('pointerdown', onOutside, true); }, 0);
    win.addEventListener('resize', place);
  }
  function place() {
    if (!pop) return;
    if (win.innerWidth <= 768) {
      // 手機：撰寫區整塊（含等級列）固定在畫面底部，清單放在它上方，高度不超過剩下的畫面
      const wrap = composer.closest('.composer-wrap') || composer;
      const top = wrap.getBoundingClientRect().top, cb = composer.getBoundingClientRect().bottom;
      pop.style.left = ''; pop.style.bottom = `${Math.round(cb - top + 8)}px`; pop.style.maxHeight = `${Math.max(160, Math.round(top - 16))}px`;
      return;
    }
    pop.style.bottom = ''; pop.style.maxHeight = '';
    const cr = composer.getBoundingClientRect(), br = btn.getBoundingClientRect();
    const w = pop.offsetWidth || 360;
    pop.style.left = `${Math.max(8, Math.min(cr.width - w - 8, br.left - cr.left - 12))}px`;
  }
  function close(silent) {
    if (!pop) return;
    doc.removeEventListener('pointerdown', onOutside, true);
    win.removeEventListener('resize', place);
    pop.remove(); pop = null; btn.setAttribute('aria-expanded', 'false');
    if (!silent && !btn.hidden) btn.focus({ preventScroll: true });
  }
  function onOutside(e) { if (pop && !pop.contains(e.target) && !btn.contains(e.target)) close(true); }
  function pick(i) {
    const idea = IDEAS[i]; if (!idea) return;
    const r = applyIdea(ctx(idea));
    if (!r.ok) return;
    input.value = r.value; last = r.value === idea ? idea : '';
    close(true);
    composer.classList.add('expanded');
    input.focus({ preventScroll: true });
    try { input.setSelectionRange(r.caret[0], r.caret[1]); } catch (e) { /* 略 */ }
    input.dispatchEvent(new Event('input', { bubbles: true }));   // 自動長高、草稿
    try { input.setSelectionRange(r.caret[0], r.caret[1]); } catch (e) { /* input 事件可能動到捲動，再設一次 */ }
    if (o.onChange) o.onChange();
  }
  function onPick(e) {
    const b = e.target.closest('.ci-opt'); if (!b) return;
    if (b.getAttribute('aria-disabled') === 'true') return;
    pick(Number(b.dataset.i));
  }
  function onKey(e) {
    const list = [...pop.querySelectorAll('.ci-opt')];
    const i = list.indexOf(doc.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]; if (n) n.focus(); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); const n = e.key === 'Home' ? list[0] : list[list.length - 1]; if (n) n.focus(); }
    else if (e.key === 'Tab') close(true);
  }
  btn.addEventListener('click', () => (pop ? close() : open()));
  // 小舖「抽屜 → 使用」等地方可以直接打開清單
  const onOpenEvt = () => { refresh(); if (owned) { composer.classList.add('expanded'); open(); } };
  win.addEventListener('compose-idea:open', onOpenEvt);
  const timer = win.setInterval(refresh, 60000);   // 靈感包是永久品；保險起見每分鐘對一次（租期類商品的寫法）

  refresh();
  return {
    el: btn, refresh, open, close: () => close(true),
    get owned() { return owned; }, get isOpen() { return !!pop; },
    stop() { if (off) off(); off = null; win.clearInterval(timer); win.removeEventListener('compose-idea:open', onOpenEvt); close(true); btn.remove(); },
  };
}
