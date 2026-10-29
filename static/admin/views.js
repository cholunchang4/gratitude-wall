// 所有分頁的畫面（只負責畫，不呼叫 API；按鈕的動作由 actions.js 處理）
import { $, h, s, agoText } from './util.js';
import { st, nowMs } from './state.js';
import { barChart } from './charts.js';
import * as M from './model.js';
import { actions } from './actions-registry.js';

const { norm, fmtDT, levelOf, safeImg, pct, phase, inEvent, LEVELS, HW_STAGES, HW_TOTAL, HW_REWARD_TIERS, HW_EVENT_START, HW_EVENT_END, DAY, HW_THEME, dayKey } = M;
const PAGE = 100;

export function kpi(label, num, foot, opts = {}) {
  return h('div', { class: 'kpi' + (opts.key ? ' key' : '') + (opts.danger ? ' danger' : ''), id: opts.id },
    h('div', { class: 'k-label' }, label, opts.key ? h('span', { class: 'tag tag-key' }, '最重要 KPI') : null, opts.est ? h('span', { class: 'tag tag-est', title: opts.est }, '估算') : null),
    h('div', { class: 'k-num', 'data-value': opts.value ?? num }, num, opts.unit ? h('small', null, ' ' + opts.unit) : null),
    foot ? h('div', { class: 'k-foot' }, foot) : null);
}

export function resetPage(k) { st.pages[k] = 1; }
function pagedRows(key, rows, tbody, moreEl, cols, rowFn, emptyText) {
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

function renderPhase(ph, now) {
  const pill = $('phasePill');
  pill.className = 'pill pill-' + ph;
  pill.textContent = ph === 'before' ? `萬聖活動 10/18 開始（還有 ${Math.ceil((HW_EVENT_START - now) / DAY)} 天）` : ph === 'during' ? `萬聖活動進行中・第 ${Math.floor((now - HW_EVENT_START) / DAY) + 1} 天／共 14 天` : '萬聖活動已結束';
}

export function renderAll() {
  if (!st.data) return;
  const now = nowMs();
  const ph = phase(now);
  renderPhase(ph, now);
  renderGoogleBanner(now);
  const le = $('loadError');
  le.hidden = !st.errors.bootstrap;
  le.textContent = st.errors.bootstrap ? '重新整理資料失敗（網路中斷或伺服器忙碌），目前畫面可能不是最新的。系統會自動重試，也可以手動重新整理頁面。' : '';
  const Mo = M.computeModel(st.data, now);
  renderOverview(Mo);
  renderHalloween(Mo, now, ph);
  renderPatrol(Mo, now);
  renderMessages(Mo);
  renderContacts(Mo);
  renderSettingsInfo();
  renderAudit();
  renderSystem(now);
}

// ================= 總覽 =================
function renderOverview(Mo) {
  const S = st.data, msgs = S.messages;
  const people = [...Mo.people.values()];
  $('ovKpis').replaceChildren(
    kpi('歷史累積留言', msgs.length, `其中附圖 ${msgs.filter(m => m.image).length} 則`, { id: 'kpiTotal' }),
    kpi('曾經發文的人數', people.filter(p => p.msgs.length).length, '匿名卡算回真實發文者'),
    kpi('通訊錄人數', S.contacts.length, `從未發文 ${S.contacts.length - Mo.postedContactIdx.size} 人`),
    kpi('萬聖變身人數', Mo.infCount, `目標 ${HW_TOTAL} 人`));
  calculateRangeCount();
  const mc = msgs.filter(m => m.isMooncake && !m.isOpened).sort((a, b) => b.timestamp - a.timestamp);
  $('mooncakeCard').hidden = !mc.length;
  $('mooncakeCountText').textContent = mc.length;
  $('mooncakeList').replaceChildren(...mc.map(m => h('tr', null, h('td', { class: 'nowrap' }, fmtDT(m.timestamp)), h('td', null, m.author || '未知'), h('td', null, m.receiver || '大家'))));
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

// ================= 萬聖監控 =================
function renderHalloween(Mo, now, ph) {
  const S = st.data, count = Mo.infCount;
  const stage = HW_STAGES.find(x => count >= x.min);
  const next = [...HW_STAGES].reverse().find(x => x.min > count);
  const banner = ph === 'before'
    ? h('div', { class: 'banner banner-info', id: 'hwPhaseText' }, `活動尚未開始：10/18（日）00:00 開始，還有 ${Math.ceil((HW_EVENT_START - now) / DAY)} 天。下方數字目前都是 0；始祖名單與「還沒參與的同事」已可先準備。`)
    : ph === 'during'
      ? h('div', { class: 'banner banner-info', id: 'hwPhaseText' }, `活動進行中：第 ${Math.floor((now - HW_EVENT_START) / DAY) + 1} 天／共 14 天，到 10/31（六）23:59 結束。`)
      : h('div', { class: 'banner banner-warn', id: 'hwPhaseText' }, `活動已在 10/31（六）23:59 結束，以下為最終結果。` + M.rewardText(count));
  $('hwPhaseBanner').replaceChildren(banner);
  const ticks = [0, 50, 100, 150, 200];
  const fill = h('div', { class: 'hw-fill' }); fill.style.width = `${Math.min(100, count / HW_TOTAL * 100)}%`;
  $('hwHero').replaceChildren(
    h('div', { class: 'row' },
      h('div', null, h('div', { class: 'hw-muted' }, '全公司變身進度'), h('div', { class: 'hw-big', id: 'hwCount' }, count, h('small', null, ` / ${HW_TOTAL} 人`))),
      h('div', null, h('div', { class: 'hw-muted' }, '目前階段'), h('div', { class: 'hw-stage', id: 'hwStage' }, stage.name),
        h('div', { class: 'hw-muted', id: 'hwNextStage' }, next ? `再 ${next.min - count} 人進入「${next.name}」` : '已是最高階段'))),
    h('div', { class: 'hw-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': HW_TOTAL, 'aria-valuenow': count, 'aria-valuetext': `${stage.name}，${count} / ${HW_TOTAL} 人已變身` }, fill),
    h('div', { class: 'hw-ticks', 'aria-hidden': 'true' }, ticks.map(t => { const sp = h('span', { class: count >= t ? 'on' : '' }, t === 0 ? '幽暗之夜' : t === 50 ? '50 亡靈甦醒' : t === 150 ? '150 血月降臨' : String(t)); sp.style.left = `${t / HW_TOTAL * 100}%`; return sp; })),
    h('div', { class: 'milestones', id: 'milestones' }, HW_REWARD_TIERS.map(t => h('div', { class: 'ms' + (count >= t.min ? ' done' : ''), 'data-min': t.min },
      h('b', null, `${t.min} 人・${t.label}`), h('span', { class: 'st' }, count >= t.min ? '已達成' : `還差 ${t.min - count} 人`)))));
  const ft = Mo.firstTimers.length, ftOut = Mo.firstTimers.filter(p => p.contactIdx < 0).length;
  const reply = pct(Mo.replied, Mo.thanked), replyInf = pct(Mo.repliedInf, Mo.thankedInf);
  const cardsVs = Mo.baseline > 0 && Mo.daysElapsed > 0 ? Math.round(((Mo.evCards / Mo.daysElapsed) / (Mo.baseline / 14) - 1) * 100) : null;
  $('hwKpis').replaceChildren(
    kpi('活動期間第一次發文', ft, `活動前從未發文的通訊錄同事 ${Mo.lurkersBefore} 人${ftOut ? `；其中 ${ftOut} 人不在通訊錄` : ''}；企劃參考目標 30 人（估計值）`, { key: true, id: 'kpiFirst', unit: '人' }),
    kpi('活躍發文人數', Mo.active, '活動期間至少發過 1 張卡（含匿名）', { id: 'kpiActive', unit: '人' }),
    kpi('變身人數', count, `企劃參考目標 150 人（估計值）`, { id: 'kpiInfected', unit: '人' }),
    kpi('活動期間卡片數', Mo.evCards, cardsVs === null ? `前兩週共 ${Mo.baseline} 張` : `每日平均比前兩週${cardsVs >= 0 ? '多' : '少'} ${Math.abs(cardsVs)}%（前兩週共 ${Mo.baseline} 張）`, { id: 'kpiCards', unit: '張', est: cardsVs === null ? null : '用已過天數的日平均比較' }),
    kpi('回卡率', reply === null ? '—' : reply + '%', Mo.thanked ? `被點名感謝 ${Mo.thanked} 人，之後回寫 ${Mo.replied} 人；其中已變身者 ${replyInf === null ? '—' : replyInf + '%'}（${Mo.repliedInf}/${Mo.thankedInf}）` : '活動期間還沒有人被點名感謝', { id: 'kpiReply', value: reply ?? '', est: '收件人是用姓名文字比對發文者，同名或拼法不同會有誤差' }),
    kpi('萬聖卡／匿名卡', `${Mo.hwCards}／${Mo.anonCount}`, '匿名卡請到「匿名巡查」查看', { id: 'kpiHwAnon' }));
  renderCharts(Mo);
  $('progenitors').replaceChildren(Mo.top5.length ? h('div', { class: 'table-wrap' }, h('table', null,
    h('thead', null, h('tr', null, h('th', { class: 'num' }, '#'), h('th', null, '姓名'), h('th', { class: 'num' }, '活動前具名卡'), h('th', null, '狀態'))),
    h('tbody', { id: 'progList' }, Mo.top5.map((x, i) => h('tr', null, h('td', { class: 'num' }, i + 1), h('td', null, x.name), h('td', { class: 'num' }, x.n),
      h('td', null, x.changed ? h('span', { class: 'tag tag-ok' }, '已登入變身') : h('span', { class: 'tag tag-muted' }, '還沒登入'))))))) : h('div', { class: 'empty' }, '活動前沒有具名留言，所以沒有始祖。'));
  const flagged = Mo.infRows.filter(r => r.flags.length).length;
  $('infSub').textContent = `共 ${Mo.infRows.length} 筆，可疑 ${flagged} 筆。「活動期間發文」是看本人活動期間是否發過卡；變身時間是伺服器記錄的時間。`;
  const f = $('infFilter').value, q = norm($('infSearch').value);
  const infRows = Mo.infRows.filter(r => (f === 'all' || (f === 'flag' && r.flags.length) || (f === 'noPost' && !r.postedEvent)) && (!q || norm(r.name).includes(q)));
  pagedRows('inf', infRows, $('infList'), $('infMore'), 7, (r) => h('tr', { class: r.flags.length ? 'row-flag' : '' },
    h('td', null, r.name || h('span', { class: 'hint' }, '（空白）')),
    h('td', null, r.inContacts ? h('span', { class: 'tag tag-ok' }, '是') : h('span', { class: 'tag tag-bad' }, '否')),
    h('td', null, r.postedEvent ? h('span', { class: 'tag tag-ok' }, '有') : h('span', { class: 'tag tag-muted' }, '還沒有')),
    h('td', null, r.isProg ? h('span', { class: 'tag tag-hw' }, '🧛 始祖') : '一般'),
    h('td', null, r.flags.length ? r.flags.map(x => h('span', { class: 'tag tag-bad mr-4' }, '⚠ ' + x)) : h('span', { class: 'hint' }, '—')),
    h('td', { class: 'nowrap' }, r.cause === 'migrated' ? h('span', { class: 'tag tag-muted', title: '資料搬家時才補記，時間是搬家時間，不是實際變身時間' }, '搬家前') : fmtDT(r.at)),
    h('td', null, M.CAUSE_LABEL[r.cause] || r.cause || '—')),
    Mo.infRows.length ? '沒有符合條件的紀錄' : '還沒有人變身');
  const lf = $('lurkFilter').value;
  const lurk = S.contacts.map((c, i) => ({ c, i })).filter(({ i }) => !Mo.postedContactIdx.has(i) && (lf === 'none' ? !Mo.infectedContactIdx.has(i) : Mo.infectedContactIdx.has(i)));
  st.lurk = lurk.map(x => x.c);
  $('lurkSub').textContent = lf === 'none' ? `通訊錄 ${S.contacts.length} 人中，從未發文、也還沒變身的有 ${lurk.length} 人。可以匯出給主管邀請（匯出會記入操作紀錄）。名單只用來輕鬆邀請，請不要拿來點名、比較，或當成考核的依據。` : `已變身但從未發過卡的有 ${lurk.length} 人，適合請主管鼓勵寫第一張卡。名單只用來輕鬆邀請，請不要拿來點名、比較，或當成考核的依據。`;
  $('lurkSub').dataset.count = lurk.length;
  pagedRows('lurk', lurk, $('lurkList'), $('lurkMore'), 3, ({ c }) => h('tr', null, h('td', null, c.name || ''), h('td', null, c.email || ''), h('td', null, c.info || '')), '沒有符合的同事');
}

function renderCharts(Mo) {
  const series = [
    { k: 'first', title: '第一次發文人數', unit: '人', key: true },
    { k: 'cards', title: '卡片數', unit: '張' },
    { k: 'infected', title: '新增變身人數', unit: '人', note: Mo.migrated ? `其中 ${Mo.migrated} 人是搬家前就已變身，時間記為搬家當天（${M.fmtMD(Mo.migratedAt)}）` : null, noteLabel: '含搬家前' },
    { k: 'hw', title: '萬聖卡數', unit: '張' },
    { k: 'anon', title: '匿名卡數', unit: '張' },
  ];
  if (!Mo.days.length) {
    $('hwCharts').replaceChildren(h('div', { class: 'empty span-all' }, '活動開始後（10/18 起）這裡會每天更新。'));
    $('trendTable').replaceChildren();
    $('trendSub').textContent = '活動尚未開始。';
    return;
  }
  $('trendSub').textContent = '10/18 起每天的數字（台灣時間）。滑鼠移到長條上可看當天數值。變身人數是伺服器記錄的準確時間。' + (Mo.migrated ? `有 ${Mo.migrated} 人是搬家前就已變身，統計在搬家當天（${M.fmtMD(Mo.migratedAt)}）。` : '');
  $('hwCharts').replaceChildren(...series.map(sr => barChart(sr, Mo.days)));
  $('trendTable').replaceChildren(
    h('thead', null, h('tr', null, h('th', null, '日期'), series.map(sr => h('th', { class: 'num' }, sr.title)))),
    h('tbody', null, Mo.days.map(d => h('tr', null, h('td', { class: 'nowrap' }, `${d.label}（${d.wd}）`), series.map(sr => h('td', { class: 'num' }, d[sr.k]))))));
}

// ================= 匿名巡查 =================
const LS_PATROL = 'admin_patrol_at_v1'; // 上次標記巡查完成的時間（只存在這台電腦的瀏覽器，沒有個資）
export function patrolLast() { try { return Number(JSON.parse(localStorage.getItem(LS_PATROL))) || 0; } catch (e) { return 0; } }
export function patrolMark(t) { try { localStorage.setItem(LS_PATROL, JSON.stringify(t)); } catch (e) { /* 無痕模式等：忽略 */ } }

function renderPatrol(Mo, now) {
  const last = patrolLast();
  const today = dayKey(now);
  const newCount = Mo.patrol.filter(x => x.m.timestamp > last).length;
  $('patrolBadge').hidden = !newCount; $('patrolBadge').textContent = newCount;
  $('patrolBadge').setAttribute('aria-label', `${newCount} 張未巡查`);
  $('patrolInfo').replaceChildren(h('div', { class: 'banner ' + (newCount ? 'banner-warn' : 'banner-info'), id: 'patrolSummary' },
    `活動期間匿名卡共 ${Mo.patrol.length} 張；上次巡查（${last ? fmtDT(last) : '尚未巡查過'}）後新增 ${newCount} 張。`, phase(now) === 'before' ? ' 活動尚未開始。' : ''));
  const f = $('patrolFilter').value, q = norm($('patrolSearch').value);
  const list = Mo.patrol.filter(x => (f === 'all' || (f === 'today' && dayKey(x.m.timestamp) === today) || (f === 'new' && x.m.timestamp > last))
    && (!q || [x.m.text, x.m.receiver, x.realName, x.email].some(v => norm(v).includes(q))));
  $('patrolList').replaceChildren(...(list.length ? list.map(x => {
    const m = x.m, img = safeImg(m.image);
    return h('article', { class: 'pcard' + (m.timestamp > last ? ' new' : ''), 'data-id': m.id },
      h('div', { class: 'p-head' }, h('span', { class: 'mask' }, m.author), m.timestamp > last ? h('span', { class: 'tag tag-hw' }, '新') : null),
      h('div', { class: 'real' }, '真實發文者：', h('b', null, x.realName), x.email ? h('div', null, x.email) : null),
      h('div', { class: 'p-meta' }, `給 ${m.receiver || '大家'}・${fmtDT(m.timestamp)}・${m.likeCount} 顆糖`),
      h('div', { class: 'p-text' }, String(m.text ?? '')),
      img ? h('img', { class: 'thumb', src: img, alt: '卡片附圖' }) : null,
      h('div', { class: 'p-actions' }, h('button', { class: 'btn btn-sm btn-ghost-danger del-btn', 'data-id': m.id, onclick: () => actions.askDelete(m, x.realName) }, '刪除這張卡')));
  }) : [h('div', { class: 'empty span-all' }, Mo.patrol.length ? (f === 'new' ? '上次巡查後沒有新的匿名卡。' : '沒有符合的匿名卡。') : '活動期間還沒有匿名卡。')]));
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
  const infIds = new Set(S.infections.map(i => i.uid));
  pagedRows('contact', rows, $('contactList'), $('contactMore'), 8, (u) => h('tr', { class: u.status !== 'active' ? 'row-deleted' : '', 'data-user': u.id },
    h('td', null, u.name || '', u.isAdmin ? h('span', { class: 'tag tag-key ml-6' }, '管理員') : null),
    h('td', null, u.email || ''), h('td', null, u.info || ''),
    h('td', null, u.status === 'active' ? h('span', { class: 'tag tag-ok' }, '在名單') : h('span', { class: 'tag tag-muted' }, u.status === 'blocked' ? '停權' : '已移出')),
    h('td', { class: 'num' }, posts.get(u.id) || 0),
    h('td', null, infIds.has(u.id) ? h('span', { class: 'tag tag-hw' }, '已變身') : h('span', { class: 'hint' }, '—'))),
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
  'admin.hw.settle': '結算萬聖獎勵', 'message.create': '發文', 'message.edit': '編輯留言', 'message.delete': '刪除自己的留言',
};
const TARGET_LABEL = { message: '留言', contacts: '通訊錄', user: '同事', settings: '設定', export: '匯出', admins: '管理員', event: '活動', photo: '照片' };
const DETAIL_KEY = { add: '新增', update: '更新', remove: '移出', reason: '原因', appVersion: '版號', mainTitle: '主標題', subTitle: '副標題', mode: '名單', count: '人數', user_id: '對象', role: '身分', action: '動作' };
const DETAIL_VALUE = { mode: { none: '從未發文、也還沒變身', infected_only: '已變身、但從未發文', infectedOnly: '已變身、但從未發文' }, role: { admin: '管理員' } };
export function normAudit(e, usersById) {
  let detail = e.detail ?? e.detail_json ?? null;
  if (typeof detail === 'string') { try { detail = JSON.parse(detail); } catch (x) { /* 當成純文字 */ } }
  const uid = e.actor_user_id;
  return { at: Number(e.at ?? e.at_ms) || 0, who: e.actor_name || (uid && usersById.get(uid)?.name) || uid || '系統', role: e.actor_role || '',
    action: String(e.action || ''), targetType: e.target_type || '', targetId: e.target_id || '', detail };
}
export function targetText(r) {
  const t = TARGET_LABEL[r.targetType] || r.targetType;
  if (!t && !r.targetId) return '—';
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
