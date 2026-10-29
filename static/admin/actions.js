// 會改資料的操作：刪除（要原因）、復原、通訊錄預覽與套用、儲存設定、匯出 CSV。
// Firebase 版：寫入由 ../app/fb/admin-backend.js 送到資料庫（規則只允許管理員）；成功後更新畫面並重新整理一次資料。
import { $, h, toast, actionModal } from './util.js';
import { st } from './state.js';
import { apiPost, apiDownload, requestId, ApiError } from './api.js';
import { isSafeKey, dayKey } from './model.js';
import { actions } from './actions-registry.js';
import { fillSettings } from './views.js';

const errText = (e) => (e instanceof ApiError ? e.message : '發生未預期的錯誤，請重新整理後再試。');

function localMarkDeleted(id, deleted) {
  const m = st.data.allMessages.find(x => x.id === id);
  if (m) m.deleted = deleted;
  st.data.messages = st.data.allMessages.filter(x => !x.deleted);
  st.audit.stale = true;
  st.render();
  st.refresh(); // 向伺服器要最新資料（含別人同時做的變更）
}

actions.askDelete = async function askDelete(m, realName) {
  if (!isSafeKey(m.id)) return toast('這則留言的編號格式不正確，無法刪除。', true);
  const preview = String(m.text ?? '');
  const rid = requestId();
  const res = await actionModal({
    title: '確定要刪除這張卡片嗎？', confirmText: '刪除這張卡片',
    body: [h('div', null, `發文者：${m.author || '未知'}${realName && realName !== m.author ? `（真實：${realName}）` : ''}　收件人：${m.receiver || '大家'}`),
      h('div', { class: 'quote' }, preview.length > 300 ? preview.slice(0, 300) + '…' : preview),
      h('div', { class: 'hint' }, '刪除後這張卡會從牆上消失，發文者的經驗值也會減少。原因會記入操作紀錄；之後仍可在「留言管理 → 已刪除」復原。')],
    input: { label: '刪除原因（必填）', hint: '會記入操作紀錄，不會顯示給同事', placeholder: '例如：違反暖心公約、洩漏個資、重複留言', maxlength: 200, minLength: 2 },
    run: (reason) => apiPost(`api/admin/messages/${encodeURIComponent(m.id)}/delete`, { request_id: rid, reason }).catch(e => { throw new Error(errText(e)); }),
  });
  if (!res.ok) return;
  toast('已刪除這張卡片');
  localMarkDeleted(m.id, true);
};

actions.askRestore = async function askRestore(m) {
  if (!isSafeKey(m.id)) return;
  const rid = requestId();
  const res = await actionModal({ title: '復原這則留言？', danger: false, confirmText: '復原',
    body: [h('div', { class: 'quote' }, String(m.text ?? '').slice(0, 300)), h('div', { class: 'hint' }, '復原後這張卡會回到牆上，經驗值也會恢復。這個動作會記入操作紀錄。')],
    run: () => apiPost(`api/admin/messages/${encodeURIComponent(m.id)}/restore`, { request_id: rid }).catch(e => { throw new Error(errText(e)); }) });
  if (!res.ok) return;
  toast('已復原這則留言');
  localMarkDeleted(m.id, false);
};

// ---------- 通訊錄：預覽 → 套用 ----------
actions.isRiskyRemove = (r) => r.remove > 0 && (r.remove >= 10 || r.remove / Math.max(1, r.remove + r.update + r.unchanged) >= 0.2);

actions.doPreview = async function doPreview() {
  const raw = $('contactsInput').value;
  if (!raw.trim()) return toast('請先在文字框中貼上名單資料。', true);
  const btn = $('previewBtn'); btn.disabled = true; btn.textContent = '分析中…';
  try {
    const resp = await apiPost('api/admin/contacts/preview', { raw });
    st.preview = { id: resp.preview_id, resp: { add: 0, update: 0, remove: 0, unchanged: 0, invalid_groups: 0, sample: [], ...resp }, raw };
    if (st.preview.resp.add + st.preview.resp.update + st.preview.resp.unchanged === 0) {
      st.preview = null;
      toast('沒有辨識到任何有效的 Email。請確認是五行一組、第三行是 Email 的格式。', true);
    }
  } catch (e) { st.preview = null; toast(errText(e), true); }
  btn.disabled = false; btn.textContent = '預覽差異';
  st.render();
  if (st.preview) setTimeout(() => $('previewBox').scrollIntoView({ block: 'start', behavior: 'smooth' }), 30); // 預覽出現後捲到可見處
};
actions.cancelPreview = function cancelPreview() { st.preview = null; st.render(); };
actions.openSystem = function openSystem() { document.getElementById('tab-system').click(); window.scrollTo({ top: 0 }); };

actions.applyPreview = async function applyPreview() {
  const pv = st.preview; if (!pv) return;
  const r = pv.resp, rid = requestId();
  if (actions.isRiskyRemove(r) && !pv.ack) return toast(`請先勾選「我確認要移出這 ${r.remove} 人」。`, true);
  const btn = $('applyBtn'); btn.disabled = true; btn.textContent = '套用中…';
  try { await apiPost('api/admin/contacts/apply', { request_id: rid, preview_id: pv.id }); }
  catch (e) {
    toast(errText(e), true);
    if (e instanceof ApiError && (e.status === 404 || e.status === 409)) st.preview = null; // 預覽已過期，要重新預覽
    st.render(); return;
  }
  toast(`通訊錄已更新：新增 ${r.add} 人、更新 ${r.update} 人、移出 ${r.remove} 人`);
  $('contactsInput').value = ''; $('contactsParseHint').textContent = '';
  st.preview = null; st.audit.stale = true; st.render(); st.refresh();
};

// ---------- 設定 ----------
actions.saveSettings = async function saveSettings() {
  const mainTitle = $('mainTitleInput').value.trim(), subTitle = $('subTitleInput').value.trim(), ver = $('appVersionInput').value.trim();
  if (!mainTitle) return toast('主標題不能是空的。', true);
  if (!/^\d+(\.\d+){0,3}$/.test(ver)) return toast('系統版號格式不正確，請填像 5.1 這樣的數字。', true);
  const oldVer = String((st.data.settings || {}).appVersion || '');
  const rid = requestId();
  const body = { request_id: rid, mainTitle, subTitle, appVersion: ver };
  const btn = $('saveBtn');
  try {
    if (ver !== oldVer) {
      const res = await actionModal({ title: '確定要變更系統版號嗎？', danger: false, confirmText: '變更版號',
        body: [h('div', null, `版號 ${oldVer || '（未設定）'} → ${ver}`), h('div', { class: 'hint mt-8' }, '如果新版號比同事手上的網頁新，他們會被要求重新整理。請確認前台已經換成新版再變更。')],
        run: () => apiPost('api/admin/settings', body).catch(e => { throw new Error(errText(e)); }) });
      if (!res.ok) return;
    } else {
      btn.disabled = true;
      await apiPost('api/admin/settings', body);
    }
    st.data.settings = { ...st.data.settings, mainTitle, subTitle, appVersion: ver };
    st.settingsDirty = false; st.audit.stale = true; fillSettings(true); st.render();
    toast('設定已儲存');
  } catch (e) { toast(errText(e), true); }
  btn.disabled = false;
};

// ---------- CSV 匯出（伺服器產生並記入操作紀錄） ----------
actions.downloadLurkers = async function downloadLurkers() {
  if (!st.lurk.length) return toast('目前名單是空的，沒有可匯出的資料。', true);
  const mode = $('lurkFilter').value === 'none' ? 'none' : 'infected_only';
  const btn = $('csvBtn'); btn.disabled = true;
  try {
    const { blob, filename } = await apiDownload(`api/admin/export/lurkers.csv?mode=${mode}`);
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename || `感謝牆-還沒參與的同事-${dayKey(Date.now())}.csv` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    st.audit.stale = true;
    toast('已匯出名單。檔案含同事 Email，只用來邀請，請勿外流；這次匯出已記入操作紀錄。');
  } catch (e) { toast('匯出失敗：' + errText(e), true); }
  btn.disabled = false;
};
