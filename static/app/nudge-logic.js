// T113（6.6.1）「讓同事認得你」小卡＋樣式小提示：純函式（不碰畫面、不碰 Firebase），前台與單元測試共用。
// 規格：design/填寫與模板提醒/設計規格.md 第 3、4、6 節；報告-美術.md「文案定稿」。
//
// 次數紀錄存在本人 prefs（換裝置也算）：
//   nd_log  = 'n,last,snooze,ln,lday'   小卡總次數、最後出現日、先不要到哪天（含）、備援次數、備援最後日（日期都是 yyyymmdd，台灣日期、伺服器時間）
//   tpl_tip = 'n,yyyymmdd'              樣式小提示出現過幾天、最後一天
//   tpl_seen = '1'                      打開過樣式選單（之後光點、提示都不再出現）

export const LIMITS = Object.freeze({
  cardMax: 4,          // 小卡總共 4 次就停（之後只留原地提示）
  snoozeDays: 3,       // 按 ✕／先不要／Esc：接下來 3 天不出現
  fallbackMax: 2,      // 備援（開頁）最多 2 次
  fallbackGap: 7,      // 兩次備援至少隔 7 天；備援也要最近 7 天沒出現過小卡
  tipDays: 4,          // 樣式小提示總共 4 天
});

const DAY = 86_400_000, TPE = 8 * 3_600_000;
/** 伺服器時間 → 台灣日期 yyyymmdd（數字） */
export function dayOf(ms) {
  const d = new Date(Math.floor((ms + TPE) / DAY) * DAY);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}
const idx = (ymd) => Math.round(Date.UTC(Math.floor(ymd / 10000), Math.floor(ymd / 100) % 100 - 1, ymd % 100) / DAY);
/** 兩個 yyyymmdd 相差幾天（b − a） */
export const daysBetween = (a, b) => idx(b) - idx(a);
export function addDays(ymd, k) {
  const d = new Date((idx(ymd) + k) * DAY);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

const num = (s) => { const n = Number(s); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0; };
/** nd_log 字串 → 物件（壞掉的值一律當 0，不會讓提醒卡住或狂跳） */
export function parseLog(s) {
  const p = String(s || '').split(',');
  return { n: num(p[0]), last: num(p[1]), snooze: num(p[2]), ln: num(p[3]), lday: num(p[4]) };
}
export const formatLog = (g) => [g.n, g.last || '', g.snooze || '', g.ln, g.lday || ''].join(',');
export function parseTip(s) { const p = String(s || '').split(','); return { n: num(p[0]), day: num(p[1]) }; }
export const formatTip = (t) => `${t.n},${t.day}`;

/** 缺哪個：'both'（都沒做）、'av'（只缺頭像）、'pc'（只缺說明書）、null（都做了） */
export function variantOf({ hasCard, hasAvatar }) {
  if (hasCard && hasAvatar) return null;
  if (!hasCard && !hasAvatar) return 'both';
  return hasAvatar ? 'pc' : 'av';
}

/** 小卡今天能不能出現。fallback＝開頁備援（條件更嚴）。 */
export function canShowCard(logStr, today, { fallback = false } = {}) {
  const g = parseLog(logStr);
  if (g.n >= LIMITS.cardMax) return false;
  if (g.last && g.last >= today) return false;                 // 每天最多 1 次（換裝置也算）
  if (g.snooze && today <= g.snooze) return false;             // 先不要：到 snooze 那天（含）都不出現
  if (fallback) {
    if (g.ln >= LIMITS.fallbackMax) return false;
    if (g.lday && daysBetween(g.lday, today) < LIMITS.fallbackGap) return false;
    if (g.last && daysBetween(g.last, today) < LIMITS.fallbackGap) return false;   // 最近 7 天出現過小卡（任何時機）就不用備援
  }
  return true;
}
/** 小卡出現的當下：次數 +1、記今天（備援另外記） */
export function markCardShown(logStr, today, { fallback = false } = {}) {
  const g = parseLog(logStr);
  g.n += 1; g.last = today;
  if (fallback) { g.ln += 1; g.lday = today; }
  return formatLog(g);
}
/** 按 ✕／先不要／Esc：接下來 3 天不出現（次數在出現時已經加過，不重複加） */
export function markSnooze(logStr, today) {
  const g = parseLog(logStr);
  g.snooze = addDays(today, LIMITS.snoozeDays);
  return formatLog(g);
}

/** 樣式小提示今天能不能出現 */
export function canShowTip(tipStr, today, tplSeen) {
  if (String(tplSeen || '') === '1') return false;
  const t = parseTip(tipStr);
  return t.n < LIMITS.tipDays && t.day !== today;
}
export function markTipShown(tipStr, today) {
  const t = parseTip(tipStr);
  if (t.day === today) return formatTip(t);
  return formatTip({ n: t.n + 1, day: today });
}

// ---------------------------------------------------------------- 文案（報告-美術.md「文案定稿」，逐字）
export const KICKER = Object.freeze({ send: '卡片送出了', recv: '有人謝謝你', load: '一個小邀請' });
export const SKY_LINE = '點亮星空期間（到 11/30），同事從說明書按「寫感謝卡給他」寫的卡，會點亮夜空裡的星。';

/**
 * 小卡內容。when＝'send'｜'recv'｜'load'；skyOn＝伺服器時間還在點亮星空期間（到 11/30 23:59:59）。
 * 回傳 { v, t, d, rows?, go?, act?, sig?, sky? }；act＝'avatar'（選照片）或 'editor'（說明書編輯）。
 */
export function cardContent(variant, when, skyOn) {
  if (variant === 'both') return {
    v: 'both', t: '讓同事一眼認出你',
    d: '放張頭像、寫幾句使用說明書，同事更知道怎麼跟你合作，寫卡給你也更容易。',
    rows: [{ ic: 'camera', b: '放一張頭像', s: '牆上你的名字旁，就會是你', act: 'avatar' },
           { ic: 'book', b: '寫一格使用說明書', s: '寫一格就好，想到再補', act: 'editor' }],
  };
  if (variant === 'av') return {
    v: 'av', t: '放一張頭像，讓大家認出你',
    d: when === 'send' ? '收到卡的人會在署名旁看到你的頭像。放一張照片或喜歡的圖，大家一眼就認出是你。'
      : '你的使用說明書寫好了。再放一張照片或喜歡的圖，牆上、說明書上就都是你。',
    sig: when === 'send', go: '選一張照片', act: 'avatar',
  };
  if (variant === 'pc') return {
    v: 'pc', t: '寫幾句你的使用說明書',
    d: '像是「我的超能力」或「跟我合作的小撇步」，寫一格就好。同事讀完，更知道怎麼跟你合作、要謝你什麼。',
    sky: !!skyOn, go: '寫第一格', act: 'editor',
  };
  return null;
}

/** 樣式小提示的內文（HTML 片段；名稱與數字由呼叫端提供、這裡負責跳脫） */
export function tipText(themeName, isEvent, n) {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  return `現在用的是${isEvent ? '活動款' : ''}<b>「${esc(themeName)}」</b>。點「樣式」，還有 <b>${Number(n) || 0}</b> 款可以挑。`;
}

/** 撰寫區頭像的 aria-label */
export function avatarLabel(name, { hasCard, hasAvatar }) {
  const miss = [!hasAvatar && '還沒放頭像', !hasCard && '使用說明書還空著'].filter(Boolean);
  return `我的帳號：${name}${miss.length ? `（${miss.join('、')}）` : ''}`;
}
