// 6.6 版頭「找同事」（小螢的提燈找人）：從放大鏡輸入姓名，打開任何通訊錄同事的使用說明書／頭像（沒留言、沒填說明書也找得到）。
// 設計：game-design/好友系統-v1.md 第 1 部、第 4.1 節。規則在 people-search-logic.js；這個檔案只管畫面。
// 純前台：只用已載入的 people 姓名清單（store.activeUsers()），頭像只載入畫面上那幾張小圖；不寫任何資料、不記錄誰搜了誰。
// 不顯示誰填了說明書、等級、寫卡數或任何活動狀態。
// 6.7「我的小燈盒」預留：搜尋面板空白時的區塊（deps.favSection）、每一列的星形燈按鈕位置（deps.rowExtra）、資料卡右上角（profile-ui.js 的 ext.viewerAction）。
import { searchPeople, highlightRange, MAX_QUERY } from './people-search-logic.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
const MOBILE_MQ = '(max-width: 768px)';
const DEBOUNCE_MS = 200;

export const T = Object.freeze({
  label: '找同事',
  title: '找同事',
  placeholder: '找找你想謝的人…',
  hint: '輸入名字，找找想認識的同事。',
  loading: '同事名單還在載入，稍等一下…',
  none: '小螢提著燈找了一圈，沒找到這個名字。',
  didYouMean: '你是不是要找：',
  clear: '清除',
  back: '關閉找同事',
  you: '你',
  write: '寫卡',
  writeAria: (n) => `寫感謝卡給 ${n}`,
  openAria: (n) => `打開 ${n} 的使用說明書`,
  found: (n, more) => (more ? `找到 ${n + more} 位同事，先列出 ${n} 位` : `找到 ${n} 位同事`),
  more: (n) => `還有 ${n} 位，多打幾個字就能縮小範圍。`,
  results: '搜尋結果',
});

const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4.2-4.2"/></svg>';
const ICON_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_PEN = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';

/**
 * deps = {
 *   people(): [{ user_id, display_name }]   // 通訊錄 active 的同事（store.activeUsers()）
 *   meId: string
 *   avatar(uid, name, size): html          // .pav 頭像（有上傳就用 64px 小圖，否則姓名縮寫色塊；呼叫時才排進下載）
 *   onAvatar?(fn): 取消函式                  // 頭像下載好時通知（fn(uid)），用來換掉縮寫
 *   openViewer(uid, fromEl)                 // 打開資料卡；關掉後焦點回到 fromEl
 *   writeTo(name, { uid })                  // 帶到撰寫區、收件人填好
 *   tools?: Element（桌機版頭工具列 .tools）, mobileBar?: Element（手機切換列 .switch-bar）
 *   ext?: object                            // 資料卡畫面的掛勾（app.js 的 SKY_EXT）：自己頭像選單加「找同事」
 *   isBlocked?(): boolean                   // 其他視窗開著時，「/」快捷鍵不作用
 *   favSection?(): Element | null           // 6.7 小燈盒：搜尋面板空白時的第一區
 *   rowExtra?(uid, name): html              // 6.7 小燈盒：每一列〔寫卡〕左邊的星形燈按鈕
 * }
 */
export function createPeopleSearch(deps) {
  const doc = document;
  const mq = window.matchMedia ? window.matchMedia(MOBILE_MQ) : { matches: false, addEventListener() {} };
  const st = { open: false, returnTo: null, timer: 0, loadTimer: 0, rows: [], q: '' };

  // ---------------------------------------------------------------- 入口按鈕
  const mkBtn = (cls) => {
    const b = doc.createElement('button');
    b.type = 'button'; b.className = cls; b.title = T.label;
    b.setAttribute('aria-label', T.label); b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'psLayer');
    b.innerHTML = ICON;
    b.addEventListener('click', () => (st.open ? close(true) : open(b)));
    return b;
  };
  const btnD = deps.tools ? mkBtn('tool ps-btn') : null;
  if (btnD) {
    const vs = deps.tools.querySelector('.view-switch');   // 放在「牆面／清單」右邊、圓形工具鈕的第一顆（小舖光瓶 12/1 起在最左邊）
    if (vs) vs.after(btnD); else deps.tools.prepend(btnD);
  }
  const btnM = deps.mobileBar ? mkBtn('ps-btn-m') : null;
  if (btnM) {
    const vs = deps.mobileBar.querySelector('.view-switch');
    if (vs) vs.after(btnM); else deps.mobileBar.appendChild(btnM);
    deps.mobileBar.classList.add('has-ps');
  }
  const triggers = () => [btnD, btnM].filter(Boolean);

  // ---------------------------------------------------------------- 面板
  const layer = doc.createElement('div');
  layer.className = 'ps-layer'; layer.id = 'psLayer'; layer.hidden = true;
  layer.innerHTML = `<section class="ps-panel" role="dialog" aria-labelledby="psTitle">
      <h2 class="ps-sr" id="psTitle">${esc(T.title)}</h2>
      <div class="ps-head">
        <button type="button" class="ps-back" data-ps="back" aria-label="${esc(T.back)}">${ICON_BACK}</button>
        <div class="ps-field" role="search">
          ${ICON}
          <input id="psInput" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" maxlength="${MAX_QUERY}"
            placeholder="${esc(T.placeholder)}" aria-label="${esc(T.title)}" aria-describedby="psStatus">
          <button type="button" class="ps-clear" data-ps="clear" aria-label="${esc(T.clear)}" hidden>${ICON_X}</button>
        </div>
      </div>
      <div class="ps-body">
        <div class="ps-fav" data-ps-slot="fav" hidden></div>
        <p class="ps-hint" data-ps-part="hint"></p>
        <ul class="ps-list" id="psList" aria-label="${esc(T.results)}"></ul>
        <div class="ps-none" data-ps-part="none" hidden></div>
        <p class="ps-more" data-ps-part="more" hidden></p>
      </div>
      <p class="ps-sr" id="psStatus" role="status" aria-live="polite"></p>
    </section>`;
  doc.body.appendChild(layer);
  const panel = layer.querySelector('.ps-panel');
  const input = layer.querySelector('#psInput');
  const list = layer.querySelector('#psList');
  const clearBtn = layer.querySelector('[data-ps="clear"]');
  const part = (k) => layer.querySelector(`[data-ps-part="${k}"]`);
  const status = layer.querySelector('#psStatus');
  const favSlot = layer.querySelector('[data-ps-slot="fav"]');

  function rowHtml(r, q) {
    const rg = highlightRange(r.name, q);
    const name = rg ? `${esc(r.name.slice(0, rg[0]))}<mark>${esc(r.name.slice(rg[0], rg[1]))}</mark>${esc(r.name.slice(rg[1]))}` : esc(r.name);
    const extra = deps.rowExtra ? deps.rowExtra(r.uid, r.name) || '' : '';
    return `<li class="ps-row" data-uid="${esc(r.uid)}">`
      + `<button type="button" class="ps-open" data-ps="open" data-uid="${esc(r.uid)}" aria-label="${esc(T.openAria(r.name))}${r.self ? `（${esc(T.you)}）` : ''}">`
      + `<span class="ps-av" data-ps-av="${esc(r.uid)}">${deps.avatar(r.uid, r.name, 36)}</span>`
      + `<span class="ps-name">${name}</span>${r.self ? `<span class="ps-you" aria-hidden="true">${esc(T.you)}</span>` : ''}</button>`
      + (extra ? `<span class="ps-slot">${extra}</span>` : '')
      + (r.self ? '' : `<button type="button" class="ps-write" data-ps="write" data-uid="${esc(r.uid)}" aria-label="${esc(T.writeAria(r.name))}">${ICON_PEN}<span>${esc(T.write)}</span></button>`)
      + '</li>';
  }

  function render() {
    const raw = input.value;
    clearBtn.hidden = !raw;
    const people = deps.people() || [];
    const res = searchPeople(raw, people, { meId: deps.meId });
    st.q = res.q;
    const hint = part('hint'), none = part('none'), more = part('more');
    clearTimeout(st.loadTimer);
    if (!res.q) {
      st.rows = [];
      list.innerHTML = ''; none.hidden = true; more.hidden = true;
      const fav = deps.favSection ? deps.favSection() : null;   // 6.7：小燈盒
      favSlot.replaceChildren(...(fav ? [fav] : []));
      favSlot.hidden = !fav;
      hint.textContent = T.hint; hint.hidden = !!fav;
      setStatus('');
      return;
    }
    favSlot.hidden = true;
    if (!people.length) {                                     // 剛開頁、名單還沒讀到：等一下再查
      st.rows = [];
      list.innerHTML = ''; none.hidden = true; more.hidden = true;
      hint.textContent = T.loading; hint.hidden = false;
      setStatus(T.loading);
      st.loadTimer = setTimeout(() => { if (st.open) render(); }, 500);
      return;
    }
    hint.hidden = true;
    st.rows = res.results;
    list.innerHTML = res.results.map(r => rowHtml(r, res.q)).join('');
    more.hidden = !res.more; more.textContent = res.more ? T.more(res.more) : '';
    if (res.results.length) {
      none.hidden = true;
      setStatus(T.found(res.results.length, res.more));
    } else {
      none.hidden = false;
      none.innerHTML = `<p class="ps-none-msg">${esc(T.none)}</p>`
        + (res.suggest
          ? `<p class="ps-dym">${esc(T.didYouMean)}</p><ul class="ps-list is-suggest" aria-label="${esc(T.didYouMean)}">${rowHtml(res.suggest, '')}</ul>`
          : `<button type="button" class="ps-text-btn" data-ps="clear">${esc(T.clear)}</button>`);
      setStatus(res.suggest ? `${T.none}${T.didYouMean}${res.suggest.name}？` : T.none);
    }
  }
  let statusTimer = 0;
  function setStatus(text) {                                  // 讀屏：打字停下來才念，避免每個字都念一次
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.textContent = text; }, text ? 350 : 0);
  }

  // ---------------------------------------------------------------- 開關
  function place() {
    const mobile = mq.matches;
    layer.classList.toggle('is-mobile', mobile);
    panel.setAttribute('aria-modal', mobile ? 'true' : 'false');
    doc.body.classList.toggle('ps-lock', st.open && mobile);
    if (mobile) {
      panel.style.top = panel.style.right = panel.style.width = '';
      fitViewport();
      return;
    }
    layer.style.top = layer.style.height = '';
    const anchor = btnD && btnD.getClientRects().length ? btnD : null;
    const w = Math.min(360, window.innerWidth - 16);
    panel.style.width = w + 'px';
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      panel.style.top = Math.round(r.bottom + 10) + 'px';
      panel.style.right = Math.round(Math.max(8, Math.min(window.innerWidth - r.right - 4, window.innerWidth - w - 8))) + 'px';
    } else { panel.style.top = '72px'; panel.style.right = '16px'; }
  }
  // 手機鍵盤彈出時：面板高度跟著可見區域縮，結果清單在可見範圍內捲動，不被鍵盤蓋住
  function fitViewport() {
    const vv = window.visualViewport;
    if (!st.open || !mq.matches || !vv) { layer.style.top = layer.style.height = ''; return; }
    layer.style.top = Math.round(vv.offsetTop) + 'px';
    layer.style.height = Math.round(vv.height) + 'px';
  }
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', fitViewport); window.visualViewport.addEventListener('scroll', fitViewport); }

  function open(from) {
    if (st.open) { input.focus(); return; }
    st.open = true;
    st.returnTo = from || doc.activeElement;
    layer.hidden = false;
    triggers().forEach(b => b.setAttribute('aria-expanded', 'true'));
    place();
    render();
    input.focus({ preventScroll: true });
    if (input.value) input.select();
  }
  function close(restoreFocus = true) {
    if (!st.open) return;
    st.open = false;
    clearTimeout(st.timer); clearTimeout(st.loadTimer); clearTimeout(statusTimer);
    layer.hidden = true;
    doc.body.classList.remove('ps-lock');
    triggers().forEach(b => b.setAttribute('aria-expanded', 'false'));
    const r = st.returnTo; st.returnTo = null;
    if (restoreFocus && r && r.isConnected && r.getClientRects().length && typeof r.focus === 'function') { try { r.focus({ preventScroll: true }); } catch (e) { /* 略 */ } }
    else if (restoreFocus) { const t = triggers().find(b => b.getClientRects().length); if (t) t.focus({ preventScroll: true }); }
  }

  // ---------------------------------------------------------------- 事件
  input.addEventListener('input', () => {
    clearBtn.hidden = !input.value;
    clearTimeout(st.timer);
    st.timer = setTimeout(render, DEBOUNCE_MS);              // 打字停 200ms 再查（也少載幾張頭像）
  });
  const openBtns = () => [...layer.querySelectorAll('[data-ps="open"]')];
  input.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;          // 注音、倉頡選字中：不攔
    if (e.key === 'ArrowDown') {
      clearTimeout(st.timer); render();
      const b = openBtns()[0]; if (b) { e.preventDefault(); b.focus(); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(st.timer); render();
      const b = openBtns()[0]; if (b) b.click();             // Enter：打開第一位（或「你是不是要找」那一位）
    }
  });
  layer.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t.matches && t.matches('[data-ps="open"]') && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End')) {
      const all = openBtns(), i = all.indexOf(t);
      e.preventDefault();
      if (e.key === 'Home') all[0].focus();
      else if (e.key === 'End') all[all.length - 1].focus();
      else if (e.key === 'ArrowDown') (all[i + 1] || all[i]).focus();
      else if (i > 0) all[i - 1].focus(); else input.focus();
      return;
    }
    if (e.key !== 'Tab') return;
    const f = [...panel.querySelectorAll(FOCUSABLE)].filter(x => x.getClientRects().length);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (mq.matches) {                                         // 手機全螢幕：焦點鎖在搜尋頁裡
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    // 桌機：面板在 Tab 順序上接在放大鏡後面。往前離開回到放大鏡；往後離開就收起，焦點到放大鏡的下一顆
    if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); close(false); if (btnD) btnD.focus(); }
    else if (!e.shiftKey && doc.activeElement === last) {
      e.preventDefault(); close(false);
      const all = [...doc.querySelectorAll(FOCUSABLE)].filter(x => !layer.contains(x) && x.getClientRects().length && x.tabIndex >= 0);
      const i = btnD ? all.indexOf(btnD) : -1;
      const next = i >= 0 ? all[i + 1] : null;
      if (next) next.focus(); else if (btnD) btnD.focus();
    }
  });
  layer.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ps]');
    if (!b) return;
    const act = b.dataset.ps;
    if (act === 'back') return close(true);
    if (act === 'clear') { input.value = ''; render(); input.focus(); return; }
    const uid = b.dataset.uid; if (!uid) return;
    const name = (st.rows.find(r => r.uid === uid) || {}).name || (b.closest('.ps-row') && b.closest('.ps-row').querySelector('.ps-name').textContent) || '';
    if (act === 'open') { deps.openViewer(uid, b); return; }   // 面板留著：關掉資料卡回到這一列，關鍵字保留
    if (act === 'write') { close(false); deps.writeTo(name, { uid }); }
  });
  // Esc 關閉（資料卡開在上面時，資料卡自己先處理 Esc）
  window.addEventListener('keydown', (e) => {
    if (!st.open || e.key !== 'Escape') return;
    if (doc.querySelector('.pc-overlay')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    close(true);
  }, true);
  // 桌機：點面板外面、焦點移到別處就收起（資料卡、提示訊息、自己的頭像選單不算外面）
  const inside = (t) => !t || !t.closest || layer.contains(t) || triggers().some(b => b.contains(t)) || !!t.closest('.pc-overlay, .pc-toast, .me-menu');
  doc.addEventListener('pointerdown', (e) => { if (st.open && !mq.matches && !inside(e.target)) close(false); }, true);
  doc.addEventListener('focusin', (e) => { if (st.open && !inside(e.target)) close(false); });   // 例如從資料卡按「寫感謝卡」後游標到撰寫區
  window.addEventListener('resize', () => { if (st.open) place(); });
  if (mq.addEventListener) mq.addEventListener('change', () => { if (st.open) place(); });

  // 「/」快捷鍵：焦點不在輸入框、沒有其他視窗開著時
  const editable = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  doc.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.defaultPrevented) return;
    if (st.open || editable(e.target) || editable(doc.activeElement)) return;
    if (deps.isBlocked && deps.isBlocked()) return;
    const t = triggers().find(b => b.getClientRects().length);
    if (!t) return;
    e.preventDefault();
    const a = doc.activeElement;
    open(a && a !== doc.body && a.isConnected ? a : t);       // 關掉後焦點回到按「/」之前的位置
  });

  // 頭像下載好：只換那一列的頭像
  if (deps.onAvatar) deps.onAvatar((uid) => {
    if (!st.open) return;
    for (const el of layer.querySelectorAll('[data-ps-av]')) {
      const u = el.getAttribute('data-ps-av');
      if (uid === '*' || u === uid) { const r = st.rows.find(x => x.uid === u); el.innerHTML = deps.avatar(u, r ? r.name : el.closest('.ps-row').querySelector('.ps-name').textContent, 36); }
    }
  });

  // 自己的頭像選單加一項「找同事」（profile-ui.js 打開選單時讀 ext.menuExtra）。
  // 用 getter／setter 包起來：之後別的模組（例如小舖）再設定 menuExtra 時，兩項都會出現。
  if (deps.ext) {
    let inner = deps.ext.menuExtra || null;
    Object.defineProperty(deps.ext, 'menuExtra', {
      configurable: true, enumerable: true,
      get: () => () => {
        const frag = doc.createDocumentFragment();
        const b = doc.createElement('button');
        b.type = 'button'; b.setAttribute('role', 'menuitem'); b.className = 'ps-menu-item'; b.dataset.pc = 'ps-search';   // data-pc：點了選單照常收起
        b.innerHTML = ICON + `<span>${esc(T.label)}</span>`;
        b.addEventListener('click', () => { const av = doc.getElementById('userAvatar'); open(av || null); });
        frag.appendChild(b);
        const more = inner ? inner() : null;
        if (more) frag.appendChild(more);
        return frag;
      },
      set: (fn) => { inner = typeof fn === 'function' ? fn : null; },
    });
  }

  return {
    open: (from) => open(from || triggers().find(b => b.getClientRects().length) || null),
    close, refresh: () => { if (st.open) render(); },
    get isOpen() { return st.open; },
    el: layer, buttons: triggers(),
  };
}
