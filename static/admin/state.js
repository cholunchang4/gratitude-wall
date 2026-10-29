// 後台的共用狀態（只有管理員確認成功後才會有資料）
export const st = {
  data: null,            // adaptBootstrap() 的結果
  offset: 0,             // 伺服器時間 - 瀏覽器時間，畫面上的「現在」用伺服器時間
  health: null, healthError: false,
  audit: { entries: [], loaded: false, loading: false, error: null, stale: true },
  errors: {},            // { bootstrap: true } 重新整理失敗
  pages: {},
  preview: null,         // 通訊錄預覽：{ id, resp, raw }
  settingsDirty: false,
  lurk: [],
  render: () => {},      // main.js 設定：排程重畫
  refresh: async () => {},
};
export const nowMs = () => Date.now() + st.offset;
