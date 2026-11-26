// T102 拾光小舖：第一期預設商品（後台「匯入預設商品」用；正式資料以 shop/items 為準）。
// 一種買法＝一個 sku；g＝擁有的東西（inv/{uid}/{g}）。欄位說明：docs/T102-前端需求給後端.md 第 1 節。
// 名稱、小字、故事：文案-拾光小舖畫面.md 第 4.3、13 節（定稿）。價格：game-design/商城貨幣提案.md v2 第 3.4 節。
// 時間一律台灣時間（+08:00）。冬季光櫃 12/1～2/28；冬至檔期 12/14～12/28。
// 光印（messages.st）、節日小物（messages.hd）第一期還沒有「用在卡上」的規則：12/1 先不上架（on: false，程式設計 6／小陳 11/01 定），第二期再開。
const tw = (s) => Date.parse(s);
const WINTER = { s: tw('2026-12-01T00:00:00+08:00'), e: tw('2027-02-28T23:59:59.999+08:00'), season: 'winter' };
const DONGZHI = { s: tw('2026-12-14T00:00:00+08:00'), e: tw('2026-12-28T23:59:59.999+08:00') };

const S_FIREFLY = '把一點螢火放進你的卡片裡。頭幾天，它會輕輕地飛；之後，就安靜地亮著。';
const S_LAMP = '夜裡，桌燈只照亮一張信紙。想把謝謝寫得慢一點、認真一點的時候，就用它。';
const S_SNOWL = '窗外下著雪，燈籠裡的光暖暖的。冬天才有的信紙。';
const S_WIN = '下午三點的陽光斜斜照進來，落在你的說明書上。';
const S_FROSTBG = '冷冷的早晨，窗上結了一層霜花。';

export const DEFAULT_ITEMS = Object.freeze({
  // ---- 試試看
  fx_firefly:   { n: '留言光效・螢火', g: 'fx_firefly', ty: 'fx', fx: 'firefly', k: 'pack', c: 1, p: 15, sh: 'try', ord: 10, on: true, story: S_FIREFLY },
  fx_stream:    { n: '留言光效・流光', g: 'fx_stream', ty: 'fx', fx: 'stream', k: 'pack', c: 1, p: 20, sh: 'try', ord: 20, on: true, story: '一道光沿著卡片的邊走一圈，像有人輕輕描過那句謝謝。' },
  fx_firefly_5: { n: '螢火 5 次包', g: 'fx_firefly', ty: 'fx', fx: 'firefly', k: 'pack', c: 5, p: 60, sh: 'try', ord: 30, on: true, grp: 'fx_firefly_5', note: '比單買省 15，次數不會過期', story: '五次螢火，留給接下來想好好謝謝的五個人。' },
  tpl_lamp_r7:  { n: '燈下手寫信', g: 'tpl_lamp', ty: 'tpl', th: 'theme-lamp', k: 'rent', d: 7, p: 25, sh: 'try', ord: 40, on: true, note: '也可以租 30 天，或帶回家', story: S_LAMP },
  tpl_lamp_r30: { n: '燈下手寫信', g: 'tpl_lamp', ty: 'tpl', th: 'theme-lamp', k: 'rent', d: 30, p: 60, sh: 'try', ord: 41, on: true, story: S_LAMP },
  tpl_lamp_c3:  { n: '燈下手寫信', g: 'tpl_lamp', ty: 'tpl', th: 'theme-lamp', k: 'pack', c: 3, p: 35, sh: 'try', ord: 50, on: true, grp: 'tpl_t3', story: S_LAMP },
  bg_win_r7:    { n: '說明書背景・窗邊午後光', g: 'bg_win', ty: 'bg', k: 'rent', d: 7, p: 15, sh: 'try', ord: 60, on: true, story: S_WIN },
  bd_dongzhi:   { n: '冬至・一盞湯圓燈', g: 'bd_dongzhi', ty: 'badge', k: 'rent', d: 14, p: 20, sh: 'try', ord: 70, on: true, note: '徽章；冬至前後上架', story: '冬至的晚上，名字旁邊也亮一盞暖暖的湯圓燈。', ...DONGZHI },
  gf_tangyuan:  { n: '冬至小湯圓', g: 'gf_tangyuan', ty: 'gift', k: 'pack', c: 1, p: 12, sh: 'try', ord: 80, on: false, note: '節日小物；貼在一張卡的角落', story: '一碗小湯圓，貼在卡片角落：天冷了，記得吃點熱的。', ...DONGZHI },
  // ---- 帶回家
  st_basic:     { n: '光印・日常三枚', g: 'st_basic', ty: 'seal', k: 'perm', p: 40, sh: 'home', ord: 110, on: false, note: '「謝謝你在」「救援成功」「超給力」', story: '在卡片右下角，輕輕蓋上一枚光。' },
  st_field:     { n: '光印・現場三枚', g: 'st_field', ty: 'seal', k: 'perm', p: 40, sh: 'home', ord: 120, on: false, note: '「一次修好」「及時救援」「客戶笑了」', story: '給在現場一起扛過的人：這一枚，蓋給那一天。' },
  idea:         { n: '寫卡靈感包', g: 'idea', ty: 'idea', k: 'perm', p: 30, sh: 'home', ord: 130, on: true, note: '開頭句 8 句', story: '不知道怎麼開口的時候，小螢先替你起個頭。' },
  halo_dawn:    { n: '頭像光環・晨曦', g: 'halo_dawn', ty: 'halo', k: 'perm', p: 150, sh: 'home', ord: 140, on: true, story: '清晨第一道光，靜靜地圍在你的頭像旁邊。' },
  bg_win:       { n: '說明書背景・窗邊午後光', g: 'bg_win', ty: 'bg', k: 'perm', p: 120, sh: 'home', ord: 150, on: true, story: S_WIN },
  tpl_lamp:     { n: '燈下手寫信', g: 'tpl_lamp', ty: 'tpl', th: 'theme-lamp', k: 'perm', p: 220, sh: 'home', ord: 160, on: true, story: S_LAMP },
  ttl_pick:     { n: '自選稱號', g: 'ttl_pick', ty: 'title', k: 'perm', p: 100, sh: 'home', ord: 170, on: true, note: '10 款，例如「清晨巡燈人」', story: '給自己取一個小名號，寫在每張卡的名字旁邊。' },
  // ---- 這一季：冬季光櫃
  tpl_snow:     { n: '雪夜燈籠', g: 'tpl_snow', ty: 'tpl', th: 'theme-snowlantern', k: 'perm', p: 220, sh: 'season', ord: 210, on: true, note: '也可以租 7 天 25、30 天 60', story: S_SNOWL, ...WINTER },
  tpl_snow_r7:  { n: '雪夜燈籠', g: 'tpl_snow', ty: 'tpl', th: 'theme-snowlantern', k: 'rent', d: 7, p: 25, sh: 'season', ord: 211, on: true, story: S_SNOWL, ...WINTER },
  tpl_snow_r30: { n: '雪夜燈籠', g: 'tpl_snow', ty: 'tpl', th: 'theme-snowlantern', k: 'rent', d: 30, p: 60, sh: 'season', ord: 212, on: true, story: S_SNOWL, ...WINTER },
  tpl_snow_c3:  { n: '雪夜燈籠', g: 'tpl_snow', ty: 'tpl', th: 'theme-snowlantern', k: 'pack', c: 3, p: 35, sh: 'try', ord: 51, on: true, grp: 'tpl_t3', story: S_SNOWL, ...WINTER },
  halo_candle:  { n: '頭像光環・暖橘燭光', g: 'halo_candle', ty: 'halo', k: 'perm', p: 150, sh: 'season', ord: 220, on: true, story: '像冬夜裡的一小截蠟燭，暖暖地圍著你。', ...WINTER },
  st_winter:    { n: '光印・熱可可、圍巾', g: 'st_winter', ty: 'seal', k: 'perm', p: 50, sh: 'season', ord: 230, on: false, note: '各 50', story: '冬天限定的兩枚光印：一杯熱可可，一條圍巾。', ...WINTER },
  ttl_winter:   { n: '稱號・冬夜守燈人', g: 'ttl_winter', ty: 'title', k: 'perm', p: 100, sh: 'season', ord: 240, on: true, story: '冬夜最長的時候，總有人替大家守著燈。', ...WINTER },
  bg_frost:     { n: '說明書背景・窗上的霜花', g: 'bg_frost', ty: 'bg', k: 'perm', p: 120, sh: 'season', ord: 250, on: true, note: '也可以租 7 天 15', story: S_FROSTBG, ...WINTER },
  bg_frost_r7:  { n: '說明書背景・窗上的霜花', g: 'bg_frost', ty: 'bg', k: 'rent', d: 7, p: 15, sh: 'season', ord: 251, on: true, story: S_FROSTBG, ...WINTER },
  fx_snow:      { n: '留言光效・雪光', g: 'fx_snow', ty: 'fx', fx: 'snow', k: 'pack', c: 1, p: 20, sh: 'season', ord: 260, on: true, story: '細細的雪，在你的卡片裡慢慢落下。', ...WINTER },
});

// 卡片主題 → 擁有的東西 g（規則用 K.BANK.shop_themes；常數檔還沒有時用這份）
export const SHOP_THEMES = Object.freeze({ 'theme-lamp': 'tpl_lamp', 'theme-snowlantern': 'tpl_snow' });
// 商店模板的畫面資料（app.js THEME_CLASS／THEME_NAMES 的掛勾用）
export const SHOP_THEME_META = Object.freeze({
  'theme-lamp': { cls: 't-lamp', name: '燈下手寫信', lt: 'lt-lamp' },
  'theme-snowlantern': { cls: 't-snowlantern', name: '雪夜燈籠', lt: 'lt-snowlantern' },
});
// 光效樣式代號 → 商品 g（季節免費款不賣，不在 shop/items）
export const FX_STYLES = Object.freeze({ fx_firefly: 'firefly', fx_stream: 'stream', fx_snow: 'snow', fx_frost: 'frost' });
