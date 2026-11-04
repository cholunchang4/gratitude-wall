// T101 點亮星空 2.0「被看見的星」：純函式（不碰 Firebase、不碰畫面），前台與 node 單元測試共用。
// 時程與門檻一律讀 K.EVENTS.sky2026（rules/wall-constants.json → build_rules.py），讀不到才用下面的預設值。
// 只用伺服器時間判斷（app.js 傳進來的 nowMs），不看使用者電腦時間。
import { K } from '../fb/constants.js';

const DEF = {
  start: Date.UTC(2026, 10, 9, 16),                 // 2026-11-10 00:00（台灣）
  act2: Date.UTC(2026, 10, 16, 16), act3: Date.UTC(2026, 10, 23, 16),
  end: Date.UTC(2026, 10, 30, 16) - 1,              // 11/30 23:59:59.999
  epilogue_end: Date.UTC(2026, 11, 7, 16) - 1, twinkle_end: Date.UTC(2026, 11, 31, 16) - 1,
  tiers: [25, 50, 85], per_author_cap: 10,         // 6.5.4 卓倫 11/04 由 40／90／130 調整（全面審視第 13 節）
};
export const SKY = Object.freeze({ ...DEF, ...((K.EVENTS && K.EVENTS.sky2026) || {}) });
const BANK = K.BANK || {};
export const START_PROFILE = Number(BANK.start_profile) || SKY.start;
export const SHOP_START = Number(BANK.start) || SKY.end + 1;
const BL = BANK.limits || {};
export const PC_MIN = Number(BL.pc_min_chars) || 6;
export const PC_DONE_CELLS = Number(BL.pc_done_cells) || 5;
export const PC_REWARD_FIELDS = BANK.pc_reward_fields || ['care', 'proud', 'motiv', 'power', 'contrib', 'learn', 'work'];
const AMT = BANK.amounts || {};
export const AMOUNT = { pc_cell: AMT.pc_cell ?? 5, pc_done: AMT.pc_done ?? 25 };
const EV = (BANK.events && BANK.events.ev26) || {};
export const EV_CODES = EV.codes || {};
export const POOL = EV.pool || { themes: ['care', 'proud', 'motiv', 'power', 'contrib', 'work'], size: 6, min: 3 };

export const STARNIGHT = SKY.theme || 'theme-starnight';
export const STARNIGHT_TIER = Number(SKY.theme_tier) || 2;
export const STARNIGHT_AT = SKY.tiers[STARNIGHT_TIER - 1];   // 星夜解鎖要幾位（畫面文字用，和門檻同一份常數）
export const TIER_NAMES = ['初星', '繁星', '銀河'];
export const TIER_LONG = ['初星', '繁星', '銀河傳說'];
// 第一幕的六個主題（第 6 格 learn、第 8 格 stress 永遠不在這裡）
export const THEMES = Object.freeze([
  { k: 'care', t: '在乎的事', f: '我很在乎的事' }, { k: 'proud', t: '成就感', f: '讓我有成就感的事' },
  { k: 'motiv', t: '動力', f: '讓我有動力的是' }, { k: 'power', t: '超能力', f: '我的超能力' },
  { k: 'contrib', t: '能幫團隊', f: '我能幫團隊的地方' }, { k: 'work', t: '合作小撇步', f: '跟我合作的小撇步' },
]);
export const LAB_FIELDS = Object.freeze({ work: '跟我合作的小撇步', contrib: '我能幫團隊的地方' });
export const LAB_MAX = 3;
export const STAR_SRC = Object.freeze(['pc', 'pc0']);

/**
 * 現在是活動的哪一段。
 * act：0＝還沒開始或已結束；1～3＝第幾幕。live：計數中。ended：11/30 之後。
 * night：牆面要不要是夜空（開跑到 11/30；12/1～12/31 只有到了初星才留著）。bar：要不要顯示進度條（開跑～11/30 當天結束前）。
 */
export function phaseOf(now, tier = 0) {
  const live = now >= SKY.start && now <= SKY.end;
  const act = !live ? 0 : now >= SKY.act3 ? 3 : now >= SKY.act2 ? 2 : 1;
  const ended = now > SKY.end;
  const night = live || (ended && now <= SKY.twinkle_end && tier >= 1);
  return { act, live, ended, before: now < SKY.start, night, twinkle: night && tier >= 1, bar: live, epilogue: ended && now <= SKY.epilogue_end };
}

export const tierOf = (n, tiers = SKY.tiers) => tiers.filter(x => n >= x).length;
/** 進度條文字：「再 M 顆，就是『繁星』」；全部到了回 null */
export function nextTier(n, tiers = SKY.tiers) {
  const i = tiers.findIndex(x => n < x);
  return i < 0 ? null : { need: tiers[i] - n, name: TIER_LONG[i], short: TIER_NAMES[i], at: tiers[i], index: i };
}
export function barAria(n, tiers = SKY.tiers) {
  const reached = tiers.map((x, i) => (n >= x ? TIER_NAMES[i] : null)).filter(Boolean);
  const nx = nextTier(n, tiers);
  return `夜空裡已經有 ${n} 顆星亮了${reached.length ? '，已達' + reached.join('、') : ''}${nx ? `，下一道門檻是${nx.short} ${nx.at} 顆` : ''}`;
}
export const barPercent = (n, tiers = SKY.tiers) => Math.max(0, Math.min(100, (Math.min(n, tiers[tiers.length - 1]) / tiers[tiers.length - 1]) * 100));

// ---------------------------------------------------------------- 星光卡
export const isStarSrc = (src) => STAR_SRC.includes(src);
/** 從說明書寫卡時要帶的標記：對方說明書有內容 pc、空白 pc0 */
export const srcForCard = (filledCount) => (filledCount > 0 ? 'pc' : 'pc0');
export const markLabel = (src) => (src === 'pc' ? '讀了你的說明書' : src === 'pc0' ? '想多認識你' : '');

/**
 * 公開資料估計的「被點亮人數」：銀行（ev/stars）還沒上線時才用。
 * 期間內、src 卡、只有一位收件人、不是寫給自己（具名卡）→ 不同收件人數。匿名卡讀不到作者，沒辦法套每人 10 顆上限，所以只是估計（只會偏高）。
 */
export function estimateLit(messages, { start = SKY.start, end = SKY.end, isActive = () => true } = {}) {
  const lit = new Set();
  for (const m of messages) {
    if (!m || !isStarSrc(m.src) || m.created_at < start || m.created_at > end) continue;
    const ri = m.receiver_ids || [];
    if (ri.length !== 1 || (m.author_id && ri[0] === m.author_id) || !isActive(ri[0])) continue;
    lit.add(ri[0]);
  }
  return lit.size;
}
/** 這位同事在 now 之前是不是已經被點亮（公開資料可以算，星線第二行「被你點亮了」只在第一次出現） */
export function wasLit(messages, rid, exceptMid, { start = SKY.start, end = SKY.end } = {}) {
  for (const m of messages) {
    if (!m || m.id === exceptMid || !isStarSrc(m.src) || m.created_at < start || m.created_at > end) continue;
    const ri = m.receiver_ids || [];
    if (ri.length === 1 && ri[0] === rid) return true;
  }
  return false;
}
/** 「因為說明書收到的感謝」：寫給我的 pc／pc0 卡，新到舊 */
export function manualThanks(messages, me) {
  return messages.filter(m => m && isStarSrc(m.src) && (m.receiver_ids || []).length === 1 && m.receiver_ids[0] === me && m.author_id !== me)
    .sort((a, b) => b.created_at - a.created_at);
}

// ---------------------------------------------------------------- 說明書獎勵預估（和 functions/src/core.js profileEntries 同一套）
const trimmed = (s) => (typeof s === 'string' ? s.trim() : '');
export const charCount = (s) => Array.from(trimmed(s)).length;
export const normalizeText = (s) => trimmed(s).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
function cellOf(card, k) {
  if (!card) return '';
  if (k === 'work') return [trimmed(card.work && card.work.ok), trimmed(card.work && card.work.no)].filter(Boolean).sort((a, b) => charCount(b) - charCount(a))[0] || '';
  return trimmed(card[k]);
}
/** 這張卡目前可以拿到哪些說明書獎勵 key（不管拿過沒） */
export function profileKeys(card) {
  const out = [], filled = [];
  for (const k of PC_REWARD_FIELDS) {
    if (k === 'stress') continue;
    const v = cellOf(card, k);
    if (charCount(v) >= PC_MIN) { out.push(`pc_cell_${k}`); filled.push(normalizeText(v)); }
  }
  if (new Set(filled).size >= PC_DONE_CELLS) out.push('pc_done');
  return out;
}
/**
 * 儲存之後，這次新亮起的光點：have＝已經拿過的 key（帳本或這台裝置記下的）。
 * 回傳 { cells: 新的格子數, done: 是否這次裝訂完成, amount }
 */
export function newProfileRewards(card, have) {
  const got = new Set(have || []);
  const keys = profileKeys(card).filter(k => !got.has(k));
  const cells = keys.filter(k => k.startsWith('pc_cell_')).length;
  const done = keys.includes('pc_done');
  return { keys, cells, done, amount: cells * AMOUNT.pc_cell + (done ? AMOUNT.pc_done : 0) };
}

// ---------------------------------------------------------------- 帳本 → 畫面
const LABELS = (BANK.labels && BANK.labels.reasons) || {};
/** ledger 一筆 → 故事口吻的原因（文案「帳本原因」表） */
export function reasonText(key, e) {
  const r = e && e.r;
  if (r === 'ev') { const code = String(key || '').replace(/^ev_ev26_/, '').replace(/_x$/, ''); return LABELS[`ev26.${code}`] || '你拾起了一座星座的光'; }
  return LABELS[r] || '一點光';
}
/** 帳本 → 存摺：餘額＝加總（wallet 讀不到時用），最近 n 筆 */
export function passbook(ledger, n = 4) {
  const rows = Object.entries(ledger || {}).filter(([, v]) => v && typeof v.a === 'number').map(([k, v]) => ({ key: k, a: v.a, t: Number(v.t) || 0, text: reasonText(k, v) }));
  rows.sort((a, b) => b.t - a.t || (a.key < b.key ? 1 : -1));
  return { total: rows.reduce((s, r) => s + r.a, 0), recent: rows.slice(0, n) };
}
/** 三座：帳本有 ev_ev26_* 或這台裝置記下了，就算亮 */
export function constellations({ ledger = {}, local = {}, now = 0 } = {}) {
  const has = (c) => !!(ledger[`ev_ev26_${c}`] && !ledger[`ev_ev26_${c}_x`]) || !!local[c];
  const open = (c) => now >= Number((EV_CODES[c] && EV_CODES[c].open) || { pick: SKY.start, link: SKY.act2, lab: SKY.act3, all3: SKY.act3 }[c]);
  const items = ['pick', 'link', 'lab'].map(c => ({ code: c, lit: has(c), open: open(c) }));
  return { items, all: items.every(i => i.lit), allClaimed: has('all3') };
}

// ---------------------------------------------------------------- 天燈（銀行沒上時的本機進度：同一天回來接著玩）
export const tpeDay = (ms) => Math.floor((ms + 8 * 3_600_000) / 86_400_000);
export function lanternProgress(saved, now) {
  const d = tpeDay(now);
  if (!saved || saved.d !== d || !Array.isArray(saved.done)) return { d, done: [], read: 0 };
  return { d, done: saved.done.filter(k => THEMES.some(t => t.k === k)).slice(0, 3), read: Math.max(0, Number(saved.read) || 0) };
}
export const fmtMD = (ms) => { const d = new Date(ms + 8 * 3_600_000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
