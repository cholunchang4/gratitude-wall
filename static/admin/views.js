// 所有分頁的畫面（只負責畫，不呼叫 API；按鈕的動作由 actions.js 處理）
import { $, h, s, agoText } from './util.js';
import { st, nowMs } from './state.js';
import * as M from './model.js';
import { actions } from './actions-registry.js';
import { renderArchive } from './archive.js';

const { norm, fmtDT, levelOf, safeImg, inEvent, LEVELS, HW_THEME, tp } = M;
const PAGE = 100;

export function kpi(label, num, foot, opts = {}) {
  return h('div', { class: 'kpi' + (opts.key ? ' key' : '') + (opts.danger ? ' danger' : ''), id: opts.id },
    h('div', { class: 'k-label' }, label, opts.key ? h('span', { class: 'tag tag-key' }, '最重要 KPI') : null, opts.est ? h('span', { class: 'tag tag-est', title: opts.est }, '估算') : null),
    h('div', { class: 'k-num', 'data-value': opts.value ?? num }, num, opts.unit ? h('small', null, ' ' + opts.unit) : null),
    foot ? h('div', { class: 'k-foot' }, foot) : null);
}

export function resetPage(k) { st.pages[k] = 1; }
export function pagedRows(key, rows, tbody, moreEl, cols, rowFn, emptyText) {
  const page = st.pages[key] || 1, shown = rows.slice(0, page * PAGE);
  tbody.replaceChildren(...(shown.length ? shown.map(rowFn) : [h('tr', null, h('td', { colspan: cols, class: 'empty' }, emptyText))]));
  moreEl.replaceChildren(rows.length > shown.length ? h('button', { class: 'btn btn-sm', onclick: () => { st.pages[key] = page + 1; st.render(); } }, `顯示更多（還有 ${rows.length - shown.length} 筆）`) : '');
}

// ================= 全站：登入狀態橫幅、階段標籤 =================
const AUTH_REASON = {
  invalid_grant: '登入憑證已過期或被撤銷', token_expired: '登入憑證已過期', revoked: '登入憑證已被撤銷',
  refresh_failed: '換發登入憑證失敗', network: '連不到 Google 或換證服務', missing_env: '伺服器缺少必要的設定',
};
export function authReasonText(code) { return code ? (AUTH_REASON[code] || '原因代碼 ' + code) : ''; }
export const BACKUP_WARN_MS = 26 * 3600 * 1000;  // 每日備份：超過 26 小時沒有新備份＝黃
export const BACKUP_BAD_MS = 50 * 3600 * 1000;   // 超過 50 小時＝紅
export const SYNC_WARN_MS = 10 * 60 * 1000;      // 超過 10 分鐘沒有和試算表同步＝黃
export const QUEUE_WARN_MS = 5 * 60 * 1000;      // 佇列有東西且超過 5 分鐘沒寫入＝黃
export function serverBackup(hl) { return hl && hl.backup && typeof hl.backup === 'object' && ('status' in hl.backup || 'red' in hl.backup) ? hl.backup : null; }
export function backupAt(hl) { const sb = serverBackup(hl); return (sb && sb.last_backup_at) ?? (hl && hl.last_backup_at) ?? null; }
// 優先採用伺服器判定（backup.red／backup.status，超過 36 小時沒成功備份轉紅）；伺服器沒回這兩個欄位才用本地門檻 26／50 小時
export function backupLevel(hl, now) {
  const sb = serverBackup(hl);
  if (sb) {
    if (sb.red === true || sb.status === 'failing' || sb.status === 'overdue') return 'bad';
    if (sb.status === 'ok' || (sb.status === undefined && sb.red === false)) return 'ok';
    return 'warn'; // none_yet 或沒見過的狀態：還沒有備份，提醒但不算紅
  }
  const at = backupAt(hl);
  if (!at) return 'bad';
  const age = now - at;
  return age > BACKUP_BAD_MS ? 'bad' : age > BACKUP_WARN_MS ? 'warn' : 'ok';
}
// 每一個檢查項目的狀態：{ key, level: ok|warn|bad }
export function healthItems(hl, now) {
  if (!hl) return [];
  if (hl.env === 'firebase') return [{ key: 'conn', level: hl.firebase_connected === false ? 'bad' : 'ok' }];
  const auth = hl.google_auth;
  const stuck = hl.queue_length > 0 && (!hl.last_commit_at || now - hl.last_commit_at > QUEUE_WARN_MS);
  return [
    { key: 'auth', level: auth === 'ok' ? 'ok' : auth === 'degraded' ? 'warn' : 'bad' },
    { key: 'google', level: hl.google_ok === false ? 'bad' : 'ok' },
    { key: 'ready', level: hl.ready === false ? 'warn' : 'ok' },
    { key: 'backup', level: backupLevel(hl, now) },
    { key: 'commit', level: 'ok' },
    { key: 'sync', level: !hl.last_sync_at || now - hl.last_sync_at > SYNC_WARN_MS ? 'warn' : 'ok' },
    { key: 'queue', level: stuck ? 'warn' : 'ok' },
  ];
}
export function worstLevel(hl, now, healthError) {
  const lv = healthItems(hl, now).map(i => i.level);
  if (lv.includes('bad')) return 'bad';
  if (lv.includes('warn') || healthError) return 'warn';
  return 'ok';
}
const MAINTAINER = '系統維護者';
function alertIcon() {
  return s('svg', { class: 'gb-icon', viewBox: '0 0 24 24', width: 22, height: 22, 'aria-hidden': 'true', focusable: 'false' }, undefined);
}
function iconSvg() {
  const svg = alertIcon();
  svg.append(s('circle', { cx: 12, cy: 12, r: 10, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }), s('line', { x1: 12, y1: 7, x2: 12, y2: 13, stroke: 'currentColor', 'stroke-width': 2.4, 'stroke-linecap': 'round' }), s('circle', { cx: 12, cy: 16.8, r: 1.4, fill: 'currentColor' }));
  return svg;
}
function banner(level, head, rest, role) {
  return h('div', { class: 'banner banner-' + level + ' gb', id: 'googleBannerMsg', role },
    iconSvg(),
    h('div', { class: 'gb-text' }, h('b', null, head), rest ? ' ' + rest : ''),
    h('button', { class: 'btn btn-sm gb-btn', id: 'gbDetailBtn', onclick: () => actions.openSystem() }, '查看系統狀態'));
}

function renderGoogleBanner(now) {
  const box = $('googleBanner'), hl = st.health;
  let el = null;
  const why = hl ? authReasonText(hl.google_auth_reason || hl.google_auth_code) : '';
  if (hl && hl.env === 'firebase') el = hl.firebase_connected === false ? banner('bad', '和 Firebase 的連線中斷了。', '畫面上的資料可能不是最新，連線恢復後會自動更新；這段時間的修改會在連線恢復後才送出。', 'alert') : null;
  else if (st.healthError) el = banner('warn', '暫時取不到系統狀態。', 'Google 登入是否正常目前不明，畫面上的資料可能不是最新。', 'status');
  else if (hl && hl.google_auth === 'failed') el = banner('bad', 'Google 登入已失效。', `${why ? why + '。' : ''}新的留言和後台的修改目前都存不進試算表，請通知${MAINTAINER}重新授權；授權之前不用重複操作。`, 'alert');
  else if (hl && hl.google_auth === 'degraded') el = banner('warn', 'Google 登入狀態不穩，系統目前是唯讀。', `${why ? why + '。' : ''}看得到資料，但新增和修改可能失敗，請通知${MAINTAINER}檢查登入。`, 'alert');
  else if (hl && hl.ready === false) el = banner('warn', '伺服器還在啟動中。', '資料可能還不完整，請過一會兒再重新整理。', 'status');
  box.classList.toggle('open', !!el);
  box.replaceChildren(...(el ? [el] : []));
  const lvl = worstLevel(hl, now, st.healthError);
  const b = $('sysBadge');
  b.hidden = lvl === 'ok'; b.textContent = '!';
  b.className = 'count' + (lvl === 'warn' ? ' count-warn' : '');
  b.setAttribute('aria-label', lvl === 'bad' ? '系統狀態有異常' : '系統狀態不穩');
  if (lvl === 'bad' && !st.badgeSeen) { st.badgeSeen = true; $('tab-system').scrollIntoView({ block: 'nearest', inline: 'center' }); }
  if (lvl === 'ok') st.badgeSeen = false;
}

// 頂端的活動標籤：目前沒有進行中的活動就不顯示（結束的活動統計在「已結束活動」分頁）
function renderPhase() { $('phasePill').hidden = true; }

export function renderAll() {
  if (!st.data) return;
  const now = nowMs();
  renderPhase();
  renderGoogleBanner(now);
  const le = $('loadError');
  le.hidden = !st.errors.bootstrap;
  le.textContent = st.errors.bootstrap ? '重新整理資料失敗（網路中斷或伺服器忙碌），目前畫面可能不是最新的。系統會自動重試，也可以手動重新整理頁面。' : '';
  const Mo = M.computeModel(st.data, now);
  renderOverview(Mo, now);
  renderArchive(Mo);
  renderMessages(Mo);
  renderContacts(Mo);
  renderSettingsInfo();
  renderAudit();
  renderSystem(now);
}

// ================= 總覽 =================
function renderOverview(Mo, now) {
  const S = st.data, msgs = S.messages;
  const people = [...Mo.people.values()];
  $('ovKpis').replaceChildren(
    kpi('歷史累積留言', msgs.length, `其中附圖 ${msgs.filter(m => m.image).length} 則`, { id: 'kpiTotal' }),
    kpi('曾經發文的人數', people.filter(p => p.msgs.length).length, '匿名卡算回真實發文者'),
    kpi('通訊錄人數', S.contacts.length, `從未發文 ${S.contacts.length - Mo.postedContactIdx.size} 人`),
    kpi('本月留言', msgs.filter(m => { const a = tp(m.timestamp), b = tp(now); return a.y === b.y && a.mo === b.mo; }).length, '台灣時間本月 1 號起（就是牆面上顯示的範圍）', { id: 'kpiMonth' }));
  calculateRangeCount();
  $('levelTable').replaceChildren(...LEVELS.map(L => h('tr', { class: L.hidden ? 'hidden-row' : '' },
    h('td', null, `${L.min} 則`), h('td', null, `${L.icon} Lv.${L.lv} ${L.name}`, L.hidden ? h('span', { class: 'tag tag-muted ml-6' }, '隱藏等級') : null), h('td', null, L.unlock))),
    h('tr', { class: 'admin-row' }, h('td', null, '管理員'), h('td', null, '🛡️ 系統管理員'), h('td', null, '無視所有限制、2000 字上限、全套外觀與專屬徽章')));
  const q = norm($('userSearch').value);
  const rows = people.filter(p => p.msgs.length).sort((a, b) => b.exp - a.exp || b.total - a.total)
    .map((p, i) => ({ p, rank: i + 1 })).filter(x => !q || norm(x.p.name).includes(q));
  $('userStatsList').replaceChildren(...(rows.length ? rows.map(({ p, rank }) => {
    const L = levelOf(p.exp);
    const badge = p.isAdmin ? h('span', { class: 'lv admin' }, '🛡️ 系統管理員') : h('span', { class: 'lv' + (L.hidden ? ' hidden-lv' : '') }, `${L.icon} Lv.${L.lv} ${L.name}`);
    return h('tr', null, h('td', { class: 'num' }, `#${rank}`), h('td', null, h('b', null, p.name)), h('td', { class: 'num' }, h('b', null, p.exp)), h('td', { class: 'num' }, p.total), h('td', null, badge),
      h('td', null, p.contactIdx >= 0 ? h('span', { class: 'tag tag-ok' }, '在名單') : h('span', { class: 'tag tag-bad' }, '不在名單')));
  }) : [h('tr', null, h('td', { colspan: 6, class: 'empty' }, q ? '找不到符合的使用者' : '目前沒有任何資料'))]));
}

export function calculateRangeCount() {
  if (!st.data) return;
  const a = $('startDate').value, b = $('endDate').value;
  const t0 = a ? new Date(a + 'T00:00:00+08:00').getTime() : -Infinity;
  const t1 = b ? new Date(b + 'T23:59:59.999+08:00').getTime() : Infinity;
  $('rangeMsgCount').textContent = st.data.messages.filter(m => m.timestamp >= t0 && m.timestamp <= t1).length;
}

// ================= 留言管理 =================
function renderMessages(Mo) {
  const f = $('msgFilter').value, q = norm($('msgSearch').value);
  const base = f === 'deleted' ? st.data.allMessages.filter(m => m.deleted) : st.data.messages;
  const rows = [...base].sort((a, b) => b.timestamp - a.timestamp).filter(m => {
    if (f === 'event' && !inEvent(m.timestamp)) return false;
    if (f === 'anon' && !m.anon) return false;
    if (f === 'hw' && m.theme !== HW_THEME) return false;
    if (f === 'image' && !m.image) return false;
    if (!q) return true;
    const p = Mo.msgPerson.get(m.id);
    const real = p ? p.name : (m.uid && st.data.usersById.get(m.uid)?.name) || '';
    return [m.text, m.author, m.receiver, real].some(v => norm(v).includes(q));
  });
  const delCount = st.data.allMessages.filter(m => m.deleted).length;
  $('msgCount').textContent = `共 ${rows.length} 則` + (f !== 'deleted' && delCount ? `（另有 ${delCount} 則已刪除，可在篩選選「已刪除」查看與復原）` : '');
  pagedRows('msg', rows, $('messageList'), $('msgMore'), 6, (m) => {
    const p = Mo.msgPerson.get(m.id), img = safeImg(m.image);
    const realName = p ? p.name : (m.uid && st.data.usersById.get(m.uid)?.name) || null;
    return h('tr', { 'data-id': m.id, class: m.deleted ? 'row-deleted' : '' },
      h('td', { class: 'nowrap' }, fmtDT(m.timestamp)),
      h('td', null, h('b', null, m.author || '未知'), m.isEventExtra ? h('span', { class: 'tag tag-muted ml-4' }, '活動加碼') : null,
        m.anon ? h('div', { class: 'hint' }, '真實：' + (realName || '無法辨識')) : null),
      h('td', null, m.receiver || '大家'),
      h('td', { class: 'text' }, String(m.text ?? ''), m.edited ? h('span', { class: 'tag tag-muted ml-6' }, '已編輯') : null,
        m.theme === HW_THEME ? h('div', null, h('span', { class: 'tag tag-hw' }, '萬聖卡')) : null, img ? h('img', { class: 'thumb', src: img, alt: '卡片附圖' }) : null),
      h('td', { class: 'num' }, m.likeCount),
      h('td', null, m.deleted
        ? [h('span', { class: 'tag tag-bad mr-4' }, '已刪除'), h('button', { class: 'btn btn-sm restore-btn', 'data-id': m.id, onclick: () => actions.askRestore(m) }, '復原')]
        : h('button', { class: 'btn btn-sm btn-ghost-danger del-btn', 'data-id': m.id, onclick: () => actions.askDelete(m, realName) }, '刪除')));
  }, f === 'deleted' ? '沒有已刪除的留言' : (st.data.messages.length ? '沒有符合的留言' : '目前沒有任何留言'));
}

// ================= 通訊錄 =================
function renderContacts(Mo) {
  const S = st.data;
  const removed = S.users.filter(u => u.status !== 'active').length;
  $('contactsStatus').textContent = `名單目前 ${S.contacts.length} 人${removed ? `（另有 ${removed} 人已移出或停權）` : ''}。`;
  const posts = new Map();
  for (const p of Mo.people.values()) if (p.uid) posts.set(p.uid, (posts.get(p.uid) || 0) + p.msgs.length);
  for (const p of Mo.people.values()) if (!p.uid && p.contactIdx >= 0) { const id = S.contacts[p.contactIdx].id; posts.set(id, (posts.get(id) || 0) + p.msgs.length); }
  const cf = $('contactFilter').value, q = norm($('contactSearch').value);
  const rows = S.users.filter(u => (cf === 'all' || (cf === 'active' && u.status === 'active') || (cf === 'removed' && u.status !== 'active'))
    && (!q || norm(u.name).includes(q) || norm(u.email).includes(q)));
  pagedRows('contact', rows, $('contactList'), $('contactMore'), 6, (u) => h('tr', { class: u.status !== 'active' ? 'row-deleted' : '', 'data-user': u.id },
    h('td', null, u.name || '', u.isAdmin ? h('span', { class: 'tag tag-key ml-6' }, '管理員') : null),
    h('td', null, u.email || ''), h('td', null, u.info || ''),
    h('td', null, u.status === 'active' ? h('span', { class: 'tag tag-ok' }, '在名單') : h('span', { class: 'tag tag-muted' }, u.status === 'blocked' ? '停權' : '已移出')),
    h('td', { class: 'num' }, posts.get(u.id) || 0),
    h('td', { class: 'nowrap' }, u.hasProfile || u.hasAvatar ? [
      u.hasProfile ? h('button', { class: 'btn btn-sm btn-ghost-danger pc-clear-btn mr-4', 'data-user': u.id, onclick: () => actions.askClearProfile(u, 'profile') }, '清除資料卡') : null,
      u.hasAvatar ? h('button', { class: 'btn btn-sm btn-ghost-danger av-clear-btn', 'data-user': u.id, onclick: () => actions.askClearProfile(u, 'avatar') }, '移除頭像') : null,
    ] : h('span', { class: 'hint' }, '—'))),
    S.users.length ? '沒有符合的人' : '通訊錄是空的');
  renderPreview();
}

export function renderPreview() {
  const box = $('previewBox');
  const pv = st.preview;
  if (!pv) { box.replaceChildren(); box.hidden = true; return; }
  box.hidden = false;
  const r = pv.resp, total = r.add + r.update + r.remove;
  const risky = actions.isRiskyRemove(r);
  const changeLabel = { add: '新增', update: '更新', remove: '移出' };
  const order = { remove: 0, update: 1, add: 2 };
  const sample = [...(r.sample || [])].sort((x, y) => (order[x.change] ?? 3) - (order[y.change] ?? 3));
  const shown = pv.expanded ? sample : sample.slice(0, 10);
  const canApply = total > 0 && (!risky || pv.ack);
  box.replaceChildren(h('div', { class: 'card preview' },
    h('h3', null, '預覽：套用後會有這些變化'),
    h('p', { class: 'sub' }, '這一步還沒有寫入任何資料。確認沒問題再按「確認套用」。'),
    h('div', { class: 'grid grid-kpi' },
      kpi('新增', r.add, '名單上新出現的人', { id: 'pvAdd', unit: '人' }),
      kpi('更新', r.update, '姓名或備註有變', { id: 'pvUpdate', unit: '人' }),
      kpi('移出名單', r.remove, '舊留言照常顯示', { id: 'pvRemove', unit: '人', danger: risky }),
      kpi('沒有變動', r.unchanged, r.invalid_groups ? `另有 ${r.invalid_groups} 組格式不正確，已略過` : '', { id: 'pvUnchanged', unit: '人' })),
    r.invalid_groups ? h('div', { class: 'banner banner-warn' }, `有 ${r.invalid_groups} 組資料格式不正確（要五行一組、第三行是 Email），這些不會被套用。請檢查貼上的內容。`) : null,
    risky ? h('div', { class: 'banner banner-bad', id: 'pvRisk', role: 'alert' }, `注意：這次會把 ${r.remove} 人移出名單（佔目前名單約 ${Math.round(r.remove / Math.max(1, r.remove + r.update + r.unchanged) * 100)}%）。如果不是預期的，請先確認貼上的是完整名單。被移出的人無法進入感謝牆，但舊留言照常顯示。`) : null,
    shown.length ? h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, '變更'), h('th', null, '姓名'), h('th', null, 'Email'))),
      h('tbody', { id: 'pvSample' }, shown.map(x => h('tr', null, h('td', null, h('span', { class: 'tag ' + (x.change === 'remove' ? 'tag-bad' : x.change === 'add' ? 'tag-ok' : 'tag-est') }, changeLabel[x.change] || x.change)), h('td', null, x.name || ''), h('td', null, x.email || '')))))) : null,
    sample.length > 10 && !pv.expanded ? h('button', { class: 'btn btn-sm mt-8', id: 'pvExpand', onclick: () => { pv.expanded = true; st.render(); } }, `展開全部 ${sample.length} 筆範例`) : null,
    sample.length && total > sample.length ? h('p', { class: 'hint' }, `範例只列出 ${sample.length} 筆，共 ${total} 筆變更（移出的列排在最前面）。`) : null,
    risky ? h('label', { class: 'ack', for: 'riskAck' }, h('input', { type: 'checkbox', id: 'riskAck', checked: pv.ack ? true : null, onchange: (e) => { pv.ack = e.target.checked; st.render(); } }), ` 我確認要移出這 ${r.remove} 人`) : null,
    h('div', { class: 'split mt-12' },
      h('button', { class: 'btn ' + (risky ? 'btn-danger' : 'btn-primary'), id: 'applyBtn', disabled: !canApply, onclick: () => actions.applyPreview() },
        total === 0 ? '沒有需要套用的變更' : risky ? `確認套用，移出 ${r.remove} 人` : `確認套用（共 ${total} 筆變更）`),
      h('button', { class: 'btn', id: 'cancelPreviewBtn', onclick: () => actions.cancelPreview() }, '放棄這次預覽'))));
}

// ================= 設定、操作紀錄、系統狀態 =================
let lastFilled = null;
export function fillSettings(force) {
  const d = st.data.settings || {};
  if (!st.settingsDirty || force) {
    $('mainTitleInput').value = d.mainTitle || '';
    $('subTitleInput').value = d.subTitle || '';
    $('appVersionInput').value = d.appVersion || '';
  }
  lastFilled = d;
}
function renderSettingsInfo() {
  const d = st.data.settings || {};
  if (lastFilled !== d) fillSettings();
  $('limitsInfo').textContent = `目前版號 ${d.appVersion || '（未設定）'}。牆上顯示上限 ${d.maxMessages ?? '—'} 則；牆面只顯示本月留言（台灣時間每月 1 號 00:00 清空，舊留言不刪除，同事在「清單」看得到全部）；英雄榜非活動期間統計最近 ${d.retentionDays ?? '—'} 天（由系統邏輯控制，不在後台修改）。`;
  $('whoAmI').textContent = st.data.me && st.data.me.name ? `${st.data.me.name}（管理員）` : '';
  $('buildInfo').textContent = st.data.server && st.data.server.build ? `版本 ${st.data.server.build}` : '';
}

const ACTION_LABEL = {
  'admin.message.delete': '刪除留言', 'admin.message.restore': '復原留言', 'admin.contacts.preview': '預覽通訊錄', 'admin.contacts.apply': '更新通訊錄',
  'admin.contacts.bind': '綁定 Posit 帳號', 'admin.settings': '修改設定', 'admin.settings.update': '修改設定', 'admin.admins': '管理員變更', 'admin.export': '匯出名單',
  'admin.hw.settle': '結算萬聖獎勵', 'admin.profile.clear': '清除資料卡', 'admin.avatar.clear': '移除頭像', 'message.create': '發文', 'message.edit': '編輯留言', 'message.delete': '刪除自己的留言',
};
const TARGET_LABEL = { message: '留言', contacts: '通訊錄', user: '同事', settings: '設定', export: '匯出', admins: '管理員', event: '活動', photo: '照片' };
const DETAIL_KEY = { add: '新增', update: '更新', remove: '移出', reason: '原因', appVersion: '版號', mainTitle: '主標題', subTitle: '副標題', mode: '名單', count: '人數', user_id: '對象', role: '身分', action: '動作' };
const DETAIL_VALUE = { mode: { none: '從未發文、也還沒變身', infected_only: '已變身、但從未發文', infectedOnly: '已變身、但從未發文' }, role: { admin: '管理員' } };
export function normAudit(e, usersById) {
  let detail = e.detail ?? e.detail_json ?? null;
  if (typeof detail === 'string') { try { detail = JSON.parse(detail); } catch (x) { /* 當成純文字 */ } }
  const uid = e.actor_user_id;
  return { at: Number(e.at ?? e.at_ms) || 0, who: e.actor_name || (uid && usersById.get(uid)?.name) || uid || '系統', role: e.actor_role || '',
    action: String(e.action || ''), targetType: e.target_type || '', targetId: e.target_id || '', detail,
    targetName: e.target_type === 'user' && e.target_id ? usersById.get(e.target_id)?.name || '' : '' };
}
export function targetText(r) {
  const t = TARGET_LABEL[r.targetType] || r.targetType;
  if (!t && !r.targetId) return '—';
  if (r.targetName) return `${t}（${r.targetName}）`;   // 對象是同事時顯示姓名，比編號好認
  return r.targetId && r.targetType !== 'export' && r.targetType !== 'contacts' && r.targetType !== 'settings' ? `${t || '項目'}（${r.targetId}）` : (t || r.targetId);
}
export function detailText(d) {
  if (d === null || d === undefined || d === '') return '—';
  if (typeof d !== 'object') return String(d).slice(0, 300);
  const t = Object.entries(d).map(([k, v]) => {
    const val = typeof v === 'object' ? JSON.stringify(v) : ((DETAIL_VALUE[k] || {})[v] ?? v);
    return `${DETAIL_KEY[k] || k}${/^\d+$/.test(String(val)) && k !== 'appVersion' ? ' ' : '：'}${val}`;
  }).join('、');
  return t.slice(0, 300) || '—';
}
function renderAudit() {
  const a = st.audit, box = $('auditList');
  $('auditError').hidden = !a.error; $('auditError').textContent = a.error || '';
  if (!a.loaded && !a.error) { box.replaceChildren(h('tr', null, h('td', { colspan: 5, class: 'loading' }, a.loading ? '讀取中…' : '打開這個分頁時會載入操作紀錄。'))); return; }
  const f = $('auditFilter').value, q = norm($('auditSearch').value);
  const rows = a.entries.map(e => normAudit(e, st.data.usersById)).filter(r => (f === 'all' || r.action.startsWith('admin.')) && (!q || [r.who, ACTION_LABEL[r.action] || r.action, targetText(r), detailText(r.detail)].some(v => norm(v).includes(q))))
    .sort((x, y) => y.at - x.at);
  $('auditCount').textContent = `共 ${rows.length} 筆`;
  box.replaceChildren(...(rows.length ? rows.map(r => h('tr', null,
    h('td', { class: 'nowrap' }, h('span', { title: fmtDT(r.at) + ' 台灣時間' }, fmtDT(r.at)), h('div', { class: 'hint' }, agoText(r.at, nowMs()))),
    h('td', null, r.who, r.role ? h('span', { class: 'hint ml-4' }, r.role === 'admin' ? '管理員' : r.role === 'system' ? '系統' : '') : null),
    h('td', null, h('b', { title: r.action }, ACTION_LABEL[r.action] || '其他操作')),
    h('td', null, targetText(r)), h('td', { class: 'text' }, detailText(r.detail)))) : [h('tr', null, h('td', { colspan: 5, class: 'empty' }, a.entries.length ? '沒有符合的紀錄，換個關鍵字或篩選看看。' : '目前還沒有操作紀錄。刪除留言、更新通訊錄、改設定、匯出名單之後，會記在這裡。'))]));
}

const LV_TAG = { ok: ['ok', '正常'], warn: ['est', '注意'], bad: ['bad', '異常'] };
function sysRow(label, value, level, foot) {
  const [cls, txt] = LV_TAG[level] || [null, null];
  return { level, el: h('div', { class: 'sys-row' + (level === 'bad' ? ' lv-bad' : level === 'warn' ? ' lv-warn' : ''), 'data-level': level || '' },
    h('div', { class: 'sys-k' }, label), h('div', { class: 'sys-v' }, value, cls ? h('span', { class: 'tag tag-' + cls + ' ml-6' }, txt) : null), foot ? h('div', { class: 'hint' }, foot) : null) };
}
function backupFoot(hl) {
  const sb = serverBackup(hl);
  // T060 M8：門檻以伺服器為準（server/app/backup.py：超過 26 小時沒有新備份會自動補做一次；重試 3 次仍失敗或超過 36 小時沒有成功＝異常）。
  // 26／50 小時（BACKUP_WARN_MS／BACKUP_BAD_MS）只在伺服器沒有回報備份狀態時才用，說明裡要講清楚是備用判斷。
  if (!sb) return '伺服器沒有回報備份狀態，暫時用畫面判斷：超過 26 小時沒有新備份＝注意，超過 50 小時＝異常。';
  const t = { failing: '最近一次備份失敗，系統會自動重試。', overdue: '超過 36 小時沒有成功備份。', none_yet: '還沒有成功備份過。' }[sb.status];
  return (t ? t + ' ' : '') + '每天台灣時間 03:00 自動備份，漏掉會自動補做。由伺服器判定：重試 3 次仍失敗，或超過 36 小時沒有成功備份＝異常。';
}
const KNOWN_HEALTH = new Set(['backup', 'rate_limited', 'ready', 'google_ok', 'google_auth', 'google_auth_reason', 'google_auth_code', 'google_token_expires_in_s', 'queue_length', 'last_commit_at', 'last_sync_at', 'last_backup_at', 'sse_clients', 'photo_cache_bytes']);
function renderSystem(now) {
  const hl = st.health, box = $('sysCards');
  $('sysError').hidden = !st.healthError;
  if (!hl) { box.replaceChildren(h('div', { class: 'loading' }, st.healthError ? '取不到系統狀態。' : '讀取中…')); return; }
  if (hl.env === 'firebase') {
    const ago = (t) => t ? `${fmtDT(t)}（${agoText(t, now)}）` : '開頁後還沒有變動';
    const ok = hl.firebase_connected !== false;
    box.replaceChildren(
      h('div', { class: 'sys-summary ' + (ok ? 'sum-ok' : 'sum-bad'), id: 'sysSummary' }, ok ? '所有項目正常。' : '和 Firebase 的連線中斷了，恢復後會自動更新。'),
      sysRow('Firebase 連線', ok ? '已連線（即時更新中）' : '連線中斷', ok ? 'ok' : 'bad', '網路恢復後 Firebase 會自動重連並補上變動。').el,
      sysRow('登入身分', hl.signed_in_as || '—', null, '用 Email 登入連結登入；管理員身分由資料庫規則判斷。').el,
      sysRow('資料筆數', `同事 ${hl.users} 人、牆上留言 ${hl.messages} 則、已刪除 ${hl.deleted_messages} 則`, null).el,
      sysRow('上次資料變動', ago(hl.last_change_at), null).el,
      sysRow('時間差', `這台電腦和 Firebase 伺服器相差 ${Math.round((hl.server_offset_ms || 0) / 1000)} 秒`, null, '畫面上的「今天」「本月」都用伺服器時間計算。').el,
      sysRow('備份', '請定期在 Firebase 主控台匯出 JSON', null, '免費方案沒有自動備份。建議每週在 Firebase 主控台 > Realtime Database > 匯出 JSON 一次，存在不共用的地方（含同事個資）。').el);
    $('sysUpdated').textContent = `更新於 ${fmtDT(now)}`;
    return;
  }
  const lv = Object.fromEntries(healthItems(hl, now).map(i => [i.key, i.level]));
  const auth = hl.google_auth, why = authReasonText(hl.google_auth_reason || hl.google_auth_code);
  const exp = hl.google_token_expires_in_s;
  const ago = (t) => t ? `${fmtDT(t)}（${agoText(t, now)}）` : '沒有紀錄';
  const authFoot = auth === 'ok' ? (Number.isFinite(exp) ? `目前憑證約 ${Math.max(0, Math.round(exp / 60))} 分鐘後換新（系統會自動換）` : null)
    : [why, auth === 'failed' ? '下一步：請通知系統維護者重新授權。授權之前新增和修改都存不進去。' : '下一步：請通知系統維護者檢查登入；目前只能看資料。'].filter(Boolean).join('。');
  const rows = [
    sysRow('Google 登入', auth === 'ok' ? '憑證有效' : auth === 'degraded' ? '登入不穩，唯讀降級' : auth === 'failed' ? '登入已失效' : String(auth ?? '未知'), lv.auth, authFoot),
    sysRow('試算表與 Drive', hl.google_ok === false ? '暫時連不上' : '可以讀寫', lv.google),
    sysRow('伺服器', hl.ready === false ? '啟動中' : '已就緒', lv.ready),
    sysRow('上次備份', backupAt(hl) ? ago(backupAt(hl)) : '還沒有備份紀錄', lv.backup, backupFoot(hl)),
    sysRow('上次存入試算表', ago(hl.last_commit_at), lv.commit),
    sysRow('上次與試算表同步', ago(hl.last_sync_at), lv.sync, '超過 10 分鐘沒有同步＝注意。'),
    sysRow('等待寫入的佇列', `${hl.queue_length ?? '—'} 筆`, lv.queue, '有東西在排隊、而且超過 5 分鐘沒有寫入＝注意（通常是 Google 變慢或登入有問題）。'),
    sysRow('即時連線數', `${hl.sse_clients ?? '—'} 人正開著網頁`),
    sysRow('照片快取', Number.isFinite(hl.photo_cache_bytes) ? `${(hl.photo_cache_bytes / 1048576).toFixed(1)} MB` : '—'),
  ];
  const rank = { bad: 0, warn: 1 };
  const sorted = rows.map((r, i) => ({ ...r, i })).sort((x, y) => (rank[x.level] ?? 2) - (rank[y.level] ?? 2) || x.i - y.i);
  const nBad = rows.filter(r => r.level === 'bad').length, nWarn = rows.filter(r => r.level === 'warn').length;
  const summary = h('div', { class: 'sys-summary ' + (nBad ? 'sum-bad' : nWarn ? 'sum-warn' : 'sum-ok'), id: 'sysSummary' },
    nBad || nWarn ? `${nBad + nWarn} 項需要注意${nBad ? `（其中 ${nBad} 項異常）` : ''}，已排在最前面。` : '所有項目正常。');
  const extra = Object.entries(hl).filter(([k, v]) => !KNOWN_HEALTH.has(k) && ['number', 'string', 'boolean'].includes(typeof v));
  box.replaceChildren(summary, ...sorted.map(r => r.el), ...(extra.length ? [h('details', { class: 'tableview' }, h('summary', null, `其他指標（${extra.length}）`), h('div', { class: 'table-wrap mt-12' }, h('table', null, h('tbody', null, extra.map(([k, v]) => h('tr', null, h('td', null, k), h('td', null, String(v))))))))] : []));
  $('sysUpdated').textContent = `更新於 ${fmtDT(now)}`;
}
