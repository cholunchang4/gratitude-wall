// 6.6 版頭「找同事」：搜尋規則（純函式，沒有 DOM、沒有 Firebase；Node 單元測試直接 import）。
// 設計：game-design/好友系統-v1.md 第 1.2 節。只用通訊錄已載入的姓名（people 的 n、s），不讀任何新資料。
// 排序只看「名字和關鍵字有多像」與姓名本身，不看寫卡數、等級、有沒有填說明書。
import { suggestName } from './fb/logic.js';

export const MAX_RESULTS = 8;
export const MAX_QUERY = 40;

/** 比對用的寫法：全形半形一致、英文不分大小寫、去掉空白（「mary chen」「MaryChen」「ｍａｒｙ」都對得到） */
export const fold = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');

/** 使用者打的字：去頭尾空白、去控制字元、最多 MAX_QUERY 字 */
export function cleanQuery(q) {
  return Array.from(String(q ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, MAX_QUERY).join('');
}

const collator = (() => { try { return new Intl.Collator('zh-Hant-TW', { sensitivity: 'base', numeric: true }); } catch (e) { return null; } })();
const byName = (a, b) => (collator ? collator.compare(a.name, b.name) : (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);

/**
 * 符合程度：0＝名字開頭就符合、1＝某個英文字（或括號裡的字）開頭符合、2＝包含；不符合回 -1。
 * 例：「chen」對「Mary Chen」是 1；「ry」是 2。
 */
export function matchTier(name, fq) {
  if (!fq) return -1;
  const fn = fold(name);
  if (fn.startsWith(fq)) return 0;
  const words = String(name).normalize('NFKC').toLowerCase().split(/[\s,，.\-_/()（）[\]【】]+/).filter(Boolean);
  if (words.some(w => w.startsWith(fq))) return 1;
  return fn.includes(fq) ? 2 : -1;
}

/**
 * people：[{ user_id, display_name }]（store.activeUsers()，已經只剩 active 的人）。
 * 回傳 { q, results: [{ uid, name, self }]（最多 limit 筆）, more: 沒顯示的筆數, suggest: { uid, name, self } | null }
 * suggest：完全找不到時，相近的名字（沿用撰寫區收件人確認的 suggestName：差 1 個字、兩字對調、6 字以上差 2 個字）。
 */
export function searchPeople(query, people, { meId = '', limit = MAX_RESULTS } = {}) {
  const q = cleanQuery(query), fq = fold(q);
  const out = { q, results: [], more: 0, suggest: null };
  if (!fq) return out;
  const list = [];
  for (const p of people || []) {
    const uid = p && p.user_id, name = p && String(p.display_name || '').trim();
    if (!uid || !name) continue;
    const tier = matchTier(name, fq);
    if (tier >= 0) list.push({ uid, name, self: uid === meId, tier });
  }
  list.sort((a, b) => a.tier - b.tier || byName(a, b));
  out.results = list.slice(0, limit).map(({ uid, name, self }) => ({ uid, name, self }));
  out.more = Math.max(0, list.length - limit);
  if (!list.length) {
    const names = (people || []).map(p => String((p && p.display_name) || '').trim()).filter(Boolean);
    const s = suggestName(q, names);
    if (s) {
      const hit = (people || []).find(p => String(p.display_name || '').trim() === s);
      if (hit) out.suggest = { uid: hit.user_id, name: s, self: hit.user_id === meId };
    }
  }
  return out;
}

/** 名字裡和關鍵字相同的那一段（只處理「原樣包含、不分大小寫」的情況；全形或去空白才對得到的就不標） */
export function highlightRange(name, query) {
  const q = cleanQuery(query).toLowerCase(), n = String(name), ln = n.toLowerCase();
  if (!q || ln.length !== n.length) return null;   // 少數字母轉小寫後長度會變，位置對不上就不標
  const i = ln.indexOf(q);
  return i < 0 ? null : [i, i + q.length];
}
