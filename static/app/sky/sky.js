// T101 點亮星空 2.0「被看見的星」：前台控制器（夜空牆面、全公司進度條、活動／換幕彈窗、門檻通知、星線、流星、
// 我的星座、星光存摺、因為說明書收到的感謝、編輯頁的光點說明、入帳提示、裝訂、小撇步實驗室）。
// 設計：design/點亮星空/（美術總監 v1）；文字：文案-點亮星空與拾光小舖.md；規則與入帳：docs/光點帳本規格.md 第 13 節（程式設計 3）。
//
// 隱私（P&C 心理安全檢查表）：
// - 天燈選了誰、讀了誰、實驗室收藏了誰，**不寫進任何共用節點**（實驗室書籤只存在這台裝置）。
// - 畫面上沒有填寫進度、沒有「還差幾格」、沒有名單、沒有「被選過幾次」；唯一的數字進度是全公司點亮人數。
// - 星座、存摺、「因為說明書收到的感謝」只出現在本人的畫面。
// 銀行（Functions）還沒上線時：不報錯，入帳的地方改說「小螢記下了」，三座的完成先記在這台裝置，之後開站自動補領。
import { ref, onValue, update as dbUpdate } from '../../vendor/firebase-sdk.js';
import * as L from './sky-logic.js';
import { createBank } from './sky-bank.js';
import { createLantern } from './lantern.js';
import { SKY_DEFS, ic, star4, dot, heroSVG, cstSVG, cstFinal, scopeArt } from './sky-icons.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 無痕等不能存：這次照樣運作 */ } },
};
export const reducedMotion = () => document.body.classList.contains('rm') || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const TS = { '.sv': 'timestamp' };

/**
 * deps = {
 *   db, user, meId, isAdmin, emulator,
 *   store: WallStore（messages、people、nameOf、prefs）, onBackend(fn(type, data)),
 *   profile: ProfileService, openProfile(uid, from), openEditor(from), closeProfiles(),
 *   writeTo(name)          // 收件人帶入 name、游標到內容欄（app.js）
 *   setPref(key, value)    // api/me/prefs
 *   avatar(uid, name, size) → html   // .pav 頭像（有照片用照片）
 *   themeClass(theme) → 't-sage'…, nowMs(), canShowPopup() → boolean, onLayout()（進度條出現／消失時重排牆面）
 * }
 */
export function createSky(deps) {
  const me = deps.meId;
  const K_SEEN = `sky26_seen_${me}`, K_LOCAL = `sky26_me_${me}`, K_LAB = `sky26_lab_${me}`, K_PCK = `sky26_pck_${me}`, K_LN = `sky26_ln_${me}`;
  const S = { phase: null, tier: 0, count: 0, skyme: null, skymeOk: false, bar: null, timer: null, open: null, pendingFrom: null, lastProfile: null,
    meteorBusy: false, started: false, tierShownThisLoad: false };
  const local = () => ls.get(K_LOCAL) || {};
  const setLocal = (k, v) => { const o = local(); o[k] = v; ls.set(K_LOCAL, o); };
  const seen = () => ls.get(K_SEEN) || {};
  const markSeen = (k, v = 1) => { const o = seen(); o[k] = v; ls.set(K_SEEN, o); };

  if (!document.getElementById('skyDefs')) document.body.insertAdjacentHTML('afterbegin', SKY_DEFS);
  const bank = createBank({ db: deps.db, user: deps.user, meId: me, emulator: deps.emulator, onChange: (k) => onBank(k) });
  const lantern = createLantern({ bank, deps: { ...deps, openConstellations: () => openConstellations() }, onDone: (r) => onLanternDone(r), onWrite: (p) => composeFrom(p), onClose: () => paintBar(),
    progress: { get: () => ls.get(K_LN), set: (v) => ls.set(K_LN, v) }, isLit: () => cst().items[0].lit });

  // ------------------------------------------------------------------ 狀態
  const messages = () => [...deps.store.messages.values()];
  const isActive = (uid) => !!(deps.store.people[uid] && deps.store.people[uid].s === 'active');
  function starCount() {
    const v = bank.st.stars;
    if (v && Number.isFinite(Number(v.n))) return { n: Number(v.n), tier: Math.max(Number(v.tier) || 0, L.tierOf(Number(v.n))), est: false };
    const n = L.estimateLit(messages(), { isActive });
    return { n, tier: L.tierOf(n), est: true };
  }
  const cst = () => L.constellations({ ledger: bank.st.ledger || {}, local: { ...local(), ...(S.skyme || {}) }, now: deps.nowMs() });

  // ------------------------------------------------------------------ 每次資料或時間變了：重算畫面
  function update() {
    const now = deps.nowMs();
    const c = starCount();
    const tierUp = c.tier > S.tier && S.started;
    S.count = c.n; S.tier = c.tier;
    deps.store.skyTier = c.tier;                                     // 星夜模板的前端檢查（writes.js）用
    const ph = L.phaseOf(now, c.tier);
    const prev = S.phase;
    S.phase = ph;
    document.body.classList.toggle('sky', ph.night);
    document.body.classList.toggle('sk-t1', ph.twinkle);
    ensureLayers(ph.night);
    paintBar(prev && prev.bar !== ph.bar);
    if (now >= L.START_PROFILE && !S.started) { S.started = true; start(); }
    syncStarnight(ph);
    if (S.started && (ph.live || ph.epilogue)) maybePopups(tierUp);
    schedule(now);
  }
  // 頁面開著跨過換幕、結束、跨年的時間點：到點自動重算（不靠重新整理）
  function schedule(now) {
    clearTimeout(S.timer);
    const marks = [L.SKY.start, L.SKY.act2, L.SKY.act3, L.SKY.end + 1, L.SKY.epilogue_end + 1, L.SKY.twinkle_end + 1, L.SHOP_START].filter(t => t > now).sort((a, b) => a - b);
    if (marks.length && marks[0] - now < 2147483000) S.timer = setTimeout(update, marks[0] - now + 500);
  }
  function start() {
    bank.listen();
    bank.open();                                                     // 開戶／補發（冪等，失敗不報錯）
    onValue(ref(deps.db, `skyme/${me}`), (s) => { S.skyme = s.val() || {}; S.skymeOk = true; reconcile(); update(); },
      () => { S.skyme = null; S.skymeOk = false; });
    deps.onBackend((type, d) => {
      if (type === 'message.created' && d && d.message && L.isStarSrc(d.message.src)) { update(); if (!d.message.is_mine) meteor(); }
    });
    window.addEventListener('resize', () => paintBar(true));
  }
  function onBank(kind) {
    if (kind === 'stars' || kind === 'ledger' || kind === 'status') { update(); if (kind === 'ledger') { reconcile(); onLedger(); } }
    if (kind === 'wallet' || kind === 'ledger' || kind === 'status') repaintPassbook();
  }

  // 這台裝置記下的完成、或 skyme 有、但帳本還沒有的：補呼叫 bankClaim（銀行上線後自動補寫）
  let reconciling = false;
  async function reconcile() {
    if (reconciling || !bank.st.ledgerOk || bank.down) return;
    reconciling = true;
    try {
      const now = deps.nowMs(), lg = bank.st.ledger || {}, mine = { ...local(), ...(S.skyme || {}) };
      const open = (c) => now >= Number((L.EV_CODES[c] && L.EV_CODES[c].open) || 0);
      if (mine.pick && !lg.ev_ev26_pick && open('pick')) await bank.claim('pick');
      if ((mine.link || myStarCards().length) && !lg.ev_ev26_link && open('link')) await bank.claim('link');
      if (S.skyme && S.skyme.lab && !lg.ev_ev26_lab && open('lab')) await bank.claim('lab', S.skyme.lab);
      if (now >= L.SHOP_START) for (const [i, c] of ['t1', 't2', 't3'].entries()) if (S.tier > i && !lg[`ev_ev26_${c}`]) await bank.claim(c);
    } finally { reconciling = false; }
  }
  const myStarCards = () => messages().filter(m => L.isStarSrc(m.src) && deps.store.mine && deps.store.mine[m.id] && m.created_at >= L.SKY.start && m.created_at <= L.SKY.end);

  // ------------------------------------------------------------------ 夜空背景、流星層
  function ensureLayers(on) {
    let st = document.getElementById('skStars');
    if (on && !st) {
      const wall = document.getElementById('wall');
      const html = '<div class="sk-stars" id="skStars" aria-hidden="true"></div><div class="sk-twinkle" id="skTwinkle" aria-hidden="true"><i></i><i></i><i></i></div><div class="meteor-layer" id="skMeteors" aria-hidden="true"></div>';
      if (wall) wall.insertAdjacentHTML('beforebegin', html); else document.body.insertAdjacentHTML('afterbegin', html);
    } else if (!on && st) { ['skStars', 'skTwinkle', 'skMeteors'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); }
  }
  /** 銀河傳說（第三道門檻）後：星光卡送出時全牆劃過一道流星（同時最多 1 道；減少動態、分頁在背景、全螢幕看圖時不播） */
  function meteor() {
    if (S.tier < 3 || S.meteorBusy || reducedMotion() || document.hidden) return false;
    if (deps.isPaused && deps.isPaused()) return false;
    const layer = document.getElementById('skMeteors'); if (!layer) return false;
    S.meteorBusy = true;
    const m = document.createElement('i'); m.className = 'meteor';
    m.style.cssText = `--x0:${(4 + Math.random() * 30).toFixed(1)}%;--y0:${(8 + Math.random() * 30).toFixed(1)}%;--ang:${(14 + Math.random() * 8).toFixed(1)}deg`;
    layer.appendChild(m);
    setTimeout(() => { m.remove(); S.meteorBusy = false; }, 1300);
    return true;
  }

  // ------------------------------------------------------------------ 全公司進度條
  function paintBar(relayout = false) {
    const ph = S.phase; if (!ph) return;
    const want = ph.bar;
    const flow = window.innerWidth <= 768;
    let bar = S.bar;
    if (!want) { if (bar) { bar.remove(); S.bar = null; if (deps.onLayout) deps.onLayout(); } return; }
    if (!bar || bar.classList.contains('is-flow') !== flow) {
      if (bar) bar.remove();
      bar = document.createElement('div');
      bar.className = `sk-bar ${flow ? 'is-flow' : 'is-top'}`; bar.id = 'skBar';
      bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', '點亮星空');
      bar.addEventListener('click', onBarClick);
      if (flow) {
        const anchor = document.querySelector('.switch-bar');
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(bar, anchor.nextSibling); else document.body.appendChild(bar);
      } else document.body.appendChild(bar);
      S.bar = bar; relayout = true;
    }
    const n = S.count, nx = L.nextTier(n);
    const ctas = { 1: ['lantern', '升起天燈'], 2: ['link', '去連一顆星'], 3: ['scope', '打開實驗室'] }[ph.act];
    const html = `<button type="button" class="sk-count" data-sk="intro" aria-label="打開點亮星空說明"><span>夜空裡，已經有</span><b>${n}</b><span>顆星亮了</span></button>`
      + `<p class="sk-next">${nx ? `再 ${nx.need} 顆，就是「${esc(nx.name)}」` : '銀河出現了'}</p>`
      + `<div class="sk-track" role="progressbar" data-sk="intro" aria-label="全公司被點亮的星" aria-valuemin="0" aria-valuemax="${L.SKY.tiers[2]}" aria-valuenow="${Math.min(n, L.SKY.tiers[2])}" aria-valuetext="${esc(L.barAria(n))}">`
      + `<i style="--p:${L.barPercent(n)}%"></i>${L.SKY.tiers.map((t, i) => `<span class="sk-tick${n >= t ? ' is-on' : ''}" style="--x:${(t / L.SKY.tiers[2]) * 100}%">${star4()}<em>${t} ${L.TIER_NAMES[i]}</em></span>`).join('')}</div>`
      + `<button class="sk-cta" type="button" data-sk="cta">${ic(ctas[0])}${ctas[1]}</button>`
      + `<button class="sk-me" type="button" data-sk="me" aria-label="我的星座" title="我的星座">${ic('cst')}</button>`;
    const prevN = Number(bar.dataset.n);
    if (bar.dataset.html !== html) { bar.innerHTML = html; bar.dataset.html = html; }
    if (Number.isFinite(prevN) && n > prevN && !reducedMotion()) { bar.classList.remove('is-pulse'); void bar.offsetWidth; bar.classList.add('is-pulse'); setTimeout(() => bar.classList.remove('is-pulse'), 1000); }
    bar.dataset.n = String(n);
    if (relayout && deps.onLayout) deps.onLayout();
  }
  function onBarClick(e) {
    const b = e.target.closest('[data-sk]'); if (!b) return;
    const k = b.dataset.sk;
    if (k === 'intro') return openIntro(b);
    if (k === 'me') return openConstellations(b);
    if (k === 'cta') return primaryAction(b);
  }
  function primaryAction(from) {
    const act = S.phase && S.phase.act;
    if (act === 3) return openLab(from);
    if (act === 2 && S.lastProfile && isActive(S.lastProfile)) return deps.openProfile(S.lastProfile, from);   // 「去連一顆星」：最近看過的說明書
    return lantern.open(from);
  }
  /** 牆面卡片要讓出的上方高度（桌機的固定進度條） */
  // 感謝榜整合（2026-11-01）：進度條依寬度移位（thanks-board.css 2b 節：≥1280 top 130、769～960 top 186），改用實際下緣推算
  //（原本固定 top 100＋高 86）；量不到時（還沒排版）退回 86。牆面的實際避讓仍以 scRegion 的 #skBar 保護區為準。
  const topExtra = () => {
    if (!S.bar || !S.bar.classList.contains('is-top')) return 0;
    const b = S.bar.getBoundingClientRect();
    return b.height ? Math.max(0, Math.round(b.bottom) - 100) : 86;
  };

  // ------------------------------------------------------------------ 共用浮層（焦點困住、Esc、關閉後焦點回原處）
  function overlay(html, { cls = 'sk-overlay', onClose, returnTo, label } = {}) {
    const el = document.createElement('div');
    el.className = cls; el.innerHTML = html;
    document.body.appendChild(el);
    const entry = { el, returnTo: returnTo || document.activeElement, closed: false };
    entry.close = (restore = true) => {
      if (entry.closed) return; entry.closed = true;
      el.remove(); document.removeEventListener('keydown', onKey, true);
      if (S.open === entry) S.open = null;
      if (onClose) onClose();
      const r = entry.returnTo;
      if (restore && r && r.isConnected && typeof r.focus === 'function') { try { r.focus({ preventScroll: true }); } catch (e) { /* 略 */ } }
    };
    const onKey = (e) => {
      if (document.querySelector('.pc-overlay')) return;                        // 資料卡開在上面：交給它
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); entry.close(); return; }
      if (e.key === 'Tab') {
        const f = [...el.querySelectorAll(FOCUSABLE)].filter(x => x.getClientRects().length);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    el.addEventListener('mousedown', (e) => { entry.down = e.target === el; });
    el.addEventListener('click', (e) => { if (e.target === el && entry.down) entry.close(); });
    if (label) el.setAttribute('aria-label', label);
    S.open = entry;
    setTimeout(() => { const f = el.querySelector('[data-autofocus]') || el.querySelector(FOCUSABLE); if (f) f.focus({ preventScroll: true }); }, 30);
    return entry;
  }

  // ------------------------------------------------------------------ 活動彈窗、換幕彈窗、門檻通知（每人每個只自動跳一次）
  function maybePopups(tierUp) {
    const ph = S.phase; if (!ph || !(ph.live || ph.epilogue)) return;
    if (S.open || document.querySelector('.ln-scene, .pc-overlay, .lab-drawer')) { setTimeout(() => maybePopups(false), 1500); return; }
    if (deps.canShowPopup && !deps.canShowPopup()) { setTimeout(() => maybePopups(false), 1500); return; }
    const sn = seen();
    if (ph.epilogue && !bank.st.starsOk && (S.epiWait = (S.epiWait || 0) + 1) <= 6) { setTimeout(() => maybePopups(false), 1500); return; }   // 等最終人數讀進來（最多約 9 秒）
    if (ph.epilogue) { if (!sn.epi) { markSeen('epi'); markSeen('epiDay', L.tpeDay(deps.nowMs())); openEpilogue(); } return; }
    if (!sn.main) { markSeen('main'); if (ph.act >= 2) markSeen('a2'); if (ph.act >= 3) markSeen('a3'); return openIntro(null, true); }
    if (ph.act >= 3 && !sn.a3) { markSeen('a3'); markSeen('a2'); return openAct(3); }
    if (ph.act >= 2 && !sn.a2) { markSeen('a2'); return openAct(2); }
    if (S.tier > (Number(sn.tier) || 0)) { markSeen('tier', S.tier); tierToast(S.tier); }
    void tierUp;
  }
  function openIntro(from, auto = false) {
    const act = S.phase ? S.phase.act : 1;
    const row = (n, k, t, d, p) => `<li class="sk-act${act === n ? ' is-now' : ''}"><span class="ic">${ic(k)}</span><div><h3>${t} <span class="sk-chip${act === n ? ' is-now' : ''}">${d}${act === n ? '・進行中' : ''}</span></h3><p>${p}</p></div></li>`;
    const cta = { 1: ['lantern', '升起天燈'], 2: ['link', '去連一顆星'], 3: ['scope', '打開實驗室'] }[act] || ['lantern', '升起天燈'];
    const html = '<section class="sk-modal" role="dialog" aria-modal="true" aria-labelledby="skIntroT"><div class="sk-modal-scroll">'
      + `<div style="position:relative">${heroSVG('main')}<h2 class="sk-hero-title" id="skIntroT"><small>點亮星空 2.0</small>${star4('t4')} 被看見的星 </h2>`
      + `<button class="sk-close" type="button" data-x aria-label="關閉">${ic('x')}</button></div><div class="sk-body"><div class="sk-story">`
      + '<p>萬聖夜的南瓜燈熄了，吸血鬼們摘下面具，回到晨光裡做回自己。面具摘下來之後，大家才發現：坐在隔壁、或在電話另一頭的那個人，喜歡怎麼合作、卡關時需要什麼，我們其實不太知道。</p>'
      + '<p>於是，感謝牆的天空暗了下來。夜空裡的每一顆星，都是一位同事。<strong>要有人讀懂他、謝謝他，光才會聚到他身上，讓他亮起來。</strong></p></div>'
      + '<h3 class="sk-h">三幕</h3><ol class="sk-acts">'
      + row(1, 'lantern', '第一幕｜天燈共鳴', '11/10 起', '選一個主題，讀同事們的話，把最有感的那一盞天燈送上夜空。送上三盞，「天燈座」亮起，<span class="lp-amt">＋15 光點</span>。')
      + row(2, 'link', '第二幕｜連星', '11/17 起', '從說明書寫一張感謝卡，在你們之間連出一道星線。「連星座」亮起，<span class="lp-amt">＋15 光點</span>。')
      + row(3, 'scope', '第三幕｜小撇步實驗室', '11/24 起', '照同事的小撇步真的做一次，再寫卡告訴他效果。「實驗座」亮起，<span class="lp-amt">＋15 光點</span>。')
      + '</ol><p class="sk-tier-note">三座都亮，再 <span class="lp-amt">＋25 光點</span>，還有一幅只屬於你的星圖。</p>'
      + '<h3 class="sk-h">全公司一起點亮（到 11/30 午夜）</h3><div class="sk-tiers">'
      + `<div class="sk-tier">${star4()}<b>${L.SKY.tiers[0]} 位</b><span>初星</span><small>整面牆開始閃爍</small></div>`
      + `<div class="sk-tier">${star4()}<b>${L.SKY.tiers[1]} 位</b><span>繁星</span><small>「星夜」模板送給每一個人</small></div>`
      + `<div class="sk-tier">${star4()}<b>${L.SKY.tiers[2]} 位</b><span>銀河傳說</span><small>星光卡送出時劃過流星</small></div></div>`
      + '<p class="sk-tier-note">每破一道門檻，每個人都會多一把光點。</p><h3 class="sk-h">星空守則</h3><ul class="sk-rules">'
      + `<li>${ic('check')}<span>一位同事只算一顆星；每個人最多能為天空點亮 10 顆。</span></li>`
      + `<li>${ic('book')}<span>說明書寫不寫都可以，沒寫的同事一樣會被點亮。「想學的事」和「卡關時」不會出現在遊戲裡。</span></li>`
      + `<li>${ic('moon')}<span>天上只顯示「幾顆星亮了」，沒有排行。</span></li>`
      + `<li>${ic('lock')}<span>只有登入的同事看得到說明書，隨時能改、能清空。</span></li>`
      + `<li>${dot(true)}<span>這三週存下的光點，會先放在星光存摺裡，12/1 有地方可以用。</span></li></ul></div></div>`
      + `<footer class="sk-foot"><span class="note">之後可以從上方的星空列再打開</span><button class="sk-btn light" type="button" data-x>先逛逛</button><button class="sk-btn primary" type="button" data-go data-autofocus>${ic(cta[0])}${cta[1]}</button></footer></section>`;
    const o = overlay(html, { returnTo: from, onClose: () => { if (auto) setTimeout(() => maybePopups(false), 300); } });
    o.el.id = 'skIntro';
    o.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) return o.close();
      if (e.target.closest('[data-go]')) { o.close(false); primaryAction(from || document.getElementById('skBar')); }
    });
  }
  function openAct(n) {
    const a = n === 2
      ? { k: 'link', t: '第二幕：連星', body: `<p>天上已經亮了 <strong>${S.count}</strong> 顆星。</p><p>天燈升上去之後，有些話留在了心裡。這一幕，請你親手連一顆星：讀一本說明書，按「寫感謝卡給他」。你們之間，會出現一道只屬於你們的星線。</p><p>第一次送出，「連星座」亮起，<span class="lp-amt">＋15 光點</span>。上週寫過的也算。</p>`, btn: `${ic('link')}去連一顆星` }
      : { k: 'lab', t: '第三幕：小撇步實驗室', body: '<p>說明書裡藏著好多「這樣我很 OK」。這一幕，挑一個放進你的實驗室，這週真的試一次，再寫卡告訴他結果。</p><p>放進實驗室，對方不會知道；只有你寫卡時，他才會收到。</p><p>送出那一刻，「實驗座」亮起，<span class="lp-amt">＋15 光點</span>。11/30（一）23:59，星空停止計數。</p>', btn: `${ic('scope')}打開實驗室` };
    const html = `<section class="sk-modal is-small" role="dialog" aria-modal="true" aria-labelledby="skActT"><div class="sk-modal-scroll"><div style="position:relative">${heroSVG(a.k)}<h2 class="sk-hero-title" id="skActT"><small>點亮星空</small>${a.t}</h2>`
      + `<button class="sk-close" type="button" data-x aria-label="關閉">${ic('x')}</button></div><div class="sk-body"><div class="sk-story">${a.body}</div></div></div>`
      + `<footer class="sk-foot"><button class="sk-btn light" type="button" data-x>晚點再說</button><button class="sk-btn primary" type="button" data-go data-autofocus>${a.btn}</button></footer></section>`;
    const o = overlay(html, { onClose: () => setTimeout(() => maybePopups(false), 300) });
    o.el.id = 'skAct'; o.el.dataset.act = String(n);
    o.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) return o.close();
      if (e.target.closest('[data-go]')) { o.close(false); primaryAction(document.getElementById('skBar')); }
    });
  }
  const TIER_TXT = ['每個人都會收到 10 光點，12/1 入帳。', '每個人都會收到 15 光點，12/1 入帳；「星夜」模板送給每一個人。', '每個人都會收到 25 光點，12/1 入帳；星光卡送出時，牆上會劃過流星。'];
  function tierToast(t) {
    const old = document.getElementById('skTier'); if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'sk-tier-toast'; el.id = 'skTier'; el.setAttribute('role', 'status');
    el.innerHTML = `<span class="seal">${star4()}</span><div><b>✦ ${L.TIER_LONG[t - 1]}出現了！</b><span>${TIER_TXT[t - 1]}</span></div><button class="x" type="button" aria-label="關閉">${ic('x')}</button>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    el.querySelector('.x').addEventListener('click', close);
    setTimeout(close, 5000);
  }

  // ------------------------------------------------------------------ 12/1～12/7 謝幕公告（文案 2-4；按鈕接拾光小舖開店公告，T102）
  // 和開店公告的約定：按「去看看那盞小燈」→ 發 sky:open-shop-intro；關閉時發 sky:epilogue-closed（via: button／close）；
  // window.__skyNotice.isOpen()／shownToday() 讓開店公告判斷「同一天不疊兩個彈窗」。
  const EPI = [
    '這片夜空還在醞釀。說明書會一直留著，星光卡也還是會帶著它的 ✦；下一次有人讀懂你，你的星照樣會亮。',
    '初星亮了。整面牆的星光會陪大家到 12/31。每個人都有 10 光點。',
    '繁星滿天了。「星夜」模板從今天起送給每一位同事，永久保留；牆上的星光也會一路閃到 12/31。兩道門檻的光點，每個人都有：10＋15，一共 25 光點。',
    '銀河，真的出現了。從今天起，每一張星光卡送出時，牆上都會劃過一顆流星；「星夜」模板永遠送給每一位同事；牆上的星光，也會一路閃到 12/31。三道門檻的光點，每個人都有：10＋15＋25，一共 50 光點。',
  ];
  function openEpilogue(from) {
    const t = Math.max(0, Math.min(3, S.tier));
    const html = `<section class="sk-modal is-small" role="dialog" aria-modal="true" aria-labelledby="skEpiT"><div class="sk-modal-scroll"><div style="position:relative">${heroSVG('main')}<h2 class="sk-hero-title" id="skEpiT"><small>點亮星空</small>${star4('t4')} 星空散場了 ${star4('t4')}</h2>`
      + `<button class="sk-close" type="button" data-x aria-label="關閉">${ic('x')}</button></div><div class="sk-body"><div class="sk-story">`
      + `<p>這三週，一共有 <strong>${S.count}</strong> 位同事的星，被別人讀懂、被別人謝謝，亮了起來。</p><p>${esc(EPI[t])}</p>`
      + '<p>謝謝每一位停下來、讀懂身邊同事的你。</p><p>散場之後，牆角留下了一盞小燈。</p></div></div></div>'
      + `<footer class="sk-foot"><button class="sk-btn primary" type="button" data-go data-autofocus>${ic('lantern')}去看看那盞小燈</button></footer></section>`;
    let via = 'close';
    const o = overlay(html, { returnTo: from, onClose: () => { S.epiOpen = false; window.dispatchEvent(new CustomEvent('sky:epilogue-closed', { detail: { via } })); } });
    S.epiOpen = true;
    o.el.id = 'skEpi'; o.el.dataset.tier = String(t);
    o.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) return o.close();
      if (e.target.closest('[data-go]')) { via = 'button'; o.close(false); window.dispatchEvent(new CustomEvent('sky:open-shop-intro', { detail: { from: 'epilogue' } })); }
    });
  }
  window.__skyNotice = Object.freeze({
    isOpen: () => !!S.epiOpen,
    shownToday: () => { const d = seen().epiDay; return d != null && Number(d) === L.tpeDay(deps.nowMs()); },
  });

  // ------------------------------------------------------------------ 星夜模板（繁星解鎖，人人永久）：樣式選單「大家一起解鎖」
  // 開跑後就出現（還沒到繁星時鎖著），達成後永久可選；不進自動預設。鎖用自己的 class sn-locked（app.js 會清掉 .locked）。
  let snBtn = null;
  function syncStarnight(ph) {
    const grid = document.getElementById('pickUnlock'), group = document.getElementById('pickUnlockGroup');
    if (!grid || !group || !deps.selectTheme) return;
    const show = deps.nowMs() >= L.SKY.start;
    group.hidden = !show;
    if (!show) return;
    const open = S.tier >= L.STARNIGHT_TIER || deps.isAdmin;
    if (!snBtn) {
      const cell = document.createElement('div'); cell.className = 'sw-cell swatch-item';
      cell.innerHTML = `<button type="button" class="theme-btn swatch card sn-card" data-theme="${L.STARNIGHT}" role="radio" aria-checked="false"><span class="fx" aria-hidden="true"></span></button>`
        + '<span class="ring" aria-hidden="true"></span><span class="swatch-cap sn-swatch-cap"><b>星夜</b><span class="sn-unlock">繁星解鎖</span></span>';
      grid.appendChild(cell);
      snBtn = cell.querySelector('button');
      snBtn.addEventListener('click', () => {
        if (snBtn.classList.contains('sn-locked')) { if (deps.toast) deps.toast(`星夜要等全公司點亮 ${L.STARNIGHT_AT} 位（繁星）才會解鎖。一起讀懂身邊的人吧！`); return; }
        deps.selectTheme(L.STARNIGHT);
      });
    }
    const label = open ? '星夜（全公司點亮繁星，永久可用）' : `星夜：全公司點亮 ${L.STARNIGHT_AT} 位（繁星）後解鎖`;
    snBtn.classList.toggle('sn-locked', !open);
    if (open) snBtn.removeAttribute('aria-disabled'); else snBtn.setAttribute('aria-disabled', 'true');
    snBtn.title = label; snBtn.setAttribute('aria-label', label);
    snBtn.parentElement.querySelector('.sn-swatch-cap').classList.toggle('is-locked', !open);
    if (!open && deps.currentTheme && deps.currentTheme() === L.STARNIGHT && deps.resetTheme) deps.resetTheme();
    void ph;
  }

  // ------------------------------------------------------------------ 我的星座（只有自己看得到）
  function openConstellations(from) {
    const c = cst(), now = deps.nowMs();
    const meta = { pick: ['lantern', '天燈座', '第一幕｜天燈共鳴', '換三個主題，送上三盞天燈。', '11/10 開放'],
      link: ['link', '連星座', '第二幕｜連星', '從說明書寫一張感謝卡給同事。', '11/17 開放'],
      lab: ['lab', '實驗座', '第三幕｜小撇步實驗室', '照同事的小撇步做一次，再寫卡告訴他。', '11/24 開放'] };
    const reward = bank.down || !bank.st.ledgerOk ? '小螢記下了' : `${dot()}＋15 光點`;
    const items = c.items.map(it => { const m = meta[it.code]; const notYet = !it.lit && now < ({ pick: L.SKY.start, link: L.SKY.act2, lab: L.SKY.act3 }[it.code]);
      return `<li class="cst-item${it.lit ? ' is-lit' : ''}">${cstSVG(m[0], it.lit)}<h3>${m[1]}</h3><p class="act">${m[2]}</p><p class="how">${m[3]}</p>`
        + `<span class="state">${it.lit ? `${ic('check')}亮了・${reward}` : notYet ? m[4] : '還在等你'}</span></li>`; }).join('');
    const fin = c.all ? `<div class="cst-final" role="status">${cstFinal()}<h3>${star4('t4')} 你的星座完成了</h3><p>謝謝你這三週，認真讀懂了身邊的人。</p><p class="reward">${bank.down || !bank.st.ledgerOk ? '小螢記下了' : `${dot()}<span class="lp-amt on-dark">＋25 光點</span>`}</p></div>` : '';
    const html = `<section class="cst-box" role="dialog" aria-modal="true" aria-labelledby="cstT"><button class="sk-close" type="button" data-x aria-label="關閉">${ic('x')}</button>`
      + `<header><h2 id="cstT">我的星座</h2></header><ul class="cst-grid">${items}</ul>${fin}`
      + `<div class="cst-foot"><button class="sk-btn dark" type="button" data-x>回到感謝牆</button></div></section>`;
    const o = overlay(html, { returnTo: from });
    o.el.id = 'skCst';
    o.el.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) o.close(); });
    if (c.all && !c.allClaimed) bank.claim('all3');
  }

  // ------------------------------------------------------------------ 第一幕完成
  // 天燈座完成。I4：同一個時間只送一次 bankClaim（並行呼叫共用同一個結果）；已領過（dup）但這次場景打開時還沒亮＝剛剛才亮，照樣慶祝
  let pickClaim = null;
  function onLanternDone({ wasLit, openedAt = 0 } = {}) {
    const already = wasLit ?? cst().items[0].lit;
    setLocal('pick', Date.now());
    if (S.skymeOk && !(S.skyme && S.skyme.pick)) update_(`skyme/${me}/pick`, TS);
    if (already) return Promise.resolve({ replay: true });
    if (!pickClaim) {
      pickClaim = bank.claim('pick').then((r) => {
        if (r && r.ok && r.dup) {                                       // 已經領過：是這次場景打開前就領的（換裝置、帳本晚到）才不慶祝
          const e = (bank.st.ledger || {}).ev_ev26_pick;
          if (e && Number(e.t) && Number(e.t) < openedAt - 5000) return { replay: true };
        }
        if (r && r.ok) return { amount: r.a || Number(L.EV_CODES.pick && L.EV_CODES.pick.a) || 15 };
        return { pending: true };                                      // 銀行沒上或條件不符：「小螢記下了」
      }).finally(() => { setTimeout(() => { pickClaim = null; }, 0); });
    }
    return pickClaim;
  }
  function update_(path, v) { return dbUpdate(ref(deps.db), { [path]: v }).catch(() => { /* 規則還沒部署：這台裝置已經記下了 */ }); }

  // ------------------------------------------------------------------ 從說明書寫卡（撰寫區提示、送出時帶 src）
  /** p = { uid, name, filled（對方說明書有幾格）, lab?: true } */
  function composeFrom(p) {
    if (!p || !p.uid || p.uid === me || !isActive(p.uid)) { if (p && p.name) deps.writeTo(p.name); return; }
    const src = L.srcForCard(p.filled || 0);
    if (lantern.isOpen) lantern.close(false);
    S.pendingFrom = { uid: p.uid, name: deps.store.nameOf(p.uid) || p.name, src, lab: !!p.lab };
    deps.writeTo(S.pendingFrom.name);
    showHint();
  }
  function showHint() {
    hideHint();
    const p = S.pendingFrom; if (!p) return;
    const host = document.getElementById('composer'); if (!host) return;
    const t = p.lab ? '小撇步實驗室：告訴他你試了什麼、效果怎麼樣。' : '可以提到你在他說明書上讀到的事。';
    const el = document.createElement('div');
    el.className = 'cp-hint'; el.id = 'skHint'; el.setAttribute('role', 'status');
    el.innerHTML = `${markHtml(p.src, '--c-accent:#9f1239')}<span class="grow">這張卡會帶著這個記號。${t}</span><button class="x" type="button" aria-label="關閉提示">${ic('x')}</button>`;
    host.appendChild(el);
    el.querySelector('.x').addEventListener('click', () => { S.pendingFrom = null; hideHint(); restorePh(); });
    const msg = document.getElementById('msgInput');
    if (msg) { if (!msg.dataset.skPh) msg.dataset.skPh = msg.placeholder; msg.placeholder = p.lab ? '告訴他你試了什麼、效果怎麼樣' : '可以提到你在他說明書上讀到的事'; }
    const rcv = document.getElementById('receiverInput');
    if (rcv && !rcv.dataset.skBound) {
      rcv.dataset.skBound = '1';
      rcv.addEventListener('input', () => { if (S.pendingFrom && rcv.value.trim().replace(/[,\s]+$/, '') !== S.pendingFrom.name) { S.pendingFrom = null; hideHint(); restorePh(); } });
    }
  }
  function hideHint() { const h = document.getElementById('skHint'); if (h) h.remove(); }
  function restorePh() { const msg = document.getElementById('msgInput'); if (msg && msg.dataset.skPh != null) { msg.placeholder = msg.dataset.skPh; delete msg.dataset.skPh; } }
  /** app.js 送出前呼叫：收件人還是那一位，就在 body 帶上星光卡資料 */
  function decorateSend(body) {
    const p = S.pendingFrom;
    if (!p || !body || typeof body.receiver !== 'string') return body;
    if (body.receiver.trim().replace(/[,\s]+$/, '') !== p.name) return body;
    const ph = L.phaseOf(deps.nowMs(), S.tier), sm = S.skyme || {};
    const meNode = S.skymeOk ? { link: ph.live && !sm.link, lab: p.lab && ph.act === 3 && p.src === 'pc' && !sm.lab } : null;
    body.sky = { src: p.src, sto: p.uid, me: meNode && (meNode.link || meNode.lab) ? meNode : null };
    body._skyFrom = p; body._skyBefore = cst();                     // 送出前的星座狀態（skyme 監聽可能比回應先到）
    return body;
  }
  /** app.js 送出成功後呼叫（res＝api/messages 的回應） */
  async function afterSend(res, body) {
    const from = body && body._skyFrom;
    S.pendingFrom = null; hideHint(); restorePh();
    const sky = res && res.sky;
    if (!sky || !res.message) return;
    const mid = res.message.id, rid = sky.sto, ph = L.phaseOf(deps.nowMs(), S.tier);
    const before = (body && body._skyBefore) || cst();
    if (ph.live) setLocal('link', mid);
    // 星線馬上出現（不等銀行）；入帳在背景補（銀行沒上線時說「小螢記下了」，之後開站自動補領）
    const up = !bank.down && bank.st.ledgerOk;
    const lit = (name, a) => (up ? `${dot()}叮！${name}亮了，<span class="lp-amt on-dark">＋${a} 光點</span>` : `叮！${name}亮了，小螢記下了`);
    let line3 = '';
    if (from && from.lab && ph.act === 3 && sky.src === 'pc') {
      markLabTried(rid, mid);
      setLocal('lab', mid);
      if (!before.items[2].lit) { line3 = lit('實驗座', 15); if (!bank.down) bank.claim('lab', mid); }
    } else if (ph.act >= 2 && !before.items[1].lit) {
      line3 = lit('連星座', 15);
      if (!bank.down) bank.claim('link');
    }
    const first = ph.live && !L.wasLit(messages(), rid, mid);
    starLine(rid, first, line3);
    S.pendingStarMid = sky.src === 'pc' ? mid : null;                  // 帳本入帳 pcw 時再跳「＋5 光點」
    meteor();
    update();
    const c = cst(); if (c.all && !c.allClaimed) bank.claim('all3');
  }
  function starLine(rid, first, line3) {
    const old = document.getElementById('skLine'); if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'sl-pop'; el.id = 'skLine'; el.setAttribute('role', 'status');
    const name = deps.store.nameOf(rid);
    el.innerHTML = '<div class="sl-stage"><svg class="line" viewBox="0 0 350 92" aria-hidden="true"><path class="path" d="M64 50 C 130 6, 222 6, 286 50"/><circle class="spark" r="5"/></svg>'
      + `<span class="sl-a">${deps.avatar(me, deps.store.nameOf(me), 36)}</span><span class="sl-b">${deps.avatar(rid, name, 36)}</span></div>`
      + `<p>一道星線，連上了。${first ? `<small>${esc(name)}的星，被你點亮了。</small>` : ''}</p>${line3 ? `<p class="lp-line">${line3}</p>` : ''}`;
    document.body.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; }, 2400);
    setTimeout(() => el.remove(), 2900);
  }
  function onLedger() {
    const mid = S.pendingStarMid, lg = bank.st.ledger || {};
    if (mid && Object.keys(lg).some(k => k.endsWith(`_${mid}_pcw`))) {
      S.pendingStarMid = null;
      setTimeout(() => lpToast('', `有人因為你，被讀懂了一點。<span class="lp-amt">＋5 光點</span>`), 2600);
    }
  }

  // ------------------------------------------------------------------ 卡片上的星光卡記號
  function markHtml(src, style = '') {
    const t = L.markLabel(src); if (!t) return '';
    return `<span class="sc-mark${src === 'pc0' ? ' is-hello' : ''}"${style ? ` style="${style}"` : ''}>${star4()}${t}</span>`;
  }

  // ------------------------------------------------------------------ 入帳提示、裝訂
  function lpToast(t1, t2) {
    const old = document.getElementById('skLp'); if (old) old.remove();
    const pc = document.getElementById('pcToast'); if (pc) pc.hidden = true;
    const el = document.createElement('div');
    el.className = 'lp-toast'; el.id = 'skLp'; el.setAttribute('role', 'status');
    el.innerHTML = `${ic('check', 'ok')}<div>${t1 ? `<span class="t1">${esc(t1)}</span>` : ''}<span class="t2">${dot()}<span>${t2}</span></span></div>`;
    document.body.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; }, 2500);
    setTimeout(() => el.remove(), 2950);
  }
  function bindPop(text) {
    const veil = document.createElement('div'); veil.className = 'pc-overlay'; veil.style.cssText = 'background:rgba(40,16,24,.35);z-index:97650';
    const el = document.createElement('div');
    el.className = 'bind'; el.id = 'skBind'; el.setAttribute('role', 'status');
    el.innerHTML = `<div class="stage"><div class="book"><span class="pg base"></span><span class="pg cover"></span></div><span class="ring">${Array.from({ length: 8 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</span></div>`
      + `<h3>你的使用說明書裝訂完成了。${text}</h3><p>之後有人讀了它、寫卡謝謝你，會有更多光亮到你身上。</p><div class="close-row"><button class="action-btn primary" type="button">好</button></div>`;
    document.body.append(veil, el);
    const close = () => { veil.remove(); el.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    el.querySelector('button').addEventListener('click', close);
    veil.addEventListener('click', close);
    setTimeout(() => el.querySelector('button').focus(), 40);
  }
  /**
   * 資料卡儲存後（profile-ui 呼叫）：有新亮起的光點就出入帳提示（取代原本的「已儲存」），回傳 true；沒有回傳 false。
   * 光點數由前端照銀行同一套規則預估（帳本已經有的 key 不算）；銀行沒上時說「小螢記下了」、不寫數字。
   */
  function afterProfileSave(before, after) {
    if (deps.nowMs() < L.START_PROFILE) return false;
    const up = !bank.down && bank.st.ledgerOk;
    const have = new Set([...L.profileKeys(before), ...(ls.get(K_PCK) || [])]);
    if (up) for (const k of Object.keys(bank.st.ledger || {})) if (k.startsWith('pc_')) have.add(k);
    const r = L.newProfileRewards(after, [...have]);
    ls.set(K_PCK, [...new Set([...(ls.get(K_PCK) || []), ...L.profileKeys(after)])]);
    if (!r.cells && !r.done) return false;
    const amt = up ? `<span class="lp-amt">＋${r.amount} 光點</span>` : '小螢記下了';
    if (r.done) { bindPop(up ? `<span class="lp-amt">＋${r.amount} 光點</span>` : '<span class="lp-amt">小螢記下了</span>'); return true; }
    lpToast('已儲存，同事現在看得到了。', `你的說明書多了一頁光，${amt}`);
    return true;
  }

  // ------------------------------------------------------------------ 資料卡上的新元素（profile-ui.js 的 ext 掛勾）
  const labOpen = () => { const ph = S.phase || L.phaseOf(deps.nowMs(), S.tier); return ph.live && ph.act === 3; };
  function viewerCell(uid, k, self) {
    if (self || !labOpen() || !(k in L.LAB_FIELDS) || !isActive(uid)) return '';
    const on = labItems().some(x => x.u === uid && x.f === k);
    return `<button class="lab-chip" type="button" data-sky-lab="${k}" aria-pressed="${on}" aria-label="把「${esc(L.LAB_FIELDS[k])}」放進小撇步實驗室">${ic(on ? 'check' : 'scope')}${on ? '在實驗室裡' : '放進實驗室'}</button>`;
  }
  function viewerExtra(uid, self) {
    if (!self) { S.lastProfile = uid; return { body: '', foot: '' }; }
    const list = L.manualThanks(messages(), me).map(m => deps.store.messageDto(m));
    let body = '';
    if (list.length) {
      const card = (d) => `<li class="pm-card ${esc(deps.themeClass(d.theme))}">${markHtml(d.src)}<p class="tx">${esc(d.text)}</p><div class="ft"><span class="au">${d.author.anonymous ? '' : deps.avatar(d.author.user_id, d.author.name, 22)}${esc(d.author.name)}</span><time>${L.fmtMD(d.created_at)}</time></div></li>`;
      body = `<section class="pm-thanks" aria-labelledby="pmH"><h3 id="pmH">${star4()}因為說明書收到的感謝</h3><p class="sub">這些光，是有人讀了你的說明書之後送來的。</p>`
        + `<ul class="pm-list">${list.slice(0, 3).map(card).join('')}</ul>`
        + (list.length > 3 ? `<ul class="pm-list" data-sky-more hidden>${list.slice(3, 12).map(card).join('')}</ul><div class="pm-more"><button class="sk-btn light" type="button" data-sky="pm-more" aria-expanded="false" style="min-height:40px">看更多${ic('chev')}</button></div>` : '')
        + '</section>';
    }
    const now = deps.nowMs();
    const foot = now >= L.START_PROFILE && now < L.SHOP_START ? `<span class="pb-wrap" style="position:relative;display:inline-flex">${passbookChip(false)}</span>` : '';
    return { body, foot };
  }
  function passbookChip(open) {
    const amt = bank.down || !bank.st.ledgerOk ? '小螢記下了' : `${Number(bank.st.wallet && bank.st.wallet.b) || L.passbook(bank.st.ledger).total} 光點`;
    return `<button class="pb-chip" type="button" data-sky="pb" aria-expanded="${open}" aria-haspopup="dialog"><span class="jar">${dot()}</span><span><b>星光存摺</b><span class="lp-amt">${amt}</span></span>${ic(open ? 'chev-up' : 'chev-down')}</button>`;
  }
  function passbookPop() {
    const down = bank.down || !bank.st.ledgerOk;
    const pb = L.passbook(bank.st.ledger, 4);
    const total = Number(bank.st.wallet && bank.st.wallet.b) || pb.total;
    const rows = down ? '' : pb.recent.length ? `<ul>${pb.recent.map(r => `<li><time>${L.fmtMD(r.t)}</time><span>${esc(r.text)}</span><span class="lp-amt">${r.a >= 0 ? '＋' : '−'}${Math.abs(r.a)}</span></li>`).join('')}</ul>` : '';
    return `<div class="pb-pop" role="dialog" aria-label="星光存摺" id="skPb"><h4>星光存摺</h4>`
      + (down ? `<p class="big">${dot(true)}<small>小螢記下了</small></p><p class="when">小螢正在整理你的光點，12/1 一起倒進你的光瓶。</p>`
        : `<p class="big">${dot(true)}${total} <small>光點</small></p><p class="when">小螢先替你存著，12/1 會倒進你的光瓶。</p>${rows}`)
      + '</div>';
  }
  function repaintPassbook() {
    for (const w of document.querySelectorAll('.pb-wrap')) {
      const open = !!w.querySelector('.pb-pop');
      w.innerHTML = passbookChip(open) + (open ? passbookPop() : '');
    }
  }
  /** 資料卡浮層裡的點擊（回傳 true＝處理掉了） */
  function onViewerClick(e, uid, name) {
    const lab = e.target.closest('[data-sky-lab]');
    if (lab) { toggleLab(uid, lab.dataset.skyLab, lab); return true; }
    const b = e.target.closest('[data-sky]'); if (!b) return false;
    if (b.dataset.sky === 'pb') {
      const w = b.closest('.pb-wrap'); const open = !w.querySelector('.pb-pop');
      w.innerHTML = passbookChip(open) + (open ? passbookPop() : '');
      const nb = w.querySelector('.pb-chip'); if (nb) nb.focus({ preventScroll: true });
      return true;
    }
    if (b.dataset.sky === 'pm-more') {
      const more = b.closest('.pm-thanks').querySelector('[data-sky-more]'); const open = more.hidden;
      more.hidden = !open; b.setAttribute('aria-expanded', String(open)); b.innerHTML = open ? `收起${ic('chev-up')}` : `看更多${ic('chev')}`;
      return true;
    }
    void name;
    return false;
  }
  function editorHead(self) {
    void self;
    const pool = String((deps.store.prefs || {}).pc_pool ?? '') !== '0';
    const lp = deps.nowMs() >= L.START_PROFILE ? `<p class="pe-lp-line">${dot(true)}<span>第一次寫下一格（6 個字以上），會亮起一點光點；第 8 格不算光點，想寫的時候再寫就好。</span></p>` : '';
    return lp + `<label class="pe-pool"><input type="checkbox" data-sky="pool"${pool ? ' checked' : ''}><span>讓我的說明書出現在第一幕小遊戲<small>「想學的事」和「卡關時」不會出現。</small></span></label>`;
  }
  const stressHelp = () => (deps.nowMs() >= L.START_PROFILE ? '這一格不算光點，想寫的時候再寫就好。' : '');
  async function onEditorChange(e) {
    const t = e.target.closest('[data-sky="pool"]'); if (!t) return false;
    const want = t.checked;
    try { await deps.setPref('pc_pool', want ? '1' : '0'); }
    catch (err) { t.checked = !want; if (deps.toast) deps.toast('這個設定暫時存不進去，請稍後再試一次。', true); }
    return true;
  }

  // ------------------------------------------------------------------ 小撇步實驗室（書籤只存在這台裝置；P&C：不記錄收藏了誰）
  const labItems = () => (ls.get(K_LAB) || []).filter(x => x && typeof x.u === 'string' && (x.f === 'work' || x.f === 'contrib')).slice(0, L.LAB_MAX);
  function labToast(text) {
    let el = document.getElementById('pcToast');
    if (!el) { el = document.createElement('div'); el.id = 'pcToast'; el.className = 'pc-toast'; document.body.appendChild(el); }
    el.setAttribute('role', 'status'); el.style.background = '#1f2347';
    el.innerHTML = `${ic('scope')}<span>${esc(text)}</span>`; el.hidden = false;
    clearTimeout(labToast.t); labToast.t = setTimeout(() => { el.hidden = true; el.style.background = ''; }, 2500);
  }
  function toggleLab(uid, f, btn) {
    const list = labItems(), i = list.findIndex(x => x.u === uid && x.f === f);
    if (i >= 0) { list.splice(i, 1); ls.set(K_LAB, list); }
    else {
      if (list.length >= L.LAB_MAX) { if (deps.closeProfiles) deps.closeProfiles(); openLab(document.getElementById('skBar'), { full: true }); return; }   // 資料卡會蓋住抽屜：先關
      list.push({ u: uid, f, t: Date.now() }); ls.set(K_LAB, list);
      labToast('收進實驗室了。他不會收到通知。（最多 3 個）');
    }
    const on = i < 0;
    btn.setAttribute('aria-pressed', String(on));
    btn.innerHTML = `${ic(on ? 'check' : 'scope')}${on ? '在實驗室裡' : '放進實驗室'}`;
  }
  function markLabTried(uid, mid) { const list = labItems(); for (const x of list) if (x.u === uid && x.f !== undefined && !x.tried) x.tried = mid; ls.set(K_LAB, list); }
  async function openLab(from, { full = false } = {}) {
    if (document.getElementById('skLab')) return;
    const veil = document.createElement('div'); veil.className = 'sk-overlay'; veil.style.cssText = 'background:rgba(6,10,28,.45);backdrop-filter:none;-webkit-backdrop-filter:none;z-index:95400';
    const html = `<header class="lab-head"><h2 id="labT">${ic('scope')}小撇步實驗室</h2><p>挑一個同事的小撇步，這週真的照著做一次，再寫卡告訴他效果。送出那一刻，「實驗座」亮起，<span class="lp-amt on-dark">＋15 光點</span>。</p>`
      + `<button class="sk-close" type="button" data-x aria-label="關閉">${ic('x')}</button></header><div class="lab-body" aria-busy="true"><p class="lab-loading">正在打開實驗室…</p></div>`
      + `<footer class="lab-foot">${ic('lock')}放進實驗室，對方不會知道；只有你寫卡時，他才會收到。</footer>`;
    const aside = document.createElement('aside');
    aside.className = 'lab-drawer'; aside.id = 'skLab'; aside.setAttribute('role', 'dialog'); aside.setAttribute('aria-modal', 'true'); aside.setAttribute('aria-labelledby', 'labT');
    aside.innerHTML = html;
    document.body.append(veil, aside);
    const returnTo = from || document.activeElement;
    const onKey = (e) => {
      if (document.querySelector('.pc-overlay:not(.pc-overlay-veil)') && !aside.contains(document.activeElement)) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
      if (e.key === 'Tab') { const f = [...aside.querySelectorAll(FOCUSABLE)].filter(x => x.getClientRects().length); if (!f.length) return;
        const a = f[0], z = f[f.length - 1];
        if (!aside.contains(document.activeElement)) { e.preventDefault(); a.focus(); } else if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
    };
    const close = (restore = true) => { veil.remove(); aside.remove(); document.removeEventListener('keydown', onKey, true); if (restore && returnTo && returnTo.isConnected) try { returnTo.focus({ preventScroll: true }); } catch (e) { /* 略 */ } };
    document.addEventListener('keydown', onKey, true);
    veil.addEventListener('click', () => close());
    setTimeout(() => aside.querySelector('[data-x]').focus(), 30);
    const paint = async () => {
      const list = labItems();
      const body = aside.querySelector('.lab-body');
      if (!list.length) { body.removeAttribute('aria-busy'); body.innerHTML = `<div class="lab-empty">${scopeArt()}<h3>實驗室還是空的</h3><p>打開同事的使用說明書，在「跟我合作的小撇步」或「我能幫團隊的地方」旁邊，按「放進實驗室」。</p></div>`; return; }
      const rows = await Promise.all(list.map(async (x) => {
        let card = null; try { card = isActive(x.u) ? await deps.profile.card(x.u) : null; } catch (e) { card = null; }
        const name = deps.store.nameOf(x.u) || '這位同事';
        let tip = '';
        if (card && x.f === 'work') tip = [card.work.ok.trim() ? `<b>${ic('plus')}這樣我很 OK</b><br>${esc(card.work.ok)}` : '', card.work.no.trim() ? `<b style="color:#b42318">${ic('minus')}這樣我會卡住</b><br>${esc(card.work.no)}` : ''].filter(Boolean).join('<br>');
        else if (card) tip = esc(card[x.f] || '');
        const gone = !tip;
        return `<li class="lab-item${x.tried ? ' is-tried' : ''}" data-u="${esc(x.u)}" data-f="${x.f}"><div class="who">${deps.avatar(x.u, name, 36)}<div>${esc(name)}<small>${esc(L.LAB_FIELDS[x.f])}</small></div></div>`
          + `<p class="tip">${gone ? '這一格現在是空的了。' : tip}</p><div class="acts">`
          + (x.tried ? `<span class="tried">${ic('check')}已經寫卡告訴他了</span>` : gone ? '' : `<button class="sk-btn primary" type="button" data-try>${ic('send')}我試過了</button>`)
          + '<button class="out" type="button" data-out>拿出來</button></div></li>';
      }));
      body.removeAttribute('aria-busy');
      body.innerHTML = `<p class="lab-slots" aria-label="實驗室放了 ${list.length} 個，最多 3 個">${[0, 1, 2].map(i => `<i class="${i < list.length ? 'on' : ''}"></i>`).join('')}<span>${list.length}／3</span></p><ul class="lab-list">${rows.join('')}</ul>`
        + (full ? '<p class="lab-note" role="status">實驗室最多放 3 個。想放新的，先把一個拿出來。</p>' : '');
    };
    aside.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) return close();
      const li = e.target.closest('.lab-item'); if (!li) return;
      if (e.target.closest('[data-out]')) { ls.set(K_LAB, labItems().filter(x => !(x.u === li.dataset.u && x.f === li.dataset.f))); full = false; paint(); return; }
      if (e.target.closest('[data-try]')) { close(false); if (deps.closeProfiles) deps.closeProfiles(); composeFrom({ uid: li.dataset.u, name: deps.store.nameOf(li.dataset.u), filled: 1, lab: true }); }
    });
    paint();
  }

  return {
    update, topExtra, markHtml, composeFrom, decorateSend, afterSend, meteor,
    ext: { viewerCell, viewerExtra, onViewerClick, editorHead, stressHelp, onEditorChange, afterSave: afterProfileSave },
    openLantern: (from) => lantern.open(from), openLab, openConstellations, openIntro, openEpilogue,
    get state() { return { phase: S.phase, count: S.count, tier: S.tier, bank: bank.st.status, skyme: S.skyme, lab: labItems() }; },
    _bank: bank,
  };
}
