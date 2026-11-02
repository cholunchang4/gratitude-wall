// T100「一千道光」：留言破千的期間限定模板、一次性慶祝動畫、站內公告（game-design/千則里程碑.md 第 3、6 節；視覺 design/千光/，美術總監 2）。
// 要不要顯示只看伺服器時間（bootstrap.events.k1000／k1000_theme，由 fb/store.js 依規則常數算好），不看使用者電腦的時間。
// - 千光模板：k1000_theme 期間（11/03～11/30）樣式選單「限定」區出現；不進自動預設（app.js pickAutoTheme 只挑基本款）。
// - 動畫：k1000 期間（11/03～11/09）每次打開網站（新分頁／視窗）都播，同一個分頁重新整理不重播（sessionStorage，6.4.2 卓倫回饋）；
//   整段約 4.5 秒（時間軸見 k1000.css B 段）；系統開了「減少動態」就不播。點畫面、按「略過」或 Esc 跳過。
// - 公告：放在萬聖謝幕公告同一個位置（標題下方）；動畫播完（或跳過、不播）才出現；按 ✕ 後這台裝置不再顯示。B 版文字。
// - 和萬聖謝幕公告一次只出現一個：這次載入千光公告要出現時，謝幕留到下一次載入（app.js renderHwEpilogue 看 holdsNoticeSlot）。
// - 第 1,000 則的作者不表揚；不做計數器、不讀任何額外資料。
export const K1000_KEYS = { anim: 'k1000_anim_seen', closed: 'k1000_notice_closed' };   // anim 存 sessionStorage（這個分頁播過）；closed 存 localStorage（這台裝置關過公告）
export const K1000_ANIM_MS = 4500;                         // 動畫總長；要和 k1000.css 的 k1000-veil／k1000-num 動畫時間一致

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 無痕等不能存：這次照樣關掉 */ } },
};
const ss = {                                               // 6.4.2：動畫「這個分頁播過」；關掉分頁就清掉，下次打開網站再播
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* 不能存：重新整理會再播，不影響使用 */ } },
};
const SKY_CAPTION = '從第一張卡起，每一道光都在';          // 「1,000／一千道光」下方的字幕；6.4.2 起不管牆上幾張卡都顯示
const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// 自繪線條圖示（design/千光/mockup.html 的 symbol k-*）
const ICON_DEFS = '<svg class="k1000-ico-defs" aria-hidden="true" focusable="false"><defs>'
  + '<symbol id="k-lantern" viewBox="0 0 24 24"><path d="M12 2.5v2.5"/><path d="M8.5 5h7"/><path d="M7 7.5C7 6.1 8.1 5 9.5 5h5C15.9 5 17 6.1 17 7.5v9c0 1.4-1.1 2.5-2.5 2.5h-5C8.1 19 7 17.9 7 16.5z"/><path d="M9.5 19v1.5h5V19"/><path d="M12 9.5v4"/></symbol>'
  + '<symbol id="k-spark" viewBox="0 0 24 24"><path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/></symbol>'
  + '<symbol id="k-book" viewBox="0 0 24 24"><path d="M3 5.5C5.5 4.5 8.5 4.5 12 6.5c3.5-2 6.5-2 9-1V19c-2.5-1-5.5-1-9 1-3.5-2-6.5-2-9-1z"/><path d="M12 6.5V20"/></symbol>'
  + '<symbol id="k-chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></symbol>'
  + '<symbol id="k-pen" viewBox="0 0 24 24"><path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/></symbol></defs></svg>';
const ic = (id) => `<svg aria-hidden="true" focusable="false"><use href="#k-${id}"/></svg>`;

// 公告（B 版；固定字串，沒有使用者資料）。用語細則（文案-拾光小舖畫面.md）：小螢一律稱「她」、光點數字不加量詞（30 光點）、千光禮＝「一千道光的紀念」
const NOTICE_HTML = ICON_DEFS
  + '<div class="k1000-note-head"><h2 class="k1000-note-title" id="k1000Title"><i aria-hidden="true">✦</i>一千道光<i aria-hidden="true">✦</i></h2>'
  + '<button type="button" class="k1000-note-close" data-k1k="close" aria-label="關閉一千道光公告">✕</button></div>'
  + '<p class="k1000-note-lead"><span class="k1000-long">從第一張「謝謝你」開始，到今天，RDTW 感謝牆上已經亮起了 <b>一千道光</b>。每一道，都是有人回頭說：有你真好。</span><span class="k1000-short">牆上已經亮起 <b>一千道光</b>。每一道，都是有人回頭說：有你真好。</span></p>'
  + '<ul class="k1000-gifts">'
  + `<li class="k1000-gift">${ic('lantern')}<span><b>千光模板</b>人人可用到 11/30</span></li>`
  + `<li class="k1000-gift">${ic('spark')}<span><b>千光禮</b>12/1 開店，光瓶多 30 光點</span></li>`
  + `<li class="k1000-gift">${ic('book')}<span><b>下一道光</b>從你的使用說明書開始</span></li></ul>`
  + '<div class="k1000-story" id="k1000Story" hidden>'
  + '<p>有人在深夜數了一下這面牆。</p>'
  + '<p>從第一張寫著「謝謝你」的卡開始——那句話也許很短，也許只是「上次真的多虧有你」——到今天，RDTW 感謝牆上已經亮起了 <b>一千道光</b>。</p>'
  + '<p>每一道，都是某個人停下手邊的事，回頭對另一個人說：有你真好。</p>'
  + '<p class="k1000-legend">傳說，當一千道光聚在一起，夜空就會慢慢醒來。<br>牆角，一隻提著燈籠的小螢火蟲——大家叫她小螢——正把這些光一顆一顆收進瓶子裡。她說，等 12/1 她的小舖開張那天，要把光還給每一個人。</p>'
  + `<h4>${ic('lantern')}千光模板｜送給每一位同事</h4><p>從今天到 11/30，寫卡時在「樣式」裡就選得到。寫好的卡，會永遠帶著這一千道光。</p>`
  + `<h4>${ic('spark')}千光禮｜一千道光的紀念</h4><p>12/1 拾光小舖開張那天，每個人的光瓶裡都會多 30 光點。不管你寫過幾張、寫過沒有，這一千道光，都有你的一份。</p>`
  + `<h4>${ic('book')}下一道光，從你開始</h4><p>每個人的頭像裡，都藏著一本「我的使用說明書」。點一下撰寫區左邊你自己的頭像，寫下你的第一句：你的超能力是什麼？說明書每多寫一頁，小螢都會記下一點光，存進你的星光存摺。</p>`
  + '<p>11/10，夜空就會醒來。到時候，同事們會循著你寫下的那一句找到你。</p>'
  + '<p>一千道光只是序章。真正的星空，還在後面。</p></div>'
  + '<div class="k1000-actions">'
  + `<button type="button" class="k1000-btn is-primary" data-k1k="manual">${ic('book')}翻開我的使用說明書</button>`
  + `<button type="button" class="k1000-btn is-ghost" data-k1k="write">${ic('pen')}先去寫卡</button>`
  + `<button type="button" class="k1000-btn is-ghost" data-k1k="more" aria-expanded="false" aria-controls="k1000Story"><span>讀完整故事</span>${ic('chev')}</button></div>`;

/**
 * deps = {
 *   addSwatch(theme, cls, name, capHtml) → HTMLElement   // app.js addLimitedSwatch
 *   removeSwatch(btn)                                     // 拿掉色票；正在用千光就改回自動預設
 *   openManual()                                          // 開自己的資料卡編輯（PUI.openEditor）
 *   focusComposer()                                       // 游標到撰寫區
 *   nowMs()                                               // 伺服器時間
 *   canShowNotice() → boolean                             // 新手引導等其他視窗開著時先等
 * }
 */
export function createK1000(deps) {
  let swatch = null, themeTimer = null, startedThisPage = false, note = null, anim = null, slot = false;

  function syncTheme(win) {
    clearTimeout(themeTimer);
    const now = deps.nowMs();
    const on = !!(win && now <= win.end);
    if (on && !swatch) {
      swatch = deps.addSwatch('theme-k1000', 'theme-k1000-btn', '千光', '<b>千光</b><span class="k1000-until">到 11/30</span>');
      const cap = swatch && swatch.closest('.sw-cell') && swatch.closest('.sw-cell').querySelector('.swatch-cap');
      if (cap) cap.classList.add('k1000-swatch-cap');
    }
    if (on && swatch) {
      swatch.title = '千光（期間限定，到 11/30）'; swatch.setAttribute('aria-label', '千光（期間限定，到 11/30）');
      const left = win.end - now + 1000;
      if (left < 2147483000) themeTimer = setTimeout(() => syncTheme(null), left);   // 頁面開著跨過 11/30 23:59:59：選單自動收起
    }
    if (!on && swatch) { deps.removeSwatch(swatch); swatch = null; }
  }

  // ---------------------------------------------------------------- 公告（標題下方、萬聖謝幕的位置）
  function showNotice() {
    if (note || ls.get(K1000_KEYS.closed) === '1') return;
    if (deps.canShowNotice && !deps.canShowNotice()) { setTimeout(showNotice, 1200); return; }
    note = document.createElement('section');
    note.className = 'k1000-note'; note.id = 'k1000Note';
    note.setAttribute('role', 'region'); note.setAttribute('aria-labelledby', 'k1000Title');
    note.innerHTML = NOTICE_HTML;
    const anchor = document.getElementById('hwEpilogue');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(note, anchor.nextSibling); else document.body.prepend(note);
    note.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k1k]'); if (!b) return;
      const act = b.dataset.k1k;
      if (act === 'more') {
        const open = b.getAttribute('aria-expanded') !== 'true';
        b.setAttribute('aria-expanded', String(open));
        b.querySelector('span').textContent = open ? '收起故事' : '讀完整故事';
        note.querySelector('#k1000Story').hidden = !open;
        note.classList.toggle('is-open', open);
        return;
      }
      closeNotice();
      if (act === 'manual') deps.openManual();
      else if (act === 'write') deps.focusComposer();
    });
  }
  function closeNotice() {
    ls.set(K1000_KEYS.closed, '1');
    if (note) { note.remove(); note = null; }
  }

  // ---------------------------------------------------------------- 慶祝動畫（design/千光/k1000-sky.js 的做法：canvas 取樣字形，光點落在「1,000」上）
  function celebrate(done) {
    ss.set(K1000_KEYS.anim, '1');                                      // 開始播就算這個分頁看過（中途重新整理不再播）
    const vw = window.innerWidth, vh = window.innerHeight;
    const max = vw <= 768 ? 16 : 40;
    const starts = [...document.querySelectorAll('#wall .message-card')]
      .map(el => el.getBoundingClientRect())
      .filter(r => r.width && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw)
      .map(r => [r.left + r.width / 2, r.top + r.height / 2]);
    for (let i = starts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [starts[i], starts[j]] = [starts[j], starts[i]]; }
    starts.length = Math.min(starts.length, max);
    // 6.4.1：牆面每月 1 號清空，11/03 牆上可能只有個位數的卡。光點總數固定（桌機 40、手機 16）：
    // 有卡的從卡片起飛；不夠的從畫面下緣（地平線）和左右兩側升起，畫面看起來仍是很多道光匯聚
    const fromCards = starts.length;
    for (let i = fromCards; i < max; i++) {
      if (Math.random() < 0.7) starts.push([vw * (0.04 + Math.random() * 0.92), vh * (0.9 + Math.random() * 0.12)]);       // 地平線
      else { const left = Math.random() < 0.5; starts.push([left ? -6 + Math.random() * 30 : vw + 6 - Math.random() * 30, vh * (0.42 + Math.random() * 0.5)]); }   // 兩側
    }
    const fontPx = Math.max(72, Math.min(156, vw * 0.13));
    const cx = vw / 2, cy = vh * (vw <= 768 ? 0.34 : 0.30) - fontPx * 0.12;
    const targets = sampleText('1,000', fontPx, starts.length).map(([x, y]) => [cx + x, cy + y]);
    const sky = document.createElement('div'); sky.className = 'k1000-sky'; sky.id = 'k1000Sky'; sky.setAttribute('aria-hidden', 'true');
    let html = '<div class="k1000-veil"></div>';
    starts.forEach(([x0, y0], i) => {
      const [x1, y1] = targets[i];
      const a = Math.atan2(y1 - cy, x1 - cx) + (Math.random() - 0.5) * 0.8, dist = 60 + Math.random() * 90;
      const x2 = x1 + Math.cos(a) * dist, y2 = y1 + Math.sin(a) * dist - 20;
      html += `<i class="k1000-dot" data-from="${i < fromCards ? 'card' : 'sky'}" style="--x0:${x0 | 0}px;--y0:${y0 | 0}px;--x1:${x1 | 0}px;--y1:${y1 | 0}px;--x2:${x2 | 0}px;--y2:${y2 | 0}px;--d:${Math.round(Math.random() * 200)}ms"></i>`;
    });
    sky.innerHTML = html + `<div class="k1000-num"><b>1,000</b><span>一千道光</span><em class="k1000-caption">${SKY_CAPTION}</em></div>`;
    const skip = document.createElement('button'); skip.type = 'button'; skip.className = 'k1000-skip'; skip.textContent = '略過';
    skip.setAttribute('aria-label', '略過一千道光慶祝動畫');
    document.body.append(sky, skip);
    let ended = false;
    const end = () => {
      if (ended) return; ended = true; anim = null;
      sky.classList.add('is-leaving'); skip.classList.add('is-leaving');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(() => { sky.remove(); skip.remove(); done(); }, 160);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); end(); } };
    anim = { skip: end };
    sky.addEventListener('pointerdown', end, { once: true });
    skip.addEventListener('click', end, { once: true });
    document.addEventListener('keydown', onKey, true);
    // 播完：等遮罩動畫（4.5 秒）真的結束才收，系統忙、第一個畫格晚出現時也不會切掉尾巴；
    // CSS 沒載入或分頁在背景時 animationend 可能不來，計時器保險
    sky.querySelector('.k1000-veil').addEventListener('animationend', end, { once: true });
    setTimeout(end, K1000_ANIM_MS + 600);
  }
  function sampleText(text, px, n) {
    const c = document.createElement('canvas'), w = Math.ceil(px * 3.4), h = Math.ceil(px * 1.2);
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.font = `800 ${px}px ${getComputedStyle(document.body).fontFamily}`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2);
    const data = g.getImageData(0, 0, w, h).data, pts = [], step = Math.max(3, Math.round(px / 18));
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (data[(y * w + x) * 4 + 3] > 128) pts.push([x - w / 2, y - h / 2]);
    const out = [];
    for (let i = 0; i < n; i++) out.push(pts[Math.floor((i + Math.random() * 0.8) * pts.length / n)] || [0, 0]);
    return out;
  }

  // ---------------------------------------------------------------- 給 app.js：每次拿到 bootstrap.events 都呼叫
  function update(ev) {
    ev = ev || {};
    syncTheme(ev.k1000_theme || null);
    if (!ev.k1000 || startedThisPage) return;
    startedThisPage = true;
    slot = ls.get(K1000_KEYS.closed) !== '1';   // 這次載入千光公告要出現：萬聖謝幕（到 11/07）留到下一次載入，一次只跳一個
    const play = ss.get(K1000_KEYS.anim) !== '1' && !reducedMotion();
    if (play) setTimeout(() => celebrate(showNotice), 900);              // 牆面先發牌，光點才有卡可以飄起
    else showNotice();
  }
  return { update, closeNotice, holdsNoticeSlot: () => slot, skipAnimation: () => anim && anim.skip(), isAnimating: () => !!anim };
}
