// T113（6.6.1）提高「說明書填寫、頭像上傳、換模板」使用率：原地提示（B）、「讓同事認得你」小卡與樣式小提示（C）、開頁備援小卡（A）。
// 設計：design/填寫與模板提醒/（報告-美術.md、設計規格.md、mockup.html、nudge.css）。判斷與頻率在 nudge-logic.js（純函式）。
// 這支不直接讀寫資料庫：說明書用 ProfileService.card() 讀一次、頭像看 ProfileService、次數紀錄透過 deps.savePref 寫本人 prefs。
// 任何一步出錯都只在主控台記錄，主牆照常運作。
import * as N from './nudge-logic.js';
import { slot } from './popup-slot.js';
import { filledFields } from './fb/profile-logic.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
// 圖示：自繪 SVG（Lucide 線條風格），和設計稿同一組
const I = {
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  go: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.3-8.6-8.7C2.2 8 4.3 5 7.4 5c1.9 0 3.3 1 4.6 2.6C13.3 6 14.7 5 16.6 5c3.1 0 5.2 3 4 6.3C19 15.7 12 20 12 20z"/></svg>',
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/><path d="M6.5 8h2M6.5 11h2M15.5 8h2"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z"/></svg>',
};
const KICK_ICON = { send: I.check, recv: I.heart, load: I.spark };
const ART = {
  both: '<svg viewBox="0 0 64 64"><rect x="8" y="16" width="48" height="36" rx="8" fill="#fff" stroke="#9f1239" stroke-width="2"/><circle cx="22" cy="31" r="7" fill="none" stroke="#9f1239" stroke-width="2" stroke-dasharray="3 2.6"/><path d="M14 46c1.5-4 4.5-6 8-6s6.5 2 8 6" fill="none" stroke="#9f1239" stroke-width="2" stroke-dasharray="3 2.6" stroke-linecap="round"/><path d="M35 27h14M35 33h10M35 39h12" stroke="#f3c6cf" stroke-width="2.4" stroke-linecap="round"/><path d="M50 6l1.6 4.6L56 12l-4.4 1.4L50 18l-1.6-4.6L44 12l4.4-1.4z" fill="#f5b942"/></svg>',
  pc: '<svg viewBox="0 0 64 64"><rect x="10" y="10" width="44" height="46" rx="6" fill="#fff" stroke="#9f1239" stroke-width="2"/><path d="M32 12v42" stroke="#f3c6cf" stroke-width="2"/><path d="M16 22h11M16 29h9M37 22h11" stroke="#9f1239" stroke-width="2.4" stroke-linecap="round"/><path d="M37 29h8M37 36h10M16 36h7" stroke="#f3c6cf" stroke-width="2.4" stroke-linecap="round"/><path d="M50 4l1.6 4.6L56 10l-4.4 1.4L50 16l-1.6-4.6L44 10l4.4-1.4z" fill="#f5b942"/></svg>',
};
// 有這些東西開著時：小卡、樣式小提示都不出現（不疊在別的視窗上；設計規格 5.2 第 3 點）
const BUSY = '#onboardingOverlay.active, .pc-overlay, .me-menu, .sk-overlay, .sk-modal, .ln-scene, .lab-drawer, .k1000-sky, #luScrim, #rvScrim, '
  + '#yp26Page:not([hidden]), .yp-modal, #yp26Invite:not([hidden]), .sh-overlay, .tr-ov, #imgViewer:not([hidden]), #themePicker:not([hidden]), '
  + '.focus-overlay.active, .lm-focus:not([hidden]), #psLayer:not([hidden]), .exp-card, .lxp, .modal-overlay.active';
const isMobile = () => window.innerWidth <= 768;

/**
 * deps = {
 *   meId, profile（ProfileService）, pui（profile-ui：openEditor、pickAvatar）, nowMs(), meReady(), meName(), initials(n), avatarColor(uid, n),
 *   prefs() → ME.prefs, savePref(k, v) → Promise, skyEnd（點亮星空結束時間，伺服器時間 ms）,
 *   openPicker(), tipInfo() → { name, isEvent, n }, quiet() → 不寫卡也沒收過卡（備援用）,
 *   closeFocus()（關掉放大卡）, els: { avatar, styleBtn, composer, composerWrap, msgInput, receiverInput }
 * }
 */
export function createNudge(deps) {
  const E = deps.els;
  const S = {
    cardKnown: false, hasCard: true, cardFailed: false,     // 說明書讀取失敗＝當作寫完（不提醒）
    cardShownThisLoad: false, tipShownThisLoad: false, mn: null, tn: null, sendSeq: 0, tipTimer: null,
    log: '', tip: '', seen: '',                             // 本機最新值（prefs 寫回來之前先用這份，避免重複算）
  };
  const today = () => N.dayOf(deps.nowMs());
  const pref = (k) => { const p = deps.prefs() || {}; return String(p[k] ?? ''); };
  const logNow = () => (S.log || pref('nd_log'));
  const tipNow = () => (S.tip || pref('tpl_tip'));
  const tplSeen = () => S.seen === '1' || pref('tpl_seen') === '1';
  const save = (k, v) => { Promise.resolve().then(() => deps.savePref(k, v)).catch(() => { /* 寫不進去（離線）：這次照樣關掉，下次照 prefs 舊值判斷 */ }); };
  const hasAvatar = () => !!(deps.profile.hasAvatar(deps.meId) || (deps.profile.small && deps.profile.small.has(deps.meId)));
  const known = () => !!(deps.meReady() && S.cardKnown && deps.profile.ready);
  const state = () => ({ hasCard: S.cardFailed || S.hasCard, hasAvatar: hasAvatar() });
  const variant = () => (known() ? N.variantOf(state()) : null);
  const busy = () => !!document.querySelector(BUSY);

  // live region：小卡出現時念出「小標。標題」（不搶焦點）
  const live = document.createElement('p');
  live.className = 'pc-sr'; live.id = 'ndLive'; live.setAttribute('aria-live', 'polite');
  live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;margin:-1px;padding:0;border:0';
  document.body.appendChild(live);
  const announce = (t) => { live.textContent = ''; setTimeout(() => { live.textContent = t; }, 40); };

  // ------------------------------------------------------------ 讀說明書（一次）；之後靠 onCardSaved 更新
  function loadCard() {
    Promise.resolve().then(() => deps.profile.card(deps.meId))
      .then((c) => { S.hasCard = !!(c && filledFields(c).length >= 1); S.cardKnown = true; })
      .catch(() => { S.cardFailed = true; S.cardKnown = true; })
      .finally(() => { paint(); maybeFallback(); });
  }

  // ------------------------------------------------------------ B 原地提示
  function paint() {
    const av = E.avatar;
    if (av) {
      const v = variant(), st = state();
      av.classList.toggle('nd-av', v === 'both' || v === 'av');
      av.classList.toggle('nd-pc', v === 'pc');
      const name = deps.meName();
      av.setAttribute('aria-label', v ? N.avatarLabel(name, st) : `我的帳號：${name}`);
    }
    paintStyle();
    if (!variant()) hideCard('done');
  }
  function paintStyle(name) {
    const b = E.styleBtn; if (!b) return;
    const on = deps.meReady() && !tplSeen();
    b.classList.toggle('nd-new', on);
    const nm = name || (deps.tipInfo() || {}).name || '';
    if (nm) b.setAttribute('aria-label', `卡片樣式：${nm}${on ? '（可以換樣式）' : ''}`);
  }

  // ------------------------------------------------------------ C「讓同事認得你」小卡
  function cardHtml(c, when) {
    const name = deps.meName(), ini = deps.initials(name), color = deps.avatarColor(deps.meId, name);
    const art = c.v === 'av'
      ? `<div class="mn-art" aria-hidden="true"><span class="ini" style="background:${esc(color)}">${esc(ini)}</span><svg class="arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg><span class="ph">${I.camera}</span></div>`
      : `<div class="mn-art" aria-hidden="true">${ART[c.v === 'both' ? 'both' : 'pc']}</div>`;
    const sig = c.sig ? `<p class="mn-sig"><span class="av" style="background:${esc(color)}" aria-hidden="true">${esc(ini)}</span><span class="nm" title="${esc(name)}">${esc(name)}</span><span class="lbl">現在的署名</span></p>` : '';
    const sky = c.sky ? `<p class="mn-sky">${I.star}<span>${esc(N.SKY_LINE)}</span></p>` : '';
    const rows = c.rows ? `<ul class="mn-rows">${c.rows.map(r => `<li><button type="button" class="mn-row" data-act="${r.act}"><span class="ic">${I[r.ic]}</span><span><b>${esc(r.b)}</b><small>${esc(r.s)}</small></span><svg class="go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button></li>`).join('')}</ul>` : '';
    const act = c.rows ? '<div class="mn-act"><button type="button" class="mn-later">先不要</button></div>'
      : `<div class="mn-act"><button type="button" class="mn-later">先不要</button><button type="button" class="mn-go" data-act="${c.act}">${esc(c.go)}${I.go}</button></div>`;
    return `<button type="button" class="mn-x" aria-label="關閉">${I.x}</button>`
      + `<p class="mn-kicker">${KICK_ICON[when] || I.spark}${esc(N.KICKER[when] || N.KICKER.load)}</p>`
      + `<div class="mn-head">${art}<div><h2 id="mnT">${esc(c.t)}</h2><p class="mn-d" id="mnD">${esc(c.d)}</p></div></div>${sig}${sky}${rows}${act}`;
  }
  function placeCard() {
    const el = S.mn && S.mn.el; if (!el) return;
    if (S.mn.docked) return placeDocked();
    const cw = E.composer.getBoundingClientRect(), av = E.avatar.getBoundingClientRect();
    el.style.setProperty('--mn-bottom', Math.round(window.innerHeight - cw.top + 14) + 'px');
    if (isMobile()) { el.style.removeProperty('--mn-left'); el.classList.add('no-notch'); return; }
    const left = Math.max(12, Math.round(cw.left));
    el.style.setProperty('--mn-left', left + 'px');
    el.style.setProperty('--mn-notch', Math.round(av.left + av.width / 2 - left - 8) + 'px');
    el.classList.remove('no-notch');
  }
  // 收到卡：接在放大卡下方 16px（桌機）／撰寫區上方（手機）；放不下時把放大卡往上移，還是放不下就這次不出現（不算次數）
  function placeDocked() {
    const m = S.mn, el = m.el, card = m.card; if (!card || !card.isConnected) return false;
    if (m.list) return true;                                         // 清單的放大卡：小卡排在時間列下面，跟著捲動
    card.classList.remove('nd-dock'); card.style.removeProperty('--nd-top');
    const r = card.getBoundingClientRect(), H = r.height, M = el.offsetHeight, vh = window.innerHeight;
    if (!isMobile()) {
      const total = H + 16 + M;
      if (total > vh - 24) return false;
      const top = Math.max(12, Math.round((vh - total) / 2));
      card.classList.add('nd-dock'); card.style.setProperty('--nd-top', Math.round(top + H / 2) + 'px');
      el.style.top = Math.round(top + H + 16) + 'px';
      return true;
    }
    const cw = E.composer.getBoundingClientRect();
    const bottom = Math.max(16, Math.round(vh - cw.top + 14));
    el.style.setProperty('--mn-bottom', bottom + 'px');
    const mnTop = vh - bottom - M;
    if (r.bottom > mnTop - 12) {
      const shift = r.bottom - (mnTop - 12);
      if (r.top - shift < 12) return false;
      card.classList.add('nd-dock'); card.style.setProperty('--nd-top', Math.round(r.top - shift + H / 2) + 'px');
    }
    return true;
  }
  function openCard(when, opts = {}) {
    const v = variant(); if (!v) return false;
    const c = N.cardContent(v, when, deps.nowMs() <= deps.skyEnd);
    const el = document.createElement('section');
    el.className = 'mn is-pre'; el.id = 'mnCard';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'false'); el.setAttribute('aria-labelledby', 'mnT'); el.setAttribute('aria-describedby', 'mnD');
    el.tabIndex = -1; el.dataset.v = v; el.dataset.when = when;
    el.innerHTML = cardHtml(c, when);
    S.mn = { el, when, v, docked: !!opts.card, card: opts.card || null, list: !!opts.list };
    if (opts.card && opts.list) {                                    // 清單放大卡：排在時間列下面
      el.classList.add('is-docked'); el.style.cssText = 'position:relative;left:auto;top:auto;transform:none;width:min(480px,88vw)';
      opts.stage.appendChild(el);
    } else if (opts.card) {
      el.classList.add('is-docked'); el.style.zIndex = '96100';
      if (isMobile()) { el.style.position = 'fixed'; el.style.top = 'auto'; } else { el.style.position = 'fixed'; el.style.bottom = 'auto'; }
      document.body.appendChild(el);
    } else E.composerWrap.insertAdjacentElement('afterend', el);
    el.style.visibility = 'hidden';
    const ok = opts.card ? placeDocked() : (placeCard(), true);
    if (!ok) { el.remove(); if (opts.card) { opts.card.classList.remove('nd-dock'); opts.card.style.removeProperty('--nd-top'); } S.mn = null; return false; }
    el.style.visibility = '';
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('is-pre')));
    el.addEventListener('click', onCardClick);
    if (opts.card && !opts.list) {                                   // 放大卡被重畫或換掉（牆面輪播、資料更新）：跟著收起；讓位被洗掉就重新排
      S.mn.watch = setInterval(() => {
        const m = S.mn; if (!m || !m.card) return;
        if (!m.card.isConnected || !m.card.classList.contains('focused')) return hideCard('closed');
        // 放大卡量完之後還可能變高或變矮（手機寬度改 88vw 重新換行、照片晚到、機器慢時放大動畫還沒跑完）：間距不到 8px 就重排，放不下就收起
        const lost = !isMobile() && !m.card.classList.contains('nd-dock');
        const gap = m.el.getBoundingClientRect().top - m.card.getBoundingClientRect().bottom;
        if ((lost || gap < 8 || (!isMobile() && gap > 28)) && !placeDocked()) hideCard('no-room');   // 美術比對 S1：桌機太遠（>28px，設計 16px）也重排；手機小卡固定在撰寫區上方，遠是正常的
      }, 400);
    }
    S.cardShownThisLoad = true;
    S.log = N.markCardShown(logNow(), today(), { fallback: when === 'load' }); save('nd_log', S.log);
    announce(`${N.KICKER[when]}。${c.t}`);
    if (opts.focus) setTimeout(() => { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }, 30);
    return true;
  }
  function hideCard(why) {
    const m = S.mn; if (!m) return;
    S.mn = null; clearInterval(m.watch);
    if (m.card) { m.card.classList.remove('nd-dock'); m.card.style.removeProperty('--nd-top'); }
    const hadFocus = m.el.contains(document.activeElement);
    const done = () => m.el.remove();
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) done();
    else { m.el.classList.add('is-pre'); setTimeout(done, 180); }
    if (why === 'snooze') { S.log = N.markSnooze(logNow(), today()); save('nd_log', S.log); }
    if (hadFocus && why !== 'act' && E.msgInput && !m.card) { try { (E.avatar || E.msgInput).focus({ preventScroll: true }); } catch (e) { /* 略 */ } }
  }
  function onCardClick(e) {
    const m = S.mn; if (!m) return;
    if (e.target.closest('.mn-x, .mn-later')) { e.stopPropagation(); return hideCard('snooze'); }
    const a = e.target.closest('[data-act]'); if (!a) return;
    e.stopPropagation();
    const act = a.dataset.act;
    hideCard('act');
    if (m.card && deps.closeFocus) deps.closeFocus();
    if (act === 'avatar') deps.pui.pickAvatar({ editor: false });
    else deps.pui.openEditor(E.avatar);
  }

  // ① 送出後：等送出提示收起 600ms 後才出現；這段時間開始打下一張卡或開了視窗就取消（不算次數）
  function afterSend(res, sentBody) {
    try {
      const anon = !!((sentBody && sentBody.anonymous) || (res && res.message && res.message.author && res.message.author.anonymous) || (res && res.message && res.message.mode && res.message.mode !== 'named'));
      hideTip();
      if (anon || S.cardShownThisLoad || S.mn || !variant() || !N.canShowCard(logNow(), today())) return;
      const seq = ++S.sendSeq, t0 = Date.now();
      const toastUp = () => !!document.querySelector('#wallToast.show, #yp26Hint:not([hidden])');
      const tick = () => {
        if (seq !== S.sendSeq) return;
        if (Date.now() - t0 < 1200 || (toastUp() && Date.now() - t0 < 9000)) return setTimeout(tick, 200);
        setTimeout(() => {
          if (seq !== S.sendSeq || S.mn || S.cardShownThisLoad) return;
          if ((E.msgInput && E.msgInput.value.trim()) || busy()) return;   // 已經開始寫下一張、或有視窗開著：這次放棄
          if (!N.canShowCard(logNow(), today())) return;
          openCard('send');
        }, 600);
      };
      setTimeout(tick, 200);
    } catch (e) { console.error('[nudge]', e); }
  }
  // ② 放大檢視一張寫給我的卡（收件人含我、作者不是我）
  function onFocusCard(card, msg, { list = false, stage = null } = {}) {
    try {
      const skip = (why) => { S.skip = why; };                      // 測試與除錯用：最後一次沒出現的原因
      if (!msg || !msg.toMe || msg.isMine) return skip('not-to-me');
      if (S.mn || S.cardShownThisLoad || !variant()) return skip('shown-or-done');
      if (!N.canShowCard(logNow(), today())) return skip('freq');
      if (document.querySelector('.pc-overlay, #luScrim, .sk-overlay, .ln-scene, .sh-overlay')) return skip('busy');
      hideTip();
      // 等放大動畫和照片排好再量（卡片高度會變）
      setTimeout(() => {
        if (!card.isConnected || !card.classList.contains('focused')) return skip('unfocused');
        if (S.mn || S.cardShownThisLoad) return skip('shown');
        if (!openCard('recv', { card, list, stage })) skip('no-room');
      }, 380);
    } catch (e) { console.error('[nudge]', e); }
  }
  function onFocusClosed() { if (S.mn && S.mn.docked) hideCard('closed'); }
  // ③ 備援：開頁、不寫卡也沒收過卡的人；排在所有活動之後（popup-slot 優先 6）
  let fbAsked = false;
  function maybeFallback() {
    if (fbAsked || !variant() || S.cardShownThisLoad) return;
    try { if (!deps.quiet()) return; } catch (e) { return; }
    if (!N.canShowCard(logNow(), today(), { fallback: true })) return;
    fbAsked = true;
    slot.request('nudge', 6, () => {
      if (S.mn || S.cardShownThisLoad || !variant() || busy() || !N.canShowCard(logNow(), today(), { fallback: true })) return false;
      const fresh = !document.activeElement || document.activeElement === document.body || document.activeElement === document.documentElement;
      return openCard('load', { focus: fresh });
    });
  }

  // ------------------------------------------------------------ C 樣式小提示
  function tipHtml(info) {
    return `<button type="button" class="tn-x" aria-label="關閉提示">${I.x}</button><div class="tn-in"><div class="tn-fan" aria-hidden="true"><i></i><i></i><i></i></div>`
      + `<div><h2 id="tnT">這張卡可以換樣式</h2><p>${N.tipText(info.name, info.isEvent, info.n)}</p></div></div>`
      + `<div class="tn-act"><button type="button" class="tn-go">看看樣式${I.go}</button></div>`;
  }
  function placeTip() {
    const el = S.tn; if (!el) return;
    const b = E.styleBtn.getBoundingClientRect(), cw = E.composer.getBoundingClientRect();
    el.style.setProperty('--tn-bottom', Math.round(window.innerHeight - cw.top + 12) + 'px');
    const w = el.offsetWidth, left = isMobile() ? 12 : Math.max(12, Math.min(Math.round(b.left - 20), window.innerWidth - w - 12));
    el.style.setProperty('--tn-left', left + 'px');
    el.style.setProperty('--tn-notch', Math.round(b.left + b.width / 2 - left - 7) + 'px');
  }
  function maybeTip() {
    clearTimeout(S.tipTimer);
    if (S.tipShownThisLoad || S.tn || S.mn || !deps.meReady() || tplSeen()) return;
    if (!N.canShowTip(tipNow(), today(), tplSeen())) return;
    S.tipTimer = setTimeout(() => {
      if (S.tipShownThisLoad || S.tn || S.mn || tplSeen() || busy()) return;
      if (!E.composerWrap.contains(document.activeElement)) return;
      if (!E.styleBtn.getClientRects().length) return;                // 手機撰寫區還沒展開：看不到「樣式」按鈕
      const info = deps.tipInfo(); if (!info || !(info.n > 0) || !info.name) return;
      if (!N.canShowTip(tipNow(), today(), tplSeen())) return;
      const el = document.createElement('section');
      el.className = 'tn is-pre'; el.id = 'tnTip'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'false'); el.setAttribute('aria-labelledby', 'tnT');
      el.innerHTML = tipHtml(info);
      E.composerWrap.insertAdjacentElement('afterend', el);
      S.tn = el; S.tipShownThisLoad = true;
      placeTip();
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('is-pre')));
      S.tip = N.markTipShown(tipNow(), today()); save('tpl_tip', S.tip);
      el.addEventListener('mousedown', (e) => { if (!e.target.closest('button')) e.preventDefault(); });   // 點提示空白處不讓撰寫區失去焦點
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target.closest('.tn-go')) { hideTip(); deps.openPicker(); return; }
        if (e.target.closest('.tn-x')) { hideTip(); try { E.msgInput.focus({ preventScroll: true }); } catch (e2) { /* 略 */ } }
      });
    }, 400);
  }
  function hideTip() {
    clearTimeout(S.tipTimer);
    const el = S.tn; if (!el) return;
    S.tn = null;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) el.remove();
    else { el.classList.add('is-pre'); setTimeout(() => el.remove(), 180); }
  }
  function onPickerOpened() {
    hideTip();
    if (tplSeen()) return paintStyle();
    S.seen = '1'; save('tpl_seen', '1'); paintStyle();
  }

  // ------------------------------------------------------------ 事件
  E.composerWrap.addEventListener('focusin', (e) => {
    if (!e.target.closest('#receiverInput, #msgInput')) return;
    if (S.mn && S.mn.when === 'send' && isMobile()) hideCard('typing');   // 手機：撰寫區取得焦點，送出後的小卡收起（鍵盤會擋到）
    if (S.mn && S.mn.when === 'load' && isMobile()) hideCard('typing');
    maybeTip();
  });
  E.composerWrap.addEventListener('focusout', (e) => {
    const to = e.relatedTarget;
    if (to && (E.composerWrap.contains(to) || (S.tn && S.tn.contains(to)))) return;
    setTimeout(() => { if (!E.composerWrap.contains(document.activeElement) && !(S.tn && S.tn.contains(document.activeElement))) hideTip(); }, 0);
  });
  if (E.msgInput) E.msgInput.addEventListener('input', () => { if (S.mn && (S.mn.when === 'send' || S.mn.when === 'load') && E.msgInput.value.trim()) hideCard('typing'); });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (S.tn) {
      const ac = document.getElementById('autocompleteList');
      if (ac && ac.style.display === 'flex' && ac.children.length) return;   // 名字建議清單開著：Esc 先關清單
      e.preventDefault(); e.stopImmediatePropagation(); hideTip(); return;
    }
    if (S.mn && !S.mn.docked && !busy()) { e.preventDefault(); e.stopImmediatePropagation(); hideCard('snooze'); }
  }, true);
  window.addEventListener('resize', () => { if (S.mn && !S.mn.docked) placeCard(); else if (S.mn) placeDocked(); placeTip(); });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (S.mn && !S.mn.docked) placeCard(); placeTip(); }).observe(E.composer);
  deps.profile.on((uid) => { if (uid === '*' || uid === deps.meId) { paint(); maybeFallback(); } });

  loadCard();
  return {
    paint, paintStyle, afterSend, onFocusCard, onFocusClosed, onPickerOpened,
    /** app.js 開頁資料到了（ME、prefs）：重畫原地提示、看要不要備援 */
    onMe() { paint(); maybeFallback(); },
    /** profile-ui 儲存說明書後（card＝存進去的內容，清空時是 null） */
    onCardSaved(card) { S.hasCard = !!(card && filledFields(card).length >= 1); S.cardKnown = true; S.cardFailed = false; paint(); },
    /** profile-ui 頭像選單用：還沒寫／還沒放的標籤、說明書空白時直接開編輯（資料還沒讀到回 null） */
    state: () => (known() ? state() : null),
    hideAll() { hideCard('closed'); hideTip(); },
    _s: S,
  };
}
