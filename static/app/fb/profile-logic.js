// T098 個人資料卡「我的使用說明書」＋頭像：純函式（不碰 Firebase、不碰畫面），前台和測試共用。
// 九格標題、提示文字：design/個人資料卡/PC-標題定稿.md（P&C 2026-11-01 定稿）。要換字只改 FIELDS。
// 字數上限、頭像大小上限在 rules/wall-constants.json（profile），規則（database.rules.json）在伺服器端再檢查一次。
import { K } from './constants.js';
import { TS, WallError, auditEntry } from './writes.js';
import { countWords } from './wordcount.js';

export const P = K.PROFILE;

// 畫面上的順序固定（＝範本由左而右、由上而下）：1 在乎 → 2 成就感 → 3 動力 → 4 超能力 → 7 小撇步 → 5 能幫團隊 → 6 想學 → 8 卡關
export const FIELDS = Object.freeze([
  { k: 'care', t: '我很在乎的事', max: P.field_max, ph: '例：說好的事就做到；有變化，我會提早講。' },
  { k: 'proud', t: '讓我有成就感的事', max: P.field_max, ph: '例：自己摸索，把每週報表從半天縮到十分鐘。' },
  { k: 'motiv', t: '讓我有動力的是', max: P.field_max, ph: '例：卡很久的問題終於解開的那一刻。' },
  { k: 'power', t: '我的超能力', max: P.field_max, ph: '例：很會把複雜的事講成三句話。小事也算喔！' },
  { k: 'work', t: '跟我合作的小撇步', max: P.work_max, dd: true,
    ok: { t: '這樣我很 OK', ph: '例：急事直接打電話，我在外面不一定會看訊息。' },
    no: { t: '這樣我會卡住', ph: '例：只丟一句「在嗎？」，我會不知道要準備什麼。' } },
  { k: 'contrib', t: '我能幫團隊的地方', max: P.field_max, ph: '例：系統設定我滿熟的，有問題可以來問我。' },
  { k: 'learn', t: '我想學的事', max: P.field_max, ph: '例：Excel 樞紐分析、簡報說故事，或是日文。' },
  { k: 'stress', t: '我卡關時，可以這樣幫我', max: P.field_max, ph: '例：直接問我「要不要幫你分一點？」就很好。', help: '寫希望大家怎麼做就好，不用說原因。' },
]);

const BAD = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

// 一格的文字：去掉控制字元、頭尾空白；3 個以上連續換行壓成 2 個（最多空一行）
export function cleanField(v) {
  let s = v == null ? '' : String(v);
  s = s.replace(LONE, '').replace(/\r\n?/g, '\n').replace(BAD, '');
  s = s.split('\n').map(l => l.replace(/[ \t]+$/g, '')).join('\n').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}
// 字數（T107 起和留言同一套：中日韓每字 1、英文每個單字 1、emoji 1、空白標點不算）。
// 輸入框 maxlength 與資料庫規則只擋字元數（上限 × 8），精確字數在這裡檢查。
const charCap = (n) => n * (Number(K.LIMITS.char_factor) || 8);   // 不從 logic.js 拿：避免上線後 10 分鐘內新舊檔混用（快取）時載入失敗
export const countChars = (s) => countWords(String(s || ''));
export const maxChars = (max) => charCap(max);
const tooLong = (s, max) => countChars(s) > max || s.length > charCap(max);

// 從資料庫讀到的卡 → 畫面用的形狀（只留認得的欄位、型別不對的當沒填）
export function normalizeCard(raw) {
  const out = { work: { ok: '', no: '' }, t: 0 };
  for (const k of P.fields) out[k] = raw && typeof raw[k] === 'string' ? raw[k] : '';
  const w = raw && raw.work && typeof raw.work === 'object' ? raw.work : {};
  for (const k of P.work_fields) out.work[k] = typeof w[k] === 'string' ? w[k] : '';
  out.t = raw && Number.isFinite(Number(raw.t)) ? Number(raw.t) : 0;
  return out;
}
export function isFilled(card, f) {
  if (!card) return false;
  if (f.dd) return !!(card.work && (String(card.work.ok || '').trim() || String(card.work.no || '').trim()));
  return !!String(card[f.k] || '').trim();
}
export const filledFields = (card) => FIELDS.filter(f => isFilled(card, f));

// 編輯畫面送出的值 → 要寫進 pc/{uid} 的內容（全部空白＝null，等於刪除）。超過字數直接擋下（輸入框 maxlength 只擋字元數安全網，字數在這裡和畫面上檢查）
export function buildCardValue(input) {
  const v = {};
  for (const k of P.fields) {
    const s = cleanField(input && input[k]);
    if (tooLong(s, P.field_max)) throw new WallError(400, 'TOO_LONG', `「${FIELDS.find(f => f.k === k).t}」最多 ${P.field_max} 個字。`);
    if (s) v[k] = s;
  }
  const w = {};
  const src = (input && input.work) || {};
  for (const k of P.work_fields) {
    const s = cleanField(src[k]);
    if (tooLong(s, P.work_max)) throw new WallError(400, 'TOO_LONG', `「${FIELDS[4][k].t}」最多 ${P.work_max} 個字。`);
    if (s) w[k] = s;
  }
  if (Object.keys(w).length) v.work = w;
  if (!Object.keys(v).length) return null;
  v.t = TS;
  return v;
}
export function cardEquals(a, b) {
  const A = normalizeCard(a), B = normalizeCard(b);
  return P.fields.every(k => cleanField(A[k]) === cleanField(B[k])) && P.work_fields.every(k => cleanField(A.work[k]) === cleanField(B.work[k]));
}

const ID_OK = /^[A-Za-z0-9_-]{1,64}$/;
const AV_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
export function avatarOk(d, max) { return typeof d === 'string' && d.length <= max && AV_RE.test(d); }

// 儲存資料卡：文字＋（選擇移除頭像時）一起刪頭像三個節點
export function buildSaveCard(meId, input, { removeAvatar = false } = {}) {
  if (!ID_OK.test(meId || '')) throw new WallError(403, 'DENIED', '找不到你的通訊錄資料，請重新整理頁面後再試一次。');
  const up = { [`pc/${meId}`]: buildCardValue(input) };
  if (removeAvatar) Object.assign(up, buildRemoveAvatar(meId));
  return up;
}
export function buildSetAvatar(meId, small, large) {
  if (!ID_OK.test(meId || '')) throw new WallError(403, 'DENIED', '找不到你的通訊錄資料，請重新整理頁面後再試一次。');
  if (!avatarOk(small, P.avatar_small_max) || !avatarOk(large, P.avatar_large_max)) throw new WallError(400, 'BAD_IMAGE', '頭像處理失敗，請換一張圖再試一次。');
  return { [`avs/${meId}`]: { d: small, t: TS }, [`avl/${meId}`]: { d: large, t: TS }, [`avv/${meId}`]: TS };
}
export function buildRemoveAvatar(uid) { return { [`avs/${uid}`]: null, [`avl/${uid}`]: null, [`avv/${uid}`]: null }; }

// 管理員清除別人的卡或頭像（不當內容處理用），留下稽核紀錄
export function buildAdminClear(adminId, uid, what, now) {
  if (!ID_OK.test(uid || '')) throw new WallError(400, 'BAD_REQUEST', '送出的資料格式不正確。');
  const up = what === 'avatar' ? buildRemoveAvatar(uid) : { [`pc/${uid}`]: null };
  const [k, v] = auditEntry(now, { actor: adminId, action: what === 'avatar' ? 'admin.avatar.clear' : 'admin.profile.clear', targetType: 'user', targetId: uid });
  up[k] = v;
  return up;
}

// 台灣時間的日期字串
export function tpeDate(ms, withTime = false) {
  const d = new Date(Number(ms) + 8 * 3600000);
  const p = (n) => String(n).padStart(2, '0');
  const s = `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}`;
  return withTime ? `${s} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : s;
}

// 裁切：圖片在畫布上的位置（ox, oy＝圖片左上角，單位是畫布座標）限制在「圓圈範圍一定被圖片蓋滿」
// stage＝畫布邊長；inset＝圓圈內縮比例（設計稿 8%）；base＝讓短邊剛好塞滿圓圈的縮放；zoom 1～3
export function cropClamp({ w, h, stage, zoom, ox, oy, inset = 0.08 }) {
  const c0 = stage * inset, c1 = stage * (1 - inset), d = c1 - c0;
  const base = d / Math.min(w, h), s = base * zoom;
  const W = w * s, H = h * s;
  const cx = Math.min(c0, Math.max(c1 - W, ox)), cy = Math.min(c0, Math.max(c1 - H, oy));
  return { ox: cx, oy: cy, scale: s, W, H, c0, c1 };
}
// 輸出時要從原圖裁的範圍（原圖像素座標）
export function cropSource({ w, h, stage, zoom, ox, oy, inset = 0.08 }) {
  const c = cropClamp({ w, h, stage, zoom, ox, oy, inset });
  const sx = (c.c0 - c.ox) / c.scale, sy = (c.c0 - c.oy) / c.scale, sw = (c.c1 - c.c0) / c.scale;
  return { sx, sy, sw, sh: sw };
}

// 選檔的檢查（前端先擋，規則再擋輸出後的大小）
export const AVATAR_INPUT_MAX = 5 * 1024 * 1024;
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export function checkAvatarFile(file) {
  if (!file) return { ok: false, kind: 'none' };
  const ext = (/\.([A-Za-z0-9]{1,8})$/.exec(file.name || '') || [, ''])[1].toLowerCase();
  if (!AVATAR_TYPES.includes(file.type)) return { ok: false, kind: 'type', ext };
  if (file.size > AVATAR_INPUT_MAX) return { ok: false, kind: 'size', mb: Math.round(file.size / 1024 / 102.4) / 10 };
  return { ok: true };
}
