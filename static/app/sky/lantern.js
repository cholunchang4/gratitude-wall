// T101 第一幕「天燈共鳴」：全螢幕夜空場景（design/點亮星空/設計規格.md 第 6 節）。
// 句子從伺服器的 skyPool 拿（每次隨機最多 6 句、不含自己；第 6、8 格、關掉進池的人、離開通訊錄的人都不會出現；少於 3 位的主題不出現）。
// 隱私：選了哪一盞、讀了誰**不寫進任何地方**；只在這台裝置記「今天送上了哪幾個主題、讀了幾句」（同一天回來接著玩）。
// Functions 還沒上線（skyPool 失敗）時：顯示「天燈還在準備中」空狀態，不自己讀別人的說明書（讀不到別人的進池開關）。
import * as L from './sky-logic.js';
import { ic, star4, dot, lanternShape, miniLantern, pipSVG, pocketSVG, hillsSVG, cstSVG } from './sky-icons.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const FOCUSABLE = 'button:not([disabled]):not([aria-disabled="true"]), [tabindex]:not([tabindex="-1"])';
const rm = () => document.body.classList.contains('rm') || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const TAGS = { 'work.ok': '這樣我很 OK', 'work.no': '這樣我會卡住' };

/** o = { bank, deps, onDone() → Promise<{amount}|{replay}|{pending}>, onWrite(p), onClose(), progress: { get, set }, isLit() } */
export function createLantern(o) {
  const { bank, deps } = o;
  let el = null, st = null, returnTo = null, busy = false;

  const save = () => o.progress.set({ d: st.day, done: st.done, read: st.read });
  function open(from) {
    if (el) return;
    returnTo = from || document.activeElement;
    const pr = L.lanternProgress(o.progress.get(), deps.nowMs());
    st = { day: pr.d, done: pr.done, read: pr.read, step: 'loading', themes: null, theme: null, items: [], picked: -1, need: 3, result: null, error: '', wasLit: !!(o.isLit && o.isLit()), openedAt: deps.nowMs(), finishing: null };   // wasLit：打開時天燈座亮了沒（完成時才判斷會被自己剛入帳的那筆騙到）
    el = document.createElement('section');
    el.className = 'ln-scene'; el.id = 'lnScene';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'lnT');
    document.body.appendChild(el);
    document.body.classList.add('ln-open');
    el.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey, true);
    draw();
    loadThemes();
  }
  function close(restore = true) {
    if (!el) return;
    document.removeEventListener('keydown', onKey, true);
    el.remove(); el = null; document.body.classList.remove('ln-open');
    if (o.onClose) o.onClose();
    if (restore && returnTo && returnTo.isConnected && typeof returnTo.focus === 'function') { try { returnTo.focus({ preventScroll: true }); } catch (e) { /* 略 */ } }
  }
  function onKey(e) {
    if (!el || document.querySelector('.pc-overlay')) return;                      // 資料卡開在天燈上面：交給資料卡
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    if (e.key === 'Tab') {
      const f = [...el.querySelectorAll(FOCUSABLE)].filter(x => x.getClientRects().length);
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (!el.contains(document.activeElement)) { e.preventDefault(); a.focus(); }
      else if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
  }

  async function loadThemes() {
    try {
      const r = await bank.call('skyPool', {});
      const avail = r && r.themes && typeof r.themes === 'object' ? r.themes : {};
      st.themes = L.THEMES.filter(t => Number(avail[t.k]) >= L.POOL.min).map(t => ({ ...t, n: Math.min(Number(avail[t.k]), L.POOL.size) }));
      st.need = Math.min(3, st.themes.length);
      st.done = st.done.slice(0, 3);
      st.step = !st.themes.length ? 'empty' : st.done.length >= st.need ? 'done' : 'choose';
      if (st.step === 'done') await finish();
    } catch (e) {
      // 沒部署（404／連不到）＝「天燈還在準備中」；逾時、伺服器錯誤＝「再試一次」；每天上限＝「明天再來」
      const c = e && e.code;
      st.step = c === 'CAP' ? 'cap' : (c === 'TIMEOUT' || c === 'INTERNAL') ? 'error' : 'empty';
    }
    draw(true);
  }
  async function loadTheme(k) {
    if (busy) return; busy = true;
    st.step = 'loading'; draw();
    try {
      const r = await bank.call('skyPool', { theme: k });
      const items = (r && Array.isArray(r.items) ? r.items : []).filter(x => x && typeof x.q === 'string' && typeof x.u === 'string' && x.u !== deps.meId).slice(0, L.POOL.size);
      if (items.length < L.POOL.min) { st.themes = st.themes.filter(t => t.k !== k); st.need = Math.min(3, st.themes.length); st.step = st.themes.length ? 'choose' : 'empty'; }
      else { st.theme = k; st.items = items; st.picked = -1; st.step = 'rise'; }
    } catch (e) { st.step = e && e.code === 'CAP' ? 'cap' : 'error'; }
    busy = false;
    draw(true);
  }
  // 防重入（I4）：送上第 3 盞、重新開場景剛好都觸發完成時，只領一次、只算一次結果
  function finish() {
    if (!st.finishing) {
      const cur = st;
      cur.finishing = (async () => {
        try { cur.result = await o.onDone({ wasLit: cur.wasLit, openedAt: cur.openedAt }); } catch (e) { console.error('[sky] 天燈座', e); cur.result = { pending: true }; }
        cur.step = 'done';
      })();
    }
    return st.finishing;
  }

  function onClick(e) {
    const b = e.target.closest('button'); if (!b || !el) return;
    if (b.dataset.ln === 'x' || b.dataset.ln === 'back-wall') return close();
    if (b.dataset.theme) { if (b.getAttribute('aria-disabled') === 'true') return; return loadTheme(b.dataset.theme); }
    if (b.dataset.i != null && st.step === 'rise') {
      const i = Number(b.dataset.i); st.picked = st.picked === i ? -1 : i;
      for (const x of el.querySelectorAll('.ln-lantern')) x.setAttribute('aria-pressed', String(Number(x.dataset.i) === st.picked));
      const send = el.querySelector('[data-ln="send"]'); if (send) { send.disabled = st.picked < 0; send.setAttribute('aria-disabled', String(st.picked < 0)); }
      return;
    }
    const act = b.dataset.ln;
    if (act === 'change') { st.step = 'choose'; st.picked = -1; return draw(true); }
    if (act === 'send' && st.picked >= 0 && st.step === 'rise') return release();
    if (act === 'skip') return next();
    if (act === 'profile') { const it = st.items[st.picked]; if (it) deps.openProfile(it.u, b); return; }
    if (act === 'write') { const it = st.items[st.picked]; if (it) { close(false); o.onWrite({ uid: it.u, name: it.n, filled: 1 }); } return; }
    if (act === 'cst') { close(false); deps.openConstellations && deps.openConstellations(); return; }
    if (act === 'manual') { close(false); deps.openEditor(); return; }
    if (act === 'retry') { st.step = 'loading'; draw(); return loadThemes(); }
  }
  function release() {
    st.step = 'release';
    const grid = el.querySelector('.ln-grid');
    if (grid) { grid.classList.add('is-releasing'); const li = grid.children[st.picked]; if (li) li.classList.add('is-picked'); }
    const send = el.querySelector('[data-ln="send"]'); if (send) { send.disabled = true; send.setAttribute('aria-disabled', 'true'); }
    if (!rm()) {
      const pk = el.querySelector('.ln-pocket'); const r = pk ? pk.getBoundingClientRect() : { left: innerWidth - 60, top: 30, width: 44, height: 44 };
      const d = document.createElement('i'); d.className = 'ln-drop';
      d.style.cssText = `--fx:50vw;--fy:30vh;--tx:${(r.left + r.width / 2 - 8) | 0}px;--ty:${(r.top + r.height / 2 - 8) | 0}px`;
      el.appendChild(d);
    }
    st.read += st.items.length;
    if (!st.done.includes(st.theme)) st.done.push(st.theme);
    save();
    setTimeout(() => {
      if (!el) return;
      st.step = 'person'; draw(true);
      const pk = el.querySelector('.ln-pocket'); if (pk) pk.classList.add('is-catch');
    }, rm() ? 260 : 1600);
  }
  async function next() {
    if (st.done.length >= st.need) { st.step = 'loading'; draw(); await finish(); draw(true); return; }
    st.step = 'choose'; st.picked = -1; draw(true);
  }

  // ------------------------------------------------------------------ 畫面
  function head() {
    const n = Math.min(st.done.length, st.need || 3), total = st.need || 3;
    return '<header class="ln-head">'
      + `<button class="ln-x" type="button" data-ln="x" aria-label="離開天燈共鳴">${ic('x')}</button>`
      + '<h2 class="ln-title" id="lnT"><small>第一幕</small>天燈共鳴</h2>'
      + `<div class="ln-status"><div class="ln-pips" role="img" aria-label="已送上 ${n} 盞，共 ${total} 盞"><span class="lbl">已送上</span>${Array.from({ length: total }, (_, i) => pipSVG(i < n)).join('')}</div>`
      + `<span class="ln-pocket" role="img" aria-label="你的星空">${pocketSVG(n)}</span></div></header>`;
  }
  function body() {
    const s = st.step;
    if (s === 'loading') return '<div class="ln-step" aria-busy="true"><h3 id="lnStep">天燈正在準備…</h3><p>馬上就好。</p></div><div class="ln-spacer"></div>';
    if (s === 'empty' || s === 'error' || s === 'cap') {
      const t = s === 'cap' ? ['今晚的天燈都升起來了', '今天升起了好多天燈，明天再來讀讀看吧。'] : s === 'error' ? ['天燈被風吹了一下', '網路好像不太穩，再試一次看看。'] : ['天燈還在準備中', '再多幾位同事寫下說明書，天燈就能升起來了。<br>想先寫寫看你的嗎？'];
      return `<div class="ln-empty"><svg viewBox="0 0 160 120" aria-hidden="true"><g transform="translate(46 22)">${miniLantern('width="64" height="76"')}</g><circle cx="22" cy="30" r="2" fill="#fff6e0"/><circle cx="138" cy="20" r="1.6" fill="#fff6e0"/><circle cx="128" cy="64" r="1.2" fill="#fff6e0"/></svg>`
        + `<h3 id="lnStep">${t[0]}</h3><p>${t[1]}</p><div class="acts">`
        + (s === 'error' ? `<button class="sk-btn primary" type="button" data-ln="retry">再試一次</button>` : s === 'empty' ? `<button class="sk-btn primary" type="button" data-ln="manual">${ic('pen')}寫我的使用說明書</button>` : '')
        + '<button class="sk-btn dark" type="button" data-ln="back-wall">回到感謝牆</button></div></div>';
    }
    if (s === 'choose') {
      const n = st.done.length;
      const h = n === 0 ? '今晚，想讀哪一種心意？' : n === st.need - 1 ? '還有一盞。換個主題看看？' : '再選一個主題吧';
      const p = n === 0 ? '選一個主題，同事們的話會帶著天燈慢慢升起。' : '每個主題送上一盞；換個主題，會讀到不一樣的人。';
      return `<div class="ln-step"><h3 id="lnStep">${h}</h3><p>${p}</p></div><ul class="ln-themes" aria-labelledby="lnStep">`
        + st.themes.map(t => { const done = st.done.includes(t.k);
          return `<li><button class="ln-theme${done ? ' is-done' : ''}" type="button" data-theme="${t.k}"${done ? ' aria-disabled="true"' : ''} aria-label="${esc(t.t)}${done ? '，已經送上一盞' : `，${t.n} 盞`}">`
            + `<span class="mini">${miniLantern()}${ic(t.k)}</span>${esc(t.t)}${done ? `<small>${ic('check')}送上了</small>` : `<small>${t.n} 盞</small>`}</button></li>`; }).join('')
        + '</ul><div class="ln-spacer"></div>';
    }
    if (s === 'rise' || s === 'release') {
      const t = L.THEMES.find(x => x.k === st.theme);
      return `<div class="ln-step"><h3 id="lnStep">讀一讀，哪一盞最讓你有感？</h3><p>主題：${esc(t ? t.t : '')}</p></div>`
        + `<ul class="ln-grid" aria-labelledby="lnStep">${st.items.map((it, i) => `<li><button class="ln-lantern" type="button" aria-pressed="${st.picked === i}" data-i="${i}" style="--d:${i * 140}ms" aria-label="${esc(it.n)}：${esc(it.q)}">`
          + `<span class="body">${lanternShape()}<span class="sel-badge">${ic('check')}這一盞</span><span class="q">${TAGS[it.k] ? `<span class="tag">${TAGS[it.k]}</span>` : ''}${esc(it.q)}</span><span class="flame"></span></span>`
          + `<span class="who">${deps.avatar(it.u, it.n, 22)}<span>${esc(it.n)}</span></span></button></li>`).join('')}</ul>`
        + `<div class="ln-action"><div class="row"><button class="sk-btn dark" type="button" data-ln="change">換主題</button><button class="sk-btn primary" type="button" data-ln="send"${st.picked < 0 ? ' disabled aria-disabled="true"' : ''}>${ic('lantern')}這句我有感</button></div>`
        + `<p class="hint">${ic('eye-off')}只有你知道你選了哪一盞。</p></div>`;
    }
    if (s === 'person') {
      const it = st.items[st.picked] || {}, t = L.THEMES.find(x => x.k === st.theme);
      return '<div class="ln-step"><h3 id="lnStep">它飛上去了。</h3><p>想多認識他一點嗎？</p></div>'
        + `<section class="ln-person" aria-labelledby="lnStep"><div class="top">${deps.avatar(it.u, it.n, 64)}<div><b>${esc(it.n)}</b><p>這盞天燈帶著他的話，飛上了夜空。</p></div></div>`
        + `<blockquote><small>${esc(t ? t.t : '')}${TAGS[it.k] ? `・${TAGS[it.k]}` : ''}</small>${esc(it.q)}</blockquote>`
        + `<div class="acts"><button class="sk-btn light" type="button" data-ln="profile">${ic('book')}看他的使用說明書</button><button class="sk-btn primary" type="button" data-ln="write">${ic('send')}寫感謝卡給他</button></div>`
        + `<button class="skip" type="button" data-ln="skip">先不用${st.done.length < st.need ? '，繼續升起天燈' : ''}</button></section><div class="ln-spacer"></div>`;
    }
    if (s === 'done') {
      const r = st.result || {};
      if (r.replay) return `<div class="ln-done" role="status"><h3 id="lnStep">今晚，你讀了 ${st.read} 句同事的話。</h3><div class="acts"><button class="sk-btn primary" type="button" data-ln="back-wall">回到感謝牆</button></div></div>`;
      const reward = r.amount ? `<p class="reward">${dot()}<span class="lp-amt on-dark">＋${r.amount} 光點</span><small>先存進你的星光存摺</small></p>` : `<p class="reward">${dot()}<span>小螢記下了</span><small>12/1 會倒進你的光瓶</small></p>`;
      return `<div class="ln-done" role="status">${cstSVG('lantern', true)}<h3 id="lnStep">叮！${star4('t4')} 天燈座亮了</h3><p>今晚，你讀了 ${st.read} 句同事的話。</p>${reward}`
        + `<div class="acts"><button class="sk-btn dark" type="button" data-ln="cst">${ic('cst')}看我的星座</button><button class="sk-btn primary" type="button" data-ln="back-wall">回到感謝牆</button></div>`
        + '<p style="font-size:13px;color:var(--sk-text-3);margin-top:18px">想再讀的時候，隨時可以回來升起天燈。</p></div>';
    }
    return '';
  }
  function draw(focus = false) {
    if (!el) return;
    el.innerHTML = `<div class="sk-stars"></div><div class="sk-twinkle" style="display:block"><i></i><i></i><i></i></div>${hillsSVG()}<div class="ln-wrap">${head()}${body()}</div>`;
    if (focus || !el.contains(document.activeElement)) setTimeout(() => {
      if (!el) return;
      const f = el.querySelector('.ln-theme:not([aria-disabled="true"]), .ln-lantern, .ln-person .sk-btn.primary, .ln-done .sk-btn.primary, .ln-empty .sk-btn.primary') || el.querySelector('[data-ln="x"]');
      if (f) f.focus({ preventScroll: true });
    }, 40);
  }
  return { open, close, get isOpen() { return !!el; } };
}
