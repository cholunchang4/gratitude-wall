// 前台的「伺服器」：5.5 的 app.js 原本呼叫 Posit 的 api/...，這裡改成直接讀寫 Firebase Realtime Database，
// 回應形狀和 5.5 一樣（所以畫面程式幾乎不用改）。即時更新用資料庫的監聽，取代 5.5 的 SSE。
//
// 寫入一律是「一次多路徑更新」，database.rules.json 在伺服器端檢查身分、等級、額度、字數、主題、萬聖規則；
// 這裡先用同一套規則（writes.js／logic.js）檢查，給同事看得懂的提示。
import { ref, onValue, update, get } from '../../vendor/firebase-sdk.js';
import { WallStore } from './store.js';
import * as W from './writes.js';
import * as R from './logic.js';
import { K } from './constants.js';

const WRITE_TIMEOUT_MS = 20000;
const PHOTO_MAX_CHARS = 2_000_000;

export class WallBackend {
  constructor(session) {
    this.db = session.db;
    this.s = new WallStore();
    this.s.meId = session.meId; this.s.isAdmin = !!session.isAdmin; this.s.email = session.email;
    this.offset = 0;
    this.raw = {};                       // 留言在資料庫裡的原始內容（刪除時原樣搬到 trash）
    this.slots = { qd: {}, qm: {}, qe: {} };
    this.handlers = new Set();
    this.ready = null;
    this.pending = new Map();            // request_id → 進行中的寫入（同一個請求重送時不重複寫）
    this.selfInfect = false;
    this.photoQueue = []; this.photoBusy = 0; this.photoWanted = new Set();
  }
  now() { return Date.now() + this.offset; }
  on(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
  emit(type, data) { for (const h of this.handlers) { try { h(type, data); } catch (e) { console.error(e); } } }

  // ------------------------------------------------------------ 監聽
  start() {
    if (this.ready) return this.ready;
    const me = this.s.meId;
    const nodes = {
      people: 'people', messages: 'messages', settings: 'settings', hw: 'hw', lbh: 'lbh',
      mine: `mine/${me}`, stats: `stats/${me}`, prefs: `prefs/${me}`, qd: `qd/${me}`, qm: `qm/${me}`, qe: `qe/${me}`,
    };
    const first = {};
    const waits = Object.entries(nodes).map(([key, path]) => new Promise((resolve, reject) => {
      onValue(ref(this.db, path), (snap) => {
        const v = snap.val();
        if (!first[key]) { first[key] = true; this.apply(key, v, false); resolve(); }
        else this.apply(key, v, true);
      }, (err) => { if (!first[key]) reject(err); else this.emit('resync', {}); });
    }));
    onValue(ref(this.db, '.info/serverTimeOffset'), (snap) => { this.offset = Number(snap.val()) || 0; });
    this.ready = Promise.all(waits).then(() => { this.queuePhotos(); });
    return this.ready;
  }

  apply(key, v, live) {
    const s = this.s;
    switch (key) {
      case 'people': s.setPeople(v); if (live && s.meId && !(v && v[s.meId] && v[s.meId].s === 'active') && !s.isAdmin) location.reload(); break;
      case 'messages': this.applyMessages(v || {}, live); break;
      case 'settings': s.setSettings(v); if (live) this.emit('settings.changed', { settings: R.settingsDto(v) }); break;
      case 'hw': this.applyHw(v || {}, live); break;
      case 'lbh': s.setLbh(v); break;
      case 'mine': s.setMine(v); if (live) this.meChanged(); break;
      case 'stats': s.setStats(v); if (live) this.meChanged(); break;
      case 'prefs': s.setPrefs(v); break;
      case 'qd': case 'qm': case 'qe': this.slots[key] = v || {}; break;
      default: break;
    }
  }
  applyMessages(v, live) {
    const before = this.raw;
    this.raw = v;
    this.s.setMessages(v);
    if (!live) return;
    const now = this.now();
    for (const [id, raw] of Object.entries(v)) {
      const old = before[id];
      const m = this.s.messages.get(id);
      if (!m) continue;
      if (!old) { this.emit('message.created', { message: this.s.messageDto(m) }); if (m.image) this.wantPhoto(m.image, true); continue; }
      const { lk: lkNew, ...restNew } = raw, { lk: lkOld, ...restOld } = old;
      if (JSON.stringify(restNew) !== JSON.stringify(restOld)) this.emit('message.updated', { id, message: this.s.messageDto(m) });
      else if (JSON.stringify(lkNew || {}) !== JSON.stringify(lkOld || {})) {
        const d = this.s.messageDto(m);
        this.emit('reaction.changed', { id, like_count: d.like_count, likers: d.likers, liked_by_me: d.liked_by_me });
      }
    }
    for (const id of Object.keys(before)) if (!(id in v)) this.emit('message.deleted', { id });
    void now;
  }
  applyHw(v, live) {
    const s = this.s, me = s.meId;
    const wasInfected = !!s.hw.inf[me], before = s.infectedCount();
    s.setHw(v);
    if (!live) return;
    const n = s.infectedCount();
    this.emit('hw.changed', { infected_count: n, elite_count: s.eliteCount(), stage: R.hwStage(n) });
    if (n !== before && s.canSeeRoster(this.now())) this.emit('hw.roster.changed', { remaining: s.rosterBase().filter(h => h.user_id !== me).length });
    if (!wasInfected && s.hw.inf[me]) {
      const cause = s.hw.inf[me].c;
      if (this.selfInfect) this.meChanged();                                       // 自己點開萬聖卡／始祖：動畫由回應觸發
      else this.emit('me.changed', { me: s.meDto(this.now(), { cause: cause === 'tagged' ? 'tagged' : cause }) });
    } else this.meChanged();
  }
  meChanged() {
    clearTimeout(this.meTimer);
    this.meTimer = setTimeout(() => this.emit('me.changed', { me: this.s.meDto(this.now()) }), 60);
  }

  // ------------------------------------------------------------ 照片（只在需要時下載，下載過的存在這台電腦，不重複下載）
  queuePhotos() {
    const cur = R.tpeMonthStart(this.now());
    const ids = this.s.visibleSorted().filter(m => m.image).sort((a, b) => Number(b.created_at >= cur) - Number(a.created_at >= cur)).map(m => m.image);
    for (const id of ids) this.wantPhoto(id, false);
  }
  wantPhoto(id, urgent) {
    if (!W.ID_RE.test(id) || this.s.photos.has(id) || this.photoWanted.has(id)) return;
    this.photoWanted.add(id);
    if (urgent) this.photoQueue.unshift(id); else this.photoQueue.push(id);
    this.pumpPhotos();
  }
  async pumpPhotos() {
    while (this.photoBusy < 2 && this.photoQueue.length) {
      const id = this.photoQueue.shift();
      this.photoBusy++;
      this.loadPhoto(id).finally(() => { this.photoBusy--; this.pumpPhotos(); });
    }
  }
  async loadPhoto(id) {
    let d = await photoCache.get(id);
    if (!d) {
      try { const snap = await get(ref(this.db, `photos/${id}/d`)); d = snap.val(); } catch (e) { d = null; }
      if (typeof d === 'string' && K.PHOTO_PREFIXES.some(p => d.startsWith(p))) photoCache.put(id, d); else d = null;
    }
    if (!d) return;
    this.s.photos.set(id, d);
    for (const m of this.s.messages.values()) if (m.image === id) this.emit('message.updated', { id: m.id, message: this.s.messageDto(m) });
  }

  // ------------------------------------------------------------ API（路徑和 5.5 相同）
  async call(method, path, body) {
    await this.start();
    const u = new URL(path, 'http://x/');
    const p = u.pathname.replace(/^\//, '');
    const now = this.now();
    const s = this.s;
    if (method === 'GET') {
      if (p === 'api/bootstrap') return this.bootstrap();
      if (p === 'api/changes') return { version: 0, events: [] };
      if (p === 'api/directory') return s.directory(u.searchParams.get('q') || '');
      if (p === 'api/leaderboard') return s.leaderboard(now);
      if (p === 'api/leaderboard/monthly') return s.monthlyLeaderboard(now);
      if (p === 'api/hw/roster') { this.requireRoster(now); return s.roster(now); }
      throw new W.WallError(404, 'NOT_FOUND', '找不到這個功能。');
    }
    body = body || {};
    if (p === 'api/hw/tag-preview') {
      this.requireRoster(now);
      if (typeof body.receiver !== 'string') throw new W.WallError(400, 'BAD_REQUEST', '送出的資料格式不正確，請重新整理頁面後再試一次。');
      const receiver = R.cleanText(body.receiver, false).replace(/[,\s]+$/, '').slice(0, K.LIMITS.receiver_max);
      const [turn] = s.tagPlan(s.meId, s.cardTargets(receiver));
      return { turn: turn.map(x => s.nameOf(x)) };
    }
    if (p === 'api/hw/open-card') return this.openCard(body.message_id);
    if (p === 'api/me/prefs') {
      const up = W.buildPref(s, body.key, body.value);
      if (up) await this.write(up);
      return { prefs: s.meDto(this.now()).prefs };
    }
    const rid = typeof body.request_id === 'string' ? body.request_id : null;
    if (rid && this.pending.has(rid)) return this.pending.get(rid);
    const work = this.dispatchWrite(p, body);
    if (rid) { this.pending.set(rid, work); work.catch(() => this.pending.delete(rid)); setTimeout(() => this.pending.delete(rid), 600000); }
    return work;
  }
  async dispatchWrite(p, body) {
    const s = this.s;
    if (p === 'api/messages') return this.createMessage(body);
    const m = /^api\/messages\/([A-Za-z0-9_-]{1,64})\/(edit|delete|like)$/.exec(p);
    if (!m) throw new W.WallError(404, 'NOT_FOUND', '找不到這個功能。');
    const [, mid, action] = m;
    if (action === 'edit') {
      const up = W.buildEditMessage(s, mid, body.text, this.now());
      if (up) await this.write(up);
      return { message: s.messageDto(s.messages.get(mid)) };
    }
    if (action === 'delete') {
      await this.write(W.buildDeleteMessage(s, mid, this.raw[mid]));
      return { id: mid, deleted: true, me: s.meDto(this.now()) };
    }
    if (typeof body.liked !== 'boolean') throw new W.WallError(400, 'BAD_REQUEST', '送出的資料格式不正確，請重新整理頁面後再試一次。');
    const up = W.buildLike(s, mid, body.liked);
    if (up) await this.write(up);
    const d = s.messageDto(s.messages.get(mid));
    return { id: mid, like_count: d.like_count, likers: d.likers, liked_by_me: d.liked_by_me };
  }

  async bootstrap() {
    const s = this.s, now = this.now();
    let just = null;
    if (R.hwActive(now) && !s.hw.inf[s.meId] && s.progenitorIds().includes(s.meId)) {   // 始祖第一次開頁：變身
      const up = W.buildSelfInfection(s, 'progenitor', '', now);
      if (up) {
        this.selfInfect = true;
        try { await this.write(up); just = { cause: 'progenitor' }; } catch (e) { /* 這次寫不進去：下次開頁再判斷 */ } finally { this.selfInfect = false; }
      }
    }
    return s.bootstrap(this.now(), { justInfected: just });
  }
  requireRoster(now) {
    if (R.hwActive(now)) { if (this.s.canSeeRoster(now)) return; throw new W.WallError(403, 'HW_ROSTER_LOCKED', '你還是人類，看不見這本名冊。等你也被一張萬聖卡找到，或自己點開一張萬聖卡，名冊就會交到你手上。'); }
    if (now < R.HW.start) throw new W.WallError(403, 'HW_ROSTER_LOCKED', '月亮還沒升起，夜巡還沒開始。萬聖夜到來時，名冊會交到吸血鬼手上。');
    throw new W.WallError(403, 'HW_ROSTER_LOCKED', '天亮了，萬聖夜已經結束。夜巡名冊跟著月光收了起來，明年同一個夜晚再見。');
  }
  async openCard(mid) {
    const s = this.s, now = this.now();
    if (typeof mid !== 'string' || !W.ID_RE.test(mid)) throw new W.WallError(400, 'BAD_REQUEST', '送出的資料格式不正確，請重新整理頁面後再試一次。');
    const m = s.messages.get(mid);
    if (!m) throw new W.WallError(404, 'NOT_FOUND', '這張卡片已經不在了。');
    let infected = false;
    if (R.hwActive(now) && !s.hw.inf[s.meId] && m.theme === K.THEME_HW) {
      const up = W.buildSelfInfection(s, 'opened_card', mid, now);
      if (up) { this.selfInfect = true; try { await this.write(up); infected = true; } finally { this.selfInfect = false; } }
    }
    return { infected_now: infected, me: s.meDto(this.now(), infected ? { cause: 'opened_card' } : null) };
  }

  async createMessage(body) {
    const s = this.s;
    const theme = body.theme || 'theme-classic', anonymous = body.anonymous ?? false, image = body.image_data_url ?? null;
    if (typeof theme !== 'string' || typeof anonymous !== 'boolean' || !(image === null || typeof image === 'string')) {
      throw new W.WallError(400, 'BAD_REQUEST', '送出的資料格式不正確，請重新整理頁面後再試一次。');
    }
    const input = { text: body.text, receiver: body.receiver, theme, anonymous, photo: null };
    // 先用目前狀態檢查（不通過就不用處理照片）
    W.validateNewMessage(s, { text: R.cleanText(body.text), receiver: R.cleanText(body.receiver, false), theme, anonymous, hasImage: !!image }, this.now());
    if (image) {
      const c = await compressImage(image);
      input.photo = { id: W.randomId('p', this.now()), dataUrl: c.dataUrl, w: c.w, h: c.h };
    }
    const mid = W.randomId('m', this.now());
    let plan;
    for (let attempt = 0; ; attempt++) {
      plan = W.buildCreateMessage(s, input, { now: this.now(), mid, slots: this.slots });
      try { await this.write(plan.updates); break; }
      catch (e) {
        // 被規則拒絕最常見的原因：3 秒內連發兩則、或另一個分頁剛好也在發文（經驗值、額度格子變了）。等一下用最新狀態再試一次。
        if (e.code !== 'DENIED' || attempt >= 1) throw e;
        await new Promise(r => setTimeout(r, K.POST_INTERVAL_MS + 300));
      }
    }
    if (input.photo) { this.s.photos.set(input.photo.id, input.photo.dataUrl); photoCache.put(input.photo.id, input.photo.dataUrl); }
    const m = s.messages.get(mid);
    return { message: m ? s.messageDto(m) : null, me: s.meDto(this.now()), hw: plan.hw };
  }

  async write(updates) {
    let timer;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new W.WallError(0, 'NETWORK', '網路好像斷了，請檢查網路後再試一次。')), WRITE_TIMEOUT_MS); });
    try { await Promise.race([update(ref(this.db), updates), timeout]); }
    catch (e) {
      if (e instanceof W.WallError) throw e;
      if (/permission/i.test(String((e && (e.code || e.message)) || ''))) {
        throw new W.WallError(403, 'DENIED', '這個操作沒有成功：可能是資料剛剛有變動，或你沒有這個權限。請重新整理頁面後再試一次。');
      }
      throw new W.WallError(503, 'WRITE_FAILED', '暫時存不進去，請稍後再試一次。');
    } finally { clearTimeout(timer); }
  }
}

// ---------------------------------------------------------------- 照片壓縮（在瀏覽器重新編碼：去掉 EXIF／GPS、縮到 1600px、轉 WebP）
export async function compressImage(dataUrl) {
  const okPrefix = ['data:image/png;base64,', 'data:image/jpeg;base64,', 'data:image/jpg;base64,', 'data:image/webp;base64,', 'data:image/gif;base64,'];
  if (typeof dataUrl !== 'string' || !okPrefix.some(p => dataUrl.startsWith(p))) throw new W.WallError(400, 'BAD_IMAGE', '圖片格式不支援，請改用 PNG、JPG 或 WebP。');
  if (dataUrl.length > 2_100_000) throw new W.WallError(413, 'IMAGE_TOO_LARGE', '圖片太大了（上限約 1.5MB），請先縮小再上傳。');
  const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new W.WallError(400, 'BAD_IMAGE', '看不懂這張圖片，請換一張試試。')); i.src = dataUrl; });
  if (img.naturalWidth * img.naturalHeight > 40_000_000) throw new W.WallError(400, 'BAD_IMAGE', '圖片的像素太多了，請先縮小再上傳。');
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  for (const q of [0.72, 0.55, 0.4, 0.3]) {
    g.clearRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
    let out = c.toDataURL('image/webp', q);
    if (!out.startsWith('data:image/webp')) {                        // 舊版 Safari 不會輸出 WebP：改 JPEG（先鋪白底）
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      out = c.toDataURL('image/jpeg', q);
    }
    if (out.length <= PHOTO_MAX_CHARS) return { dataUrl: out, w, h };
  }
  throw new W.WallError(413, 'IMAGE_TOO_LARGE', '圖片太大了（上限約 1.5MB），請先縮小再上傳。');
}

// ---------------------------------------------------------------- 照片快取（IndexedDB；照片不會改，所以不會過期。無痕模式等不能用時就每次下載）
const photoCache = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((resolve) => {
    try {
      const r = indexedDB.open('wall-photos', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('p');
      r.onsuccess = () => resolve(r.result); r.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  }));
  const tx = async (mode, fn) => { const d = await open(); if (!d) return null; return new Promise((resolve) => {
    try { const t = d.transaction('p', mode); const req = fn(t.objectStore('p')); t.oncomplete = () => resolve(req ? req.result : null); t.onerror = () => resolve(null); } catch (e) { resolve(null); }
  }); };
  return { get: (id) => tx('readonly', st => st.get(id)), put: (id, v) => tx('readwrite', st => { st.put(v, id); return null; }) };
})();
