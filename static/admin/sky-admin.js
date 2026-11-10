// 點亮星空 後台統計（「進行中活動」分頁）。
// 數字與名單都由 Cloud Functions bankAdmin { op: 'stars_stats' }（限管理員）在伺服器算好回傳；被點亮名單（bankev/stars）的資料庫規則沒有開放讀取。
// 名單依「第一次被點亮的時間」排序（最新在上）；不做排行、不做匯出。三幕只顯示人數。
import { h } from './util.js';
import { kpi } from './views.js';
import { simpleBars } from './charts.js';
import { SKY, phaseOf, TIER_NAMES, TIER_LONG } from '../app/sky/sky-logic.js';

const TPE = 8 * 3_600_000;
const PAGE = 50;
const pad = (n) => String(n).padStart(2, '0');
const md = (ms) => { const d = new Date(ms + TPE); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
const mdhm = (ms) => { const d = new Date(ms + TPE); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const ACTS = [
  { k: 'pick', name: '天燈座', open: SKY.start, how: '升起 3 個主題的天燈' },
  { k: 'link', name: '連星座', open: SKY.act2, how: '寫過星光卡' },
  { k: 'lab', name: '實驗座', open: SKY.act3, how: '從實驗室送出星光卡' },
];
const ERR = {
  NOT_DEPLOYED: '伺服器功能還沒部署。',
  BAD_INPUT: '伺服器還是舊版，還沒有這個統計（要先部署新版 bankAdmin）。',
  NOT_ADMIN: '這個帳號不是管理員，讀不到名單。',
  NOT_MEMBER: '登入狀態失效，請重新整理頁面再登入一次。',
  UNAUTH: '登入狀態失效，請重新整理頁面再登入一次。',
  TIMEOUT: '伺服器太久沒有回應，請稍後按「重新整理」再試一次。',
};
const errText = (e) => ERR[e && e.code] || '讀不到資料（網路或伺服器忙碌），請稍後按「重新整理」再試一次。';

/** o = { container, call(name, data), now(), onStats(stats)（選填：讀到資料時通知，總覽摘要用） } */
export function mountSkyAdmin(o) {
  const box = h('section', { class: 'card sky-admin', id: 'skyAdmin', 'aria-labelledby': 'skyAdminTitle' });
  o.container.append(box);
  const S = { stats: null, err: '', busy: false, page: 1 };

  function actLine(now) {
    const ph = phaseOf(now);
    if (ph.before) return `${md(SKY.start)} 開跑`;
    if (ph.live) {
      const a = ACTS[ph.act - 1], nextOpen = ACTS[ph.act] ? ACTS[ph.act].open : SKY.end + 1;
      return `第${['一', '二', '三'][ph.act - 1]}幕 ${a.name}（${md(a.open)}～${md(nextOpen - 1)}）・${md(SKY.end)} 23:59 結束`;
    }
    return `${md(SKY.end)} 23:59 已結束（數字不再增加）`;
  }

  function render() {
    const st = S.stats, now = o.now();
    const head = h('div', { class: 'card-head' },
      h('div', null, h('h3', { id: 'skyAdminTitle' }, '點亮星空'), h('p', { class: 'sub' }, actLine(now))),
      h('div', { class: 'split' },
        h('span', { class: 'hint', id: 'skyUpdated', role: 'status' }, S.busy ? '讀取中…' : st ? `最後更新 ${mdhm(st.at)}` : ''),
        h('button', { type: 'button', class: 'btn btn-sm', id: 'skyRefresh', disabled: S.busy, onclick: () => refresh() }, '重新整理')));
    const err = S.err ? h('div', { class: 'banner banner-bad', role: 'alert', id: 'skyError' }, S.err,
      st ? ' 下方是上一次讀到的資料。' : '') : null;
    if (!st) {
      box.replaceChildren(...[head, err, S.err ? null : h('p', { class: 'sub' }, '讀取中…')].filter(Boolean));
      return;
    }
    box.replaceChildren(...[head, err, kpis(st), tierBar(st), actsBlock(st, now), trendBlock(st), listBlock(st)].filter(Boolean));
  }

  // ---------------------------------------------------------------- KPI
  function kpis(st) {
    const nx = st.nextAt != null ? TIER_NAMES[st.tiers.indexOf(st.nextAt)] : null;
    const tierName = st.tier ? TIER_LONG[st.tier - 1] : '還沒到初星';
    return h('div', { class: 'grid grid-kpi', id: 'skyKpis' },
      kpi('被點亮人數', st.n, st.drift ? `前台顯示 ${st.pubN} 人（和名單不同，可能要重算）` : '和前台「全公司已點亮」一致', { id: 'skyKpiN', unit: '人', key: true, danger: st.drift }),
      kpi('門檻進度', tierName, nx ? `再 ${st.need} 人到「${nx}」（${st.nextAt} 人）` : `三個門檻都到了（${st.tiers.join('／')}）`, { id: 'skyKpiTier', value: st.tier }),
      kpi('星光卡', st.starCards, '活動期間從說明書寫的感謝卡（刪掉的不算）', { id: 'skyKpiCards', unit: '張' }),
      kpi('寫星光卡的人', st.writers, st.capped ? `其中 ${st.capped} 人已點亮 ${st.perAuthor} 位（每人上限）` : `每人最多點亮 ${st.perAuthor} 位`, { id: 'skyKpiWriters', unit: '人' }));
  }

  function tierBar(st) {
    const top = st.tiers[st.tiers.length - 1] || 1;
    const pct = (v) => `${Math.min(100, v / top * 100)}%`;
    return h('div', { class: 'sky-tier', id: 'skyTier' },
      h('div', { class: 'sky-track', role: 'progressbar', 'aria-label': '門檻進度', 'aria-valuemin': 0, 'aria-valuemax': top, 'aria-valuenow': Math.min(st.n, top),
        'aria-valuetext': `${st.n} 人；門檻 ${st.tiers.map((x, i) => `${TIER_NAMES[i]} ${x}`).join('、')}` },
        h('div', { class: 'sky-fill', style: { width: pct(st.n) } }),
        ...st.tiers.map((x, i) => h('span', { class: 'sky-mark' + (st.n >= x ? ' on' : ''), style: { left: pct(x) } }))),
      h('div', { class: 'sky-ticks', 'aria-hidden': 'true' },
        ...st.tiers.map((x, i) => h('span', { class: 'sky-tick' + (st.n >= x ? ' on' : ''), style: { left: pct(x) } }, `${TIER_NAMES[i]} ${x}`))));
  }

  // ---------------------------------------------------------------- 三幕（只有人數）
  function actsBlock(st, now) {
    return h('section', { class: 'sky-block', 'aria-labelledby': 'skyActsTitle' },
      h('h4', { id: 'skyActsTitle' }, '三幕參與'),
      h('p', { class: 'sky-note' }, '完成各座的人數（只有人數，不列名單）。'),
      h('div', { class: 'grid grid-kpi', id: 'skyActs' },
        ...ACTS.map(a => kpi(a.name, st.acts[a.k], now < a.open ? `${md(a.open)} 開放・${a.how}` : a.how, { id: `skyAct-${a.k}`, unit: '人' })),
        kpi('三座都完成', st.acts.all3, '天燈座＋連星座＋實驗座', { id: 'skyAct-all3', unit: '人' })));
  }

  // ---------------------------------------------------------------- 每日趨勢
  function trendBlock(st) {
    const every = st.daily.length > 10 ? 2 : 1;
    const sum = (k) => st.daily.reduce((a, x) => a + x[k], 0);
    return h('section', { class: 'sky-block', 'aria-labelledby': 'skyTrendTitle' },
      h('h4', { id: 'skyTrendTitle' }, '每日趨勢'),
      h('div', { class: 'charts' },
        simpleBars('每天新增被點亮人數', st.daily.map(x => ({ label: x.d, v: x.lit, tip: `${x.d} 新增被點亮 ${x.lit} 人` })),
          { unit: '人', foot: `合計 ${sum('lit')} 人（依第一次被點亮的日期）`, id: 'skyChLit', every, color: '#3b3f8f' }),
        simpleBars('每天星光卡張數', st.daily.map(x => ({ label: x.d, v: x.cards, tip: `${x.d} 星光卡 ${x.cards} 張` })),
          { unit: '張', foot: `合計 ${sum('cards')} 張（台灣時間）`, id: 'skyChCards', every })));
  }

  // ---------------------------------------------------------------- 被點亮名單（依第一次被點亮時間，最新在上）
  function listBlock(st) {
    const rows = st.list.slice(0, S.page * PAGE);
    const more = st.list.length > rows.length
      ? h('button', { type: 'button', class: 'btn btn-sm mt-12', onclick: () => { S.page++; render(); } }, `顯示更多（還有 ${st.list.length - rows.length} 位）`) : null;
    const person = (name, left) => [name, left ? h('span', { class: 'sky-left' }, '（已離開）') : null];
    const tbody = h('tbody', null, rows.length ? rows.map(r => h('tr', { 'data-uid': r.uid },
      h('td', { class: 'nowrap' }, ...person(r.name, r.left)),
      h('td', { class: 'nowrap' }, r.first != null ? mdhm(r.first) : '—'),
      h('td', null, h('ul', { class: 'sky-by' }, r.cards.map(c => h('li', null,
        h('span', { class: 'sky-by-name' }, ...person(c.byName, c.byLeft)),
        h('span', { class: 'sky-by-time' }, c.deleted ? '卡片已刪除' : mdhm(c.t)))))))) :
      [h('tr', null, h('td', { colspan: 3, class: 'empty' }, '還沒有人被點亮。有人從說明書寫星光卡給同事，名單就會出現在這裡。'))]);
    return h('section', { class: 'sky-block', 'aria-labelledby': 'skyListTitle' },
      h('h4', { id: 'skyListTitle' }, `被點亮名單（${st.list.length} 人）`),
      h('p', { class: 'sky-note' }, '依第一次被點亮的時間排列，最新的在最上面；時間是台灣時間。同一位可能被好幾位同事點亮。'),
      h('div', { class: 'table-wrap' }, h('table', { id: 'skyList' },
        h('thead', null, h('tr', null, h('th', null, '被點亮的人'), h('th', null, '第一次被點亮'), h('th', null, '點亮的同事（寫卡時間）'))), tbody)),
      more);
  }

  async function refresh() {
    if (S.busy) return;
    S.busy = true; render();
    try { const r = await o.call('bankAdmin', { op: 'stars_stats' }); S.stats = { ...r, at: Number(r.at) || o.now() }; S.err = ''; if (o.onStats) o.onStats(S.stats); }
    catch (e) { S.err = errText(e); }
    finally { S.busy = false; render(); }
  }

  render();
  refresh();
  return { refresh, render, get stats() { return S.stats; } };
}
