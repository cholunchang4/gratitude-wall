// 前台的資料快取與回應組裝（純函式＋資料，沒有 Firebase I/O）。
// 把 Realtime Database 讀到的節點整理成 5.5 伺服器 API 的回應形狀（api/bootstrap、api/leaderboard…），
// 所以 app.js 的畫面程式幾乎不用改。對照：5.5 的 server/app/state.py、dto.py、service.py。
//
// 隱私：同事讀得到的 messages 節點裡，匿名卡本來就沒有作者（作者只存在只限管理員的 msgAuthor）。
// 「這張是不是我的」只靠我自己的 mine 節點判斷，別人讀不到。
import { K } from './constants.js';
import * as R from './logic.js';

export function normalizeMessage(id, v, { authorOf } = {}) {
  if (!v || typeof v !== 'object') return null;
  const likes = Object.entries(v.lk || {}).sort((a, b) => (Number(a[1]) || 0) - (Number(b[1]) || 0) || (a[0] < b[0] ? -1 : 1)).map(([u]) => u);
  return {
    id, created_at: Number(v.t) || 0, author_id: v.a || (authorOf ? authorOf(id) : '') || '', author_name: v.an || '',
    mode: v.md || 'named', mask: v.mk || '', receiver: v.r || '', receiver_ids: Object.keys(v.ri || {}), text: v.x || '',
    theme: v.th || 'theme-classic', image: v.im || '', level: Number(v.lv) || 1, bucket: v.b || 'regular', event_id: v.ev || '',
    mooncake: !!(v.lg && v.lg.mc), mooncake_opened: !!(v.lg && v.lg.mo), edited: !!v.ed, likes,
    deleted: !!v.del, deleted_by: v.del ? v.del.by || '' : '', deleted_reason: v.del ? v.del.reason || '' : '',
  };
}

export class WallStore {
  constructor() {
    this.meId = null; this.isAdmin = false; this.email = '';
    this.people = {}; this.messages = new Map(); this.settings = {};
    this.hw = { inf: {}, elite: {}, prog: {}, rewardUntil: null };
    this.lbh = {}; this.mine = {}; this.stats = { exp: 0 }; this.prefs = {};
    this.photos = new Map();          // 照片 ID → data URL（載入後才有）
    this.gen = 0; this._cache = new Map();
  }

  // ------------------------------------------------------------ 載入
  setPeople(v) { this.people = v || {}; this.bump(); }
  setMessages(v) {
    const m = new Map();
    for (const [id, raw] of Object.entries(v || {})) { const n = normalizeMessage(id, raw); if (n) m.set(id, n); }
    this.messages = m; this.bump();
  }
  setHw(v) { v = v || {}; this.hw = { inf: v.inf || {}, elite: v.elite || {}, prog: v.prog || {}, rewardUntil: typeof v.rewardUntil === 'number' ? v.rewardUntil : null }; this.bump(); }
  setSettings(v) { this.settings = v || {}; this.bump(); }
  setLbh(v) { this.lbh = v || {}; this.bump(); }
  setMine(v) { this.mine = v || {}; this.bump(); }
  setStats(v) { this.stats = { exp: Number(v && v.exp) || 0 }; this.bump(); }
  setPrefs(v) { this.prefs = v || {}; this.bump(); }
  bump() { this.gen++; this._cache.clear(); }
  cached(key, fn) { if (!this._cache.has(key)) this._cache.set(key, fn()); return this._cache.get(key); }

  // ------------------------------------------------------------ 使用者
  user(uid) { return this.people[uid] || null; }
  nameOf(uid) { const p = this.people[uid]; return p ? p.n : ''; }
  activeUsers() { return this.cached('active', () => Object.entries(this.people).filter(([, p]) => p && p.s === 'active').map(([uid, p]) => ({ user_id: uid, display_name: p.n }))); }
  validNames() { return this.cached('valid', () => new Set(this.activeUsers().map(u => u.display_name))); }
  rankedNames() {
    return this.cached('ranked', () => {
      const hidden = new Set(this.activeUsers().filter(u => this.lbh[u.user_id] === true).map(u => u.display_name));
      return new Set([...this.validNames()].filter(n => !hidden.has(n)));
    });
  }
  nameIndex() {
    return this.cached('nameIdx', () => {
      const idx = new Map();
      for (const u of this.activeUsers()) { if (!idx.has(u.display_name)) idx.set(u.display_name, []); idx.get(u.display_name).push(u.user_id); }
      return idx;
    });
  }
  resolveReceivers(text) {
    const idx = this.nameIndex(), out = [];
    for (const n of R.splitReceivers(text)) for (const uid of idx.get(n) || []) if (!out.includes(uid)) out.push(uid);
    return out;
  }
  cardTargets(receiverText, receiverIds = []) {
    const out = this.resolveReceivers(receiverText);
    for (const uid of receiverIds) { const u = this.people[uid]; if (u && u.s === 'active' && !out.includes(uid)) out.push(uid); }
    return out;
  }

  // ------------------------------------------------------------ 我
  isMine(m) { return !!(this.meId && (m.author_id === this.meId || this.mine[m.id])); }
  exp() { return this.stats.exp; }
  level() { return R.levelForExp(this.exp()); }
  total() { return Object.keys(this.mine).length; }
  quota(now) {
    const ev = R.activeEvent(now);
    const rows = Object.values(this.mine);
    const regular = rows.filter(r => r.b !== 'event').map(r => Number(r.t) || 0);
    const eventUsed = rows.filter(r => r.b === 'event' && ev && R.eventContains(ev, Number(r.t) || 0)).length;
    return R.computeQuota(regular, eventUsed, now, !!ev);
  }

  // ------------------------------------------------------------ 萬聖
  infectedCount() { return Object.keys(this.hw.inf).length; }
  eliteCount() { return Object.keys(this.hw.elite).length; }
  progenitorIds() {
    return this.cached('prog', () => {
      const frozen = Object.entries(this.hw.prog);
      if (frozen.length) return frozen.sort((a, b) => (a[1].rank || 0) - (b[1].rank || 0)).map(([uid]) => uid);
      const authors = [...this.messages.values()].filter(m => m.created_at < R.HW.start && m.mode === 'named' && m.author_id)
        .sort((a, b) => a.created_at - b.created_at).map(m => m.author_id);
      return R.topProgenitors(authors).map(([uid]) => uid);
    });
  }
  hwRewardFor(uid, now) {
    if (now <= R.HW.end) return null;
    if (!(this.hw.inf[uid] || this.progenitorIds().includes(uid))) return null;
    const exp = this.hw.rewardUntil !== null ? this.hw.rewardUntil : R.hwRewardExpiry(this.infectedCount());
    if (exp === null) return null;
    return exp === R.PERMANENT || now <= exp ? exp : null;
  }
  tagPlan(authorId, targets) {
    const turn = [], already = [];
    for (const uid of targets) {
      const u = this.people[uid];
      if (uid === authorId || !u || u.s !== 'active') continue;
      (this.hw.inf[uid] ? already : turn).push(uid);
    }
    return [turn, already];
  }
  canSeeRoster(now) { return R.hwActive(now) && (this.isAdmin || !!this.hw.inf[this.meId]); }
  hwCardsTo(uid) {
    const name = this.nameOf(uid);
    return [...this.messages.values()].filter(m => m.theme === K.THEME_HW && (m.receiver_ids.includes(uid) || R.splitReceivers(m.receiver).includes(name)))
      .sort((a, b) => b.created_at - a.created_at);
  }
  revealBy(m) {
    if (!m) return { kind: 'gone' };
    if (m.mode === 'named') return { kind: 'named', name: m.author_name };
    return { kind: 'mask', mask_name: m.mode === 'mask' ? (m.mask || null) : null };
  }
  hwReveal() {
    const uid = this.meId, inf = this.hw.inf[uid];
    if (!inf || inf.c !== 'tagged' || (this.prefs.hw2026_reveal_seen || '') === (inf.id || '')) return null;
    const src = inf.s || '';
    const m = this.messages.get(src) || null;
    const by = this.revealBy(m);
    const also = this.hwCardsTo(uid).filter(c => c.id !== src).length;
    return { infection_id: inf.id || '', message_id: by.kind === 'gone' ? null : src, by, also, progenitor: this.progenitorIds().includes(uid) };
  }
  rosterBase() {
    return this.cached('rosterBase', () => {
      const skip = new Set(this.progenitorIds());
      return this.activeUsers().filter(u => !this.hw.inf[u.user_id] && !skip.has(u.user_id))
        .map(u => ({ user_id: u.user_id, name: u.display_name, initials: R.initialsOf(u.display_name), avatar_color: R.avatarColorOf(u.user_id) }));
    });
  }
  namedThanksIndex() {
    return this.cached('thanks', () => {
      const idx = new Map();
      for (const m of this.messages.values()) {
        if (m.mode !== 'named' || !m.author_id) continue;
        for (const uid of this.cardTargets(m.receiver, m.receiver_ids)) {
          if (uid === m.author_id) continue;
          if (!idx.has(uid)) idx.set(uid, new Map());
          const d = idx.get(uid);
          if (m.created_at > (d.get(m.author_id) ?? -1)) d.set(m.author_id, m.created_at);
        }
      }
      return idx;
    });
  }

  // ------------------------------------------------------------ 回應組裝（形狀和 5.5 browser_api_examples.json 相同）
  photoUrl(fid) { return this.photos.get(fid) || PHOTO_PLACEHOLDER; }
  messageDto(m) {
    const anon = m.mode !== 'named';
    const name = m.mode === 'mask' ? (m.mask || '匿名') : anon ? '匿名' : m.author_name;
    let level = m.level;
    if (anon && level >= K.ADMIN_LEVEL) level = 8;                   // 匿名卡不透露「是管理員發的」
    const myName = this.nameOf(this.meId);
    return {
      id: m.id, created_at: m.created_at, receiver: m.receiver, text: m.text, theme: m.theme,
      image_url: m.image ? this.photoUrl(m.image) : null,
      author: { name, anonymous: anon, user_id: anon ? null : m.author_id, avatar_url: null },
      author_level: level, like_count: m.likes.length,
      likers: m.likes.map(u => (this.people[u] ? this.people[u].n : '某位同事')),
      liked_by_me: m.likes.includes(this.meId), is_mine: this.isMine(m),
      to_me: m.receiver_ids.includes(this.meId) || (!!myName && R.splitReceivers(m.receiver).includes(myName)),
      is_admin_card: !anon && m.level >= K.ADMIN_LEVEL, edited: m.edited,
      legacy: { mooncake: m.mooncake, mooncake_opened: m.mooncake_opened },
    };
  }
  meDto(now, justInfected = null) {
    const uid = this.meId, exp = this.exp(), level = R.levelForExp(exp), admin = this.isAdmin;
    const evHw = R.hwActive(now), prog = this.progenitorIds().includes(uid), infected = !!this.hw.inf[uid];
    const reward = this.hwRewardFor(uid, now), reveal = this.hwReveal();
    if (justInfected && justInfected.cause === 'tagged') justInfected = { ...justInfected, reveal };
    const nxt = R.nextLevelExp(exp);
    const name = this.nameOf(uid);
    return {
      user_id: uid, name, initials: R.initialsOf(name), is_admin: admin, level, exp, total: this.total(),
      next_level_at: nxt, to_next_level: nxt === null ? null : nxt - exp, quota: this.quota(now),
      unlocks: {
        like: admin || level >= 2, drag: admin || level >= 3, themes_basic: admin || level >= 4, multi_tag: admin || level >= 5,
        draw: admin || level >= 6, anonymous: admin || level >= 7 || evHw, photo: admin || level >= 8,
        max_length: R.maxLength(level, admin), emoji: R.emojiTier(level, admin), reward_themes: R.rewardThemes(exp),
      },
      prefs: Object.fromEntries(K.PREF_KEYS.map(k => [k, String(this.prefs[k] ?? '')])),
      hw: {
        role: prog ? 'progenitor' : infected ? 'vampire' : 'human', infected, elite: !!this.hw.elite[uid], just_infected: justInfected,
        reveal, reward: reward === null ? null : { theme: K.THEME_HW, expires_at_ms: reward },
      },
    };
  }
  eventsDto(now) {
    const count = this.infectedCount(), active = R.activeEvent(now);
    const out = { active: active ? [active] : [],
      hw2026: { start: R.HW.start, end: R.HW.end, infected_count: count, elite_count: this.eliteCount(), target: R.HW.target || 200, stage: R.hwStage(count) } };
    if (active === 'midautumn2026') out.midautumn2026 = { start: R.MIDAUTUMN.start, end: R.MIDAUTUMN.end };
    if (R.hwEpilogueActive(now)) out.hw2026_epilogue = { start: R.HW_EPILOGUE.start, end: R.HW_EPILOGUE.end, final_count: count, reward_until: R.hwRewardExpiry(count) };
    return out;
  }
  visibleSorted() { return [...this.messages.values()].sort((a, b) => b.created_at - a.created_at); }
  bootstrap(now, { justInfected = null, version = 0, build = '' } = {}) {
    return {
      server: { now, build, version, degraded: false },
      settings: R.settingsDto(this.settings),
      me: this.meDto(now, justInfected),
      events: this.eventsDto(now),
      messages: this.visibleSorted().map(m => this.messageDto(m)),
    };
  }
  directory(q) {
    q = R.cleanText(q, false).slice(0, 50).toLowerCase();
    if (!q) return { names: [] };
    const names = [...new Set(this.activeUsers().map(u => u.display_name).filter(n => n.toLowerCase().includes(q)))]
      .sort((a, b) => (Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q))) || (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0));
    return { names: names.slice(0, 6) };
  }
  leaderboard(now) {
    const msgs = this.visibleSorted().map(m => ({ created_at: m.created_at, named_author: m.mode === 'named' && m.author_name ? m.author_name : null,
      receiver_text: m.receiver, is_event_extra: m.bucket === 'event' }));
    let rd = Number(this.settings.retentionDays); if (!Number.isFinite(rd)) rd = 30;
    return R.computeLeaderboard(msgs, this.rankedNames(), now, rd);
  }
  monthlyLeaderboard(now) {
    const cur = R.tpeMonthStart(now), prev = R.tpePrevMonthStart(now);
    const currentName = (m) => {
      const uid = m.author_id;
      if (!uid) return null;                               // 匿名卡別人看不到作者（只少了「謝自己」的排除，見 README）
      const u = this.people[uid];
      if (!u) return m.author_name || null;
      return u.s === 'active' ? u.n : null;
    };
    const msgs = [];
    for (const m of this.messages.values()) {
      if (!(prev <= m.created_at && m.created_at < cur)) continue;
      const real = currentName(m);
      msgs.push({ created_at: m.created_at, named_author: m.mode === 'named' ? real : null, real_author: real, receiver_text: m.receiver });
    }
    const out = R.computeMonthlyLeaderboard(msgs, this.rankedNames(), prev, cur);
    const idx = this.nameIndex();
    const rows = (lst) => lst.map(([n, , r]) => ({ name: n, rank: r, avatar_color: idx.get(n) ? R.avatarColorOf(idx.get(n)[0]) : null }));
    out.senders = rows(out.senders); out.receivers = rows(out.receivers);
    for (const k of ['senders_more', 'receivers_more']) if (out[k]) out[k] = { rank: out[k].rank, people: out[k].people };
    return { month: R.tpeMonthKey(prev), start: prev, end: cur, current_month: R.tpeMonthKey(now), ...out };
  }
  async roster(now) {
    const uid = this.meId;
    const base = this.rosterBase().filter(h => h.user_id !== uid);
    const thanked = this.namedThanksIndex().get(uid) || new Map();
    const first = base.filter(h => thanked.has(h.user_id)).sort((a, b) => (thanked.get(b.user_id) - thanked.get(a.user_id)) || (a.user_id < b.user_id ? -1 : 1));
    const day = R.tpeDayStart(now);
    const rest = base.filter(h => !thanked.has(h.user_id));
    const keys = new Map(await Promise.all(rest.map(async h => [h.user_id, await R.rosterOrderKey(uid, day, h.user_id)])));
    rest.sort((a, b) => (keys.get(a.user_id) < keys.get(b.user_id) ? -1 : 1));
    return { remaining: base.length, total: this.activeUsers().length, thanked_me: first, others: rest };
  }
}

// 照片還沒下載完成時先放 1×1 透明圖（卡片照樣排成有圖的版面），下載完再推一次更新
export const PHOTO_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
