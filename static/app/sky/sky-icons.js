// T101 點亮星空：共用 SVG（漸層、圖示）。全部自繪（design/點亮星空/mockup.html，美術總監 v1），可商用。
// 圖示 id 前綴 ski-（不和資料卡的 pci-、千光的 k- 撞名）；天燈與星線的漸層 id 照設計稿（sky.css 有用到）。
export const SKY_DEFS = '<svg id="skyDefs" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>'
  + '<linearGradient id="lnPaper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6de"/><stop offset=".7" stop-color="#ffe3a8"/><stop offset="1" stop-color="#ffcf80"/></linearGradient>'
  + '<linearGradient id="lnPaperHi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf2"/><stop offset=".7" stop-color="#fff0c4"/><stop offset="1" stop-color="#ffdd96"/></linearGradient>'
  + '<radialGradient id="lnBottom" cx=".5" cy="1" r=".6"><stop offset="0" stop-color="#ff9a3c" stop-opacity=".7"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></radialGradient>'
  + '<linearGradient id="slGrad" x1="0" x2="1"><stop offset="0" stop-color="#ffb27a"/><stop offset=".5" stop-color="#ffe39a"/><stop offset="1" stop-color="#fff6d0"/></linearGradient>'
  + '<filter id="slBlur" x="-2" y="-2" width="5" height="5"><feGaussianBlur stdDeviation="2"/></filter>'
  + '<symbol id="ski-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>'
  + '<symbol id="ski-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></symbol>'
  + '<symbol id="ski-lantern" viewBox="0 0 24 24"><path d="M6.5 5.2C9.8 3.4 14.2 3.4 17.5 5.2L16.2 18.4c-2.7.9-5.7.9-8.4 0z"/><path d="M10 4.2l.6 14.6M14 4.2l-.6 14.6"/><path d="M10.8 21.2c.4-.9.8-1.3 1.2-1.3s.8.4 1.2 1.3"/></symbol>'
  + '<symbol id="ski-link" viewBox="0 0 24 24"><path d="M5.5 16.5C9 9 15 9 18.5 7.5"/><path d="M5.5 13.2l.9 2 2 .4-1.6 1.3.4 2-1.7-1.1-1.8 1.1.5-2-1.6-1.3 2-.4z"/><path d="M18.5 4.2l.9 2 2 .4-1.6 1.3.4 2-1.7-1.1-1.8 1.1.5-2-1.6-1.3 2-.4z"/></symbol>'
  + '<symbol id="ski-scope" viewBox="0 0 24 24"><path d="M3.5 12.5l11-5.2 1.8 3.9-11 5.2z"/><path d="M16.3 6.4l2.9-1.3 1.8 3.9-2.9 1.3"/><path d="M11 14.2l-2.6 6.3M12.4 13.6l3 6.9"/><path d="M5 16.4l-.8-1.7"/></symbol>'
  + '<symbol id="ski-cst" viewBox="0 0 24 24"><path d="M4.5 17.5L9 8l6 4.5 4.5-6.5"/><circle cx="4.5" cy="17.5" r="1.6"/><circle cx="9" cy="8" r="1.6"/><circle cx="15" cy="12.5" r="1.6"/><circle cx="19.5" cy="6" r="1.6"/></symbol>'
  + '<symbol id="ski-lock" viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></symbol>'
  + '<symbol id="ski-moon" viewBox="0 0 24 24"><path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/></symbol>'
  + '<symbol id="ski-book" viewBox="0 0 24 24"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11a1 1 0 0 1 1 1v15a2 2 0 0 0-2-2H4z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13a1 1 0 0 0-1 1v15a2 2 0 0 1 2-2h6z"/></symbol>'
  + '<symbol id="ski-send" viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/></symbol>'
  + '<symbol id="ski-eye-off" viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.8 3.6M6.4 6.9C3.9 8.6 2.5 12 2.5 12S6 18.5 12 18.5c1.5 0 2.9-.4 4.1-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></symbol>'
  + '<symbol id="ski-chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></symbol>'
  + '<symbol id="ski-chev-up" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></symbol>'
  + '<symbol id="ski-chev-down" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></symbol>'
  + '<symbol id="ski-pen" viewBox="0 0 24 24"><path d="M4 20l1.2-4.4L16 4.8a2.3 2.3 0 0 1 3.2 3.2L8.4 18.8z"/><path d="M14.5 6.3l3.2 3.2"/></symbol>'
  + '<symbol id="ski-plus" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/></symbol>'
  + '<symbol id="ski-minus" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/></symbol>'
  + '<symbol id="ski-star4" viewBox="0 0 24 24"><path d="M12 2.5c.7 4.6 2.3 7.6 9.5 9.5-7.2 1.9-8.8 4.9-9.5 9.5-.7-4.6-2.3-7.6-9.5-9.5 7.2-1.9 8.8-4.9 9.5-9.5z"/></symbol>'
  + '<symbol id="ski-care" viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="14" height="14" rx="3"/><path d="M4 16.5V6a2.5 2.5 0 0 1 2.5-2.5H17"/><path d="M13.5 17.2s-3.4-2-3.4-4.3a1.8 1.8 0 0 1 3.4-.9 1.8 1.8 0 0 1 3.4.9c0 2.3-3.4 4.3-3.4 4.3z"/></symbol>'
  + '<symbol id="ski-proud" viewBox="0 0 24 24"><path d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.6l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/></symbol>'
  + '<symbol id="ski-motiv" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5"/></symbol>'
  + '<symbol id="ski-power" viewBox="0 0 24 24"><circle cx="12" cy="9.5" r="6"/><path d="M12 6.6l1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5 2.2-.3z"/><path d="M8.6 14.4L7.5 21l4.5-2.2 4.5 2.2-1.1-6.6"/></symbol>'
  + '<symbol id="ski-contrib" viewBox="0 0 24 24"><path d="M4 8.5h3.2a2.3 2.3 0 1 1 4.3 0H15v3.3a2.3 2.3 0 1 1 0 4.3V20H4z"/><path d="M15 8.5h2.5A2.5 2.5 0 0 1 20 11v1"/></symbol>'
  + '<symbol id="ski-work" viewBox="0 0 24 24"><path d="M3.5 5.5A2 2 0 0 1 5.5 3.5h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-3.2 2.6V12.5h-.3a2 2 0 0 1-2-2z"/><path d="M15.5 8.5h3a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-.3v2.6L15 17.5h-4a2 2 0 0 1-2-2v-.3"/></symbol>'
  + '</defs></svg>';

export const ic = (id, cls = '') => `<svg class="ico ${cls}" aria-hidden="true" focusable="false"><use href="#ski-${id}"/></svg>`;
export const star4 = (cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#ski-star4"/></svg>`;
export const dot = (light) => `<span class="lp-dot${light ? ' on-light' : ''}" aria-hidden="true"></span>`;

export function lanternShape() {
  return '<svg class="shape" viewBox="0 0 100 130" preserveAspectRatio="none" aria-hidden="true" focusable="false">'
    + '<path class="paper" d="M10 15 C 28 1, 72 1, 90 15 L 80 117 C 62 124, 38 124, 20 117 Z" fill="url(#lnPaper)"/>'
    + '<path d="M20 117 C 38 124 62 124 80 117 L 82 92 C 62 101 38 101 18 92 Z" fill="url(#lnBottom)"/>'
    + '<path d="M35 6 L40 121 M65 6 L60 121" stroke="rgba(150,80,10,.2)" stroke-width="1" vector-effect="non-scaling-stroke" fill="none"/>'
    + '<path class="outline" d="M10 15 C 28 1, 72 1, 90 15 L 80 117 C 62 124, 38 124, 20 117 Z" fill="none" stroke="rgba(184,105,31,.5)" stroke-width="1.2" vector-effect="non-scaling-stroke"/>'
    + '<path d="M22 117 C 40 125 60 125 78 117" stroke="#b8691f" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke" fill="none"/></svg>';
}
export function miniLantern(extra = '') {
  return `<svg viewBox="0 0 64 76" aria-hidden="true" focusable="false" ${extra}><path d="M8 11 C 20 1, 44 1, 56 11 L 50 68 C 40 73, 24 73, 14 68 Z" fill="url(#lnPaper)" stroke="rgba(184,105,31,.5)"/>`
    + '<path d="M23 4 L26 71 M41 4 L38 71" stroke="rgba(150,80,10,.2)" fill="none"/><path d="M15 68 C 26 74, 38 74, 49 68" stroke="#b8691f" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
    + '<ellipse cx="32" cy="72" rx="6" ry="3.5" fill="#ff9a3c" opacity=".85"/></svg>';
}
export const pipSVG = (on) => `<svg class="ln-pip${on ? ' is-on' : ''}" viewBox="0 0 18 22" aria-hidden="true" focusable="false"><path d="M2.5 3.5C6.5 1.2 11.5 1.2 15.5 3.5L13.8 19c-3 .9-6.6.9-9.6 0z"/></svg>`;
export function pocketSVG(n = 0) {
  const pts = [[13, 9], [7, 15], [18, 17], [11, 20], [16, 6]];
  return `<svg viewBox="0 0 26 26" aria-hidden="true" focusable="false">${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i < n ? 1.6 : 1}" fill="${i < n ? '#ffe39a' : 'rgba(255,255,255,.35)'}"${i < n ? ' style="filter:drop-shadow(0 0 2px #ffd27a)"' : ''}/>`).join('')}</svg>`;
}
export function hillsSVG() {
  return '<svg class="ln-hills" viewBox="0 0 1440 260" preserveAspectRatio="none" aria-hidden="true" focusable="false">'
    + '<path d="M0 150 C 160 90 300 120 420 100 C 560 76 650 130 780 110 C 930 86 1050 60 1180 96 C 1290 126 1370 110 1440 92 L1440 260 L0 260 Z" fill="#141c48"/>'
    + '<path d="M0 200 C 140 160 260 186 380 170 C 520 150 620 196 760 182 C 900 168 1000 140 1140 166 C 1260 190 1360 176 1440 160 L1440 260 L0 260 Z" fill="#0b1232"/>'
    + [[180, 196], [214, 190], [236, 200], [612, 204], [640, 198], [1010, 172], [1036, 180], [1260, 196], [1290, 190]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.2" fill="#ffc27a" opacity=".8"/>`).join('')
    + '</svg>';
}
export function heroSVG(kind = 'main') {
  const lan = (x, y, s, o = 1) => `<g transform="translate(${x} ${y}) scale(${s})" opacity="${o}"><path d="M-14 -20 C -6 -27, 6 -27, 14 -20 L 10 18 C 4 21, -4 21, -10 18 Z" fill="url(#lnPaper)"/><ellipse cx="0" cy="20" rx="5" ry="3" fill="#ff9a3c"/><circle cx="0" cy="0" r="30" fill="url(#lnBottom)" opacity=".35"/></g>`;
  const stars = Array.from({ length: 46 }, (_, i) => { const x = (i * 137.5) % 640, y = (i * 53.3) % 150; const r = i % 7 === 0 ? 1.8 : i % 3 === 0 ? 1.2 : 0.8; return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r}" fill="#fff6e0" opacity="${i % 4 === 0 ? 0.9 : 0.55}"/>`; }).join('');
  let fg = '', label = '夜空與升起的天燈插圖';
  if (kind === 'main') fg = lan(130, 120, 1.1) + lan(220, 70, 0.8) + lan(320, 40, 1.4) + lan(420, 92, 0.9) + lan(520, 60, 0.7) + lan(470, 150, 0.55, 0.8) + lan(90, 60, 0.5, 0.7);
  if (kind === 'link') { label = '兩顆星之間連出一道星線的插圖'; fg = '<path d="M150 120 C 240 40, 400 40, 490 110" stroke="url(#slGrad)" stroke-width="2.4" fill="none"/><g fill="#fff3c8" style="filter:drop-shadow(0 0 6px #ffd98a)"><circle cx="150" cy="120" r="7"/><circle cx="490" cy="110" r="7"/><circle cx="240" cy="68" r="3"/><circle cx="320" cy="56" r="3.5"/><circle cx="400" cy="66" r="3"/></g>'; }
  if (kind === 'lab') { label = '望著星空的望遠鏡插圖'; fg = '<g transform="translate(300 70) rotate(-24)" fill="none" stroke="#ffd98a" stroke-width="3" stroke-linejoin="round"><rect x="-80" y="-14" width="120" height="28" rx="6"/><rect x="40" y="-18" width="34" height="36" rx="6"/><path d="M-20 14 L-50 80 M-4 14 L22 80"/></g><g fill="#fff3c8" style="filter:drop-shadow(0 0 6px #ffd98a)"><circle cx="470" cy="30" r="4"/><circle cx="520" cy="56" r="2.6"/><circle cx="430" cy="62" r="2.4"/></g>'; }
  const h = kind === 'main' ? 230 : 170;
  return `<svg class="sk-hero" viewBox="0 0 640 ${h}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${label}">`
    + `<defs><linearGradient id="hg-${kind}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1230"/><stop offset=".65" stop-color="#1b2a5c"/><stop offset="1" stop-color="#4a3468"/></linearGradient>`
    + `<radialGradient id="hh-${kind}" cx=".5" cy="1" r=".7"><stop offset="0" stop-color="#ff9a8a" stop-opacity=".45"/><stop offset="1" stop-color="#ff9a8a" stop-opacity="0"/></radialGradient></defs>`
    + `<rect width="640" height="${h}" fill="url(#hg-${kind})"/><rect width="640" height="${h}" fill="url(#hh-${kind})"/>${stars}`
    + '<path d="M560 30a18 18 0 1 0 14 30a14 14 0 1 1 -14 -30z" fill="#ffe9c2" opacity=".9"/>' + fg
    + `<path d="M0 ${h - 40} C 120 ${h - 70} 220 ${h - 50} 320 ${h - 62} C 430 ${h - 76} 520 ${h - 46} 640 ${h - 64} L640 ${h} L0 ${h} Z" fill="#141c48"/>`
    + `<path d="M0 ${h - 18} C 160 ${h - 40} 300 ${h - 22} 420 ${h - 32} C 520 ${h - 40} 590 ${h - 26} 640 ${h - 30} L640 ${h} L0 ${h} Z" fill="#0b1232"/></svg>`;
}
export const CST = {
  lantern: { stars: [[56, 26, 3.5], [100, 16, 4.5], [144, 26, 3.5], [132, 100, 3.5], [68, 100, 3.5], [100, 124, 5]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [3, 5], [4, 5]] },
  link: { stars: [[34, 88, 5.5], [70, 50, 2.6], [100, 38, 3.2], [130, 50, 2.6], [166, 88, 5.5], [100, 112, 2.4]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 4]] },
  lab: { stars: [[30, 96, 3], [70, 76, 3.5], [112, 56, 3.5], [156, 34, 5], [96, 124, 2.6], [128, 124, 2.6]], lines: [[0, 1], [1, 2], [2, 3], [1, 4], [2, 5]] },
};
const cstInner = (c) => c.lines.map(([a, b]) => `<line class="ln" x1="${c.stars[a][0]}" y1="${c.stars[a][1]}" x2="${c.stars[b][0]}" y2="${c.stars[b][1]}"/>`).join('')
  + c.stars.map(s => `<circle class="st" cx="${s[0]}" cy="${s[1]}" r="${s[2]}"/>`).join('');
export const cstSVG = (k, lit) => `<svg class="cst${lit ? ' is-lit' : ''}" viewBox="0 0 200 140" aria-hidden="true" focusable="false">${cstInner(CST[k])}</svg>`;
export const cstFinal = () => '<svg class="cst is-lit" viewBox="0 0 640 120" aria-hidden="true" focusable="false">'
  + '<path d="M150 50 C 220 6, 260 6, 290 40 M 380 44 C 420 6, 470 6, 500 44" class="ln" style="stroke-dasharray:2 5"/>'
  + ['lantern', 'link', 'lab'].map((k, i) => `<g transform="translate(${[40, 250, 460][i]} 0) scale(.78)">${cstInner(CST[k])}</g>`).join('') + '</svg>';
export const scopeArt = () => '<svg viewBox="0 0 140 110" aria-hidden="true" focusable="false"><g transform="translate(70 52) rotate(-22)" fill="none" stroke="#2f3a78" stroke-width="2.2" stroke-linejoin="round"><rect x="-44" y="-9" width="66" height="18" rx="4"/><rect x="22" y="-12" width="20" height="24" rx="4"/><path d="M-10 9 L-28 50 M0 9 L14 50"/></g><circle cx="112" cy="18" r="3" fill="#ffc24a"/><circle cx="126" cy="36" r="2" fill="#ffc24a"/><circle cx="96" cy="10" r="1.6" fill="#ffc24a"/></svg>';
