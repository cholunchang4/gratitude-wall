// T108「手心的光」的純邏輯（不碰資料庫、不碰畫面）。前台（活動頁）和 Cloud Functions（yp26Pick）共用同一份：
// 來源是 web/static/app/yp26/yp26-logic.js，rules/build_rules.py 原樣複製到 functions/src/yp26-logic.js（--check 會比對）。
// 所以這個檔案不能 import 任何東西，設定由呼叫的人傳進來。
//
// 「一張」＝一篇卡 × 一位收件人，key 是 `${mid}~${rid}`（rid 是通訊錄編號 u_xxx，不是 Firebase uid）。
// 收件人＝ri（6.1 起發文時寫的收件人編號）∪ 收件人欄位 r 的姓名比對（GDD H3：6.1 以前的卡只有姓名字串）。

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const validId = (s) => typeof s === 'string' && ID_RE.test(s);
export const pickKey = (mid, rid) => `${mid}~${rid}`;
export function parsePickKey(k) {
  const i = typeof k === 'string' ? k.indexOf('~') : -1;
  if (i < 0) return null;
  const mid = k.slice(0, i), rid = k.slice(i + 1);
  return validId(mid) && validId(rid) ? { mid, rid } : null;
}

/** 活動階段：before（還沒開始）／open（可以挑）／closed（封箱、唯讀頁）／over（入口收起來）。now 一律用伺服器時間。 */
export function phaseOf(now, cfg) {
  if (!cfg || !Number.isFinite(now)) return 'before';
  if (now < cfg.start) return 'before';
  if (now <= cfg.end) return 'open';
  if (now <= cfg.show_until) return 'closed';
  return 'over';
}

// ---------------------------------------------------------------- 姓名比對（GDD H3）
// 大小寫不分（含全形半形）、頭尾空白不算、中間連續空白當一個；要「完全等於」通訊錄姓名才算對到。
export function foldName(s) { return String(s == null ? '' : s).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase(); }

// 一定會切開的分隔符號：半形／全形逗號、頓號、斜線、&、分號。
const STRONG_SEP = /[,，、/／&＆;；]+/;
// 「和」「and」只有在整段對不到人、而且切開後每一段都對得到人時才切（避免切壞名字裡本來就有「和」的人，例如「王和平」）。
const WEAK_SEP = /\s*和\s*|\s+and\s+/i;

/** people：{ uid: { n, s } } → Map(折疊後的姓名 → [uid…]) */
export function nameIndex(people) {
  const idx = new Map();
  for (const [uid, p] of Object.entries(people || {})) {
    if (!p || typeof p.n !== 'string' || !validId(uid)) continue;
    const k = foldName(p.n);
    if (!k) continue;
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(uid);
  }
  return idx;
}
/** 名字 → 通訊錄編號。同名不只一位時：只有一位 active 就是他；否則對不到（不猜）。 */
function resolveName(name, idx, people) {
  const c = idx.get(foldName(name)) || [];
  if (c.length === 1) return c[0];
  if (c.length > 1) {
    const act = c.filter(u => people[u] && people[u].s === 'active');
    if (act.length === 1) return act[0];
  }
  return null;
}

/**
 * 收件人欄位 → [{ text, uid|null }]（照原本順序；「大家」和空白略過）。
 * idx 可以先用 nameIndex(people) 算好傳進來（清單很長時不用每張卡重算）。
 */
export function matchReceivers(r, people, idx = null) {
  people = people || {};
  idx = idx || nameIndex(people);
  const out = [];
  for (const raw of String(r == null ? '' : r).split(STRONG_SEP)) {
    const t = raw.trim();
    if (!t || t === '大家') continue;
    const uid = resolveName(t, idx, people);
    if (uid) { out.push({ text: t, uid }); continue; }
    const parts = t.split(WEAK_SEP).map(x => x.trim()).filter(Boolean);
    const uids = parts.length > 1 ? parts.map(p => resolveName(p, idx, people)) : [];
    if (uids.length && uids.every(Boolean)) parts.forEach((p, i) => out.push({ text: p, uid: uids[i] }));
    else out.push({ text: t, uid: null });
  }
  return out;
}

const riKeys = (ri) => (ri && typeof ri === 'object' ? Object.keys(ri).filter(k => ri[k] === true && validId(k)) : []);

/** 伺服器端驗證用：rid 是不是這張卡的收件人（ri 裡有，或姓名比對對到）。 */
export function isRecipient(msg, rid, people, idx = null) {
  if (!msg || !validId(rid)) return false;
  if (msg.ri && msg.ri[rid] === true) return true;
  return matchReceivers(msg.r, people, idx).some(x => x.uid === rid);
}

/**
 * 一篇卡展開成「一張一張」：[{ key, rid, name, state }]
 *  state：'ok'（可以挑）／'gone'（已不在通訊錄）／'unknown'（找不到這位同事，key、rid 是 null）
 *  寫給自己的那張不出現；同一位收件人只出現一次。
 * msg：{ r, ri }（ri 是 { uid: true } 物件或 uid 陣列都可以）
 */
export function expandCard(mid, msg, me, people, idx = null) {
  people = people || {};
  idx = idx || nameIndex(people);
  const ri = Array.isArray(msg && msg.ri) ? Object.fromEntries(msg.ri.map(u => [u, true])) : (msg && msg.ri) || {};
  const seen = new Set(), seenText = new Set(), out = [];
  const add = (uid, text) => {
    if (uid) {
      if (uid === me || seen.has(uid)) return;
      seen.add(uid);
      const p = people[uid];
      out.push({ key: pickKey(mid, uid), rid: uid, name: (p && p.n) || text || '', state: p && p.s === 'active' ? 'ok' : 'gone' });
    } else {
      const f = foldName(text);
      if (!f || seenText.has(f)) return;
      seenText.add(f);
      out.push({ key: null, rid: null, name: text, state: 'unknown' });
    }
  };
  for (const x of matchReceivers(msg && msg.r, people, idx)) add(x.uid, x.text);
  for (const uid of riKeys(ri)) add(uid, '');
  return out;
}

/** 自己的挑選（yp26/pick/{我}）→ 有效的 key 清單（依挑的時間排序） */
export function pickList(picks) {
  return Object.entries(picks && typeof picks === 'object' ? picks : {})
    .filter(([k]) => parsePickKey(k))
    .sort((a, b) => (Number(a[1] && a[1].t) || 0) - (Number(b[1] && b[1].t) || 0) || (a[0] < b[0] ? -1 : 1))
    .map(([k]) => k);
}
