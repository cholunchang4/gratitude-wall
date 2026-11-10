// 後台入口：確認管理員身分 → 載入資料 → 即時更新（SSE，斷線時改輪詢）→ 分頁與事件
import { $ } from './util.js';
import { st } from './state.js';
import { apiGet, ApiError, setBackend } from './api.js';
import { requireMember, USE_EMULATOR } from '../app/fb/session.js';
import { AdminBackend } from '../app/fb/admin-backend.js';
let BACKEND = null;
import { adaptBootstrap } from './model.js';
import { renderAll, resetPage, calculateRangeCount, fillSettings } from './views.js';
import { resetArchive } from './archive.js';
import { actions } from './actions-registry.js';
import './actions.js';

// ---------- 登入閘門（只有確認是管理員，才顯示後台） ----------
function showGate(text, msg, { retry = false, back = false } = {}) {
  $('gate').hidden = false; $('app').hidden = true;
  $('gateText').textContent = text;
  $('gateMsg').hidden = !msg; $('gateMsg').textContent = msg || '';
  $('retryBtn').hidden = !retry; $('backLink').hidden = !back;
}
function teardown() {
  ['ovKpis', 'levelTable', 'userStatsList', 'archiveList', 'messageList', 'contactList', 'auditList', 'sysCards'].forEach(id => $(id).replaceChildren());
  resetArchive();
}

// ---------- 資料載入 ----------
let inFlight = false, again = false;
async function loadBootstrap() {
  const b = await apiGet('api/admin/bootstrap');
  const now = Date.now();
  st.offset = Number.isFinite(b.server && b.server.now) ? b.server.now - now : 0;
  st.data = adaptBootstrap(b);
  st.errors = {};
}
export async function refresh() {
  if (inFlight) { again = true; return; }
  inFlight = true;
  try { await loadBootstrap(); }
  catch (e) {
    st.errors.bootstrap = true;
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { teardown(); st.data = null; showGate('這個頁面只有管理員可以使用', e.message, { back: true }); inFlight = false; return; }
  }
  inFlight = false;
  scheduleRender();
  if (again) { again = false; setTimeout(refresh, 500); }
}
st.refresh = refresh;
let refreshTimer = null;
function scheduleRefresh() { if (refreshTimer) return; refreshTimer = setTimeout(() => { refreshTimer = null; refresh(); }, 1500); }

async function loadHealth() {
  try { st.health = await apiGet('api/admin/health'); st.healthError = false; }
  catch (e) { st.healthError = true; }
  scheduleRender();
}
async function loadAudit() {
  if (st.audit.loading) return;
  st.audit.loading = true; st.audit.error = null; scheduleRender();
  try {
    const r = await apiGet('api/admin/audit');
    st.audit.entries = Array.isArray(r) ? r : (r.entries || r.items || []);
    st.audit.loaded = true; st.audit.stale = false;
  } catch (e) { st.audit.error = '無法載入操作紀錄：' + e.message; }
  st.audit.loading = false; scheduleRender();
}

let renderQueued = false;
function scheduleRender() { if (renderQueued) return; renderQueued = true; setTimeout(() => { renderQueued = false; if (st.data) renderAll(); }, 0); }
st.render = scheduleRender;

// ---------- 即時更新 ----------
// Firebase 版：資料庫有變動（新留言、刪除、按讚、通訊錄、設定）就重新整理畫面，取代 5.5 的 SSE
let sseOpen = true;
function startStream() { BACKEND.onChange(scheduleRefresh); }

// ---------- 分頁 ----------
const OLD_TABS = { hw: 'archive', patrol: 'archive' };   // 舊書籤（萬聖監控、匿名巡查）帶到「已結束活動」
function selectTab(name, push = true) {
  name = OLD_TABS[name] || name;
  const tabs = [...document.querySelectorAll('.tab')];
  if (!tabs.some(t => t.dataset.tab === name)) name = 'overview';
  tabs.forEach(t => { const on = t.dataset.tab === name; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
  document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== name; });
  if (push) history.replaceState(null, '', '#' + name);
  if (name === 'audit' && (st.audit.stale || !st.audit.loaded)) loadAudit();
  if (name === 'system') loadHealth();
}
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => selectTab(t.dataset.tab));
  t.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const tabs = [...document.querySelectorAll('.tab')], i = tabs.indexOf(t);
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    selectTab(n.dataset.tab); n.focus();
  });
});

// ---------- 畫面事件 ----------
$('startDate').addEventListener('change', calculateRangeCount);
$('endDate').addEventListener('change', calculateRangeCount);
$('userSearch').addEventListener('input', scheduleRender);
$('msgFilter').addEventListener('change', () => { resetPage('msg'); scheduleRender(); });
$('msgSearch').addEventListener('input', () => { resetPage('msg'); scheduleRender(); });
$('contactSearch').addEventListener('input', () => { resetPage('contact'); scheduleRender(); });
$('contactFilter').addEventListener('change', () => { resetPage('contact'); scheduleRender(); });
$('contactsInput').addEventListener('input', () => {
  const raw = $('contactsInput').value;
  const lines = raw.split('\n').filter(l => l.trim()).length;
  $('contactsParseHint').textContent = raw.trim() ? `約 ${Math.ceil(lines / 5)} 組（五行一組）` : '';
  if (st.preview) { st.preview = null; scheduleRender(); } // 內容改了，舊的預覽作廢
});
$('previewBtn').addEventListener('click', () => actions.doPreview());
['mainTitleInput', 'subTitleInput', 'appVersionInput'].forEach(id => $(id).addEventListener('input', () => { st.settingsDirty = true; }));
$('saveBtn').addEventListener('click', () => actions.saveSettings());
$('auditFilter').addEventListener('change', scheduleRender);
$('auditSearch').addEventListener('input', scheduleRender);
$('auditRefreshBtn').addEventListener('click', () => loadAudit());
$('sysRefreshBtn').addEventListener('click', () => loadHealth());
$('retryBtn').addEventListener('click', () => start());

// ---------- 啟動 ----------
let started = false;
let YP26A = null;
async function start() {
  showGate('正在確認管理員身分…', null);
  if (!BACKEND) {
    const session = await requireMember({ adminName: '卓倫' });
    if (!session.isAdmin) return showGate('這個頁面只有管理員可以使用', `你目前登入的是 ${session.email}，不是感謝牆管理員。`, { back: true });
    BACKEND = new AdminBackend(session); setBackend(BACKEND);
    $('logoutBtn').addEventListener('click', async () => { if (confirm('確定要登出嗎？')) { await session.signOut(); location.reload(); } });
  }
  try { await BACKEND.start(); await loadBootstrap(); }
  catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return showGate('這個頁面只有管理員可以使用', e.message, { back: true });
    return showGate('暫時打不開後台', e.message || '請稍後再試。', { retry: true });
  }
  $('gate').hidden = true; $('app').hidden = false;
  fillSettings(true);
  selectTab(location.hash.replace('#', '') || 'overview', false);
  renderAll();
  // T108 手心的光：活動期間總覽最上面的數字（模組出錯不影響後台）
  if (!YP26A) import('./yp26-admin.js').then(m => { YP26A = m.mountYp26Admin({ session: BACKEND.session, now: () => BACKEND.now(), emulator: USE_EMULATOR }) || true; })
    .catch(e => console.error('[yp26] 後台數字沒有載入', e));
  if (started) return;
  started = true;
  loadHealth();
  startStream();
  setInterval(() => { if (st.data) renderAll(); }, 60000);          // 讓「幾分鐘前」等時間文字自動更新
  setInterval(loadHealth, 30000);                                    // Google 登入狀態
  setInterval(() => { if (!sseOpen) refresh(); }, 60000);            // 即時連線斷了就改輪詢
}
start();
