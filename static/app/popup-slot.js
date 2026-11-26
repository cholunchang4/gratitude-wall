// T113（6.6.1）一次開頁最多一個「自己跳出來」的東西（設計：design/填寫與模板提醒/設計規格.md 第 5 節）。
//
// 優先順序（數字小的先）：1 新同事歡迎視窗、2 點亮星空（開站說明／換幕／謝幕）、3 小舖開店公告、
// 4 手心的光（開站說明／每日浮卡）、5 小舖到期提醒、6「讓同事認得你」備援小卡。
//
// 用法（每個會自己跳的模組，在原本要 show 的地方）：
//   const r = slot.request('sky', 2, () => { markSeen(); open(); });   // show() 裡才記「看過」；不能出現時 return false
//   r === true  → 已經出現了
//   r === false → 這次開頁的名額已經被別人（或自己）用掉：什麼都不做、不記看過，下次開頁再排
//   r === null  → 排隊中：名額決定後，選中了才會呼叫 show()
// 資料比較晚才知道要不要跳的模組，可以先 slot.expect(id, prio) 佔位（等它決定，最多 maxWaitMs），決定不跳時 slot.pass(id)。
//
// 規則：
// - 牆面第一次載入完成（app.js 呼叫 slot.ready()）後 settleMs 才決定，挑已登記裡優先最高的；比它優先、還在決定中的（expect）會等，最多等到 maxWaitMs。
// - 優先 1（歡迎視窗）一登記就給，不等。
// - 名額決定之後才登記的：名額還沒被用掉就直接給；用掉了就回 false。
// - 被選中的關掉後，同一次開頁不再補下一個（包含同一個模組的下一個彈窗）。使用者自己按按鈕打開的不經過這裡。
// - 被選中的 show() 回傳 false（那一刻其實不能出現）：名額讓給下一個候選。

export function createSlot({ now = () => Date.now(), settleMs = 3000, maxWaitMs = 12000, setTimer = (f, ms) => setTimeout(f, ms) } = {}) {
  const cands = new Map();          // id → { prio, show, seq }
  const expects = new Map();        // id → prio（還在決定中）
  let readyAt = null, winner = null, seq = 0, timer = null, log = [];

  function grant(c, id) {
    winner = id;
    let ok;
    try { ok = c.show(); } catch (e) { console.error('[slot]', id, e); ok = false; }
    if (ok === false) { winner = null; log.push(`${id}:declined`); return false; }
    log.push(`${id}:shown`);
    cands.clear(); expects.clear();
    return true;
  }
  function schedule(ms) { if (timer) return; timer = setTimer(() => { timer = null; decide(); }, Math.max(0, ms)); }
  function decide() {
    if (winner || readyAt === null) return;
    const t = now() - readyAt;
    if (t < settleMs) { schedule(settleMs - t); return; }
    for (;;) {
      const list = [...cands.entries()].sort((a, b) => a[1].prio - b[1].prio || a[1].seq - b[1].seq);
      if (!list.length) { if (expects.size && t < maxWaitMs) schedule(Math.min(250, maxWaitMs - t)); return; }
      const [id, c] = list[0];
      const waitFor = [...expects.entries()].some(([eid, p]) => p < c.prio && !cands.has(eid));
      if (waitFor && t < maxWaitMs) { schedule(Math.min(250, maxWaitMs - t)); return; }
      cands.delete(id);
      if (grant(c, id)) return;
    }
  }
  return {
    /** 牆面第一次載入完成（只算第一次） */
    ready() { if (readyAt === null) { readyAt = now(); schedule(settleMs); } },
    request(id, prio, show) {
      if (winner) return false;
      if (prio <= 1) { cands.delete(id); expects.delete(id); return grant({ prio, show }, id) ? true : null; }
      if (readyAt !== null && now() - readyAt >= settleMs && !timer) {
        const higher = [...cands.values()].some(c => c.prio <= prio) || [...expects.entries()].some(([eid, p]) => p < prio && eid !== id && now() - readyAt < maxWaitMs);
        if (!higher) { expects.delete(id); const ok = grant({ prio, show }, id); return ok ? true : null; }
      }
      cands.set(id, { prio, show, seq: ++seq });
      expects.delete(id);
      decide();
      return winner === id ? true : (winner ? false : null);
    },
    expect(id, prio) { if (!winner && !cands.has(id)) expects.set(id, prio); },
    pass(id) { expects.delete(id); cands.delete(id); decide(); },
    taken: () => !!winner,
    /** 這次開頁的名額已經決定（給出去了，或牆面載入後 settle 時間到了、沒有人還在決定中）；測試用來等待 */
    settled: () => !!winner || (readyAt !== null && now() - readyAt >= settleMs && !cands.size && (!expects.size || now() - readyAt >= maxWaitMs)),
    winner: () => winner,
    /** 測試用：決定的經過 */
    log: () => log.slice(),
  };
}

// 整個頁面共用一份（app.js、sky.js、yp26.js、shop-ui.js、nudge.js 都 import 這支；保險起見也掛在 window 上，避免同一支檔案被載入兩次時各算各的）
export const slot = (typeof window !== 'undefined' && window.__gwSlot) || createSlot();
if (typeof window !== 'undefined') window.__gwSlot = slot;
