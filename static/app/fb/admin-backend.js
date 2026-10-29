// 後台的「伺服器」：把 5.5 後台呼叫的 api/admin/... 對應到 Firebase Realtime Database。
// 只有管理員讀得到這些節點（database.rules.json：根目錄只開放管理員讀取），一般同事打開這一頁也讀不到資料。
import { ref, onValue, update, get } from '../../vendor/firebase-sdk.js';
import { WallStore, normalizeMessage, PHOTO_PLACEHOLDER } from './store.js';
import * as W from './writes.js';
import * as R from './logic.js';
import { K } from './constants.js';

const PREVIEW_TTL_MS = 30 * 60000;
const LARGE_REMOVAL_MIN = 20, LARGE_REMOVAL_SHARE = 0.5;

export class AdminBackend {
  constructor(session) {
    this.db = session.db; this.session = session;
    this.meId = session.meId; this.email = session.email;
    this.offset = 0; this.connected = false; this.lastChangeAt = null;
    this.d = { people: {}, users: {}, allow: {}, admins: {}, messages: {}, trash: {}, msgAuthor: {}, hw: {}, settings: {}, stats: {}, audit: {}, lbh: {} };
    this.photos = new Map(); this.photoWanted = new Set();
    this.listeners = new Set(); this.previews = new Map(); this.ready = null;
  }
  now() { return Date.now() + this.offset; }
  onChange(fn) { this.listeners.add(fn); }
  changed() { this.lastChangeAt = this.now(); for (const f of this.listeners) { try { f(); } catch (e) { console.error(e); } } }
  start() {
    if (this.ready) return this.ready;
    const first = {};
    const waits = Object.keys(this.d).map((key) => new Promise((resolve, reject) => {
      onValue(ref(this.db, key), (snap) => {
        this.d[key] = snap.val() || {};
        if (!first[key]) { first[key] = true; resolve(); } else this.changed();
      }, (err) => { if (!first[key]) reject(err); });
    }));
    onValue(ref(this.db, '.info/serverTimeOffset'), (s) => { this.offset = Number(s.val()) || 0; });
    onValue(ref(this.db, '.info/connected'), (s) => { this.connected = s.val() === true; });
    this.ready = Promise.all(waits);
    return this.ready;
  }

  // ------------------------------------------------------------ 給 writes.js 用的查詢
  get msgAuthor() { return this.d.msgAuthor; }
  statsOf(uid) { const s = this.d.stats[uid]; return s && typeof s.exp === 'number' ? s.exp : null; }
  userIdByEmail(email) { const a = this.d.allow[R.emailKey(email)]; return a ? a.u : null; }
  usersList() {
    const emailOf = {};
    for (const [ek, a] of Object.entries(this.d.allow)) if (a && a.u) emailOf[a.u] = ek.replace(/,/g, '.');
    return Object.entries(this.d.people).map(([uid, p]) => ({
      user_id: uid, name: p.n, email: ((this.d.users[uid] || {}).e || emailOf[uid] || '').toLowerCase(), info: (this.d.users[uid] || {}).i || '', status: p.s,
    }));
  }
  isAdminEmail(email) { const e = String(email || '').toLowerCase(); return K.OWNER_EMAILS.includes(e) || this.d.admins[R.emailKey(e)] === true; }
  store() {
    const st = new WallStore();
    st.meId = this.meId; st.isAdmin = true;
    st.setPeople(this.d.people); st.setMessages(this.d.messages); st.setHw(this.d.hw); st.setSettings(this.d.settings); st.setLbh(this.d.lbh);
    const mine = {};
    for (const [mid, uid] of Object.entries(this.d.msgAuthor)) if (uid === this.meId && this.d.messages[mid]) mine[mid] = { t: this.d.messages[mid].t, b: this.d.messages[mid].b };
    st.setMine(mine); st.setStats(this.d.stats[this.meId] || { exp: 0 });
    return st;
  }
  wantPhoto(fid) {
    if (!W.ID_RE.test(fid) || this.photos.has(fid) || this.photoWanted.has(fid)) return;
    this.photoWanted.add(fid);
    get(ref(this.db, `photos/${fid}/d`)).then((s) => { const v = s.val(); if (typeof v === 'string' && K.PHOTO_PREFIXES.some(p => v.startsWith(p))) { this.photos.set(fid, v); this.changed(); } }).catch(() => {});
  }

  // ------------------------------------------------------------ 回應組裝（形狀和 5.5 的 api/admin/* 相同）
  adminMessage(id, raw, deleted) {
    const m = normalizeMessage(id, raw, { authorOf: (mid) => this.d.msgAuthor[mid] || '' });
    const u = this.d.people[m.author_id];
    const display = m.mode === 'mask' ? (m.mask || '匿名') : m.mode === 'anonymous' ? '匿名' : m.author_name;
    if (m.image) this.wantPhoto(m.image);
    return {
      id, created_at: m.created_at, receiver: m.receiver, text: m.text, theme: m.theme,
      image_url: m.image ? (this.photos.get(m.image) || PHOTO_PLACEHOLDER) : null,       // 照片下載完成前先放透明圖（附圖統計才會對）
      author_display: display, display_mode: m.mode, author_user_id: m.author_id || 'u_unresolved', author_name: u ? u.n : (m.author_name || ''),
      author_level: m.level, quota_bucket: m.bucket, event_id: m.event_id, like_count: m.likes.length,
      likers: m.likes.map(x => (this.d.people[x] ? this.d.people[x].n : '某位同事')), deleted, deleted_reason: deleted ? (raw.del && raw.del.reason) || '' : '',
      edited: m.edited, legacy: { mooncake: m.mooncake, mooncake_opened: m.mooncake_opened },
    };
  }
  bootstrap() {
    const now = this.now(), st = this.store();
    const msgs = [...Object.entries(this.d.messages).map(([id, v]) => this.adminMessage(id, v, false)),
      ...Object.entries(this.d.trash).map(([id, v]) => this.adminMessage(id, v, true))].sort((a, b) => b.created_at - a.created_at);
    const users = this.usersList().map(u => ({ ...u, connect_bound: false, connect_username: '', is_admin: this.isAdminEmail(u.email) }));
    const inf = this.d.hw.inf || {}, elite = this.d.hw.elite || {};
    const prog = st.progenitorIds();
    const progRows = this.d.hw.prog || {};
    return {
      server: { now, build: 'firebase', version: 0, degraded: false },
      settings: R.settingsDto(this.d.settings), me: st.meDto(now), events: st.eventsDto(now), messages: msgs, users,
      hw2026: {
        infections: Object.entries(inf).map(([uid, r]) => ({ user_id: uid, cause: r.c, source_message_id: r.s || '', at: Number(r.t) || 0 })),
        elite: Object.entries(elite).map(([uid, r]) => ({ user_id: uid, at: Number(r.t) || 0 })),
        progenitors: prog.map((uid, i) => ({ rank: i + 1, user_id: uid, pre_event_count: (progRows[uid] || {}).n || 0 })),
        progenitors_frozen: Object.keys(progRows).length > 0,
      },
    };
  }
  health() {
    return {
      ready: true, firebase_connected: this.connected, server_offset_ms: this.offset, last_change_at: this.lastChangeAt,
      users: Object.keys(this.d.people).length, messages: Object.keys(this.d.messages).length, deleted_messages: Object.keys(this.d.trash).length,
      photos_loaded: this.photos.size, signed_in_as: this.email, env: 'firebase',
    };
  }
  audit(limit = 200) {
    const rows = Object.entries(this.d.audit).map(([id, r]) => ({ id, ...r })).sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0)).slice(0, Math.max(1, Math.min(limit, 1000)));
    return { entries: rows.map(r => ({ at_ms: Number(r.at) || 0, actor_user_id: r.actor || '', actor_name: (this.d.people[r.actor] || {}).n || '', actor_role: r.role || 'admin',
      action: r.action || '', target_type: r.tt || '', target_id: r.tid || '', detail_json: r.detail || '{}', audit_id: r.id, request_id: '' })) };
  }

  // ------------------------------------------------------------ API
  async call(method, path, body) {
    await this.start();
    const u = new URL(path, 'http://x/'), p = u.pathname.replace(/^\//, '');
    if (method === 'GET') {
      if (p === 'api/admin/bootstrap') return this.bootstrap();
      if (p === 'api/admin/health') return this.health();
      if (p === 'api/admin/audit') return this.audit(Number(u.searchParams.get('limit')) || 200);
      throw new W.WallError(404, 'NOT_FOUND', '找不到這個功能。');
    }
    body = body || {};
    const now = this.now();
    let m;
    if ((m = /^api\/admin\/messages\/([A-Za-z0-9_-]{1,64})\/(delete|restore)$/.exec(p))) {
      const mid = m[1];
      if (m[2] === 'delete') {
        if (this.d.trash[mid]) throw new W.WallError(409, 'CONFLICT', '這張卡片已經刪除了。');
        await this.write(W.buildAdminDelete(this, mid, this.d.messages[mid], body.reason, now));
        return { id: mid, deleted: true };
      }
      if (!this.d.trash[mid]) throw new W.WallError(this.d.messages[mid] ? 409 : 404, this.d.messages[mid] ? 'CONFLICT' : 'NOT_FOUND', this.d.messages[mid] ? '這張卡片沒有被刪除。' : '這張卡片已經不在了。');
      await this.write(W.buildAdminRestore(this, mid, this.d.trash[mid], now));
      return { id: mid, restored: true };
    }
    if (p === 'api/admin/contacts/preview') return this.contactsPreview(body.raw);
    if (p === 'api/admin/contacts/apply') return this.contactsApply(body.preview_id);
    if (p === 'api/admin/settings') {
      const up = W.buildSettings(this, body, this.d.settings, now);
      if (up) await this.write(up);
      return { settings: R.settingsDto({ ...this.d.settings }) };
    }
    if (/^api\/admin\/contacts\/[^/]+\/bind$/.test(p)) throw new W.WallError(404, 'NOT_FOUND', 'Firebase 版用 Email 登入，不需要綁定帳號。');
    throw new W.WallError(404, 'NOT_FOUND', '找不到這個功能。');
  }
  contactsPreview(raw) {
    if (typeof raw !== 'string' || !raw.trim()) throw new W.WallError(400, 'NO_CONTACTS', '請先貼上名單資料。');
    let { contacts, invalid } = R.parseContacts(raw);
    const bad = contacts.filter(c => !R.emailKey(c.email));
    contacts = contacts.filter(c => R.emailKey(c.email)); invalid += bad.length;
    if (!contacts.length) throw new W.WallError(400, 'NO_CONTACTS', '沒有辨識到任何有效的 Email。請確認是五行一組、第三行是 Email 的格式。');
    const { changes, unchanged } = W.diffContacts(contacts, this.usersList());
    const counts = { add: 0, update: 0, remove: 0 };
    for (const c of changes) counts[c.kind]++;
    const active = this.usersList().filter(u => u.status === 'active').length;
    const now = this.now();
    for (const [k, v] of this.previews) if (now - v.at > PREVIEW_TTL_MS) this.previews.delete(k);
    const pid = W.randomId('pv', now);
    this.previews.set(pid, { contacts, at: now });
    const order = { add: 0, update: 1, remove: 2 };
    const sample = [...changes].sort((a, b) => order[a.kind] - order[b.kind]).slice(0, 10).map(c => ({ change: c.kind, name: c.name, email: c.email }));
    return { preview_id: pid, ...counts, unchanged, invalid_groups: invalid, large_removal: counts.remove > Math.max(LARGE_REMOVAL_MIN, Math.floor(active * LARGE_REMOVAL_SHARE)), sample };
  }
  async contactsApply(pid) {
    const pv = typeof pid === 'string' ? this.previews.get(pid) : null;
    const now = this.now();
    if (!pv || now - pv.at > PREVIEW_TTL_MS) throw new W.WallError(404, 'PREVIEW_EXPIRED', '預覽已經過期，請重新貼上名單並預覽一次。');
    const { changes, unchanged } = W.diffContacts(pv.contacts, this.usersList());
    const counts = { add: 0, update: 0, remove: 0 };
    for (const c of changes) counts[c.kind]++;
    if (changes.length) await this.write(W.buildContactsApply(this, changes, now, { ...counts, unchanged }));
    this.previews.delete(pid);
    return { added: counts.add, updated: counts.update, removed: counts.remove, unchanged };
  }
  async exportLurkers(mode) {
    if (!['none', 'infected_only'].includes(mode)) throw new W.WallError(400, 'BAD_REQUEST', '篩選條件不正確。');
    const posted = new Set();
    for (const [mid, uid] of Object.entries(this.d.msgAuthor)) if (this.d.messages[mid]) posted.add(uid);
    const inf = this.d.hw.inf || {};
    const label = mode === 'none' ? '從未發文且未變身' : '已變身但從未發文';
    const people = this.usersList().filter(u => u.status === 'active' && !posted.has(u.user_id) && (!!inf[u.user_id] === (mode === 'infected_only')));
    const [k, v] = W.auditEntry(this.now(), { actor: this.meId, action: 'admin.export', targetType: 'export', targetId: mode, detail: { count: people.length, mode } });
    await this.write({ [k]: v });                                         // 先記操作紀錄，記不進去就不給匯出（和 5.5 相同）
    const cell = (x) => { x = String(x ?? ''); x = /^[=+\-@\t\r]/.test(x) ? "'" + x : x; return '"' + x.replace(/"/g, '""') + '"'; };
    const lines = [['姓名', 'Email', '通訊錄備註', '狀態'], ...people.map(u => [u.name, u.email, u.info, label])].map(r => r.map(cell).join(','));
    const blob = new Blob(['\ufeff' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    return { blob, filename: `感謝牆-還沒參與的同事-${R.tpeDateKey(this.now())}.csv` };
  }
  async write(updates) {
    try { await update(ref(this.db), updates); }
    catch (e) {
      if (/permission/i.test(String((e && (e.code || e.message)) || ''))) throw new W.WallError(403, 'DENIED', '資料庫拒絕了這個操作：你可能不是管理員，或資料剛剛有變動。請重新整理後再試。');
      throw new W.WallError(503, 'WRITE_FAILED', '暫時存不進去，請稍後再試一次。');
    }
  }
}
