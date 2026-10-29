// Firebase 網頁設定（公開設定，不是密碼：網站是公開的，安全性靠 database.rules.json 和登入）。
// 這裡不放任何服務帳號金鑰或權杖。
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAjYSBp43_8dRpGrhuTscdvbEktzogqO9o',
  authDomain: 'gratitude-wall-ad184.firebaseapp.com',
  projectId: 'gratitude-wall-ad184',
  databaseURL: 'https://gratitude-wall-ad184-default-rtdb.asia-southeast1.firebasedatabase.app/',
  appId: '1:790216418295:web:82ec771a3cb990ef39c4f2',
};

// 登入頁的提示：只是幫同事少打錯，真正擋人的是資料庫規則（只有通訊錄上的人讀寫得到）
export const LOGIN = {
  allowedDomains: ['roche.com', 'external.roche.com', 'contractors.roche.com'],
  resendCooldownSec: 60,
};

// 本機測試（Firebase Emulator）：只有網址是 localhost／127.0.0.1 而且帶 ?emu=1 時才會連模擬器；正式網址永遠連正式 Firebase。
export const EMULATOR = {
  projectId: 'demo-thanks-wall',
  host: '127.0.0.1', authPort: 9099, dbPort: 9000,
  namespace: 'demo-thanks-wall-default-rtdb',
};
