// T098 個人資料卡「我的使用說明書」＋上傳頭像：畫面（檢視、編輯、裁切頭像、自己的頭像選單）。
// 設計稿：design/個人資料卡/設計規格.md、mockup.html（美術總監 v1）；文字：PC-標題定稿.md（P&C）。
// 這個檔案不碰 Firebase：讀寫都透過 fb/profile.js 的 ProfileService；和 app.js 之間只靠 createProfileUI(deps) 傳進來的函式。
import { PC_SYMBOLS } from './profile-icons.js';
import * as PL from './fb/profile-logic.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const ic = (id, cls = 'ico') => `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#pci-${id}"/></svg>`;
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const MENU_SEEN_KEY = 'pc_menu_seen_v1';

/**
 * deps = {
 *   profile: ProfileService, meId: string, isAdmin: boolean,
 *   meName(): string, nameOf(uid), isActive(uid), uidByName(name), avatarColor(uid, name), initials(name),
 *   writeTo(name)   // 關掉資料卡後：收件人帶入 name、游標到內容欄（app.js 負責）
 *   logout()        // 原本的登出流程（含確認）
 *   avatarBtn: HTMLElement   // 撰寫區自己的頭像 #userAvatar
 *   ext?: T101 點亮星空的掛勾（sky/sky.js 的 ext；沒有就和 6.3 完全一樣）
 *     viewerCell(uid, fieldKey, self) → html、viewerExtra(uid, self) → { body, foot }、onViewerClick(e, uid, name) → 處理了回 true、
 *     editorHead() → html、stressHelp() → 字串、onEditorChange(e)、afterSave(舊卡, 新卡) → 自己出了提示回 true
 * }
 * writeTo(name, { uid, filled }) 的第二個參數：從資料卡按「寫感謝卡給他」時帶上（filled＝對方說明書寫了幾格），給星光卡用。
 */
export function createProfileUI(deps) {
  const { profile } = deps;
  const X = deps.ext || {};
  const stack = [];                      // 開著的浮層（最上面的在最後）
  let menu = null, toastTimer = null;

  if (!document.getElementById('pcSymbols')) document.body.insertAdjacentHTML('afterbegin', PC_SYMBOLS);
  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = PL.AVATAR_TYPES.join(','); fileInput.hidden = true; fileInput.id = 'pcFile';
  fileInput.setAttribute('aria-hidden', 'true'); fileInput.tabIndex = -1;
  document.body.appendChild(fileInput);

  // ------------------------------------------------------------ 共用
  function pav(uid, name, size, src, extra = '') {
    if (src) return `<span class="pav sz-${size} is-photo ${extra}"><img src="${esc(src)}" alt="${esc(name)}的頭像" decoding="async"></span>`;
    return `<span class="pav sz-${size} ${extra}" style="background:${esc(deps.avatarColor(uid, name))}" role="img" aria-label="${esc(name)}">${esc(deps.initials(name))}</span>`;
  }
  function toast(text, { error = false } = {}) {
    let el = document.getElementById('pcToast');
    if (!el) { el = document.createElement('div'); el.id = 'pcToast'; el.className = 'pc-toast'; document.body.appendChild(el); }
    el.setAttribute('role', error ? 'alert' : 'status');
    el.innerHTML = `${error ? ic('alert') : ic('check')}<span>${esc(text)}</span>`;
    el.style.background = error ? '#7a271a' : '';
    el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, error ? 5000 : 2500);
  }
  function lockScroll() { document.body.classList.toggle('pc-lock', stack.length > 0); }

  // 浮層：Esc／遮罩／✕ 都走 requestClose（編輯中有未儲存內容時會先問）
  function pushOverlay({ html, cls = '', top = false, requestClose, returnTo }) {
    const el = document.createElement('div');
    el.className = `pc-overlay ${cls}${top ? ' is-top' : ''}`;
    el.innerHTML = html;
    document.body.appendChild(el);
    const entry = { el, requestClose: requestClose || (() => closeOverlay(entry)), returnTo: returnTo || document.activeElement };
    el.addEventListener('mousedown', (e) => { entry.downOnBackdrop = e.target === el; });
    el.addEventListener('click', (e) => { if (e.target === el && entry.downOnBackdrop && window.innerWidth >= 768) entry.requestClose(); });
    stack.push(entry); lockScroll();
    return entry;
  }
  function closeOverlay(entry, { restoreFocus = true } = {}) {
    const i = stack.indexOf(entry); if (i < 0) return;
    stack.splice(i, 1); entry.el.remove(); lockScroll();
    if (entry.onClosed) entry.onClosed();
    const r = entry.returnTo;
    if (restoreFocus && r && r.isConnected && typeof r.focus === 'function') { try { r.focus({ preventScroll: true }); } catch (e) { /* 略 */ } }
  }
  function closeAll() { while (stack.length) closeOverlay(stack[stack.length - 1], { restoreFocus: false }); }
  const topEntry = () => stack[stack.length - 1] || null;

  window.addEventListener('keydown', (e) => {
    if (menu && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeMenu(true); return; }
    const t = topEntry(); if (!t) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); t.requestClose(); return; }
    if (e.key === 'Tab') {                                   // 焦點困在最上層浮層裡
      const f = [...t.el.querySelectorAll(FOCUSABLE)].filter(x => x.getClientRects().length);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (!t.el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, true);

  // ------------------------------------------------------------ 檢視
  function cellHtml(card, f, uid = '', self = false) {
    const extra = X.viewerCell ? X.viewerCell(uid, f.k, self) || '' : '';
    const head = `<header class="pc-cell-h"><span class="ico-wrap">${ic(f.k)}</span><h3>${esc(f.t)}</h3>${extra}</header>`;
    if (f.dd) {
      const parts = [];
      if (card.work.ok.trim()) parts.push(`<div class="is-do"><h4>${ic('plus')}${esc(f.ok.t)}</h4><p>${esc(card.work.ok)}</p></div>`);
      if (card.work.no.trim()) parts.push(`<div class="is-dont"><h4>${ic('minus')}${esc(f.no.t)}</h4><p>${esc(card.work.no)}</p></div>`);
      return `<article class="pc-cell" data-k="${f.k}">${head}<div class="pc-dd${parts.length === 1 ? ' is-single' : ''}">${parts.join('')}</div></article>`;
    }
    return `<article class="pc-cell" data-k="${f.k}">${head}<p>${esc(card[f.k])}</p></article>`;
  }
  function adminHtml(uid, card, photo) {
    if (!deps.isAdmin || uid === deps.meId || (!card && !photo)) return '';
    return `<div class="pc-admin"><span>管理員（處理不當內容）：</span>`
      + (card ? `<button type="button" class="text-btn" data-pc="admin-card">${ic('trash')}清除這張資料卡</button>` : '')
      + (photo ? `<button type="button" class="text-btn" data-pc="admin-avatar">${ic('trash')}移除頭像</button>` : '') + '</div>';
  }
  function viewerHtml(uid, card, photo, { self, preview }) {
    const name = self ? deps.meName() : deps.nameOf(uid);
    const list = card ? PL.filledFields(card) : [];
    const close = `<button class="pc-close" type="button" data-pc="close" aria-label="關閉">${ic('x')}</button>`;
    const x = !preview && X.viewerExtra ? X.viewerExtra(uid, self) || {} : {};
    if (!list.length) {
      const art = '<svg class="pc-empty-art" viewBox="0 0 140 56" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="4" y="10" width="36" height="36" rx="8" stroke-dasharray="4 4"/><rect x="52" y="10" width="36" height="36" rx="8" stroke-dasharray="4 4"/><rect x="100" y="10" width="36" height="36" rx="8" stroke-dasharray="4 4"/><path d="M70 33s-5-3-5-6.4a2.6 2.6 0 0 1 5-1.3 2.6 2.6 0 0 1 5 1.3C75 30 70 33 70 33z" fill="#fdeef1" stroke="#c9184a"/></svg>';
      const body = preview ? `<p class="pc-empty-msg">還沒有填任何一格</p><p class="pc-empty-sub">同事會看到這個樣子。</p><button class="action-btn primary" type="button" data-pc="back">${ic('pen')}回去編輯</button>`
        : self ? `<p class="pc-empty-msg">你的使用說明書還是空白的</p><p class="pc-empty-sub">寫一兩句就好，<br>讓同事更快知道怎麼和你合作。<br>每格都可以不填、隨時能改。</p><button class="action-btn primary" type="button" data-pc="edit">${ic('pen')}開始寫</button>`
        : `<p class="pc-empty-msg">${esc(name)} 的<span class="nw">使用說明書</span>還在<span class="nw">醞釀中</span></p><p class="pc-empty-sub">想多認識 ${esc(name)}，先寫一張感謝卡打聲招呼吧。</p><button class="action-btn primary" type="button" data-pc="write">${ic('send')}寫感謝卡給 ${esc(name)}</button>`;
      return { wrap: 'is-empty-wrap', html: `<section class="pc-box is-empty has-scroll" role="dialog" aria-modal="true" aria-labelledby="pcName">${close}`
        + `<div class="pc-scroll"><div class="pc-empty">${pav(uid, name, 96, photo)}<h2 class="pc-name" id="pcName">${esc(name)}</h2>${art}${body}${x.foot ? `<div class="pc-x-foot">${x.foot}</div>` : ''}${preview ? '' : adminHtml(uid, card, photo)}</div>${x.body || ''}</div></section>` };
    }
    const full = list.length === PL.FIELDS.length, n = list.length;
    const cols = n <= 2 ? n : (n === 4 ? 2 : 3);                         // 4 格排 2×2，避免落單
    const idSize = full && window.innerWidth >= 1024 ? 104 : 96;
    const updated = card.t && !preview ? `<p class="pc-meta">更新於 ${PL.tpeDate(card.t)}</p>` : '';
    const id = `<div class="pc-id">${pav(uid, name, idSize, photo)}<div class="pc-id-txt"><h2 class="pc-name" id="pcName">${esc(name)}</h2><p class="pc-kicker">我的使用說明書</p><p class="pc-en">My Operating Manual</p>${updated}</div></div>`;
    const foot = preview ? `<p class="pc-note">這是同事會看到的樣子（還沒儲存）。沒填的格子不會出現。</p><div class="pc-actions"><button class="action-btn primary" type="button" data-pc="back">${ic('pen')}回去編輯</button></div>`
      : self ? `${x.foot ? `<div class="pc-x-foot">${x.foot}</div>` : ''}<p class="pc-note">這是同事看到的樣子。沒填的格子不會出現。</p><div class="pc-actions"><button class="action-btn primary" type="button" data-pc="edit">${ic('edit')}編輯</button></div>`
      : `<p class="pc-note">想多認識 ${esc(name)}？從一張感謝卡開始吧。</p><div class="pc-actions"><button class="action-btn primary" type="button" data-pc="write">${ic('send')}寫感謝卡給 ${esc(name)}</button></div>${adminHtml(uid, card, photo)}`;
    return { wrap: '', html: `<section class="pc-box has-scroll${!full && cols <= 2 ? ' is-narrow' : ''}" role="dialog" aria-modal="true" aria-labelledby="pcName">${close}`
      + `<div class="pc-scroll"><div class="pc-body"><div class="pc-grid ${full ? 'is-full' : 'is-flow'}" style="--cols:${cols}">${id}${list.map(f => cellHtml(card, f, preview ? '' : uid, self)).join('')}</div></div>${x.body || ''}`
      + `<footer class="pc-foot">${foot}</footer></div></section>` };
  }

  // 打開某人的資料卡。from：開啟它的元素（關閉後焦點回去）
  async function openViewer(uid, from, { preview = null } = {}) {
    closeMenu(false);
    const self = uid === deps.meId;
    if (!uid || (!self && !deps.isActive(uid))) { toast('這位同事已經不在通訊錄裡，看不到資料卡。', { error: true }); return null; }
    const name = self ? deps.meName() : deps.nameOf(uid);
    const entry = pushOverlay({ html: `<section class="pc-box is-empty" role="dialog" aria-modal="true" aria-label="${esc(name)}的使用說明書" aria-busy="true">`
      + `<button class="pc-close" type="button" data-pc="close" aria-label="關閉">${ic('x')}</button><div class="pc-loading"><span class="pc-spin" aria-hidden="true"></span><p>正在打開 ${esc(name)} 的使用說明書…</p></div></section>`,
      cls: 'is-empty-wrap', top: !!preview, returnTo: from });
    entry.kind = 'viewer'; entry.uid = uid;
    const paint = (card, photo) => {
      if (!stack.includes(entry)) return;
      const v = viewerHtml(uid, card, photo, { self, preview: !!preview });
      entry.el.className = `pc-overlay ${v.wrap}${preview ? ' is-top' : ''}`;
      entry.el.innerHTML = v.html;
      entry.data = { card, photo };
      const c = entry.el.querySelector('[data-pc="close"]'); if (c) c.focus({ preventScroll: true });
    };
    entry.repaint = () => entry.data && paint(entry.data.card, entry.data.photo);
    entry.el.addEventListener('click', (e) => onViewerClick(e, entry, uid, name));
    focusFirst(entry);
    if (preview) { paint(preview.card, preview.photo); return entry; }
    try {
      const [card, photo] = await Promise.all([profile.card(uid), profile.largeOf(uid)]);
      paint(card, photo);
    } catch (err) {
      if (!stack.includes(entry)) return entry;
      entry.el.querySelector('.pc-box').innerHTML = `<button class="pc-close" type="button" data-pc="close" aria-label="關閉">${ic('x')}</button>`
        + `<div class="pc-loading" role="alert"><p>讀不到這張資料卡，可能是網路不穩。</p><button class="action-btn" type="button" data-pc="retry">再試一次</button></div>`;
    }
    return entry;
  }
  async function onViewerClick(e, entry, uid, name) {
    if (X.onViewerClick && X.onViewerClick(e, uid, name)) return;
    const b = e.target.closest('[data-pc]'); if (!b) return;
    const act = b.dataset.pc;
    if (act === 'close' || act === 'back') return closeOverlay(entry);
    if (act === 'retry') { closeOverlay(entry, { restoreFocus: false }); return openViewer(uid, entry.returnTo); }
    if (act === 'write') { closeAll(); deps.writeTo(name, { uid, filled: entry.data && entry.data.card ? PL.filledFields(entry.data.card).length : 0 }); return; }
    if (act === 'edit') { closeOverlay(entry, { restoreFocus: false }); return openEditor(entry.returnTo); }
    if (act === 'admin-card' || act === 'admin-avatar') {
      const what = act === 'admin-card' ? 'card' : 'avatar';
      const ok = await confirmDialog({ title: what === 'card' ? `清除 ${name} 的資料卡？` : `移除 ${name} 的頭像？`,
        text: '這是處理不當內容用的，清除後沒辦法復原（會留下管理紀錄）。涉及同事衝突、霸凌或騷擾時，請先諮詢公司 P&C。',
        yes: what === 'card' ? '清除資料卡' : '移除頭像', no: '取消', danger: true });
      if (!ok) return;
      try {
        await profile.adminClear(uid, what);
        toast(what === 'card' ? '已清除這張資料卡' : '已移除頭像');
        if (entry.data) { if (what === 'card') entry.data.card = null; else entry.data.photo = ''; entry.repaint(); }
      } catch (err) { toast('沒有清除成功，請重新整理頁面後再試一次。', { error: true }); }
    }
  }
  function focusFirst(entry) { setTimeout(() => { const c = entry.el.querySelector('[data-pc="close"]'); if (c && !entry.el.contains(document.activeElement)) c.focus({ preventScroll: true }); }, 30); }

  // 畫面寬度跨過斷點時重畫（九宮格／流排、頭像大小）
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    const w = window.innerWidth, bp = (x) => (x >= 1024 ? 2 : x >= 768 ? 1 : 0);
    if (bp(w) !== bp(lastW)) for (const s of stack) if (s.kind === 'viewer' && s.repaint) s.repaint();
    lastW = w;
  });

  // ------------------------------------------------------------ 確認視窗（預設焦點在「留下」那一顆）
  function confirmDialog({ title, text, yes, no, danger = false }) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; closeOverlay(entry); resolve(v); };
      const entry = pushOverlay({ top: true, cls: 'is-dialog-wrap', requestClose: () => finish(false),
        html: `<section class="pc-box confirm-box" role="alertdialog" aria-modal="true" aria-labelledby="pcCfT" aria-describedby="pcCfD"><h2 id="pcCfT">${esc(title)}</h2><p id="pcCfD">${esc(text)}</p>`
          + `<div class="crop-actions"><button class="action-btn" type="button" data-pc="yes"${danger ? ' style="color:#b42318"' : ''}>${esc(yes)}</button><button class="action-btn primary" type="button" data-pc="no">${esc(no)}</button></div></section>` });
      entry.el.addEventListener('click', (e) => { const b = e.target.closest('[data-pc]'); if (b) finish(b.dataset.pc === 'yes'); });
      setTimeout(() => entry.el.querySelector('[data-pc="no"]').focus(), 20);
    });
  }

  // ------------------------------------------------------------ 編輯
  async function openEditor(from) {
    closeMenu(false);
    const uid = deps.meId, name = deps.meName();
    let orig;
    try { orig = await profile.card(uid); } catch (e) { toast('讀不到你的資料卡，請檢查網路後再試一次。', { error: true }); return; }
    const S = {
      orig: orig || PL.normalizeCard(null), draft: PL.normalizeCard(orig), photo: profile.smallOf(uid) ? await profile.largeOf(uid) : '',
      removePhoto: false, uploading: false, saving: false, alert: '',
    };
    const reassure = `<p class="pe-reassure">${ic('shield')}<span><span class="long">寫幾句話，讓同事更快認識你、知道怎麼和你合作。每一格都可以不填，想到再寫，隨時能改或清空。<small>寫工作上的你就好，健康、家庭這類私事不用寫。登入的同事都看得到你的卡。</small></span><span class="short">寫幾句話，讓同事更認識你。每格都可以不填、隨時能改。<small>登入的同事都看得到。</small></span></span></p>`;
    // 字數（T107：英文以單字計）；maxlength 只是字元安全網（上限 × 8），超過字數時計數變紅、不能儲存
    const counter = (v, max) => { const n = PL.countChars(v); return `<span class="pe-count${n > max ? ' is-full is-over' : n >= max ? ' is-full' : n >= max * 0.8 ? ' is-near' : ''}" aria-hidden="true">${n}／${max}</span>`; };
    const maxChars = (n) => (PL.maxChars ? PL.maxChars(n) : n * 8);   // 上線 10 分鐘內 profile-logic.js 可能還是快取的舊檔
    const overFields = () => PL.FIELDS.flatMap(f => f.dd ? PL.P.work_fields.filter(k => PL.countChars(S.draft.work[k]) > f.max) : (PL.countChars(S.draft[f.k]) > f.max ? [f.k] : []));
    const clearBtn = (v, label, key) => `<button class="text-btn danger" type="button" data-clear="${key}" aria-label="清空「${esc(label)}」"${v ? '' : ' hidden'}>${ic('x')}清空</button>`;
    const fieldHtml = (f) => {
      const lbl = `<span class="ico-wrap">${ic(f.k)}</span>${esc(f.t)}`;
      if (f.dd) {
        const sub = (k, cls, icon) => { const v = S.draft.work[k]; return `<div class="pe-sub ${cls}"><label for="pe-work-${k}"><span class="h">${ic(icon)}${esc(f[k].t)}</span></label>`
          + `<textarea id="pe-work-${k}" data-key="work.${k}" data-max="${f.max}" maxlength="${maxChars(f.max)}" placeholder="${esc(f[k].ph)}" rows="2">${esc(v)}</textarea><div class="pe-field-foot">${clearBtn(v, f[k].t, 'work.' + k)}${counter(v, f.max)}</div></div>`; };
        return `<div class="pe-field is-wide" role="group" aria-labelledby="pe-lbl-work"><span class="pe-lbl" id="pe-lbl-work">${lbl}</span><div class="pe-dd">${sub('ok', 'is-do', 'plus')}${sub('no', 'is-dont', 'minus')}</div></div>`;
      }
      const v = S.draft[f.k];
      return `<div class="pe-field${f.k === 'stress' ? ' is-wide' : ''}"><label for="pe-${f.k}">${lbl}</label>`
        + `<textarea id="pe-${f.k}" data-key="${f.k}" data-max="${f.max}" maxlength="${maxChars(f.max)}" placeholder="${esc(f.ph)}" rows="2"${f.help ? ` aria-describedby="pe-h-${f.k}"` : ''}>${esc(v)}</textarea>`
        + (f.help ? `<p class="pe-help" id="pe-h-${f.k}">${esc(f.help)}${f.k === 'stress' && X.stressHelp && X.stressHelp() ? `<br>${esc(X.stressHelp())}` : ''}</p>` : '') + `<div class="pe-field-foot">${clearBtn(v, f.t, f.k)}${counter(v, f.max)}</div></div>`;
    };
    const entry = pushOverlay({ returnTo: from, requestClose: () => tryClose(),
      html: `<section class="pc-box pe-box has-scroll" role="dialog" aria-modal="true" aria-labelledby="peTitle"><button class="pc-close" type="button" data-pc="close" aria-label="關閉">${ic('x')}</button>`
        + `<div class="pc-scroll"><div class="pe-head"><h2 id="peTitle">編輯我的使用說明書</h2>${reassure}${X.editorHead ? X.editorHead() || '' : ''}</div>`
        + `<div class="pe-body"><aside class="pe-avatar" aria-labelledby="peAvTitle"></aside><div class="pe-fields">${PL.FIELDS.map(fieldHtml).join('')}</div></div>`
        + `<p class="pc-sr" id="peLive" aria-live="polite"></p>`
        + `<footer class="pe-foot"><span class="pe-status"></span><span class="grow"></span><button class="action-btn ghost" type="button" data-pc="preview">${ic('eye')}預覽</button>`
        + `<button class="action-btn" type="button" data-pc="cancel">取消</button><button class="action-btn primary" type="button" data-pc="save">儲存</button></footer></div></section>` });
    entry.kind = 'editor';
    const el = entry.el;
    const dirty = () => S.removePhoto || !PL.cardEquals(S.draft, S.orig);
    const sync = () => {
      const st = el.querySelector('.pe-status'), d = dirty(), over = overFields().length > 0;
      st.classList.toggle('is-dirty', d);
      st.textContent = over ? '有一格超過字數上限，改短一點才能儲存' : d ? '有還沒儲存的修改' : (S.orig.t ? `上次儲存：${PL.tpeDate(S.orig.t, true)}` : '還沒有儲存過');
      const save = el.querySelector('[data-pc="save"]'), can = d && !over && !S.uploading && !S.saving;
      save.disabled = !can; save.setAttribute('aria-disabled', String(!can));
      save.textContent = S.saving ? '儲存中…' : '儲存';
    };
    const paintAvatar = () => {
      const photo = S.removePhoto ? '' : S.photo;
      const main = pav(uid, name, 96, photo, S.uploading ? 'pav-uploading' : '');
      let actions;
      if (S.uploading) actions = `<div class="pe-progress is-busy" role="progressbar" aria-label="頭像上傳中"><i></i></div><p class="pe-hint" role="status">上傳中…</p>`;
      else if (photo) actions = `<div class="pe-av-actions"><button class="action-btn" type="button" data-pc="pick">${ic('camera')}更換頭像</button><button class="action-btn ghost" type="button" data-pc="unphoto">${ic('trash')}移除頭像</button></div>`;
      else actions = `<div class="pe-av-actions"><button class="action-btn" type="button" data-pc="pick">${ic('camera')}上傳頭像</button></div>`;
      el.querySelector('.pe-avatar').innerHTML = `<h3 id="peAvTitle">頭像</h3>${main}<div class="pe-av-id"><p class="pe-name">${esc(name)}</p><p class="pe-hint">放一張你喜歡的照片或圖（選填）<br>照片裡有別人時，記得先問過對方。</p></div>`
        + (S.alert ? `<div class="pe-alert" role="alert">${ic('alert')}<div>${S.alert}</div></div>` : '') + actions
        + `<p class="pe-hint">沒有頭像時，會顯示姓名縮寫。${S.removePhoto ? '<br><b>按「儲存」後才會移除。</b>' : ''}</p>`;
    };
    const announce = (t) => { const l = el.querySelector('#peLive'); l.textContent = ''; setTimeout(() => { l.textContent = t; }, 30); };
    if (X.onEditorChange) el.addEventListener('change', (e) => { X.onEditorChange(e); });
    el.addEventListener('input', (e) => {
      const ta = e.target.closest('textarea[data-key]'); if (!ta) return;
      const key = ta.dataset.key, v = ta.value, max = Number(ta.dataset.max);
      if (key.startsWith('work.')) S.draft.work[key.slice(5)] = v; else S.draft[key] = v;
      const foot = ta.parentElement.querySelector('.pe-field-foot') || ta.closest('.pe-field').querySelector('.pe-field-foot');
      foot.querySelector('.pe-count').outerHTML = counter(v, max);
      foot.querySelector('[data-clear]').hidden = !v;
      const n = PL.countChars(v), prev = ta._n || 0; ta._n = n;
      if (n > max && prev <= max) announce(`超過 ${max} 字上限了，英文以單字計`);
      else if (n === max && prev < max) announce(`已經到 ${max} 字上限`);
      else if (n === max - 10 && prev < n) announce('還可以寫 10 個字');
      sync();
    });
    el.addEventListener('click', async (e) => {
      const clr = e.target.closest('[data-clear]');
      if (clr) {
        const ta = el.querySelector(`textarea[data-key="${clr.dataset.clear}"]`);
        ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); return;
      }
      const b = e.target.closest('[data-pc]'); if (!b) return;
      const act = b.dataset.pc;
      if (act === 'close' || act === 'cancel') return tryClose();
      if (act === 'preview') return openViewer(uid, b, { preview: { card: S.draft, photo: S.removePhoto ? '' : S.photo } });
      if (act === 'unphoto') { S.removePhoto = true; S.alert = ''; paintAvatar(); sync(); const p = el.querySelector('[data-pc="pick"]'); if (p) p.focus(); return; }
      if (act === 'pick') return pickAvatar({ editor: true });
      if (act === 'save') return save();
    });
    async function save() {
      if (!dirty() || S.uploading || S.saving) return;
      S.saving = true; sync();
      try {
        await profile.saveCard(S.draft, { removeAvatar: S.removePhoto });
        S.saving = false;
        closeOverlay(entry, { restoreFocus: false });
        openViewer(uid, entry.returnTo);
        const saved = PL.buildCardValue(S.draft);
        let shown = false;
        try { shown = !!(X.afterSave && saved && X.afterSave(S.orig, PL.normalizeCard(saved))); } catch (e2) { console.error(e2); }
        if (!shown) toast(saved ? '已儲存，同事現在看得到了' : '已儲存，資料卡已清空');
      } catch (err) {
        S.saving = false; sync();
        toast(err && err.code === 'TOO_LONG' ? err.message : '沒有儲存成功，請再試一次', { error: true });
      }
    }
    async function tryClose() {
      if (!dirty() || await confirmDialog({ title: '還沒儲存，確定要離開嗎？', text: '剛剛寫的內容會不見。', yes: '離開不儲存', no: '回去繼續寫' })) closeOverlay(entry);
    }
    entry.avatar = {
      error(html) { S.alert = html; paintAvatar(); },
      async upload(small, large) {
        S.alert = ''; S.uploading = true; paintAvatar(); sync();
        try { await profile.setAvatar(small, large); S.photo = large; S.removePhoto = false; toast('頭像已更新'); }
        catch (err) { S.alert = '頭像沒有上傳成功<small>請檢查網路後再試一次。</small>'; }
        S.uploading = false; paintAvatar(); sync();
      },
    };
    paintAvatar(); sync();
    setTimeout(() => {
      const first = !orig ? el.querySelector('textarea') : el.querySelector('[data-pc="close"]');
      if (first) first.focus({ preventScroll: true });
    }, 30);
    return entry;
  }

  // ------------------------------------------------------------ 選圖、裁切、上傳
  function fileError(check) {
    if (check.kind === 'size') return [`這張圖太大了（${check.mb} MB）`, '請選 5 MB 以下的圖，或先用手機截圖再上傳。'];
    if (check.kind === 'type') return [`這個檔案不是可以用的圖片${check.ext ? `（.${check.ext}）` : ''}`, '可以上傳 JPG、PNG 或 WebP 圖檔。'];
    return ['這張圖打不開', '換一張試試，或先另存成 JPG。'];
  }
  function pickAvatar({ editor = false } = {}) {
    closeMenu(false);
    fileInput.value = '';
    fileInput.onchange = async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      const target = editor ? stack.find(s => s.kind === 'editor') : null;
      const report = (pair) => { if (target) target.avatar.error(`${esc(pair[0])}<small>${esc(pair[1])}</small>`); else toast(`${pair[0]}：${pair[1]}`, { error: true }); };
      const chk = PL.checkAvatarFile(file);
      if (!chk.ok) return report(fileError(chk));
      let bmp;
      try { bmp = await decodeImage(file); } catch (e) { return report(fileError({ kind: 'decode' })); }
      openCrop(bmp, async (small, large) => {
        if (target && stack.includes(target)) return target.avatar.upload(small, large);
        toast('頭像上傳中…');
        try { await profile.setAvatar(small, large); toast('頭像已更新'); } catch (err) { toast('頭像沒有上傳成功，請檢查網路後再試一次。', { error: true }); }
      }, () => pickAvatar({ editor }));
    };
    fileInput.click();
  }
  async function decodeImage(file) {
    let src;
    if (typeof createImageBitmap === 'function') {
      try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { src = null; }
    }
    if (!src) {
      const url = URL.createObjectURL(file);
      try {
        src = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
      } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    }
    const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
    if (!w || !h || w * h > 60_000_000) throw new Error('bad image');
    return { src, w, h, close: () => { try { if (src.close) src.close(); } catch (e) { /* 略 */ } } };
  }
  // 把裁切範圍畫成 size×size 的 JPEG（白底；canvas 輸出本來就不帶 EXIF／GPS），超過上限就降品質
  function renderJpeg(source, region, size, max) {
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(source, region.sx, region.sy, region.sw, region.sh, 0, 0, size, size);
    for (const q of [0.86, 0.78, 0.68, 0.56, 0.44]) {
      const d = c.toDataURL('image/jpeg', q);
      if (PL.avatarOk(d, max)) return { d, canvas: c };
    }
    throw new Error('too big');
  }
  function openCrop(img, onUse, onRepick) {
    const entry = pushOverlay({ top: true, cls: 'is-dialog-wrap',
      html: `<section class="pc-box crop-box" role="dialog" aria-modal="true" aria-labelledby="pcCropT"><button class="pc-close" type="button" data-pc="close" aria-label="關閉" style="position:absolute">${ic('x')}</button>`
        + `<h2 id="pcCropT">調整頭像</h2><p>拖曳照片調整位置，圓圈裡的範圍就是頭像。</p>`
        + `<div class="crop-stage" tabindex="0" role="application" aria-label="頭像位置：用方向鍵移動，加號減號縮放"><canvas></canvas><div class="crop-mask"></div><span class="crop-hint">拖曳移動・滾輪或雙指縮放</span></div>`
        + `<div class="crop-zoom">${ic('zoom-out')}<input type="range" min="100" max="300" value="100" aria-label="縮放">${ic('zoom-in')}</div>`
        + `<div class="crop-preview" aria-label="各種大小的預覽">${[[96, '資料卡'], [36, '清單'], [22, '留言卡']].map(([s, t]) => `<figure><span class="pav sz-${s} is-photo"><canvas width="${s * 2}" height="${s * 2}" style="width:100%;height:100%;display:block"></canvas></span><figcaption>${t}</figcaption></figure>`).join('')}</div>`
        + `<div class="crop-actions"><button class="action-btn" type="button" data-pc="repick">重新選擇</button><button class="action-btn primary" type="button" data-pc="use">${ic('check')}使用這張</button></div></section>` });
    entry.onClosed = () => img.close();
    const el = entry.el, stage = el.querySelector('.crop-stage'), cv = stage.querySelector('canvas'), range = el.querySelector('input[type=range]');
    const previews = [...el.querySelectorAll('.crop-preview canvas')];
    const st = { zoom: 1, ox: 0, oy: 0, S: 0 };
    const clamp = () => { const c = PL.cropClamp({ w: img.w, h: img.h, stage: st.S, zoom: st.zoom, ox: st.ox, oy: st.oy }); st.ox = c.ox; st.oy = c.oy; return c; };
    let raf = 0;
    const draw = () => {
      raf = 0;
      const c = clamp(), dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(st.S * dpr)) { cv.width = Math.round(st.S * dpr); cv.height = cv.width; }
      const g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#2b2b33'; g.fillRect(0, 0, st.S, st.S);
      g.imageSmoothingQuality = 'high'; g.drawImage(img.src, c.ox, c.oy, c.W, c.H);
      const r = PL.cropSource({ w: img.w, h: img.h, stage: st.S, zoom: st.zoom, ox: st.ox, oy: st.oy });
      for (const p of previews) { const pg = p.getContext('2d'); pg.fillStyle = '#fff'; pg.fillRect(0, 0, p.width, p.height); pg.imageSmoothingQuality = 'high'; pg.drawImage(img.src, r.sx, r.sy, r.sw, r.sh, 0, 0, p.width, p.height); }
      range.value = String(Math.round(st.zoom * 100));
    };
    const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };
    const setZoom = (z) => {
      z = Math.min(3, Math.max(1, z));
      const c0 = clamp(), mid = st.S / 2, k = (z / st.zoom);
      st.ox = mid - (mid - c0.ox) * k; st.oy = mid - (mid - c0.oy) * k; st.zoom = z; redraw();
    };
    const init = () => {
      st.S = stage.clientWidth || 360;
      const c = PL.cropClamp({ w: img.w, h: img.h, stage: st.S, zoom: 1, ox: 0, oy: 0 });
      st.ox = (st.S - c.W) / 2; st.oy = (st.S - c.H) / 2; draw();
    };
    requestAnimationFrame(init);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { const S = stage.clientWidth; if (S && st.S && S !== st.S) { const k = S / st.S; st.ox *= k; st.oy *= k; st.S = S; redraw(); } }) : null;
    if (ro) { ro.observe(stage); const prev = entry.onClosed; entry.onClosed = () => { ro.disconnect(); prev(); }; }
    // 拖曳、雙指縮放
    const pts = new Map(); let pinch = null;
    stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); stage.classList.add('is-dragging');
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: st.zoom }; } });
    stage.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      if (pts.size === 1) { st.ox += e.clientX - p.x; st.oy += e.clientY - p.y; redraw(); }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch.d > 0) setZoom(pinch.z * d / pinch.d); }
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) stage.classList.remove('is-dragging'); };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(st.zoom * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    stage.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 20 : 4;
      const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (mv) { e.preventDefault(); st.ox += mv[0]; st.oy += mv[1]; redraw(); return; }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(st.zoom + 0.1); }
      if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoom(st.zoom - 0.1); }
    });
    range.addEventListener('input', () => setZoom(Number(range.value) / 100));
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pc]'); if (!b) return;
      if (b.dataset.pc === 'close') return closeOverlay(entry);
      if (b.dataset.pc === 'repick') { closeOverlay(entry, { restoreFocus: false }); return onRepick(); }
      if (b.dataset.pc === 'use') {
        let small, large;
        try {
          clamp();
          const r = PL.cropSource({ w: img.w, h: img.h, stage: st.S, zoom: st.zoom, ox: st.ox, oy: st.oy });
          const L = renderJpeg(img.src, r, PL.P.avatar_large_px, PL.P.avatar_large_max);
          small = renderJpeg(L.canvas, { sx: 0, sy: 0, sw: L.canvas.width, sh: L.canvas.height }, PL.P.avatar_small_px, PL.P.avatar_small_max).d;   // 小圖從大圖縮，比直接從原圖縮清楚
          large = L.d;
        } catch (err) { toast('這張圖處理不了，換一張試試。', { error: true }); return; }
        closeOverlay(entry);
        onUse(small, large);
      }
    });
    setTimeout(() => stage.focus({ preventScroll: true }), 40);
    return entry;
  }

  // ------------------------------------------------------------ 自己的頭像：選單
  const btn = deps.avatarBtn;
  if (btn) {
    btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', '我的帳號'); btn.title = '我的帳號';
    btn.addEventListener('click', (e) => { e.stopPropagation(); if (menu) closeMenu(true); else openMenu(); });
    // 手機撰寫列收合時，頭像一拿到焦點撰寫列就會展開、頭像位置跟著跑掉，第一下點擊會落空：滑鼠按下時不搶焦點
    btn.addEventListener('mousedown', (e) => e.preventDefault());
  }
  function openMenu() {
    if (!btn) return;
    const uid = deps.meId, name = deps.meName(), photo = profile.smallOf(uid);
    menu = document.createElement('div');
    menu.className = 'me-menu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', '我的帳號'); menu.id = 'pcMenu';
    menu.innerHTML = `<div class="me-head">${pav(uid, name, 36, photo).replace('role="img"', 'aria-hidden="true"').replace(/ alt="[^"]*"/, ' alt=""')}<div><b>${esc(name)}</b><span>我的帳號</span></div></div>`
      + `<button type="button" role="menuitem" data-pc="me-card">${ic('book')}我的使用說明書</button>`
      + `<button type="button" role="menuitem" data-pc="me-photo">${ic('camera')}${photo ? '更換頭像' : '上傳頭像'}</button>`
      + (X.menuExtra ? '<div data-pc-ext></div>' : '')   // T102：別人的光效（只看靜態）
      + `<hr><button type="button" role="menuitem" class="is-quiet" data-pc="me-logout">${ic('logout')}登出</button>`;
    document.body.appendChild(menu);
    if (X.menuExtra) { const slot = menu.querySelector('[data-pc-ext]'); if (slot) slot.replaceWith(X.menuExtra()); }   // T102
    const r = btn.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 256)) + 'px';
    menu.style.bottom = Math.round(window.innerHeight - r.top + 12) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    try { localStorage.setItem(MENU_SEEN_KEY, '1'); } catch (e) { /* 略 */ }
    const dot = btn.querySelector('.me-dot'); if (dot) dot.remove();
    const items = () => [...menu.querySelectorAll('[role="menuitem"]')];
    items()[0].focus();
    menu.addEventListener('keydown', (e) => {
      const list = items(), i = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
      else if (e.key === 'Tab') closeMenu(false);
    });
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pc]'); if (!b) return;
      const act = b.dataset.pc;
      closeMenu(false);
      if (act === 'me-card') openViewer(uid, btn);
      else if (act === 'me-photo') pickAvatar({ editor: false });
      else if (act === 'me-logout') deps.logout();
    });
  }
  function closeMenu(focusBack) {
    if (!menu) return;
    menu.remove(); menu = null;
    if (btn) { btn.setAttribute('aria-expanded', 'false'); if (focusBack) btn.focus(); }
  }
  document.addEventListener('pointerdown', (e) => { if (menu && !menu.contains(e.target) && !(btn && btn.contains(e.target))) closeMenu(false); }, true);
  window.addEventListener('resize', () => closeMenu(false));

  // 撰寫區自己的頭像：有照片放照片，否則縮寫色塊（app.js 的 renderMyAvatar 改成呼叫這裡）
  function paintMyAvatar() {
    if (!btn) return;
    const uid = deps.meId, name = deps.meName(), photo = profile.smallOf(uid);
    btn.classList.toggle('has-photo', !!photo);
    if (photo) btn.innerHTML = `<img src="${esc(photo)}" alt="" aria-hidden="true">`;
    else { btn.textContent = deps.initials(name); btn.style.background = deps.avatarColor(uid, name); }
    if (photo) btn.style.background = '';
    let seen = true; try { seen = localStorage.getItem(MENU_SEEN_KEY) === '1'; } catch (e) { /* 略 */ }
    if (!seen && !btn.querySelector('.me-dot')) btn.insertAdjacentHTML('beforeend', '<span class="me-dot" aria-hidden="true"></span>');
  }

  // ------------------------------------------------------------ 開卡入口（事件委派）
  // 有 data-pc-uid（或 data-pc-name）的元素：放大卡、清單放大卡上的作者，清單列的作者、感謝榜／英雄榜的名字。
  // 牆面上的小卡（沒放大）不攔：點小卡＝放大、按住＝拖曳（設計稿 4.1）。
  const resolve = (el) => el.dataset.pcUid || (el.dataset.pcName ? deps.uidByName(el.dataset.pcName) : '');
  const entryOf = (t) => {
    const el = t && t.closest ? t.closest('[data-pc-uid], [data-pc-name]') : null;
    if (!el) return null;
    if (el.closest('.message-card') && !el.closest('.message-card.focused')) return null;
    return el;
  };
  document.addEventListener('click', (e) => {
    const el = entryOf(e.target); if (!el) return;
    const uid = resolve(el); if (!uid) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    openViewer(uid, el);
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = entryOf(e.target); if (!el || el !== e.target || el.tagName === 'BUTTON') return;
    const uid = resolve(el); if (!uid) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    openViewer(uid, el);
  }, true);

  return { openViewer, openEditor, openMenu, closeMenu, closeAll, paintMyAvatar, pickAvatar, isOpen: () => stack.length > 0 || !!menu };
}
