// 寫入：把「發文、編輯、刪除、按讚、變身、偏好、後台操作」組成一次 Realtime Database 的多路徑更新（update）。
// 純函式（不碰 Firebase），前台與規則測試共用同一份，所以測試驗證的就是前台真正送出的內容。
// 規則（database.rules.json）會在伺服器端再檢查一次；這裡的檢查只是為了先給同事看得懂的提示。
import { K } from './constants.js';
import * as R from './logic.js';

export const TS = Object.freeze({ '.sv': 'timestamp' });       // 伺服器時間（規則裡的 now）

export class WallError extends Error {
  constructor(status, code, message, retryAfter = null) { super(message); this.status = status; this.code = code; this.retryAfter = retryAfter; }
}
const locked = (msg) => new WallError(403, 'LOCKED', msg);
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function randomId(prefix, now) {
  const a = new Uint8Array(5); globalThis.crypto.getRandomValues(a);
  return `${prefix}_${String(now).padStart(13, '0')}${Array.from(a, b => b.toString(16).padStart(2, '0')).join('')}`;
}

// ---------------------------------------------------------------- 額度格子
// 每人 10 個「今天」格子（qd）、30 個「30 天」格子（qm）、10 個「活動加碼」格子（qe）。
// 每則一般留言要佔一個今天格和一個 30 天格；格子過期（隔天、超過 30 天）或原本那則已刪除，才能再用。
const MARGIN = 60_000;   // 30 天格子快到期時，留一分鐘餘裕（瀏覽器時間和伺服器時間可能差一點）
export function freeSlot(slots, n, isFree) {
  for (let i = 0; i < n; i++) { const s = (slots || {})[String(i)]; if (!s || isFree(s)) return String(i); }
  return null;
}

// ---------------------------------------------------------------- 發文前檢查（和 5.5 validate_new_message 相同）
export function validateNewMessage(store, { text, receiver, theme, anonymous, hasImage }, now) {
  const admin = store.isAdmin, exp = store.exp(), level = R.levelForExp(exp), uid = store.meId;
  if (!text && !hasImage) throw new WallError(400, 'EMPTY', '請先寫下感謝內容。');
  const limit = R.maxLength(level, admin);
  if (textLength(text) > limit) throw new WallError(400, 'TOO_LONG', `內容超過 ${limit} 字的上限。`);
  if (receiver.length > K.LIMITS.receiver_max) throw new WallError(400, 'TOO_LONG', '收件人名單太長了。');
  if (receiver.includes(',') && !admin && level < 5) throw locked('同時感謝多位同事要升到 Lv.5 才能使用。');
  const hwOn = R.hwActive(now);
  if (anonymous && !admin && level < 7 && !hwOn) throw locked('匿名發佈要升到 Lv.7 才能使用。');
  if (hasImage && !admin && level < 6) throw locked('附圖要升到 Lv.6 才能使用。');
  const hwOk = (hwOn && !!store.hw.inf[uid]) || store.hwRewardFor(uid, now) !== null;
  const denied = R.themeDenied(theme, { level, exp, isAdmin: admin, hwOk });
  if (denied === 'BAD_THEME') throw new WallError(400, 'BAD_THEME', '不認得這個卡片主題，請重新選擇。');
  if (denied) throw locked(denied);
  let bucket = 'regular';
  const ev = R.activeEvent(now);
  if (!admin) {
    const q = store.quota(now);
    if (q.regular_left <= 0) {
      if (ev && q.event_left > 0) bucket = 'event';
      else {
        const retry = q.next_restore_at === null ? null : Math.max(1, Math.floor((q.next_restore_at - now) / 1000));
        let msg;
        if (ev === 'hw2026') msg = '你的一般額度和萬聖加碼都用完了，謝謝你這麼熱情！額度會陸續恢復，過幾天再來吧。';
        else if (ev) msg = '你的一般配額與節慶加碼都用完了，請過幾天再來分享吧！';
        else if (q.today_used >= K.QUOTA.daily) msg = '今天的感謝額度用完了，明天再來分享吧！';
        else msg = '你在過去 30 天內已經送出 30 則感謝，達上限囉！請過幾天再來分享吧！';
        throw new WallError(429, 'QUOTA', msg, retry);
      }
    }
  }
  let mode = 'named', mask = '';
  if (anonymous) { mode = hwOn ? 'mask' : 'anonymous'; mask = hwOn ? K.HW_MASKS[Math.floor(Math.random() * K.HW_MASKS.length)] : ''; }
  return { level: admin ? K.ADMIN_LEVEL : level, bucket, mode, mask, eventId: ev || '' };
}

// 留言文字長度：和 5.5（Python len，逐個字碼計算）相同；規則端用 JavaScript 字串長度（UTF-16），表情符號會算 2，
// 所以前台用 UTF-16 長度檢查，避免「前台說可以、規則拒絕」。
export const textLength = (s) => String(s).length;

/**
 * 發文。回傳 { updates, mid, turnedIds, hw }。
 * input：{ text, receiver, theme, anonymous, photo: { id, dataUrl, w, h } | null }
 * ctx：{ now（估計的伺服器時間）, mid（留言 ID）, slots: { qd, qm, qe }（我的額度格子） }
 */
export function buildCreateMessage(store, input, ctx) {
  const text = R.cleanText(input.text);
  const receiver = R.cleanText(input.receiver, false).replace(/[,\s]+$/, '') || '大家';
  const theme = input.theme || 'theme-classic';
  const anonymous = !!input.anonymous;
  const photo = input.photo || null;
  const now = ctx.now, me = store.meId, mid = ctx.mid;
  if (!me) throw new WallError(403, 'NOT_ON_LIST', '感謝牆只開放給通訊錄上的同事；如果你應該在名單上，請聯絡管理員。');
  const d = validateNewMessage(store, { text, receiver, theme, anonymous, hasImage: !!photo }, now);
  const ri = store.resolveReceivers(receiver);
  const msg = { t: TS, md: d.mode, r: receiver, x: text, th: theme, lv: d.level, b: d.bucket };
  if (d.mode === 'named') { msg.a = me; msg.an = store.nameOf(me); }
  if (d.mode === 'mask') msg.mk = d.mask;
  if (ri.length) msg.ri = Object.fromEntries(ri.map(u => [u, true]));
  if (photo) msg.im = photo.id;
  if (d.eventId) msg.ev = d.eventId;

  const up = {};
  const mine = { t: TS, b: d.bucket };
  if (!store.isAdmin) {
    const slots = ctx.slots || {};
    const exists = (m) => !!m && store.messages.has(m);
    if (d.bucket === 'regular') {
      const today = R.tpeDayNumber(now);
      const qd = freeSlot(slots.qd, K.QUOTA.daily, s => s.d < today || !exists(s.m));
      const qm = freeSlot(slots.qm, K.QUOTA.monthly, s => s.t < now - K.QUOTA.window_days * R.DAY_MS - MARGIN || !exists(s.m));
      if (qd === null || qm === null) throw new WallError(429, 'QUOTA', qd === null ? '今天的感謝額度用完了，明天再來分享吧！' : '你在過去 30 天內已經送出 30 則感謝，達上限囉！請過幾天再來分享吧！');
      mine.qd = qd; mine.qm = qm;
      up[`qd/${me}/${qd}`] = { d: today, m: mid };
      up[`qm/${me}/${qm}`] = { t: TS, m: mid };
    } else {
      const qe = freeSlot(slots.qe, K.QUOTA.event_extra, s => s.e !== d.eventId || !exists(s.m));
      if (qe === null) throw new WallError(429, 'QUOTA', '你的一般額度和活動加碼都用完了，請過幾天再來分享吧！');
      mine.qe = qe;
      up[`qe/${me}/${qe}`] = { e: d.eventId, m: mid };
    }
  }
  up[`messages/${mid}`] = msg;
  up[`msgAuthor/${mid}`] = me;
  up[`mine/${me}/${mid}`] = mine;
  up[`rl/${me}`] = TS;
  if (d.bucket === 'regular') { up[`stats/${me}/exp`] = store.exp() + 1; up[`stats/${me}/lm`] = mid; }
  if (photo) up[`photos/${photo.id}`] = { d: photo.dataUrl, m: mid, ...(photo.w ? { w: photo.w } : {}), ...(photo.h ? { h: photo.h } : {}) };
  let turnedIds = [], hw = null;
  if (theme === K.THEME_HW && R.hwActive(now)) {
    // 送出就變身（卓倫 2026-10-27）：卡片上所有還是人類、在通訊錄裡的收件人，和留言同一次寫入（一起成功或一起失敗）
    [turnedIds] = store.tagPlan(me, store.cardTargets(receiver, ri));
    for (const u of turnedIds) up[`hw/inf/${u}`] = { c: 'tagged', s: mid, t: TS, id: randomId('inf', now) };
    hw = { turned: turnedIds.map(u => store.nameOf(u)) };
  }
  return { updates: up, mid, turnedIds, hw, bucket: d.bucket, text, receiver, theme, mode: d.mode };
}

export function buildEditMessage(store, mid, newText, now) {
  void now;
  const m = store.messages.get(mid);
  if (!ID_RE.test(mid) || !m) throw new WallError(404, 'NOT_FOUND', '這張卡片已經不在了。');
  if (!store.isMine(m)) throw new WallError(403, 'NOT_OWNER', '只能修改或刪除自己寫的卡片。');
  const text = R.cleanText(newText);
  const limit = R.maxLength(store.level(), store.isAdmin);
  if (!text && !m.image) throw new WallError(400, 'EMPTY', '請先寫下感謝內容。');
  if (textLength(text) > limit) throw new WallError(400, 'TOO_LONG', `內容超過 ${limit} 字的上限。`);
  if (text === m.text) return null;
  return { [`messages/${mid}/x`]: text, [`messages/${mid}/ed`]: true };
}

// raw：這則留言在資料庫裡原本的內容（刪除時原樣搬到 trash，管理員才能在「已刪除」看到、必要時復原）
export function buildDeleteMessage(store, mid, raw) {
  const m = store.messages.get(mid);
  if (!ID_RE.test(mid) || !m || !raw) throw new WallError(404, 'NOT_FOUND', '這張卡片已經不在了。');
  if (!store.isMine(m)) throw new WallError(403, 'NOT_OWNER', '只能修改或刪除自己寫的卡片。');
  const me = store.meId;
  const up = { [`messages/${mid}`]: null, [`trash/${mid}`]: { ...raw, del: { by: 'author', at: TS } }, [`mine/${me}/${mid}`]: null };
  if (raw.b === 'regular') { up[`stats/${me}/exp`] = Math.max(0, store.exp() - 1); up[`stats/${me}/lm`] = mid; }
  return up;
}

export function buildLike(store, mid, want) {
  const m = store.messages.get(mid);
  if (!ID_RE.test(mid) || !m) throw new WallError(404, 'NOT_FOUND', '這張卡片已經不在了。');
  if (!store.isAdmin && store.level() < 2) throw locked('先留下至少一篇感謝，就能解鎖按讚囉！');
  if (m.likes.includes(store.meId) === want) return null;
  return { [`messages/${mid}/lk/${store.meId}`]: want ? TS : null };
}

export function buildSelfInfection(store, cause, sourceMid, now) {
  const me = store.meId;
  if (!R.hwActive(now) || store.hw.inf[me]) return null;
  const v = { c: cause, t: TS, id: randomId('inf', now) };
  if (sourceMid) v.s = sourceMid;
  return { [`hw/inf/${me}`]: v };
}

export function buildPref(store, key, value) {
  if (!K.PREF_KEYS.includes(key) || (typeof value !== 'string' && typeof value !== 'number') || typeof value === 'boolean') {
    throw new WallError(400, 'BAD_REQUEST', '送出的資料格式不正確，請重新整理頁面後再試一次。');
  }
  value = R.cleanText(String(value), false).slice(0, K.LIMITS.pref_value_max);
  if (key === 'lb_hidden' && !['1', '0', ''].includes(value)) throw new WallError(400, 'BAD_REQUEST', '送出的資料格式不正確，請重新整理頁面後再試一次。');
  const me = store.meId;
  if ((store.prefs[key] ?? '') === value && key !== 'lb_hidden') return null;
  const up = { [`prefs/${me}/${key}`]: value };
  if (key === 'lb_hidden') up[`lbh/${me}`] = value === '1' ? true : null;
  return up;
}

// ---------------------------------------------------------------- 後台（只有管理員寫得進去；規則另外檢查）
export function auditEntry(now, { actor, action, targetType, targetId, detail }) {
  return [`audit/${randomId('a', now)}`, { at: TS, actor: actor || 'system', role: 'admin', action, tt: targetType, tid: targetId || 'none', detail: JSON.stringify(detail || {}) }];
}

export function buildAdminDelete(admin, mid, raw, reason, now) {
  reason = R.cleanText(reason, false);
  if (!reason) throw new WallError(400, 'REASON_REQUIRED', '請填寫刪除原因。');
  if (reason.length > K.LIMITS.reason_max) throw new WallError(400, 'TOO_LONG', '刪除原因最多 200 字。');
  if (!raw) throw new WallError(404, 'NOT_FOUND', '這張卡片已經不在了。');
  const author = admin.msgAuthor[mid] || raw.a || '';
  const up = { [`messages/${mid}`]: null, [`trash/${mid}`]: { ...raw, del: { by: 'admin', at: TS, reason, actor: admin.meId || 'admin' } } };
  if (author) {
    up[`mine/${author}/${mid}`] = null;
    if (raw.b === 'regular') up[`stats/${author}/exp`] = Math.max(0, (Number(admin.statsOf(author)) || 0) - 1);
  }
  const [k, v] = auditEntry(now, { actor: admin.meId, action: 'admin.message.delete', targetType: 'message', targetId: mid });
  up[k] = v;
  return up;
}

export function buildAdminRestore(admin, mid, trashed, now) {
  if (!trashed) throw new WallError(404, 'NOT_FOUND', '這張卡片已經不在了。');
  if (!trashed.del || trashed.del.by !== 'admin') throw new WallError(409, 'CONFLICT', '這張卡片是作者自己刪除的，不能復原。');
  const { del, ...raw } = trashed;
  void del;
  const author = admin.msgAuthor[mid] || raw.a || '';
  const up = { [`messages/${mid}`]: raw, [`trash/${mid}`]: null };
  if (author) {
    up[`mine/${author}/${mid}`] = { t: raw.t, b: raw.b || 'regular' };
    if ((raw.b || 'regular') === 'regular') up[`stats/${author}/exp`] = (Number(admin.statsOf(author)) || 0) + 1;
  }
  const [k, v] = auditEntry(now, { actor: admin.meId, action: 'admin.message.restore', targetType: 'message', targetId: mid });
  up[k] = v;
  return up;
}

export function newUserId() {
  const a = new Uint8Array(5); globalThis.crypto.getRandomValues(a);
  return 'u_' + Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

/** 通訊錄差異（和 5.5 diff_contacts 相同）：users 是 [{ user_id, email, name, info, status }] */
export function diffContacts(contacts, users, ownerEmails = K.OWNER_EMAILS) {
  const byEmail = new Map(users.filter(u => u.email).map(u => [u.email.toLowerCase(), u]));
  const changes = []; let unchanged = 0;
  const pasted = new Set(contacts.map(c => c.email));
  for (const c of contacts) {
    const u = byEmail.get(c.email);
    if (!u) changes.push({ kind: 'add', email: c.email, name: c.name, info: c.info });
    else if (u.status === 'blocked') unchanged++;
    else if (u.status !== 'active' || u.name !== c.name || u.info !== c.info) changes.push({ kind: 'update', email: c.email, name: c.name, info: c.info, user_id: u.user_id });
    else unchanged++;
  }
  for (const [email, u] of byEmail) {
    if (!pasted.has(email) && u.status === 'active' && !ownerEmails.includes(email)) changes.push({ kind: 'remove', email, name: u.name, info: u.info, user_id: u.user_id });
  }
  return { changes, unchanged };
}

export function buildContactsApply(admin, changes, now, summary) {
  const up = {};
  for (const ch of changes) {
    const ek = R.emailKey(ch.email);
    if (!ek) continue;                                   // Email 含資料庫不允許的字元：略過（預覽時已列為無效）
    if (ch.kind === 'add') {
      const uid = admin.userIdByEmail(ch.email) || newUserId();
      up[`people/${uid}`] = { n: ch.name, s: 'active' };
      up[`users/${uid}`] = { e: ch.email, i: ch.info || '', at: TS, by: admin.meId || 'admin', src: 'admin_import' };
      up[`allow/${ek}`] = { u: uid };
      if (admin.statsOf(uid) === null) up[`stats/${uid}/exp`] = 0;
    } else if (ch.kind === 'update') {
      up[`people/${ch.user_id}`] = { n: ch.name, s: 'active' };
      up[`users/${ch.user_id}/i`] = ch.info || '';
      up[`users/${ch.user_id}/at`] = TS;
      up[`users/${ch.user_id}/by`] = admin.meId || 'admin';
      up[`users/${ch.user_id}/src`] = 'admin_import';
    } else if (ch.kind === 'remove') {
      up[`people/${ch.user_id}/s`] = 'removed';
      up[`users/${ch.user_id}/at`] = TS;
      up[`users/${ch.user_id}/src`] = 'admin_import';
    }
  }
  const [k, v] = auditEntry(now, { actor: admin.meId, action: 'admin.contacts.apply', targetType: 'contacts', targetId: 'contacts', detail: summary });
  up[k] = v;
  return up;
}

const VERSION_RE = /^\d+(\.\d+){0,3}$/;
export function buildSettings(admin, body, current, now) {
  const limits = { mainTitle: K.LIMITS.main_title_max, subTitle: K.LIMITS.sub_title_max, appVersion: K.LIMITS.app_version_max };
  const names = { mainTitle: '標題', subTitle: '副標題', appVersion: '版號' };
  const updates = {};
  for (const [key, limit] of Object.entries(limits)) {
    if (key in body) {
      const v = R.cleanText(body[key], false);
      if (v.length > limit) throw new WallError(400, 'TOO_LONG', `${names[key]}太長了（上限 ${limit} 字）。`);
      updates[key] = v;
    }
  }
  if ('appVersion' in updates && !VERSION_RE.test(updates.appVersion)) throw new WallError(400, 'BAD_VERSION', '系統版號格式不正確，請填像 5.0 這樣的數字。');
  if (!Object.keys(updates).length) throw new WallError(400, 'BAD_REQUEST', '沒有要修改的設定。');
  const changed = Object.keys(updates).filter(k => (current || {})[k] !== updates[k]);
  if (!changed.length) return null;
  const up = Object.fromEntries(changed.map(k => [`settings/${k}`, updates[k]]));
  const [k, v] = auditEntry(now, { actor: admin.meId, action: 'admin.settings.update', targetType: 'settings', targetId: 'settings', detail: { keys: changed.sort() } });
  up[k] = v;
  return up;
}
