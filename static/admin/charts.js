import { $, h, s } from './util.js';

// 每日長條圖（純 SVG，沒有載入任何圖表套件）
export function barChart(sr, days) {
  const W = 340, H = 150, padL = 26, padB = 22, padT = 18, n = 14;
  const vals = days.map(d => d[sr.k]);
  const max = Math.max(1, ...vals);
  const niceMax = max <= 5 ? max : Math.ceil(max / 5) * 5;
  const bw = (W - padL) / n, barW = Math.max(6, bw - 6);
  const y = (v) => padT + (H - padT - padB) * (1 - v / niceMax);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${sr.title}每日長條圖` });
  [0, niceMax / 2, niceMax].forEach(v => {
    svg.append(s('line', { x1: padL, x2: W, y1: y(v), y2: y(v), stroke: 'rgba(120,40,60,.12)', 'stroke-width': 1 }));
    svg.append(s('text', { x: padL - 4, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#6b6b76' }, Number.isInteger(v) ? v : v.toFixed(1)));
  });
  const tip = $('tooltip');
  const maxIdx = vals.lastIndexOf(max);
  days.forEach((d, i) => {
    const v = d[sr.k], x = padL + i * bw + (bw - barW) / 2, top = y(v), hgt = H - padB - top;
    if (v > 0) {
      const r = Math.min(4, hgt, barW / 2);
      const path = `M${x},${H - padB} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${H - padB} Z`;
      svg.append(s('path', { d: path, fill: sr.key ? '#c9184a' : '#7c3aed', opacity: i === days.length - 1 ? 1 : 0.82 }));
    }
    if ((i === maxIdx && max > 0) || (i === days.length - 1 && v > 0)) svg.append(s('text', { x: x + barW / 2, y: top - 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#2b2b33' }, v));
    if (i % 2 === 0) svg.append(s('text', { x: x + barW / 2, y: H - 6, 'text-anchor': 'middle', 'font-size': 11, fill: '#6b6b76' }, d.label));
    const hit = s('rect', { x: padL + i * bw, y: padT, width: bw, height: H - padT - padB, fill: 'transparent', 'data-day': d.key, 'data-value': v });
    hit.append(s('title', {}, `${d.label}（${d.wd}）${sr.title}：${v} ${sr.unit}`));
    hit.addEventListener('mouseenter', () => { tip.textContent = `${d.label}（${d.wd}） ${v} ${sr.unit}`; tip.hidden = false; });
    hit.addEventListener('mousemove', (e) => { tip.style.left = (e.pageX + 12) + 'px'; tip.style.top = (e.pageY - 34) + 'px'; });
    hit.addEventListener('mouseleave', () => { tip.hidden = true; });
    svg.append(hit);
  });
  svg.append(s('line', { x1: padL, x2: W, y1: H - padB, y2: H - padB, stroke: '#b9b0b3', 'stroke-width': 1 }));
  const total = vals.reduce((a, b) => a + b, 0);
  return h('div', { class: 'chart' + (sr.key ? ' key' : ''), 'data-series': sr.k },
    h('h4', null, sr.title, sr.key ? h('span', { class: 'tag tag-key' }, 'KPI') : null, sr.est ? h('span', { class: 'tag tag-est', title: sr.est }, '估算') : null, sr.note ? h('span', { class: 'tag tag-muted', title: sr.note }, sr.noteLabel || '備註') : null),
    h('div', { class: 'c-total' }, `累計 ${total} ${sr.unit}・今天 ${vals[vals.length - 1]} ${sr.unit}`), svg);
}

/**
 * 簡單長條圖（SVG，原本在 yp26-admin.js，進行中活動共用）：items = [{ label, v, tip }]
 * o2 = { unit, foot, id, every（每幾格標一次日期）, wide（整列寬）, color }
 */
export function simpleBars(title, items, o2) {
  const wide = o2.wide && window.innerWidth >= 700;   // 手機：寬圖也用窄的畫布，字才不會縮太小
  const fs = window.innerWidth < 700 ? 15 : 11;          // 手機上 SVG 會縮小，字放大一點
  const n = Math.max(1, items.length), W = wide ? 900 : 360, H = wide ? 170 : 180, padL = fs * 2.6, padB = fs * 2.2, padT = fs * 1.7;
  const max = Math.max(1, ...items.map(x => x.v)), top = max <= 5 ? max : Math.ceil(max / 5) * 5;
  const bw = (W - padL) / n, barW = Math.max(4, Math.min(wide ? 28 : 40, bw - 6));
  const y = (v) => padT + (H - padT - padB) * (1 - v / top);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${title}：` + items.map(x => x.tip).join('；') });
  [0, top / 2, top].forEach(v => {
    svg.append(s('line', { x1: padL, x2: W, y1: y(v), y2: y(v), stroke: 'rgba(120,40,60,.12)', 'stroke-width': 1 }));
    svg.append(s('text', { x: padL - 4, y: y(v) + 4, 'text-anchor': 'end', 'font-size': fs, fill: '#5c5c68' }, Number.isInteger(v) ? v : v.toFixed(1)));
  });
  items.forEach((it, i) => {
    const x = padL + i * bw + (bw - barW) / 2, t = y(it.v);
    const g = s('g', { 'data-label': it.label, 'data-value': it.v });
    if (it.v > 0) g.append(s('rect', { x, y: t, width: barW, height: H - padB - t, rx: Math.min(4, barW / 2), fill: o2.color || '#c9184a', opacity: 0.85 }));
    if (it.v > 0 && (n <= 10 || it.v === max)) g.append(s('text', { x: x + barW / 2, y: t - 4, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 700, fill: '#2b2b33' }, it.v));
    if (i % (wide ? 1 : (o2.every || 1)) === 0 || i === n - 1) g.append(s('text', { x: x + barW / 2, y: H - fs * .6, 'text-anchor': 'middle', 'font-size': fs, fill: '#5c5c68' }, it.label));
    g.append(s('title', {}, it.tip));
    svg.append(g);
  });
  svg.append(s('line', { x1: padL, x2: W, y1: H - padB, y2: H - padB, stroke: '#b9b0b3', 'stroke-width': 1 }));
  return h('div', { class: 'chart' + (o2.wide ? ' yp26-wide chart-wide' : ''), id: o2.id }, h('h4', null, title), h('div', { class: 'c-total' }, o2.foot || ''), svg);
}
