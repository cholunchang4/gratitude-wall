// 「已結束活動」分頁：活動結束後，把它的統計集中放在這裡備查（資料照樣即時從資料庫讀，不另外存一份）。
//
// ── 以後有活動結束，要移進來的做法 ──
// 1. 在下面 ENDED_EVENTS 的「最前面」加一筆（最新的放最上面，預設展開）：
//      { id: '活動代號', name: '活動名稱', period: K.EVENTS['活動代號'] 或 { start, end }（毫秒）,
//        sections: ['basic', ...], headline: (ctx) => '收合時顯示的一句話結果' }
// 2. sections 從 SECTIONS 裡挑。'basic'（活動期間卡片數、發文人數、加碼卡）任何活動都能用；
//    活動有自己特別的統計，就在 SECTIONS 加一個 { title, build(ev) → { el, update(ctx) } }。
//    build 只在第一次畫的時候跑一次（搜尋框、篩選不會因為資料更新而跳掉），update 每次資料更新都會跑。
// 3. 把總覽或其他分頁裡這個活動的區塊拿掉（admin.html、views.js），不要重複出現。
import { $, h } from './util.js';
import { st, nowMs } from './state.js';
import { barChart } from './charts.js';
import * as M from './model.js';
import { actions } from './actions-registry.js';
import { kpi, pagedRows } from './views.js';
import { K } from '../app/fb/constants.js';
import * as R from '../app/fb/logic.js';

const { norm, fmtDT, safeImg, pct, HW_STAGES, HW_TOTAL, HW_REWARD_TIERS, HW_EVENT_START, HW_EVENT_END } = M;
const MOON_THEME = 'theme-moonlight';
const WD = M.WD;
const fmtD = (ts) => { const t = M.tp(ts); return `${t.y}/${t.mo}/${t.d}（${WD[t.wd]}）`; };
const inPeriod = (ev, ts) => ts >= ev.period.start && ts <= ev.period.end;

// ================= 活動清單（新活動結束時加在最前面） =================
export const ENDED_EVENTS = [
  {
    id: 'hw2026', name: '萬聖感謝夜 2026', period: { start: HW_EVENT_START, end: HW_EVENT_END },
    sections: ['hwResult', 'hwKpis', 'hwTrend', 'hwProgReward', 'hwElite', 'hwRoster', 'hwLurkers', 'hwPatrol'],
    headline: ({ Mo }) => `變身 ${Mo.infCount} 人・${M.rewardText(Mo.infCount).replace(/^變身人數 \d+ 人，/, '')}`,
  },
  {
    id: 'midautumn2026', name: '中秋月光 2026', period: { start: K.EVENTS.midautumn2026.start, end: K.EVENTS.midautumn2026.end },
    sections: ['basic', 'mooncake'],
    headline: ({ S }) => { const mc = S.messages.filter(m => m.isMooncake); return `月餅盲盒 ${mc.length} 顆，還沒開 ${mc.filter(m => !m.isOpened).length} 顆`; },
  },
];

// ================= 統計區塊 =================
function card(title, sub, ...body) {
  const subEl = h('p', { class: 'sub' }, sub || '');
  const el = h('div', { class: 'card' }, h('h3', null, title), subEl, ...body);
  return { el, subEl };
}

export const SECTIONS = {
  // ---------- 通用：任何活動都能用 ----------
  basic: {
    build(ev) {
      const grid = h('div', { class: 'grid grid-kpi', id: `${ev.id}-basic` });
      return { el: grid, update({ S, Mo }) {
        const ms = S.messages.filter(m => inPeriod(ev, m.timestamp));
        const authors = new Set(ms.map(m => Mo.msgPerson.get(m.id)).filter(Boolean));
        grid.replaceChildren(
          kpi('活動期間卡片數', ms.length, `${fmtD(ev.period.start)}～${fmtD(ev.period.end)}`, { unit: '張' }),
          kpi('活動期間發文人數', authors.size, '至少發過 1 張卡（匿名卡算回真實發文者）', { unit: '人' }),
          kpi('用活動加碼額度送出', ms.filter(m => m.isEventExtra).length, '不算進經驗值', { unit: '張' }));
      } };
    },
  },

  // ---------- 中秋 ----------
  mooncake: {
    build(ev) {
      const kp = h('div', { class: 'grid grid-kpi', id: `${ev.id}-mooncakeKpis` });
      const tbody = h('tbody', { id: 'mooncakeList' });
      const c = card('未開啟的中秋月餅盲盒', '', h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, '時間'), h('th', null, '送出者'), h('th', null, '收件人'))), tbody)));
      return { el: h('div', null, kp, c.el), update({ S }) {
        const all = S.messages.filter(m => m.isMooncake);
        const mc = all.filter(m => !m.isOpened).sort((a, b) => b.timestamp - a.timestamp);
        kp.replaceChildren(
          kpi('月餅盲盒', all.length, '收件人登入後才能開箱', { unit: '顆' }),
          kpi('已開箱', all.length - mc.length, all.length ? `開箱率 ${pct(all.length - mc.length, all.length)}%` : '—', { unit: '顆' }),
          kpi('還沒開', mc.length, '清單在下方', { unit: '顆', id: 'mooncakeCountText' }),
          kpi('中秋月光卡', S.messages.filter(m => m.theme === MOON_THEME).length, '用「中秋月光」模板的卡（含活動後）', { unit: '張' }));
        c.subEl.textContent = mc.length ? `目前牆上還有 ${mc.length} 顆盲盒等待收件人登入開箱。` : '所有月餅盲盒都開過了。';
        tbody.replaceChildren(...(mc.length ? mc.map(m => h('tr', null, h('td', { class: 'nowrap' }, fmtDT(m.timestamp)), h('td', null, m.author || '未知'), h('td', null, m.receiver || '大家')))
          : [h('tr', null, h('td', { colspan: 3, class: 'empty' }, all.length ? '沒有未開啟的盲盒' : '資料裡沒有月餅盲盒'))]));
      } };
    },
  },

  // ---------- 萬聖：最終結果（進度條、階段、獎勵門檻） ----------
  hwResult: {
    build() {
      const banner = h('div'), hero = h('div', { class: 'hw-hero', id: 'hwHero' });
      return { el: h('div', null, banner, hero), update({ Mo }) {
        const count = Mo.infCount;
        const stage = HW_STAGES.find(x => count >= x.min);
        banner.replaceChildren(h('div', { class: 'banner banner-info', id: 'hwPhaseText' }, '活動已在 10/31（六）23:59 結束，以下為最終結果。' + M.rewardText(count)));
        const ticks = [0, 50, 100, 150, 200];
        const fill = h('div', { class: 'hw-fill' }); fill.style.width = `${Math.min(100, count / HW_TOTAL * 100)}%`;
        hero.replaceChildren(
          h('div', { class: 'row' },
            h('div', null, h('div', { class: 'hw-muted' }, '全公司變身人數'), h('div', { class: 'hw-big', id: 'hwCount' }, count, h('small', null, ` / ${HW_TOTAL} 人`))),
            h('div', null, h('div', { class: 'hw-muted' }, '最後階段'), h('div', { class: 'hw-stage', id: 'hwStage' }, stage.name))),
          h('div', { class: 'hw-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': HW_TOTAL, 'aria-valuenow': count, 'aria-valuetext': `${stage.name}，${count} / ${HW_TOTAL} 人已變身` }, fill),
          h('div', { class: 'hw-ticks', 'aria-hidden': 'true' }, ticks.map(t => { const sp = h('span', { class: count >= t ? 'on' : '' }, t === 0 ? '幽暗之夜' : t === 50 ? '50 亡靈甦醒' : t === 150 ? '150 血月降臨' : String(t)); sp.style.left = `${t / HW_TOTAL * 100}%`; return sp; })),
          h('div', { class: 'milestones', id: 'milestones' }, HW_REWARD_TIERS.map(t => h('div', { class: 'ms' + (count >= t.min ? ' done' : ''), 'data-min': t.min },
            h('b', null, `${t.min} 人・${t.label}`), h('span', { class: 'st' }, count >= t.min ? '已達成' : `差 ${t.min - count} 人未達成`)))));
      } };
    },
  },

  hwKpis: {
    build() {
      const grid = h('div', { class: 'grid grid-kpi', id: 'hwKpis' });
      return { el: grid, update({ Mo }) {
        const count = Mo.infCount, ft = Mo.firstTimers.length, ftOut = Mo.firstTimers.filter(p => p.contactIdx < 0).length;
        const reply = pct(Mo.replied, Mo.thanked), replyInf = pct(Mo.repliedInf, Mo.thankedInf);
        const cardsVs = Mo.baseline > 0 && Mo.daysElapsed > 0 ? Math.round(((Mo.evCards / Mo.daysElapsed) / (Mo.baseline / 14) - 1) * 100) : null;
        grid.replaceChildren(
          kpi('活動期間第一次發文', ft, `活動前從未發文的通訊錄同事 ${Mo.lurkersBefore} 人${ftOut ? `；其中 ${ftOut} 人不在通訊錄` : ''}；企劃參考目標 30 人（估計值）`, { key: true, id: 'kpiFirst', unit: '人' }),
          kpi('活躍發文人數', Mo.active, '活動期間至少發過 1 張卡（含匿名）', { id: 'kpiActive', unit: '人' }),
          kpi('變身人數', count, '企劃參考目標 150 人（估計值）', { id: 'kpiInfected', unit: '人' }),
          kpi('活動期間卡片數', Mo.evCards, cardsVs === null ? `前兩週共 ${Mo.baseline} 張` : `每日平均比前兩週${cardsVs >= 0 ? '多' : '少'} ${Math.abs(cardsVs)}%（前兩週共 ${Mo.baseline} 張）`, { id: 'kpiCards', unit: '張', est: cardsVs === null ? null : '用已過天數的日平均比較' }),
          kpi('回卡率', reply === null ? '—' : reply + '%', Mo.thanked ? `被點名感謝 ${Mo.thanked} 人，之後回寫 ${Mo.replied} 人；其中已變身者 ${replyInf === null ? '—' : replyInf + '%'}（${Mo.repliedInf}/${Mo.thankedInf}）` : '活動期間沒有人被點名感謝', { id: 'kpiReply', value: reply ?? '', est: '收件人是用姓名文字比對發文者，同名或拼法不同會有誤差' }),
          kpi('萬聖卡／匿名卡', `${Mo.hwCards}／${Mo.anonCount}`, '匿名卡在本頁最下方「面具匿名卡」', { id: 'kpiHwAnon' }));
      } };
    },
  },

  hwTrend: {
    build() {
      const charts = h('div', { class: 'charts', id: 'hwCharts' }), table = h('table', { id: 'trendTable' });
      const c = card('每日趨勢', '', charts, h('details', { class: 'tableview' }, h('summary', null, '以表格檢視每日數字'), h('div', { class: 'table-wrap mt-12' }, table)));
      return { el: c.el, update({ Mo }) {
        const series = [
          { k: 'first', title: '第一次發文人數', unit: '人', key: true },
          { k: 'cards', title: '卡片數', unit: '張' },
          { k: 'infected', title: '新增變身人數', unit: '人', note: Mo.migrated ? `其中 ${Mo.migrated} 人是搬家前就已變身，時間記為搬家當天（${M.fmtMD(Mo.migratedAt)}）` : null, noteLabel: '含搬家前' },
          { k: 'hw', title: '萬聖卡數', unit: '張' },
          { k: 'anon', title: '匿名卡數', unit: '張' },
        ];
        c.subEl.textContent = '10/18～10/31 每天的數字（台灣時間）。滑鼠移到長條上可看當天數值。變身人數是伺服器記錄的準確時間。' + (Mo.migrated ? `有 ${Mo.migrated} 人是搬家前就已變身，統計在搬家當天（${M.fmtMD(Mo.migratedAt)}）。` : '');
        if (!Mo.days.length) { charts.replaceChildren(h('div', { class: 'empty span-all' }, '沒有每日資料。')); table.replaceChildren(); return; }
        charts.replaceChildren(...series.map(sr => barChart(sr, Mo.days)));
        table.replaceChildren(
          h('thead', null, h('tr', null, h('th', null, '日期'), series.map(sr => h('th', { class: 'num' }, sr.title)))),
          h('tbody', null, Mo.days.map(d => h('tr', null, h('td', { class: 'nowrap' }, `${d.label}（${d.wd}）`), series.map(sr => h('td', { class: 'num' }, d[sr.k]))))));
      } };
    },
  },

  // 始祖＋獎勵期限（資料庫裡的 hw/rewardUntil 和規則算出來的對照）
  hwProgReward: {
    build() {
      const prog = h('div', { id: 'progenitors' }), reward = h('div', { id: 'hwReward', class: 'sys' });
      const a = card('始祖吸血鬼', '搬家時依前台規則凍結：10/18 以前具名發文最多的前 5 位（不含匿名），登入後會自動變身。', prog);
      const b = card('獎勵期限', '對象是變身名單上的人與始祖。門檻：100 人延長 30 天、150 人 60 天、200 人永久。', reward);
      return { el: h('div', { class: 'grid grid-2' }, a.el, b.el), update({ S, Mo }) {
        prog.replaceChildren(Mo.top5.length ? h('div', { class: 'table-wrap' }, h('table', null,
          h('thead', null, h('tr', null, h('th', { class: 'num' }, '#'), h('th', null, '姓名'), h('th', { class: 'num' }, '活動前具名卡'), h('th', null, '狀態'))),
          h('tbody', { id: 'progList' }, Mo.top5.map((x, i) => h('tr', null, h('td', { class: 'num' }, i + 1), h('td', null, x.name), h('td', { class: 'num' }, x.n),
            h('td', null, x.changed ? h('span', { class: 'tag tag-ok' }, '已登入變身') : h('span', { class: 'tag tag-muted' }, '沒有登入'))))))) : h('div', { class: 'empty' }, '活動前沒有具名留言，所以沒有始祖。'));
        // 期望值用前台同一個函式算（R.hwRewardExpiry：-1＝永久、null＝沒有獎勵）
        const ru = S.hwRewardUntil, expect = R.hwRewardExpiry(Mo.infCount);
        const dbText = ru === null ? '資料庫沒有設定' : ru === R.PERMANENT ? '永久' : `${fmtDT(ru)}（台灣時間）`;
        const match = ru === expect;
        reward.replaceChildren(...[
          h('div', { class: 'sys-row' }, h('div', { class: 'sys-k' }, '依變身人數'), h('div', { class: 'sys-v' }, M.rewardText(Mo.infCount))),
          h('div', { class: 'sys-row' }, h('div', { class: 'sys-k' }, '資料庫 hw/rewardUntil'), h('div', { class: 'sys-v', id: 'hwRewardUntil' }, dbText,
            match ? h('span', { class: 'tag tag-ok ml-6' }, '一致') : h('span', { class: 'tag tag-bad ml-6' }, '不一致'))),
          match ? null : h('div', { class: 'banner banner-warn mt-8' }, '資料庫的獎勵期限和規則算出來的不一樣：同事在樣式選單看到的日期與實際能不能用會對不上，請到 Firebase 主控台確認 hw/rewardUntil。')].filter(Boolean));   // replaceChildren 會把 null 變成文字
      } };
    },
  },

  hwElite: {
    build() {
      const tbody = h('tbody', { id: 'eliteList' });
      const c = card('精銳吸血鬼', '', h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, h('th', { class: 'num' }, '#'), h('th', null, '姓名'), h('th', null, '時間'))), tbody)));
      return { el: c.el, update({ S }) {
        const rows = [...S.elite].sort((a, b) => a.at - b.at);
        c.subEl.textContent = `點到毒綠變異蝙蝠變成精銳吸血鬼的同事，共 ${rows.length} 人（名額 15 人）。`;
        tbody.replaceChildren(...(rows.length ? rows.map((r, i) => h('tr', null, h('td', { class: 'num' }, i + 1), h('td', null, S.usersById.get(r.uid)?.name || '（已不在通訊錄）'), h('td', { class: 'nowrap' }, fmtDT(r.at))))
          : [h('tr', null, h('td', { colspan: 3, class: 'empty' }, '沒有精銳吸血鬼'))]));
      } };
    },
  },

  hwRoster: {
    build() {
      const sub = h('p', { class: 'sub', id: 'infSub' });
      const filter = h('select', { id: 'infFilter', 'aria-label': '變身名單篩選', onchange: rerender('inf') },
        h('option', { value: 'all' }, '全部'), h('option', { value: 'flag' }, '只看可疑紀錄'), h('option', { value: 'noPost' }, '變身但活動期間沒發文'));
      const search = h('input', { type: 'search', id: 'infSearch', placeholder: '搜尋姓名', 'aria-label': '搜尋變身名單', oninput: rerender('inf') });
      const tbody = h('tbody', { id: 'infList' }), more = h('div', { class: 'more', id: 'infMore' });
      const el = h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', null, h('h3', null, '變身名單'), sub), h('div', { class: 'toolbar no-mb' }, filter, search)),
        h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['姓名', '在通訊錄內', '活動期間發文', '身分', '注意事項', '變身時間', '變身原因'].map(t => h('th', null, t)))), tbody)), more);
      return { el, update({ Mo }) {
        const flagged = Mo.infRows.filter(r => r.flags.length).length;
        sub.textContent = `共 ${Mo.infRows.length} 筆，可疑 ${flagged} 筆。「活動期間發文」是看本人活動期間是否發過卡；變身時間是伺服器記錄的時間。`;
        const f = filter.value, q = norm(search.value);
        const rows = Mo.infRows.filter(r => (f === 'all' || (f === 'flag' && r.flags.length) || (f === 'noPost' && !r.postedEvent)) && (!q || norm(r.name).includes(q)));
        pagedRows('inf', rows, tbody, more, 7, (r) => h('tr', { class: r.flags.length ? 'row-flag' : '' },
          h('td', null, r.name || h('span', { class: 'hint' }, '（空白）')),
          h('td', null, r.inContacts ? h('span', { class: 'tag tag-ok' }, '是') : h('span', { class: 'tag tag-bad' }, '否')),
          h('td', null, r.postedEvent ? h('span', { class: 'tag tag-ok' }, '有') : h('span', { class: 'tag tag-muted' }, '沒有')),
          h('td', null, r.isProg ? h('span', { class: 'tag tag-hw' }, '🧛 始祖') : '一般'),
          h('td', null, r.flags.length ? r.flags.map(x => h('span', { class: 'tag tag-bad mr-4' }, '⚠ ' + x)) : h('span', { class: 'hint' }, '—')),
          h('td', { class: 'nowrap' }, r.cause === 'migrated' ? h('span', { class: 'tag tag-muted', title: '資料搬家時才補記，時間是搬家時間，不是實際變身時間' }, '搬家前') : fmtDT(r.at)),
          h('td', null, M.CAUSE_LABEL[r.cause] || r.cause || '—')),
          Mo.infRows.length ? '沒有符合條件的紀錄' : '沒有人變身');
      } };
    },
  },

  hwLurkers: {
    build() {
      const sub = h('p', { class: 'sub', id: 'lurkSub' });
      const filter = h('select', { id: 'lurkFilter', 'aria-label': '還沒參與的同事篩選', onchange: rerender('lurk') },
        h('option', { value: 'none' }, '從未發文、也沒有變身'), h('option', { value: 'infectedOnly' }, '已變身、但從未發文'));
      const btn = h('button', { class: 'btn btn-sm', id: 'csvBtn', onclick: () => actions.downloadLurkers() }, '匯出 CSV');
      const tbody = h('tbody', { id: 'lurkList' }), more = h('div', { class: 'more', id: 'lurkMore' });
      const el = h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', null, h('h3', null, '還沒參與的同事'), sub), h('div', { class: 'toolbar no-mb' }, filter, btn)),
        h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, '姓名'), h('th', null, 'Email'), h('th', null, '通訊錄備註'))), tbody)), more);
      return { el, update({ S, Mo }) {
        const lf = filter.value;
        const lurk = S.contacts.map((c, i) => ({ c, i })).filter(({ i }) => !Mo.postedContactIdx.has(i) && (lf === 'none' ? !Mo.infectedContactIdx.has(i) : Mo.infectedContactIdx.has(i)));
        st.lurk = lurk.map(x => x.c);
        sub.textContent = (lf === 'none' ? `通訊錄 ${S.contacts.length} 人中，從未發文、也沒有變身的有 ${lurk.length} 人。` : `已變身但從未發過卡的有 ${lurk.length} 人。`)
          + '匯出會記入操作紀錄。名單只用來輕鬆邀請，請不要拿來點名、比較，或當成考核的依據。';
        sub.dataset.count = lurk.length;
        pagedRows('lurk', lurk, tbody, more, 3, ({ c }) => h('tr', null, h('td', null, c.name || ''), h('td', null, c.email || ''), h('td', null, c.info || '')), '沒有符合的同事');
      } };
    },
  },

  // 萬聖期間的面具匿名卡（原「匿名巡查」分頁）；刪除按鈕照常可用
  hwPatrol: {
    build() {
      const search = h('input', { type: 'search', id: 'patrolSearch', placeholder: '搜尋內容、收件人或真實發文者', 'aria-label': '搜尋匿名卡', oninput: () => st.render() });
      const list = h('div', { class: 'patrol-list', id: 'patrolList' });
      const sub = h('p', { class: 'sub', id: 'patrolSummary' });
      const el = h('details', { class: 'card archive-sub' },
        h('summary', null, h('h3', null, '面具匿名卡'), sub),
        h('div', { class: 'toolbar mt-12' }, search), list);
      return { el, update({ Mo }) {
        sub.textContent = `活動期間匿名卡共 ${Mo.patrol.length} 張。真實發文者只有管理員看得到，請勿外流。`;
        if (!el.open) return;                                          // 收合時不畫（卡片多、含附圖）
        const q = norm(search.value);
        const rows = Mo.patrol.filter(x => !q || [x.m.text, x.m.receiver, x.realName, x.email].some(v => norm(v).includes(q)));
        list.replaceChildren(...(rows.length ? rows.map(x => {
          const m = x.m, img = safeImg(m.image);
          return h('article', { class: 'pcard', 'data-id': m.id },
            h('div', { class: 'p-head' }, h('span', { class: 'mask' }, m.author)),
            h('div', { class: 'real' }, '真實發文者：', h('b', null, x.realName), x.email ? h('div', null, x.email) : null),
            h('div', { class: 'p-meta' }, `給 ${m.receiver || '大家'}・${fmtDT(m.timestamp)}・${m.likeCount} 顆糖`),
            h('div', { class: 'p-text' }, String(m.text ?? '')),
            img ? h('img', { class: 'thumb', src: img, alt: '卡片附圖' }) : null,
            h('div', { class: 'p-actions' }, h('button', { class: 'btn btn-sm btn-ghost-danger del-btn', 'data-id': m.id, onclick: () => actions.askDelete(m, x.realName) }, '刪除這張卡')));
        }) : [h('div', { class: 'empty span-all' }, Mo.patrol.length ? '沒有符合的匿名卡。' : '活動期間沒有匿名卡。')]));
      }, onToggle: true };
    },
  },
};

function rerender(pageKey) { return () => { st.pages[pageKey] = 1; st.render(); }; }

// ================= 畫面 =================
let built = null;   // [{ ev, headEl, parts: [{ update }] }]
function build() {
  const box = $('archiveList');
  built = ENDED_EVENTS.map((ev, i) => {
    const parts = ev.sections.map(key => {
      const sec = SECTIONS[key];
      if (!sec) { console.warn('已結束活動：找不到統計區塊', key); return null; }
      const p = sec.build(ev);
      if (p.onToggle) p.el.addEventListener('toggle', () => st.render());
      return p;
    }).filter(Boolean);
    const headline = h('span', { class: 'ae-headline' });
    const el = h('details', { class: 'archive-event', id: `archive-${ev.id}`, open: i === 0 ? true : null },
      h('summary', null,
        h('div', { class: 'ae-title' }, h('h3', null, ev.name), h('span', { class: 'tag tag-muted' }, '已結束')),
        h('div', { class: 'ae-period' }, `${fmtD(ev.period.start)} ～ ${fmtD(ev.period.end)}（台灣時間）`), headline),
      h('div', { class: 'ae-body' }, parts.map(p => p.el)));
    return { ev, el, headline, parts };
  });
  box.replaceChildren(
    h('nav', { class: 'ae-index', 'aria-label': '已結束活動清單' }, ENDED_EVENTS.map(ev => h('a', { href: `#archive-${ev.id}`, class: 'btn btn-sm', onclick: (e) => {
      e.preventDefault(); const d = $(`archive-${ev.id}`); d.open = true; d.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } }, ev.name))),
    ...built.map(b => b.el));
}

export function renderArchive(Mo) {
  if (!built) build();
  const ctx = { S: st.data, Mo, now: nowMs() };
  for (const b of built) {
    try { b.headline.textContent = b.ev.headline ? b.ev.headline(ctx) : ''; } catch (e) { b.headline.textContent = ''; }
    for (const p of b.parts) {
      try { p.update({ ...ctx, ev: b.ev }); }
      catch (e) { console.error(e); p.el.replaceChildren?.(h('div', { class: 'banner banner-warn' }, '這個區塊暫時算不出來，其他資料不受影響。')); }
    }
  }
}
export function resetArchive() { built = null; }
