// 登入（Firebase Auth「Email 登入連結」，不用密碼）＋確認是不是通訊錄名單上的同事。前台與後台共用。
//
// 流程：
// 1. 沒登入 → 顯示登入卡：輸入公司 Email → 寄一封登入信（連結回到這個網址）。
// 2. 點信裡的連結回來 → 用「寄信時記在這台裝置的 Email」完成登入。
//    在 A 瀏覽器要求、在郵件 App 內建瀏覽器打開時，那個瀏覽器沒有記錄 → 請同事再輸入一次 Email（Firebase 會比對）。
// 3. 登入後讀自己的 allow/<email> 對到 user_id，再看 people/<user_id> 是不是 active；不是就顯示「不在名單上」。
// 登入狀態存在瀏覽器（IndexedDB），關掉分頁再打開不用重新登入；登出才會清掉。
import {
  initializeApp, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, onAuthStateChanged, sendSignInLinkToEmail,
  isSignInWithEmailLink, signInWithEmailLink, signOut, connectAuthEmulator, getDatabase, connectDatabaseEmulator, ref, get,
} from '../../vendor/firebase-sdk.js';
import { FIREBASE_CONFIG, LOGIN, EMULATOR } from './firebase-config.js';
import { K } from './constants.js';
import { emailKey } from './logic.js';

const EMAIL_LS = 'wall_signin_email';
const SENT_LS = 'wall_signin_sent_at';
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
export const USE_EMULATOR = isLocal && (new URLSearchParams(location.search).get('emu') === '1');

let app = null, auth = null, db = null;
export function firebase() {
  if (app) return { app, auth, db };
  const cfg = USE_EMULATOR
    ? { ...FIREBASE_CONFIG, apiKey: 'demo-api-key', projectId: EMULATOR.projectId, authDomain: `${EMULATOR.host}`,
        databaseURL: `http://${EMULATOR.host}:${EMULATOR.dbPort}/?ns=${EMULATOR.namespace}` }
    : FIREBASE_CONFIG;
  app = initializeApp(cfg);
  auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  db = getDatabase(app);
  if (USE_EMULATOR) {
    connectAuthEmulator(auth, `http://${EMULATOR.host}:${EMULATOR.authPort}`, { disableWarnings: true });
    connectDatabaseEmulator(db, EMULATOR.host, EMULATOR.dbPort);
  }
  return { app, auth, db };
}

// ---------------------------------------------------------------- 畫面（登入卡）
const ui = {};
function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids) if (c) e.append(c);
  return e;
}
function ensureUi() {
  if (ui.root) return ui;
  ui.root = el('div', { class: 'fbl-overlay', id: 'loginOverlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'fblTitle', hidden: true });
  ui.box = el('div', { class: 'fbl-box' });
  ui.icon = el('div', { class: 'fbl-icon', 'aria-hidden': 'true', text: '💌' });
  ui.title = el('h2', { id: 'fblTitle' });
  ui.text = el('p', { class: 'fbl-text', id: 'fblText' });
  ui.form = el('form', { class: 'fbl-form', novalidate: true });
  ui.label = el('label', { class: 'fbl-label', for: 'fblEmail', text: '公司 Email' });
  ui.input = el('input', { id: 'fblEmail', class: 'fbl-input', type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'off', spellcheck: 'false',
    placeholder: 'name@roche.com', 'aria-describedby': 'fblMsg', required: true, maxlength: '254' });
  ui.btn = el('button', { class: 'fbl-btn', type: 'submit' });
  ui.msg = el('p', { class: 'fbl-msg', id: 'fblMsg', role: 'status', 'aria-live': 'polite' });
  ui.alt = el('div', { class: 'fbl-alt' });
  ui.form.append(ui.label, ui.input, ui.btn);
  ui.box.append(ui.icon, ui.title, ui.text, ui.form, ui.msg, ui.alt);
  ui.root.append(ui.box);
  document.body.append(ui.root);
  return ui;
}
function setMsg(text, kind = '') { ensureUi(); ui.msg.textContent = text || ''; ui.msg.className = 'fbl-msg' + (kind ? ' ' + kind : ''); }
function setAlt(...nodes) { ensureUi(); ui.alt.replaceChildren(...nodes.filter(Boolean)); }
function linkBtn(text, onClick) { const b = el('button', { type: 'button', class: 'fbl-link', text }); b.addEventListener('click', onClick); return b; }
function show({ icon, title, text, form = null, button = '', busy = false }) {
  ensureUi();
  ui.icon.textContent = icon; ui.title.textContent = title; ui.text.textContent = text;
  ui.form.hidden = !form; ui.btn.textContent = button; ui.btn.disabled = busy; ui.input.disabled = busy;
  for (const n of document.body.children) if (n !== ui.root && n.tagName !== 'SCRIPT') n.inert = true;
  ui.root.hidden = false;
  document.body.classList.add('fbl-open');
  if (form && !busy) setTimeout(() => ui.input.focus({ preventScroll: true }), 30);
}
export function hideLogin() {
  if (!ui.root) return;
  ui.root.hidden = true;
  document.body.classList.remove('fbl-open');
  for (const n of document.body.children) if (n !== ui.root) n.inert = false;
}

// ---------------------------------------------------------------- Email 檢查
export function checkEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!email) return { error: '請輸入你的公司 Email。' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { error: 'Email 格式好像不太對，請再檢查一次（例如 name@roche.com）。' };
  const domain = email.split('@')[1];
  if (!LOGIN.allowedDomains.includes(domain)) return { error: `請用公司 Email 登入（${LOGIN.allowedDomains.map(d => '@' + d).join('、')}）。` };
  if (!emailKey(email)) return { error: '這個 Email 含有系統不支援的符號，請聯絡管理員。' };
  return { email };
}
function friendlyAuthError(e) {
  const c = (e && e.code) || '';
  if (c === 'auth/quota-exceeded') return '今天寄登入信的次數已經到上限，請明天再試，或聯絡感謝牆管理員。';
  if (c === 'auth/operation-not-allowed') return '感謝牆的 Email 登入還沒開啟，請聯絡感謝牆管理員。';
  if (c === 'auth/unauthorized-continue-uri' || c === 'auth/unauthorized-domain') return '這個網址還沒加入允許清單，請聯絡感謝牆管理員。';
  if (c === 'auth/invalid-email') return 'Email 格式好像不太對，請再檢查一次。';
  if (c === 'auth/too-many-requests') return '嘗試太多次了，請過幾分鐘再試。';
  if (c === 'auth/network-request-failed') return '網路好像斷了，請檢查網路後再試一次。';
  if (c === 'auth/invalid-action-code' || c === 'auth/expired-action-code') return '這個登入連結已經用過或過期了，請重新寄一封登入信。';
  return '登入沒有成功，請重新整理頁面再試一次。';
}
const continueUrl = () => location.origin + location.pathname + (USE_EMULATOR ? '?emu=1' : '') + location.hash;
function cleanUrl() {
  const u = new URL(location.href);
  for (const k of ['apiKey', 'oobCode', 'mode', 'continueUrl', 'lang', 'tenantId']) u.searchParams.delete(k);
  history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
}

// ---------------------------------------------------------------- 登入卡的各個狀態
function showSendForm(note = '', kind = '') {
  show({ icon: '💌', title: '登入 RDTW 感謝牆', form: true, button: '寄登入連結給我',
    text: '輸入公司 Email，我們會寄一封登入信給你。點信裡的連結就能登入，不用密碼。' });
  try { ui.input.value = localStorage.getItem(EMAIL_LS) || ''; } catch (e) { /* 無痕模式 */ }
  setMsg(note, kind);
  setAlt(el('p', { class: 'fbl-fine', text: '只有通訊錄名單上的同事看得到感謝牆的內容。' }));
  ui.form.onsubmit = async (ev) => {
    ev.preventDefault();
    const r = checkEmail(ui.input.value);
    if (r.error) { setMsg(r.error, 'err'); ui.input.focus(); return; }
    const last = Number(localStorage.getItem(SENT_LS) || 0), wait = LOGIN.resendCooldownSec * 1000 - (Date.now() - last);
    try { if (localStorage.getItem(EMAIL_LS) === r.email && wait > 0) { showSent(r.email); return; } } catch (e) { /* 無痕模式 */ }
    ui.btn.disabled = true; setMsg('寄送中…');
    try {
      await sendSignInLinkToEmail(firebase().auth, r.email, { url: continueUrl(), handleCodeInApp: true });
      try { localStorage.setItem(EMAIL_LS, r.email); localStorage.setItem(SENT_LS, String(Date.now())); } catch (e) { /* 無痕模式：之後在同一個瀏覽器打開連結時會再問一次 Email */ }
      showSent(r.email);
    } catch (e) { ui.btn.disabled = false; setMsg(friendlyAuthError(e), 'err'); }
  };
}
let resendTimer = null;
function showSent(email) {
  show({ icon: '📬', title: '登入信寄出了', text: `請到 ${email} 的信箱，打開「Sign in to …」那封信，點裡面的連結。` });
  setMsg('');
  const resend = linkBtn('', () => { try { localStorage.removeItem(SENT_LS); } catch (e) { /* 忽略 */ } showSendForm(); ui.input.value = email; ui.form.requestSubmit(); });
  const tick = () => {
    const left = Math.ceil((LOGIN.resendCooldownSec * 1000 - (Date.now() - Number(localStorage.getItem(SENT_LS) || 0))) / 1000);
    resend.disabled = left > 0; resend.textContent = left > 0 ? `沒收到？${left} 秒後可以重寄` : '沒收到？重寄一封';
    if (left <= 0) clearInterval(resendTimer);
  };
  clearInterval(resendTimer); resendTimer = setInterval(tick, 1000); tick();
  setAlt(
    el('ul', { class: 'fbl-tips' },
      el('li', { text: '用手機的郵件 App 打開也可以；如果它要你再輸入一次 Email，輸入同一個就好。' }),
      el('li', { text: '幾分鐘還沒收到，請看看垃圾郵件匣。連結只能用一次。' })),
    resend, linkBtn('換一個 Email', () => { try { localStorage.removeItem(SENT_LS); } catch (e) { /* 忽略 */ } showSendForm(); }));
}
function askEmailForLink(note = '') {
  return new Promise((resolve) => {
    show({ icon: '🔐', title: '再確認一次 Email', form: true, button: '完成登入',
      text: '你是在另一個瀏覽器（或郵件 App）打開登入連結的。請輸入收到這封信的 Email，就能完成登入。' });
    ui.input.value = ''; setMsg(note, note ? 'err' : '');
    setAlt(linkBtn('重新寄一封登入信', () => { cleanUrl(); resolve(null); }));
    ui.form.onsubmit = (ev) => {
      ev.preventDefault();
      const r = checkEmail(ui.input.value);
      if (r.error) { setMsg(r.error, 'err'); return; }
      resolve(r.email);
    };
  });
}
export function showNotOnList(email, { adminName = '卓倫', contactUrl = '' } = {}) {
  show({ icon: '🔒', title: '你還不在感謝牆的名單上',
    text: `${email} 目前不在通訊錄裡。這個網站只開放公司同事使用，請聯絡感謝牆管理員${adminName ? `（${adminName}）` : ''}確認通訊錄。` });
  setMsg('');
  const nodes = [];
  if (/^(mailto:|https:\/\/|msteams:)/i.test(contactUrl)) nodes.push(el('a', { class: 'fbl-btn fbl-btn-a', href: contactUrl, text: '聯絡管理員' }));
  nodes.push(linkBtn('換一個 Email 登入', async () => { await signOut(firebase().auth); location.reload(); }));
  nodes.push(linkBtn('已經加入名單了？重新整理', () => location.reload()));
  setAlt(...nodes);
}
export function showFatal(title, text) {
  show({ icon: '⚠️', title, text });
  setMsg('');
  setAlt(linkBtn('重新整理', () => location.reload()));
}

// ---------------------------------------------------------------- 主流程
async function completeLinkSignIn(fb) {
  let email = null;
  try { email = localStorage.getItem(EMAIL_LS); } catch (e) { email = null; }
  let note = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!email) { email = await askEmailForLink(note); if (!email) return ''; }
    show({ icon: '⏳', title: '登入中…', text: '正在確認登入連結。' });
    try {
      await signInWithEmailLink(fb.auth, email, location.href);
      try { localStorage.removeItem(SENT_LS); localStorage.setItem(EMAIL_LS, email); } catch (e) { /* 忽略 */ }
      cleanUrl();
      return null;
    } catch (e) {
      const code = (e && e.code) || '';
      if (code === 'auth/invalid-email' || code === 'auth/missing-email') {           // Email 和收到連結的信箱不一樣：再問一次
        email = null; note = '這個 Email 和收到登入信的信箱不一樣，請再確認一次。';
        continue;
      }
      cleanUrl();
      return friendlyAuthError(e);
    }
  }
  return '';
}

function firstAuthState(fb) {
  return new Promise((resolve) => { const off = onAuthStateChanged(fb.auth, (u) => { off(); resolve(u); }); });
}

/**
 * 等到「登入完成而且確認在名單上」才 resolve；中間的畫面（登入卡、不在名單上）都在這裡處理。
 * 回傳 { auth, db, user, email, meId, isAdmin, signOut }
 */
export async function requireMember({ adminName, contactUrl, onSignedOut } = {}) {
  const fb = firebase();
  // 回傳 null＝登入成功；字串＝失敗原因（空字串＝同事選擇重寄一封）
  const linkProblem = isSignInWithEmailLink(fb.auth, location.href) ? await completeLinkSignIn(fb) : null;
  let user = await firstAuthState(fb);
  if (!user) {
    showSendForm(linkProblem || '', linkProblem ? 'err' : '');
    user = await new Promise((resolve) => { const off = onAuthStateChanged(fb.auth, (u) => { if (u) { off(); resolve(u); } }); });
  }
  const email = String(user.email || '').toLowerCase();
  const ek = emailKey(email);
  show({ icon: '⏳', title: '確認名單中…', text: '馬上就好。' });
  let meId = null, active = false, isAdmin = K.OWNER_EMAILS.includes(email);
  try {
    const a = ek ? await get(ref(fb.db, `allow/${ek}`)) : null;
    meId = a && a.exists() ? a.val().u : null;
    if (meId) { const p = await get(ref(fb.db, `people/${meId}`)); active = p.exists() && p.val().s === 'active'; }
  } catch (e) {
    if (!(e && /permission/i.test(String(e.message || e.code)))) { showFatal('暫時連不上感謝牆', '網路好像不太穩，請稍後重新整理頁面。'); throw e; }
  }
  if (!isAdmin && ek) { try { const ad = await get(ref(fb.db, `admins/${ek}`)); isAdmin = ad.exists() && ad.val() === true; } catch (e) { /* 不是管理員 */ } }
  if (!meId || !active) {
    if (!isAdmin) { showNotOnList(email, { adminName, contactUrl }); return new Promise(() => {}); }
  }
  hideLogin();
  // 在別的分頁登出、或帳號被停用：回到登入畫面
  onAuthStateChanged(fb.auth, (u) => { if (!u) { if (onSignedOut) onSignedOut(); location.reload(); } });
  return { auth: fb.auth, db: fb.db, user, email, meId, isAdmin, signOut: async () => { await signOut(fb.auth); } };
}
