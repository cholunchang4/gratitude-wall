// T102 撰寫區：這張卡的光效（設計規格第 11 節）。按鈕放在「樣式」旁；選單列出「不用光效」、擁有次數的光效、這一季的免費光效。
// - 每天 1 張、7 天 4 張：用 fxd／fxw 格子判斷（和規則同一套），用完了各款停用並說明哪天能再用。
// - 匿名：只有季節免費光效能選；已經選了付費光效又勾匿名，自動取消並提示一次。
// - 至尊、管理員模板：入口整個隱藏。送出時由 writes.js（fxCreatePaths）扣次數、佔格子；這裡只決定「選了哪一款」。
import { fxChoices } from './shop-logic.js';
import { T, fmt } from './shop-text.js';
import { ic, esc, smallThumb, fxIcon } from './shop-art.js';
import { ADMIN_THEMES } from './shop-logic.js';

/**
 * o = { mount: 按鈕要放進的容器（或 before: 放在這個元素前面）, anonEl?: 匿名 checkbox, getAnon(), getTheme(),
 *       ctx(): { now, inv, items, fxd, fxw, exists, settings, free, quota }, openShop(), toast(text), onChange?(g) }
 */
export function createFxPicker(o) {
  const doc = o.doc || document;
  let value = '', menu = null, lastFocus = null;
  const btn = doc.createElement('button');
  btn.type = 'button'; btn.className = 'cp-lx-btn'; btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false');
  if (o.before && o.before.parentNode) o.before.parentNode.insertBefore(btn, o.before); else if (o.mount) o.mount.appendChild(btn);

  const choices = () => fxChoices({ ...o.ctx(), anon: !!o.getAnon(), theme: o.getTheme() });
  function paint() {
    const theme = o.getTheme();
    btn.hidden = ADMIN_THEMES.has(theme);
    if (btn.hidden && value) set('');
    const ch = choices(), cur = ch.opts.find(x => x.g === value);
    if (value && (!cur || cur.disabled)) { value = ''; if (o.onChange) o.onChange(''); }
    const c = ch.opts.find(x => x.g === value);
    btn.classList.toggle('is-on', !!c);
    btn.innerHTML = (c ? fxIcon(c.style) : ic('once')) + `<span>${esc(c ? (c.free ? fmt(T.picker.chipFree, { name: c.name }) : fmt(T.picker.chip, { name: c.name, n: c.n })) : T.picker.btn)}</span>`;
    btn.setAttribute('aria-label', fmt(T.picker.btnAria, { name: c ? c.name : T.picker.btnNone }));
  }
  function set(g) { value = g || ''; paint(); if (o.onChange) o.onChange(value); }

  function open() {
    close(true);
    lastFocus = doc.activeElement;
    const ch = choices();
    menu = doc.createElement('div');
    menu.className = 'lxp'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', T.picker.h);
    const opt = (g, sw, b, s, on, dis) => `<li><button class="lxp-opt" role="menuitemradio" type="button" data-g="${esc(g)}" aria-checked="${on}"${dis ? ' aria-disabled="true"' : ''}>`
      + `<span class="sw">${sw}</span><span><b>${esc(b)}</b>${s ? `<small>${esc(s)}</small>` : ''}</span>${on ? ic('check', 'ck') : ''}</button></li>`;
    const items = [opt('', '', T.picker.none, '', !value, false)].concat(ch.opts.map(x => opt(x.g, smallThumb({ ty: 'fx', fx: x.style, c: 1 }, 0.32),
      x.name, x.free ? T.picker.freeSub : fmt(T.picker.left, { n: x.n }), value === x.g, x.disabled)));
    menu.innerHTML = `<h4>${esc(T.picker.h)}</h4><ul class="lxp-list">${items.join('')}</ul>`
      + (ch.note ? `<p class="note" role="status">${ic(ch.block === 'week' || ch.block === 'day' ? 'clock' : 'lock')}<span>${esc(ch.note)}</span></p>` : '')
      + `<div class="more"><span>${esc(T.picker.foot)}</span><a href="#" data-lxp="shop">${esc(T.picker.toShop)}</a></div>`;
    doc.body.appendChild(menu);
    place();
    menu.addEventListener('click', onMenuClick);
    menu.addEventListener('keydown', onMenuKey);
    btn.setAttribute('aria-expanded', 'true');
    const first = menu.querySelector('.lxp-opt[aria-checked="true"]') || menu.querySelector('.lxp-opt');
    if (first) first.focus();
    setTimeout(() => doc.addEventListener('pointerdown', onOutside, true), 0);
    doc.defaultView.addEventListener('resize', place);
  }
  function place() {
    if (!menu) return;
    const r = btn.getBoundingClientRect(), w = doc.defaultView.innerWidth, h = doc.defaultView.innerHeight;
    if (w <= 767) { menu.style.left = ''; menu.style.right = ''; menu.style.bottom = `${Math.max(8, h - r.top + 10)}px`; menu.style.top = 'auto'; return; }
    const mw = 340;
    menu.style.left = `${Math.max(8, Math.min(w - mw - 8, r.left - 20))}px`;
    menu.style.bottom = `${Math.max(8, h - r.top + 12)}px`; menu.style.top = 'auto';
  }
  function close(silent) {
    if (!menu) return;
    doc.removeEventListener('pointerdown', onOutside, true);
    doc.defaultView.removeEventListener('resize', place);
    menu.remove(); menu = null; btn.setAttribute('aria-expanded', 'false');
    if (!silent && lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onOutside(e) { if (menu && !menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close(true); }
  function onMenuClick(e) {
    const a = e.target.closest('[data-lxp="shop"]');
    if (a) { e.preventDefault(); close(true); if (o.openShop) o.openShop(); return; }
    const b = e.target.closest('.lxp-opt'); if (!b) return;
    if (b.getAttribute('aria-disabled') === 'true') return;
    set(b.dataset.g || ''); close();
  }
  function onMenuKey(e) {
    const list = [...menu.querySelectorAll('.lxp-opt')];
    const i = list.indexOf(doc.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]; if (n) n.focus(); }
    else if (e.key === 'Tab') close(true);
  }
  btn.addEventListener('click', () => (menu ? close() : open()));

  // 勾匿名：付費光效自動收起來，提示一次
  function onAnon() {
    const ch = choices(), c = ch.opts.find(x => x.g === value);
    if (value && o.getAnon() && c && !c.free) { value = ''; if (o.toast) o.toast(T.picker.anonDrop); if (o.onChange) o.onChange(''); }
    paint();
  }
  if (o.anonEl) o.anonEl.addEventListener('change', onAnon);
  paint();
  return {
    el: btn,
    get value() { return value; },
    set, refresh: paint, close: () => close(true), onAnon,
    /** 送出時：目前選的光效（被擋掉就是空字串） */
    sendFx() { const ch = choices(), c = ch.opts.find(x => x.g === value); return c && !c.disabled ? value : ''; },
    /** 送出成功後：恢復成不用光效 */
    reset() { set(''); },
    get isOpen() { return !!menu; },
  };
}
