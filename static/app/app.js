// 感謝牆 Firebase 版前台（以 5.5 為準；畫面程式和 5.5 相同）
import { WALL_CONFIG } from './config.js';
import { requireMember, USE_EMULATOR } from './fb/session.js';
import { WallBackend } from './fb/backend.js';
// 資料改由 Firebase Realtime Database 提供（fb/backend.js 把 5.5 的 api/... 對應到資料庫的讀寫與即時監聽）。
// 等級、配額、解鎖、萬聖變身的判斷在 fb/logic.js，資料庫規則（database.rules.json）在伺服器端再強制檢查一次。
let SESSION = null, BACKEND = null;

        let currentUser = null;   // { uid, displayName }：由 me 轉出，維持 4.8 程式碼原本用的形狀
        let ME = null;            // 伺服器回傳的「我的狀態」（等級、經驗、配額、解鎖、偏好、萬聖狀態）
        let attachedImageBase64 = null; let highestZ = 100; let currentRenderGen = 0;
        let userLevel = 1; let userLifetimeMessageCount = 0; let dragWarned = false;
        let themeManuallySelected = false; let isFilterMeOnly = false;

        // 版號：伺服器（後台設定）的版號比這個新，就會要求使用者重新整理。改前台檔案時只能往上加。
        const CURRENT_APP_VERSION = "6.0";

        // ================= 4.8 共用小工具 =================
        // 把使用者輸入的文字轉成純文字再放進 HTML，防止有人在留言或名字裡塞程式碼
        function escapeHtml(v) {
            return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
        }
        // 圖片網址只接受 https 或 data:image（base64），其他一律不顯示
        function safeImageUrl(v) {
            if (typeof v !== 'string' || !v) return '';
            if (/^https:\/\//i.test(v)) return v;
            if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(v)) return v;
            return '';
        }
        // 特效函式庫沒載入時不影響發文、按讚等主要功能
        // 特效函式庫放在同一個網站（CSP 不允許外部程式）。用自己建立的實例並關掉背景執行緒（blob 程式也會被 CSP 擋）
        let confettiFn = null;
        function fireConfetti(opts) {
            try {
                if (!confettiFn && window.confetti && typeof window.confetti.create === 'function') confettiFn = window.confetti.create(null, { resize: true, useWorker: false });
                if (confettiFn) confettiFn(opts);
            } catch (e) {}
        }
        // 只有資料庫的版號「比目前檔案新」才要求更新，避免替換檔案到改後台版號之間卡在更新畫面
        function isNewerVersion(server, current) {
            const a = String(server).split('.').map(Number), b = String(current).split('.').map(Number);
            if (a.some(isNaN) || b.some(isNaN)) return String(server) !== String(current);
            for (let i = 0; i < Math.max(a.length, b.length); i++) { const x = a[i] || 0, y = b[i] || 0; if (x !== y) return x > y; }
            return false;
        }
        const wallLoadingEl = document.getElementById('wallLoading');
        function setWallLoadingText(t) { const el = document.getElementById('wallLoadingText'); if (el) el.textContent = t; }
        function hideWallLoading() { document.body.classList.add('wall-ready'); }
        function showWallLoadingError() { wallLoadingEl.classList.add('error'); setWallLoadingText('留言載入失敗，請檢查網路後重新整理頁面。'); document.getElementById('wallLoadingRetry').hidden = false; }
        document.getElementById('wallLoadingRetry').addEventListener('click', () => window.location.reload());
        // 4.8：補回 4.7 不小心刪掉的音效函式（內容與舊版 index.html 相同）
        let audioCtx;
        function playSound(type) {
            try {
                if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                if (audioCtx.state === 'suspended') audioCtx.resume();
                const osc = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
                osc.connect(gainNode); gainNode.connect(audioCtx.destination);
                
                if (type === 'click') { 
                    osc.type = 'sine'; osc.frequency.setValueAtTime(800, audioCtx.currentTime); gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05); osc.start(); osc.stop(audioCtx.currentTime + 0.05);
                } else if (type === 'send') { 
                    osc.type = 'triangle'; osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3); osc.start(); osc.stop(audioCtx.currentTime + 0.3);
                } else if (type === 'levelup') {
                    const now = audioCtx.currentTime; const notes = [523.25, 659.25, 783.99, 1046.50]; 
                    notes.forEach((freq, idx) => {
                        const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination);
                        o.type = 'sine'; o.frequency.setValueAtTime(freq, now + idx * 0.1); g.gain.setValueAtTime(0.15, now + idx * 0.1); g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.3);
                        o.start(now + idx * 0.1); o.stop(now + idx * 0.1 + 0.3);
                    });
                }
            } catch(e) {}
        }

        let toastTimer = null, hwToastTimer = null;
        function showToast(text, ms = 4000) {
            const el = document.getElementById('wallToast'); if (!el) return;
            const isAlert = String(text).startsWith('⚠️');        // 失敗類提示：螢幕閱讀器立刻朗讀、停留較久、點一下可關閉
            el.setAttribute('role', isAlert ? 'alert' : 'status'); el.setAttribute('aria-live', isAlert ? 'assertive' : 'polite');
            if (isAlert) ms = Math.max(ms, 8000);
            // 手機：放在撰寫區上方，不蓋住正在輸入的欄位
            const wrap = document.getElementById('composerWrap');
            if (window.innerWidth <= 768 && wrap && wrap.getClientRects().length) el.style.bottom = Math.round(window.innerHeight - wrap.getBoundingClientRect().top + 10) + 'px';
            else el.style.bottom = '';
            el.classList.remove('hw-sent'); clearTimeout(hwToastTimer);
            el.textContent = text; el.classList.add('show');
            clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
        }
        document.getElementById('wallToast').addEventListener('click', (e) => e.currentTarget.classList.remove('show'));
        // 4.8（卓倫決定）：活動結束後的萬聖模板獎勵。是否有資格、到期日都由伺服器算好放在 me.hw.reward
        // （100 人→活動結束日＋30 天、150 人→＋60 天、200 人→永久）。到期日欄位：expires_at_ms（-1 或沒有＝永久）。
        function hwRewardStatusForMe() {
            if (IS_HALLOWEEN || !ME || !ME.hw || !ME.hw.reward) return null;
            const r = ME.hw.reward;
            let exp = (r.expires_at_ms !== undefined) ? r.expires_at_ms : (r.expiry !== undefined ? r.expiry : null);
            if (exp === null || exp === -1 || exp === Infinity || r.permanent) exp = Infinity;
            return (exp === Infinity || nowMs() <= exp) ? { expiry: exp } : null;
        }
        function syncHwThemeButton(show, title) {
            const ts = document.getElementById('themeSelector');
            let hwTheme = document.querySelector('.theme-hw-btn');
            if (show && !hwTheme) {
                hwTheme = addLimitedSwatch('theme-halloween', 'theme-hw-btn', '萬聖卡', !IS_HALLOWEEN ? '<b>萬聖卡</b><br>變身獎勵' : isCurrentUserVampire ? '<b>萬聖卡</b><br>已變身 ✓' : '<b>萬聖卡</b><br>管理員');
            } else if (!show && hwTheme) {
                hwTheme.closest('.sw-cell').remove();
                if (currentTheme === 'theme-halloween') { currentTheme = 'theme-classic'; themeManuallySelected = false; }
            }
            if (show && hwTheme) { hwTheme.title = title; hwTheme.setAttribute('aria-label', title); }
            syncPickerState();
        }
        const HW_STAGES = [ { min: 150, cls: 'hw-stage-3', name: '血月降臨' }, { min: 50, cls: 'hw-stage-2', name: '亡靈甦醒' }, { min: 0, cls: 'hw-stage-1', name: '幽暗之夜' } ];
        // ================= 4.8 樣式選擇器 =================
        const themePicker = document.getElementById('themePicker');
        const styleBtn = document.getElementById('styleBtn');
        function showSwatch(id, show) {
            const b = document.getElementById(id); if (!b) return;
            b.style.display = '';
            const cell = b.closest('.sw-cell'); if (cell) cell.hidden = !show;
        }
        function addLimitedSwatch(theme, extraClass, name, cap) {
            const cell = document.createElement('div'); cell.className = 'sw-cell swatch-item';
            const btn = document.createElement('button'); btn.type = 'button';
            btn.className = `theme-btn swatch card ${themeClassOf(theme)} ${extraClass}`;
            btn.setAttribute('data-theme', theme); btn.setAttribute('role', 'radio'); btn.setAttribute('aria-checked', 'false');
            btn.title = name; btn.setAttribute('aria-label', name);
            btn.innerHTML = '<span class="fx" aria-hidden="true"></span>';
            btn.addEventListener('click', function() {
                playSound('click'); themeManuallySelected = true;
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active'); currentTheme = theme; onThemeChosen();
            });
            const capEl = document.createElement('span'); capEl.className = 'swatch-cap'; capEl.innerHTML = cap;
            const ring = document.createElement('span'); ring.className = 'ring'; ring.setAttribute('aria-hidden', 'true');
            cell.appendChild(btn); cell.appendChild(ring); cell.appendChild(capEl);
            const grid = document.getElementById('pickLimited');
            if (theme === 'theme-admin') grid.insertBefore(cell, grid.firstChild); else grid.appendChild(cell);
            return btn;
        }
        function updateStyleButton() {
            const sw = document.getElementById('styleSwatch'); if (!sw) return;
            sw.className = `sw card ${themeClassOf(currentTheme)}`;
            const name = THEME_NAMES[currentTheme] || '純淨白';
            styleBtn.setAttribute('aria-label', `卡片樣式：${name}`);
            document.getElementById('pickerNow').textContent = name;
        }
        function syncPickerState() {
            document.querySelectorAll('.theme-btn').forEach(b => {
                const on = b.getAttribute('data-theme') === currentTheme;
                b.setAttribute('aria-checked', on ? 'true' : 'false');
                b.classList.toggle('active', on);
                const cell = b.closest('.swatch-item'); if (cell) cell.classList.toggle('is-checked', on);
                const locked = b.classList.contains('locked');
                if (locked) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
                const cap = cell && cell.querySelector('.swatch-cap[data-name]');
                if (cap && cell.parentElement.id === 'pickBasic') cap.innerHTML = locked ? `${escapeHtml(cap.dataset.name)}<br><span class="need">Lv.4</span>` : escapeHtml(cap.dataset.name);
            });
            const hint = document.getElementById('pickerHint');
            if (hint) {
                const left = Math.max(0, 10 - userLifetimeMessageCount);
                const basicLocked = !!document.querySelector('#pickBasic .theme-btn.locked');
                hint.hidden = !basicLocked;
                hint.innerHTML = basicLocked ? `再送 <b>${left} 張</b>升上 Lv.4 色彩魔術師，解鎖全部 10 種顏色。` : '';
            }
            const anyVisible = (gridId) => Array.from(document.querySelectorAll(`#${gridId} .sw-cell`)).some(c => !c.hidden);
            document.getElementById('pickRewardGroup').hidden = !anyVisible('pickReward');
            document.getElementById('pickLimitedGroup').hidden = !anyVisible('pickLimited');
            updateStyleButton();
        }
        function onThemeChosen() { syncPickerState(); closePicker(true); scheduleTagPreview(0); }
        function openPicker() {
            syncPickerState();
            themePicker.hidden = false; styleBtn.setAttribute('aria-expanded', 'true');
            const cur = themePicker.querySelector('.theme-btn[aria-checked="true"]') || themePicker.querySelector('.sw-cell:not([hidden]) .theme-btn');
            setTimeout(() => cur && cur.focus({ preventScroll: true }), 30);
            updatePauseState();
        }
        function closePicker(returnFocus) {
            if (themePicker.hidden) return;
            themePicker.hidden = true; styleBtn.setAttribute('aria-expanded', 'false');
            if (returnFocus) styleBtn.focus({ preventScroll: true });
            updatePauseState();
        }
        styleBtn.addEventListener('click', (e) => { e.stopPropagation(); playSound('click'); if (themePicker.hidden) openPicker(); else closePicker(true); });
        themePicker.addEventListener('click', (e) => e.stopPropagation());
        document.addEventListener('click', () => closePicker(false));
        // 方向鍵在可選的樣式間移動
        themePicker.addEventListener('keydown', (e) => {
            if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
            const items = Array.from(themePicker.querySelectorAll('.sw-cell:not([hidden]) .theme-btn'));
            const i = items.indexOf(document.activeElement); if (i < 0) return;
            e.preventDefault();
            const step = (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? 5 : -5);
            const next = items[Math.max(0, Math.min(items.length - 1, i + step))];
            if (next) next.focus();
        });

        // ================= 4.8 背景頁籤、拖曳、彈窗開啟時暫停所有循環動畫 =================
        function updatePauseState() {
            const paused = document.hidden || !!activeDragCard || !!document.querySelector('.focus-overlay.active') || !themePicker.hidden
                || !!document.getElementById('luScrim') || !document.getElementById('lmFocus').hidden
                || !!document.getElementById('rvScrim') || (NR.open && window.innerWidth <= 768);
            document.body.classList.toggle('is-paused', paused);
        }
        document.addEventListener('visibilitychange', updatePauseState);
        // 效能預算：同時在動的獎勵款／至尊特效卡最多 8 張（越上層越優先）
        function enforceFxBudget() {
            const fxCards = Array.from(wall.querySelectorAll('.message-card')).filter(c => /\bt-(r-|admin)/.test(c.className));
            fxCards.sort((a, b) => (parseInt(b.style.zIndex) || 0) - (parseInt(a.style.zIndex) || 0));
            fxCards.forEach((c, i) => c.classList.toggle('fx-paused', i >= 8));
        }

        // ================= 4.8 升級慶祝視窗 =================
        // 只在「真的升級」時跳一次；每位使用者已慶祝到的等級記在 localStorage，第一次載入不對既有等級補跳
        const LEVEL_UNLOCKS = {
            2: ['👍', '🍀 Lv.2 熱心路人', '🔓 解鎖：按讚 & 基礎表情符號', '恭喜跨出第一步！現在可以替同事的卡片按讚，並在留言裡加入笑臉、愛心等基礎表情。'],
            3: ['🖐️', '🌷 Lv.3 溫暖園丁', '🔓 解鎖：卡片自由拖曳 & 50 字上限', '你現在可以按住並拖曳牆上的卡片，字數上限也提升到 50 字！'],
            4: ['🌈', '🌈 Lv.4 色彩魔術師', '🔓 解鎖：10 色發文主題 & 更多表情符號', '勃根地紅、薰衣草紫等所有基本樣式都開放了，表情符號也更豐富！到「樣式」挑一個吧。'],
            5: ['👥', '🗣️ Lv.5 感謝達人', '🔓 解鎖：多人標記', '在「感謝誰？」選好一位同事後會自動加上逗號，一次標記整個團隊！'],
            6: ['🖌️', '🎨 Lv.6 塗鴉畫家', '🔓 解鎖：手繪塗鴉畫布', '文字說不完的，就畫出來吧！點 🎨 開啟畫布，親筆簽名或畫插圖。'],
            7: ['🤫', '🕵️‍♂️ Lv.7 藏鏡天使', '🔓 解鎖：匿名發布、200 字 & 全部表情符號', '字數上限擴充到 200 字，解鎖所有表情，還可以勾選「匿名」化身不具名天使。'],
            8: ['👑', '✨ Lv.8 感謝大師', '🔓 解鎖：上傳照片、1000 字 & 大師徽章', '恭喜升上感謝大師！現在可以上傳照片、寫到 1000 字，你的卡片也會帶著「感謝大師」徽章。'],
            9: ['🪩', '🪩 Lv.9 霓虹幻影', 'theme-neon', 60], 10: ['🔮', '🔮 Lv.10 極光幻境', 'theme-holo', 70],
            11: ['👑', '👑 Lv.11 璀璨鑽金', 'theme-gold', 80], 12: ['🌌', '🌌 Lv.12 星際領航', 'theme-cosmic', 90], 13: ['🦄', '🦄 Lv.13 傳說之神', 'theme-ultimate', 100],
        };
        function checkLevelUp() {
            if (!currentUser || !ME || !messagesLoaded || ME.is_admin) return;
            const stored = parseInt(prefGet('level_celebrated') || '0', 10);
            if (!stored) { prefSet('level_celebrated', String(userLevel)); return; }
            if (userLevel > stored) { prefSet('level_celebrated', String(userLevel)); const lv = userLevel; setTimeout(() => showLevelUp(lv), 400); } // 送出動畫結束後 400ms；跨兩級只顯示最高級
        }
        function showLevelUp(level) {
            const NORMAL = {
                2: ['熱心路人', '按讚＋基礎表情符號', '送出第一張卡了！現在可以替同事的卡片按讚，也可以在感謝裡加入表情符號。', '<path d="M12 21s-7-4.4-9-9c-1.4-3.2.6-7 4.2-7 2 0 3.4 1.1 4.8 2.8C13.4 6.1 14.8 5 16.8 5c3.6 0 5.6 3.8 4.2 7-2 4.6-9 9-9 9z"/>'],
                3: ['溫暖園丁', '自由拖曳＋字數 50 字', '牆上的卡片可以拖到你喜歡的位置；每張卡可以寫到 50 字。', '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>'],
                4: ['色彩魔術師', '10 色發文主題＋更多表情符號', '鼠尾草綠、薰衣草紫、星空黑……10 種基本款任你挑，點撰寫列的「樣式」換上。', '<circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="9" r="1.5"/><circle cx="15.5" cy="9" r="1.5"/><circle cx="9" cy="15" r="1.5"/>'],
                5: ['感謝達人', '多人標記', '在「感謝誰？」選好一位同事後會自動加上逗號，一張卡就能感謝整個小組。', '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c3 .2 6 2 6 5.5"/>'],
                6: ['塗鴉畫家', '手繪塗鴉', '點撰寫列的 🎨 打開畫布，畫一張專屬小圖或親筆簽名。', '<path d="M3 21l3.5-1 11-11-2.5-2.5-11 11L3 21zM14 6.5l2.5 2.5"/>'],
                7: ['藏鏡天使', '匿名發布＋字數 200 字＋全部表情符號', '想低調表達感謝時，可以勾選「匿名」送出；表情符號也全部開放。', '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>'],
                8: ['感謝大師', '上傳照片＋字數 1000 字＋大師徽章', '恭喜升上感謝大師！可以附上照片、把完整的故事寫下來，卡片也會掛上專屬的「感謝大師」徽章。', '<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/>'],
            };
            const NEED = { 2: 1, 3: 5, 4: 10, 5: 15, 6: 20, 7: 30, 8: 50 };
            const HIDDEN = { 9: ['霓虹幻影', 'theme-neon'], 10: ['極光幻境', 'theme-holo'], 11: ['璀璨鑽金', 'theme-gold'], 12: ['星際領航', 'theme-cosmic'], 13: ['傳說之神', 'theme-ultimate'] };
            const confettiHtml = (n, palette, spread) => {
                let h = '<div class="confetti" aria-hidden="true">';
                for (let i = 0; i < n; i++) {
                    const a = (i / n) * Math.PI * 2 + Math.random() * .4, d = spread * (.55 + Math.random() * .6);
                    h += `<i style="--cc:${palette[i % palette.length]};--x:${(Math.cos(a) * d).toFixed(0)}px;--y:${(Math.sin(a) * d - 60).toFixed(0)}px;--r:${Math.round(Math.random() * 720 - 360)}deg;--d:${(i % 6) * 40}ms;${i % 3 ? '' : 'width:6px;height:6px;border-radius:50%;'}"></i>`;
                }
                return h + '</div>';
            };
            closeLevelUp(false);
            const scrim = document.createElement('div');
            scrim.className = 'lu-scrim'; scrim.id = 'luScrim';
            scrim.setAttribute('role', 'dialog'); scrim.setAttribute('aria-modal', 'true'); scrim.setAttribute('aria-labelledby', 'luT');
            let newTheme = null;
            if (NORMAL[level]) {
                const [name, feat, desc, icon] = NORMAL[level];
                scrim.innerHTML = `<div class="lu">${confettiHtml(32, ['#f472b6', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#fb7185'], 280)}
                    <div class="medal" aria-hidden="true">${level}<small>LEVEL</small></div>
                    <p class="eyebrow">升級了！</p><h2 id="luT">Lv.${level} ${name}</h2><p class="sub">謝謝你持續把感謝說出口</p>
                    <div class="unlock"><span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24">${icon}</svg></span><div><h4>解鎖：${feat}</h4><p>${desc}</p></div></div>
                    ${level < 8 ? `<p class="next">下一個目標：再送 <b>${NEED[level + 1] - NEED[level]} 張</b>，升上 Lv.${level + 1} ${NORMAL[level + 1][0]}</p>` : ''}
                    <button type="button" class="ok">太棒了</button></div>`;
            } else if (HIDDEN[level]) {
                const [name, theme] = HIDDEN[level], tier = level - 8;
                newTheme = theme;
                const pal = { 9: ['#67e8f9', '#a5f3fc', '#f0abfc'], 10: ['#5eead4', '#818cf8', '#c084fc'], 11: ['#fff4c2', '#f5c84c', '#d4a52a'], 12: ['#c4b5fd', '#22d3ee', '#f472b6'], 13: ['#ff6ad5', '#ad8cff', '#94d0ff', '#7af0c4', '#ffe66d'] }[level];
                const extras = (tier >= 2 ? '<div class="aurora" aria-hidden="true"></div>' : '') + (tier >= 4 ? '<div class="stars" aria-hidden="true"></div>' : '')
                    + (tier >= 5 ? '<div class="motes" aria-hidden="true">' + Array.from({ length: 16 }, (_, i) => `<i style="left:${(i * 6.3 + 2).toFixed(1)}%;--cc:${pal[i % pal.length]};--t:${6 + (i % 5)}s;--d:${(i * -0.7).toFixed(1)}s"></i>`).join('') + '</div>' : '');
                const glints = tier >= 3 ? [[8, 18], [92, 12], [4, 62], [96, 70], [20, 96], [80, 94]].slice(0, tier + 1).map(([x, y], i) => `<span class="glint" aria-hidden="true" style="left:${x}%;top:${y}%;--d:${i * 0.4}s"></span>`).join('') : '';
                const shocks = '<span class="shock" aria-hidden="true"></span>' + (tier >= 3 ? '<span class="shock s2" aria-hidden="true"></span>' : '') + (tier >= 5 ? '<span class="shock s3" aria-hidden="true"></span>' : '');
                const sub = { 9: '你發現了隱藏的等級。', 10: '第二道隱藏關卡，為你打開。', 11: '只有少數人走到這裡。', 12: '你的感謝，已經航向星際。', 13: '你抵達了感謝牆的最高傳說。' }[level];
                scrim.classList.add('hidden-lv', `tier-${level}`);
                scrim.setAttribute('aria-describedby', 'luD');
                scrim.innerHTML = `${extras}<div class="lu hidden-lv tier-${level}">
                    ${tier >= 5 ? '<div class="prism" aria-hidden="true"></div>' : ''}<div class="rays" aria-hidden="true"></div>${shocks}${glints}
                    ${confettiHtml(18 + tier * 12, pal, 220 + tier * 40)}
                    <svg class="reveal-lock" viewBox="0 0 64 64" aria-hidden="true"><path class="shackle" d="M20 28V20a12 12 0 0 1 24 0v8" fill="none" stroke="rgb(var(--glow))" stroke-width="5" stroke-linecap="round"/><rect x="12" y="28" width="40" height="30" rx="8" fill="rgb(var(--glow))"/><circle cx="32" cy="42" r="4" fill="#120d26"/></svg>
                    ${tier >= 5 ? '<div><span class="lu-crest">感謝牆最高傳說</span></div>' : ''}
                    <p class="eyebrow">🔓 隱藏等級解鎖！</p><h2 id="luT">Lv.${level} ${name}</h2>
                    <p class="sub" id="luD">${sub}</p>
                    <div class="preview" id="luPreview"></div>
                    <p class="newtpl">新卡片樣式「<b>${name}</b>」已加入你的樣式面板</p>
                    <button type="button" class="ok">立刻換上</button></div>`;
                const preview = createCard({ id: '__lu_preview', receiver: '你', text: '這是你的新卡片樣式', author: '隱藏獎勵', theme, timestamp: Date.now(), likes: {} }, 99, 1, 1);
                preview.removeAttribute('tabindex'); preview.removeAttribute('role'); preview.setAttribute('aria-hidden', 'true');
                scrim.querySelector('#luPreview').appendChild(preview);
            } else return;
            document.body.appendChild(scrim);
            const ok = scrim.querySelector('.ok');
            ok.addEventListener('click', () => {
                if (newTheme) { // 立刻換上新模板
                    themeManuallySelected = true; currentTheme = newTheme; syncPickerState();
                }
                closeLevelUp(true);
            });
            playSound('levelup');
            updatePauseState();
            setTimeout(() => ok.focus({ preventScroll: true }), 60);
        }
        function closeLevelUp(returnFocus) {
            const scrim = document.getElementById('luScrim');
            if (!scrim) return;
            scrim.remove();
            updatePauseState();
            if (returnFocus) { const r = document.getElementById('receiverInput'); if (r && r.offsetParent) r.focus({ preventScroll: true }); }
        }
        // 彩帶：一般版沿用舊版（4.3）的五段彩帶；隱藏等級每升一級多一波、更華麗
        function triggerLevelUpCelebration(tier) {
            playSound('levelup');
            const count = 250 + tier * 80; const defaults = { origin: { y: 0.7 }, zIndex: 99999 };
            const fire = (ratio, opts) => fireConfetti(Object.assign({}, defaults, opts, { particleCount: Math.floor(count * ratio) }));
            fire(0.25, { spread: 26, startVelocity: 55 }); fire(0.2, { spread: 60 }); fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 }); fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 }); fire(0.1, { spread: 120, startVelocity: 45 });
            if (tier >= 1) setTimeout(() => { fire(0.2, { angle: 60, spread: 70, origin: { x: 0, y: 0.75 } }); fire(0.2, { angle: 120, spread: 70, origin: { x: 1, y: 0.75 } }); }, 350);
            if (tier >= 3) setTimeout(() => fire(0.4, { spread: 160, startVelocity: 35, colors: ['#fde68a', '#f5c84c', '#ffffff', '#c4b5fd'] }), 800);
            if (tier >= 5) setTimeout(() => { for (let i = 0; i < 3; i++) setTimeout(() => fire(0.25, { spread: 360, startVelocity: 30, origin: { x: 0.2 + i * 0.3, y: 0.35 }, colors: ['#ff6ad5', '#94d0ff', '#7af0c4', '#ffe66d'] }), i * 250); }, 1200);
        }

        function hasSeenHwStory() { return !!prefGet('hw2026_story_seen'); }

        const msgInput = document.getElementById('msgInput');
        msgInput.addEventListener('input', function() {
            this.style.height = '38px'; 
            this.style.height = Math.min(this.scrollHeight, 100) + 'px'; 
            this.style.overflowY = this.scrollHeight > 100 ? 'auto' : 'hidden';
        });

        // ================= 節慶活動共用邏輯 =================
        function checkIsMidAutumn(ts) {
            const d = new Date(ts);
            return d.getMonth() === 8 && d.getDate() >= 24 && d.getDate() <= 30; // 9/24-9/30（只用來替舊卡片標示「團圓大使」）
        }

        // 萬聖節活動時間預設值（10/18 - 10/31，台灣時間）；開頁後以伺服器回傳的 events.hw2026 為準
        let HW_EVENT_START = new Date('2026-10-18T00:00:00+08:00').getTime();
        let HW_EVENT_END = new Date('2026-10-31T23:59:59+08:00').getTime();
        function checkIsHalloween(ts) {
            return ts >= HW_EVENT_START && ts <= HW_EVENT_END;
        }

        // 活動模式由伺服器決定（bootstrap.events.active），不看使用者電腦的時間
        let IS_MID_AUTUMN = false;
        let IS_HALLOWEEN = false;
        // 先套萬聖背景（上次看到的階段），避免開頁先閃粉紅色；資料到齊後若不是活動期間會自動拿掉
        { const last = localStorage.getItem('hw_last_stage'); if (/^hw-stage-[123]$/.test(last || '')) document.body.classList.add('hw', last); }

        // 萬聖節變數
        let hwInfo = null;        // events.hw2026：{ start, end, infected_count, target, stage }
        let hwEpilogue = null;    // events.hw2026_epilogue：活動結束後一週才有 { start, end, final_count, reward_until }（伺服器時間判斷）
        let isCurrentUserVampire = false;
        let isCurrentUserProgenitor = false;
        let isCurrentUserElite = false;   // 4.8.4 精銳吸血鬼（舊網站抓到變異蝙蝠的 15 人；資料從舊網站搬過來，由伺服器判斷：me.hw.elite）
        // 4.8.4 之後的設計判斷（待美術總監／卓倫確認）：活動結束後，始祖和精銳的稱號仍顯示在等級列的額度說明前面，當作紀念。
        // 一般吸血鬼不顯示（人數多，紀念品是萬聖模板獎勵）。改成 false 就和 4.8.4 一樣，活動結束後不顯示任何稱號。
        const HW_TITLE_AFTER_EVENT = true;
        let hwTotalTarget = 200;
        let hwInfectedLoaded = false;
        let hwInfectionTriggered = false;
        // 夜巡名冊的狀態（程式在檔案後段「萬聖夜巡名冊」一節）
        const NR = { built: false, holder: null, entry: null, tip: null, panel: null, data: null, remaining: null, state: 'idle', q: '', open: false,
            pressed: null, forbidden: false, fetchSeq: 0, refetchTimer: null, turning: new Set() };

        function applyEventState(ev) {
            const active = (ev && Array.isArray(ev.active)) ? ev.active : [];
            IS_HALLOWEEN = active.includes('hw2026');
            IS_MID_AUTUMN = active.includes('midautumn2026');
            hwInfo = (ev && ev.hw2026) || null;
            hwEpilogue = (ev && ev.hw2026_epilogue && typeof ev.hw2026_epilogue === 'object') ? ev.hw2026_epilogue : null;
            if (hwInfo) {
                if (hwInfo.start) HW_EVENT_START = hwInfo.start;
                if (hwInfo.end) HW_EVENT_END = hwInfo.end;
                if (hwInfo.target) hwTotalTarget = hwInfo.target;
            }
        }

        function updateFestivalUI() {
            // 中秋節（只剩外觀：標題與配色；月餅盲盒不再提供）
            if (IS_MID_AUTUMN) {
                document.body.classList.add('fest-midautumn');
                document.documentElement.style.setProperty('--bg-gradient', 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)');
                document.documentElement.style.setProperty('--geo-bg-1', 'rgba(255, 215, 0, 0.08)');
                document.documentElement.style.setProperty('--geo-bg-2', 'rgba(255, 140, 0, 0.08)');

                document.getElementById('mainTitle').innerHTML = '🌕 中秋感謝牆 🥮';
                document.getElementById('subTitle').innerHTML = '送上一顆月餅，表達你最真摯的感謝';
                document.getElementById('subTitle').style.color = '#ffd700';

                if(!document.querySelector('.theme-moonlight-btn')) addLimitedSwatch('theme-moonlight', 'theme-moonlight-btn', '中秋月光', '<b>中秋月光</b><br>活動限定');
            }

            // 處理萬聖節 UI 隱藏與顯示
            if (IS_HALLOWEEN) {
                document.getElementById('hwBtn').style.display = '';
                document.body.classList.add('hw');
                document.getElementById('onbEvent').hidden = false;
                document.getElementById('dynamicFavicon').href = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎃</text></svg>";
                document.getElementById('mainTitle').innerHTML = '<span class="title-emoji" aria-hidden="true">🦇</span> 萬聖狂歡 <span class="title-emoji" aria-hidden="true">🎃</span>';
                document.getElementById('subTitle').textContent = '不給感謝就搗蛋！寫一張卡，邀同事一起變身 🦇';
                document.getElementById('hwRulesNote').style.display = 'block';

                // 更改匿名按鈕文字
                const anonLabel = document.getElementById('anonWrapper');
                if (!anonLabel.dataset.hwLabel) {
                    anonLabel.dataset.hwLabel = '1';
                    Array.from(anonLabel.childNodes).forEach(n => { if (n.nodeType === Node.TEXT_NODE) n.remove(); });
                    anonLabel.appendChild(document.createTextNode('🎭 假面舞會'));
                    anonLabel.title = "假面舞會：同事會看到隨機萬聖稱號，看不到你的名字（管理員仍看得到，請遵守暖心公約）";
                }

                const count = hwInfo ? (Number(hwInfo.infected_count) || 0) : 0;
                const pb = document.getElementById('hwProgressBar');
                const pf = document.getElementById('hwProgressFill');
                const pt = document.getElementById('hwProgressText');
                const stage = HW_STAGES.find(st => hwInfo && st.cls === hwInfo.stage) || HW_STAGES.find(st => count >= st.min);

                pb.style.display = 'block';
                if (hwInfectedLoaded) {
                    const pct = Math.min(100, (count / hwTotalTarget) * 100);
                    pf.style.width = pct + '%';
                    pt.textContent = `全公司變身進度・${stage.name}`;
                    document.getElementById('hwProgressCount').textContent = count;
                    pb.setAttribute('aria-valuenow', String(count));
                    pb.setAttribute('aria-valuetext', `${stage.name}，${count} / ${hwTotalTarget} 人已變身`);
                    pb.querySelectorAll('.hw-progress-ticks span').forEach(t => t.classList.toggle('on', count >= +t.dataset.n));

                    document.body.classList.remove('hw-stage-1', 'hw-stage-2', 'hw-stage-3');
                    document.body.classList.add(stage.cls);
                    localStorage.setItem('hw_last_stage', stage.cls);
                    if (stage.cls === 'hw-stage-2') createHwEntities('👻');
                    else if (stage.cls === 'hw-stage-3') createHwEntities('🦇');
                }

                if (currentUser && ME && ME.hw) {
                    isCurrentUserProgenitor = ME.hw.role === 'progenitor';
                    isCurrentUserElite = !!ME.hw.elite;
                    isCurrentUserVampire = !!ME.hw.infected || ME.hw.role === 'vampire' || isCurrentUserProgenitor || isCurrentUserElite;
                    // 管理員還是人類時也能寫萬聖卡（伺服器本來就允許）：名冊的「寫萬聖卡給他」才會真的選到萬聖卡
                    syncHwThemeButton(isCurrentUserVampire || !!ME.is_admin, '🎃 萬聖卡（用它寫卡，收件人送出當下就會變身）');
                    applyHwDefaultTheme();
                }
            } else if (hwInfectedLoaded) { // 資料到齊、確定不是活動期間：收起萬聖外觀（資料到之前保留上次的畫面，避免閃爍）
                if (currentUser && ME && ME.hw) { isCurrentUserProgenitor = ME.hw.role === 'progenitor'; isCurrentUserElite = !!ME.hw.elite; } // 只用來顯示紀念稱號
                document.getElementById('hwBtn').style.display = 'none';
                document.getElementById('hwProgressBar').style.display = 'none';
                document.body.classList.remove('hw', 'hw-stage-1', 'hw-stage-2', 'hw-stage-3');
                try { localStorage.removeItem('hw_last_stage'); } catch (e) {}
                // 4.8：活動結束後，變身過的人在獎勵期限內仍可使用萬聖專屬模板（由伺服器判斷：me.hw.reward）
                const reward = hwRewardStatusForMe();
                let rewardTitle = '';
                if (reward) {
                    const d = new Date(reward.expiry);
                    rewardTitle = reward.expiry === Infinity ? '🎃 萬聖專屬模板（變身獎勵，永久可用）'
                        : `🎃 萬聖專屬模板（變身獎勵，可用到 ${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}）`;
                }
                syncHwThemeButton(!!reward, rewardTitle);
            }

            renderHwEpilogue();
            syncRoster();
            updateUserLevelUI();
        }

        // ================= 萬聖謝幕（T060 O12）：活動結束後一週，進度條的位置換成一段收尾文字 =================
        // 要不要顯示只看伺服器（events.hw2026_epilogue），不看使用者電腦的時間；按 ✕ 關掉後這台裝置不再顯示。
        // 文字是暫定版（程式設計 2 依 T060 第 6 節「活動＝說書人音量」寫），定稿交文字美學官；人數、日期由伺服器帶入。
        const HW_EPILOGUE_CLOSED_KEY = 'hw2026_epilogue_closed';
        // 文字美學官定稿（T068，2026-10-29）。結尾依最後人數分四檔；M/D 是伺服器算好的獎勵到期日（reward_until，和後台 model.js rewardText 同算法：
        // 活動結束 10/31 23:59:59＋30／60 天，台灣時間 → 11/30、12/30）。「——」前後加 U+2060（不斷行）並包在 .ep-nw 裡，390 寬時才不會落在行首（white-space:nowrap 在 WebKit 遇到這個破折號會算錯寬度、字疊在一起）
        function hwEpilogueText(ep) {
            const n = Math.max(0, Number(ep.final_count) || 0);
            const until = ep.reward_until;
            const md = (typeof until === 'number' && until > 0) ? (() => { const d = new Date(until + TPE_OFFSET_MS); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; })() : '';
            let tail;
            if (until === -1) tail = '🦇 全軍覆沒，血月封印完全解開！萬聖模板永久保留給每一位變身過的同事，這是最高榮譽。';
            else if (md && n >= 150) tail = `🩸 第二道封印也破了！萬聖模板保留到 ${md}，變身過的同事都能繼續用。`;
            else if (md) tail = `🎃 第一道封印破了！萬聖模板保留到 ${md}，變身過的同事都能繼續用。`;
            else tail = '🕯️ 血月封印這次沒能解開，萬聖模板隨夜色收起；但每一張萬聖卡，都還留在「清單」裡。';
            return `🌕 鐘聲敲過，萬聖之門緩緩闔上。最後共有 <b>${n}</b> 位同事一起<span class="ep-nw">變身\u2060——\u2060謝</span>謝每一位被咬、也去咬人的神隊友！<span class="nw-tail">${escapeHtml(tail)}</span>`;
        }
        function renderHwEpilogue() {
            const box = document.getElementById('hwEpilogue'); if (!box) return;
            let closed = false; try { closed = localStorage.getItem(HW_EPILOGUE_CLOSED_KEY) === '1'; } catch (e) {}
            const show = !IS_HALLOWEEN && !!hwEpilogue && !closed;
            if (show) document.getElementById('hwEpilogueText').innerHTML = hwEpilogueText(hwEpilogue);
            box.hidden = !show;
        }
        document.getElementById('hwEpilogueClose').addEventListener('click', () => {
            playSound('click'); try { localStorage.setItem(HW_EPILOGUE_CLOSED_KEY, '1'); } catch (e) {}
            document.getElementById('hwEpilogue').hidden = true;
        });

        let entitiesCreated = false;
        function createHwEntities(emoji) {
            // 4.8：第二階段幽靈、第三階段蝙蝠（SVG），在卡片下方斜向飄過
            const GHOST = '<svg viewBox="0 0 24 24"><path fill="#f4ecff" d="M12 2a8 8 0 0 0-8 8v12l3-2 2.5 2 2.5-2 2.5 2 2.5-2 3 2V10a8 8 0 0 0-8-8z"/><circle cx="9" cy="10" r="1.3" fill="#2c2560"/><circle cx="15" cy="10" r="1.3" fill="#2c2560"/></svg>';
            const BAT = '<svg viewBox="0 0 64 36"><path fill="#fca5a5" d="M32 10c2-4 4-6 4-6l1 5c3-1 6 0 8 2 4-3 10-4 19-2-6 2-9 6-10 11-3-3-7-4-10-2 0 3-1 6-3 8-2-3-6-4-9-3-3-1-7 0-9 3-2-2-3-5-3-8-3-2-7-1-10 2-1-5-4-9-10-11 9-2 15-1 19 2 2-2 5-3 8-2l1-5s2 2 4 6z"/></svg>';
            const svg = emoji === '🦇' ? BAT : GHOST;
            if (entitiesCreated) { document.querySelectorAll('.hw-ghost').forEach(el => el.innerHTML = svg); return; }
            entitiesCreated = true;
            for (let i = 0; i < 7; i++) {
                const g = document.createElement('div');
                g.className = 'hw-ghost hw-entity'; g.setAttribute('aria-hidden', 'true'); g.innerHTML = svg;
                g.style.animationDuration = (22 + i * 4) + 's'; g.style.animationDelay = (-i * 5) + 's';
                document.body.appendChild(g);
            }
        }

        // 變身動畫與通知（4.8 原樣）。是否變身由伺服器判斷：開頁／被標記時 me.hw.just_infected 有值、點開萬聖卡時 api/hw/open-card 回傳。
        const INFECT_TEXTS = {
            progenitor: "🧛 你是感謝牆最常道謝的 5 位同事之一，已率先變身為「始祖吸血鬼」！\n\n萬聖模板已解鎖。用它寫張卡，標記一位還沒變身的同事，邀對方一起加入吧！",
            tagged: "🦇 有同事用萬聖卡謝謝你，你也變身成吸血鬼了！\n\n萬聖模板已解鎖。先去看看是誰謝謝你，再寫一張卡把謝意傳下去吧！",
            opened_card: "🦇 你點開了一張萬聖卡，變身成吸血鬼了！\n\n萬聖模板已解鎖。寫張卡謝謝一位同事，邀他一起加入吧！",
        };
        const INFECT_ROSTER_LINE = '\n\n夜巡名冊已經交給你了，就在進度條旁邊。';   // GDD T0：接在變身提示最後
        // 4.8.4：活動期間，吸血鬼（始祖、精銳、一般）沒有自己選過樣式時，預設選中萬聖卡；活動結束後不強制。
        function applyHwDefaultTheme() {
            if (!IS_HALLOWEEN || !currentUser || !isCurrentUserVampire || themeManuallySelected) return false;
            if (!document.querySelector('.theme-hw-btn')) return false;
            if (currentTheme !== 'theme-halloween') { currentTheme = 'theme-halloween'; syncPickerState(); updateStyleButton(); }
            return true;
        }

        // reveal：在線當下被萬聖卡帶走的人，動畫播完直接顯示「你被找到了」揭曉畫面（取代文字提示）
        function triggerInfection(message, reveal) {
            if (!currentUser || hwInfectionTriggered) return;
            hwInfectionTriggered = true;
            isCurrentUserVampire = true;
            infectAnimUntil = Date.now() + 2600;

            document.body.classList.add('blood-flash');
            playSound('levelup');
            fireConfetti({ particleCount: 200, spread: 100, origin: { y: 0.6 }, zIndex: 99999, colors: ['#ff4500', '#8a2be2', '#ff0000'] });

            setTimeout(() => {
                document.body.classList.remove('blood-flash');
                updateFestivalUI();
                if (reveal && revealWanted(reveal)) showReveal(reveal);
                else if (message) showToast(`【萬聖夜通知】\n${message}`, 6000); // 4.8（設計 R10）：不再用 alert 擋住畫面
            }, 2500);
        }

        function showHalloweenStory() {
            if (!IS_HALLOWEEN) return;
            if (document.getElementById('onboardingOverlay').classList.contains('active')) return; // 4.8（設計 R8）：先看完歡迎視窗
            if (document.getElementById('rvScrim')) return;                                       // 揭曉畫面關掉後再顯示
            if (!hasSeenHwStory()) {
                document.getElementById('hwOverlay').classList.add('active');
            }
        }

        const userAvatar = document.getElementById('userAvatar');
        const inputPanel = document.getElementById('inputPanel');
        // 登入由 fb/session.js 負責（Email 登入連結）；點頭像可以登出
        userAvatar.addEventListener('click', async () => { if (confirm('確定要登出嗎？')) { try { if (SESSION) await SESSION.signOut(); } finally { window.location.reload(); } } });

        // 重新整理前先把還沒送出的文字存起來，重新載入後放回輸入框（圖片和塗鴉不保留）
        function saveDraft() { try { const m = msgInput.value, r = receiverInput.value; if (m.trim() || r.trim()) sessionStorage.setItem('wall_draft', JSON.stringify({ m, r })); } catch (e) {} }
        function restoreDraft() {
            try {
                const d = JSON.parse(sessionStorage.getItem('wall_draft') || 'null'); sessionStorage.removeItem('wall_draft');
                if (!d) return;
                if (d.m && !msgInput.value) { msgInput.value = String(d.m).slice(0, msgInput.maxLength > 0 ? msgInput.maxLength : 2000); msgInput.dispatchEvent(new Event('input')); }
                if (d.r && !receiverInput.value) receiverInput.value = String(d.r).slice(0, 200);
            } catch (e) {}
        }
        function reloadWithDraft() { saveDraft(); window.location.href = window.location.pathname + '?v=' + new Date().getTime(); }
        document.getElementById('forceUpdateBtn').addEventListener('click', reloadWithDraft);

        document.getElementById('acceptOnboardingBtn').addEventListener('click', () => {
            playSound('click'); prefSet('onboarding_seen', '1'); document.getElementById('onboardingOverlay').classList.remove('active');
            setTimeout(maybeShowReveal, 300);
            // 4.8 完整版：新手引導已包含萬聖規則，關掉後不再另外跳萬聖故事（之後可點 🎃 按鈕看）
            if (IS_HALLOWEEN) prefSet('hw2026_story_seen', '1');
            focusComposerNow();
        });
        // T063 M4：「開始寫」類的按鈕一律在點擊當下「同步」展開撰寫列並設定焦點（iOS 只有在使用者點擊的同一個處理裡 focus() 才會跳出鍵盤）。
        // 手機先寫內容（「感謝誰？」不填就是寫給大家，阻力最小）；桌機照舊先填「感謝誰？」。撰寫列還沒出現（資料沒到）時什麼都不做
        function focusComposerNow() {
            if (!document.getElementById('inputPanel').offsetParent) return;
            if (window.innerWidth <= 768) { document.getElementById('composer').classList.add('expanded'); msgInput.focus({ preventScroll: true }); return; }
            const r = document.getElementById('receiverInput');
            if (r && r.offsetParent) r.focus(); else msgInput.focus();
        }
        document.getElementById('skipOnboardingBtn').addEventListener('click', () => {
            playSound('click'); prefSet('onboarding_seen', '1'); document.getElementById('onboardingOverlay').classList.remove('active');
            if (IS_HALLOWEEN) prefSet('hw2026_story_seen', '1');
            setTimeout(maybeShowReveal, 300);
        });

        const wall = document.getElementById('wall');
        const hwOverlay = document.getElementById('hwOverlay');
        document.getElementById('hwBtn').addEventListener('click', () => { playSound('click'); hwOverlay.classList.add('active'); });
        document.getElementById('hwStoryCta').addEventListener('click', () => { document.getElementById('closeHwStory').click(); if (currentUser) focusComposerNow(); });
        document.getElementById('closeHwStory').addEventListener('click', () => { 
            playSound('click'); hwOverlay.classList.remove('active'); 
            prefSet('hw2026_story_seen', '1');
        });
        const rulesOverlay = document.getElementById('rulesOverlay');
        document.getElementById('rulesBtn').addEventListener('click', () => { playSound('click'); rulesOverlay.classList.add('active'); });
        document.getElementById('closeRules').addEventListener('click', () => { playSound('click'); rulesOverlay.classList.remove('active'); });
        const guideOverlay = document.getElementById('guideOverlay');
        document.getElementById('guideBtn').addEventListener('click', () => { playSound('click'); guideOverlay.classList.add('active'); });
        document.getElementById('closeGuide').addEventListener('click', () => { playSound('click'); guideOverlay.classList.remove('active'); });
        const leaderboardOverlay = document.getElementById('leaderboardOverlay');
        document.getElementById('leaderboardBtn').addEventListener('click', () => { playSound('click'); syncLbOptout(); renderLeaderboard(); leaderboardOverlay.classList.add('active'); });
        document.getElementById('closeLeaderboard').addEventListener('click', () => { playSound('click'); leaderboardOverlay.classList.remove('active'); });
        const levelUpOverlay = document.getElementById('levelUpOverlay');
        document.getElementById('closeLevelUpBtn').addEventListener('click', () => { playSound('click'); levelUpOverlay.classList.remove('active'); });

        document.getElementById('filterMeBtn').addEventListener('click', function() {
            if (!currentUser) return showToast('資料還在載入，請稍候再試一次。');
            if (listState.mode === 'list') setViewMode('wall'); // 我的回憶是牆面的篩選
            playSound('click'); isFilterMeOnly = !isFilterMeOnly; this.classList.toggle('active', isFilterMeOnly); this.setAttribute('aria-pressed', String(isFilterMeOnly)); mobileShown = MOBILE_PAGE; renderWall();
        });

        let currentEditMsgId = null;
        document.getElementById('cancelEditBtn').addEventListener('click', () => { playSound('click'); document.getElementById('editOverlay').classList.remove('active'); currentEditMsgId = null; });
        document.getElementById('saveEditBtn').addEventListener('click', async () => {
            playSound('click'); if (!currentEditMsgId) return;
            const id = currentEditMsgId;
            const newText = document.getElementById('editMsgInput').value.trim();
            if (!newText) { showToast('✏️ 留言文字不能為空喔！'); return; }
            const btn = document.getElementById('saveEditBtn');
            if (btn.disabled) return; btn.disabled = true;
            try {
                const res = await apiWrite(`api/messages/${id}/edit`, { text: newText });
                const m = messageById.get(id);
                if (res && res.message) upsertMessage(res.message); else if (m) m.text = newText;
                if (res && res.me) applyMe(res.me);
                refreshNow(); refreshMeSoon();
                document.getElementById('editOverlay').classList.remove('active'); closeFocus(); currentEditMsgId = null;
            } catch (err) { showToast('⚠️ ' + err.message, 6000); }
            finally { btn.disabled = false; }
        });

        const focusOverlay = document.getElementById('focusOverlay');
        let currentFocusedCard = null;
        function closeFocus() { if (currentFocusedCard) { disarmImage(currentFocusedCard); currentFocusedCard.classList.remove('focused'); focusOverlay.classList.remove('active'); document.body.classList.remove('card-open'); currentFocusedCard = null; playSound('click'); } }
        focusOverlay.addEventListener('click', closeFocus);

        const themeList = ['theme-classic', 'theme-sage', 'theme-lemon', 'theme-midnight', 'theme-wine', 'theme-slate', 'theme-lavender', 'theme-matcha', 'theme-terracotta', 'theme-ice', 'theme-neon', 'theme-holo', 'theme-gold', 'theme-cosmic', 'theme-ultimate', 'theme-admin'];
        let currentTheme = themeList[0];
        
        document.querySelectorAll('.theme-btn').forEach((btn) => {
            btn.addEventListener('click', function() { 
                if (this.classList.contains('locked')) {
                    playSound('click'); const t = this.getAttribute('data-theme');
                    // 4.8：獎勵款（隱藏等級）未解鎖時根本不顯示，所以這裡只會是基本款
                    return showToast(`🌈 再送 ${Math.max(1, 10 - userLifetimeMessageCount)} 張升上 Lv.4 色彩魔術師，就能解鎖全部 10 種顏色`);
                }
                playSound('click'); themeManuallySelected = true;
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active')); 
                this.classList.add('active'); currentTheme = this.getAttribute('data-theme'); 
                onThemeChosen();
            });
        });

        const LEVEL_TITLES = { 1: '🌱 Lv.1 新手幼苗', 2: '🍀 Lv.2 熱心路人', 3: '🌷 Lv.3 溫暖園丁', 4: '🌈 Lv.4 色彩魔術師', 5: '🗣️ Lv.5 感謝達人', 6: '🎨 Lv.6 塗鴉畫家',
            7: '🕵️‍♂️ Lv.7 藏鏡天使', 8: '✨ Lv.8 感謝大師', 9: '🪩 Lv.9 霓虹幻影', 10: '🔮 Lv.10 極光幻境', 11: '👑 Lv.11 璀璨鑽金', 12: '🌌 Lv.12 星際領航', 13: '🦄 Lv.13 傳說之神' };
        // 只用在畫面文字：伺服器才是真正執行額度的人（每天 10 則、30 天內 30 則）
        const QUOTA_DAILY_LIMIT = 10, QUOTA_MONTH_LIMIT = 30;
        const BASIC_LOCKED_THEMES = ['theme-midnight', 'theme-wine', 'theme-slate', 'theme-lavender', 'theme-matcha', 'theme-terracotta', 'theme-ice'];
        const REWARD_SWATCHES = { 'theme-neon': 'btnNeon', 'theme-holo': 'btnHolo', 'theme-gold': 'btnGold', 'theme-cosmic': 'btnCosmic', 'theme-ultimate': 'btnUltimate' };
        // 「能不能做」一律看伺服器給的 me.unlocks；管理員全開
        function unlockOf(key) { return !!(ME && (ME.is_admin || (ME.unlocks && ME.unlocks[key]))); }
        function canLike() { return unlockOf('like'); }
        function canDrag() { return unlockOf('drag'); }
        function canMultiTag() { return unlockOf('multi_tag'); }
        // 表情包等級：none（未解鎖）、basic、mid、full；伺服器沒給時用等級推算
        function emojiTier() {
            if (ME && ME.is_admin) return 'full';
            const t = ME && ME.unlocks && ME.unlocks.emoji;
            if (t === 'none' || t === 'basic' || t === 'mid' || t === 'full') return t;
            return userLevel >= 7 ? 'full' : userLevel >= 4 ? 'mid' : userLevel >= 2 ? 'basic' : 'none';
        }

        function updateUserLevelUI() {
            if (!currentUser || !ME) { document.getElementById('levelStatusBar').style.display = 'none'; return; }
            const isAdminUser = !!ME.is_admin;
            const U = ME.unlocks || {};
            const expCount = Number(ME.exp) || 0, totalCount = Number(ME.total) || 0;
            const title = LEVEL_TITLES[userLevel] || `Lv.${userLevel}`;
            const maxLength = Number(U.max_length) || (isAdminUser ? 2000 : 20);

            msgInput.maxLength = maxLength; msgInput.placeholder = isAdminUser ? `🛡️ 系統管理員模式 (上限 ${maxLength} 字)` : `寫下感謝內容... (上限 ${maxLength} 字)`;
            const statusBar = document.getElementById('levelStatusBar'); statusBar.style.display = 'flex';
            // 卓倫決定（10/17）：不強調滿級，讓大家自己探索；Lv.8 以上只顯示稱號，不顯示下一級（隱藏等級不預告）
            const NEXT_AT = [1, 5, 10, 15, 20, 30, 50];
            const lvEl = document.getElementById('levelTitle');
            lvEl.innerHTML = userLevel >= 8 ? `${title}` : `${title} <span class="lv-next">· 再 ${Math.max(0, NEXT_AT[userLevel - 1] - expCount)} 張升級</span>`;
            lvEl.dataset.exp = expCount; lvEl.dataset.total = totalCount; lvEl.title = `經驗值 ${expCount}・總發送 ${totalCount}`;

            const hintSpan = document.getElementById('levelHint');
            const Q = ME.quota || {};
            const regLeft = Math.max(0, Number(Q.regular_left) || 0), evtLeft = Math.max(0, Number(Q.event_left) || 0);
            const todayUsed = Number(Q.today_used) || 0, monthUsed = Number(Q.month_used) || 0;
            if (isAdminUser) {
                hintSpan.innerHTML = `<span class="quota-status">🛡️ 管理員無限配額</span>`;
            } else if (IS_HALLOWEEN) {
                let identityText = '🙂 人類（點開萬聖卡就能變身）';
                if (isCurrentUserProgenitor) identityText = '🧛 始祖吸血鬼';
                else if (isCurrentUserElite) identityText = '🦇 精銳吸血鬼'; // 4.8.4
                else if (isCurrentUserVampire) identityText = '🦇 吸血鬼';
                hintSpan.innerHTML = `<span class="quota-status" style="background:rgba(255,140,0,0.2); color:#ff8c00;">${identityText}｜一般 ${regLeft} 則｜萬聖加碼 ${evtLeft} 則</span>`;
            } else if (IS_MID_AUTUMN) {
                if (regLeft <= 0) {
                    if (evtLeft > 0) hintSpan.innerHTML = `<span class="quota-status" style="background:#fff8dc; color:#b8860b;">🎁 中秋加碼：剩餘 ${evtLeft} 則</span>`;
                    else hintSpan.innerHTML = `<span class="quota-status" style="background:#ffe4e1; color:#d64966;">🚫 中秋加碼已用盡</span>`;
                } else {
                    hintSpan.innerHTML = `<span class="quota-status">📝 今日剩 ${regLeft} / 30 天內剩 ${Math.max(0, QUOTA_MONTH_LIMIT - monthUsed)} 則</span>`;
                }
            } else {
                // 活動結束後的紀念稱號（見 HW_TITLE_AFTER_EVENT）：只有始祖、精銳
                const hwTitle = !HW_TITLE_AFTER_EVENT ? '' : isCurrentUserProgenitor ? '🧛 始祖吸血鬼｜' : isCurrentUserElite ? '🦇 精銳吸血鬼｜' : '';
                if (todayUsed >= QUOTA_DAILY_LIMIT) hintSpan.innerHTML = `<span class="quota-status" style="background:#ffe4e1; color:#d64966;">${hwTitle}🚫 今日已滿，明天 00:00 恢復</span>`;
                else if (regLeft <= 0 && Q.next_restore_at) {
                    const unlockTime = new Date(Q.next_restore_at);
                    const dStr = `${unlockTime.getMonth()+1}/${unlockTime.getDate()} ${String(unlockTime.getHours()).padStart(2,'0')}:${String(unlockTime.getMinutes()).padStart(2,'0')}`;
                    hintSpan.innerHTML = `<span class="quota-status" style="background:#ffe4e1; color:#d64966;">${hwTitle}⏳ 將於 ${escapeHtml(dStr)} 恢復 1 則</span>`;
                }
                else hintSpan.innerHTML = `<span class="quota-status">${hwTitle}📝 今日剩 ${regLeft} / 30 天內剩 ${Math.max(0, QUOTA_MONTH_LIMIT - monthUsed)} 則</span>`;
            }

            // 權限控制（全部看 me.unlocks；伺服器另外再檢查一次）
            if (isAdminUser) {
                ['btnAdmin', 'btnNeon', 'btnHolo', 'btnGold', 'btnCosmic', 'btnUltimate'].forEach(id => showSwatch(id, true));
                document.getElementById('emojiBtn').classList.remove('locked'); document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.remove('locked')); document.getElementById('openDrawBtn').classList.remove('locked'); document.getElementById('uploadImgLabel').classList.remove('locked');
            } else {
                showSwatch('btnAdmin', false); document.getElementById('emojiBtn').classList.toggle('locked', emojiTier() === 'none');
                document.querySelectorAll('.theme-btn').forEach((btn) => {
                    btn.classList.remove('locked'); const t = btn.getAttribute('data-theme');
                    if (!U.themes_basic && BASIC_LOCKED_THEMES.includes(t)) btn.classList.add('locked');
                });
                document.getElementById('openDrawBtn').classList.toggle('locked', !U.draw); document.getElementById('uploadImgLabel').classList.toggle('locked', !U.photo);
                const owned = Array.isArray(U.reward_themes) ? U.reward_themes : [];
                Object.entries(REWARD_SWATCHES).forEach(([theme, id]) => showSwatch(id, owned.includes(theme)));
            }

            // 匿名：伺服器已把「萬聖期間不限等級」算進 unlocks.anonymous
            const anonLocked = !(isAdminUser || U.anonymous);
            document.getElementById('anonWrapper').classList.toggle('locked', anonLocked);
            document.getElementById('anonCheck').disabled = anonLocked;

            // 額度用完：送出鈕變灰、輸入框提示改成「明天再來」（仍可按，按下去會說明原因）
            const sendBtnEl = document.getElementById('sendBtn');
            const spent = !isAdminUser && regLeft <= 0 && !((IS_HALLOWEEN || IS_MID_AUTUMN) && evtLeft > 0) && !(Q.next_restore_at && nowMs() >= Q.next_restore_at);
            sendBtnEl.classList.toggle('is-spent', spent);
            if (spent) msgInput.placeholder = todayUsed >= QUOTA_DAILY_LIMIT ? '今天的額度用完了，明天再來' : '30 天內的額度用完了，過幾天再來';

            renderEmojis();
            syncPickerState();
            checkLevelUp();
        }

        const emojiFullList = ['😀','😃','😄','😁','😆','😅','😂','🤣','🥲','☺️','😊','😇','😍','🥰','😘','😋','😛','😜','🤪','😎','🤩','🥳','😏','🤗','🤔','🤭','🤫','😬','🙄','😮','😲','🥱','😴','🤤','😵','🥴','🤠','😈','👻','💀','👽','👾','🤖','🎃','👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','👍','👎','✊','👊','👏','🙌','👐','🤲','🤝','🙏','💪','👀','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❣️','💕','💞','💓','💗','💖','💘','💝','🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🦭','🐊','🐅','🐆','🦓','🦍','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🐐','🦌','🐕','🐩','🐈','🐈‍⬛','🐓','🦃','🦚','🦜','🦢','🦩','🕊','🐇','🦝','🦨','🦡','🦦','🦥','🐁','🐀','🐿','🦔','🐾','🐉','🐲','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶','🫑','🌽','🥕','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭','🍔','🍟','🍕','🥪','🥙','🌮','🌯','🥗','🥘','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','☕️','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🍾','🧊','✨','🔥','🎉','💡','💯','✅','🎵','🎶','🔔','📣','💬','💭'];
        const emojiBasicList = ['😀','😂','🥰','🙏','👍','💪','🎉','❤️'];
        const emojiMidList = [...emojiBasicList, '🤣','🥲','😊','😎','🤩','🥳','🤔','👏','🙌','🤝','🔥','✨','💯','💡','🍰','☕','🎁','🎈','🏆','🌟','🚀','💼','💻','🎵'];
        const picker = document.getElementById('emojiPicker'); 
        
        let renderedEmojiList = null;
        function renderEmojis() {
            let currentList = emojiBasicList;
            const tier = emojiTier();
            if (tier === 'full') currentList = emojiFullList;
            else if (tier === 'mid') currentList = emojiMidList;
            if (renderedEmojiList === currentList) return; // 4.8：清單沒變就不重建 300 多個表情
            renderedEmojiList = currentList; picker.innerHTML = '';
            currentList.forEach(e => { const span = document.createElement('span'); span.className = 'emoji-item'; span.innerText = e; span.onclick = () => { msgInput.value += e; picker.classList.remove('active'); msgInput.focus(); playSound('click'); }; picker.appendChild(span); });
        }
        document.getElementById('emojiBtn').addEventListener('click', (e) => { 
            e.stopPropagation(); if (emojiTier() === 'none') { playSound('click'); return showToast('🍀 達到「Lv.2 熱心路人 (送出1則留言)」才能解鎖表情符號喔！'); }
            picker.classList.toggle('active'); playSound('click'); 
        }); picker.addEventListener('click', (e) => e.stopPropagation());

        const drawOverlay = document.getElementById('drawOverlay');
        const bgCanvas = document.getElementById('bgCanvas'); const bgCtx = bgCanvas.getContext('2d');
        const drawCanvas = document.getElementById('drawCanvas'); const ctx = drawCanvas.getContext('2d');
        let isDrawing = false, penColor = '#d64966', penWidth = 4, isEraser = false;

        document.getElementById('penColor').addEventListener('input', (e) => { penColor = e.target.value; isEraser = false; updateToolUI('modePenBtn'); });
        document.getElementById('penWidth').addEventListener('input', (e) => { penWidth = e.target.value; });
        document.getElementById('modePenBtn').addEventListener('click', () => { isEraser = false; updateToolUI('modePenBtn'); playSound('click'); });
        document.getElementById('modeEraserBtn').addEventListener('click', () => { isEraser = true; updateToolUI('modeEraserBtn'); playSound('click'); });
        function updateToolUI(id) { document.getElementById('modePenBtn').classList.remove('active'); document.getElementById('modeEraserBtn').classList.remove('active'); document.getElementById(id).classList.add('active'); }
        function clearAllCanvas() { ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height); bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height); attachedImageBase64 = null; document.getElementById('imgCheck').style.display = 'none'; }
        
        document.getElementById('openDrawBtn').addEventListener('click', function() { 
            if (this.classList.contains('locked')) { playSound('click'); return showToast('🎨 手繪塗鴉需要達到「Lv.6 塗鴉畫家 (20則留言)」才能解鎖喔！\n快去多寫幾張感謝卡吧！'); }
            playSound('click'); drawOverlay.classList.add('active'); 
        });
        document.getElementById('cancelDrawBtn').addEventListener('click', () => { playSound('click'); drawOverlay.classList.remove('active'); if (!attachedImageBase64) clearAllCanvas(); });
        document.getElementById('clearDrawBtn').addEventListener('click', () => { playSound('click'); clearAllCanvas(); });

        function startDraw(e) { isDrawing = true; draw(e); } function endDraw() { isDrawing = false; ctx.beginPath(); }
        function draw(e) {
            if (!isDrawing) return; e.preventDefault();
            const rect = drawCanvas.getBoundingClientRect(); const x = ((e.touches ? e.touches[0].clientX : e.clientX) - rect.left) * (drawCanvas.width / rect.width); const y = ((e.touches ? e.touches[0].clientY : e.clientY) - rect.top) * (drawCanvas.height / rect.height);
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            if (isEraser) { ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = penWidth * 4; ctx.strokeStyle = 'rgba(0,0,0,1)'; } else { ctx.globalCompositeOperation = 'source-over'; ctx.lineWidth = penWidth; ctx.strokeStyle = penColor; }
            ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y);
        }
        drawCanvas.addEventListener('mousedown', startDraw); drawCanvas.addEventListener('mousemove', draw); drawCanvas.addEventListener('mouseup', endDraw); drawCanvas.addEventListener('mouseleave', endDraw);
        drawCanvas.addEventListener('touchstart', startDraw, {passive: false}); drawCanvas.addEventListener('touchmove', draw, {passive: false}); drawCanvas.addEventListener('touchend', endDraw);

        document.getElementById('uploadImgInput').addEventListener('click', function(e) { if (document.getElementById('uploadImgLabel').classList.contains('locked')) { e.preventDefault(); playSound('click'); return showToast('📷 照片上傳需要達到「Lv.8 感謝大師 (50則留言)」才能解鎖喔！'); } });
        document.getElementById('uploadImgInput').addEventListener('change', function(e){
            const file = e.target.files[0]; if(!file) return;
            const reader = new FileReader(); reader.onload = function(event){ const img = new Image(); img.onload = function(){ clearAllCanvas(); const scale = Math.min(bgCanvas.width / img.width, bgCanvas.height / img.height); const w = img.width * scale; const h = img.height * scale; bgCtx.drawImage(img, (bgCanvas.width - w)/2, (bgCanvas.height - h)/2, w, h); }; img.src = event.target.result; }
            reader.readAsDataURL(file);
        });

        document.getElementById('saveDrawBtn').addEventListener('click', () => {
            playSound('click'); const tCan = document.createElement('canvas'); tCan.width = drawCanvas.width; tCan.height = drawCanvas.height; const tCtx = tCan.getContext('2d');
            tCtx.fillStyle = '#ffffff'; tCtx.fillRect(0, 0, tCan.width, tCan.height); tCtx.drawImage(bgCanvas, 0, 0); tCtx.drawImage(drawCanvas, 0, 0);
            attachedImageBase64 = tCan.toDataURL('image/webp', 0.6); document.getElementById('imgCheck').style.display = 'flex'; drawOverlay.classList.remove('active');
        });

        const receiverInput = document.getElementById('receiverInput'); const autocompleteList = document.getElementById('autocompleteList');
        // 「感謝誰」：輸入停 150 毫秒才向伺服器查（最多回 6 個姓名，不含 Email）；通訊錄不再放在網頁裡
        let dirTimer = null, dirSeq = 0;
        receiverInput.addEventListener('input', () => {
            if (!canMultiTag() && receiverInput.value.includes(',')) {
                receiverInput.value = receiverInput.value.replace(/,/g, ''); playSound('click'); showToast('👥 多人標記功能需要達到「Lv.5 感謝達人 (15則留言)」才能解鎖喔！'); return;
            }
            const parts = receiverInput.value.split(','); const currentVal = parts[parts.length - 1].trim();
            autocompleteList.innerHTML = ''; clearTimeout(dirTimer); const seq = ++dirSeq; acActive = -1;
            if (!currentVal) { acClose(); return; }
            dirTimer = setTimeout(async () => {
                let names = [];
                try { const r = await api('GET', `api/directory?q=${encodeURIComponent(currentVal)}`); names = (r && Array.isArray(r.names)) ? r.names : []; } catch (e) { names = []; }
                if (seq !== dirSeq) return; // 輸入已經變了，丟掉舊結果
                autocompleteList.innerHTML = '';
                if (names.length > 0) { // 4.8（設計 M7）：最多 6 筆
                    names.slice(0, 6).forEach((name, i) => {
                        const div = document.createElement('div'); div.className = 'autocomplete-item'; div.innerText = String(name);
                        div.id = 'acOpt' + i; div.setAttribute('role', 'option'); div.setAttribute('aria-selected', 'false');
                        div.onclick = () => { const cleanParts = parts.slice(0, -1).map(p => p.trim()); cleanParts.push(String(name)); receiverInput.value = cleanParts.join(', ') + (canMultiTag() ? ', ' : ''); acClose(); receiverInput.focus(); playSound('click'); scheduleTagPreview(0); }; autocompleteList.appendChild(div);
                    }); autocompleteList.style.display = 'flex'; receiverInput.setAttribute('aria-expanded', 'true'); acActive = -1;
                } else { acClose(); }
            }, 150);
        });
        // T063 S2：名字建議清單可以用鍵盤選（方向鍵上下、Enter 選定、Esc 關閉）；螢幕閱讀器用 combobox／listbox／option 的寫法
        let acActive = -1;
        receiverInput.setAttribute('role', 'combobox'); receiverInput.setAttribute('aria-autocomplete', 'list');
        receiverInput.setAttribute('aria-controls', 'autocompleteList'); receiverInput.setAttribute('aria-expanded', 'false');
        autocompleteList.setAttribute('aria-label', '同事名字建議');
        function acOpen() { return autocompleteList.style.display === 'flex' && autocompleteList.children.length > 0; }
        function acClose() { autocompleteList.style.display = 'none'; receiverInput.setAttribute('aria-expanded', 'false'); receiverInput.removeAttribute('aria-activedescendant'); acActive = -1; }
        function acSetActive(i) {
            const items = Array.from(autocompleteList.children);
            acActive = (i + items.length) % items.length;
            items.forEach((el, k) => { const on = k === acActive; el.classList.toggle('is-active', on); el.setAttribute('aria-selected', on ? 'true' : 'false'); });
            receiverInput.setAttribute('aria-activedescendant', items[acActive].id);
            items[acActive].scrollIntoView({ block: 'nearest' });
        }
        receiverInput.addEventListener('keydown', (e) => {
            if (!acOpen()) return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); acSetActive(acActive < 0 ? (e.key === 'ArrowDown' ? 0 : -1) : acActive + (e.key === 'ArrowDown' ? 1 : -1)); }
            else if (e.key === 'Enter' && acActive >= 0) { e.preventDefault(); autocompleteList.children[acActive].click(); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); acClose(); }
        });
        document.addEventListener('click', (e) => { if(e.target !== receiverInput) acClose(); });

        const anonCheck = document.getElementById('anonCheck');

        document.getElementById('sendBtn').addEventListener('click', async function() {
            if (this.disabled) return;
            if (!currentUser || !ME) return showToast('資料還在載入，請稍候再試一次。');

            let receiver = receiverInput.value.trim().replace(/,\s*$/, '');
            if (!receiver) receiver = '大家';

            // 配額以伺服器回傳的 me.quota 為準：這裡只是先給友善提示，真正的檢查在伺服器（跨過午夜、額度已恢復時交給伺服器判斷）
            if (!ME.is_admin) {
                const Q = ME.quota || {};
                const stale = (Q.next_restore_at && nowMs() >= Q.next_restore_at) || (taipeiDay(nowMs()) !== meDay);
                if (!stale && (Number(Q.regular_left) || 0) <= 0) {
                    if (IS_HALLOWEEN || IS_MID_AUTUMN) {
                        if ((Number(Q.event_left) || 0) <= 0) {
                            playSound('click'); return showToast(IS_HALLOWEEN ? '📝 你的一般額度和萬聖加碼都用完了，謝謝你這麼熱情！額度會陸續恢復，過幾天再來吧。' : '📝 溫馨提醒：您的一般配額與「10則節慶配額」皆已用盡囉！請過幾天再來分享吧！');
                        }
                    } else {
                        playSound('click');
                        if ((Number(Q.today_used) || 0) >= QUOTA_DAILY_LIMIT) return showToast('📝 溫馨提醒：你今天已經送出 10 則感謝囉！請明天再來分享吧！');
                        else return showToast('📝 溫馨提醒：你在「過去 30 天內」已經送出 30 則感謝，達上限囉！請過幾天再來分享吧！');
                    }
                }
            }

            const text = msgInput.value.trim();
            if (text === '' && !attachedImageBase64) return;
            if (attachedImageBase64 && dataUrlBytes(attachedImageBase64) > MAX_IMAGE_BYTES) return showToast('🖼️ 這張圖片太大了（上限 1.5MB），請換一張小一點的，或在畫布裡縮小後再送出。', 6000);

            const btn = this; btn.disabled = true; btn.style.opacity = '0.6'; btn.innerHTML = '傳送中...';

            const sentTheme = currentTheme;
            const stampsAtSend = hwSentStamps();
            try {
                // 作者名稱、匿名稱號、等級、額度桶都由伺服器決定；這裡只告訴伺服器「要不要匿名」
                const res = await apiWrite('api/messages', { receiver, text, theme: currentTheme, anonymous: anonCheck.checked, image_data_url: attachedImageBase64 || null });
                if (res && res.message) { upsertMessage(res.message); }
                if (res && res.me) applyMe(res.me);
                refreshNow();

                msgInput.value = ''; msgInput.style.height = '38px'; msgInput.style.overflowY = 'hidden';
                receiverInput.value = ''; anonCheck.checked = false; acClose(); clearAllCanvas();
                NR.pressed = null; if (NR.panel) NR.panel.querySelectorAll('.roster-write[aria-pressed]').forEach(b => b.removeAttribute('aria-pressed'));

                if (IS_HALLOWEEN && isCurrentUserVampire) {
                    // 4.8.4：送出後回到預設（萬聖卡），和開頁、中途變身用同一套規則
                    themeManuallySelected = false; applyHwDefaultTheme();
                } else if (IS_MID_AUTUMN) {
                    const maBtn = document.querySelector('.theme-moonlight-btn');
                    if(maBtn) { document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active')); maBtn.classList.add('active'); currentTheme = 'theme-moonlight'; themeManuallySelected = true; }
                } else { themeManuallySelected = false; }

                playSound('send'); updateStyleButton(); scheduleTagPreview(0);
                if (IS_HALLOWEEN && sentTheme === 'theme-halloween' && res && res.hw) onHwSent(res.hw, stampsAtSend);   // T7
                // 彩帶放在送出提示（.wall-toast，z-index 99500）下面，不蓋住提示文字；仍在撰寫區、名冊上面
                if(IS_HALLOWEEN && currentTheme === 'theme-halloween') fireConfetti({ particleCount: 150, spread: 80, origin: { y: 0.8 }, zIndex: 99400, colors: ['#ff8c00', '#8a2be2', '#000000'] });
                else fireConfetti({ particleCount: 150, spread: 80, origin: { y: 0.8 }, zIndex: 99400 });

            } catch (err) { showToast('⚠️ ' + (err && err.message ? err.message : '發送失敗，請稍後重試！'), 6000); } // 內容保留在輸入框，可以直接再按送出
            finally { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = '送出'; }
        });

        msgInput.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('sendBtn').click(); } });

        let systemSettings = { maxMessages: 50, retentionDays: 30 };

        // 設定（標題、副標題、版號、牆面張數、保留天數）：開頁與伺服器推播 settings.changed 時套用。回傳 true＝需要強制更新（已顯示更新畫面）
        function applySettings(data) {
            if (!data) return false;
            if (data.appVersion && isNewerVersion(data.appVersion, CURRENT_APP_VERSION)) {
                const updateAttemptKey = 'updateAttempt_' + data.appVersion;
                if (sessionStorage.getItem(updateAttemptKey)) {
                    const box = document.getElementById('forceUpdateBox'); box.style.background = '#fff'; box.style.borderRadius = '20px'; box.style.padding = '30px 20px';
                    box.innerHTML = `<div style="font-size: 50px; margin-bottom: 15px;">😭</div><h2 style="margin-top: 0;">瀏覽器快取太頑固了！</h2><p style="font-size: 15px; line-height: 1.6; color: #555; margin-bottom: 25px; text-align: left;">系統偵測到您已嘗試更新，但瀏覽器仍死抓著舊版不放。<br><br><b>請嘗試以下動作：</b><br>1. 完全關閉這個分頁/視窗，重新點擊連結進入。<br>2. 手動清除瀏覽器快取。</p>`;
                } else {
                    document.getElementById('forceUpdateBtn').onclick = () => { playSound('click'); sessionStorage.setItem(updateAttemptKey, 'true'); reloadWithDraft(); };
                }
                document.getElementById('forceUpdateOverlay').style.display = 'flex'; document.getElementById('forceUpdateOverlay').classList.add('active'); return true;
            } else { sessionStorage.removeItem('updateAttempt_' + CURRENT_APP_VERSION); }

            if(!IS_HALLOWEEN && !IS_MID_AUTUMN) { document.getElementById('mainTitle').innerText = data.mainTitle || 'RDTW感謝牆'; document.getElementById('subTitle').innerText = data.subTitle || '每個人都可以在這裡抒發內心的感謝'; }
            const newMax = data.maxMessages || 50, newDays = data.retentionDays || 30;
            const changed = newMax !== systemSettings.maxMessages || newDays !== systemSettings.retentionDays;
            systemSettings.maxMessages = newMax; systemSettings.retentionDays = newDays;
            if (changed && messagesLoaded) renderWall();
            return false;
        }

        let activeDragCard = null; let dragStartX, dragStartY, dragInitialLeft, dragInitialTop; let cardHasMoved = false; 
        function handleDragStart(e, card) {
            if (wallState.layout && wallState.layout.isMobile) return; // 4.8：手機是捲動牆，不拖曳
            if (!canDrag()) {
                if (!dragWarned && currentUser) { showToast('🖐️ 達到「Lv.3 溫暖園丁 (5則留言)」就能解鎖自由拖曳功能喔！'); dragWarned = true; }
                return;
            }
            if (card.classList.contains('focused')) return;
            activeDragCard = card; cardHasMoved = false;
            dragStartX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX; dragStartY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
            dragInitialLeft = parseFloat(card.style.left); dragInitialTop = parseFloat(card.style.top); card._dragged = true;
            highestZ++; card.style.zIndex = highestZ; card.classList.remove('floating'); card.classList.add('dragging'); updatePauseState();
        }
        document.addEventListener('mousemove', (e) => { if (!activeDragCard) return; const dx = e.clientX - dragStartX; const dy = e.clientY - dragStartY; if (Math.abs(dx)>3 || Math.abs(dy)>3) cardHasMoved = true; activeDragCard.style.left = `${dragInitialLeft + dx}px`; activeDragCard.style.top = `${dragInitialTop + dy}px`; });
        document.addEventListener('touchmove', (e) => { if (!activeDragCard) return; if(e.cancelable) e.preventDefault(); const dx = e.touches[0].clientX - dragStartX; const dy = e.touches[0].clientY - dragStartY; if (Math.abs(dx)>3 || Math.abs(dy)>3) cardHasMoved = true; activeDragCard.style.left = `${dragInitialLeft + dx}px`; activeDragCard.style.top = `${dragInitialTop + dy}px`; }, { passive: false });
        document.addEventListener('mouseup', () => { if (activeDragCard) { activeDragCard.classList.remove('dragging'); activeDragCard = null; updatePauseState(); } });
        document.addEventListener('touchend', () => { if (activeDragCard) { activeDragCard.classList.remove('dragging'); activeDragCard = null; updatePauseState(); } });

        // ================= 卡片內容（4.8：所有使用者輸入的文字一律跳脫後才放進畫面，防止 XSS） =================
        // 4.8 完整版：資料裡的主題名稱 → 畫面樣式 class（只改顯示，不改資料）
        const THEME_CLASS = { 'theme-classic': 't-classic', 'theme-sage': 't-sage', 'theme-lemon': 't-lemon', 'theme-slate': 't-slate', 'theme-lavender': 't-lavender',
            'theme-matcha': 't-matcha', 'theme-ice': 't-ice', 'theme-midnight': 't-midnight', 'theme-wine': 't-wine', 'theme-terracotta': 't-terracotta',
            'theme-neon': 't-r-neon', 'theme-holo': 't-r-holo', 'theme-gold': 't-r-gold', 'theme-cosmic': 't-r-cosmic', 'theme-ultimate': 't-r-ultimate',
            'theme-admin': 't-admin', 'theme-halloween': 't-halloween', 'theme-moonlight': 't-moon' };
        const THEME_NAMES = { 'theme-classic': '純淨白', 'theme-sage': '鼠尾草綠', 'theme-lemon': '檸檬霜', 'theme-slate': '迷霧灰', 'theme-lavender': '薰衣草紫',
            'theme-matcha': '抹茶青', 'theme-ice': '冰川藍', 'theme-midnight': '星空黑', 'theme-wine': '勃根地紅', 'theme-terracotta': '陶土橘',
            'theme-neon': '霓虹幻影', 'theme-holo': '極光幻境', 'theme-gold': '璀璨鑽金', 'theme-cosmic': '星際領航', 'theme-ultimate': '傳說之神',
            'theme-admin': '金鑽星冕', 'theme-halloween': '萬聖卡', 'theme-moonlight': '中秋月光' };
        const THEME_PIPS = { 'theme-neon': 1, 'theme-holo': 2, 'theme-gold': 3, 'theme-cosmic': 4, 'theme-ultimate': 5 };
        const FX_THEMES = new Set(['theme-neon', 'theme-holo', 'theme-gold', 'theme-cosmic', 'theme-ultimate', 'theme-admin', 'theme-halloween', 'theme-moonlight']);
        const FX2_THEMES = new Set(['theme-ultimate', 'theme-admin']);
        const CREST_SVG = '<svg class="crest" viewBox="0 0 60 48" aria-hidden="true">'
            + '<path d="M8 36 L5 14 L18 24 L30 6 L42 24 L55 14 L52 36 Z" fill="url(#cg)" stroke="#fff6d6" stroke-width=".8"/><rect x="7" y="37" width="46" height="7" rx="2.5" fill="url(#cg2)"/>'
            + '<circle cx="5" cy="13" r="3" fill="#fffbe8"/><circle cx="55" cy="13" r="3" fill="#fffbe8"/><circle cx="30" cy="5" r="3.6" fill="#fffbe8"/>'
            + '<path class="crest-gem" d="M30 19 l4.5 5.5 -4.5 5.5 -4.5 -5.5z" fill="url(#cg3)" stroke="#fff" stroke-width=".6"/><circle cx="17" cy="30" r="2.2" fill="#ff9ad5"/><circle cx="43" cy="30" r="2.2" fill="#7dd3fc"/><circle cx="30" cy="40.5" r="2" fill="#c4b5fd"/>'
            + '<path class="crest-glint" d="M30 -4 c.5 4 1.6 5.4 7 7 -5.4 1.6 -6.5 3 -7 7 -.5 -4 -1.6 -5.4 -7 -7 5.4 -1.6 6.5 -3 7 -7z" fill="#ffffff"/></svg>';   // 至尊 v3（design/至尊模板/）
        // 皇冠的漸層（cg／cg2／cg3）只在 index.html 的共用 <svg id="sharedDefs"> 定義一次：每張卡都帶同名 id 時，瀏覽器會參照第一個，
        // 而它可能在被隱藏的牆面卡片裡（清單放大時皇冠變空心）
        const HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.2 5.2 3 1.6-1.8 3.1-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"/></svg>';
        const CANDY_SVG = '<span class="candy-ico" aria-hidden="true">🍬</span>'; // 4.8.2：卓倫回報小 SVG 看起來像蝴蝶結，改用糖果圖示並放大
        // 頭像色票：白字對比都 >= 4.5:1，避開紅橘玫瑰（卡片有勃根地紅、陶土橘）和匿名灰紫 #5b5470
        const AVATAR_COLORS = ['#7c3aed', '#0369a1', '#b45309', '#047857', '#0f766e', '#4f46e5', '#a21caf', '#0e7490'];
        function hash32(str) { let h = 0x811c9dc5; for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; } // FNV-1a
        // 頭像底色：伺服器若給了 avatar_color（0～7）就直接用；否則用「穩定識別碼」（user_id）雜湊選色，沒有識別碼才退回用名字。
        // 改名、中英文名切換都不會跳色。牆面、清單、撰寫區共用這一個函式。
        function avatarColorOf(key, name, explicit) {
            if (Number.isInteger(explicit) && explicit >= 0 && explicit < AVATAR_COLORS.length) return AVATAR_COLORS[explicit];
            return AVATAR_COLORS[hash32(key || String(name || '')) % AVATAR_COLORS.length];
        }
        function themeClassOf(t) { return THEME_CLASS[t] || 't-classic'; }
        // 畫面上用的主題：照留言本身的主題（中秋月光在活動外另有淺色顯示，見 themeClassOf）
        function displayThemeOf(msg) {
            // 卓倫決定（10/17）：照留言當初選的主題顯示；只有主題本身是 theme-admin 的卡才是至尊外觀（管理員徽章、簽名照舊）
            return THEME_CLASS[msg.theme] ? msg.theme : 'theme-classic';
        }
        // 頭像文字（姓名縮寫）。要改規則只改這個函式，或下面這一行：
        //   中文取「名字」（預設，同姓的人很多）；改成 'surname' 就是取姓（第一個字）。
        const CJK_INITIAL_MODE = 'given';
        function initialsOf(name) {
            let n = String(name || '').trim();
            n = n.replace(/\s*[(（][^)）]*[)）]\s*$/, '') || n;           // 結尾的部門括號：Mary Chen (RDTW) → Mary Chen
            n = n.replace(/[()（）\[\]【】]/g, ' ').replace(/^[^\p{L}\p{N}]+/u, '').trim();   // 其餘括號只去掉符號：(Mary) Chen → Mary Chen
            if (!n) return '?';
            const han = [...n].filter(ch => /\p{Script=Han}/u.test(ch));
            if (han.length) {                                               // 中文名（中英混合時中文優先）
                if (CJK_INITIAL_MODE === 'surname' || han.length === 1) return han[0];
                return han.length === 2 ? han[1] : han.length === 3 ? han[1] : han[2];   // 2 字取後字、3 字取中間字、4 字以上取第 3 字
            }
            if (n.includes(',')) { const [last, first] = n.split(',').map(s => s.trim()); if (first) n = `${first} ${last}`; }   // Last, First → First Last
            const words = n.split(/\s+/).filter(w => /^\p{L}/u.test(w));
            if (!words.length) return [...n][0].toUpperCase();
            if (words.length === 1) return [...words[0]][0].toUpperCase();
            return ([...words[0]][0] + [...words[words.length - 1]][0]).toUpperCase();   // 第一字＋最後一字的首字母
        }
        function safeThemeClass(t) { return (typeof t === 'string' && /^theme-[a-z]+$/.test(t)) ? t : 'theme-classic'; }
        // 管理員卡、匿名、是不是我的卡，都由伺服器在每筆留言裡標好（is_admin_card、author.anonymous、is_mine），前台不再比對姓名或 Email
        function isAdminMessage(msg) { return !!msg.isAdminCard; }
        function isMasterMessage(msg) { return msg.authorLevel >= 8 && !msg.anonymous; }
        const HIDDEN_TITLE = { 9: '霓虹幻影', 10: '極光幻境', 11: '璀璨鑽金', 12: '星際領航', 13: '傳說之神' };
        // 本人自己具名的卡：顯示本人「目前」的隱藏稱號（稱號是人的，不是卡的）；匿名卡不顯示。回傳等級或 0
        function ownHiddenLevelFor(msg) {
            if (!currentUser || !msg.isMine || !HIDDEN_TITLE[userLevel]) return 0;
            return (msg.anonymous || !msg.author) ? 0 : userLevel;
        }
        function likeCountOf(msg) { return Number(msg.likeCount) || 0; }

        function generateCardHTML(msg, maxLikes) {
            const likeCount = likeCountOf(msg); const hasLiked = !!msg.likedByMe;
            const isTopLiked = (likeCount === maxLikes && maxLikes > 0);
            const isAdminCard = isAdminMessage(msg);
            const theme = displayThemeOf(msg);
            const isAnonAuthor = !msg.author || !!msg.anonymous;

            // 徽章（每張卡最多 1 枚）：至尊 > 人氣王 > 節慶（只在該節慶期間；中秋另在「我的回憶」顯示）> 等級（本人 Lv.9～13 看到自己的隱藏稱號，其他人看到感謝大師）
            let badge = '';
            if (isAdminCard) badge = '<span class="badge supreme admin-badge">至尊</span>';
            else if (isTopLiked) badge = `<span class="badge crown crown-badge">人氣王 ${likeCount}</span>`;
            else if (IS_HALLOWEEN && theme === 'theme-halloween') badge = '<span class="badge vamp vampire-badge">🦇 暮夜吸血鬼</span>';
            else if (checkIsMidAutumn(msg.timestamp || 0) && (IS_MID_AUTUMN || isFilterMeOnly)) badge = '<span class="badge fest festival-badge">團圓大使</span>';
            else if (ownHiddenLevelFor(msg)) badge = `<span class="badge hidden-title ht-${Number(userLevel)}">${HIDDEN_TITLE[userLevel]}</span>`; // 隱藏等級只有本人看得到
            else if (isMasterMessage(msg)) badge = '<span class="badge master master-badge">感謝大師</span>';

            // 至尊 v3：.aura（外光環）一定要在 .fx 前面（同為 z-index 0，DOM 在後的蓋住前面，光環中央才會被邊框和底材蓋住）
            const fx = (theme === 'theme-admin' ? '<span class="aura" aria-hidden="true"></span>' : '')
                + (FX_THEMES.has(theme) ? '<span class="fx" aria-hidden="true"></span>' : '')
                + (FX2_THEMES.has(theme) ? '<span class="fx2" aria-hidden="true"></span>' : '')
                + (theme === 'theme-admin' ? '<span class="fx3" aria-hidden="true"></span><span class="sparks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>' + CREST_SVG : '')
                + (THEME_PIPS[theme] ? '<span class="pips" aria-hidden="true">' + '<i></i>'.repeat(THEME_PIPS[theme]) + '</span>' : '');

            const isOwner = !!msg.isMine;
            const actionsHtml = isOwner ? `<div class="card-owner-actions"><button type="button" class="edit-msg-btn" title="修改文字">✏️ 編輯</button><button type="button" class="del-msg-btn" title="刪除留言 (會扣除經驗喔)">🗑️ 刪除</button></div>` : '';
            const dateObj = new Date(msg.timestamp || nowMs()); const dateStr = `${dateObj.getMonth()+1}/${dateObj.getDate()} ${dateObj.getHours()}:${String(dateObj.getMinutes()).padStart(2,'0')}`;
            const receiverHtml = msg.receiver ? `<div class="card-to">To: ${escapeHtml(msg.receiver)}</div>` : '';
            const authorName = msg.author || '匿名';
            // 大頭貼：一律是「姓名縮寫色塊」（卓倫決定，舊留言也是）。預留：有上傳照片的人（author.avatar_url 有值）才顯示照片
            const avatarImgSrc = isAnonAuthor ? '' : safeImageUrl(msg.avatarUrl);
            const avatarHtml = avatarImgSrc ? `<img class="av" src="${escapeHtml(avatarImgSrc)}" alt="" decoding="async">`
                : `<i class="av" style="background:${isAnonAuthor ? '#5b5470' : avatarColorOf(msg.authorKey, authorName, msg.avatarColor)}" aria-hidden="true">${escapeHtml(isAnonAuthor ? '?' : (msg.initials || initialsOf(authorName)))}</i>`;
            const attachedImgUrl = safeImageUrl(msg.image);
            const attachedImgHtml = attachedImgUrl ? `<img src="${escapeHtml(attachedImgUrl)}" class="card-image" draggable="false" alt="附圖" decoding="async">` : '';

            const likers = Array.isArray(msg.likers) ? msg.likers : [];
            let likeIcon = HEART_SVG, likeWord = '讚', likeAction = '按讚', tooltipText = likeCount > 0 ? likers.join(', ') + ' 覺得很讚' : '給個讚！';
            if (IS_HALLOWEEN) { likeIcon = CANDY_SVG; likeWord = '給糖'; likeAction = '給糖'; tooltipText = likeCount > 0 ? likers.join(', ') + ' 給了糖果' : '給顆糖，為這份謝意加點甜 🍬'; }
            else if (IS_MID_AUTUMN) { likeIcon = '<span aria-hidden="true">🥮</span>'; likeWord = '送月餅'; likeAction = '送月餅'; tooltipText = likeCount > 0 ? likers.join(', ') + ' 送了月餅' : '送顆月餅！'; }
            const likedClass = hasLiked ? ('liked on' + (IS_HALLOWEEN ? ' hw-liked' : IS_MID_AUTUMN ? ' ma-liked' : '')) : '';
            const heartHtml = `<button type="button" class="like card-likes ${likedClass}" title="${escapeHtml(tooltipText)}" aria-label="${likeAction}，目前 ${likeCount}" aria-pressed="${hasLiked ? 'true' : 'false'}">${likeIcon}${likeCount > 0 ? likeCount : likeWord}</button>`;
            const sig = theme === 'theme-admin' ? '<em class="sig">系統管理員</em>' : ''; // 簽名特效只在至尊模板；其他主題的管理員卡只保留小徽章

            return `${fx}${badge}${receiverHtml}${attachedImgHtml}<p class="card-text">${escapeHtml(msg.text)}</p>`
                + `<div class="card-foot"><span class="author">${avatarHtml}<span>${escapeHtml(authorName)}</span>${sig}</span>${heartHtml}</div>`
                + `<div class="card-date">${dateStr}</div>${actionsHtml}<button type="button" class="card-close-btn" aria-label="關閉放大的卡片">✕</button>`;
        }

        // 卡片內容的指紋：資料或登入者沒變就不重畫，按讚只更新那一張卡
        function cardSignature(msg, maxLikes) {
            const lc = likeCountOf(msg);
            const img = msg.image ? String(msg.image) : '';
            return [msg.text, msg.receiver, msg.author, msg.anonymous, msg.avatarUrl, msg.theme, msg.authorLevel, msg.isAdminCard, msg.isMine,
                    msg.timestamp, img, lc, (msg.likers || []).join('\u0002'), msg.likedByMe,
                    (lc === maxLikes && maxLikes > 0), currentUser ? currentUser.uid : '', ownHiddenLevelFor(msg), IS_HALLOWEEN, IS_MID_AUTUMN].join('\u0001');
        }

        // 套用卡片外觀與內容（保留拖曳、放大、漂浮等狀態）
        function applyCardContent(card, msg, maxLikes) {
            const keep = ['floating', 'dragging', 'focused', 'card-enter', 'fx-paused'].filter(c => card.classList.contains(c));
            const isTopLiked = likeCountOf(msg) === maxLikes && maxLikes > 0;
            card.className = `message-card card ${themeClassOf(displayThemeOf(msg))}${isTopLiked ? ' top-liked' : ''}${isAdminMessage(msg) ? ' is-admin' : ''}${safeImageUrl(msg.image) ? ' has-image' : ''}`;
            card.style.boxShadow = '';
            keep.forEach(c => card.classList.add(c));
            card.setAttribute('data-id', msg.id);
            card.setAttribute('tabindex', '0');
            card.setAttribute('role', 'button');
            const text = String(msg.text || '');
            card.setAttribute('aria-label', `給 ${msg.receiver || '大家'} 的感謝卡，來自 ${msg.author || '匿名'}：${text}`);
            card.style.setProperty('--lines', [...text].length > 50 ? 4 : 99); // 50 字以內完整顯示
            card.innerHTML = generateCardHTML(msg, maxLikes);
            card._sig = cardSignature(msg, maxLikes);
            bindCardEvents(card, msg);
        }

        // 4.8：卡片本身的事件只綁一次，處理時讀 card._msg（最新資料）；按鈕在每次重畫內容後重新綁定
        function bindCardEvents(card, msg) {
            card._msg = msg;
            if (!card._shellBound) {
                card._shellBound = true;
                card.addEventListener('mousedown', (e) => handleDragStart(e, card));
                card.addEventListener('touchstart', (e) => handleDragStart(e, card), {passive: false});
                card.addEventListener('click', (e) => onCardClick(e, card));
                card.addEventListener('keydown', (e) => {
                    if (e.target !== card || (e.key !== 'Enter' && e.key !== ' ')) return;
                    e.preventDefault(); cardHasMoved = false; onCardClick(e, card);
                });
            }
            bindCardButtons(card);
        }

        function onCardClick(e, card) {
            const msg = card._msg;
            if (cardHasMoved) { cardHasMoved = false; return; }

            if (card.closest('#lmFocus')) return; // 清單的放大卡：只處理卡上的按鈕
            infectFromCard(msg);

            if (currentFocusedCard === card) { closeFocus(); return; }
            if (currentFocusedCard) currentFocusedCard.classList.remove('focused');
            playSound('click'); card.classList.add('focused'); focusOverlay.classList.add('active'); document.body.classList.add('card-open'); currentFocusedCard = card;
            armFocusedImage(card);
        }

        // ================= T068（卓倫 2026-10-28）：放大卡的照片／塗鴉跟著放大；點圖再開全螢幕檢視 =================
        // 牆面、清單上的縮圖大小不變（CSS 只改 .focused 裡的 .card-image）。圖片本身是送出時存的 800×500 webp（塗鴉是白底）。
        function armFocusedImage(card) {
            const img = card && card.querySelector('.card-image'); if (!img) return;
            img.tabIndex = 0; img.setAttribute('role', 'button'); img.setAttribute('aria-label', '看大圖');
        }
        function disarmImage(card) {
            const img = card && card.querySelector('.card-image'); if (!img) return;
            img.removeAttribute('tabindex'); img.removeAttribute('role'); img.removeAttribute('aria-label');
        }
        const imgViewer = document.getElementById('imgViewer');
        let imgViewerReturn = null;
        function openImgViewer(src, from) {
            if (!src) return;
            imgViewerReturn = from || document.activeElement;
            const vi = document.getElementById('imgViewerImg');
            vi.style.width = vi.style.height = '';
            vi.onload = fitImgViewer;
            vi.src = src;
            if (vi.complete && vi.naturalWidth) fitImgViewer();
            imgViewer.hidden = false; document.body.classList.add('img-viewing');
            playSound('click');
            document.getElementById('imgViewerClose').focus({ preventScroll: true });
        }
        // 照比例撐到畫面（最多放大 2 倍；原圖是 800×500，放太大會糊），白底剛好貼著圖片，透明背景的舊圖也看得清楚
        function fitImgViewer() {
            const vi = document.getElementById('imgViewerImg'); if (!vi.naturalWidth || imgViewer.hidden) return;
            const pad = 32, aw = Math.max(100, window.innerWidth - pad), ah = Math.max(100, window.innerHeight - pad);
            const k = Math.min(aw / vi.naturalWidth, ah / vi.naturalHeight, 2);
            vi.style.width = Math.round(vi.naturalWidth * k) + 'px'; vi.style.height = Math.round(vi.naturalHeight * k) + 'px';
        }
        window.addEventListener('resize', () => { if (!imgViewer.hidden) fitImgViewer(); });
        function closeImgViewer() {
            if (imgViewer.hidden) return false;
            imgViewer.hidden = true; document.body.classList.remove('img-viewing');
            document.getElementById('imgViewerImg').removeAttribute('src');
            if (imgViewerReturn && imgViewerReturn.isConnected) imgViewerReturn.focus({ preventScroll: true });
            imgViewerReturn = null;
            return true;
        }
        // 捕獲階段：比卡片自己的點擊（點放大卡＝關閉）先處理
        document.addEventListener('click', (e) => {
            const img = e.target.closest && e.target.closest('.card.focused .card-image');
            if (!img) return;
            e.preventDefault(); e.stopPropagation();
            openImgViewer(img.currentSrc || img.src, img);
        }, true);
        document.addEventListener('keydown', (e) => {
            if (!imgViewer.hidden) {
                if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeImgViewer(); }
                else if (e.key === 'Tab') { e.preventDefault(); document.getElementById('imgViewerClose').focus(); }   // 只有一顆按鈕：焦點留在檢視器裡
                return;
            }
            const img = e.target.closest && e.target.closest('.card.focused .card-image');
            if (img && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopImmediatePropagation(); openImgViewer(img.currentSrc || img.src, img); }
        }, true);
        imgViewer.addEventListener('click', (e) => { if (e.target.id !== 'imgViewerImg') closeImgViewer(); });   // 點背景或關閉鈕都會關

        // 👉 點開萬聖卡就變身（牆面點卡、清單點列都會呼叫）：由伺服器判斷要不要變身，回傳新的 me（just_infected 會播變身動畫）
        const hwOpenTried = new Set();
        function infectFromCard(msg) {
            if (IS_HALLOWEEN && currentUser && !isCurrentUserVampire && !isCurrentUserProgenitor && msg.theme === 'theme-halloween' && !hwOpenTried.has(msg.id)) {
                hwOpenTried.add(msg.id);
                api('POST', 'api/hw/open-card', { message_id: msg.id })
                    .then(res => { if (res && res.me) applyMe(res.me); })
                    .catch(() => { hwOpenTried.delete(msg.id); }); // 失敗就算了，下次點開再試；不打擾使用者
            }
        }

        function bindCardButtons(card) {
            const likeBtn = card.querySelector('.card-likes');
            if(likeBtn) {
                likeBtn.addEventListener('mousedown', (e) => e.stopPropagation());
                likeBtn.addEventListener('touchstart', (e) => e.stopPropagation(), {passive: true});
                likeBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleLikeFor(card._msg, e); });
            }

            // 4.8（設計 R9）：放大卡片右上角的關閉鈕
            const closeBtn = card.querySelector('.card-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('mousedown', (e) => e.stopPropagation());
                closeBtn.addEventListener('touchstart', (e) => e.stopPropagation(), {passive: true});
                closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeFocus(); });
            }

            const editBtn = card.querySelector('.edit-msg-btn');
            const delBtn = card.querySelector('.del-msg-btn');
            if (editBtn && delBtn) {
                editBtn.addEventListener('mousedown', (e) => e.stopPropagation());
                editBtn.addEventListener('touchstart', (e) => e.stopPropagation(), {passive: true});
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); playSound('click');
                    currentEditMsgId = card._msg.id; const ei = document.getElementById('editMsgInput'); ei.maxLength = (ME && ME.unlocks && Number(ME.unlocks.max_length)) || 1000; ei.value = card._msg.text || ''; document.getElementById('editOverlay').classList.add('active');
                });

                delBtn.addEventListener('mousedown', (e) => e.stopPropagation());
                delBtn.addEventListener('touchstart', (e) => e.stopPropagation(), {passive: true});
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); playSound('click');
                    if (confirm('確定要刪除這張感謝卡嗎？\n⚠️ 注意：刪除後將無法復原，且該留言將不列入經驗值計算喔！')) deleteMessage(card._msg.id);
                });
            }
        }

        // ================= 資料層：Firebase 版由 fb/backend.js 讀寫資料庫、即時監聽（介面和 5.5 的 api/... 相同） =================
        let messagesLoaded = false;
        let rawMessages = [];                 // 依時間新到舊排序；牆面、清單的程式碼都讀這個
        const messageById = new Map();
        let serverOffset = 0;                 // 伺服器時間 − 這台電腦的時間（毫秒）；判斷「今天」「新留言」「活動期間」一律用 nowMs()
        function nowMs() { return Date.now() + serverOffset; }
        function taipeiDay(ms) { return Math.floor((ms + 8 * 3600000) / 86400000); }
        // 牆面每月 1 號清空（卓倫 2026-10-28）：月份一律用台灣時間（UTC+8，沒有夏令時間）計算，不看使用者電腦的時區
        const TPE_OFFSET_MS = 8 * 3600000;
        function tpeMonthStart(ms) { const d = new Date(ms + TPE_OFFSET_MS); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - TPE_OFFSET_MS; }
        function tpeNextMonthStart(ms) { const d = new Date(ms + TPE_OFFSET_MS); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - TPE_OFFSET_MS; }
        function tpeMonthKey(ms) { const d = new Date(ms + TPE_OFFSET_MS); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); }
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
        function dataUrlBytes(u) { const s = String(u); return Math.floor((s.length - s.indexOf(',') - 1) * 0.75); }
        function newRequestId() {
            try { if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID(); } catch (e) {}
            return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
        }

        // ---- API ----
        class ApiError extends Error {
            constructor(status, code, message, retryAfter) { super(message); this.status = status; this.code = code; this.retryAfter = retryAfter == null ? null : retryAfter; }
        }
        const FRIENDLY_ERRORS = {
            0: '網路好像斷了，請檢查網路後再試一次。', 400: '送出的內容格式不太對，請檢查後再試一次。', 401: '登入已過期，請重新整理頁面登入。',
            403: '你沒有權限做這個操作。', 404: '找不到這筆資料，可能已經被刪除了。', 409: '資料剛剛有變動，請重新整理頁面後再試一次。',
            413: '檔案太大了，請換一張小一點的圖片。', 429: '操作太頻繁了，請稍等一下再試。', 503: '系統正在啟動或暫時存不進去，請稍後再試。',
        };
        // Firebase 版：api() 的路徑和回應形狀和 5.5 相同，實際由 fb/backend.js 讀寫資料庫
        async function api(method, path, body) {
            if (!BACKEND) throw new ApiError(503, 'STARTING', FRIENDLY_ERRORS[503]);
            try { return await BACKEND.call(method, path, body); }
            catch (e) {
                if (e instanceof ApiError) throw e;
                const st = (e && typeof e.status === 'number') ? e.status : 503;
                throw new ApiError(st, (e && e.code) || ('HTTP_' + st), (e && e.message && e.status != null) ? e.message : (FRIENDLY_ERRORS[st] || '操作沒有成功，請稍後再試一次。'), e && e.retryAfter);
            }
        }
        // 寫入：503（啟動中、存不進去）和斷線時用同一個 request_id 自動重試（伺服器同一個 request_id 只會處理一次），最多 3 次；不用 alert 擋住畫面
        async function apiWrite(path, body) {
            body = Object.assign({}, body); body.request_id = body.request_id || newRequestId();
            for (let attempt = 0; ; attempt++) {
                try { return await api('POST', path, body); }
                catch (e) {
                    if (!((e.status === 503 || e.status === 0) && attempt < 3)) throw e;
                    showToast(e.status === 503 ? '⏳ 系統正在存檔中，自動重試…' : '📡 網路不穩，自動重試…', 3000);
                    await sleep(Math.min(8000, e.retryAfter ? e.retryAfter * 1000 : 1500 * (attempt + 1)));
                }
            }
        }
        // 沒登入（401）或不在名單（403）：顯示說明頁，不顯示壞掉的牆
        function showGate(status) {
            const forbidden = status === 403;
            const name = (WALL_CONFIG.adminName || '').trim();
            const url = String(WALL_CONFIG.adminContactUrl || '').trim();
            document.getElementById('gateIcon').textContent = '🔒';
            document.getElementById('gateTitle').textContent = forbidden ? '你還不在感謝牆的名單上' : '登入已經過期了';
            document.getElementById('gateText').textContent = forbidden
                ? `這個網站只開放公司同事使用，而你的帳號目前不在通訊錄裡。請聯絡感謝牆管理員${name ? `（${name}）` : ''}確認通訊錄。`
                : '按下面的按鈕重新登入，就可以繼續囉。';
            const contact = document.getElementById('gateContact'), btn = document.getElementById('gateBtn');
            const okUrl = /^(mailto:|https:\/\/|msteams:)/i.test(url);
            contact.hidden = !(forbidden && okUrl);
            if (okUrl) contact.href = url; else contact.removeAttribute('href');
            // 403：主按鈕是「聯絡管理員」（有設定連結才有），重新整理降為次要連結；401：重新登入是主按鈕
            btn.textContent = forbidden ? '已經加入名單了？重新整理' : '重新登入';
            btn.className = forbidden ? 'gate-link' : 'action-btn primary';
            document.querySelectorAll('body > *:not(#gateOverlay):not(script)').forEach(el => { el.inert = true; });   // 背景內容不能用鍵盤操作
            document.getElementById('gateOverlay').hidden = false;
            (contact.hidden ? btn : contact).focus({ preventScroll: true });
        }
        document.getElementById('gateBtn').addEventListener('click', () => { window.location.reload(); });

        // ---- 偏好（看過新手引導、萬聖故事、慶祝到的等級）：伺服器記一份（換電腦也記得），本機也留一份當快取 ----
        function prefLocalKey(k) { return `wall_pref_${currentUser ? currentUser.uid : 'x'}_${k}`; }
        function prefGet(k) {
            const v = ME && ME.prefs ? ME.prefs[k] : null;
            if (v) return String(v);
            try { return localStorage.getItem(prefLocalKey(k)) || ''; } catch (e) { return ''; }
        }
        function prefSet(k, v) {
            v = String(v);
            if (ME) { ME.prefs = ME.prefs || {}; ME.prefs[k] = v; }
            try { localStorage.setItem(prefLocalKey(k), v); } catch (e) {}
            api('POST', 'api/me/prefs', { key: k, value: v }).catch(() => {}); // 記不起來也不影響使用
        }

        // ---- 留言：伺服器的格式 → 4.8 程式碼原本用的留言物件 ----
        function adaptMessage(d) {
            const a = d.author || {};
            return {
                id: d.id, text: d.text || '', receiver: d.receiver || '', theme: d.theme, image: d.image_url || null,
                timestamp: Number(d.created_at) || 0, author: a.name || '匿名', anonymous: !!a.anonymous, avatarUrl: a.avatar_url || null, authorKey: a.user_id || '', avatarColor: a.avatar_color, initials: a.initials || '',
                authorLevel: Number(d.author_level) || 0, likeCount: Number(d.like_count) || 0, likers: Array.isArray(d.likers) ? d.likers.slice() : [],
                likedByMe: !!d.liked_by_me, isMine: !!d.is_mine, toMe: !!d.to_me, isAdminCard: !!d.is_admin_card, edited: !!d.edited,
            };
        }
        function upsertMessage(d) { if (d && d.id) messageById.set(d.id, adaptMessage(d)); }
        function resortMessages() { rawMessages = Array.from(messageById.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); }
        function refreshNow() { resortMessages(); refreshWall(); refreshListView(); scheduleLeaderboard(); }
        let refreshTimer = null;
        function scheduleRefresh() { if (refreshTimer) return; refreshTimer = setTimeout(() => { refreshTimer = null; refreshNow(); }, 30); } // 一連串推播合併成一次更新

        // ---- 我的狀態 ----
        let meStamp = 0, meDay = 0;
        function renderMyAvatar() {
            const name = ME.name || '';
            userAvatar.textContent = ME.initials || initialsOf(name);
            userAvatar.style.background = avatarColorOf(ME.user_id, name, ME.avatar_color);
        }
        function applyMe(me, opts) {
            if (!me) return;
            ME = me; meStamp++; meDay = taipeiDay(nowMs());
            currentUser = { uid: me.user_id, displayName: me.name };
            userLevel = Number(me.level) || 1; userLifetimeMessageCount = Number(me.exp) || 0;
            renderMyAvatar();
            inputPanel.style.display = 'block';
            if (!(opts && opts.silent)) updateFestivalUI();
            const ji = me.hw && me.hw.just_infected;
            if (ji && IS_HALLOWEEN) {
                if (ji.cause === 'tagged') triggerInfection(INFECT_TEXTS.tagged, ji.reveal || me.hw.reveal);
                else triggerInfection((INFECT_TEXTS[ji.cause] || INFECT_TEXTS.opened_card) + INFECT_ROSTER_LINE);
            } else if (!(opts && opts.silent) && messagesLoaded) setTimeout(maybeShowReveal, 500);   // 等一下：同一批推播可能還有帶動畫的 me.changed（先播動畫再揭曉）
        }
        // 編輯、刪除後等級和額度會變：伺服器通常會推 me.changed；1.5 秒內沒收到就主動重抓一次
        function refreshMeSoon() {
            const st = meStamp;
            setTimeout(async () => { if (meStamp !== st || !messagesLoaded) return; try { applyBootstrap(await api('GET', 'api/bootstrap')); } catch (e) {} }, 1500);
        }

        // ---- 開頁資料 ----
        let streamV = 0; // 目前處理到的事件版本號
        function applyBootstrap(d) {
            const first = !messagesLoaded;
            if (d.server) { serverOffset = (Number(d.server.now) || Date.now()) - Date.now(); streamV = Number(d.server.version) || 0; }
            applyEventState(d.events);
            hwInfectedLoaded = true;
            NR.forbidden = false;
            messageById.clear(); (d.messages || []).forEach(upsertMessage); resortMessages();
            applySettings(d.settings);
            applyMe(d.me, { silent: true });
            messagesLoaded = true;
            wallLoadingEl.classList.remove('error'); document.getElementById('wallLoadingRetry').hidden = true;
            if (first) hideWallLoading();
            updateFestivalUI();
            if (first) {
                restoreDraft();
                if (!prefGet('onboarding_seen')) document.getElementById('onboardingOverlay').classList.add('active');
                bootEventKey = eventKeyByTime(); scheduleEventBoundaryTimers();
                if (IS_HALLOWEEN) setTimeout(showHalloweenStory, 1500);
                setTimeout(maybeShowReveal, 600);
            } else if (NR.open) fetchRoster(false);
            pickAutoTheme(getValidMessages());
            if (first) { mbShowShell(); fetchMonthBoard(); scheduleMonthRollover(); } else scheduleMonthBoard(800);   // 面板先佔好位置，牆面再發牌
            refreshWall(); refreshListView(); scheduleLeaderboard();
        }
        async function startApp() {
            // 先登入、確認在通訊錄名單上（登入卡、不在名單上的畫面都由 fb/session.js 處理），再開始讀資料
            SESSION = await requireMember({ adminName: WALL_CONFIG.adminName, contactUrl: WALL_CONFIG.adminContactUrl });
            BACKEND = new WallBackend(SESSION);
            if (USE_EMULATOR) window.__wallBackend = BACKEND;      // 只有本機模擬器測試用
            for (let attempt = 1; ; attempt++) {
                try { await BACKEND.start(); applyBootstrap(await api('GET', 'api/bootstrap')); startStream(); return; }
                catch (e) {
                    if (e.status === 401) return;                      // showGate 已經顯示
                    if (e.status === 403) return showGate(403);
                    if (attempt >= 5) showWallLoadingError();          // 還連不上：顯示失敗提示，但繼續在背景重試
                    else setWallLoadingText(e.status === 503 ? '系統正在啟動中，請稍候…' : '連線有點慢，再等一下下…');
                    await sleep(Math.min(10000, 1500 * attempt));
                }
            }
        }

        // ---- 即時更新：Firebase 版改用資料庫的監聽（fb/backend.js 把資料變動轉成和 5.5 SSE 相同的事件）----
        let lastEventAt = Date.now();
        const STREAM_EVENTS = ['message.created', 'message.updated', 'message.deleted', 'reaction.changed', 'hw.changed', 'hw.roster.changed', 'settings.changed', 'me.changed', 'resync', 'ping'];
        function applyServerEvent(type, d) {
            d = d || {};
            switch (type) {
                case 'message.created': case 'message.updated':
                    if (d.message) { if (type === 'message.created') mbNoteChange(Number(d.message.created_at)); upsertMessage(d.message); scheduleRefresh(); } break;
                case 'message.deleted': {
                    const old = messageById.get(d.id);
                    if (old) mbNoteChange(old.timestamp);
                    if (messageById.delete(d.id)) scheduleRefresh(); break; }
                case 'reaction.changed': {
                    if (likeState.has(d.id)) break; // 我自己正在按讚：等我的請求回來再以它為準，避免畫面跳來跳去
                    const m = messageById.get(d.id);
                    if (m) { m.likeCount = Number(d.like_count) || 0; m.likers = Array.isArray(d.likers) ? d.likers.slice() : []; m.likedByMe = !!d.liked_by_me; scheduleRefresh(); }
                    break; }
                case 'hw.changed':
                    hwChangedStamp++;
                    if (hwInfo) { hwInfo.infected_count = d.infected_count; if (d.stage) hwInfo.stage = d.stage; updateFestivalUI(); } break;
                case 'hw.roster.changed':          // 有人變身：名冊少了人（只送給看得到名冊的人）
                    rosterChangedStamp++;
                    if (NR.built && d.remaining != null) { NR.remaining = Math.max(0, Number(d.remaining) || 0); updateEntryCount(); if (NR.open) scheduleRosterRefetch(500); }
                    break;
                case 'settings.changed': applySettings(d.settings); break;
                case 'me.changed': applyMe(d.me); break;
                case 'resync': api('GET', 'api/bootstrap').then(applyBootstrap).catch(() => {}); break;
                default: break;
            }
        }
        // Firebase 版：即時更新來自資料庫的監聽（斷線時 Firebase 會自己重連並補上變動），不需要 SSE 和輪詢
        let streamOff = null;
        function closeStream() { if (streamOff) { streamOff(); streamOff = null; } }
        function openStream() {
            closeStream();
            streamOff = BACKEND.on((type, data) => { lastEventAt = Date.now(); if (STREAM_EVENTS.includes(type)) applyServerEvent(type, data); });
        }
        function startStream() { openStream(); }

        // ---- 按讚（樂觀更新：先改畫面，再通知伺服器；失敗就改回伺服器確認過的狀態） ----
        const likeState = new Map(); // 留言 id → { confirmed: 伺服器確認過的狀態, desired: 使用者目前想要的, inflight }
        function toggleLikeFor(msg, e) {
            if (!currentUser || !ME) return showToast('資料還在載入，請稍候再試一次。');
            if (!canLike()) { playSound('click'); return showToast(IS_HALLOWEEN ? '🍬 先留下至少一篇感謝，就能解鎖給糖囉！快寫一張卡謝謝同事吧！' : '👍 先留下至少一篇感謝，就能解鎖按讚囉！快寫一張卡謝謝同事吧！'); }
            const hasLiked = msg.likedByMe; playSound('click');

            if (e && (IS_HALLOWEEN || IS_MID_AUTUMN) && !hasLiked) {
                const clickX = e.clientX ? e.clientX / window.innerWidth : 0.5; const clickY = e.clientY ? e.clientY / window.innerHeight : 0.8;
                fireConfetti({ particleCount: 40, spread: 60, origin: { y: clickY, x: clickX }, colors: IS_HALLOWEEN ? ['#ff8c00', '#8a2be2', '#ff0080'] : ['#FFD700', '#FFA500', '#FF8C00'] });
            }
            let st = likeState.get(msg.id);
            if (!st) { st = { confirmed: { likeCount: msg.likeCount, likers: msg.likers.slice(), likedByMe: msg.likedByMe }, desired: msg.likedByMe, inflight: false }; likeState.set(msg.id, st); }
            const want = !hasLiked;
            st.desired = want;
            msg.likedByMe = want;
            if (want) { msg.likeCount++; msg.likers = [...msg.likers, ME.name]; }
            else { msg.likeCount = Math.max(0, msg.likeCount - 1); const i = msg.likers.indexOf(ME.name); if (i >= 0) { msg.likers = msg.likers.slice(); msg.likers.splice(i, 1); } }
            refreshNow();
            pumpLike(msg.id);
        }
        async function pumpLike(id) {
            const st = likeState.get(id); if (!st || st.inflight) return;
            st.inflight = true;
            let failed = null;
            try {
                while (st.desired !== st.confirmed.likedByMe) {
                    const want = st.desired;
                    const res = await apiWrite(`api/messages/${id}/like`, { liked: want });
                    st.confirmed = { likeCount: Number(res.like_count) || 0, likers: Array.isArray(res.likers) ? res.likers.slice() : [], likedByMe: !!res.liked_by_me };
                }
            } catch (err) { failed = err; }
            likeState.delete(id);
            const m = messageById.get(id);
            if (m) { Object.assign(m, { likeCount: st.confirmed.likeCount, likers: st.confirmed.likers, likedByMe: st.confirmed.likedByMe }); refreshNow(); }
            if (failed) showToast('⚠️ ' + (failed.status === 403 ? failed.message : '操作沒有成功，請檢查網路後再試一次。'), 5000);
        }

        async function deleteMessage(id) {
            closeFocus();
            try {
                const res = await apiWrite(`api/messages/${id}/delete`, {});
                const old = messageById.get(id); if (old) mbNoteChange(old.timestamp);
                messageById.delete(id);
                if (res && res.me) applyMe(res.me);
                refreshNow(); refreshMeSoon();
            } catch (err) { showToast('⚠️ ' + err.message, 6000); }
        }

        // ---- 英雄榜：打開時向伺服器要（伺服器依規則計算，前台只負責畫出來） ----
        let lbSeq = 0, lbTimer = null;
        function scheduleLeaderboard() {
            if (!leaderboardOverlay.classList.contains('active')) return;
            clearTimeout(lbTimer); lbTimer = setTimeout(renderLeaderboard, 1500);
        }
        async function renderLeaderboard() {
            const seq = ++lbSeq;
            const paintNote = (elementId, html) => { const ul = document.getElementById(elementId); ul.innerHTML = `<li style="justify-content:center; color:#6b6b76; font-weight:normal; text-align:center;">${html}</li>`; };
            const paint = (listArr, elementId) => {
                const ul = document.getElementById(elementId); ul.innerHTML = '';
                if(listArr.length === 0) { paintNote(elementId, IS_HALLOWEEN ? '萬聖期間從 10/18 起重新計算，具名送卡就會上榜' : '目前還沒有資料喔，送出第一張感謝就會上榜'); return; }

                const maxCount = listArr[0][1];
                listArr.forEach((item, idx) => {
                    const isTop = (item[1] === maxCount && maxCount > 1); // 4.8（設計 R12）：大家都只有 1 次時不顯示皇冠
                    const li = document.createElement('li');
                    if(isTop) li.className = 'top-rank';
                    li.innerHTML = `<span>${isTop ? '👑 ' : ''}${escapeHtml(item[0])}</span> <span class="count">${Number(item[1]) || 0} 張</span>`;
                    ul.appendChild(li);
                });
            };
            if (!document.getElementById('topSendersList').children.length) { paintNote('topSendersList', '載入中…'); paintNote('topReceiversList', '載入中…'); }
            try {
                const d = await api('GET', 'api/leaderboard');
                if (seq !== lbSeq) return;
                const top10 = (arr) => (Array.isArray(arr) ? arr : []).filter(x => Array.isArray(x)).slice().sort((a, b) => b[1] - a[1]).slice(0, 10);
                paint(top10(d.senders), 'topSendersList'); paint(top10(d.receivers), 'topReceiversList');
            } catch (e) {
                if (seq !== lbSeq) return;
                paintNote('topSendersList', '英雄榜暫時讀不到，請稍後再試'); paintNote('topReceiversList', '英雄榜暫時讀不到，請稍後再試');
            }
        }

        // ================= 上月排行榜（卓倫 2026-10-28）：牆面每月 1 號清空，上個月的感謝改用排行榜呈現 =================
        // 伺服器計算（GET api/leaderboard/monthly）：送出最多／收到最多，競賽排名（1, 2, 2, 4）、只列名次 <= 5、最多 7 列，
        // 整組放不下的同分組由伺服器回彙整（*_more）。這裡只負責畫出來。外觀：美術總監設計稿 v1（design/月排行榜/）。
        const mboardEl = document.getElementById('mboard');
        const MB = { data: null, state: 'loading', seq: 0, timer: null, rolloverTimer: null, month: '', shown: false, lastRect: null, pop: false };
        const MB_ICON = {
            trophy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 6h3a3 3 0 0 1-3 4M7 6H4a3 3 0 0 0 3 4"/></svg>',
            send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>',
            heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-4.4-9-9c-1.4-3.2.6-7 4.2-7 2 0 3.4 1.1 4.8 2.8C13.4 6.1 14.8 5 16.8 5c3.6 0 5.6 3.8 4.2 7-2 4.6-9 9-9 9z"/></svg>',
            chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
        };
        // 榜名（卓倫定案 2026-10-28）。全部不顯示則數（伺服器也不回）
        const MB_TABS = [
            { key: 'senders', label: '送出最多感謝', icon: MB_ICON.send, empty: '上個月還沒有具名送出的感謝。' },
            { key: 'receivers', label: '收到最多感謝', icon: MB_ICON.heart, empty: '上個月還沒有人收到感謝。' },
        ];
        const mbMobile = () => window.innerWidth <= 768;
        const MB_OPTOUT_KEY = 'lb_hidden';   // 「不在感謝榜上顯示我」：個人偏好（伺服器排除後名次由下一位遞補）
        // 面板顯示的月份＝上個月（台灣時間）；資料還沒到時先用本機換算的伺服器時間，標題才不會閃
        function mbBoardMonth() { return (MB.data && MB.data.month) || tpeMonthKey(tpeMonthStart(nowMs()) - 1); }
        function mbYM(key) { const m = /^(\d{4})-(\d{2})$/.exec(key || ''); return m ? { y: Number(m[1]), m: Number(m[2]) } : { y: 0, m: 0 }; }
        function mbDisplayName(n) { const s = String(n || ''); return s.replace(/\s*[(（][^)）]*[)）]\s*$/, '') || s; }   // 結尾的部門括號不顯示（完整姓名在 title 和讀屏）
        function mbRows(rows) {
            const arr = (Array.isArray(rows) ? rows : []).filter(r => r && typeof r.name === 'string')
                .map(r => ({ name: r.name, rank: Number(r.rank) || 1, color: r.avatar_color }));
            return arr.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'zh-Hant'));   // 同名次依姓名排序，不暗示先後
        }
        function mbHasRows(key) { const d = MB.data || {}; return mbRows(d[key]).length > 0 || !!(d[key + '_more'] && Number(d[key + '_more'].people) > 0); }
        // ===== 上月感謝榜 v2（美術總監設計稿 design/月排行榜/v2/）：平常是小條（兩榜各自的第 1 名），點開看前 5 名浮層 =====
        // 浮層蓋在牆上（桌機 position:absolute），不改變面板外框，所以牆面卡片不會被推動
        function mbAv(r) { return `<span class="mb-av" style="background:${avatarColorOf(r.name, r.name, r.color)}" aria-hidden="true">${escapeHtml(initialsOf(r.name))}</span>`; }
        // 小條的一列：第 1 名（並列最多疊 3 個頭像；2 位寫兩個名字、3 位以上寫「等 N 位」）
        function mbStarHtml(tab) {
            const d = MB.data || {}, firsts = mbRows(d[tab.key]).filter(r => r.rank === 1), more = d[tab.key + '_more'];
            const extra = (!firsts.length && more && Number(more.rank) === 1) ? Number(more.people) || 0 : 0;   // 第 1 名整組超過 7 人，伺服器只回彙整
            const label = `<span class="mb-star-label" aria-hidden="true">${tab.icon}${tab.label}</span>`;
            if (!firsts.length && !extra) return `<li class="mb-star is-empty" aria-label="${tab.label}：${tab.empty}">${label}<span class="mb-star-who" aria-hidden="true"><span class="mb-empty">上個月從缺</span></span></li>`;
            const names = firsts.map(r => mbDisplayName(r.name)), full = firsts.map(r => r.name).join('、');
            const shown = extra ? `${extra} 位同事並列` : firsts.length === 1 ? names[0] : firsts.length === 2 ? names.join('、') : `${names[0]} 等 ${firsts.length} 位`;
            return `<li class="mb-star" aria-label="${tab.label}${firsts.length > 1 || extra ? '，並列第 1 名' : ''}：${escapeHtml(full || shown)}">${label}`
                + `<span class="mb-star-who" aria-hidden="true"><span class="mb-stack">${firsts.slice(0, 3).map(mbAv).join('')}</span><span class="mb-name" title="${escapeHtml(full)}">${escapeHtml(shown)}</span></span></li>`;
        }
        // 浮層的一欄：前 5 名（伺服器已經截好：名次 <= 5、最多 7 列、放不下的同分組回 *_more）；名次圓章有數字，不只靠顏色
        function mbTopHtml(tab) {
            const d = MB.data || {}, rows = mbRows(d[tab.key]), more = d[tab.key + '_more'];
            const moreOk = more && Number(more.people) > 0;
            const head = `<h4 class="mb-col-title" id="mbColT-${tab.key}">${tab.icon}${tab.label}</h4>`;
            if (!rows.length && !moreOk) return `<section class="mb-col" aria-labelledby="mbColT-${tab.key}">${head}<p class="mb-empty">${tab.empty}</p></section>`;
            const tied = (k) => rows.filter(x => x.rank === k).length > 1;
            return `<section class="mb-col" aria-labelledby="mbColT-${tab.key}">${head}<ol class="mb-list">${rows.map(r => `<li class="mb-row" data-rank="${r.rank}" aria-label="${tied(r.rank) ? '並列' : ''}第 ${r.rank} 名，${escapeHtml(r.name)}">`
                + `<span class="mb-rank" aria-hidden="true">${r.rank}</span>${mbAv(r)}<span class="mb-name" title="${escapeHtml(r.name)}" aria-hidden="true">${escapeHtml(mbDisplayName(r.name))}</span></li>`).join('')}</ol>`
                + (moreOk ? `<p class="mb-more">${rows.length ? '還有 ' : ''}${Number(more.people)} 位同事並列第 ${Number(more.rank) || 1} 名</p>` : '') + `</section>`;
        }
        const MB_OPTOUT_HINT = { on: '已開啟：上月感謝榜和英雄榜都不會出現你的名字。<span class="nw">你的卡片照常顯示。</span>', off: '開啟後，上月感謝榜和英雄榜都不會出現你的名字，名次由下一位遞補。<span class="nw">你的卡片照常顯示。</span>' };   // 固定字串（不含使用者資料）
        function mbOptoutOn() { return prefGet(MB_OPTOUT_KEY) === '1'; }
        function mbOptoutHtml(id) {
            const on = mbOptoutOn();
            return `<div class="mb-optout"><label class="mb-switch"><input type="checkbox" role="switch" id="${id}" data-act="optout"${on ? ' checked' : ''} aria-describedby="${id}-hint">`
                + `<span class="mb-switch-track" aria-hidden="true"></span><span class="mb-switch-text">不在感謝榜上顯示我</span></label>`
                + `<p class="mb-optout-hint" id="${id}-hint">${on ? MB_OPTOUT_HINT.on : MB_OPTOUT_HINT.off}</p></div>`;
        }
        // 英雄榜彈窗底部的同一個開關（index.html #lbOptout）：狀態跟著偏好
        function syncLbOptout() {
            const cb = document.getElementById('lbOptout'); if (!cb) return;
            const on = mbOptoutOn(); cb.checked = on;
            const hint = document.getElementById('lbOptout-hint'); if (hint) hint.innerHTML = on ? MB_OPTOUT_HINT.on : MB_OPTOUT_HINT.off;
        }
        // 切換開關（兩處共用）：先等伺服器存好，再重抓月榜、英雄榜（開著的話），名次才會正確遞補
        let mbOptoutSeq = 0;
        async function setBoardOptout(on) {
            const seq = ++mbOptoutSeq, v = on ? '1' : '0', before = prefGet(MB_OPTOUT_KEY);
            if (ME) { ME.prefs = ME.prefs || {}; ME.prefs[MB_OPTOUT_KEY] = v; }
            try { localStorage.setItem(prefLocalKey(MB_OPTOUT_KEY), v); } catch (e) {}
            mbRender(); syncLbOptout();
            try {
                await api('POST', 'api/me/prefs', { key: MB_OPTOUT_KEY, value: v });
                if (seq !== mbOptoutSeq) return;
                showToast(on ? '已設定：上月感謝榜和英雄榜不會顯示你的名字' : '已恢復：你的名字會出現在感謝榜和英雄榜');
                fetchMonthBoard();
                if (leaderboardOverlay.classList.contains('active')) renderLeaderboard();
            } catch (err) {
                if (seq !== mbOptoutSeq) return;
                if (ME && ME.prefs) ME.prefs[MB_OPTOUT_KEY] = before;   // 沒存起來：開關退回原狀，並說明
                try { localStorage.setItem(prefLocalKey(MB_OPTOUT_KEY), before); } catch (e) {}
                mbRender(); syncLbOptout();
                showToast('⚠️ 設定沒有存起來，請檢查網路後再試一次。', 5000);
            }
        }
        function mbRender() {
            if (!mboardEl || !MB.shown) return;
            const ym = mbYM(mbBoardMonth()), title = `${ym.m} 月感謝榜`;
            const loading = MB.state === 'loading' && !MB.data, failed = MB.state === 'error' && !MB.data;
            const none = !loading && !failed && !mbHasRows('senders') && !mbHasRows('receivers');
            const popOpen = !!MB.pop && !loading && !failed && !none;
            const focusIn = mboardEl.contains(document.activeElement) ? (document.activeElement.id || '') : '';
            mboardEl.classList.add('mb-v2');
            mboardEl.classList.toggle('is-pop', popOpen);
            mboardEl.setAttribute('aria-busy', loading ? 'true' : 'false');
            let body;
            if (loading) body = `<ul class="mb-stars" aria-hidden="true">${MB_TABS.map(t => `<li class="mb-star is-skel"><span class="mb-star-label">${t.icon}${t.label}</span><span class="mb-skel"><i></i><i></i></span></li>`).join('')}</ul><span class="nr-sr">排行榜載入中</span>`;
            else if (failed) body = '<p class="mb-note">排行榜暫時讀不到<button type="button" class="mb-link" data-act="retry">重新整理</button></p>';
            else if (none) { const next = mbYM(tpeMonthKey(tpeNextMonthStart(nowMs()))); body = `<p class="mb-note">上個月還沒有人上榜。這個月的感謝，<b>${next.m} 月 1 號</b>會在這裡表揚。</p>`; }
            else body = `<ul class="mb-stars">${MB_TABS.map(mbStarHtml).join('')}</ul>`
                + `<div class="mb-pop" id="mbPop" role="region" aria-label="${title}前 5 名"${popOpen ? '' : ' hidden'}>`
                + `<p class="mb-pop-sub">上個月最常送出與收到感謝的同事</p><div class="mb-cols">${MB_TABS.map(mbTopHtml).join('')}</div>`
                + mbOptoutHtml('mbOptout')
                + `<div class="mb-foot"><span>每月 1 號更新・送出榜只計具名卡・和考核無關</span><button type="button" class="mb-link" data-act="list">看全部感謝</button></div></div>`;
            const toggle = (loading || failed || none) ? ''
                : `<button type="button" class="mb-toggle" id="mbToggle" data-act="pop" aria-expanded="${popOpen}" aria-controls="mbPop" aria-label="${popOpen ? '收起' : '查看'}${title}前 5 名"><span class="mb-toggle-text" aria-hidden="true">前 5 名</span>${MB_ICON.chev}</button>`;
            mboardEl.innerHTML = `<div class="mb-head"><h2 class="mb-title" id="mbTitle" aria-label="${ym.y} 年 ${ym.m} 月感謝榜">${MB_ICON.trophy}${title}</h2>${toggle}</div>`
                + `<div class="mb-body" id="mbBody">${body}</div>`;
            if (focusIn) { const f = document.getElementById(focusIn); if (f) f.focus({ preventScroll: true }); }
            // 每月第一次看到（資料已到）：柔和發亮一次，2 秒；減少動態時 CSS 不播
            if (MB.data && !loading) {
                const k = 'mboardSeen:' + mbBoardMonth(); let seen = null; try { seen = localStorage.getItem(k); } catch (e) {}
                if (!seen) { try { localStorage.setItem(k, '1'); } catch (e) {} mboardEl.classList.remove('is-fresh'); void mboardEl.offsetWidth; mboardEl.classList.add('is-fresh'); }
            }
            mbSyncWall();   // 小條大小固定；浮層不算在面板外框裡，所以這裡通常什麼都不用搬
        }
        function mbSetPop(open, focus) {
            if (!!MB.pop === open) return;
            MB.pop = open; mbRender();
            if (focus) { const t = document.getElementById('mbToggle'); if (t) t.focus({ preventScroll: true }); }
        }
        if (mboardEl) {
            mboardEl.addEventListener('animationend', (e) => { if (e.animationName === 'mbGlow') mboardEl.classList.remove('is-fresh'); });
            mboardEl.addEventListener('change', (e) => { if (e.target.matches('[data-act="optout"]')) setBoardOptout(e.target.checked); });
            mboardEl.addEventListener('click', (e) => {
                const act = e.target.closest('[data-act]');
                if (act && act.dataset.act === 'retry') { MB.state = 'loading'; mbRender(); fetchMonthBoard(); return; }
                if (act && act.dataset.act === 'list') { playSound('click'); MB.pop = false; setViewMode('list'); return; }
                if (e.target.closest('.mb-pop')) return;          // 浮層裡面的點擊（開關、空白處）不關閉
                // 小條整塊都可以點（標題列、兩列第 1 名）；鍵盤用「前 5 名」按鈕
                if ((act && act.dataset.act === 'pop') || e.target.closest('.mb-head') || e.target.closest('.mb-stars')) {
                    if (!mboardEl.querySelector('.mb-pop')) return;
                    playSound('click'); mbSetPop(!MB.pop, true);
                }
            });
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && MB.pop) mbSetPop(false, true); });                     // Esc 關閉，焦點回到按鈕
            document.addEventListener('pointerdown', (e) => { if (MB.pop && !mboardEl.contains(e.target)) mbSetPop(false, false); }, true); // 點外面關閉
            let mbW = window.innerWidth;
            window.addEventListener('resize', () => { if (window.innerWidth !== mbW) { mbW = window.innerWidth; mbRender(); } });
        }
        { const lbCb = document.getElementById('lbOptout'); if (lbCb) lbCb.addEventListener('change', () => setBoardOptout(lbCb.checked)); }
        // 第一次：先畫出骨架（和正式名單同高），牆面才會在發牌前就避開面板
        function mbShowShell() { if (!mboardEl || MB.shown) return; MB.shown = true; mboardEl.hidden = false; mbRender(); }
        function scheduleMonthBoard(delay) { clearTimeout(MB.timer); MB.timer = setTimeout(fetchMonthBoard, delay == null ? 1500 : delay); }
        // 上個月的留言被刪除或復原時才需要重抓（本月的新留言不影響上月排行榜）
        function mbNoteChange(ts) {
            const cur = tpeMonthStart(nowMs());
            if (ts && ts < cur && ts >= tpeMonthStart(cur - 1)) scheduleMonthBoard(1500);
        }
        async function fetchMonthBoard() {
            if (!mboardEl) return;
            const seq = ++MB.seq;
            try {
                const d = await api('GET', 'api/leaderboard/monthly');
                if (seq !== MB.seq) return;
                MB.data = d; MB.state = 'ready'; MB.month = tpeMonthKey(nowMs());
            } catch (e) {
                if (seq !== MB.seq || e.status === 401) return;
                if (!MB.data) MB.state = 'error';               // 已經有資料：保留舊的，不打擾
            }
            mbRender();
        }
        // 桌機：面板是牆面的保護區（scRegion 的障礙物）。面板變大（展開、名單比骨架長）時，只把壓到面板的卡重新找位置；
        // 變小（收合、名單比較短）時只更新保護區，空出來的位置等輪播自然補上。不整面重排
        function mbSyncWall() {
            const r = mboardEl.getBoundingClientRect(), rect = r.width ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null;
            const prev = MB.lastRect; MB.lastRect = rect;
            if (!rect || (prev && prev.l === rect.l && prev.t === rect.t && prev.r === rect.r && prev.b === rect.b)) return;
            meTrimSlots();
            const R = wallState.R;
            if (!R || !wallState.rendered || !wallState.layout || wallState.layout.isMobile || listState.mode !== 'wall' || wallState.validCount === 0) return;
            const fresh = scRegion();
            R.obstacles = fresh.obstacles; R.freePts = fresh.freePts; R.cellFree = fresh.cellFree;
            const placed = scLivePlaced();
            const hit = placed.filter(c => c.cx != null && !c.el._dragged && c.el !== currentFocusedCard && !scInside(c, R));
            if (!hit.length) return;
            hit.forEach(c => {
                const others = scLivePlaced().filter(p => p !== c);
                scRecomputeCover(others);
                if (scFindSpot(c, others, R, 420)) scPlace(c, 0);
                else { c.el.remove(); wallState.hidden.push(c.m); }
            });
            const live = scLivePlaced(); scRecomputeCover(live); scRestack(live);
        }
        // 頁面開著跨過 1 號 00:00（台灣時間）：牆面換成新月份、排行榜換成剛結束的那個月。準時切換＋每 30 秒檢查一次（電腦睡眠、計時器延遲）
        function checkMonthRollover() {
            if (!messagesLoaded) return;
            const k = tpeMonthKey(nowMs());
            if (MB.month && MB.month !== k) { MB.month = k; MB.pop = false; fetchMonthBoard(); }
            if (wallState.rendered && wallState.month && wallState.month !== k) refreshWall();
        }
        function scheduleMonthRollover() {
            clearTimeout(MB.rolloverTimer);
            const delta = tpeNextMonthStart(nowMs()) - nowMs();
            if (delta > 0 && delta < 2147483000) MB.rolloverTimer = setTimeout(() => { checkMonthRollover(); scheduleMonthRollover(); }, delta + 1000);
        }
        setInterval(checkMonthRollover, 30000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) checkMonthRollover(); });

        // ---- 月初空牆（本月 0 則）：邀請卡＋虛線空位卡；「我的回憶」沿用原本的 .empty-wall ----
        const ME_ART = '<svg class="month-empty-art" viewBox="0 0 132 112" aria-hidden="true"><rect x="20" y="18" width="70" height="70" rx="10" transform="rotate(-6 55 53)" fill="#ffffff" stroke="#f1c9d3" stroke-width="2" stroke-dasharray="6 5"/><rect x="44" y="24" width="70" height="70" rx="10" transform="rotate(5 79 59)" fill="#fde68a"/><rect x="54" y="40" width="40" height="5" rx="2.5" transform="rotate(5 79 59)" fill="#f59e0b" opacity=".45"/><rect x="54" y="52" width="28" height="5" rx="2.5" transform="rotate(5 79 59)" fill="#f59e0b" opacity=".35"/><path d="M86 76c-1.5-4 .8-8.6 5-8.6 2.3 0 3.8 1.2 5 3 1.2-1.8 2.7-3 5-3 4.2 0 6.5 4.6 5 8.6-2.2 5.2-10 10-10 10s-7.8-4.8-10-10z" fill="#be123c"/><circle cx="112" cy="20" r="4" fill="#fbcfe8"/><circle cx="16" cy="96" r="3" fill="#fde68a"/><path d="M118 40l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#f59e0b" opacity=".7"/></svg>';
        const ME_SLOTS = [[.12, .62, 3], [.30, .86, -2], [.74, .22, 3], [.86, .58, -3], [.62, .84, 2], [.24, .40, -4], [.90, .30, 2]];
        function removeMonthEmpty() { document.querySelectorAll('.month-empty, .me-slots, .me-slots-m').forEach(e => e.remove()); }
        function renderMonthEmpty(isMobile) {
            const n = nowMs(), cur = tpeMonthStart(n), prevStart = tpeMonthStart(cur - 1);
            const thisM = mbYM(tpeMonthKey(n)).m, prevM = mbYM(tpeMonthKey(prevStart)).m;
            const prevCount = rawMessages.filter(m => (m.timestamp || 0) >= prevStart && (m.timestamp || 0) < cur).length;   // 上月有效卡數（已刪除的不在 rawMessages 裡）
            const desc = prevCount > 0 ? `每月 1 號牆面會換新。${prevM} 月的 ${prevCount} 張感謝都還在，切到<span style="white-space:nowrap">「清單」</span>就看得到。`
                : '每月 1 號牆面會換新，之前的感謝都還在<span style="white-space:nowrap">「清單」</span>裡。';
            const slots = isMobile ? '' : `<div class="me-slots" aria-hidden="true">${ME_SLOTS.map(([x, y, r]) => `<span class="me-slot" style="left:calc(${x * 100}% - 95px);top:calc(${y * 100}% - 60px);--r:${r}deg"></span>`).join('')}</div>`;
            wall.innerHTML = slots + `<section class="month-empty" aria-labelledby="meTitle"><div class="month-empty-card">${ME_ART}`
                + `<p class="me-eyebrow">${thisM} 月新牆面</p><h2 id="meTitle">這面牆，等你貼上<em>${thisM} 月第一張</em>感謝</h2><p>${desc}</p>`
                + `<div class="me-actions"><button type="button" class="me-primary" data-act="me-write"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>寫下本月第一張</button>`
                + `<button type="button" class="me-ghost" data-act="me-list">${prevCount > 0 ? `看 ${prevM} 月的感謝` : '看全部感謝'}</button></div></div></section>`
                + (isMobile ? '<div class="me-slots-m" aria-hidden="true"><span></span><span></span></div>' : '');
            if (isMobile) { const me = wall.querySelector('.month-empty'); if (me && mboardEl) mboardEl.before(me); return; }   // 手機：邀請卡排在排行榜上面，兩顆按鈕留在第一屏
            meTrimSlots();
        }
        // 虛線空位卡要避開所有障礙物（標題、工具列、排行榜面板、撰寫區）和邀請卡；面板大小變了（資料到、展開）也要再檢查一次
        function meTrimSlots() {
            const cardEl = wall.querySelector('.month-empty-card'); if (!cardEl || !wall.querySelector('.me-slot')) return;
            const card = cardEl.getBoundingClientRect();
            const obs = scRegion().obstacles.concat([{ left: card.left - 16, top: card.top - 16, right: card.right + 16, bottom: card.bottom + 16 }]);
            wall.querySelectorAll('.me-slot').forEach(sl => { const b = sl.getBoundingClientRect(); if (b.left < 0 || b.top < 0 || b.right > innerWidth || b.bottom > innerHeight || obs.some(o => !(b.right < o.left || b.left > o.right || b.bottom < o.top || b.top > o.bottom))) sl.remove(); });
        }
        // 月初空牆的按鈕（手機的邀請卡在 #wall 外面，所以掛在 document）
        document.addEventListener('click', (e) => {
            const me = e.target.closest('.month-empty');
            if (!me) return;
            if (e.target.closest('[data-act="me-list"]')) { playSound('click'); setViewMode('list'); return; }   // 本月 0 則：清單最上面就是上個月的感謝
            if (e.target.closest('[data-act="me-write"]')) {   // 和 .empty-write 相同：聚焦撰寫區（手機先展開撰寫區，收件人欄才看得到）
                playSound('click');
                focusComposerNow();   // 同步設定焦點（iOS 才會跳鍵盤）；「點撰寫區外面就收起」看到焦點在撰寫列就不會收起
            }
        });
        window.__monthBoard = () => ({ state: MB.state, data: MB.data, month: MB.month, wallMonth: wallState.month, pop: !!MB.pop });   // 測試用
        window.__monthBoardFetch = () => fetchMonthBoard();                                                                                    // 測試用


        // ================= 牆面渲染（4.8：分批發牌式渲染 + 資料變動時只更新有變的卡片） =================
        const CARDS_PER_FRAME = 3, MAX_CARDS_PER_STEP = 12, DEAL_TARGET_MS = 700;
        const wallState = {
            rendered: false,     // 已經用目前資料畫過一次
            dealing: false,      // 首輪發牌中
            queue: [],           // 首輪還沒發出的留言
            dealtCount: 0, displayTotal: 0,
            hidden: [],          // 沒上牆、等輪播換上的留言
            pending: new Set(),  // 輪播中正要換上的留言 id
            byId: new Map(),
            placedRects: [],
            maxLikes: 0, validCount: 0, safeMax: 50,
            layout: null, raf: null, rotationTimer: null,
        };

        function getValidMessages() {
            if (isFilterMeOnly && currentUser) {
                // 我的回憶：我寫的＋寫給我的（伺服器已在每筆留言標好 is_mine、to_me；不受月份限制）
                return rawMessages.filter(msg => msg.isMine || msg.toMe).slice(0, 200);
            }
            // 牆面只顯示本月（台灣時間 1 號 00:00 起）的留言；資料不刪除，清單模式看得到全部。後台的 retentionDays 不再影響牆面
            const since = tpeMonthStart(nowMs());
            return rawMessages.filter(msg => (msg.timestamp || 0) >= since);
        }

        // ===== 4.8.3 牆面新舊比例與萬聖卡優先（卓倫需求）；要調整比例只改這一段 =====
        const WALL_FRESH_RATIO = 0.6;  // 牆面上「新留言」的目標比例（卓倫：1/2～2/3）；不足時用另一類補滿
        const WALL_FRESH_DAYS = 7;     // 新留言定義：萬聖活動期間＝HW_EVENT_START（10/18 00:00 +08:00）之後；非活動期間＝最近 7 天內
        const WALL_HW_SHARE = 1 / 3;   // 活動期間萬聖卡最多佔整面牆約 1/3（一般新留言不夠時，由萬聖卡補足新留言份額）
        const WALL_HW_MIN = 4;         // 牆上至少保留幾張萬聖卡（萬聖卡總數夠的話）
        const WALL_HW_WEIGHT = 3;      // 輪播換卡時，萬聖卡被抽中的權重（一般卡＝1）
        const WALL_COOLDOWN = 40;      // 換下來的卡至少隔幾次換卡才會再上牆（每 5 秒換 3 張，約 70 秒；候選不夠時放寬）
        const WALL_ROTATE_MS = 5000;   // 輪播：每幾毫秒換一輪（卓倫 4.8.3：由 8 秒改 5 秒）
        const WALL_ROTATE_COUNT = 3;   // 輪播：每輪換幾張（由 2 張改 3 張）
        const WALL_ROTATE_GAP = 500;   // 輪播：同一輪裡每張之間隔幾毫秒
        function wallIsHw(m) { return IS_HALLOWEEN && m.theme === 'theme-halloween'; }
        function wallIsFresh(m) {
            if (wallIsHw(m)) return true;
            const t = m.timestamp || 0;
            return IS_HALLOWEEN ? t >= HW_EVENT_START : nowMs() - t <= WALL_FRESH_DAYS * 86400000;
        }
        function wallShuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
        // 把留言分頁排好：每頁約 60% 新留言（萬聖卡先上，最多約 1/3、至少 WALL_HW_MIN 張）、其餘舊留言；各類內部隨機
        function wallMixPages(list, pageSize, firstSize = pageSize) {
            const hw = wallShuffle(list.filter(wallIsHw));
            const fresh = wallShuffle(list.filter(m => !wallIsHw(m) && wallIsFresh(m)));
            const old = wallShuffle(list.filter(m => !wallIsFresh(m)));
            const pages = [];
            while (hw.length + fresh.length + old.length) {
                const n = Math.min(Math.max(1, pages.length ? pageSize : firstSize), hw.length + fresh.length + old.length);
                const freshGoal = Math.min(hw.length + fresh.length, Math.max(n - old.length, Math.round(n * WALL_FRESH_RATIO)));
                const hwFirst = Math.min(hw.length, freshGoal, Math.max(WALL_HW_MIN, Math.floor(n * WALL_HW_SHARE)));
                const freshN = Math.min(fresh.length, freshGoal - hwFirst);
                const hwN = Math.min(hw.length, freshGoal - freshN);
                pages.push([...hw.splice(0, hwN), ...fresh.splice(0, freshN), ...old.splice(0, n - hwN - freshN)]);
            }
            return pages;
        }
        // 輪播換卡：挑下一張要上牆的卡，維持新舊比例、萬聖卡保底與加權，並避開剛換下來的卡。回傳 null＝這張先不換
        function wallPickNext(pool, outgoing, onWall) {
            if (!pool.length) return null;
            if (isFilterMeOnly) return pool[Math.floor(Math.random() * pool.length)];
            const tick = wallState.swapTick || 0, recent = wallState.recentOut || new Map();
            const cool = pool.filter(m => !(recent.has(m.id) && tick - recent.get(m.id) < WALL_COOLDOWN));
            const rest = onWall.filter(m => m.id !== outgoing.id);
            const total = rest.length + 1;
            const hwNow = rest.filter(wallIsHw).length;
            // 冷卻中的卡先不挑；整類都在冷卻中時，只從「最早被換下」的三分之一裡挑，盡量拉長重複出現的間隔
            const from = (f) => {
                const a = cool.filter(f); if (a.length) return a;
                const b = pool.filter(f).sort((x, y) => (recent.get(x.id) ?? -1) - (recent.get(y.id) ?? -1));
                return b.slice(0, Math.max(1, Math.ceil(b.length / 3)));
            };
            const hwPool = from(wallIsHw);
            // 萬聖卡保底：換下這張會低於保底，或牆上萬聖卡已經不足 → 只能換成萬聖卡（沒有就先不換這張萬聖卡）
            if (IS_HALLOWEEN && hwNow < Math.min(WALL_HW_MIN, hwNow + (wallIsHw(outgoing) ? 1 : 0) + hwPool.length)) {
                if (hwPool.length) return hwPool[Math.floor(Math.random() * hwPool.length)];
                if (wallIsHw(outgoing)) return null;
            }
            const freshNow = rest.filter(wallIsFresh).length;
            const wantFresh = freshNow < Math.round(total * WALL_FRESH_RATIO);
            let group = from(m => wallIsFresh(m) === wantFresh);
            if (!group.length) group = from(m => wallIsFresh(m) !== wantFresh);
            if (!group.length) return null;
            // 萬聖卡加權（已達約 1/3 上限、而且還有一般新留言可換時，這次不再加萬聖卡）
            const hwFull = hwNow >= Math.max(WALL_HW_MIN, Math.floor(total * WALL_HW_SHARE)) && group.some(m => !wallIsHw(m));
            const weights = group.map(m => wallIsHw(m) ? (hwFull ? 0 : WALL_HW_WEIGHT) : 1);
            let r = Math.random() * weights.reduce((a, b) => a + b, 0);
            for (let i = 0; i < group.length; i++) { r -= weights[i]; if (r < 0 && weights[i] > 0) return group[i]; }
            return group.find((m, i) => weights[i] > 0) || null;
        }
        // 首輪補位（覆蓋率不足時從輪播池拿短卡）：照新舊比例挑，各類裡先挑字數少的
        function wallSupplementOrder(cands, wallMsgs) {
            const len = m => [...String(m.text || '')].length;
            const left = cands.slice().sort((a, b) => len(a) - len(b));
            if (isFilterMeOnly) return left;
            const out = [];
            let fresh = wallMsgs.filter(wallIsFresh).length, total = wallMsgs.length;
            while (left.length) {
                const wantFresh = fresh < Math.round((total + 1) * WALL_FRESH_RATIO);
                let i = left.findIndex(m => wallIsFresh(m) === wantFresh);
                if (i < 0) i = 0;
                const m = left.splice(i, 1)[0];
                out.push(m); total++; if (wallIsFresh(m)) fresh++;
            }
            return out;
        }
        function wallNoteSwapOut(id) {
            wallState.swapTick = (wallState.swapTick || 0) + 1;
            const recent = wallState.recentOut || (wallState.recentOut = new Map());
            recent.set(id, wallState.swapTick);
            if (recent.size > 400) for (const [k, t] of recent) if (wallState.swapTick - t >= WALL_COOLDOWN) recent.delete(k);
        }

        function computeMaxLikes(list) { let max = 0; list.forEach(m => { const c = likeCountOf(m); if (c > max) max = c; }); return max; }

        function pickAutoTheme(validMessages) {
            if (themeManuallySelected || validMessages.length === 0 || isFilterMeOnly) return;
            if (applyHwDefaultTheme()) return; // 4.8.4：活動期間吸血鬼預設萬聖卡
            const availableThemes = unlockOf('themes_basic') ? themeList.slice(0, 10) : themeList.slice(0, 3);
            const themeCounts = {}; availableThemes.forEach(t => themeCounts[t] = 0);
            validMessages.forEach(msg => { if(availableThemes.includes(msg.theme)) themeCounts[msg.theme]++; });
            const minCount = Math.min(...Object.values(themeCounts));
            const leastUsedThemes = availableThemes.filter(t => themeCounts[t] === minCount);
            currentTheme = leastUsedThemes[Math.floor(Math.random() * leastUsedThemes.length)] || 'theme-classic';
            document.querySelectorAll('.theme-btn').forEach(btn => {
                if (btn.getAttribute('data-theme') === currentTheme) btn.classList.add('active'); else btn.classList.remove('active');
            });
            syncPickerState();
        }

        function computeLayout() {
            const isMobile = window.innerWidth <= 768;
            return {
                isMobile, screenW: window.innerWidth, screenH: window.innerHeight,
                sideLimit: isMobile ? 10 : 40, topLimit: isMobile ? 190 : 160, bottomLimit: isMobile ? 330 : 220, // 4.8：手機讓出標題（設計 M6）與輸入區（R4）
                mobileScaleDown: isMobile ? 0.6 : 1.0, overlapAllowance: 30,
            };
        }

        function nextZ() { highestZ++; if (highestZ > 85000) highestZ = 100; return highestZ; }

        function createCard(msg, maxLikes, scale, opacity) {
            const card = document.createElement('div');
            applyCardContent(card, msg, maxLikes);
            card.style.setProperty('--c-scale', scale);
            card.style.setProperty('--c-rotate', `${(Math.random() - 0.5) * 14}deg`);
            card.style.opacity = opacity.toString();
            card.style.zIndex = nextZ();
            return card;
        }

        // 量測卡片大小（圖片還沒解碼時先預留高度，避免圖片載入後卡片疊在一起）
        function measureCard(card, scale) {
            let h = card.offsetHeight;
            const img = card.querySelector('.card-image');
            if (img && !img.complete) h += wallState.layout.isMobile ? 140 : 180;
            return { w: card.offsetWidth * scale, h: h * scale };
        }

        function findSpot(w, h, rects, attempts) {
            const L = wallState.layout;
            const randX = () => L.sideLimit + w/2 + Math.random() * (L.screenW - L.sideLimit*2 - w);
            const randY = () => L.topLimit + h/2 + Math.random() * (L.screenH - L.topLimit - L.bottomLimit - h);
            for (let attempt = 0; attempt < attempts; attempt++) {
                const testX = randX(), testY = randY();
                let hasCollision = false;
                for (const rect of rects) {
                    if (Math.abs(testX - rect.x) < (w + rect.w) / 2 - L.overlapAllowance && Math.abs(testY - rect.y) < (h + rect.h) / 2 - L.overlapAllowance) { hasCollision = true; break; }
                }
                if (!hasCollision) return { x: testX, y: testY };
            }
            return { x: randX(), y: randY() };
        }

        const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let wallEntered = false; // 進場動畫只在第一次顯示牆面與新卡出現時播放（設計 M2）
        function revealCard(card, pos, size, enterDelay) {
            card.style.left = `${pos.x}px`; card.style.top = `${pos.y}px`;
            card._rect = { x: pos.x, y: pos.y, w: size.w, h: size.h };
            card.style.setProperty('--float-duration', `${4 + Math.random() * 3}s`);
            card.style.setProperty('--float-delay', `-${Math.random() * 3}s`);
            if (!prefersReducedMotion && enterDelay !== undefined) {
                card.style.setProperty('--enter-delay', `${enterDelay}ms`);
                card.classList.add('card-enter');
                setTimeout(() => card.classList.remove('card-enter'), 520 + enterDelay);
            }
            card.style.visibility = 'visible'; card.classList.add('floating');
        }

        function stopWallTimers() {
            if (wallState.rotationTimer) { clearInterval(wallState.rotationTimer); wallState.rotationTimer = null; }
            if (wallState.relayoutTimer) { clearInterval(wallState.relayoutTimer); wallState.relayoutTimer = null; }
            if (wallState.raf) { cancelAnimationFrame(wallState.raf); wallState.raf = null; }
        }

        // 完整重畫：洗牌後分批放卡片（每個畫面放 CARDS_PER_FRAME 張，放好就顯示）
        const EMPTY_ART = '<svg viewBox="0 0 120 120" aria-hidden="true"><rect x="24" y="22" width="62" height="62" rx="9" transform="rotate(-7 55 53)" fill="#fde68a"/><rect x="30" y="30" width="38" height="5" rx="2.5" transform="rotate(-7 55 53)" fill="#f59e0b" opacity=".45"/><rect x="30" y="42" width="28" height="5" rx="2.5" transform="rotate(-7 55 53)" fill="#f59e0b" opacity=".35"/><path d="M80 66c-1.5-4 .8-8.6 5-8.6 2.3 0 3.8 1.2 5 3 1.2-1.8 2.7-3 5-3 4.2 0 6.5 4.600 5 8.6-2.200 5.200-10 10-10 10s-7.800-4.800-10-10z" fill="#be123c"/></svg>';
        wall.addEventListener('click', (e) => { if (e.target.closest('.empty-write')) { playSound('click'); focusComposerNow(); } });
        function renderWall() {
            currentRenderGen++;
            const myGen = currentRenderGen;
            stopWallTimers();
            if (currentFocusedCard) { focusOverlay.classList.remove('active'); document.body.classList.remove('card-open'); currentFocusedCard = null; }
            activeDragCard = null;
            if (mobileRO) mobileRO.disconnect();   // var：renderWall 可能比這行先被呼叫（那時是 undefined）
            wall.innerHTML = ''; wall.classList.remove('is-solo'); removeMonthEmpty(); document.getElementById('wallMore').replaceChildren();
            wallState.rendered = false; wallState.dealing = false; wallState.queue = []; wallState.hidden = [];
            wallState.pending.clear(); wallState.placedRects = []; wallState.placed = [];
            if (!messagesLoaded) return; // 資料還沒到，畫面上顯示載入提示

            wallState.layout = computeLayout();
            const isMobile = wallState.layout.isMobile;
            const validMessages = getValidMessages();
            const total = validMessages.length;
            wallState.month = tpeMonthKey(nowMs());
            wallState.validCount = total;
            wallState.byId = new Map(validMessages.map(m => [m.id, m]));
            wallState.rendered = true;

            pickAutoTheme(validMessages);

            if (total === 0) {
                if (!isFilterMeOnly) { renderMonthEmpty(isMobile); return; }   // 牆面每月 1 號換新：本月 0 則時顯示邀請卡（上月排行榜照常顯示）
                wall.classList.add('is-solo');   // 手機：單一提示不分欄（不用 column-span，見 T063 M1）
                wall.innerHTML = `<div class="empty-wall">${EMPTY_ART}<h3>目前還沒有屬於你的回憶喔，<br>快去寫一張送給同事吧！</h3><button type="button" class="empty-write">寫下第一張感謝</button></div>`;
                return;
            }

            const maxLikes = computeMaxLikes(validMessages);
            wallState.maxLikes = maxLikes;
            if (isMobile) { wallState.safeMax = Infinity; renderMobileWall(validMessages, maxLikes); return; } // 手機：雙欄捲動牆

            // ---- 桌機：便利貼牆 v3 ----
            const t0 = performance.now();
            const R = wallState.R = scRegion();
            const maxBase = parseInt(systemSettings.maxMessages) || 50;
            // T052：大螢幕（R.wide）時，後台的張數上限照可用面積等比例放寬（上限是「標準螢幕的密度」，不是絕對張數）
            const maxSetting = R.wide ? Math.round(maxBase * R.N / SC_COVER_CAP) : maxBase;
            const N = Math.min(R.N, maxSetting);
            wallState.safeMax = N;
            R.seed = Math.min(9, N);
            const coverCap = Math.min(R.wide ? N + SC_WIDE_EXTRA : SC_COVER_CAP, maxSetting);
            // 管理員一張、人氣王一張放進候選，其餘隨機
            const admins = validMessages.filter(m => displayThemeOf(m) === 'theme-admin'); // 只有至尊模板的卡固定上牆、用至尊景深；管理員的其他卡照一般規則
            const admin = admins.length ? admins[Math.floor(Math.random() * admins.length)] : null;
            const stars = maxLikes > 0 ? validMessages.filter(m => m !== admin && likeCountOf(m) === maxLikes) : [];
            const star = stars.length ? stars[Math.floor(Math.random() * stars.length)] : null;
            let others = validMessages.filter(m => m !== admin && m !== star);
            // 4.8.3：首輪約 60% 新留言、萬聖卡優先（wallMixPages）；「我的」篩選維持原本的全隨機
            others = isFilterMeOnly ? wallShuffle(others) : wallMixPages(others, N, N - (admin ? 1 : 0) - (star ? 1 : 0)).flat();
            const ordered = [admin, star, ...others].filter(Boolean);
            const candidates = ordered.slice(0, N);
            wallState.hidden = ordered.slice(N);

            // 先建立並量好全部候選卡（一次排版），再由大到小分批放置、放好就顯示
            // 先只用字寬估出每張卡的大小（不碰版面），由大到小排好；之後每個畫面建立、量測、放置幾張，放好就顯示
            const plan = candidates.map(m => { const depth = scDepthOf(m, maxLikes, m === star); return { m, depth, est: scEstimateArea(m, SC_DEPTH[depth] * R.B) }; });
            plan.sort((a, b) => b.est - a.est);
            const items = [];
            wallState.items = items;
            wallState.dealing = true;
            let shown = 0, lastStepAt = 0, extraTries = 0, cellsFilled = false, failRun = 0;
            const step = () => {
                wallState.raf = null;
                if (myGen !== currentRenderGen) return;
                const placed = wallState.placed = wallState.placed.filter(c => c.el.isConnected);
                const now = performance.now();
                const gap = lastStepAt ? Math.max(now - lastStepAt, 16) : 16;
                lastStepAt = now;
                // 每步最多放幾張；另有 40ms 時間上限（大螢幕 60ms），避免卡住畫面。T052：大螢幕卡多、每個畫面重繪也比較久，每步多放幾張
                const perStep = R.wide ? (gap > 40 ? 14 : 8) : gap > 100 ? 6 : gap > 40 ? 5 : 4;
                // 資料變動時加進來的新留言（refreshWall 放進 queue）先放
                while (wallState.queue.length) { const m = wallState.queue.shift(); const it = scMakeItem(m, wallState.maxLikes, false, R.B); scMeasure(it); items.unshift(it); }
                // 這一批：建立卡片並一起量測（整批只排版一次）
                const batch = plan.splice(0, Math.max(0, perStep - items.length)).map(p => scMakeItem(p.m, wallState.maxLikes, p.m === star, R.B, p.depth));
                batch.forEach(scMeasure);
                items.push(...batch);
                for (let n = 0; n < perStep && items.length; n++) {
                    if (n > 0 && performance.now() - now > (R.wide ? 60 : 40)) break; // T052：大螢幕每步 60ms（卡多，40ms 會多等很多個畫面）
                    const c = items.shift();
                    if (!c.el.isConnected) continue; // 排版中被刪掉的留言
                    let ok = scFindSpot(c, placed, R, R.wide ? 280 : 420);
                    if (!ok) { // 放不下：縮小 10% 再試（字仍 ≥ 12px）
                        scSizeCard(c.el, c.m, SC_DEPTH[c.depth] * R.B * .9); scMeasure(c);
                        ok = 15 * parseFloat(c.el.style.getPropertyValue('--s')) >= 12 && scFindSpot(c, placed, R, R.wide ? 260 : 400);
                    }
                    if (!ok) { c.el.remove(); wallState.hidden.push(c.m); failRun++; continue; } // 先不上牆，輪播時再補
                    failRun = 0;
                    scCommit(c, placed);
                    scPlace(c, wallEntered ? undefined : (shown % 8) * 40);
                    shown++;
                }
                // 候選放完但還沒到目標張數：從輪播池再拿幾張較短的卡補位（最多試 12 張）
                // 驗收 A2：張數到了但卡片小（短句）、覆蓋率不到 70%：繼續補到 70% 或 coverCap 張（標準螢幕 42；大螢幕 N＋8）（連同上面的補位，合計最多試 36 張）
                // T052：大螢幕連續 6 張放不下＝牆面已經放滿，不再補位（每張放不下的卡都要試幾百個位置，又多等好幾個畫面）
                const idle = !items.length && !plan.length && !wallState.queue.length && wallState.hidden.length && !(R.wide && failRun >= 6);
                const short = idle && placed.length < N && extraTries < 12 && !(R.wide && scCoverage(placed, R) >= SC_COVER_GOAL); // T052：大螢幕張數是為了覆蓋率，覆蓋率夠了就不再硬補到 N 張（省排版時間）
                const sparse = idle && !short && placed.length < coverCap && extraTries < 36 && scCoverage(placed, R) < SC_COVER_GOAL;
                if (short || sparse) {
                    const pool = wallSupplementOrder(wallState.hidden.slice(0, 40), [...placed, ...items].map(p => p.m)); // 4.8.3：補位也維持新舊比例
                    const per = R.wide ? 8 : 4; // T052：大螢幕每步多補幾張，少等幾個畫面
                    const take = short ? Math.min(per, 12 - extraTries) : Math.min(per, coverCap - placed.length, 36 - extraTries);
                    for (const m of pool.slice(0, take)) {
                        extraTries++;
                        wallState.hidden = wallState.hidden.filter(x => x !== m);
                        const it = scMakeItem(m, wallState.maxLikes, false, R.B); scMeasure(it); items.push(it);
                    }
                } else if (!items.length && !plan.length && !wallState.queue.length && !cellsFilled) {
                    // 驗收 A2：最後檢查九宮格，還空著的格子（例如撰寫區上方那一小條）用輪播池裡最短的卡，在那一格裡找位置補上（每格最多試 2 張）
                    cellsFilled = true;
                    const cnt = new Array(9).fill(0); placed.forEach(p => cnt[scCell(p.cx, p.cy, R)]++);
                    const cw = R.w / 3, ch = R.h / 3, rr = Math.min(cw, ch) / 2 - 4;
                    for (let k = 0; k < 9; k++) {
                        if (cnt[k] || R.cellFree[k] < .02) continue;
                        const pool = wallSupplementOrder(wallState.hidden.slice(0, 40), placed.map(p => p.m)).slice(0, 2);
                        for (const m of pool) {
                            const c = scMakeItem(m, wallState.maxLikes, false, R.B); scMeasure(c);
                            const at = { x: R.x + (k % 3 + .5) * cw, y: R.y + (Math.floor(k / 3) + .5) * ch, r: rr };
                            if (scFindSpot(c, placed, R, 240, at) && scCell(c.cx, c.cy, R) === k) {
                                wallState.hidden = wallState.hidden.filter(x => x !== m);
                                scCommit(c, placed); scPlace(c, wallEntered ? undefined : (shown % 8) * 40); shown++;
                                break;
                            }
                            c.el.remove();
                        }
                        if (placed.some(p => scCell(p.cx, p.cy, R) === k)) { cnt[k]++; continue; }
                        // 輪播池沒有卡可補（例如總共只有十幾張大卡）：從最擠的格子挪一張較小的卡過來
                        const movable = placed.filter(p => p.depth !== 'admin' && p.el !== currentFocusedCard && !p.el._dragged && cnt[scCell(p.cx, p.cy, R)] >= 2)
                            .sort((a, b) => a.w * a.h - b.w * b.h).slice(0, 3);
                        for (const p of movable) {
                            const others = placed.filter(q => q !== p), from = scCell(p.cx, p.cy, R), old = [p.cx, p.cy];
                            scRecomputeCover(others);
                            const at = { x: R.x + (k % 3 + .5) * cw, y: R.y + (Math.floor(k / 3) + .5) * ch, r: rr };
                            if (scFindSpot(p, others, R, 240, at) && scCell(p.cx, p.cy, R) === k) { scPlace(p); cnt[from]--; cnt[k]++; scRecomputeCover(placed); break; }
                            [p.cx, p.cy] = old; p._qFull = null; p._qText = null; scRecomputeCover(placed);
                        }
                    }
                }
                scRestack(placed);
                if (items.length || plan.length || wallState.queue.length) { wallState.raf = requestAnimationFrame(step); return; }
                wallState.dealing = false;
                wallState.safeMax = Math.max(N, placed.length); // 覆蓋率補位多放的卡，不要被 trimExcessCards 收回
                wallState.layoutMs = Math.round(performance.now() - t0);
                wallEntered = true;
                enforceFxBudget();
                maybeStartRotation();
            };
            step();
        }

        // ---- 手機（≤768px）：上下捲動的雙欄牆，最新的在最上面，一次 10 張，按「再看 10 張」繼續 ----
        const MOBILE_PAGE = 10;
        let mobileShown = MOBILE_PAGE;
        function renderMobileWall(validMessages, maxLikes) {
            // 4.8.3：每 10 張一頁，各頁約 60% 新留言、萬聖卡優先，頁內照時間新到舊；「我的」篩選維持時間排序
            // 至尊模板的卡（最新一張）跟桌機一樣固定上牆，放在第 1 頁最上面
            const admin = isFilterMeOnly ? null : validMessages.find(m => displayThemeOf(m) === 'theme-admin');
            const ordered = isFilterMeOnly ? validMessages
                : [admin, ...wallMixPages(validMessages.filter(m => m !== admin), MOBILE_PAGE, MOBILE_PAGE - (admin ? 1 : 0))
                    .flatMap(p => p.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)))].filter(Boolean);
            const first = ordered.slice(0, mobileShown);
            wallState.hidden = ordered.slice(mobileShown);
            first.forEach((m, i) => wall.appendChild(mobileCard(m, maxLikes, i)));
            updateMoreButton();
            wallState.dealing = false; wallEntered = true;
        }
        // T063 M1：手機雙欄改用 CSS grid（4px 一列、dense 自動補位）排成瀑布流，不再用 CSS 多欄（columns）。
        // WebKit（iPhone Safari）的多欄排版會把有 transform 的卡片畫在錯的位置（量到的是兩欄、畫出來卻擠在同一欄），按鈕也被蓋住。
        // 每張卡的高度（含上下 margin）換算成 grid-row-end: span N；卡片長高變矮（圖片載入、按讚、編輯）時由 ResizeObserver 自動更新。
        const MOBILE_ROW_PX = 4;
        var mobileRO = ('ResizeObserver' in window) ? new ResizeObserver(entries => { for (const e of entries) mobileSpan(e.target); }) : null;
        function mobileSpan(card) {
            if (!card.isConnected || card.parentElement !== wall || card.classList.contains('focused') || !wallState.layout || !wallState.layout.isMobile) return;
            const cs = getComputedStyle(card);
            const h = card.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
            const span = 'span ' + Math.max(1, Math.ceil(h / MOBILE_ROW_PX));
            if (card.style.gridRowEnd !== span) card.style.gridRowEnd = span;
        }
        function mobileCard(m, maxLikes, i) {
            const card = createCard(m, maxLikes, 1, 1);
            if (mobileRO) mobileRO.observe(card);
            card.style.setProperty('--rot', scRange(-2.2, 2.2).toFixed(2) + 'deg');
            // 驗收 A3：至尊卡的皇冠凸出卡片上緣約 37px，多留 48px，不壓到「牆面／清單」切換或上一張卡
            card.style.marginTop = ((i < 2 ? (i ? 14 : 0) : Math.round(scRange(0, 10))) + (card.classList.contains('t-admin') ? 48 : 0)) + 'px';
            if (!prefersReducedMotion) {
                card.style.setProperty('--enter-delay', `${Math.min(i, 9) * 40}ms`);
                card.classList.add('card-enter');
                setTimeout(() => card.classList.remove('card-enter'), 600 + Math.min(i, 9) * 40);
            }
            return card;
        }
        // 「再看 N 張」放在 #wall 外面的 #wallMore（T063 M1）：按鈕在多欄容器裡用 column-span 時，WebKit（iPhone）會把卡片全排進同一欄、按鈕被卡片蓋住
        function updateMoreButton() {
            const wallMoreEl = document.getElementById('wallMore');
            let btn = wallMoreEl.querySelector('.more-btn');
            const need = wallState.layout && wallState.layout.isMobile && wallState.hidden.length > 0;
            if (!need) { if (btn) btn.remove(); return; }
            if (!btn) {
                btn = document.createElement('button'); btn.type = 'button'; btn.className = 'more-btn';
                btn.addEventListener('click', () => {
                    const next = wallState.hidden.splice(0, MOBILE_PAGE);
                    mobileShown += next.length;
                    next.forEach((m, i) => wall.appendChild(mobileCard(m, wallState.maxLikes, i)));
                    updateMoreButton();
                });
                wallMoreEl.appendChild(btn);
            }
            btn.textContent = `再看 ${Math.min(MOBILE_PAGE, wallState.hidden.length)} 張`;
        }

        // ================= 桌機便利貼牆 v3（移植自美術總監 wall-4.8.js：scatterWall／swapCard／audit） =================
        // 規則：牆面＝整個視窗（四邊 12px），標題、工具列、撰寫區、簽名是障礙物；張數 N = round(32 × (可用面積 / 1.105M)^0.75)，限制 20～42；
        // T052：可用面積 ÷ 卡片面積換算超過 42 張的大螢幕（R.wide）改用等比例張數，上限 70，並改用「填空隙」的撒開排版。
        // 卡片可以互壓邊角，但上層卡的外框不能蓋到下層卡的「收件人＋內文」；單一對重疊 ≤ 1/4、每張被壓 ≤ 35%。
        const SC_DEPTH = { far: .9, mid: .96, near: 1.06, star: 1.18, admin: 1.4 };
        const SC_ROT = { far: 8, mid: 7, near: 7, star: 4, admin: 2 };
        const SC_Z = { far: 20, mid: 22, near: 24, star: 30, admin: 32 };
        const scMeas = document.createElement('canvas').getContext('2d');
        const scRange = (a, b) => a + Math.random() * (b - a);
        let scFont = null; // 只讀一次字型，避免每量一次字就強迫瀏覽器重新計算樣式
        function scTextW(str, px, weight) { if (!scFont) scFont = getComputedStyle(document.body).fontFamily; scMeas.font = `${weight} ${px}px ${scFont}`; return scMeas.measureText(String(str || '')).width; }
        function scDepthOf(m, maxLikes, isStar) {
            if (displayThemeOf(m) === 'theme-admin') return 'admin'; // 至尊外觀的卡才用最大、最上層的景深
            if (isStar) return 'star';
            const t = displayThemeOf(m);
            if (t === 'theme-cosmic' || t === 'theme-ultimate') return 'near';
            const r = Math.random(); return r < .35 ? 'far' : r < .8 ? 'mid' : 'near';
        }
        // 依字數決定卡寬：50 字內完整顯示、作者名不截斷
        function scSizeCard(el, m, s) {
            el.style.setProperty('--s', s.toFixed(3));
            const w = scCalcWidth(m, s);
            el.style.width = Math.round(w) + 'px';
            el.style.setProperty('--lines', [...String(m.text || '')].length > 50 ? 4 : 99);
        }
        // 只用 canvas 量字寬，不碰版面：用來先估卡片大小、決定放置順序
        function scCalcWidth(m, s) {
            const text = String(m.text || ''), L = [...text].length, theme = displayThemeOf(m);
            const fs = 15 * s, lines = L <= 9 ? 1 : L <= 22 ? 2 : L <= 36 ? 3 : 4;
            const tw = scTextW(text, fs, 700) / lines * 1.12 + 4;
            const footW = scTextW(m.author || '匿名', 12 * s, 600) * 1.08 + 100 * s + (theme === 'theme-admin' ? scTextW('系統管理員', 11 * s, 600) + 10 : 0);
            const toW = m.receiver ? scTextW('To: ' + m.receiver, 12 * s, 700) * 1.1 + 6 + (THEME_PIPS[theme] ? 62 * s : 0) : 0;
            const pad = (theme === 'theme-admin' ? 40 : 30) * s;
            return Math.min(Math.max(tw, footW, toW, 140 * s, m.image ? 200 * s : 0), 300 * s) + pad;
        }
        // 估計卡片面積只用字數（不量字、不碰版面），只拿來決定放置順序
        function scEstimateArea(m, s) {
            const L = [...String(m.text || '')].length;
            return s * s * (Math.min(L, 60) + 25) + (m.image ? 400 * s * s : 0);
        }
        function scQuad(c, box) {
            const a = c.rot * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
            return [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]].map(([x, y]) => [c.cx + x * cs - y * sn, c.cy + x * sn + y * cs]);
        }
        function scSat(P, Q) {
            for (const poly of [P, Q]) for (let i = 0; i < 4; i++) {
                const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % 4], nx = y2 - y1, ny = x1 - x2;
                let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
                for (const [x, y] of P) { const d = x * nx + y * ny; if (d < a0) a0 = d; if (d > a1) a1 = d; }
                for (const [x, y] of Q) { const d = x * nx + y * ny; if (d < b0) b0 = d; if (d > b1) b1 = d; }
                if (a1 < b0 || b1 < a0) return false;
            }
            return true;
        }
        function scOverlap(a, b) {
            const ox = Math.min(a.cx + a.w / 2, b.cx + b.w / 2) - Math.max(a.cx - a.w / 2, b.cx - b.w / 2);
            const oy = Math.min(a.cy + a.h / 2, b.cy + b.h / 2) - Math.max(a.cy - a.h / 2, b.cy - b.h / 2);
            return ox > 0 && oy > 0 ? ox * oy : 0;
        }
        // 外框半徑（旋轉後的保守範圍），先用圓形快速排除，省下大部分分離軸計算
        function scRadius(c) { return Math.hypot(Math.max(-c.full[0], c.full[2]), Math.max(-c.full[1], c.full[3])); }
        function scLegal(c, placed) {
            const cFull = scQuad(c, c.full), cText = scQuad(c, c.text), cr = scRadius(c);
            let covered = 0;
            for (const p of placed) {
                if (Math.hypot(p.cx - c.cx, p.cy - c.cy) > cr + p._r) continue;
                const upper = c.z > p.z ? c : p, lower = upper === c ? p : c;
                const upFull = upper === c ? cFull : (p._qFull || (p._qFull = scQuad(p, p.full)));
                const lowText = lower === c ? cText : (p._qText || (p._qText = scQuad(p, p.text)));
                if (scSat(upFull, lowText)) return false;
                const ov = scOverlap(c, p);
                if (ov > .25 * Math.min(c.w * c.h, p.w * p.h)) return false;
                if (lower === c) covered += ov;
                else if ((p._cov || 0) + ov > .35 * p.w * p.h) return false;
            }
            return covered <= .35 * c.w * c.h;
        }
        function scInside(c, R) {
            const q = scQuad(c, c.full);
            // 至尊卡外面有 22px 的光環：離畫面邊緣至少 24px，光環才不會被切到（其他卡沿用 12px）
            const e = c.m && displayThemeOf(c.m) === 'theme-admin' ? Math.max(0, 24 - R.x) : 0;
            if (!q.every(([x, y]) => x >= R.x + e && x <= R.x + R.w - e && y >= R.y + e && y <= R.y + R.h - e)) return false;
            let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
            for (const [x, y] of q) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
            return !R.obstacles.some(o => !(x1 < o.left || x0 > o.right || y1 < o.top || y0 > o.bottom) && scSat(q, [[o.left, o.top], [o.right, o.top], [o.right, o.bottom], [o.left, o.bottom]]));
        }
        function scMeasure(c) {
            const el = c.el, w = el.offsetWidth, h = el.offsetHeight, s = parseFloat(el.style.getPropertyValue('--s')) || 1;
            const t = el.querySelector('.card-text'), textBottom = t ? t.offsetTop + t.offsetHeight : h;
            const px = (c.depth === 'admin' ? 20 : 14) * s * .95, top = c.depth === 'admin' ? 34 * s : 0;
            Object.assign(c, { w, h, full: [-w / 2, -h / 2 - top, w / 2, h / 2], text: [-w / 2 + px, -h / 2 + 4 * s - 4, w / 2 - px, -h / 2 + textBottom + 4] });
            c._r = scRadius(c); c._qFull = null; c._qText = null;
        }
        // 驗收 A2：前 R.seed 張（由大到小）先平均撒開，之後才貼近已放的卡；兩個階段都避開擁擠的格子
        const SC_SEED_CROWD = .5, SC_CROWD = .35, SC_EMPTY_BONUS = .6, SC_COVER_GOAL = .7, SC_COVER_CAP = 42;
        // T052 大螢幕（R.wide）：張數上限 70、覆蓋率補位最多再多 8 張；排版改成「先填最大的空隙」（離最近的卡越遠越好），相疊獎勵降到 1、擁擠懲罰提高
        const SC_N_MAX = 70, SC_WIDE_EXTRA = 8, SC_WIDE_TOUCH = 1, SC_WIDE_CROWD = .8, SC_WIDE_GAP = 400;
        function scFindSpot(c, placed, R, tries, around, avoid) {
            let best = null, bestScore = -Infinity;
            const seeding = !around && placed.length < (R.seed || 0);
            for (let k = 0; k < tries; k++) {
                c.cx = around ? around.x + scRange(-around.r, around.r) : R.x + scRange(c.w / 2, R.w - c.w / 2);
                c.cy = around ? around.y + scRange(-around.r, around.r) : R.y + scRange(c.h / 2, R.h - c.h / 2);
                if (avoid && Math.hypot(c.cx - avoid.x, c.cy - avoid.y) < avoid.r) continue; // 4.8.3 輪播：先不放回被換掉那張的位置
                if (!scInside(c, R) || !scLegal(c, placed)) continue;
                let dmin = Infinity, ov = 0, inCell = 0;
                const cell = scCell(c.cx, c.cy, R);
                for (const p of placed) { dmin = Math.min(dmin, Math.hypot(p.cx - c.cx, p.cy - c.cy) - (p.w + c.w) / 4); ov += scOverlap(c, p); if (scCell(p.cx, p.cy, R) === cell) inCell++; }
                const touch = Math.min(ov / (c.w * c.h), .2);
                // 驗收 A2：這一格比平均擠多少（依各格可用面積換算；>1 代表比平均擠）
                const crowd = inCell / Math.max(1, placed.length * (R.cellFree ? R.cellFree[cell] : 1 / 9));
                const empty = placed.length && !inCell ? SC_EMPTY_BONUS : 0; // 還沒有卡的格子（例如撰寫區上方那一小塊）優先補上
                const score = seeding
                    ? Math.min(Math.max(0, dmin), 500) / 100 - crowd * SC_SEED_CROWD + empty * 10 + Math.random() * .15   // 撒開：先選還沒有卡的格子，再選離已放的卡越遠越好
                    : R.wide // T052：空間多時不往已放的卡靠，改成填最大的空隙；沒有空隙了（dmin ≤ 0）才由少量相疊獎勵決定
                    ? (placed.length ? Math.min(Math.max(0, dmin), SC_WIDE_GAP) / 150 : 0) + touch * SC_WIDE_TOUCH - crowd * SC_WIDE_CROWD + (around ? 0 : empty) + Math.random() * .15 + (around ? -Math.hypot(c.cx - around.x, c.cy - around.y) / 200 : 0)
                    : touch * 4 - (placed.length ? Math.max(0, dmin) : 0) / 400 - crowd * SC_CROWD + (around ? 0 : empty) + Math.random() * .15 + (around ? -Math.hypot(c.cx - around.x, c.cy - around.y) / 200 : 0);
                if (score > bestScore) { bestScore = score; best = [c.cx, c.cy]; }
            }
            if (!best) return false;
            [c.cx, c.cy] = best; c._qFull = null; c._qText = null; return true;
        }
        function scCommit(c, placed) { for (const p of placed) { const ov = scOverlap(c, p); if (c.z > p.z) p._cov = (p._cov || 0) + ov; else c._cov = (c._cov || 0) + ov; } placed.push(c); }
        function scRestack(placed) { placed.slice().sort((a, b) => a.z - b.z).forEach((c, i) => { c.el.style.zIndex = 100 + i; }); }
        function scPlace(c, enterDelay) {
            const el = c.el;
            el.style.left = (c.cx - c.w / 2).toFixed(1) + 'px'; el.style.top = (c.cy - c.h / 2).toFixed(1) + 'px';
            el.style.setProperty('--rot', c.rot.toFixed(2) + 'deg');
            el.style.setProperty('--float-duration', scRange(5, 7).toFixed(2) + 's');
            el.style.setProperty('--float-delay', '-' + scRange(0, 5).toFixed(2) + 's');
            if (!prefersReducedMotion && enterDelay !== undefined) {
                el.style.setProperty('--enter-delay', `${enterDelay}ms`);
                el.classList.add('card-enter');
                setTimeout(() => el.classList.remove('card-enter'), 520 + enterDelay);
            }
            el.style.visibility = 'visible'; el.classList.add('floating');
            el._c = c; c._qFull = null; c._qText = null;
        }
        // 牆面區域：障礙物用實際量到的位置（撰寫區一律以登入後的高度預留，登入前後不用重排）
        function scRegion() {
            const rectOf = (sel, pad = 8) => { const e = document.querySelector(sel); if (!e || !e.offsetParent && getComputedStyle(e).position !== 'fixed') return null; const b = e.getBoundingClientRect(); if (!b.width) return null; return { left: b.left - pad, top: b.top - pad, right: b.right + pad, bottom: b.bottom + pad }; };
            const pad = 8;
            // 上月感謝榜小條也是保護區；留白 12（卡片上緣的稱號徽章「感謝大師」會凸出卡片外框，8 時旋轉後會貼到小條）
            const obstacles = [rectOf('.brand'), rectOf('.tools'), rectOf('.signature'), rectOf('.mboard', 12)].filter(Boolean);
            const comp = rectOf('#composerWrap');
            if (comp) obstacles.push({ left: comp.left, right: comp.right, top: Math.min(comp.top, innerHeight - 20 - 104 - pad), bottom: innerHeight });
            const R = { x: 12, y: 12, w: innerWidth - 24, h: innerHeight - 24, obstacles };
            const area = R.w * R.h - obstacles.reduce((a, o) => a + (o.right - o.left) * (o.bottom - o.top), 0);
            R.B = Math.min(1.25, Math.max(.9, Math.min(innerWidth / 1440, innerHeight / 900)));
            R.N = Math.max(20, Math.min(42, Math.round(32 * Math.pow(Math.max(area, 1) / 1.105e6, .75))));
            // T052：大螢幕或瀏覽器縮小（Ctrl −）時，張數照「可用面積 ÷ 卡片面積（R.B²）」等比例增加，維持和 1440×900 差不多的密度（不靠放大卡片）。
            // 只有算出來超過 42 張才啟用（R.wide），所以 1440×900、1920×1080 以下和手機完全不變
            const nLin = 32 * Math.max(area, 1) / 1.105e6 / (R.B * R.B);
            R.wide = nLin > 42;
            if (R.wide) R.N = Math.min(SC_N_MAX, Math.round(nLin));
            // 驗收 A2：每 20px 取樣一個沒有障礙物的點，用來算九宮格各格的可用面積比例和卡片覆蓋率
            const pts = [], cellPts = new Array(9).fill(0);
            for (let y = R.y + 10; y < R.y + R.h; y += 20) for (let x = R.x + 10; x < R.x + R.w; x += 20) {
                if (obstacles.some(o => x >= o.left && x <= o.right && y >= o.top && y <= o.bottom)) continue;
                pts.push(x, y); cellPts[scCell(x, y, R)]++;
            }
            R.freePts = pts; R.cellFree = cellPts.map(n => n / Math.max(1, pts.length / 2)); R.seed = 0;
            return R;
        }
        function scCell(x, y, R) { return Math.max(0, Math.min(2, Math.floor((y - R.y) / R.h * 3))) * 3 + Math.max(0, Math.min(2, Math.floor((x - R.x) / R.w * 3))); }
        // 卡片外框聯集占可用面積的比例（取樣點估計）
        function scCoverage(placed, R) {
            const P = R.freePts; if (!P || !P.length) return 1;
            const boxes = placed.map(c => [c.cx + c.full[0], c.cy + c.full[1], c.cx + c.full[2], c.cy + c.full[3]]);
            let hit = 0;
            for (let i = 0; i < P.length; i += 2) { const x = P[i], y = P[i + 1]; if (boxes.some(b => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3])) hit++; }
            return hit / (P.length / 2);
        }
        function scMakeItem(m, maxLikes, isStar, B, presetDepth) {
            const depth = presetDepth || scDepthOf(m, maxLikes, isStar);
            const c = { m, depth, z: SC_Z[depth] + Math.random() * .9, rot: scRange(-SC_ROT[depth], SC_ROT[depth]) };
            if (Math.abs(c.rot) < 1.5) c.rot += c.rot < 0 ? -1.5 : 1.5;
            c.el = createCard(m, maxLikes, 1, 1);
            c.el.style.visibility = 'hidden';
            wall.appendChild(c.el);
            scSizeCard(c.el, m, SC_DEPTH[depth] * B);
            return c;
        }
        function scLivePlaced() { wallState.placed = (wallState.placed || []).filter(c => c.el.isConnected && !c.el.classList.contains('fading')); return wallState.placed; }
        function scRecomputeCover(placed) {
            placed.forEach(p => { p._cov = 0; });
            placed.forEach((p, i) => placed.slice(0, i).forEach(q => { const ov = scOverlap(p, q); if (p.z > q.z) q._cov += ov; else p._cov += ov; }));
        }
        // 驗收用：依實際 z-index 檢查「上層外框蓋到下層文字區」的次數，應為 0（拖曳過的卡不算）
        function scAudit() {
            const placed = scLivePlaced().filter(c => !c.el._dragged);
            let v = 0;
            placed.forEach(a => placed.forEach(b => { if (a !== b && +a.el.style.zIndex > +b.el.style.zIndex && scSat(scQuad(a, a.full), scQuad(b, b.text))) v++; }));
            return v;
        }
        window.__avatar = { initialsOf, avatarColorOf, AVATAR_COLORS };   // 測試用
        window.__wallSwapLog = () => (wallState.swapLog || []).slice();
        window.__wallAudit = () => ({ violations: scAudit(), count: scLivePlaced().length, target: wallState.R ? wallState.R.N : 0, wide: !!(wallState.R && wallState.R.wide), layoutMs: wallState.layoutMs || 0,
            coverage: wallState.R ? Math.round(scCoverage(scLivePlaced(), wallState.R) * 100) / 100 : 0,
            minTextPx: Math.min(...scLivePlaced().map(c => 15 * (parseFloat(c.el.style.getPropertyValue('--s')) || 1))),
            // 九宮格每格卡數（左上→右下）；幾乎被障礙物占滿的格子（可用面積 < 2%）記為 null，不列入驗收
            cells: wallState.R && wallState.R.cellFree ? (() => { const R = wallState.R, n = new Array(9).fill(0); scLivePlaced().forEach(c => n[scCell(c.cx, c.cy, R)]++); return n.map((v, k) => R.cellFree[k] < .02 ? null : v); })() : [],
            emptyBlocks: wallState.R ? scEmptyBlocks(scLivePlaced(), wallState.R) : 0 });
        // 驗收用：牆面切成 6×4 塊，可用面積過半、卻幾乎沒有卡（覆蓋 < 5%）的塊數＝「大片空白」
        function scEmptyBlocks(placed, R) {
            const P = R.freePts; if (!P || !P.length) return 0;
            const boxes = placed.map(c => [c.cx + c.full[0], c.cy + c.full[1], c.cx + c.full[2], c.cy + c.full[3]]);
            const tot = new Array(24).fill(0), hit = new Array(24).fill(0), all = new Array(24).fill(0);
            for (let y = R.y + 10; y < R.y + R.h; y += 20) for (let x = R.x + 10; x < R.x + R.w; x += 20) all[Math.min(3, Math.floor((y - R.y) / R.h * 4)) * 6 + Math.min(5, Math.floor((x - R.x) / R.w * 6))]++;
            for (let i = 0; i < P.length; i += 2) {
                const x = P[i], y = P[i + 1], b = Math.min(3, Math.floor((y - R.y) / R.h * 4)) * 6 + Math.min(5, Math.floor((x - R.x) / R.w * 6));
                tot[b]++; if (boxes.some(q => x >= q[0] && x <= q[2] && y >= q[1] && y <= q[3])) hit[b]++;
            }
            return tot.filter((t, b) => t >= all[b] * .5 && hit[b] < t * .05).length;
        }
        // 輪播換卡（4.8.3）：新卡的景深照新卡自己的規則（至尊、人氣王景深不用在輪播卡），先在整面牆找 120 個候選位置，
        // 找不到合法位置才退回舊位置半徑 80px 內找 60 個；都不行這次不換
        function scSwapCard(oldEl, newMsg, relocate) {
            const oldC = oldEl._c; if (!oldC) return false;
            const placed = scLivePlaced().filter(c => c !== oldC);
            scRecomputeCover(placed);
            const d0 = scDepthOf(newMsg, wallState.maxLikes, false);
            const c = { m: newMsg };
            c.el = createCard(newMsg, wallState.maxLikes, 1, 1); c.el.style.visibility = 'hidden'; wall.appendChild(c.el);
            const setDepth = (depth) => {
                const sameZ = placed.filter(p => p.depth === depth).map(p => p.z);
                c.depth = depth; c.z = Math.max(SC_Z[depth], ...sameZ) + .01; c.rot = scRange(-SC_ROT[depth], SC_ROT[depth]);
                if (Math.abs(c.rot) < 1.5) c.rot += c.rot < 0 ? -1.5 : 1.5;
                scSizeCard(c.el, newMsg, SC_DEPTH[depth] * wallState.R.B); scMeasure(c);
            };
            setDepth(d0 === 'admin' || d0 === 'star' ? 'mid' : d0);
            const R = wallState.R, oldAt = { x: oldC.cx, y: oldC.cy, r: 80 };
            // 1) 整面牆找空位（避開舊位置）
            // 2) 牆面太滿找不到時：挑一張遠處的卡 B 搬進舊卡的位置，新卡放到 B 原本的位置附近（新卡就不會出現在舊卡的位置）
            // 3) 都不行：用舊卡的景深在舊位置附近找；還是不行這次不換。每一步都照原本的合法規則（文字區、重疊上限、障礙物）
            let ok = scFindSpot(c, placed, R, 160, null, { x: oldC.cx, y: oldC.cy, r: Math.max(120, (oldC.w + oldC.h) / 3) });
            let moved = null;
            if (!ok && relocate) { // 只有輪播換卡會搬動別張卡；新留言上牆時照舊只換掉一張
                const far = wallShuffle(placed.filter(p => p.depth !== 'admin' && p.depth !== 'star' && p.el !== currentFocusedCard && p.el !== activeDragCard
                    && !p.el._dragged && !p.el.matches(':hover') && Math.hypot(p.cx - oldC.cx, p.cy - oldC.cy) > 250)).slice(0, 3);
                for (const b of far) {
                    const from = { x: b.cx, y: b.cy, r: 80 }, others = placed.filter(q => q !== b);
                    scRecomputeCover(others);
                    if (scFindSpot(b, others, R, 60, oldAt)) {
                        scRecomputeCover(placed);
                        if (scFindSpot(c, placed, R, 80, from)) { moved = b; ok = true; break; }
                    }
                    [b.cx, b.cy] = [from.x, from.y]; b._qFull = null; b._qText = null; scRecomputeCover(placed);
                }
            }
            if (!ok) { if (c.depth !== oldC.depth && oldC.depth !== 'admin' && oldC.depth !== 'star') setDepth(oldC.depth); ok = scFindSpot(c, placed, R, 60, oldAt); }
            if (!ok) { c.el.remove(); return false; }
            if (moved) scPlace(moved, 0);
            (wallState.swapLog || (wallState.swapLog = [])).push(Math.round(Math.hypot(c.cx - oldC.cx, c.cy - oldC.cy))); // 驗收用：新舊位置距離
            if (wallState.swapLog.length > 60) wallState.swapLog.shift();
            oldEl.classList.add('fading');
            setTimeout(() => oldEl.remove(), 300);
            scPlace(c, 0); scCommit(c, placed); scRestack(placed);
            wallState.placed = placed;
            enforceFxBudget();
            return true;
        }

        function maybeStartRotation() {
            if (wallState.layout && wallState.layout.isMobile) return; // 手機不輪播
            if (wallState.rotationTimer || wallState.dealing || wallState.validCount <= 2) return;
            startRotation(currentRenderGen);
        }

        // 資料變動（按讚、編輯、新留言、刪除、登入狀態改變）：只更新需要變的卡片，不整面洗牌
        function refreshWall() {
            if (!messagesLoaded) return;
            if (typeof listState !== 'undefined' && listState.mode === 'list') { wallState.rendered = false; return; } // 回到牆面時再重畫
            if (!wallState.rendered) return renderWall();
            if (wallState.month !== tpeMonthKey(nowMs())) { mobileShown = MOBILE_PAGE; return renderWall(); } // 頁面開著跨過 1 號 00:00：整面重排（上個月的卡全部下牆）
            const validMessages = getValidMessages();
            if (validMessages.length === 0 || wallState.validCount === 0) return renderWall();

            const byId = new Map(validMessages.map(m => [m.id, m]));
            wallState.byId = byId;
            wallState.validCount = validMessages.length;
            const maxLikes = computeMaxLikes(validMessages);
            wallState.maxLikes = maxLikes;

            const known = new Set(wallState.pending);
            wall.querySelectorAll('.message-card').forEach(card => {
                const id = card.getAttribute('data-id');
                if (card.style.pointerEvents === 'none') { known.add(id); return; } // 輪播淡出中
                const m = byId.get(id);
                if (!m) {
                    if (card === currentFocusedCard) closeFocus();
                    if (card === activeDragCard) activeDragCard = null;
                    card.remove();
                    return;
                }
                known.add(id);
                if (card._sig !== cardSignature(m, maxLikes)) applyCardContent(card, m, maxLikes);
            });

            wallState.queue = wallState.queue.filter(m => byId.has(m.id) && !known.has(m.id)).map(m => byId.get(m.id));
            wallState.queue.forEach(m => known.add(m.id));
            wallState.hidden = wallState.hidden.filter(m => byId.has(m.id) && !known.has(m.id)).map(m => byId.get(m.id));
            wallState.hidden.forEach(m => known.add(m.id));

            const newMessages = validMessages.filter(m => !known.has(m.id))
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            if (newMessages.length > 0) {
                if (wallState.dealing) {
                    wallState.queue.unshift(...newMessages);
                    wallState.displayTotal += newMessages.length;
                } else {
                    placeNewCards(newMessages.slice(0, wallState.safeMax));
                    wallState.hidden.push(...newMessages.slice(wallState.safeMax));
                }
            }
            if (!wallState.dealing) { trimExcessCards(); maybeStartRotation(); enforceFxBudget(); }
        }

        function placeNewCards(list) {
            const L = wallState.layout;
            if (L.isMobile) { // 手機：新卡放在最上面
                list.slice().reverse().forEach((m, i) => wall.insertBefore(mobileCard(m, wallState.maxLikes, i), wall.firstChild));
                mobileShown += list.length;
                return;
            }
            const R = wallState.R; if (!R) return;
            list.forEach((m) => {
                const placed = scLivePlaced();
                scRecomputeCover(placed);
                const c = scMakeItem(m, wallState.maxLikes, false, R.B);
                c.depth = 'near'; c.z = SC_Z.near + .95; scSizeCard(c.el, m, SC_DEPTH.near * R.B); scMeasure(c);
                if (scFindSpot(c, placed, R, 420)) { scCommit(c, placed); scPlace(c, 0); scRestack(placed); return; }
                c.el.remove();
                const victims = placed.filter(p => p.depth !== 'admin' && p.depth !== 'star' && p.el !== currentFocusedCard && p.el !== activeDragCard).sort((a, b) => a.z - b.z);
                for (const v of victims.slice(0, 6)) {
                    if (scSwapCard(v.el, m)) { wallState.hidden.push(v.m); return; }
                }
                wallState.hidden.unshift(m);
            });
            enforceFxBudget();
        }

        // 牆上卡片超過上限時，把最底層的卡片收回輪播池
        function trimExcessCards() {
            if (isFilterMeOnly || (wallState.layout && wallState.layout.isMobile)) { updateMoreButton(); return; }
            const cards = Array.from(wall.querySelectorAll('.message-card:not(.focused):not(.dragging)'))
                .filter(c => c.style.pointerEvents !== 'none');
            const live = Array.from(wall.querySelectorAll('.message-card')).filter(c => c.style.pointerEvents !== 'none').length;
            let excess = live - wallState.safeMax;
            if (excess <= 0) return;
            cards.sort((a, b) => parseInt(a.style.zIndex) - parseInt(b.style.zIndex));
            for (const c of cards) {
                if (excess <= 0) break;
                if (c._msg) wallState.hidden.push(c._msg);
                c.remove(); excess--;
            }
        }

        // 換掉牆上的一張卡（4.8.3：下一張由 wallPickNext 依新舊比例、萬聖卡優先挑選）
        function rotateOne(c) {
            const live = scLivePlaced();
            const onWall = new Set(live.map(p => p.m.id));
            const pool = wallState.hidden.filter(m => !onWall.has(m.id) && wallState.byId.has(m.id)).map(m => wallState.byId.get(m.id));
            const wallMsgs = live.map(p => p.m);
            const t0 = performance.now();
            for (let tries = 0; tries < 3 && pool.length && (!tries || performance.now() - t0 < 35); tries++) {
                const msg = wallPickNext(pool, c.m, wallMsgs);
                if (!msg) return false;
                pool.splice(pool.indexOf(msg), 1);
                if (scSwapCard(c.el, msg, true)) {
                    wallState.hidden = wallState.hidden.filter(m => m.id !== msg.id);
                    wallState.hidden.push(c.m);
                    wallNoteSwapOut(c.m.id);
                    return true;
                }
            }
            return false;
        }
        // 測試用：立刻換 n 張（照輪播的規則挑要換下的卡），回傳實際換了幾張
        window.__wallRotate = (n = 2) => {
            let done = 0;
            for (let i = 0; i < n; i++) {
                const eligible = wallShuffle(scLivePlaced().filter(c => c.depth !== 'admin' && c.depth !== 'star' && !c.el._dragged && c.el !== currentFocusedCard));
                for (let tries = 0; tries < 3 && eligible.length; tries++) if (rotateOne(eligible.shift())) { done++; break; }
            }
            return done;
        };
        function startRotation(myGen) {
            // 4.8.3：每 WALL_ROTATE_MS（5 秒）換 WALL_ROTATE_COUNT（3）張，間隔 WALL_ROTATE_GAP；不換：滑鼠停留、拖曳、放大中的卡、管理員卡、人氣王
            wallState.rotationTimer = setInterval(() => {
                if (myGen !== currentRenderGen) return;
                if (document.hidden || activeDragCard || currentFocusedCard || !themePicker.hidden) return;
                const eligible = scLivePlaced().filter(c => c.depth !== 'admin' && c.depth !== 'star' && !c.el.matches(':hover') && !c.el._dragged);
                for (let i = eligible.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [eligible[i], eligible[j]] = [eligible[j], eligible[i]]; }
                for (let k = 0; k < WALL_ROTATE_COUNT; k++) setTimeout(() => {
                    if (myGen !== currentRenderGen || document.hidden || activeDragCard || currentFocusedCard || !themePicker.hidden) return;
                    // 這張換不了（找不到位置、萬聖卡保底）就換下一張候選，每格最多試 3 張；超過 35ms 就留到下一輪，避免卡住畫面
                    const t0 = performance.now();
                    for (let tries = 0; tries < 3 && eligible.length && performance.now() - t0 < 35; tries++) {
                        const c = eligible.shift();
                        if (!c.el.isConnected || c.el.classList.contains('fading') || c.el.matches(':hover') || c.el._dragged) { tries--; continue; }
                        if (rotateOne(c)) return;
                    }
                }, k * WALL_ROTATE_GAP);
            }, WALL_ROTATE_MS);
            // 每 10 分鐘整面重排一次（使用者正在操作時延後）
            wallState.relayoutTimer = setInterval(() => {
                if (myGen !== currentRenderGen) return;
                if (document.hidden || activeDragCard || currentFocusedCard || !themePicker.hidden || document.querySelector('.focus-overlay.active')) return;
                renderWall();
            }, 10 * 60 * 1000);
        }

        // 4.8：視窗大小改變時延遲重畫，而且只在寬度改變時才重畫（手機叫出鍵盤只改高度，不會整面洗牌）
        let resizeTimer = null; let lastWallWidth = window.innerWidth;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (window.innerWidth === lastWallWidth) return;
                lastWallWidth = window.innerWidth;
                mobileShown = MOBILE_PAGE;
                renderWall();
            }, 250);
        });

        // 活動模式由伺服器決定（開頁時的 events.active）。分頁開著時如果跨過活動的開始或結束時間（10/18 00:00、10/31 結束）：
        // 先向伺服器確認活動狀態真的換了（避免活動被延長時白白重新整理），然後——
        // 使用者沒有在打字、沒有開著彈窗 → 自動重新整理切換；否則顯示提示，讓使用者自己按重新整理（4.8 原本的做法）。
        let eventPromptShown = false, bootEventKey = '', eventChecking = false;
        function eventKeyByTime() { const n = nowMs(); return (checkIsHalloween(n) ? 'h' : '') + (checkIsMidAutumn(n) ? 'm' : ''); }
        function eventKeyByServer() { return (IS_HALLOWEEN ? 'h' : '') + (IS_MID_AUTUMN ? 'm' : ''); }
        function reloadFresh() { reloadWithDraft(); }
        async function handleEventBoundary() {
            if (eventPromptShown || eventChecking || !messagesLoaded || eventKeyByTime() === bootEventKey) return; // 開頁後還沒跨過活動時間
            eventChecking = true;
            let serverKey;
            try {
                const d = await api('GET', 'api/bootstrap');
                const active = (d.events && Array.isArray(d.events.active)) ? d.events.active : [];
                serverKey = (active.includes('hw2026') ? 'h' : '') + (active.includes('midautumn2026') ? 'm' : '');
            } catch (e) { return; } finally { eventChecking = false; }
            if (serverKey === eventKeyByServer()) { bootEventKey = eventKeyByTime(); return; } // 伺服器的活動狀態沒變：不用重新整理
            eventPromptShown = true;
            const busy = msgInput.value.trim() !== '' || attachedImageBase64 || currentFocusedCard ||
                document.querySelector('.focus-overlay.active');
            if (!busy) { reloadFresh(); return; }
            const box = document.getElementById('forceUpdateBox');
            const h2 = box.querySelector('h2'); const p = box.querySelector('p');
            if (h2) h2.textContent = '活動時間更新囉！';
            if (p) p.textContent = '請點擊下方按鈕重新整理，看看最新的活動畫面。';
            const btn = document.getElementById('forceUpdateBtn');
            if (btn) btn.onclick = reloadFresh;
            document.getElementById('forceUpdateOverlay').style.display = 'flex';
            document.getElementById('forceUpdateOverlay').classList.add('active');
        }
        setInterval(handleEventBoundary, 30000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) handleEventBoundary(); });
        function scheduleEventBoundaryTimers() {
            [HW_EVENT_START, HW_EVENT_END + 1000].forEach(t => {
                const delta = t - nowMs();
                if (delta > 0 && delta < 2147483000) setTimeout(handleEventBoundary, delta + 1000); // 準時在切換點後 1 秒檢查
            });
        }

        // 4.8（設計 R9）：Esc 關閉放大的卡片和彈窗（新手引導與強制更新不受影響）
        const ESC_CLOSERS = [['editOverlay', 'cancelEditBtn'], ['drawOverlay', 'cancelDrawBtn'], ['levelUpOverlay', 'closeLevelUpBtn'],
            ['leaderboardOverlay', 'closeLeaderboard'], ['guideOverlay', 'closeGuide'], ['rulesOverlay', 'closeRules'],
            ['hwOverlay', 'closeHwStory']];
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (closeReveal(true)) { e.preventDefault(); return; }
            if (!themePicker.hidden) { closePicker(true); e.preventDefault(); return; }
            if (document.getElementById('luScrim')) { closeLevelUp(true); e.preventDefault(); return; }
            if (!document.getElementById('lmFocus').hidden) { closeListFocus(); e.preventDefault(); return; }
            for (const [ov, btn] of ESC_CLOSERS) {
                if (document.getElementById(ov).classList.contains('active')) { document.getElementById(btn).click(); e.preventDefault(); return; }
            }
            if (currentFocusedCard) { closeFocus(); e.preventDefault(); return; }
            if (nrHandleEscape()) e.preventDefault();
        });
        const pauseObserver = new MutationObserver(updatePauseState);
        document.querySelectorAll('.focus-overlay').forEach(ov => pauseObserver.observe(ov, { attributes: true, attributeFilter: ['class'] }));
        const overlayReturnFocus = new Map();
        const overlayObserver = new MutationObserver(records => {
            records.forEach(r => {
                const ov = r.target; const active = ov.classList.contains('active');
                if (active && !overlayReturnFocus.has(ov)) {
                    overlayReturnFocus.set(ov, document.activeElement);
                    setTimeout(() => { const f = ov.querySelector('[data-autofocus]') || ov.querySelector('.close-btn, button, [href], input, textarea'); if (f && ov.classList.contains('active')) f.focus({ preventScroll: true }); }, 60);
                } else if (!active && overlayReturnFocus.has(ov)) {
                    const back = overlayReturnFocus.get(ov); overlayReturnFocus.delete(ov);
                    if (back && back.isConnected && back !== document.body && typeof back.focus === 'function') back.focus({ preventScroll: true });
                }
            });
        });
        document.querySelectorAll('.focus-overlay').forEach(ov => { if (ov.id !== 'focusOverlay') overlayObserver.observe(ov, { attributes: true, attributeFilter: ['class'] }); });

        // ================= 4.8 清單模式（設計 §14）：資料和牆面共用 rawMessages；每次開頁預設牆面 =================
        const listView = document.getElementById('listView');
        const lmFocus = document.getElementById('lmFocus');
        const LIST_PAGE = 30;
        const listState = { mode: 'wall', query: '', filter: 'all', sort: 'new', shown: LIST_PAGE, items: [], focusId: null, observer: null };
        const LIST_BAR_CLASS = { 'theme-classic': 'lt-classic', 'theme-sage': 'lt-sage', 'theme-lemon': 'lt-lemon', 'theme-slate': 'lt-slate', 'theme-lavender': 'lt-lavender',
            'theme-matcha': 'lt-matcha', 'theme-ice': 'lt-ice', 'theme-midnight': 'lt-midnight', 'theme-wine': 'lt-wine', 'theme-terracotta': 'lt-terracotta', 'theme-moonlight': 'lt-moon',
            'theme-halloween': 'lt-halloween', 'theme-neon': 'lt-r-neon', 'theme-holo': 'lt-r-holo', 'theme-gold': 'lt-r-gold', 'theme-cosmic': 'lt-r-cosmic', 'theme-ultimate': 'lt-r-ultimate', 'theme-admin': 'lt-admin' };
        function setViewMode(mode) {
            if (mode === listState.mode) return;
            listState.mode = mode;
            if (mode === 'list' && MB.pop) { MB.pop = false; mbRender(); }   // 感謝榜浮層跟著收起
            document.querySelectorAll('.view-switch .vs-wall').forEach(b => b.setAttribute('aria-pressed', String(mode === 'wall')));
            document.querySelectorAll('.view-switch .vs-list').forEach(b => b.setAttribute('aria-pressed', String(mode === 'list')));
            document.body.classList.toggle('mode-list', mode === 'list');
            listView.hidden = mode !== 'list';
            if (mode === 'list') {
                if (currentFocusedCard) closeFocus();
                stopWallTimers();
                listState.shown = LIST_PAGE;
                positionListView(); renderList();
            } else {
                closeListFocus();
                if (!wallState.rendered) renderWall(); else maybeStartRotation();
            }
            updatePauseState();
        }
        document.querySelectorAll('.view-switch .vs-wall').forEach(b => b.addEventListener('click', () => { playSound('click'); setViewMode('wall'); }));
        document.querySelectorAll('.view-switch .vs-list').forEach(b => b.addEventListener('click', () => { playSound('click'); setViewMode('list'); }));
        // 桌機：清單上緣＝標題膠囊底 + 14、下緣＝撰寫區頂 − 12
        function positionListView() {
            if (window.innerWidth <= 768) { // 手機：工具列黏在頂欄下方（頂欄高度依萬聖進度條而不同）
                listView.style.top = ''; listView.style.bottom = '';
                listView.style.setProperty('--tb', Math.round(document.querySelector('.topbar').getBoundingClientRect().height) + 'px');
                listView.style.setProperty('--lt', Math.round(listView.querySelector('.list-tools').getBoundingClientRect().height) + 'px');
                return;
            }
            const brand = document.querySelector('.brand').getBoundingClientRect();
            const comp = document.getElementById('composerWrap').getBoundingClientRect();
            listView.style.top = Math.round(brand.bottom + 14) + 'px';
            listView.style.bottom = Math.round(window.innerHeight - comp.top + 12) + 'px';
        }
        window.addEventListener('resize', () => { if (listState.mode === 'list') positionListView(); });
        function listSourceMessages() { return rawMessages; }   // 清單顯示全部留言（不限天數；卓倫 2026-10-28）
        function isMineMsg(m) { return !!m.isMine; }
        function isToMe(m) { return !!m.toMe; }
        function listFiltered() {
            const q = listState.query.trim().toLowerCase();
            let list = listSourceMessages();
            if (listState.filter === 'tome') list = list.filter(isToMe);
            else if (listState.filter === 'mine') list = list.filter(isMineMsg);
            // 搜尋只比對畫面上顯示的文字：收件人、內容、顯示出來的寄件人名稱（匿名卡就是面具稱號，不比對真實作者）
            if (q) list = list.filter(m => [m.receiver, m.text, m.author || '匿名'].some(v => String(v || '').toLowerCase().includes(q)));
            if (listState.sort === 'likes') list = list.slice().sort((a, b) => (likeCountOf(b) - likeCountOf(a)) || ((b.timestamp || 0) - (a.timestamp || 0)));
            return list;
        }
        function markFirst(text, q) {
            const safe = escapeHtml(text);
            if (!q) return safe;
            const i = String(text).toLowerCase().indexOf(q.toLowerCase());
            if (i < 0) return safe;
            return escapeHtml(text.slice(0, i)) + '<mark>' + escapeHtml(text.slice(i, i + q.length)) + '</mark>' + escapeHtml(text.slice(i + q.length));
        }
        const pad2 = (n) => String(n).padStart(2, '0');
        function listRowHtml(m, q) {
            const theme = displayThemeOf(m);
            const author = m.author || '匿名';
            const mask = !m.author || !!m.anonymous;
            const d = new Date(m.timestamp || 0);
            const time = listState.sort === 'likes' ? `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
            const likes = likeCountOf(m); const hasLiked = !!m.likedByMe;
            const likeWord = IS_HALLOWEEN ? '給糖' : IS_MID_AUTUMN ? '送月餅' : '讚';
            const icon = IS_HALLOWEEN ? CANDY_SVG : IS_MID_AUTUMN ? '<span aria-hidden="true">🥮</span>' : HEART_SVG;
            const tier = THEME_PIPS[theme] ? `<span class="lr-tier" aria-hidden="true">${'<i></i>'.repeat(THEME_PIPS[theme])}</span>` : '';
            const crown = theme === 'theme-admin' ? '<span class="lr-supreme"><svg class="crown-mini" viewBox="0 0 60 48" aria-hidden="true"><path d="M8 36 L5 14 L18 24 L30 6 L42 24 L55 14 L52 36 Z" fill="currentColor"/></svg>至尊</span>' : '';
            const img = safeImageUrl(m.image);
            const avColor = mask ? '' : `style="background:${avatarColorOf(m.authorKey, author, m.avatarColor)}"`;
            const avPhoto = mask ? '' : safeImageUrl(m.avatarUrl);
            return (avPhoto ? `<img class="lr-av" src="${escapeHtml(avPhoto)}" alt="" aria-hidden="true" decoding="async">`
                    : `<div class="lr-av${mask ? ' is-mask' : ''}" ${avColor} aria-hidden="true">${escapeHtml(mask ? '?' : (m.initials || initialsOf(author)))}</div>`)
                + `<div class="lr-main"><div class="lr-head">${m.receiver ? `<span class="lr-to">To: ${markFirst(m.receiver, q)}</span>　` : ''}來自 <b>${markFirst(author, q)}</b>${isMineMsg(m) ? '<span class="lr-mine">我</span>' : ''}${tier}${crown}</div>`
                + `<p class="lr-text">${markFirst(m.text || '', q)}</p>${img ? `<img class="lr-thumb" src="${escapeHtml(img)}" alt="附圖" loading="lazy">` : ''}</div>`
                + `<div class="lr-side"><time>${time}</time><button type="button" class="like card-likes${hasLiked ? ' on liked' : ''}" aria-label="${likeWord}，目前 ${likes}" aria-pressed="${hasLiked ? 'true' : 'false'}">${icon}${likes || likeWord}</button></div>`;
        }
        function listRowEl(m, q) {
            const li = document.createElement('li');
            li.className = `list-row ${LIST_BAR_CLASS[displayThemeOf(m)] || 'lt-classic'}`;
            li.dataset.id = m.id; li.tabIndex = 0; li.setAttribute('role', 'button');
            const likes = likeCountOf(m);
            li.setAttribute('aria-label', `給 ${m.receiver || '大家'} 的感謝，來自 ${m.author || '匿名'}，${likes} ${IS_HALLOWEEN ? '顆糖' : '個讚'}`);
            li.innerHTML = listRowHtml(m, q);
            return li;
        }
        function dayLabel(ts) {
            const d = new Date(ts || 0), today = new Date(nowMs()); today.setHours(0, 0, 0, 0);
            const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
            const wk = '日一二三四五六'[d.getDay()];
            return (diff === 0 ? '今天・' : diff === 1 ? '昨天・' : '') + `${d.getMonth() + 1}/${d.getDate()}（${wk}）`;
        }
        function listEmptyHtml(title, desc, btn, action) {
            return `<div class="list-empty"><svg viewBox="0 0 96 96" aria-hidden="true"><rect x="18" y="20" width="46" height="46" rx="8" transform="rotate(-8 41 43)" fill="#fde68a"/><circle cx="58" cy="58" r="14" fill="none" stroke="#9f1239" stroke-width="5"/><path d="M68 68l12 12" stroke="#9f1239" stroke-width="6" stroke-linecap="round"/></svg><h3>${escapeHtml(title)}</h3><p>${desc}</p><button type="button" data-action="${action}">${btn}</button></div>`;
        }
        function renderList() {
            if (listState.mode !== 'list') return;
            const body = document.getElementById('listBody'), meta = document.getElementById('listMeta'), endText = document.getElementById('listEndText'), more = document.getElementById('listMore');
            document.getElementById('listSortLikes').textContent = IS_HALLOWEEN ? '最多糖果' : '最多讚';
            if (!messagesLoaded) {
                meta.textContent = '正在載入所有感謝…';
                body.innerHTML = '<div class="list-sk"></div>'.repeat(7); endText.textContent = ''; more.hidden = true; return;
            }
            const q = listState.query.trim();
            const list = listFiltered(); listState.items = list;
            const sortName = listState.sort === 'likes' ? (IS_HALLOWEEN ? '最多糖果' : '最多讚') : '最新';
            meta.innerHTML = (q || listState.filter !== 'all') ? `找到 <b>${list.length}</b> 則・${sortName}` : `全部 <b>${list.length}</b> 則感謝・${sortName}`;
            body.innerHTML = '';
            if (!list.length) {
                if (q) body.innerHTML = listEmptyHtml(`找不到「${q}」相關的感謝`, '換個關鍵字試試，或搜尋同事的英文名。匿名卡只會比對面具稱號。', '清除搜尋', 'clear');
                else if (listState.filter === 'tome') body.innerHTML = listEmptyHtml('還沒有送給你的感謝', '先送出一張感謝，也許很快就會收到回禮。', '看全部', 'all');
                else if (listState.filter === 'mine') body.innerHTML = listEmptyHtml('你還沒送出感謝', '寫一句謝謝，貼上牆給同事一個驚喜。', '看全部', 'all');
                else body.innerHTML = listEmptyHtml('還沒有任何感謝', '成為第一個送出感謝的人吧！', '寫第一張', 'write');
                endText.textContent = ''; more.hidden = true; return;
            }
            appendListRows(0, Math.min(listState.shown, list.length));
            updateListEnd();
        }
        function appendListRows(from, to) {
            const body = document.getElementById('listBody');
            const q = listState.query.trim(), list = listState.items;
            let ul = body.querySelector('.list-rows:last-of-type');
            let lastDay = ul ? ul.dataset.day : null;
            for (let i = from; i < to; i++) {
                const m = list[i];
                if (listState.sort === 'new') {
                    const day = dayLabel(m.timestamp);
                    if (day !== lastDay) {
                        const h = document.createElement('div'); h.className = 'list-day'; h.textContent = day; body.appendChild(h);
                        ul = document.createElement('ul'); ul.className = 'list-rows'; ul.dataset.day = day; body.appendChild(ul); lastDay = day;
                    }
                } else if (!ul) { ul = document.createElement('ul'); ul.className = 'list-rows'; body.appendChild(ul); }
                ul.appendChild(listRowEl(m, q));
            }
        }
        function updateListEnd() {
            const total = listState.items.length, shown = Math.min(listState.shown, total);
            document.getElementById('listEndText').textContent = shown < total ? `已顯示 ${shown}／${total} 則・捲到底會自動載入` : '已經到底了';
            document.getElementById('listMore').hidden = shown >= total;
        }
        function loadMoreList() {
            const total = listState.items.length;
            if (listState.shown >= total) return;
            const from = listState.shown;
            listState.shown = Math.min(total, listState.shown + LIST_PAGE);
            appendListRows(from, listState.shown);
            updateListEnd();
        }
        document.getElementById('listMore').addEventListener('click', loadMoreList);
        // 備援：捲得很快（或按 End）時，IntersectionObserver 可能沒察覺「離開又回到底部」而不再觸發（留言 850+ 則、清單不限天數後才遇得到）。
        // 捲動時自己檢查一次是否接近底部
        function listNearEnd() {
            const e = document.getElementById('listEnd').getBoundingClientRect();
            const bottom = window.innerWidth > 768 ? document.getElementById('listScroll').getBoundingClientRect().bottom : window.innerHeight;
            return e.height > 0 && e.top < bottom + 400;
        }
        let listScrollRaf = null;
        const onListScroll = () => {
            if (listScrollRaf || listState.mode !== 'list') return;
            listScrollRaf = requestAnimationFrame(() => { listScrollRaf = null; if (listState.mode === 'list' && listState.shown < listState.items.length && listNearEnd()) loadMoreList(); });
        };
        document.getElementById('listScroll').addEventListener('scroll', onListScroll, { passive: true });
        window.addEventListener('scroll', onListScroll, { passive: true });
        // 捲到底自動載入（提前 400px）；「載入更多」按鈕當作備援
        if ('IntersectionObserver' in window) {
            listState.observer = new IntersectionObserver((entries) => {
                if (listState.mode === 'list' && entries.some(e => e.isIntersecting)) loadMoreList();
            }, { root: window.innerWidth > 768 ? document.getElementById('listScroll') : null, rootMargin: '0px 0px 400px 0px' });
            listState.observer.observe(document.getElementById('listEnd'));
        }
        let listSearchTimer = null;
        const listSearch = document.getElementById('listSearch');
        listSearch.addEventListener('input', () => {
            document.getElementById('listClear').hidden = !listSearch.value;
            clearTimeout(listSearchTimer);
            listSearchTimer = setTimeout(() => { listState.query = listSearch.value; listState.shown = LIST_PAGE; renderList(); }, 200);
        });
        function clearListSearch() { listSearch.value = ''; listState.query = ''; document.getElementById('listClear').hidden = true; listState.shown = LIST_PAGE; renderList(); listSearch.focus(); }
        document.getElementById('listClear').addEventListener('click', clearListSearch);
        document.querySelectorAll('.list-seg button').forEach(b => b.addEventListener('click', () => {
            if (b.dataset.filter !== 'all' && !currentUser) return showToast('請先登入才能篩選自己的感謝喔！');
            listState.filter = b.dataset.filter;
            document.querySelectorAll('.list-seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
            listState.shown = LIST_PAGE; renderList();
        }));
        document.getElementById('listSort').addEventListener('change', (e) => { listState.sort = e.target.value; listState.shown = LIST_PAGE; renderList(); });
        document.getElementById('listBody').addEventListener('click', (e) => {
            const act = e.target.closest('.list-empty button');
            if (act) {
                const a = act.dataset.action;
                if (a === 'clear') clearListSearch();
                else if (a === 'all') document.querySelector('.list-seg button[data-filter="all"]').click();
                else if (a === 'write') { const r = document.getElementById('receiverInput'); if (r && r.offsetParent) r.focus(); else showToast('請先登入再寫感謝卡喔！'); }
                return;
            }
            const row = e.target.closest('.list-row'); if (!row) return;
            const msg = messageById.get(row.dataset.id); if (!msg) return;
            if (e.target.closest('.like')) { e.stopPropagation(); toggleLikeFor(msg); return; } // 點讚不會打開放大卡
            openListFocus(msg, row);
        });
        document.getElementById('listBody').addEventListener('keydown', (e) => {
            const row = e.target.closest && e.target.closest('.list-row');
            if (!row || e.target !== row || (e.key !== 'Enter' && e.key !== ' ')) return;
            e.preventDefault(); row.click();
        });
        // 點一列：打開和牆面同一個放大卡（createCard），掛在 #lmFocus
        function openListFocus(msg, row) {
            playSound('click');
            listState.focusId = msg.id; listState.focusReturn = row || null;
            const card = createCard(msg, computeMaxLikes(listSourceMessages()), 1, 1);
            card.classList.add('focused'); armFocusedImage(card);
            const d = new Date(msg.timestamp || 0);
            const own = isMineMsg(msg);
            lmFocus.innerHTML = '';
            const stage = document.createElement('div'); stage.className = 'lm-focus-stage' + (safeImageUrl(msg.image) ? ' with-image' : '');
            const bar = document.createElement('div'); bar.className = 'lm-focus-bar';
            bar.innerHTML = `<time>${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}</time><span class="sp"></span>`
                + (own ? '<button type="button" class="lm-act" data-act="edit">✏️ 編輯</button><button type="button" class="lm-act danger" data-act="del">🗑️ 刪除</button>' : '')
                + '<button type="button" class="lm-act primary" data-act="close" aria-label="關閉">✕</button>';
            stage.appendChild(card); stage.appendChild(bar); lmFocus.appendChild(stage);
            lmFocus.hidden = false;
            bar.addEventListener('click', (e) => {
                const b = e.target.closest('.lm-act'); if (!b) return;
                e.stopPropagation();
                if (b.dataset.act === 'close') return closeListFocus();
                const inner = lmFocus.querySelector(b.dataset.act === 'edit' ? '.edit-msg-btn' : '.del-msg-btn');
                if (inner) inner.click();
            });
            infectFromCard(msg);
            updatePauseState();
            setTimeout(() => { const c = bar.querySelector('[data-act="close"]'); if (c) c.focus({ preventScroll: true }); }, 60);
        }
        lmFocus.addEventListener('click', (e) => { if (e.target === lmFocus) closeListFocus(); });
        function closeListFocus() {
            if (lmFocus.hidden) return;
            lmFocus.hidden = true; lmFocus.innerHTML = '';
            const id = listState.focusId; listState.focusId = null;
            updatePauseState();
            const row = id && document.querySelector(`.list-row[data-id="${CSS.escape(id)}"]`);
            if (row) row.focus({ preventScroll: true });
        }
        // 資料變動時同步清單：讚數、內容更新；刪除的列淡出移除
        window.__listRefresh = () => refreshListView();   // 測試用
        function refreshListView() {
            if (listState.mode !== 'list') return;
            const card = lmFocus.querySelector('.message-card');
            if (card && listState.focusId) {
                const m = messageById.get(listState.focusId);
                if (!m) closeListFocus();
                else { const maxL = computeMaxLikes(listSourceMessages()); if (card._sig !== cardSignature(m, maxL)) { applyCardContent(card, m, maxL); card.classList.add('focused'); armFocusedImage(card); } }
            }
            const scroller = window.innerWidth > 768 ? document.getElementById('listScroll') : document.scrollingElement;
            const top = scroller.scrollTop;
            const list = listFiltered();
            const ids = new Set(list.map(m => m.id));
            const prevIds = (listState.items || []).map(m => m.id);
            const sameSet = prevIds.length === list.length && prevIds.every(id => ids.has(id));
            if (sameSet) { // 只更新內容（讚數、編輯）
                listState.items = list;
                const byIdNow = new Map(list.map(x => [x.id, x]));
                document.querySelectorAll('#listBody .list-row').forEach(row => {
                    const m = byIdNow.get(row.dataset.id); if (!m) return;
                    const fresh = listRowEl(m, listState.query.trim());
                    if (fresh.innerHTML !== row.innerHTML) { row.innerHTML = fresh.innerHTML; row.className = fresh.className; row.setAttribute('aria-label', fresh.getAttribute('aria-label')); }
                });
                return;
            }
            const removed = prevIds.filter(id => !ids.has(id));
            const added = list.length - (prevIds.length - removed.length);
            if (removed.length && added === 0) { // 刪除：淡出後移除，結果數減少
                removed.forEach(id => { const row = document.querySelector(`.list-row[data-id="${CSS.escape(id)}"]`); if (row) { row.classList.add('fading-out'); setTimeout(() => row.remove(), 200); } });
                listState.items = list;
                const meta = document.getElementById('listMeta'); const b = meta.querySelector('b'); if (b) b.textContent = list.length;
                updateListEnd();
                return;
            }
            renderList(); scroller.scrollTop = top;
        }

        // 4.8：手機撰寫列只顯示頭像、內容、送出；點進去才展開感謝誰、樣式、匿名等欄位
        const composerEl = document.getElementById('composer');
        composerEl.addEventListener('focusin', () => composerEl.classList.add('expanded'));
        document.addEventListener('click', (e) => {
            if (composerEl.contains(document.activeElement)) return;   // 焦點已經在撰寫列（例如按「開始寫第一張」直接把焦點送進來）：不要收起
            if (!composerEl.contains(e.target) && !themePicker.contains(e.target) && !msgInput.value.trim() && !receiverInput.value.trim()) composerEl.classList.remove('expanded');
        });
        document.getElementById('userAvatar').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.target.click(); } });

        // ================= 萬聖夜巡名冊（萬聖人類名單/GDD.md 第 5、9、10 節；設計稿 萬聖人類名單/design/） =================
        // 入口、提示泡泡、名冊面板只替「活動期間、本人已變身」的人建立；人類的畫面裡沒有任何名冊元素（不是用 CSS 藏）。
        // 名冊、預告、誰會變身全部由伺服器計算（api/hw/roster、api/hw/tag-preview、送出回應的 hw），前台只負責顯示。
        const NR_BAT_PATH = 'M32 10c2-4 4-6 4-6l1 5c3-1 6 0 8 2 4-3 10-4 19-2-6 2-9 6-10 11-3-3-7-4-10-2 0 3-1 6-3 8-2-3-6-4-9-3-3-1-7 0-9 3-2-2-3-5-3-8-3-2-7-1-10 2-1-5-4-9-10-11 9-2 15-1 19 2 2-2 5-3 8-2l1-5s2 2 4 6z';
        const NR_SVG = {
            pen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
            bat: `<svg class="rr-bat" viewBox="0 0 64 36" aria-hidden="true"><path fill="#fdba74" d="${NR_BAT_PATH}"/></svg>`,
            lanternEmpty: '<svg viewBox="0 0 120 120" aria-hidden="true"><defs><radialGradient id="nrLg" cx="50%" cy="60%" r="50%"><stop offset="0" stop-color="#fdba74" stop-opacity=".55"/><stop offset="1" stop-color="#fdba74" stop-opacity="0"/></radialGradient></defs><circle cx="60" cy="66" r="50" fill="url(#nrLg)"/><path d="M48 30h24M60 18v12" stroke="#fdba74" stroke-width="4" stroke-linecap="round"/><path d="M44 36h32l4 10v40l-6 8H46l-6-8V46z" fill="#2a1748" stroke="#fdba74" stroke-width="3" stroke-linejoin="round"/><path d="M52 50h16v30H52z" fill="#fdba74" opacity=".25"/><path d="M60 58c4 5 4 10 0 14-4-4-4-9 0-14z" fill="#fdba74"/><path d="M84 92l14 12" stroke="#c9b6e6" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 7"/></svg>',
            fullMoon: `<svg viewBox="0 0 180 180" aria-hidden="true"><defs><radialGradient id="nrFm" cx="40%" cy="38%" r="65%"><stop offset="0" stop-color="#fffbeb"/><stop offset=".55" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/></radialGradient></defs><circle cx="90" cy="90" r="62" fill="url(#nrFm)"/><circle cx="70" cy="74" r="9" fill="#f59e0b" opacity=".18"/><circle cx="108" cy="104" r="13" fill="#f59e0b" opacity=".15"/><circle cx="104" cy="66" r="5" fill="#f59e0b" opacity=".2"/><g fill="#1b1036"><path transform="translate(22 30) scale(.7)" d="${NR_BAT_PATH}"/><path transform="translate(112 118) scale(.55)" d="${NR_BAT_PATH}"/><path transform="translate(120 34) scale(.45)" d="${NR_BAT_PATH}"/></g></svg>`,
            mask: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M6 22c8-6 18-6 26 0 8-6 18-6 26 0 0 14-6 24-15 24-6 0-9-5-11-9-2 4-5 9-11 9C12 46 6 36 6 22z" fill="#fdba74"/><path d="M14 28c3-3 8-3 11 0-3 4-8 4-11 0zM39 28c3-3 8-3 11 0-3 4-8 4-11 0z" fill="#1b1036"/><path d="M6 22L2 16M58 22l4-6" stroke="#fdba74" stroke-width="3" stroke-linecap="round"/></svg>',
            moonBat: `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="22" fill="#fde68a"/><path transform="translate(12 22) scale(.62)" fill="#1b1036" d="${NR_BAT_PATH}"/></svg>`,
            cards: '<svg viewBox="0 0 40 34" aria-hidden="true"><rect x="10" y="2" width="26" height="18" rx="4" transform="rotate(10 23 11)" fill="#3b2366" stroke="#fdba74" stroke-width="1.5"/><rect x="6" y="7" width="26" height="18" rx="4" transform="rotate(-4 19 16)" fill="#2c1b52" stroke="#fdba74" stroke-width="1.5"/><rect x="3" y="13" width="26" height="18" rx="4" fill="#26153f" stroke="#fb923c" stroke-width="1.8"/><path d="M8 20h12M8 25h8" stroke="#fdba74" stroke-width="1.8" stroke-linecap="round"/></svg>',
        };
        // GDD 第 5 節原文；T060 S20（卓倫 2026-10-28 同意）：「我們不咬人」改成「這次不用咬」，和故事彈窗、卓倫信裡的「被咬」一致
        const NR_T1 = {
            a: n => `<p class="lead">夜深了，城裡還有 <b>${n}</b> 位人類沒被找到。</p><p class="lead2">這次不用咬，只要帶一張寫滿謝意的卡。卡片落到誰手上，誰就加入我們。</p>`,
            b: n => `<p class="lead">名冊越翻越薄了，只剩 <b>${n}</b> 位人類還在街上。</p><p class="lead2">他們可能在外頭奔波、在機台前忙著，還沒機會抬頭看看。替他們寫一張卡吧。</p>`,
            c: n => `<p class="lead">只剩最後 <b>${n}</b> 個名字。整座城都在等他們。</p>`,
            d: '<p class="last-night"><span aria-hidden="true">🌘</span><span>今晚是最後的夜巡，月亮下山前送出的卡都算數。</span></p>',
        };
        // 卓倫 2026-10-27：送出當下所有收件人都變身，沒有人數上限
        const NR_RULE = '<p class="roster-rule">卡片送出的那一刻，寫在上面的每一位人類都會加入我們，不必等他們上線。名冊只有吸血鬼看得見。</p>';
        const nrWide = () => window.innerWidth >= 1280;
        const nrMobile = () => window.innerWidth <= 768;

        // 吸血鬼看得到名冊；管理員不論是否變身都看得到（卓倫 2026-10-27）。看名冊不會讓人變身
        function rosterEligible() { return IS_HALLOWEEN && !NR.forbidden && !!(ME && (ME.is_admin || (ME.hw && ME.hw.infected))) && checkIsHalloween(nowMs()); }
        // updateFestivalUI 每次都會呼叫：該有就建立、不該有就整個移除
        function syncRoster() {
            const row = document.getElementById('hwProgressRow');
            if (row && hwInfectedLoaded) row.hidden = !IS_HALLOWEEN;
            if (rosterEligible()) { if (!NR.built) buildRoster(); }
            else if (NR.built) destroyRoster();
        }
        function buildRoster() {
            NR.built = true;
            const holder = document.createElement('div');
            holder.className = 'roster-entry-holder'; holder.style.cssText = 'position:relative;flex:none';
            holder.innerHTML = '<button type="button" class="roster-entry" id="rosterEntry" aria-expanded="false" aria-controls="roster" title="夜巡名冊">'
                + '<span class="re-ic" aria-hidden="true">🔦</span><span class="re-label">夜巡名冊</span><span class="re-sep" aria-hidden="true"></span>'
                + '<span class="re-count"><b>…</b> 位人類還在逃</span><span class="re-num" aria-hidden="true">…</span></button>';
            document.getElementById('hwProgressRow').appendChild(holder);
            NR.holder = holder; NR.entry = holder.querySelector('#rosterEntry');
            NR.entry.addEventListener('click', () => { playSound('click'); if (NR.open) closeRoster(true); else openRoster(); });

            const P = document.createElement('aside');
            P.className = 'roster'; P.id = 'roster'; P.dataset.state = 'closed';
            P.setAttribute('role', 'dialog'); P.setAttribute('aria-labelledby', 'rosterTitle'); P.setAttribute('aria-modal', 'false');
            P.innerHTML = `<div class="roster-bar"><span class="grab" aria-hidden="true"></span><h2 id="rosterTitle" tabindex="-1">🔦 夜巡名冊</h2>
                <button type="button" class="roster-close" aria-label="關閉夜巡名冊"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
                <div class="roster-scroll" id="rosterScroll"><div class="roster-story" id="rosterStory"></div>
                <div class="roster-search" role="search"><div class="sf"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
                <input type="search" id="rosterQ" placeholder="找找看你想謝的人…" aria-label="搜尋名冊上的姓名" autocomplete="off" maxlength="40">
                <span class="sf-meta" id="rosterMeta" aria-live="polite"></span><button type="button" class="sf-clear" id="rosterClear" aria-label="清除搜尋" hidden>✕</button></div></div>
                <div id="rosterBody"></div></div>`;
            P.inert = true;
            document.body.appendChild(P);
            NR.panel = P;
            P.querySelector('.roster-close').addEventListener('click', () => { playSound('click'); closeRoster(true); });
            const q = P.querySelector('#rosterQ');
            q.addEventListener('input', () => { NR.q = q.value; renderRosterBody(); });
            P.querySelector('#rosterClear').addEventListener('click', () => clearRosterSearch());
            P.querySelector('#rosterBody').addEventListener('click', (e) => {
                const b = e.target.closest('button'); if (!b) return;
                if (b.classList.contains('roster-write')) { const li = b.closest('.roster-row'); if (li) rosterWriteTo(li.dataset.uid, li.dataset.name); }
                else if (b.dataset.act === 'clear') clearRosterSearch();
                else if (b.dataset.act === 'retry') { playSound('click'); fetchRoster(true); }
                else if (b.dataset.act === 'back') { playSound('click'); closeRoster(true); }
            });
            P.addEventListener('keydown', (e) => {          // 手機是全螢幕的強制視窗：焦點鎖在名冊裡
                if (e.key !== 'Tab' || P.getAttribute('aria-modal') !== 'true') return;
                trapFocus(P, e);
            });
            updateEntryCount();
            if (!prefGet('hw2026_roster_seen')) showRosterTip();
            fetchRoster(false);                             // 先拿剩餘人數給入口顯示
        }
        function destroyRoster() {
            if (NR.open) closeRoster(false);
            if (NR.holder) NR.holder.remove();
            if (NR.panel) NR.panel.remove();
            document.body.classList.remove('roster-open');
            Object.assign(NR, { built: false, holder: null, entry: null, tip: null, panel: null, data: null, remaining: null, state: 'idle', q: '', open: false, pressed: null, turning: new Set() });
            NR.fetchSeq++;
        }
        function trapFocus(root, e) {
            const f = Array.from(root.querySelectorAll('button, input, [href], [tabindex]:not([tabindex="-1"])')).filter(el => !el.disabled && !el.hidden && el.getClientRects().length);
            if (!f.length) return;
            const first = f[0], last = f[f.length - 1];
            if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
        function updateEntryCount() {
            if (!NR.entry) return;
            const n = NR.remaining == null ? '…' : String(NR.remaining);
            NR.entry.querySelector('.re-count b').textContent = n;
            NR.entry.querySelector('.re-num').textContent = n;
            NR.entry.setAttribute('aria-label', NR.remaining == null ? '夜巡名冊' : `夜巡名冊，${n} 位人類還在逃`);
        }
        // 第一次的提示泡泡（看過即不再出現：hw2026_roster_seen）；不搶焦點
        function showRosterTip() {
            if (!NR.holder || NR.tip) return;
            const tip = document.createElement('div');
            tip.className = 'roster-tip'; tip.id = 'rosterTip'; tip.setAttribute('role', 'note'); tip.setAttribute('aria-label', '新任務提示');
            tip.innerHTML = '<button type="button" class="tip-close" aria-label="關閉提示">✕</button>'
                + '<p>🦇 新任務到了。始祖把一本泛黃的名冊交到你手上，上面記著還沒被找到的人類。挑一個你想謝謝的人吧。</p>'
                + '<div class="tip-actions"><button type="button" class="nr-btn primary">翻開名冊</button></div>';
            NR.holder.appendChild(tip);
            NR.tip = tip; NR.entry.classList.add('is-new');
            tip.querySelector('.tip-close').addEventListener('click', () => { playSound('click'); hideRosterTip(true); });
            tip.querySelector('.nr-btn').addEventListener('click', () => { playSound('click'); openRoster(); });
            positionRosterTip();
        }
        function positionRosterTip() {
            if (!NR.tip || !NR.entry) return;
            if (nrMobile()) {
                const r = NR.entry.getBoundingClientRect();
                NR.tip.style.setProperty('--tip-top', Math.round(r.bottom + 14) + 'px');
                NR.tip.style.setProperty('--tip-arrow', Math.round(window.innerWidth - 12 - r.right + r.width / 2 - 7) + 'px');
            } else { NR.tip.style.removeProperty('--tip-top'); NR.tip.style.setProperty('--tip-arrow', Math.round(NR.entry.offsetWidth / 2 - 7) + 'px'); }
        }
        window.addEventListener('resize', () => { positionRosterTip(); placeTagPreview(); if (NR.panel) NR.panel.setAttribute('aria-modal', NR.open && nrMobile() ? 'true' : 'false'); });
        function hideRosterTip(markSeen) {
            if (markSeen && !prefGet('hw2026_roster_seen')) prefSet('hw2026_roster_seen', '1');
            if (NR.tip) { NR.tip.remove(); NR.tip = null; }
            if (NR.entry) NR.entry.classList.remove('is-new');
        }

        async function fetchRoster(showLoading) {
            if (!NR.built) return;
            const seq = ++NR.fetchSeq;
            if (showLoading || !NR.data) { NR.state = 'loading'; if (NR.open) renderRoster(); }
            try {
                const d = await api('GET', 'api/hw/roster');
                if (seq !== NR.fetchSeq || !NR.built) return;
                NR.data = { remaining: Number(d.remaining) || 0, total: Number(d.total) || 0,
                    thanked: Array.isArray(d.thanked_me) ? d.thanked_me : [], others: Array.isArray(d.others) ? d.others : [] };
                NR.remaining = NR.data.remaining; NR.state = 'ready';
            } catch (e) {
                if (seq !== NR.fetchSeq || !NR.built) return;
                if (e.status === 403) { NR.forbidden = true; destroyRoster(); return; }   // 活動結束或身分改變：直接收起，不顯示錯誤
                NR.state = NR.data ? 'ready' : 'error';                                  // 已經有名單時保留舊的，不打擾
            }
            updateEntryCount();
            if (NR.open) renderRoster();
        }
        function scheduleRosterRefetch(ms) {
            clearTimeout(NR.refetchTimer);
            NR.refetchTimer = setTimeout(() => { if (NR.turning.size) return scheduleRosterRefetch(400); if (NR.open) fetchRoster(false); }, ms);
        }
        function openRoster() {
            if (!NR.panel) return;
            hideRosterTip(true);
            const P = NR.panel;
            NR.open = true; P.dataset.state = 'open'; P.inert = false; P.setAttribute('aria-modal', nrMobile() ? 'true' : 'false');
            document.body.classList.add('roster-open');
            NR.entry.setAttribute('aria-expanded', 'true');
            renderRoster();
            fetchRoster(!NR.data);
            // 桌機游標直接進搜尋框；手機不自動聚焦（會彈出鍵盤蓋住名單），焦點放標題
            setTimeout(() => { if (!NR.open) return; if (nrMobile()) P.querySelector('#rosterTitle').focus({ preventScroll: true }); else P.querySelector('#rosterQ').focus({ preventScroll: true }); }, 60);
            updatePauseState();
        }
        function closeRoster(returnFocus) {
            if (!NR.panel || !NR.open) return;
            NR.open = false; NR.panel.dataset.state = 'closed'; NR.panel.inert = true; NR.pressed = null;
            document.body.classList.remove('roster-open');
            if (NR.entry) { NR.entry.setAttribute('aria-expanded', 'false'); if (returnFocus) NR.entry.focus({ preventScroll: true }); }
            updatePauseState();
        }
        function clearRosterSearch() {
            const q = NR.panel && NR.panel.querySelector('#rosterQ'); if (!q) return;
            q.value = ''; NR.q = ''; renderRosterBody(); q.focus({ preventScroll: true });
        }
        function nrStoryHtml(d) {
            const n = d.remaining;
            const lastNight = taipeiDay(nowMs()) === taipeiDay(HW_EVENT_END);
            return NR_T1[n > 50 ? 'a' : n > 10 ? 'b' : 'c'](n) + (lastNight ? NR_T1.d : '') + NR_RULE;
        }
        function renderRoster() {
            const P = NR.panel; if (!P) return;
            const d = NR.data, ready = NR.state === 'ready' && d;
            const complete = !!(ready && d.thanked.length + d.others.length === 0);
            P.classList.toggle('is-complete', complete);
            P.querySelector('#rosterStory').innerHTML = ready && !complete ? nrStoryHtml(d) : '';
            renderRosterBody();
        }
        function nrHighlight(name, q) {
            if (!q) return escapeHtml(name);
            const k = name.toLowerCase().indexOf(q.toLowerCase());
            if (k < 0) return escapeHtml(name);
            return escapeHtml(name.slice(0, k)) + '<mark>' + escapeHtml(name.slice(k, k + q.length)) + '</mark>' + escapeHtml(name.slice(k + q.length));
        }
        function nrRowHtml(h, q) {
            const name = String(h.name || ''), uid = String(h.user_id || '');
            const turning = NR.turning.has(uid);
            return `<li class="roster-row${turning ? ' is-turning' : ''}" data-uid="${escapeHtml(uid)}" data-name="${escapeHtml(name)}">${NR_SVG.bat}`
                + `<span class="rr-av" style="background:${avatarColorOf(uid, name, h.avatar_color)}" aria-hidden="true">${escapeHtml(initialsOf(name))}</span>`
                + `<span class="rr-name">${nrHighlight(name, q)}</span>${turning ? '<span class="rr-done">🦇 已變身</span>' : ''}`
                + `<button type="button" class="roster-write" aria-label="寫萬聖卡給 ${escapeHtml(name)}"${NR.pressed === uid ? ' aria-pressed="true"' : ''}>${NR_SVG.pen}寫萬聖卡給他</button></li>`;
        }
        function renderRosterBody() {
            const P = NR.panel; if (!P) return;
            const body = P.querySelector('#rosterBody'), meta = P.querySelector('#rosterMeta'), qEl = P.querySelector('#rosterQ');
            const q = String(NR.q || '').trim();
            P.querySelector('#rosterClear').hidden = !NR.q;
            qEl.classList.remove('has-meta'); meta.textContent = '';
            const d = NR.data;
            if (NR.state === 'loading' || (NR.state !== 'error' && !d)) {
                body.innerHTML = Array.from({ length: 8 }, () => '<div class="roster-sk" aria-hidden="true"><i></i><i></i><i></i></div>').join('') + '<p class="nr-sr" role="status">名冊載入中</p>';
                return;
            }
            if (NR.state === 'error') {
                body.innerHTML = `<div class="roster-empty" role="status">${NR_SVG.lanternEmpty}<p>名冊被夜風吹亂了，等一下再翻翻看。</p><button type="button" class="nr-btn primary" data-act="retry">再試一次</button></div>`;
                return;
            }
            if (d.thanked.length + d.others.length === 0) {
                body.innerHTML = `<div class="roster-empty full-moon" role="status">${NR_SVG.fullMoon}<h3>🌕 整座城都醒著</h3><p>名冊上一個名字都不剩了。${d.total} 位同事全部成了我們的一員。</p><p>今晚沒有人類可以找，只剩彼此。去牆上給同伴們發幾顆糖吧。</p><button type="button" class="nr-btn primary" data-act="back">回到感謝牆</button></div>`;
                return;
            }
            const f = a => q ? a.filter(h => String(h.name || '').toLowerCase().includes(q.toLowerCase())) : a;
            const t = f(d.thanked), o = f(d.others);
            if (q && !t.length && !o.length) {
                body.innerHTML = `<div class="roster-empty" role="status">${NR_SVG.lanternEmpty}<p>名冊上找不到「${escapeHtml(q)}」。他可能已經變身了，或名字寫法不一樣。</p><button type="button" class="nr-btn ghost" data-act="clear">清除搜尋</button></div>`;
                return;
            }
            if (q) { meta.innerHTML = `找到 <b>${t.length + o.length}</b> 位`; qEl.classList.add('has-meta'); }
            let h = '';
            if (t.length) h += `<section class="roster-sec thanked" aria-labelledby="rosterSecT"><div class="roster-sec-h"><h3 id="rosterSecT">🕯️ 他們曾經謝過你</h3><span class="cnt">${t.length} 位</span></div><p class="sub">現在換你回禮了。</p><ul class="roster-list">${t.map(x => nrRowHtml(x, q)).join('')}</ul></section>`;
            h += `<section class="roster-sec" aria-labelledby="rosterSecO"><div class="roster-sec-h"><h3 id="rosterSecO">🌙 還在逃的人類</h3><span class="cnt">${o.length} 位</span></div><ul class="roster-list">${o.map(x => nrRowHtml(x, q)).join('')}</ul></section>`;
            body.innerHTML = h;
        }
        // 「寫萬聖卡給他」：帶入收件人、選萬聖模板、游標進內文（GDD 第 10 節）
        function rosterWriteTo(uid, name) {
            if (!name) return;
            playSound('click');
            const cur = receiverInput.value.trim().replace(/,\s*$/, '');
            const parts = cur ? cur.split(',').map(x => x.trim()).filter(Boolean) : [];
            if (!parts.length) receiverInput.value = name;
            else if (canMultiTag()) { if (!parts.includes(name)) parts.push(name); receiverInput.value = parts.join(', '); }
            else { receiverInput.value = name; if (parts.join(',') !== name) showToast(`原本的收件人已換成 ${name}`); }
            if (document.querySelector('.theme-hw-btn')) { themeManuallySelected = true; currentTheme = 'theme-halloween'; syncPickerState(); }
            if (nrWide()) { NR.pressed = uid; NR.panel.querySelectorAll('.roster-write').forEach(b => { if (b.closest('.roster-row').dataset.uid === uid) b.setAttribute('aria-pressed', 'true'); else b.removeAttribute('aria-pressed'); }); }
            else closeRoster(false);                             // 寬度不夠並排：先收起名冊
            if (nrMobile()) composerEl.classList.add('expanded');
            msgInput.focus({ preventScroll: true });
            scheduleTagPreview(0);
        }

        // ---- 寫卡預告（T6）：停止輸入 400ms 後問伺服器；等回應時保留上一次的預告，不閃成空白 ----
        let tpTimer = null, tpSeq = 0;
        function tagPreviewWanted() { return IS_HALLOWEEN && currentTheme === 'theme-halloween' && !!ME && (isCurrentUserVampire || !!ME.is_admin) && checkIsHalloween(nowMs()); }
        function currentReceiver() { return receiverInput.value.trim().replace(/,\s*$/, ''); }
        function scheduleTagPreview(delay = 400) {
            clearTimeout(tpTimer);
            const receiver = currentReceiver();
            if (!tagPreviewWanted() || !receiver || receiver === '大家') { tpSeq++; renderTagPreview(null); return; }
            tpTimer = setTimeout(async () => {
                const seq = ++tpSeq;
                try {
                    const r = await api('POST', 'api/hw/tag-preview', { receiver });
                    if (seq !== tpSeq) return;
                    renderTagPreview({ turn: Array.isArray(r.turn) ? r.turn.map(String) : [] });
                } catch (e) {
                    if (seq !== tpSeq) return;
                    if (e.status === 403) renderTagPreview(null);   // 其他錯誤（斷線、太頻繁）：保留上一次的預告
                }
            }, delay);
        }
        function tpNames(a) { return a.map(n => `<b>${escapeHtml(n)}</b>`).join('、'); }
        function renderTagPreview(p) {
            let el = document.getElementById('tagPreview');
            if (!p || !p.turn.length) { if (el) el.remove(); return; }   // 收件人都已是吸血鬼：不顯示
            if (!el) { el = document.createElement('div'); el.id = 'tagPreview'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); }
            el.className = 'tag-preview';
            el.innerHTML = `<span class="tp-text"><span class="tp-turn">🦇 卡片送出的那一刻，${tpNames(p.turn)} 就會加入我們。</span></span>`;
            placeTagPreview(el);
        }
        // 桌機放在撰寫區上方（和撰寫區同寬）；手機放在展開的撰寫區裡、送出鈕正上方
        function placeTagPreview(el) {
            el = el || document.getElementById('tagPreview'); if (!el) return;
            if (nrMobile()) { const send = document.getElementById('sendBtn'); if (el.nextSibling !== send) composerEl.insertBefore(el, send); }
            else if (el.nextSibling !== composerEl) inputPanel.insertBefore(el, composerEl);
        }
        receiverInput.addEventListener('input', () => scheduleTagPreview());
        receiverInput.addEventListener('change', () => scheduleTagPreview(0));

        // ---- 送出後（T7）：提示、進度跳格、名冊列的動畫 ----
        let hwChangedStamp = 0, rosterChangedStamp = 0;
        function hwSentStamps() { return { hw: hwChangedStamp, roster: rosterChangedStamp }; }
        function onHwSent(hw, stamps) {
            const turned = Array.isArray(hw.turned) ? hw.turned.map(String) : [];
            if (!turned.length) return;                                  // 收件人都已經是吸血鬼：照常是一張感謝卡
            const nm = a => escapeHtml(a.join('、'));
            showHwSentToast(`🦇 卡片送出了！<b>${nm(turned)}</b> 已經變身，進度條往前走了 ${turned.length} 格。在 Teams 跟他們說一聲，他們會想來看看是誰找到了他們。`);
            // 推播通常比回應先到：已經收到就不再自己加，避免算兩次
            if (hwInfo && stamps.hw === hwChangedStamp) { hwInfo.infected_count = (Number(hwInfo.infected_count) || 0) + turned.length; updateFestivalUI(); }
            hwBump(turned.length);
            if (NR.built) {
                if (stamps.roster === rosterChangedStamp && NR.remaining != null) { NR.remaining = Math.max(0, NR.remaining - turned.length); updateEntryCount(); }
                if (NR.data) {                                       // 故事裡的人數立刻跟著更新
                    if (NR.remaining != null) NR.data.remaining = NR.remaining;
                    if (NR.open && NR.state === 'ready') NR.panel.querySelector('#rosterStory').innerHTML = nrStoryHtml(NR.data);
                }
                if (NR.open && NR.data && NR.state === 'ready') {
                    const names = new Set(turned), uids = [];
                    NR.data.thanked.concat(NR.data.others).forEach(h => { if (names.has(String(h.name))) uids.push(String(h.user_id)); });
                    uids.forEach(u => NR.turning.add(u));
                    renderRosterBody();
                    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                    setTimeout(() => {
                        const gone = new Set(uids);
                        NR.data.thanked = NR.data.thanked.filter(h => !gone.has(String(h.user_id)));
                        NR.data.others = NR.data.others.filter(h => !gone.has(String(h.user_id)));
                        uids.forEach(u => NR.turning.delete(u));
                        if (NR.remaining != null) NR.data.remaining = NR.remaining;
                        renderRoster(); scheduleRosterRefetch(300);
                    }, reduced ? 350 : 900);
                }
            }
        }
        function showHwSentToast(mainHtml) {
            const el = document.getElementById('wallToast');
            const wrap = document.getElementById('composerWrap');
            if (window.innerWidth <= 768 && wrap && wrap.getClientRects().length) el.style.bottom = Math.round(window.innerHeight - wrap.getBoundingClientRect().top + 10) + 'px';
            else el.style.bottom = '';
            el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
            el.innerHTML = `<span class="ts-ic" aria-hidden="true">🦇</span><div><p class="ts-main">${mainHtml}</p></div>`;
            el.classList.add('hw-sent', 'show');
            clearTimeout(toastTimer); clearTimeout(hwToastTimer);
            hwToastTimer = setTimeout(() => el.classList.remove('show'), 8000);
        }
        function hwBump(n) {
            const a = document.getElementById('hwBump'), fill = document.getElementById('hwProgressFill');
            if (!a) return;
            a.innerHTML = `<span class="hw-bump">+${n}</span>`;
            fill.classList.add('is-bumping');
            setTimeout(() => { a.innerHTML = ''; fill.classList.remove('is-bumping'); }, 1600);
        }

        // ---- 揭曉畫面「你被找到了」（T5）：看過（關閉或按任何按鈕）就寫 hw2026_reveal_seen ----
        const revealDismissed = new Set();
        let infectAnimUntil = 0;
        function revealWanted(rv) {
            return !!(rv && rv.infection_id && !revealDismissed.has(rv.infection_id) && prefGet('hw2026_reveal_seen') !== rv.infection_id);
        }
        function maybeShowReveal() {
            const rv = ME && ME.hw && ME.hw.reveal;
            if (!revealWanted(rv) || document.getElementById('rvScrim') || Date.now() < infectAnimUntil) return;
            if (document.getElementById('onboardingOverlay').classList.contains('active')) return;   // 先看完歡迎視窗，關掉後再顯示
            showReveal(rv);
        }
        function showReveal(rv) {
            if (!revealWanted(rv) || document.getElementById('rvScrim')) return;
            const by = rv.by || { kind: 'gone' };
            const msg = rv.message_id ? messageById.get(rv.message_id) : null;
            const also = Number(rv.also) || 0;
            const ALSO = also > 0 && by.kind !== 'gone' ? `<div class="rv-also">${NR_SVG.cards}<span>而且不只一張，還有 <b>${also}</b> 張萬聖卡也在等你打開。</span></div>` : '';
            let emblem, body;
            const later = '<button type="button" class="nr-btn ghost" data-act="later">稍後再看</button>';
            // 還沒登入過的始祖被萬聖卡帶走（伺服器 reveal.progenitor）：用「喚醒始祖」的說法
            const wake = rv.progenitor ? '你是感謝牆最常道謝的始祖之一，這張卡把還在沉睡的你喚醒了。' : '';
            if (by.kind === 'named') {
                const name = String(by.name || '');
                emblem = `<div class="rv-emblem"><span class="rv-av" style="background:${avatarColorOf(msg && msg.authorKey, name)}" aria-hidden="true">${escapeHtml(initialsOf(name))}</span><span class="rv-badge" aria-hidden="true">🦇</span></div>`;
                body = `<p class="rv-line">你不在的時候，<span class="rv-name">${escapeHtml(name)}</span>寫了一張萬聖卡給你。</p>${ALSO}<p class="rv-body">${wake || '卡片落到你手上的那一刻，你就成了我們的一員。'}<b>萬聖模板已經為你解鎖。</b></p>
                    <div class="rv-actions">${later}<button type="button" class="nr-btn primary" data-act="open">看看他寫了什麼</button></div>`;
            } else if (by.kind === 'mask') {
                // 假面卡只有面具名稱，不顯示任何頭像或縮寫；非萬聖的匿名卡沒有面具名稱，用「一位不具名的同伴」（GDD 第 10 節）
                const line = by.mask_name ? `你不在的時候，一位戴著<span class="rv-name">${escapeHtml(String(by.mask_name))}</span>面具的同伴，悄悄留了一張萬聖卡給你。`
                    : '你不在的時候，<span class="rv-name">一位不具名的同伴</span>悄悄留了一張萬聖卡給你。';
                emblem = `<div class="rv-emblem">${NR_SVG.mask}</div>`;
                body = `<p class="rv-line">${line}</p>${ALSO}<p class="rv-body">${wake || '面具下是誰，只有夜晚知道。'}<b>萬聖模板已經為你解鎖。</b></p>
                    <div class="rv-actions">${later}<button type="button" class="nr-btn primary" data-act="open">看看這張卡</button></div>`;
            } else {
                emblem = `<div class="rv-emblem">${NR_SVG.moonBat}</div>`;
                body = '<p class="rv-line" style="font-size:17px">你不在的時候，有位同伴用一張萬聖卡把你帶進了夜裡。</p><p class="rv-body">' + wake + '<b>萬聖模板已經為你解鎖。</b></p>'
                    + '<div class="rv-actions"><button type="button" class="nr-btn primary" data-act="later">去感謝牆逛逛</button></div>';
            }
            const bats = `<div class="rv-bats" aria-hidden="true">${[[8, 18, .9], [16, 70, .6], [78, 62, .7], [86, 30, .5], [30, 8, .45]].map(([x, y, s], k) => `<svg viewBox="0 0 64 36" style="left:${x}%;top:${y}%;transform:scale(${s});animation-delay:${k * -1.3}s"><path d="${NR_BAT_PATH}"/></svg>`).join('')}</div>`;
            const scrim = document.createElement('div');
            scrim.className = 'rv-scrim'; scrim.id = 'rvScrim';
            scrim.innerHTML = `<div class="rv-moon" aria-hidden="true"></div>${bats}<div class="rv" role="dialog" aria-modal="true" aria-labelledby="rvTitle" aria-describedby="rvDesc">${emblem}<p class="eyebrow">HALLOWEEN NIGHT</p><h2 id="rvTitle">🦇 你被找到了</h2><div id="rvDesc">${body}</div><p class="rv-foot">想一起找人，名冊就在進度條旁邊；想慢慢逛也沒關係，感謝牆一切照常。</p></div>`;
            scrim._reveal = rv;
            document.body.appendChild(scrim);
            scrim.addEventListener('click', (e) => {                       // 點遮罩不關閉（避免手機誤觸就再也看不到）
                const b = e.target.closest('button[data-act]'); if (!b) return;
                playSound('click');
                closeReveal(true);
                if (b.dataset.act === 'open' && msg) setTimeout(() => openListFocus(msg, null), 80);
            });
            scrim.addEventListener('keydown', (e) => { if (e.key === 'Tab') trapFocus(scrim.querySelector('.rv'), e); });
            updatePauseState();
            setTimeout(() => { const p = scrim.querySelector('.nr-btn.primary'); if (p) p.focus({ preventScroll: true }); }, 60);
        }
        function closeReveal(returnFocus) {
            const scrim = document.getElementById('rvScrim'); if (!scrim) return false;
            const rv = scrim._reveal;
            if (rv && rv.infection_id) { revealDismissed.add(rv.infection_id); prefSet('hw2026_reveal_seen', rv.infection_id); }
            scrim.remove();
            updatePauseState();
            if (returnFocus && receiverInput.offsetParent) receiverInput.focus({ preventScroll: true });
            if (IS_HALLOWEEN && !hasSeenHwStory()) setTimeout(showHalloweenStory, 400);
            return true;
        }
        // Esc：揭曉畫面 → 名冊（其他彈窗照原本的順序）
        function nrHandleEscape() {
            if (closeReveal(true)) return true;
            if (NR.open) { closeRoster(true); return true; }
            if (NR.tip) { hideRosterTip(true); return true; }
            return false;
        }

        // 4.8：沒有任何資料前先顯示載入提示；6 秒還沒到就改一句話
        setTimeout(() => { if (!messagesLoaded && !wallLoadingEl.classList.contains('error')) { setWallLoadingText('還在準備中，再等我一下下…'); document.getElementById('wallLoadingRetry').hidden = false; } }, 8000);
        startApp();
