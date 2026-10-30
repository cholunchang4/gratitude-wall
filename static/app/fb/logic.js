// 感謝牆的規則（純函式，沒有 Firebase、沒有 DOM）。從 5.5 的 server/app/rules.py、state.py、dto.py 逐條移植，數字不變。
// 前台、後台、規則測試（Node）都用這一份；database.rules.json 由同一份常數（constants.js）產生，所以前台的提示和伺服器端的規則一致。
import { K } from './constants.js';

export const DAY_MS = 86400000;
const TPE = 8 * 3600000;
export const PERMANENT = -1;

// ---------------------------------------------------------------- 台灣時間
export const tpeDayNumber = (ms) => Math.floor((ms + TPE) / DAY_MS);              // 規則裡額度格子用的「台灣日數」
export const tpeDayStart = (ms) => tpeDayNumber(ms) * DAY_MS - TPE;
export const tpeNextDayStart = (ms) => tpeDayStart(ms) + DAY_MS;
function tpeParts(ms) { const d = new Date(ms + TPE); return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate() }; }
export function tpeMs(y, mo, d) { return Date.UTC(y, mo - 1, d) - TPE; }
export function tpeMonthStart(ms) { const p = tpeParts(ms); return tpeMs(p.y, p.mo, 1); }
export function tpePrevMonthStart(ms) { const p = tpeParts(ms); return p.mo === 1 ? tpeMs(p.y - 1, 12, 1) : tpeMs(p.y, p.mo - 1, 1); }
export function tpeMonthKey(ms) { const p = tpeParts(ms); return `${p.y}-${String(p.mo).padStart(2, '0')}`; }
export function tpeDateKey(ms) { const p = tpeParts(ms); return `${p.y}${String(p.mo).padStart(2, '0')}${String(p.d).padStart(2, '0')}`; }

// ---------------------------------------------------------------- 活動
// 活動時間：正式版用 constants.js；規則測試會用 overrideHwWindow 換成「活動中／已結束」的時間（和規則測試用的規則檔一致）
export const HW = { ...K.EVENTS.hw2026 };
export const MIDAUTUMN = { ...K.EVENTS.midautumn2026 };
export const HW_EPILOGUE = { ...K.EVENTS.hw2026_epilogue };
export function overrideHwWindow(start, end) { HW.start = start; HW.end = end; HW_EPILOGUE.start = end + 1; HW_EPILOGUE.end = end + 7 * DAY_MS; }
const within = (e, t) => e.start <= t && t <= e.end;
export function activeEvent(now) {
  if (within(HW, now)) return 'hw2026';
  if (within(MIDAUTUMN, now)) return 'midautumn2026';
  return null;
}
export const eventContains = (id, t) => (id === 'hw2026' ? within(HW, t) : id === 'midautumn2026' ? within(MIDAUTUMN, t) : false);
export const hwActive = (now) => within(HW, now);
export const hwEpilogueActive = (now) => within(HW_EPILOGUE, now);
export function hwStage(count) { return count >= 150 ? 'hw-stage-3' : count >= 50 ? 'hw-stage-2' : 'hw-stage-1'; }
export function hwRewardExpiry(count, eventEnd = HW.end) {
  for (const [need, days] of K.HW_REWARD_TIERS) if (count >= need) return days === null ? PERMANENT : eventEnd + days * DAY_MS;
  return null;
}

// ---------------------------------------------------------------- 等級、字數、解鎖
export function levelForExp(exp) { for (const [need, lv] of K.LEVEL_STEPS) if (exp >= need) return lv; return 1; }
export function nextLevelExp(exp) {
  const lv = levelForExp(exp);
  if (lv >= 8) return null;
  const steps = [...K.LEVEL_STEPS].reverse();
  const hit = steps.find(([, l]) => l === lv + 1);
  return hit ? hit[0] : null;
}
export function maxLength(level, isAdmin) {
  if (isAdmin) return K.ADMIN_MAX_LENGTH;
  if (level <= 2) return 20;
  if (level <= 6) return 50;
  if (level === 7) return 200;
  return 1000;
}
export function emojiTier(level, isAdmin) { return isAdmin || level >= 7 ? 'full' : level >= 4 ? 'mid' : level >= 2 ? 'basic' : 'none'; }
export function rewardThemes(exp) { return Object.entries(K.THEMES_REWARD).sort((a, b) => a[1] - b[1]).filter(([, need]) => exp >= need).map(([t]) => t); }
const ALL_THEMES = new Set([...K.THEMES_FREE, ...K.THEMES_LV4, ...Object.keys(K.THEMES_REWARD), K.THEME_ADMIN, K.THEME_HW, K.THEME_MOON]);
export function themeDenied(theme, { level, exp, isAdmin, hwOk }) {
  if (!ALL_THEMES.has(theme)) return 'BAD_THEME';
  if (theme === K.THEME_MOON) return '這個主題已經結束囉，請換一個主題。';
  if (isAdmin) return null;
  if (K.THEMES_FREE.includes(theme)) return null;
  if (K.THEMES_LV4.includes(theme)) return level >= 4 ? null : '這個主題要升到 Lv.4 才能使用。';
  if (theme in K.THEMES_REWARD) return exp >= K.THEMES_REWARD[theme] ? null : '這個主題是高等級的隱藏獎勵，還沒解鎖喔。';
  if (theme === K.THEME_ADMIN) return '這個主題只有管理員可以使用。';
  if (theme === K.THEME_HW) return hwOk ? null : '萬聖卡要先變身成吸血鬼才能使用（點開一張萬聖卡就會變身）。';
  return 'BAD_THEME';
}

// ---------------------------------------------------------------- 配額
export function computeQuota(regularTs, eventUsed, now, eventIsActive) {
  const today0 = tpeDayStart(now), since = now - K.QUOTA.window_days * DAY_MS;
  const ts = [...regularTs].sort((a, b) => a - b);
  const today = ts.filter(t => t >= today0).length;
  const monthList = ts.filter(t => t >= since);
  const month = monthList.length;
  const left = Math.max(0, Math.min(K.QUOTA.daily - today, K.QUOTA.monthly - month));
  const evtLeft = eventIsActive ? Math.max(0, K.QUOTA.event_extra - eventUsed) : 0;
  let restore = null;
  if (left <= 0) {
    const c = [now];
    if (today >= K.QUOTA.daily) c.push(tpeNextDayStart(now));
    if (month >= K.QUOTA.monthly) c.push(monthList[month - K.QUOTA.monthly] + K.QUOTA.window_days * DAY_MS + 1);
    restore = Math.max(...c);
  }
  return { regular_left: left, today_used: today, month_used: month, event_left: evtLeft, next_restore_at: restore };
}

// ---------------------------------------------------------------- 名字、文字
export function splitReceivers(text) {
  if (!text || text === '大家') return [];
  return String(text).split(',').map(s => s.trim()).filter(Boolean);
}
// 6.1 收件人確認：手打的名字要完全等於通訊錄 active 同事的姓名（英文不分大小寫）。對不到的列出來，名字很接近的附一個建議。
// 只比對名字字串，不碰 Email；names 是 active 同事的姓名清單。
const foldName = (s) => String(s).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
function editDistance(a, b, max) {            // 編輯距離（相鄰兩字對調也算 1，例如 Btea／Beta）；以字碼為單位，中文一個字算 1；超過 max 就提早放棄
  a = Array.from(a); b = Array.from(b);
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let pp = null, prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (pp && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], pp[j - 2] + 1);
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    pp = prev; prev = cur;
  }
  return prev[b.length];
}
/** 很接近的同事姓名（大小寫、空白、全形半形不同，或差 1 個字／兩字對調；6 個字以上可以差 2 個字）。最接近的不只一位就不建議。 */
export function suggestName(input, names) {
  const f = foldName(input);
  if (Array.from(f).length < 2) return null;
  const max = Array.from(f).length >= 6 ? 2 : 1;
  let best = null, bestD = max + 1, tie = false;
  for (const n of new Set(names)) {
    const d = editDistance(f, foldName(n), max);
    if (d < bestD) { best = n; bestD = d; tie = false; }
    else if (d === bestD && d <= max && n !== best) tie = true;
  }
  return bestD <= max && !tie ? best : null;
}
/**
 * 檢查收件人欄位。回傳 { receiver, unknown: [{ name, suggest }] }。
 * receiver：大小寫不同但對得到的名字換成通訊錄的寫法（這樣才對得到人、收得到通知）；其他照原樣。
 * 空白、「大家」不用確認。
 */
export function checkReceivers(text, names) {
  const raw = String(text || '').trim();
  if (!raw || raw === '大家') return { receiver: raw, unknown: [] };
  const exact = new Set(names), lower = new Map();
  for (const n of names) { const k = String(n).toLowerCase(); if (!lower.has(k)) lower.set(k, n); }
  const parts = raw.split(',').map(x => x.trim()).filter(Boolean), out = [], unknown = [], seen = new Set();
  let changed = false;
  for (const t of parts) {
    if (t === '大家' || exact.has(t)) { out.push(t); continue; }
    const c = lower.get(t.toLowerCase());
    if (c) { out.push(c); changed = true; continue; }
    out.push(t);
    if (!seen.has(t)) { seen.add(t); unknown.push({ name: t, suggest: suggestName(t, names) }); }
  }
  return { receiver: changed ? out.join(', ') : raw, unknown };
}
// 移除控制字元、改變文字方向的字元，統一換行並去掉頭尾空白（和 5.5 util.clean_text 相同）
const BAD_CHARS = /[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069\ufeff]/g;
export function cleanText(s, keepNewlines = true) {
  s = s == null ? '' : String(s);
  s = s.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '?');
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(BAD_CHARS, '');
  if (!keepNewlines) s = s.replace(/\s+/g, ' ');
  return s.trim();
}
export function initialsOf(name) {
  const n = String(name || '').trim();
  if (!n) return '?';
  const parts = n.split(/\s+/);
  if (parts.length >= 2 && /[A-Za-z]/.test(parts[0][0])) return (parts[0][0] + parts[1][0]).toUpperCase();
  return Array.from(n)[0];
}
export function avatarColorOf(userId) {          // FNV-1a，和 5.5 util.avatar_color_of 相同（逐個 Unicode 字元）
  let h = 0x811C9DC5;
  for (const ch of String(userId)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h % 8;
}
export const DEFAULT_SETTINGS = { mainTitle: 'RDTW 感謝牆', subTitle: '每個人都可以在這裡抒發內心的感謝', appVersion: '5.0', maxMessages: 50, retentionDays: 30 };
export function settingsDto(raw) {
  const out = { ...DEFAULT_SETTINGS };
  for (const [k, v] of Object.entries(raw || {})) {
    if (['mainTitle', 'subTitle', 'appVersion'].includes(k) && !String(v ?? '').trim()) continue;
    out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------- 英雄榜（和 5.5 compute_leaderboard 相同）
// msgs：[{created_at, named_author, receiver_text, is_event_extra}]，新到舊。
export function computeLeaderboard(msgs, validNames, now, retentionDays, top = 10) {
  const retention = Math.max(Number(retentionDays) || 30, 1) * DAY_MS;
  const ev = activeEvent(now);
  const senders = new Map(), receivers = new Map();
  for (const m of msgs) {
    const count = ev ? eventContains(ev, m.created_at) : (!m.is_event_extra && now - m.created_at <= retention);
    if (!count) continue;
    if (m.named_author && validNames.has(m.named_author)) senders.set(m.named_author, (senders.get(m.named_author) || 0) + 1);
    for (const r of splitReceivers(m.receiver_text)) if (validNames.has(r)) receivers.set(r, (receivers.get(r) || 0) + 1);
  }
  const rank = (d) => [...d.entries()].map((kv, i) => [kv, i]).sort((a, b) => b[0][1] - a[0][1] || a[1] - b[1]).slice(0, top).map(([kv]) => [kv[0], kv[1]]);
  return { scope: ev || 'recent', senders: rank(senders), receivers: rank(receivers) };
}

// ---------------------------------------------------------------- 上月感謝榜（和 5.5 rank_top／compute_monthly_leaderboard 相同）
const MONTHLY_TOP = 5, MONTHLY_MAX_ROWS = 7;
function codeCmp(a, b) {   // Python 的字串排序（逐個字碼比較）
  const A = Array.from(a), B = Array.from(b);
  for (let i = 0; i < Math.min(A.length, B.length); i++) { const d = A[i].codePointAt(0) - B[i].codePointAt(0); if (d) return d; }
  return A.length - B.length;
}
export function rankTop(counts, top = MONTHLY_TOP, maxRows = MONTHLY_MAX_ROWS) {
  const items = [...counts.entries()].sort((a, b) => b[1] - a[1] || codeCmp(a[0], b[0]));
  const out = [];
  let i = 0;
  while (i < items.length && i + 1 <= top) {
    let j = i;
    while (j < items.length && items[j][1] === items[i][1]) j++;
    const group = items.slice(i, j);
    if (out.length + group.length > maxRows) return [out, { rank: i + 1, count: group[0][1], people: group.length }];
    for (const [n, c] of group) out.push([n, c, i + 1]);
    i = j;
  }
  return [out, null];
}
export function computeMonthlyLeaderboard(msgs, validNames, start, end) {
  const senders = new Map(), receivers = new Map();
  let counted = 0;
  for (const m of msgs) {
    if (!(start <= m.created_at && m.created_at < end)) continue;
    counted++;
    if (m.named_author && validNames.has(m.named_author)) senders.set(m.named_author, (senders.get(m.named_author) || 0) + 1);
    for (const r of new Set(splitReceivers(m.receiver_text))) {
      if (validNames.has(r) && r !== m.real_author) receivers.set(r, (receivers.get(r) || 0) + 1);
    }
  }
  const [s, sMore] = rankTop(senders), [r, rMore] = rankTop(receivers);
  return { senders: s, receivers: r, senders_more: sMore, receivers_more: rMore, messages: counted };
}

// 始祖：凍結名單優先；沒有就用活動開始前具名、未刪除的留言作者前 5 名（同分依第一次出現的順序）
export function topProgenitors(authorsInOrder, n = 5) {
  const counts = new Map();
  for (const a of authorsInOrder) counts.set(a, (counts.get(a) || 0) + 1);
  return [...counts.entries()].map((kv, i) => [kv, i]).sort((a, b) => b[0][1] - a[0][1] || a[1] - b[1]).slice(0, n).map(([kv]) => kv);
}

// 夜巡名冊順序：sha256(查看者|台灣日 0 點|user_id) 的十六進位字串（和 5.5 roster_order_key 相同）
export async function rosterOrderKey(viewerId, dayMs, userId) {
  const data = new TextEncoder().encode(`${viewerId}|${dayMs}|${userId}`);
  const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

// 通訊錄：五行一組，第 3 行 Email、第 5 行備註；姓名由 Email 推出（和 5.5 contacts.py 相同）
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function nameFromEmail(email) {
  const local = email.split('@')[0].replace(/_/g, '.');
  const parts = local.split('.').filter(p => p && !/\d/.test(p));
  const name = parts.map(p => (p.length <= 2 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1).toLowerCase())).join(' ');
  return (name || local).slice(0, 100);
}
export function parseContacts(raw) {
  const lines = String(raw || '').split('\n').map(l => cleanText(l, false)).filter(Boolean);
  const out = [], seen = new Set();
  for (let i = 0; i < lines.length; i += 5) {
    if (i + 2 >= lines.length) break;
    const email = lines[i + 2], info = i + 4 < lines.length ? lines[i + 4] : '';
    if (!EMAIL_RE.test(email) || email.length > 254) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: nameFromEmail(email), email: key, info: info.slice(0, 200) });
  }
  const groups = Math.floor(lines.length / 5) + (lines.length % 5 >= 3 ? 1 : 0);
  return { contacts: out, invalid: Math.max(0, groups - out.length) };
}
// Email → RTDB 的 key（小寫、. 換成 ,）。含 RTDB 不允許的字元（# $ [ ] /）回 null。
export function emailKey(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(e) || /[#$[\]/]/.test(e)) return null;
  return e.replace(/\./g, ',');
}
