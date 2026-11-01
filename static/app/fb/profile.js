// T098 個人資料卡＋頭像：讀寫 Firebase（avv／avs／avl／pc）。
//
// 流量設計（RTDB 每月下載免費 10GB，現在約用 8.5GB）：
//  - avv/{uid}（頭像版本號，每人約 30 bytes）整包監聽，知道誰有頭像、什麼時候換過。
//  - 小圖 avs/{uid}（64px，約 3～6KB）只在畫面上真的要顯示那個人時才下載；同一頁面只抓一次，
//    並以「uid＋版本號」存在這台電腦（IndexedDB），版本號沒變就不會再下載。
//  - 大圖 avl/{uid}（192px）、資料卡文字 pc/{uid} 只在打開資料卡時才讀。
// 匿名／假面卡不會呼叫這裡（畫面只對具名卡、而且作者還在通訊錄的人要頭像），所以頭像不會洩漏匿名作者。
import { ref, onValue, get } from '../../vendor/firebase-sdk.js';
import * as PL from './profile-logic.js';

const MAX_PARALLEL = 4;

export class ProfileService {
  /** @param {{ db, meId: string, isAdmin: boolean, isActive: (uid:string)=>boolean, write: (updates:object)=>Promise<void>, now: ()=>number }} o */
  constructor(o) {
    this.db = o.db; this.meId = o.meId; this.isAdmin = !!o.isAdmin;
    this.isActive = o.isActive; this.writeFn = o.write; this.now = o.now || (() => Date.now());
    this.ver = {};                 // uid → 版本號（avv）
    this.small = new Map();        // uid → { t, d }
    this.large = new Map();
    this.wanted = new Set(); this.queue = []; this.busy = 0;
    this.handlers = new Set();
    this.ready = false;
  }
  on(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
  emit(uid) { for (const h of this.handlers) { try { h(uid); } catch (e) { console.error(e); } } }

  start() {
    if (this.started) return; this.started = true;
    onValue(ref(this.db, 'avv'), (snap) => {
      const v = snap.val() || {}, before = this.ver;
      this.ver = {};
      for (const [uid, t] of Object.entries(v)) if (Number.isFinite(Number(t))) this.ver[uid] = Number(t);
      this.ready = true;
      const changed = new Set([...Object.keys(before), ...Object.keys(this.ver)].filter(u => before[u] !== this.ver[u]));
      for (const uid of changed) {
        const t = this.ver[uid];
        if (!t) { this.small.delete(uid); this.large.delete(uid); avatarCache.del(uid); this.emit(uid); continue; }
        const s = this.small.get(uid);
        if (s && s.t === null) {                                    // 我自己剛上傳的：補上版本號、存進快取，不用重新下載
          s.t = t; avatarCache.put('s:' + uid, s);
          const l = this.large.get(uid); if (l && l.t === null) { l.t = t; avatarCache.put('l:' + uid, l); }
          continue;
        }
        if (s && s.t !== t) { this.small.delete(uid); this.large.delete(uid); }
        if (this.wanted.has(uid)) this.enqueue(uid);
      }
      this.emit('*');
    }, () => { /* 讀不到（例如剛被移出通訊錄）：就當大家都沒有頭像 */ });
  }

  hasAvatar(uid) { return !!(uid && this.ver[uid] && this.isActive(uid)); }
  // 畫面要畫某人的小頭像：有就回傳 data URL，沒有（或還沒下載好）回傳 ''，並排進下載佇列；下載好會 emit(uid)
  smallOf(uid) {
    if (!this.hasAvatar(uid)) return '';
    const s = this.small.get(uid);
    if (s && (s.t === null || s.t === this.ver[uid])) return s.d;
    this.want(uid);
    return '';
  }
  want(uid) {
    if (!uid || this.wanted.has(uid)) return;
    this.wanted.add(uid);
    if (this.ready && this.hasAvatar(uid)) this.enqueue(uid);
  }
  enqueue(uid) { if (this.queue.includes(uid)) return; this.queue.push(uid); this.pump(); }
  pump() {
    while (this.busy < MAX_PARALLEL && this.queue.length) {
      const uid = this.queue.shift();
      if (!this.hasAvatar(uid)) continue;
      this.busy++;
      this.loadSmall(uid).finally(() => { this.busy--; this.pump(); });
    }
  }
  async loadSmall(uid) {
    const t = this.ver[uid];
    let hit = await avatarCache.get('s:' + uid);
    if (!(hit && hit.t === t && PL.avatarOk(hit.d, PL.P.avatar_small_max))) {
      hit = null;
      try {
        const v = (await get(ref(this.db, `avs/${uid}`))).val();
        if (v && PL.avatarOk(v.d, PL.P.avatar_small_max)) { hit = { t: Number(v.t) || t, d: v.d }; avatarCache.put('s:' + uid, hit); }
      } catch (e) { hit = null; }
    }
    if (!hit) return;
    this.small.set(uid, hit);
    this.emit(uid);
  }
  // 打開資料卡時才讀的大圖（沒有大圖就用小圖）
  async largeOf(uid) {
    if (!this.hasAvatar(uid)) return '';
    const t = this.ver[uid];
    const m = this.large.get(uid);
    if (m && (m.t === null || m.t === t)) return m.d;
    let hit = await avatarCache.get('l:' + uid);
    if (!(hit && hit.t === t && PL.avatarOk(hit.d, PL.P.avatar_large_max))) {
      hit = null;
      try {
        const v = (await get(ref(this.db, `avl/${uid}`))).val();
        if (v && PL.avatarOk(v.d, PL.P.avatar_large_max)) { hit = { t: Number(v.t) || t, d: v.d }; avatarCache.put('l:' + uid, hit); }
      } catch (e) { hit = null; }
    }
    if (!hit) return this.smallOf(uid);
    this.large.set(uid, hit);
    return hit.d;
  }
  // 讀資料卡文字（null＝沒有寫過）。讀不到（權限、網路）會丟出錯誤
  async card(uid) {
    const v = (await get(ref(this.db, `pc/${uid}`))).val();
    return v ? PL.normalizeCard(v) : null;
  }

  async saveCard(input, { removeAvatar = false } = {}) {
    await this.writeFn(PL.buildSaveCard(this.meId, input, { removeAvatar }));
    if (removeAvatar) this.forget(this.meId);
  }
  async setAvatar(small, large) {
    await this.writeFn(PL.buildSetAvatar(this.meId, small, large));
    const t = this.ver[this.meId] && this.ver[this.meId] > this.now() - 5000 ? this.ver[this.meId] : null;   // 版本號可能比寫入回應先到
    this.small.set(this.meId, { t, d: small }); this.large.set(this.meId, { t, d: large });
    if (t) { avatarCache.put('s:' + this.meId, { t, d: small }); avatarCache.put('l:' + this.meId, { t, d: large }); }
    this.emit(this.meId);
  }
  async removeAvatar() { await this.writeFn(PL.buildRemoveAvatar(this.meId)); this.forget(this.meId); }
  async adminClear(uid, what) {
    if (!this.isAdmin) throw new Error('not admin');
    await this.writeFn(PL.buildAdminClear(this.meId || 'admin', uid, what, this.now()));
    if (what === 'avatar') this.forget(uid);
  }
  forget(uid) { this.small.delete(uid); this.large.delete(uid); avatarCache.del(uid); this.emit(uid); }
}

// ---------------------------------------------------------------- 頭像快取（IndexedDB；無痕模式等不能用時就每次下載）
const avatarCache = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((resolve) => {
    try {
      const r = indexedDB.open('wall-avatars', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('a');
      r.onsuccess = () => resolve(r.result); r.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  }));
  const tx = async (mode, fn) => { const d = await open(); if (!d) return null; return new Promise((resolve) => {
    try { const t = d.transaction('a', mode); const req = fn(t.objectStore('a')); t.oncomplete = () => resolve(req ? req.result : null); t.onerror = () => resolve(null); } catch (e) { resolve(null); }
  }); };
  return {
    get: (k) => tx('readonly', st => st.get(k)),
    put: (k, v) => tx('readwrite', st => { st.put(v, k); return null; }),
    del: (uid) => tx('readwrite', st => { st.delete('s:' + uid); st.delete('l:' + uid); return null; }),
  };
})();
