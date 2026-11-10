// 「進行中活動」分頁：活動期間的進度、名單與趨勢。活動結束後移到「已結束活動」（archive.js 的 ENDED_EVENTS）。
//
// ── 以後有新活動，要加進來的做法 ──
// 1. 在下面 LIVE_EVENTS 加一筆：
//      { id: '活動代號', name: '活動名稱', visible: (now) => 這個時間要不要顯示, mount: (container, ctx) => 畫面模組 }
//    ctx = { session, call(name, data)（呼叫 Cloud Functions）, now()（伺服器時間）, emulator, onStats(id, 摘要文字) }
//    畫面模組在 container 裡自己畫；需要名單或大量資料時，請在 Cloud Functions 加一個「限管理員」的統計動作，不要放寬資料庫規則。
// 2. 摘要（總覽最上面那一行）：模組讀到資料後呼叫 ctx.onStats(id, '已點亮 12 人')，沒呼叫就只顯示活動名稱。
// 3. 活動結束、移到「已結束活動」時，把這裡那一筆拿掉（visible 也可以先讓它自然過期）。
import { $, h } from './util.js';
import { K } from '../app/fb/constants.js';
import { SKY } from '../app/sky/sky-logic.js';
import { phaseOf as yp26Phase } from '../app/yp26/yp26-logic.js';
import { createFnCaller } from './fn.js';

export const LIVE_EVENTS = [
  {
    id: 'sky2026', name: '點亮星空',
    visible: (now) => now >= SKY.start && now <= SKY.epilogue_end,           // 開跑～謝幕（12/7）
    mount: (container, ctx) => import('./sky-admin.js').then(m => m.mountSkyAdmin({ container, call: ctx.call, now: ctx.now,
      onStats: (st) => ctx.onStats('sky2026', `已點亮 ${st.n} 人`) })),
  },
  {
    id: 'yp26', name: '手心的光',
    visible: (now) => yp26Phase(now, K.YP26) !== 'before',                   // 開放挑卡起（封箱後還要補卡，先不拿掉）
    mount: (container, ctx) => import('./yp26-admin.js').then(m => m.mountYp26Admin({ session: ctx.session, now: ctx.now, emulator: ctx.emulator, container })),
  },
];

/** o = { session, now(), emulator } */
export function mountLiveEvents(o) {
  const list = $('liveList'), ov = $('ovLive');
  if (!list) return null;
  const call = createFnCaller({ user: o.session.user, emulator: o.emulator });
  const notes = new Map();
  const slots = LIVE_EVENTS.map(ev => {
    const el = h('div', { class: 'live-event', id: `live-${ev.id}`, hidden: true });
    list.append(el);
    return { ev, el, mounted: null };
  });
  const empty = h('p', { class: 'empty card', id: 'liveEmpty', hidden: true }, '目前沒有進行中的活動。');
  list.append(empty);
  const ctx = { session: o.session, call, now: o.now, emulator: o.emulator, onStats: (id, text) => { notes.set(id, text); renderOverview(); } };

  function shown() { const now = o.now(); return slots.filter(x => { try { return x.ev.visible(now); } catch (e) { return false; } }); }
  function renderOverview() {
    if (!ov) return;
    const on = shown();
    ov.hidden = !on.length;
    if (!on.length) { ov.replaceChildren(); return; }
    ov.replaceChildren(h('div', { class: 'live-summary', id: 'liveSummary' },
      h('span', { class: 'live-summary-label' }, '進行中活動'),
      h('span', { class: 'live-summary-items' }, on.map(x => x.ev.name + (notes.get(x.ev.id) ? `（${notes.get(x.ev.id)}）` : '')).join('、')),
      h('button', { type: 'button', class: 'btn btn-sm', id: 'liveGo', onclick: () => { const t = $('tab-live'); if (t) { t.click(); t.focus(); } } }, '看活動統計')));
  }
  function update() {
    const on = new Set(shown());
    for (const x of slots) {
      x.el.hidden = !on.has(x);
      if (on.has(x) && !x.mounted) {
        x.mounted = Promise.resolve().then(() => x.ev.mount(x.el, ctx))
          .catch(e => { console.error(`[live] ${x.ev.name} 沒有載入`, e); x.el.replaceChildren(h('div', { class: 'banner banner-bad', role: 'alert' }, `${x.ev.name}的統計沒有載入，請重新整理頁面。`)); });
      }
    }
    empty.hidden = on.size > 0;
    renderOverview();
  }
  update();
  const timer = setInterval(update, 60_000);                                  // 活動開始／結束那一刻自動出現或隱藏
  return { update, stop: () => clearInterval(timer) };
}
