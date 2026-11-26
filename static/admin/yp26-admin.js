// T108「手心的光」後台（「進行中活動」分頁；admin-sky 起從總覽移過來）。
// - 活動期間：只有數字（參加人數、總張數、收到 ≥1 張的人數），不顯示名單（避免管理員提前看到自己或別人會收到什麼）。
// - 封箱後（T115，卓倫 11/24）：「全部收件人」總覽——通訊錄所有 active 同事，每人同事挑／管理員補／合計；
//   還沒有任何卡的人排最前面、醒目標示（預設只看他們），沒有寫給他的卡的人另外標示。點一位：寫給他的卡（任何作者）勾選＝補卡，
//   已經有卡的人也能再加；「從全部卡片找」可以用寫卡人、關鍵字、日期找任何一張卡加給他（不是寫給他的卡要再確認一次）。
//   補卡存 yp26/admin（只有 Functions 寫得進去、每次留稽核），不算進任何作者的 6 張、沒有張數上限、不改同事看得到的總數。
// - 統計頁（卓倫 11/10）：參與、收件人、每日趨勢、印刷預估。數字全部由 yp26Pick action=stats（限管理員）在伺服器算好，
//   瀏覽器不下載挑選明細；這裡只畫數字和簡單長條圖，沒有任何姓名、排序或匯出功能。
// 數字與名單都由 Cloud Functions yp26Pick（限管理員）算好回傳；匯出印製之後再做。
import { K } from '../app/fb/constants.js';
import { phaseOf } from '../app/yp26/yp26-logic.js';
import { createYp26Api } from '../app/yp26/yp26-api.js';
import { h, actionModal } from './util.js';
import { kpi } from './views.js';
import { simpleBars as bars } from './charts.js';

const TPE = 8 * 3_600_000;
const ymd = (ms) => { const d = new Date(ms + TPE); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
const ERR = { NOT_DEPLOYED: '手心的光的伺服器功能還沒部署。', NOT_CLOSED: '還沒封箱，補卡要等 11/30 23:59 之後。', COVERED: '這位同事已經有同事挑的卡（伺服器還是舊版，請先部署 6.6.2 的 functions）。',
  NOT_ACTIVE: '這位同事已不在通訊錄。', NOT_RECIPIENT: '這張卡不是寫給他的，請重新勾選並確認。', SELF: '這張是他自己寫的卡，不能補給他。', NOT_FOUND: '這張卡已經刪除。',
  PICKED: '同事已經挑了這一張要印給他，不用重複加。', BAD_DATE: '日期格式不對，或「從」比「到」晚。', BAD_INPUT: '搜尋條件太長（每格最多 60 字）。', NOT_ADMIN: '只有管理員可以補卡。' };
const updatedAt = (ms) => { const d = new Date(ms + TPE); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}（伺服器時間）`; };
const errText = (e) => ERR[e && e.code] || '讀不到資料（網路或伺服器忙碌），請稍後再試。';

/** o = { session, now(), emulator, container（「進行中活動」分頁裡的位置；沒給就放總覽最上面，舊做法）, onNone(n)（封箱後還有幾位沒有卡，給分頁徽章用） } */
export function mountYp26Admin(o) {
  const anchor = o.container || document.getElementById('ovKpis');
  if (!anchor) return null;
  const api = createYp26Api({ db: o.session.db, user: o.session.user, meId: null, emulator: o.emulator });
  const box = h('section', { class: 'card yp26-admin', id: 'yp26Admin', hidden: true, 'aria-labelledby': 'yp26AdminTitle' });
  if (o.container) o.container.append(box); else anchor.parentNode.insertBefore(box, anchor);
  const newFind = () => ({ author: '', q: '', from: '', to: '', busy: false, res: null, err: '' });
  const S = { stats: null, err: '', busy: false, list: null, listErr: '', onlyTodo: true, q: '', sel: null, seq: 0, cards: null, cardsErr: '', saving: new Map(), msg: '', msgBad: false, msgNext: false, find: newFind(), statsOpen: false, just: null, justN: 0, justGroup: null };
  // M6：左欄 sticky 要扣掉上方固定的頂欄（品牌列＋分頁）高度
  const setTop = () => { const t = document.querySelector('.topbar'); box.style.setProperty('--yp26-top', `${(t && t.offsetHeight) || 104}px`); };
  setTop(); window.addEventListener('resize', setTop);

  function render() {
    const ph = phaseOf(o.now(), K.YP26);
    box.hidden = ph === 'before';
    if (box.hidden) return;
    const n = (k) => (S.stats ? S.stats[k] : '…');
    const closed = ph !== 'open';
    const ae = document.activeElement;
    const focus = ae && ae.id && box.contains(ae) && /^(INPUT|TEXTAREA)$/.test(ae.tagName) && ae.type !== 'checkbox'
      ? { id: ae.id, a: ae.selectionStart, b: ae.selectionEnd } : {};
    const kpis = () => [
      h('div', { class: 'grid grid-kpi' },
        kpi('參加人數', n('participants'), '至少挑了 1 張的同事', { id: 'yp26KpiPeople' }),
        kpi('總張數', n('total'), `每人最多 ${K.YP26.cap} 張（不含管理員補卡）`, { id: 'yp26KpiTotal' }),
        kpi('收到 ≥1 張的人數', n('recipients'), closed ? '同事挑的；不含管理員補卡' : '只有人數，不顯示是誰', { id: 'yp26KpiRcv' })),
      h('p', { class: 'sub', id: 'yp26Updated' }, S.err || (S.stats ? `更新時間 ${updatedAt(S.stats.at)}` : '讀取中…'),
        ' ', h('button', { type: 'button', class: 'btn btn-sm', disabled: S.busy, onclick: () => refresh() }, '重新整理')),
      S.stats && S.stats.dist ? statsSection(S.stats, closed) : null];
    const title = h('h3', { id: 'yp26AdminTitle' }, closed ? '手心的光（已封箱）' : '手心的光（挑卡中，11/30 23:59 封箱）');
    // replaceChildren 會把 null 印成「null」字樣（6.5.8 活動期間區塊最下面多一行 null）：先濾掉
    if (!closed) box.replaceChildren(...[title, ...kpis()].filter(Boolean));
    else {
      // T115 第 2 輪（美術 M1）：封箱後補卡是主角放最上面，統計收合（封箱後數字不再變）
      const fold = h('details', { class: 'yp26-stats-fold', id: 'yp26StatsFold', open: S.statsOpen, ontoggle: (e) => { S.statsOpen = e.target.open; } },
        h('summary', null, '活動統計與印刷預估', h('span', { class: 'hint' }, '參與率、收件人、每日趨勢、印刷預估（封箱後數字不再變）')),
        ...kpis().filter(Boolean));
      box.replaceChildren(title, fillSection(), fold);
    }
    if (closed && S.list) renderRows();
    // 整塊重畫後把焦點放回原本的輸入框（打字找人、填搜尋條件時不會被打斷）
    if (focus.id) { const el = document.getElementById(focus.id); if (el && el !== document.activeElement) { el.focus({ preventScroll: true }); try { if (focus.a != null) el.setSelectionRange(focus.a, focus.b); } catch (e) { /* date 欄位不支援 */ } } }
  }

  // ---------------------------------------------------------------- 統計頁（只有數字；定義寫在每格下方小字）
  function statsSection(st, closed) {
    const P = st.print, cap = K.YP26.cap;
    const pct = (a, b) => (b ? `${Math.round(a / b * 1000) / 10}%` : '—');
    const block = (id, title, note, ...kids) => h('section', { class: 'yp26-stats-block', 'aria-labelledby': id },
      h('h4', { id }, title), note ? h('p', { class: 'yp26-note' }, note) : null, ...kids);
    const rcvItems = st.rcvDist.map(x => ({ label: x.plus ? `${x.k}+` : String(x.k), v: x.n, tip: `收到 ${x.plus ? `${x.k} 張以上` : `${x.k} 張`}：${x.n} 人` }));
    const days = st.daily.map(x => ({ label: x.d, v: x.n, tip: `${x.d} 新增 ${x.n} 張（累計 ${x.cum}）` }));
    return h('div', { class: 'yp26-stats', id: 'yp26Stats' },
      block('yp26StJoin', '參與', null,
        h('div', { class: 'grid grid-kpi' },
          kpi('參與率', `${st.participationPct}%`, `參與 ${st.participants} 人 ÷ 通訊錄 ${st.active} 人`, { id: 'yp26KpiRate' }),
          kpi('平均每人挑', st.avgPerParticipant, `已挑 ${st.total} 張 ÷ 參與 ${st.participants} 人`, { id: 'yp26KpiAvg', unit: '張' }),
          kpi(`挑滿 ${cap} 張`, st.full, `占參與人數 ${pct(st.full, st.participants)}`, { id: 'yp26KpiFull', unit: '人' }),
          kpi('活動期間新寫、並被挑', st.newPicks, `${st.newCards} 篇卡；11/12 起寫的卡被挑的張數`, { id: 'yp26KpiNew', unit: '張' }))),
      block('yp26StRcv', '收件人', closed ? null : '還沒被挑到的人，封箱後可以在下方補卡。',
        h('div', { class: 'grid grid-kpi' },
          kpi('被選中人數', st.recipients, `至少被同事挑到 1 張的收件人（其中在通訊錄 ${st.coveredActive} 人）`, { id: 'yp26KpiCovered', unit: '人' }),
          kpi('還沒有卡被挑到', st.uncovered, `通訊錄 ${st.active} 人 − 被選中 ${st.coveredActive} 人${st.adminTotal ? `；其中 ${st.filledOnly} 人已補卡` : ''}`, { id: 'yp26KpiUncovered', unit: '人' }),
          kpi('同一篇挑給多人', st.multiPickedCards, `被挑的卡共 ${st.pickedCards} 篇；這些篇被挑給 2 位以上收件人`, { id: 'yp26KpiMultiCard', unit: '篇' }))),
      block('yp26StChart', '分布與趨勢', null,
        h('div', { class: 'charts' },
          bars('每人挑了幾張', Array.from(st.dist, x => ({ label: `${x.k} 張`, v: x.n, tip: `挑 ${x.k} 張：${x.n} 人` })), { unit: '人', foot: `參與 ${st.participants} 人（人數）`, id: 'yp26ChDist' }),
          bars('收件人收到幾張', rcvItems, { unit: '人', foot: `最多 ${st.rcvMax} 張（同事挑的，不含補卡；人數）`, id: 'yp26ChRcv' }),
          bars('每天新增挑選', days, { unit: '張', foot: `累計 ${st.daily.length ? st.daily[st.daily.length - 1].cum : 0} 張（依挑選時間，放回的不算）${st.outside ? `・不在活動期間的 ${st.outside} 張未列入` : ''}`, id: 'yp26ChDaily', every: days.length > 10 ? 3 : 1, wide: true }))),
      block('yp26StPrint', '印刷預估', null,
        h('div', { class: 'grid grid-kpi' },
          kpi('預計印製', P.total, `同事挑 ${P.picked}＋管理員補 ${P.admin}${P.deleted ? ` − 卡已刪除 ${P.deleted}` : ''}`, { id: 'yp26KpiPrint', unit: '張' }),
          kpi('原本有照片／塗鴉', P.image, `印出只有文字；占 ${pct(P.image, P.total)}`, { id: 'yp26KpiImg', unit: '張' }),
          kpi('匿名／假面卡', P.anonymous + P.mask, `匿名 ${P.anonymous}、假面 ${P.mask}；占 ${pct(P.anonymous + P.mask, P.total)}（作者不印出）`, { id: 'yp26KpiAnon', unit: '張' }),
          kpi('來自寫給多人的卡', P.multi, `一篇寫給 2 人以上、展開成每人一張；占 ${pct(P.multi, P.total)}`, { id: 'yp26KpiMulti', unit: '張' }),
          kpi('收件人已離開通訊錄', P.goneRecipient, P.goneRecipient ? '印之前要確認還要不要印' : '沒有', { id: 'yp26KpiGone', unit: '張', danger: P.goneRecipient > 0 }))),
      st.drift ? h('p', { class: 'yp26-note', role: 'status' }, `同事畫面上的總張數（${st.n}）和實際（${st.total}）不同，可以用校正功能修正。`) : null);
  }

  // ---------------------------------------------------------------- 封箱後：全部收件人總覽＋補卡（T115）
  const fold = (x) => String(x || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const isJust = (p) => p.uid === S.just && p.total > 0;               // 剛補好（M5）：留在名單上、原本的分組
  const isNone = (p) => p.total === 0;
  const baseGroup = (p) => (p.total > 0 ? 'g-ok' : p.n === 0 ? 'g-nocard' : 'g-none');
  const groupOf = (p) => (isJust(p) && S.justGroup ? S.justGroup : baseGroup(p));
  const GROUPS = [['g-nocard', '沒有寫給他的卡', '要另外處理'], ['g-none', '還沒有卡', ''], ['g-ok', '已有卡', '']];
  const ICON = { none: ['i-none', '!'], nocard: ['i-nocard', '?'], ok: ['i-ok', '✓'] };

  function personRow(p) {
    const sel = S.sel === p.uid, just = isJust(p);
    const st = just || p.total > 0 ? 'ok' : p.n === 0 ? 'nocard' : 'none';
    const sub = just ? `剛補好 ${S.justN || p.added} 張` : st === 'none' ? '還沒有卡' : st === 'nocard' ? '沒有寫給他的卡' : '';
    const label = `${p.name || p.uid}：同事挑 ${p.picked} 張、管理員補 ${p.added} 張、合計 ${p.total} 張` + (isNone(p) ? (p.n ? '，還沒有卡' : '，還沒有卡、沒有寫給他的卡') : just ? '，剛補好' : '');
    return h('li', { class: 'yp26-person' + (isNone(p) ? ' is-none' : '') + (just ? ' is-just' : '') + (sel ? ' is-sel' : '') },
      h('button', { type: 'button', 'data-uid': p.uid, 'aria-pressed': sel ? 'true' : 'false', 'aria-label': label, onclick: () => pick(p.uid) },
        h('span', { class: `yp26-ico ${ICON[st][0]}`, 'aria-hidden': 'true' }, ICON[st][1]),
        h('span', { class: 'yp26-p-name' }, h('span', { class: 'yp26-p-nm' }, p.name || p.uid), sub ? h('span', { class: 'yp26-p-sub' }, sub) : null),
        h('span', { class: 'yp26-p-num', title: '同事挑' }, String(p.picked)),
        h('span', { class: 'yp26-p-num', title: '管理員補' }, String(p.added)),
        h('span', { class: 'yp26-p-num yp26-p-total', title: '合計' }, String(p.total))));
  }

  /** 顯示順序：沒有寫給他的卡 → 還沒有卡 → 已有卡；同組照姓名（剛補好的人才會留在原本分組裡的姓名位置） */
  const coll = new Intl.Collator('zh-Hant-TW');
  function ordered(people) {
    const rank = { 'g-nocard': 0, 'g-none': 1, 'g-ok': 2 };
    return people.slice().sort((a, b) => rank[groupOf(a)] - rank[groupOf(b)] || coll.compare(a.name || '', b.name || '') || (a.uid < b.uid ? -1 : 1));
  }
  function listRows() {
    const q = fold(S.q);
    return ordered(S.list.people).filter(p => (!S.onlyTodo || isNone(p) || isJust(p)) && (!q || fold(p.name).includes(q)));
  }
  /** 下一位還沒有卡的人（S1）：照名單順序從目前這位往後找，找不到再從頭；略過剛補好的 */
  function nextNone() {
    const all = ordered(S.list ? S.list.people : []).filter(p => isNone(p) && p.uid !== S.sel);
    if (!all.length) return null;
    const order = ordered(S.list.people).map(p => p.uid), at = order.indexOf(S.sel);
    return all.find(p => order.indexOf(p.uid) > at) || all[0];
  }
  function renderRows() {
    const ul = document.getElementById('yp26People');
    if (!ul) return;
    const rows = listRows();
    const empty = S.list.people.length === 0 ? '通訊錄裡沒有同事。'
      : S.q ? (S.onlyTodo ? '「還沒有卡的」裡沒有符合的名字。' : '沒有符合的名字。')
      : '每位同事都有卡了。';
    const items = [];
    for (const [g, label, hint] of GROUPS) {
      const inG = rows.filter(p => groupOf(p) === g);
      if (!inG.length) continue;
      const n = inG.filter(p => !isJust(p)).length;                      // 剛補好的不算進這組人數
      items.push(h('li', { class: `yp26-group ${g}`, 'aria-hidden': 'true' }, `${label}（${n}）`, hint ? h('span', { class: 'hint' }, hint) : null), ...inG.map(personRow));
    }
    ul.replaceChildren(...(rows.length ? items : [h('li', { class: 'empty yp26-empty' }, empty,
      S.onlyTodo && (S.q || S.list.none === 0) ? h('button', { type: 'button', class: 'btn btn-sm ml-6', onclick: () => { S.onlyTodo = false; S.just = null; render(); } }, '看全部同事') : null)]));
    const c = document.getElementById('yp26PeopleCount');
    if (c) c.textContent = `顯示 ${rows.length}／${S.list.people.length} 人`;
  }

  function fillSection() {
    const L = S.list;
    const head = h('div', { class: 'yp26-fill-head' },
      h('h3', { id: 'yp26FillTitle' }, '全部收件人（補卡）'),
      h('p', { class: 'sub' }, '通訊錄所有同事會收到幾張卡（只有管理員看得到）。點一位同事，可以從寫給他的卡、或全部卡片裡勾選加給他；補卡不算進作者的 6 張、沒有張數上限，也不會出現在同事看得到的數字裡。'));
    if (S.listErr && !L) return h('div', { class: 'yp26-fill is-first', id: 'yp26Fill' }, head, h('p', { class: 'yp26-err', role: 'alert' }, S.listErr, ' ', h('button', { type: 'button', class: 'btn btn-sm', onclick: () => loadList() }, '再試一次')));
    if (!L) return h('div', { class: 'yp26-fill is-first', id: 'yp26Fill' }, head, h('p', { class: 'sub yp26-loading', role: 'status' }, '讀取全部收件人中…'));
    const first = () => { const p = listRows().find(isNone) || listRows()[0]; if (p) pick(p.uid); const col = box.querySelector('.yp26-people-col'); if (col && col.scrollIntoView) col.scrollIntoView({ block: 'nearest' }); };
    const banner = L.none
      ? h('div', { class: 'yp26-banner is-todo', id: 'yp26FillBanner', role: 'status' },
          h('span', { class: 'yp26-ico i-none', 'aria-hidden': 'true' }, '!'),
          h('strong', { id: 'yp26NoneCount' }, `還有 ${L.none} 位沒有卡`),
          L.noCards ? h('span', { class: 'yp26-banner-sub' }, `其中 ${L.noCards} 位「沒有寫給他的卡」，要從全部卡片找一張，或先寫一張給他再回來補。`) : null,
          h('button', { type: 'button', class: 'btn btn-sm btn-primary', id: 'yp26StartBtn', onclick: first }, '從第一位開始補 →'))
      : h('div', { class: 'yp26-banner is-done', id: 'yp26FillBanner', role: 'status' },
          h('span', { class: 'yp26-ico i-ok', 'aria-hidden': 'true' }, '✓'),
          h('strong', { id: 'yp26NoneCount' }, '每位同事都至少有一張卡了'),
          h('span', { class: 'yp26-banner-sub' }, '還是可以點任何一位同事加選其他卡。'));
    const summary = h('p', { class: 'sub', id: 'yp26FillSummary' },
      `通訊錄 ${L.active} 人：同事挑 ${L.picked} 張＋管理員補 ${L.adminTotal} 張＝合計 ${L.total} 張` +
      (L.goneCards ? `；另有 ${L.goneCards} 張的收件人已離開通訊錄（預計印製共 ${L.printTotal} 張）。` : '（＝預計印製）。') +
      (S.listErr ? `　${S.listErr}` : ''));
    const tools = h('div', { class: 'yp26-tools' },
      h('label', { class: 'yp26-search' }, h('span', { class: 'sr-only' }, '用姓名找同事'),
        h('input', { type: 'search', id: 'yp26PeopleQ', placeholder: '用姓名找同事', value: S.q, autocomplete: 'off', oninput: (e) => { S.q = e.target.value; renderRows(); } })),
      h('label', { class: 'yp26-todo' }, h('input', { type: 'checkbox', id: 'yp26OnlyTodo', checked: S.onlyTodo, onchange: (e) => { S.onlyTodo = e.target.checked; if (!S.onlyTodo) S.just = null; renderRows(); } }), ' 只看還沒有卡的'),
      h('span', { class: 'hint', id: 'yp26PeopleCount', 'aria-live': 'polite' }));
    const listHead = h('div', { class: 'yp26-person yp26-person-head', 'aria-hidden': 'true' },
      h('span', null), h('span', { class: 'yp26-p-name' }, '同事'), h('span', { class: 'yp26-p-num' }, '同事挑'), h('span', { class: 'yp26-p-num' }, '管理員補'), h('span', { class: 'yp26-p-num' }, '合計'));
    const list = h('div', { class: 'yp26-people-col' }, tools, listHead, h('ul', { class: 'yp26-people', id: 'yp26People', 'aria-label': '全部收件人' }));
    const side = h('div', { class: 'yp26-side-col' }, S.sel ? cardsPanel() : h('div', { class: 'yp26-cards yp26-cards-empty', id: 'yp26Cards' },
      h('p', { class: 'sub' }, '← 點左邊一位同事，在這裡替他加卡。')));
    return h('div', { class: 'yp26-fill is-first', id: 'yp26Fill' }, head, banner, summary, h('div', { class: 'yp26-fill-grid' }, list, side));
  }

  function cardItem(c, list) {
    const busy = S.saving.has(c.mid);
    const locked = c.ph;                                   // 同事已挑：一定會印，不能再勾
    const shown = busy ? S.saving.get(c.mid) : (c.on || c.ph);   // 儲存中先顯示要變成的樣子
    return h('li', { class: (shown ? 'on' : '') + (c.fr ? '' : ' nf') },
      h('label', null,
        h('input', { type: 'checkbox', checked: shown, disabled: busy || locked, 'data-mid': c.mid, 'data-list': list,
          onchange: (e) => setFill(c, e.target.checked, e.target) }),
        h('span', { class: 'yp26-card-meta' }, `${ymd(c.t)}｜${c.by}｜To: ${c.r || '（沒寫）'}`,
          c.ph ? h('span', { class: 'tag tag-ok ml-6' }, '同事已挑') : null,
          c.on ? h('span', { class: 'tag tag-ok ml-6' }, '✓ 已補') : null,
          c.fr ? null : h('span', { class: 'tag tag-est ml-6' }, '不是寫給他的卡'),
          c.img ? h('span', { class: 'tag tag-muted ml-6' }, '印出時只有文字') : null,
          busy ? h('span', { class: 'hint ml-6' }, '儲存中…') : null),
        h('span', { class: 'yp26-card-text' }, c.x || '（只有圖片）')));
  }

  function findBox() {
    const F = S.find;
    const field = (id, label, attrs) => h('label', { class: 'yp26-f', for: id }, h('span', null, label), h('input', { id, ...attrs }));
    const form = h('form', { class: 'yp26-find-form', id: 'yp26FindForm', onsubmit: (e) => { e.preventDefault(); search(); } },
      field('yp26FAuthor', '寫卡人', { type: 'text', maxlength: 60, value: F.author, placeholder: '卡上顯示的名字', autocomplete: 'off', oninput: (e) => { F.author = e.target.value; } }),
      field('yp26FQ', '內文或收件人關鍵字', { type: 'text', maxlength: 60, value: F.q, placeholder: '例如 OE team、年終', autocomplete: 'off', oninput: (e) => { F.q = e.target.value; } }),
      field('yp26FFrom', '寫卡日期從', { type: 'date', value: F.from, oninput: (e) => { F.from = e.target.value; } }),
      field('yp26FTo', '到', { type: 'date', value: F.to, oninput: (e) => { F.to = e.target.value; } }),
      h('div', { class: 'yp26-f-btns' },
        h('button', { type: 'submit', class: 'btn btn-sm btn-primary', id: 'yp26FindBtn', disabled: F.busy }, F.busy ? '搜尋中…' : '搜尋'),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { S.find = newFind(); render(); } }, '清除')));
    let res = null;
    if (F.err) res = h('p', { class: 'yp26-err', role: 'alert' }, F.err, ' ', h('button', { type: 'button', class: 'btn btn-sm', onclick: () => search() }, '再試一次'));
    else if (F.busy && !F.res) res = h('p', { class: 'sub yp26-loading', role: 'status' }, '搜尋中…');
    else if (F.res) res = F.res.cards.length
      ? h('div', null, h('p', { class: 'hint', id: 'yp26FindCount', role: 'status' }, F.res.more ? `找到 ${F.res.count} 張，先列出最新的 ${F.res.cards.length} 張；請加條件縮小範圍。` : `找到 ${F.res.count} 張。`),
          h('ul', { class: 'yp26-card-list', id: 'yp26FindList' }, F.res.cards.map(c => cardItem(c, 'find'))))
      : h('p', { class: 'sub', id: 'yp26FindCount', role: 'status' }, '沒有符合的卡。可以少填一個條件再試。');
    return h('section', { class: 'yp26-find', 'aria-labelledby': 'yp26FindTitle' },
      h('h5', { id: 'yp26FindTitle' }, '從全部卡片找'),
      h('p', { class: 'hint' }, '找任何一張卡加給這位同事，例如寫給多人或寫給團隊的卡。匿名卡只能用內文或日期找。'), form, res);
  }

  function cardsPanel() {
    const C = S.cards;
    const nm = C ? C.name : ((S.list && S.list.people.find(p => p.uid === S.sel)) || {}).name || '';
    const title = h('h4', { id: 'yp26CardsTitle', tabindex: '-1' }, `加卡給 ${nm}`);
    const wrap = (...kids) => h('div', { class: 'yp26-cards', id: 'yp26Cards', 'aria-labelledby': 'yp26CardsTitle', role: 'region' }, title, ...kids);
    if (S.cardsErr) return wrap(h('p', { class: 'yp26-err', role: 'alert' }, S.cardsErr, ' ', h('button', { type: 'button', class: 'btn btn-sm', onclick: () => pick(S.sel) }, '再試一次')));
    if (!C) return wrap(h('p', { class: 'sub yp26-loading', role: 'status' }, '讀取寫給他的卡中…'));
    const counts = h('p', { class: 'yp26-counts', id: 'yp26CardsCounts' },
      h('span', null, '同事挑 ', h('b', null, String(C.picked))), h('span', null, '管理員補 ', h('b', null, String(C.added))), h('span', null, '合計 ', h('b', null, String(C.total))),
      C.total === 0 ? h('span', { class: 'tag tag-bad' }, '還沒有卡') : null);
    const mine = C.cards.length
      ? h('ul', { class: 'yp26-card-list', id: 'yp26MineList' }, C.cards.map(c => cardItem(c, 'mine')))
      : h('p', { class: 'yp26-nocards', id: 'yp26NoCards' }, '沒有寫給他的卡（含舊卡姓名比對）。可以用下面「從全部卡片找」加一張（例如寫給團隊的卡），或先在牆上寫一張給他，再回來勾選。');
    const nx = S.msg && S.msgNext && !S.msgBad ? nextNone() : null;
    return wrap(S.msg ? h('div', { class: 'yp26-msg' + (S.msgBad ? ' is-bad' : ''), role: S.msgBad ? 'alert' : 'status', id: 'yp26Msg' }, h('span', null, S.msg),
        nx ? h('button', { type: 'button', class: 'btn btn-sm btn-primary', id: 'yp26NextBtn', onclick: () => pick(nx.uid) }, `下一位沒有卡的：${nx.name || nx.uid} →`) : null) : null,
      counts,
      h('h5', null, `寫給他的卡（${C.cards.length}）`), mine,
      C.extra.length ? h('h5', null, `另外加的卡（不是寫給他的，${C.extra.length}）`) : null,
      C.extra.length ? h('ul', { class: 'yp26-card-list', id: 'yp26ExtraList' }, C.extra.map(c => cardItem(c, 'extra'))) : null,
      findBox());
  }

  async function refresh() {
    if (S.busy) return;
    S.busy = true; render();
    try { const r = await api.stats(); S.stats = { ...r, at: Number(r.at) || Date.now() }; S.err = ''; }
    catch (e) { S.err = errText(e); }
    finally { S.busy = false; render(); }
    if (phaseOf(o.now(), K.YP26) !== 'open') loadList();
  }
  async function loadList() {
    try { S.list = await api.admin('adminList'); S.listErr = ''; if (o.onNone) o.onNone(S.list.none); }
    catch (e) { S.listErr = S.list ? `最新數字讀不到（${errText(e)}），上面是上一次的數字。` : errText(e); }
    render();
  }
  async function pick(uid) {
    if (S.sel !== uid) S.find = newFind();
    if (S.just && S.just !== uid) { S.just = null; S.justN = 0; S.justGroup = null; }
    S.sel = uid; S.cards = null; S.cardsErr = ''; S.msg = ''; S.msgNext = false; render();
    const seq = ++S.seq;
    try { const r = await api.admin('adminCards', { rid: uid }); if (seq === S.seq) S.cards = r; }
    catch (e) { if (seq === S.seq) S.cardsErr = errText(e); }
    if (seq !== S.seq) return;                                         // 已經點了別人：丟掉舊結果
    render();
    // S3：沒有寫給他的卡的人，唯一能做的是去搜尋 → 游標直接放到關鍵字欄
    const t = S.cards && !S.cards.cards.length && !S.cards.extra.length ? document.getElementById('yp26FQ') : document.getElementById('yp26CardsTitle');
    if (t) { t.focus({ preventScroll: true }); const p = document.getElementById('yp26Cards'); if (p && p.scrollIntoView) p.scrollIntoView({ block: 'nearest' }); }
  }
  async function search() {
    const F = S.find, rid = S.sel;
    if (!rid || F.busy) return;
    F.busy = true; F.err = ''; render();
    try { const r = await api.admin('adminSearch', { rid, author: F.author.trim(), q: F.q.trim(), from: F.from, to: F.to }); if (S.sel === rid && S.find === F) F.res = r; }
    catch (e) { if (S.find === F) F.err = errText(e); }
    finally { F.busy = false; }
    if (S.sel === rid) render();
  }
  /** M5：剛補好的人留在名單上（記住他原本的分組），換人或取消篩選時清掉 */
  function markJust(rid, on) {
    if (on) {
      if (S.just !== rid) { const p = S.list && S.list.people.find(x => x.uid === rid); S.just = rid; S.justN = 0; S.justGroup = p ? baseGroup(p) : null; }
      S.justN++;
    } else if (S.just === rid) S.justN = Math.max(0, S.justN - 1);
  }
  /** 同一張卡可能同時出現在「寫給他的卡」和搜尋結果：一起更新 */
  function markAll(mid, on) {
    for (const arr of [S.cards && S.cards.cards, S.cards && S.cards.extra, S.find.res && S.find.res.cards]) for (const x of arr || []) if (x.mid === mid) x.on = on;
  }
  async function setFill(c, on, input) {
    const rid = S.sel, name = (S.cards && S.cards.name) || '';
    if (on && !c.fr) {                                                  // 不是寫給他的卡：再確認一次（取消就恢復沒勾）
      if (input) input.checked = false;
      const res = await actionModal({ title: `這張卡不是寫給 ${name} 的`, danger: false, confirmText: '確定加給他',
        body: h('div', null, h('p', null, `這張卡的收件人是「${c.r || '（沒寫）'}」，不是 ${name}。`),
          h('p', null, `確定要把它印一份給 ${name} 嗎？卡上的 To 列會照原樣印，背面印 ${name} 的名字。`),
          h('div', { class: 'quote' }, c.x || '（只有圖片）')),
        run: async () => { try { return await api.admin('adminSet', { mid: c.mid, rid, on: true, force: true }); } catch (e) { throw new Error(errText(e)); } } });
      if (!res.ok) return;
      markAll(c.mid, true); markJust(rid, true); S.msg = `已加給 ${name}（不是寫給他的卡；已記錄在操作紀錄）。`; S.msgBad = false; S.msgNext = true;
      return afterSave(rid, c.mid);
    }
    S.saving.set(c.mid, on); render();
    try { await api.admin('adminSet', { mid: c.mid, rid, on }); markAll(c.mid, on); markJust(rid, on); S.msg = on ? `已加給 ${name}（已記錄在操作紀錄）。` : '已移除這張補卡（已記錄在操作紀錄）。'; S.msgBad = false; S.msgNext = on; }
    catch (e) { S.msg = errText(e); S.msgBad = true; }
    finally { S.saving.delete(c.mid); }
    return afterSave(rid, c.mid);
  }
  async function afterSave(rid, mid) {
    render();
    const again = () => { const f = box.querySelector(`input[data-mid="${CSS.escape(mid)}"]:not([disabled])`); if (f) f.focus(); };
    again();
    // 背景更新：這位同事的卡（「另外加的卡」會移進移出）＋總覽數字
    const seq = S.seq;
    const [cards] = await Promise.allSettled([api.admin('adminCards', { rid }), loadList()]);
    if (seq === S.seq && S.sel === rid && cards.status === 'fulfilled') { S.cards = cards.value; render(); }
    again();
  }

  render();
  if (!box.hidden) refresh();
  // 每分鐘看一次階段（封箱那一刻自動切換）；階段沒變不重畫，避免打斷正在勾選的人
  let lastPh = phaseOf(o.now(), K.YP26);
  const timer = setInterval(() => { const ph = phaseOf(o.now(), K.YP26); if (ph !== lastPh) { lastPh = ph; render(); if (!box.hidden) refresh(); } }, 60_000);
  return { refresh, render, stop: () => clearInterval(timer) };
}
