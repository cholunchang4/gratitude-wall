// T113（6.6.1）後台「進行中活動」→「認識彼此」：說明書填寫率、頭像率、兩者都有、換過模板的比例、本月用 2 種以上模板的比例。
// 數字由 Cloud Functions bankAdmin { op: 'nudge_stats' }（限管理員）算好，只回數字；不列名字、不拆部門。
// 快照：管理員打開後台時自動存，stats/ndw/base（第一次打開＝上線前基準）、stats/ndw/{ISO 週，例 2026-W48}（每週第一次打開）；只有管理員能讀寫（database.rules.json）。
import { h, s } from './util.js';
import { kpi } from './views.js';
import { ref, get, update } from '../vendor/firebase-sdk.js';

const TPE = 8 * 3_600_000;
const pad = (n) => String(n).padStart(2, '0');
const mdhm = (ms) => { const d = new Date(ms + TPE); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const md = (ms) => { const d = new Date(ms + TPE); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
export const FIELDS = ['at', 'active', 'pc', 'av', 'both', 'tpl', 'writers', 'writersTpl', 'multi'];

/** 台灣時間的 ISO 週 key（週一開始），例 2026-W48 */
export function isoWeekKey(ms) {
  const d = new Date(ms + TPE);
  const day = (d.getUTCDay() + 6) % 7;                          // 週一＝0
  const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const y = thu.getUTCFullYear(), jan4 = new Date(Date.UTC(y, 0, 4));
  const w = 1 + Math.round(((thu - jan4) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${pad(w)}`;
}
/** ISO 週 key → 那週週一的日期標籤（美術比對 S5：管理員看得懂），例 2026-W45 → 「11/2 週」；key 不對就原樣回傳 */
export function weekLabel(key) {
  const m = /^(\d{4})-W(\d{2})$/.exec(key || ''); if (!m) return key;
  const y = Number(m[1]), w = Number(m[2]), jan4 = new Date(Date.UTC(y, 0, 4));
  const mon = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86_400_000 + (w - 1) * 7 * 86_400_000);
  return `${mon.getUTCMonth() + 1}/${mon.getUTCDate()} 週`;
}
/** 尾端標籤避免相疊（美術比對 M2）：依 y 排序，相鄰至少隔 gap，再限制在 [lo, hi]（放不下時從下往上推）；回傳同順序的新 y */
export function spreadLabels(ys, gap, lo, hi) {
  const idx = ys.map((y, i) => i).sort((a, b) => ys[a] - ys[b]);
  const out = ys.slice();
  let prev = -Infinity;
  for (const i of idx) { out[i] = Math.max(ys[i], prev + gap, lo); prev = out[i]; }
  let next = Infinity;
  for (let k = idx.length - 1; k >= 0; k--) { const i = idx[k]; out[i] = Math.min(out[i], next - gap, hi); next = out[i]; }
  return out;
}
/** 百分比（整數；分母 0 → null） */
export const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);
/** 這次要存哪些快照：還沒有基準 → base；這週還沒存 → 週 key */
export function snapshotsToSave(existing, now) {
  const out = [];
  if (!existing || !existing.base) out.push('base');
  const wk = isoWeekKey(now);
  if (!existing || !existing[wk]) out.push(wk);
  return out;
}
export function snapOf(r) { const o = {}; for (const f of FIELDS) o[f] = Math.max(0, Number(r[f]) || 0); return o; }

const ERR = {
  NOT_DEPLOYED: '伺服器功能還沒部署。',
  BAD_INPUT: '伺服器還是舊版，還沒有這個統計（要先部署新版 bankAdmin）。',
  NOT_ADMIN: '這個帳號不是管理員。',
  UNAUTH: '登入狀態失效，請重新整理頁面再登入一次。',
  TIMEOUT: '伺服器太久沒有回應，請稍後按「重新整理」再試一次。',
};
const errText = (e) => ERR[e && e.code] || '讀不到資料（網路或伺服器忙碌），請稍後按「重新整理」再試一次。';

/** o = { container, call, now(), db（Firebase database，可省略：省略時不存快照）, onStats(text)? } */
export function mountNudgeAdmin(o) {
  const box = h('section', { class: 'card nudge-admin', id: 'ndAdmin', 'aria-labelledby': 'ndAdminTitle' });
  o.container.append(box);
  const S = { r: null, snaps: null, err: "", snapErr: "", busy: false, chartW: 0 };

  const rate = (r, k, d = 'active') => pct(r[k], r[d]);
  const diff = (k, d = 'active') => {
    const b = S.snaps && S.snaps.base; if (!b || !S.r) return '';
    const now = rate(S.r, k, d), was = rate(b, k, d);
    if (now == null || was == null) return '';
    if (md(b.at) === md(S.r.at)) return `這就是基準值（${md(b.at)}）`;   // 美術比對 S4：第一次打開（同一天）不寫「±0」
    const x = now - was;
    return `比上線前 ${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x)} 個百分點（基準 ${md(b.at)}：${was}%）`;
  };
  const show = (v) => (v == null ? '—' : `${v}%`);
  const clampW = (w) => Math.max(260, Math.min(640, Math.round(w) || 640));   // 美術建議 320～640；手機圖表區實際不到 320，下限放到 260 才不縮字
  // 畫完量圖表區實際寬度（卡片、區塊都有內距），和用的寬度差太多就照實際寬度再畫一次（M3：viewBox 1 單位＝1px，字不縮小）
  function fitChart() {
    const c = box.querySelector('#ndTrend .chart'), svg = c && c.querySelector('svg'); if (!svg || !c.clientWidth) return;
    const cs = getComputedStyle(c), inner = c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const want = clampW(inner), used = svg.viewBox.baseVal.width;
    if (Math.abs(want - used) > 4 && S.chartW !== want) { S.chartW = want; render(); }
  }

  function render() {
    const r = S.r;
    const head = h('div', { class: 'card-head' },
      h('div', null, h('h3', { id: 'ndAdminTitle' }, '認識彼此'),
        h('p', { class: 'sub' }, '說明書、頭像、換模板的使用率（只有全公司匿名數字，不列名字、不拆部門）')),
      h('div', { class: 'split' },
        h('span', { class: 'hint', id: 'ndUpdated', role: 'status' }, S.busy ? '讀取中…' : r ? `最後更新 ${mdhm(r.at)}` : ''),
        h('button', { type: 'button', class: 'btn btn-sm', id: 'ndRefresh', disabled: S.busy, onclick: () => refresh() }, '重新整理')));
    const err = S.err ? h('div', { class: 'banner banner-bad', role: 'alert', id: 'ndError' }, S.err, r ? ' 下方是上一次讀到的資料。' : '') : null;
    const snapErr = S.snapErr ? h('div', { class: 'banner', role: 'status', id: 'ndSnapErr' }, S.snapErr) : null;
    if (!r) { box.replaceChildren(...[head, err, S.err ? null : h('p', { class: 'sub' }, '讀取中…')].filter(Boolean)); return; }
    box.replaceChildren(...[head, err, snapErr,
      h('div', { class: 'grid grid-kpi', id: 'ndKpis' },
        kpi('說明書填寫率', show(rate(r, 'pc')), [`${r.pc}／${r.active} 人至少寫了 1 格`, diff('pc') ? h('br') : null, diff('pc')], { id: 'ndKpiPc', value: rate(r, 'pc') }),
        kpi('頭像率', show(rate(r, 'av')), [`${r.av}／${r.active} 人放了頭像`, diff('av') ? h('br') : null, diff('av')], { id: 'ndKpiAv', value: rate(r, 'av') }),
        kpi('換過模板的比例', show(rate(r, 'tpl')), [`${r.tpl}／${r.active} 人打開過「樣式」`, diff('tpl') ? h('br') : null, diff('tpl')], { id: 'ndKpiTpl', key: true, value: rate(r, 'tpl') })),
      h('ul', { class: 'nd-more', id: 'ndMore' },
        h('li', { id: 'ndBoth' }, `說明書和頭像都有：${show(rate(r, 'both'))}（${r.both}／${r.active} 人）`),
        h('li', { id: 'ndWritersTpl' }, `本月寫過卡的同事裡，換過模板：${show(rate(r, 'writersTpl', 'writers'))}（${r.writersTpl}／${r.writers} 人）`),
        h('li', { id: 'ndMulti' }, `本月寫過卡的同事裡，用過 2 種以上模板：${show(rate(r, 'multi', 'writers'))}（${r.multi}／${r.writers} 人）`)),
      trend(),
      h('p', { class: 'sky-note' }, '分母是通訊錄上的同事（active）；「本月」從台灣時間 1 號算起，匿名卡也算寫卡人。基準值是第一次打開這一頁時存的快照，之後每週第一次打開時自動再存一筆。')].filter(Boolean));
    fitChart();
  }

  // 每週折線圖：說明書、頭像、換過模板三條線（基準＋每週快照）；標題直接寫結論
  function trend() {
    const snaps = S.snaps || {};
    const pts = [];
    if (snaps.base) pts.push({ label: '基準', ...snaps.base });
    const baseWeek = snaps.base ? isoWeekKey(Number(snaps.base.at) || 0) : '';
    Object.keys(snaps).filter(k => k !== 'base' && k !== baseWeek).sort().forEach(k => pts.push({ label: weekLabel(k), ...snaps[k] }));   // 和基準同一週的那筆不重複畫
    if (pts.length < 2) {
      return h('section', { class: 'sky-block', id: 'ndTrend' }, h('h4', null, '每週變化'),
        h('p', { class: 'sky-note' }, '還在累積每週資料：基準值已存，下週一以後打開後台會自動存第一筆每週快照。'));
    }
    const first = pts[0], last = pts[pts.length - 1];
    const a = pct(first.tpl, first.active), b = pct(last.tpl, last.active);
    const title = (a != null && b != null) ? `${pts.length - 1} 週來，換過模板的同事從 ${a}% 到 ${b}%` : '每週變化';
    // 美術比對 M3：畫布寬度跟容器一樣（320～640），手機上字不會被縮小；M2：右邊留 96 放得下粗體「換過模板 100%」（美術建議 84，實測粗體 12 字寬約 88＋間距 8）
    const W = clampW(S.chartW || (box.clientWidth || Math.min(window.innerWidth, 700)) - 32), H = 200, padL = 40, padR = 96, padT = 16, padB = 28, FS = 12;
    const x = (i) => padL + (W - padL - padR) * (pts.length === 1 ? 0 : i / (pts.length - 1));
    const y = (v) => padT + (H - padT - padB) * (1 - v / 100);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${title}。說明書 ${pct(last.pc, last.active)}%、頭像 ${pct(last.av, last.active)}%、換過模板 ${b}%` });
    [0, 50, 100].forEach(v => {
      svg.append(s('line', { x1: padL, x2: W - padR, y1: y(v), y2: y(v), stroke: 'rgba(120,40,60,.12)', 'stroke-width': 1 }));
      svg.append(s('text', { x: padL - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': FS, fill: '#6b6b76' }, `${v}%`));
    });
    const step = pts.length > 1 ? (W - padL - padR) / (pts.length - 1) : W;   // 點距太窄（手機、週數多）就只寫日期，不寫「週」
    pts.forEach((p, i) => svg.append(s('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', 'font-size': FS, fill: '#6b6b76', class: 'nd-x' }, step < 52 ? p.label.replace(/ 週$/, '') : p.label)));
    const SER = [{ k: 'tpl', name: '換過模板', color: '#c9184a', w: 3 }, { k: 'pc', name: '說明書', color: '#3b3f8f', w: 2 }, { k: 'av', name: '頭像', color: '#0f766e', w: 2 }];
    const ends = [];
    for (const sr of SER) {
      const vals = pts.map(p => pct(p[sr.k], p.active) ?? 0);
      svg.append(s('polyline', { points: vals.map((v, i) => `${x(i)},${y(v)}`).join(' '), fill: 'none', stroke: sr.color, 'stroke-width': sr.w, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      vals.forEach((v, i) => svg.append(s('circle', { cx: x(i), cy: y(v), r: 3, fill: sr.color })));
      ends.push({ sr, v: vals[vals.length - 1] });
    }
    const ly = spreadLabels(ends.map(e => y(e.v) + 4), 16, padT + 4, H - padB);   // 兩條線一樣高時標籤不疊（M2：至少 14；字 12、中文字框較高，取 16）
    ends.forEach((e, i) => svg.append(s('text', { x: W - padR + 8, y: ly[i], 'font-size': FS, 'font-weight': 700, fill: e.sr.color, class: 'nd-end' }, `${e.sr.name} ${e.v}%`)));
    return h('section', { class: 'sky-block', id: 'ndTrend' }, h('h4', { id: 'ndTrendTitle' }, title), h('div', { class: 'chart' }, svg));
  }

  async function saveSnaps(r) {
    if (!o.db) return;
    try {
      const cur = (await get(ref(o.db, 'stats/ndw'))).val() || {};
      const keys = snapshotsToSave(cur, Number(r.at) || o.now());
      if (keys.length) {
        const snap = snapOf(r), up = {};
        for (const k of keys) { up[`stats/ndw/${k}`] = snap; cur[k] = snap; }
        await update(ref(o.db), up);
      }
      S.snaps = cur; S.snapErr = '';
    } catch (e) { S.snapErr = '每週快照沒有存成功（規則可能還沒部署）；數字照常顯示。'; }
  }

  async function refresh() {
    if (S.busy) return;
    S.busy = true; render();
    try {
      const r = await o.call('bankAdmin', { op: 'nudge_stats' });
      S.r = { ...snapOf(r), at: Number(r.at) || o.now() }; S.err = '';
      await saveSnaps(S.r);
      if (o.onStats) o.onStats(`說明書 ${show(rate(S.r, 'pc'))}、換過模板 ${show(rate(S.r, 'tpl'))}`);
    } catch (e) { S.err = errText(e); }
    finally { S.busy = false; render(); }
  }

  // 容器寬度變了（分頁從隱藏變顯示、轉向、拉視窗）就重畫圖表（M3：畫布跟容器同寬）
  let rz = 0, lastW = box.clientWidth;
  const onWidth = () => { clearTimeout(rz); rz = setTimeout(() => { const w = box.clientWidth; if (w && Math.abs(w - lastW) > 24) { lastW = w; S.chartW = 0; if (S.r) render(); } }, 120); };
  if ('ResizeObserver' in window) new ResizeObserver(onWidth).observe(box); else window.addEventListener('resize', onWidth);
  render();
  refresh();
  return { refresh, render, get stats() { return S.r; }, get snaps() { return S.snaps; } };
}
