// T108「手心的光」後台（「進行中活動」分頁；admin-sky 起從總覽移過來）。
// - 活動期間：只有數字（參加人數、總張數、收到 ≥1 張的人數），不顯示名單（避免管理員提前看到自己或別人會收到什麼）。
// - 封箱後：多一區「還沒有卡的收件人」——沒有被任何同事挑到的人；點一位列出寫給他的卡（任何作者），勾選＝補卡。
//   補卡存 yp26/admin（只有 Functions 寫得進去、每次留稽核），不算進任何作者的 6 張、不改同事看得到的總數。
// - 統計頁（卓倫 11/10）：參與、收件人、每日趨勢、印刷預估。數字全部由 yp26Pick action=stats（限管理員）在伺服器算好，
//   瀏覽器不下載挑選明細；這裡只畫數字和簡單長條圖，沒有任何姓名、排序或匯出功能。
// 數字與名單都由 Cloud Functions yp26Pick（限管理員）算好回傳；匯出印製之後再做。
import { K } from '../app/fb/constants.js';
import { phaseOf } from '../app/yp26/yp26-logic.js';
import { createYp26Api } from '../app/yp26/yp26-api.js';
import { h } from './util.js';
import { kpi } from './views.js';
import { simpleBars as bars } from './charts.js';

const TPE = 8 * 3_600_000;
const ymd = (ms) => { const d = new Date(ms + TPE); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
const ERR = { NOT_DEPLOYED: '手心的光的伺服器功能還沒部署。', NOT_CLOSED: '還沒封箱，補卡要等 11/30 23:59 之後。', COVERED: '這位同事已經有同事挑的卡，不用補。',
  NOT_ACTIVE: '這位同事已不在通訊錄。', NOT_RECIPIENT: '這張卡不是寫給他的。', SELF: '這張是他自己寫給自己的卡。', NOT_FOUND: '這張卡已經刪除。' };
const updatedAt = (ms) => { const d = new Date(ms + TPE); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}（伺服器時間）`; };
const errText = (e) => ERR[e && e.code] || '讀不到資料（網路或伺服器忙碌），請稍後再試。';

/** o = { session, now(), emulator, container（「進行中活動」分頁裡的位置；沒給就放總覽最上面，舊做法） } */
export function mountYp26Admin(o) {
  const anchor = o.container || document.getElementById('ovKpis');
  if (!anchor) return null;
  const api = createYp26Api({ db: o.session.db, user: o.session.user, meId: null, emulator: o.emulator });
  const box = h('section', { class: 'card yp26-admin', id: 'yp26Admin', hidden: true, 'aria-labelledby': 'yp26AdminTitle' });
  if (o.container) o.container.append(box); else anchor.parentNode.insertBefore(box, anchor);
  const S = { stats: null, err: '', busy: false, list: null, listErr: '', onlyTodo: true, sel: null, cards: null, cardsErr: '', saving: new Set(), msg: '' };

  function render() {
    const ph = phaseOf(o.now(), K.YP26);
    box.hidden = ph === 'before';
    if (box.hidden) return;
    const n = (k) => (S.stats ? S.stats[k] : '…');
    const closed = ph !== 'open';
    box.replaceChildren(...[   // replaceChildren 會把 null 印成「null」字樣（6.5.8 活動期間區塊最下面多一行 null）：先濾掉
      h('h3', { id: 'yp26AdminTitle' }, closed ? '手心的光（已封箱）' : '手心的光（挑卡中，11/30 23:59 封箱）'),
      h('div', { class: 'grid grid-kpi' },
        kpi('參加人數', n('participants'), '至少挑了 1 張的同事', { id: 'yp26KpiPeople' }),
        kpi('總張數', n('total'), `每人最多 ${K.YP26.cap} 張（不含管理員補卡）`, { id: 'yp26KpiTotal' }),
        kpi('收到 ≥1 張的人數', n('recipients'), closed ? '同事挑的；不含管理員補卡' : '只有人數，不顯示是誰', { id: 'yp26KpiRcv' })),
      h('p', { class: 'sub' }, S.err || (S.stats ? `更新時間 ${updatedAt(S.stats.at)}` : '讀取中…'),
        ' ', h('button', { type: 'button', class: 'btn btn-sm', disabled: S.busy, onclick: () => refresh() }, '重新整理')),
      S.stats && S.stats.dist ? statsSection(S.stats, closed) : null,
      closed ? fillSection() : null].filter(Boolean));
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

  function fillSection() {
    const L = S.list;
    const head = h('div', { class: 'card-head' },
      h('div', null, h('h3', { id: 'yp26FillTitle' }, '還沒有卡的收件人'),
        h('p', { class: 'sub' }, '沒有被任何同事挑到的人（只有管理員看得到）。點一位，從寫給他的卡裡勾選補卡；補卡不算進作者的 6 張，也不會出現在同事看得到的數字裡。')),
      L ? h('label', { class: 'yp26-todo' }, h('input', { type: 'checkbox', checked: S.onlyTodo, onchange: (e) => { S.onlyTodo = e.target.checked; render(); } }), ' 只看還沒補的') : null);
    if (S.listErr) return h('div', { class: 'yp26-fill', id: 'yp26Fill' }, head, h('p', { class: 'sub', role: 'alert' }, S.listErr, ' ', h('button', { type: 'button', class: 'btn btn-sm', onclick: () => loadList() }, '再試一次')));
    if (!L) return h('div', { class: 'yp26-fill', id: 'yp26Fill' }, head, h('p', { class: 'sub' }, '讀取中…'));
    const rows = L.people.filter(p => !S.onlyTodo || p.added === 0);
    const summary = h('p', { class: 'sub', id: 'yp26FillSummary' },
      `通訊錄 ${L.active} 人：同事挑到 ${L.covered} 人；還沒有卡 ${L.people.length} 人，其中已補 ${L.filled} 人（補卡共 ${L.adminTotal} 張）；沒有可選的卡 ${L.people.filter(p => p.n === 0).length} 人。`);
    const list = h('ul', { class: 'yp26-fill-list', 'aria-label': '還沒有卡的收件人' }, rows.length ? rows.map(p => h('li', null,
      h('button', { type: 'button', class: 'btn btn-sm' + (S.sel === p.uid ? ' btn-primary' : ''), 'data-uid': p.uid, 'aria-pressed': S.sel === p.uid ? 'true' : 'false', onclick: () => pick(p.uid) },
        p.name || p.uid),
      p.n === 0 ? h('span', { class: 'tag tag-muted' }, '沒有可選的卡') : h('span', { class: 'tag' }, `${p.n} 張可選`),
      p.added ? h('span', { class: 'tag tag-ok' }, `已補 ${p.added} 張`) : null)) : [h('li', { class: 'empty' }, S.onlyTodo ? '都補好了' : '每位同事都有同事挑的卡')]);
    return h('div', { class: 'yp26-fill', id: 'yp26Fill' }, head, summary, list, S.sel ? cardsPanel() : null);
  }

  function cardsPanel() {
    const C = S.cards;
    const title = h('h4', null, C ? `寫給 ${C.name} 的卡` : '讀取中…');
    if (S.cardsErr) return h('div', { class: 'yp26-cards', id: 'yp26Cards' }, title, h('p', { class: 'sub', role: 'alert' }, S.cardsErr));
    if (!C) return h('div', { class: 'yp26-cards', id: 'yp26Cards' }, title);
    if (!C.cards.length) return h('div', { class: 'yp26-cards', id: 'yp26Cards' }, title, h('p', { class: 'sub' }, '沒有可選的卡：通訊錄裡沒有人寫過卡給他（含舊卡姓名比對）。'));
    return h('div', { class: 'yp26-cards', id: 'yp26Cards' }, title,
      S.msg ? h('p', { class: 'sub', role: 'status' }, S.msg) : null,
      h('ul', { class: 'yp26-card-list' }, C.cards.map(c => h('li', { class: c.on ? 'on' : '' },
        h('label', null,
          h('input', { type: 'checkbox', checked: c.on, disabled: S.saving.has(c.mid), 'data-mid': c.mid, onchange: (e) => setFill(c, e.target.checked) }),
          h('span', { class: 'yp26-card-meta' }, `${ymd(c.t)}｜${c.by}｜To: ${c.r}`, c.img ? h('span', { class: 'tag tag-muted ml-6' }, '印出時只有文字') : null),
          h('span', { class: 'yp26-card-text' }, c.x || '（只有圖片）'))))));
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
    try { S.list = await api.admin('adminList'); S.listErr = ''; } catch (e) { S.listErr = errText(e); }
    render();
  }
  async function pick(uid) {
    S.sel = uid; S.cards = null; S.cardsErr = ''; S.msg = ''; render();
    try { S.cards = await api.admin('adminCards', { rid: uid }); } catch (e) { S.cardsErr = errText(e); }
    render();
    const p = document.getElementById('yp26Cards'); if (p && p.scrollIntoView) p.scrollIntoView({ block: 'nearest' });
  }
  async function setFill(c, on) {
    S.saving.add(c.mid); render();
    try { await api.admin('adminSet', { mid: c.mid, rid: S.sel, on }); c.on = on; S.msg = on ? '已加入補卡（已記錄在操作紀錄）。' : '已取消補卡。'; }
    catch (e) { S.msg = errText(e); }
    finally { S.saving.delete(c.mid); }
    await loadList();
    const f = box.querySelector(`input[data-mid="${CSS.escape(c.mid)}"]`); if (f) f.focus();
  }

  render();
  if (!box.hidden) refresh();
  // 每分鐘看一次階段（封箱那一刻自動切換）；階段沒變不重畫，避免打斷正在勾選的人
  let lastPh = phaseOf(o.now(), K.YP26);
  const timer = setInterval(() => { const ph = phaseOf(o.now(), K.YP26); if (ph !== lastPh) { lastPh = ph; render(); if (!box.hidden) refresh(); } }, 60_000);
  return { refresh, render, stop: () => clearInterval(timer) };
}
