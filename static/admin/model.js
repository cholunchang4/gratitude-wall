// 後台資料模型：把 api/admin/bootstrap 轉成 admin 4.8 用的形狀，並沿用 4.8 的 computeModel 計算。
// 這個檔案不碰畫面（沒有 DOM），測試可以單獨載入。

// ---------- 和前台一致的常數（萬聖活動規則不變） ----------
export const HW_EVENT_START = new Date('2026-10-18T00:00:00+08:00').getTime();
export const HW_EVENT_END = new Date('2026-10-31T23:59:59+08:00').getTime();
export const HW_TOTAL = 200;
export const HW_STAGES = [{ min: 150, name: '血月降臨' }, { min: 50, name: '亡靈甦醒' }, { min: 0, name: '幽暗之夜' }];
export const HW_REWARD_TIERS = [
  { min: 100, days: 30, label: '萬聖模板延長 30 天' },
  { min: 150, days: 60, label: '萬聖模板延長 60 天' },
  { min: 200, days: Infinity, label: '萬聖模板永久保留' },
];
export const HW_MASKS = ['🎃 搗蛋南瓜', '🦇 迷路蝙蝠', '🧛 夜貓伯爵', '🧟 貪吃殭屍', '👻 搞怪幽靈', '🧙‍♀️ 熬夜女巫', '💀 骨感骷髏'];
export const HW_MASKS_LEGACY = ['🧛 嗜血伯爵', '💀 骷髏先生'];
export const HW_THEME = 'theme-halloween';
export const DAY = 86400000;
export const TPE = 8 * 3600000;
export const LEVELS = [
  { min: 0, lv: 1, icon: '🌱', name: '新手幼苗', unlock: '20 字上限' },
  { min: 1, lv: 2, icon: '🍀', name: '熱心路人', unlock: '按讚（萬聖期間為給糖）、基礎表情符號' },
  { min: 5, lv: 3, icon: '🌷', name: '溫暖園丁', unlock: '卡片自由拖曳、50 字上限' },
  { min: 10, lv: 4, icon: '🌈', name: '色彩魔術師', unlock: '10 色發文主題、中級表情符號' },
  { min: 15, lv: 5, icon: '🗣️', name: '感謝達人', unlock: '多人標記（@ 自動輸入）' },
  { min: 20, lv: 6, icon: '🎨', name: '塗鴉畫家', unlock: '親筆手繪塗鴉' },
  { min: 30, lv: 7, icon: '🕵️‍♂️', name: '藏鏡天使', unlock: '匿名發布、200 字上限、完整表情符號' },
  { min: 50, lv: 8, icon: '✨', name: '感謝大師', unlock: '插入照片、1000 字上限、專屬大師徽章' },
  { min: 60, lv: 9, icon: '🪩', name: '霓虹幻影', unlock: '解鎖「霓虹幻影」模板', hidden: true },
  { min: 70, lv: 10, icon: '🔮', name: '極光幻境', unlock: '解鎖「極光幻境」模板', hidden: true },
  { min: 80, lv: 11, icon: '👑', name: '璀璨鑽金', unlock: '解鎖「璀璨鑽金」模板', hidden: true },
  { min: 90, lv: 12, icon: '🌌', name: '星際領航', unlock: '解鎖「星際領航」模板', hidden: true },
  { min: 100, lv: 13, icon: '🦄', name: '傳說之神', unlock: '解鎖「傳說之神」模板', hidden: true },
];

// ---------- 小工具 ----------
const p2 = (n) => String(n).padStart(2, '0');
export function tp(ts) { const d = new Date(ts + TPE); return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), wd: d.getUTCDay() }; }
export function dayKey(ts) { const t = tp(ts); return `${t.y}-${p2(t.mo)}-${p2(t.d)}`; }
export function fmtDT(ts) { if (!Number.isFinite(ts)) return '—'; const t = tp(ts); return `${t.y}/${p2(t.mo)}/${p2(t.d)} ${p2(t.h)}:${p2(t.mi)}`; }
export function fmtMD(ts) { const t = tp(ts); return `${t.mo}/${t.d}`; }
export const WD = ['日', '一', '二', '三', '四', '五', '六'];
export const norm = (x) => String(x ?? '').split(' (')[0].trim().toLowerCase();
export const isMask = (a) => HW_MASKS.includes(a) || HW_MASKS_LEGACY.includes(a);
export const isAnonName = (a) => a === '匿名' || isMask(a);
export const inEvent = (ts) => ts >= HW_EVENT_START && ts <= HW_EVENT_END;
export const pct = (a, b) => b > 0 ? Math.round(a / b * 1000) / 10 : null;
export function levelOf(exp) { let L = LEVELS[0]; for (const x of LEVELS) if (exp >= x.min) L = x; return L; }
export function isSafeKey(k) { return typeof k === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(k); }
// 照片只接受伺服器的照片網址（同網站、相對路徑），其他一律不顯示
export function safeImg(src) { return typeof src === 'string' && /^data:image\/(png|jpeg|gif|webp);base64,/.test(src) ? src : null; }
export function receiversOf(m) { return m.receiver ? String(m.receiver).split(',').map(r => r.trim()).filter(r => r && r !== '大家') : []; }
export function phase(now) { return now < HW_EVENT_START ? 'before' : now <= HW_EVENT_END ? 'during' : 'after'; }

export const CAUSE_LABEL = { progenitor: '始祖', opened_card: '點開萬聖卡', tagged: '被標記', migrated: '搬家前就已變身', admin: '管理員設定' };

// ---------- API 資料 → 4.8 的形狀 ----------
export function adaptBootstrap(b) {
  const users = (b.users || []).map(u => ({
    id: String(u.user_id || ''), name: String(u.name ?? ''), email: String(u.email || '').toLowerCase(), info: String(u.info || ''),
    status: u.status || 'active', bound: !!u.connect_bound, isAdmin: !!u.is_admin,
  }));
  const usersById = new Map(users.map(u => [u.id, u]));
  const contacts = users.filter(u => u.status === 'active');
  const allMessages = (b.messages || []).map(m => ({
    id: m.id, text: m.text ?? '', receiver: m.receiver || '', author: m.author_display || '',
    uid: m.author_user_id && m.author_user_id !== 'u_unresolved' ? String(m.author_user_id) : null,
    anon: (m.display_mode && m.display_mode !== 'named') || isAnonName(m.author_display),
    theme: m.theme || '', image: m.image_url || null, timestamp: Number(m.created_at) || 0,
    isEventExtra: m.quota_bucket === 'event', isMooncake: !!(m.legacy && m.legacy.mooncake), isOpened: !!(m.legacy && m.legacy.mooncake_opened),
    likeCount: Number(m.like_count) || 0, deleted: !!m.deleted, edited: !!m.edited, level: m.author_level,
  }));
  const hw = b.hw2026 || {};
  const infections = (hw.infections || []).map(i => ({ uid: String(i.user_id), cause: i.cause || '', at: Number(i.at) || 0, sourceId: i.source_message_id || null }));
  const progenitors = [...(hw.progenitors || [])].sort((a, z) => (a.rank || 0) - (z.rank || 0)).map(p => ({ rank: p.rank, uid: String(p.user_id), n: Number(p.pre_event_count) || 0 }));
  return {
    me: b.me || {}, server: b.server || {}, settings: b.settings || {},
    users, usersById, contacts, allMessages, messages: allMessages.filter(m => !m.deleted),
    infections, infected: Object.fromEntries(infections.map(i => [i.uid, usersById.get(i.uid)?.name ?? ''])), progenitors,
  };
}

// ---------- 計算（沿用 admin 4.8 的 computeModel；差別只在資料來源） ----------
export function computeModel(S, now) {
  const msgs = S.messages, contacts = S.contacts, infected = S.infected, usersById = S.usersById;
  const people = new Map();
  const getP = (key) => { let p = people.get(key); if (!p) { p = { key, uid: null, name: '', nameTs: -1, emails: new Set(), msgs: [], exp: 0, total: 0, firstTs: Infinity, isAdmin: false }; people.set(key, p); } return p; };
  const msgPerson = new Map();
  for (const m of msgs) if (m.uid) {
    const p = getP('u:' + m.uid); p.uid = m.uid;
    const u = usersById.get(m.uid);
    if (u && u.email) p.emails.add(u.email);
    if (u && u.name) { p.name = u.name; p.nameTs = Infinity; }
    else if (m.author && !m.anon && m.timestamp >= p.nameTs) { p.name = String(m.author); p.nameTs = m.timestamp; }
  }
  for (const [uid, nm] of Object.entries(infected)) { const p = people.get('u:' + uid); if (p && !p.name && typeof nm === 'string') p.name = nm; }
  const byName = new Map();
  for (const p of people.values()) if (p.name && !byName.has(norm(p.name))) byName.set(norm(p.name), p);
  let unattributed = 0;
  for (const m of msgs) {
    let p;
    if (m.uid) p = people.get('u:' + m.uid);
    else if (!m.author || m.anon) { unattributed++; continue; }
    else { p = byName.get(norm(m.author)); if (!p) { p = getP('n:' + norm(m.author)); p.name = String(m.author); byName.set(norm(m.author), p); } }
    msgPerson.set(m.id, p);
    p.msgs.push(m); p.total++; if (!m.isEventExtra) p.exp++;
    if (m.timestamp < p.firstTs) p.firstTs = m.timestamp;
  }
  // --- 通訊錄比對：有 user_id 就用 user_id（精準）；舊資料沒有編號才用姓名
  const cIdxById = new Map(), cByName = new Map();
  contacts.forEach((c, i) => { cIdxById.set(c.id, i); if (c.name) cByName.set(norm(c.name), i); });
  const contactOf = (p) => {
    if (p.uid && cIdxById.has(p.uid)) return cIdxById.get(p.uid);
    if (p.uid && usersById.has(p.uid)) return -1; // 已移出名單或停權
    return p.name && cByName.has(norm(p.name)) ? cByName.get(norm(p.name)) : -1;
  };
  for (const p of people.values()) {
    p.contactIdx = contactOf(p);
    const u = p.uid ? usersById.get(p.uid) : null;
    p.isAdmin = !!(u && u.isAdmin);
    if (!p.name && p.contactIdx >= 0) p.name = String(contacts[p.contactIdx].name || '');
    if (!p.name) p.name = [...p.emails][0] || '（只有匿名發文）';
  }
  // --- 始祖：搬家時凍結，由伺服器提供
  const progIds = new Set(S.progenitors.map(g => g.uid));
  const top5 = S.progenitors.map(g => ({ name: usersById.get(g.uid)?.name || '（未知帳號）', n: g.n, changed: Object.prototype.hasOwnProperty.call(infected, g.uid) }));

  // --- 變身名單
  const nameCount = {};
  S.infections.forEach(i => { const k = norm(infected[i.uid]); nameCount[k] = (nameCount[k] || 0) + 1; });
  const infectedContactIdx = new Set();
  const infRows = S.infections.map(inf => {
    const name = infected[inf.uid] || '';
    const p = people.get('u:' + inf.uid);
    let cIdx = cIdxById.has(inf.uid) ? cIdxById.get(inf.uid) : -1;
    if (cIdx >= 0) infectedContactIdx.add(cIdx);
    const flags = [];
    if (!name.trim()) flags.push('名字空白');
    if (cIdx < 0) flags.push('不在通訊錄');
    if (name.trim() && nameCount[norm(name)] > 1) flags.push('同名多筆');
    return { uid: inf.uid, name, inContacts: cIdx >= 0, postedEvent: !!(p && p.msgs.some(m => inEvent(m.timestamp))), everPosted: !!(p && p.msgs.length),
      isProg: progIds.has(inf.uid), flags, at: inf.at, cause: inf.cause };
  });
  infRows.sort((a, b) => (b.flags.length > 0) - (a.flags.length > 0) || a.name.localeCompare(b.name, 'zh-Hant'));
  const infCount = S.infections.length;

  // --- 參與狀態
  const postedContactIdx = new Set();
  for (const p of people.values()) if (p.contactIdx >= 0 && p.msgs.length) postedContactIdx.add(p.contactIdx);

  // --- 活動期間指標
  const evMsgs = msgs.filter(m => inEvent(m.timestamp) && m.timestamp <= now);
  const activeSet = new Set(); for (const m of evMsgs) { const p = msgPerson.get(m.id); if (p) activeSet.add(p); }
  const firstTimers = [...people.values()].filter(p => inEvent(p.firstTs) && p.firstTs <= now);
  const lurkersBefore = contacts.filter((c, i) => ![...people.values()].some(p => p.contactIdx === i && p.firstTs < HW_EVENT_START)).length;
  const hwCards = evMsgs.filter(m => m.theme === HW_THEME).length;
  const anonCards = evMsgs.filter(m => m.anon);
  const baseline = msgs.filter(m => m.timestamp >= HW_EVENT_START - 14 * DAY && m.timestamp < HW_EVENT_START).length;
  const daysElapsed = now < HW_EVENT_START ? 0 : Math.min(14, Math.floor((Math.min(now, HW_EVENT_END) - HW_EVENT_START) / DAY) + 1);
  // 回卡率（估算）：活動期間被點名感謝的人，之後在活動期間自己寫過卡的比例
  const thanked = new Map();
  for (const m of [...evMsgs].sort((a, b) => a.timestamp - b.timestamp)) {
    const author = msgPerson.get(m.id);
    for (const r of receiversOf(m)) { const k = norm(r); if (author && norm(author.name) === k) continue; if (!thanked.has(k)) thanked.set(k, { name: r, t0: m.timestamp }); }
  }
  const infNames = new Set(S.infections.map(i => norm(infected[i.uid])));
  let replied = 0, thankedInf = 0, repliedInf = 0;
  for (const [k, t] of thanked) {
    const p = byName.get(k);
    const did = !!(p && p.msgs.some(m => m.timestamp > t.t0 && inEvent(m.timestamp)));
    const inf = infNames.has(k) || !!(p && p.uid && infected[p.uid] !== undefined);
    if (did) replied++;
    if (inf) { thankedInf++; if (did) repliedInf++; }
  }
  // --- 每日趨勢：變身人數改用伺服器記錄的準確時間
  const infByDay = {};
  let migrated = 0, migratedAt = null;
  for (const i of S.infections) { const k = dayKey(i.at); infByDay[k] = (infByDay[k] || 0) + 1; if (i.cause === 'migrated') { migrated++; migratedAt = i.at; } }
  const days = [];
  for (let i = 0; i < 14; i++) {
    const t0 = HW_EVENT_START + i * DAY; if (t0 > now) break;
    const key = dayKey(t0);
    const dm = evMsgs.filter(m => dayKey(m.timestamp) === key);
    days.push({ key, ts: t0, label: fmtMD(t0), wd: WD[tp(t0).wd],
      cards: dm.length, first: firstTimers.filter(p => dayKey(p.firstTs) === key).length,
      hw: dm.filter(m => m.theme === HW_THEME).length, anon: dm.filter(m => m.anon).length, infected: infByDay[key] || 0 });
  }
  // --- 匿名巡查
  const patrol = anonCards.map(m => {
    const p = msgPerson.get(m.id);
    const u = m.uid ? usersById.get(m.uid) : null;
    return { m, realName: p ? p.name : '（無法辨識：舊資料沒有發文者編號）', email: (u && u.email) || (p ? [...p.emails][0] : '') || '', uid: m.uid || '' };
  }).sort((a, b) => b.m.timestamp - a.m.timestamp);

  return { people, msgPerson, unattributed, top5, tieAtCut: false, ranked: [], infRows, infCount, infectedContactIdx, postedContactIdx,
    evCards: evMsgs.length, active: activeSet.size, firstTimers, lurkersBefore, hwCards, anonCount: anonCards.length, baseline, daysElapsed,
    thanked: thanked.size, replied, thankedInf, repliedInf, days, migrated, migratedAt, patrol };
}

export function rewardText(count) {
  const t = [...HW_REWARD_TIERS].reverse().find(x => count >= x.min);
  if (!t) return `變身人數 ${count} 人，未達 100 人，萬聖模板不延長。`;
  if (t.days === Infinity) return `變身人數 ${count} 人，萬聖模板永久保留。`;
  return `變身人數 ${count} 人，萬聖模板保留到 ${fmtDT(HW_EVENT_END + t.days * DAY).slice(0, 10)}。`;
}
