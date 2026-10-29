// 畫面小工具：建立元素（一律用文字節點，不把內容當網頁程式碼）、提示、確認視窗。

export const $ = (id) => document.getElementById(id);

// 建立元素：使用者內容全部以 textContent／文字節點寫入，避免被當成程式執行。
// style 只接受物件並用 CSSOM 設定（符合 Content-Security-Policy，不使用內嵌 style 屬性）。
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}
const SVGNS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs, text) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}

let toastTimer;
export function toast(text, bad) {
  let t = document.querySelector('.toast');
  if (!t) { t = h('div', { class: 'toast', role: 'status' }); document.body.append(t); }
  t.textContent = text; t.classList.toggle('bad', !!bad); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}

export function agoText(ms, now) {
  if (!Number.isFinite(ms) || ms <= 0) return '沒有紀錄';
  const d = Math.max(0, Math.round((now - ms) / 1000));
  if (d < 60) return '剛剛';
  if (d < 3600) return `${Math.floor(d / 60)} 分鐘前`;
  if (d < 86400) return `${Math.floor(d / 3600)} 小時前`;
  return `${Math.floor(d / 86400)} 天前`;
}

/**
 * 通用視窗：確認、輸入原因、送出到伺服器都用它。
 * - input：{ label, hint, placeholder, maxlength, minLength, multiline } 有的話要填寫才能按確定
 * - run(value)：按下確定後執行；失敗時錯誤顯示在視窗內、視窗不關，可以修正再試（送出中按鈕鎖住，避免重複送出）
 * - 預設焦點在「取消」（有輸入欄時在輸入欄），避免按 Enter 誤刪
 * 回傳 { ok, value, result }
 */
export function actionModal({ title, body, confirmText = '確定', danger = true, input = null, run = null }) {
  return new Promise(resolve => {
    const prev = document.activeElement;
    let busy = false;
    const close = (res) => { back.remove(); document.removeEventListener('keydown', onKey, true); if (prev && prev.focus) prev.focus(); resolve(res); };
    const valueOf = () => (field ? field.value.trim() : '');
    const valid = () => !input || valueOf().length >= (input.minLength || 1);
    const sync = () => { okBtn.disabled = busy || !valid(); };
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) { e.stopPropagation(); close({ ok: false }); }
      if (e.key === 'Tab') { // 焦點留在視窗裡
        const f = [...modal.querySelectorAll('button:not([disabled]), textarea, input')];
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    const field = input ? h(input.multiline === false ? 'input' : 'textarea', { id: 'modalInput', class: 'modal-input', maxlength: input.maxlength || 200, placeholder: input.placeholder || '', 'aria-describedby': 'modalInputHint', rows: input.multiline === false ? null : 3, type: input.multiline === false ? 'text' : null, oninput: sync }) : null;
    const errBox = h('div', { class: 'gate-msg', id: 'modalError', role: 'alert', hidden: true });
    const okBtn = h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), id: 'modalOk', onclick: async () => {
      if (busy || !valid()) return;
      busy = true; sync(); cancelBtn.disabled = true; okBtn.textContent = '處理中…'; errBox.hidden = true;
      try {
        const value = valueOf();
        const result = run ? await run(value) : undefined;
        busy = false; close({ ok: true, value, result });
      } catch (e) {
        busy = false; cancelBtn.disabled = false; okBtn.textContent = confirmText; sync();
        errBox.textContent = ((e && e.message) || '操作失敗，請稍後再試。') + (input ? ' 你輸入的內容已保留，可以直接再按一次。' : ''); errBox.hidden = false;
      }
    } }, confirmText);
    const cancelBtn = h('button', { class: 'btn', id: 'modalCancel', onclick: () => { if (!busy) close({ ok: false }); } }, '取消');
    const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modalTitle' },
      h('h3', { id: 'modalTitle' }, title), h('div', { class: 'm-body' }, body),
      input ? h('label', { class: 'field', for: 'modalInput' }, input.label, input.hint ? h('span', { class: 'hint', id: 'modalInputHint' }, ' ' + input.hint) : null) : null,
      field, errBox, h('div', { class: 'm-actions' }, cancelBtn, okBtn));
    const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back && !busy) close({ ok: false }); } }, modal);
    document.body.append(back);
    document.addEventListener('keydown', onKey, true);
    sync();
    (field || cancelBtn).focus();
  });
}
