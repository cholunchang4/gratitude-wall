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
