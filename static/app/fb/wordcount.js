// 字數（T107，卓倫 2026-11-09：英文以單字計）。純函式、沒有任何 import。
// ★ 這個檔和 functions/src/wordcount.js 必須一模一樣（前台檢查上限、伺服器算光點門檻用同一套；tools/tests/wordcount.test.mjs 會比對）。
// 規則：中日韓文字（漢字、假名、韓文、注音）每字 1；一串連續的英文字母／數字算 1 個字（中間的 ' ’ - 不切開，
// 數字中間的 . , 也不切開：3.5、1,000 各算 1）；emoji 與其他符號每個字形群組算 1（國旗、膚色、家庭 emoji 都算 1）；
// 空白、換行、標點、看不見的控制字元不算。
const WC_CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}\u3005-\u3007\u303B\u30FC\uFF70]/u;
const WC_WORD = /^[\p{L}\p{N}]/u;                       // 英文字母、其他拼音文字、數字（含全形）
const WC_DIGIT = /^\p{N}/u;
const WC_JOIN = /^['\u2019\u2010\u2011-]$/u;            // don't、don’t、follow-up
const WC_NUMJOIN = /^[.,]$/;                            // 3.5、1,000
const WC_SKIP = /^[\p{Z}\p{P}\p{C}\s]+$/u;             // 空白、換行、標點、控制字元
const WC_EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3|\uFE0F/u;
const WC_EXT = /[\p{M}\u200D\uFE00-\uFE0F\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}\u20E3]/u;
const WC_RI = /\p{Regional_Indicator}/u;
const WC_SEG = (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;

/** 字形群組（使用者看到的「一個字」）。舊瀏覽器沒有 Intl.Segmenter 時用簡化版：組合符號、ZWJ、膚色、國旗兩個一組。 */
export function graphemes(s) { return splitGraphemes(s, true); }
function splitGraphemes(s, useSegmenter) {
  s = String(s == null ? '' : s);
  if (WC_SEG && useSegmenter) return Array.from(WC_SEG.segment(s), x => x.segment);
  const out = [];
  let riOpen = false;
  for (const ch of s) {
    const last = out.length - 1;
    if (last >= 0 && (WC_EXT.test(ch) || out[last].endsWith('\u200D'))) { out[last] += ch; continue; }
    if (WC_RI.test(ch)) {
      if (riOpen) { out[last] += ch; riOpen = false; continue; }
      out.push(ch); riOpen = true; continue;
    }
    riOpen = false; out.push(ch);
  }
  return out;
}

/** 字數（見檔頭規則）。text 可以是任何值；null／undefined 算 0。 */
export function countWords(text) { return count(splitGraphemes(text, true)); }
/** 測試用：強制用沒有 Intl.Segmenter 的簡化版切字（模擬舊瀏覽器）。 */
export function countWordsFallback(text) { return count(splitGraphemes(text, false)); }
function count(g) {
  let n = 0, inWord = false, prevDigit = false;
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (WC_EMOJI.test(c)) { n++; inWord = false; continue; }          // 鍵帽（數字＋U+20E3）也算 emoji
    if (WC_CJK.test(c)) { n++; inWord = false; continue; }
    if (WC_WORD.test(c)) { if (!inWord) n++; inWord = true; prevDigit = WC_DIGIT.test(c); continue; }
    if (inWord && i + 1 < g.length) {
      const next = g[i + 1];
      const nextWord = WC_WORD.test(next) && !WC_CJK.test(next) && !WC_EMOJI.test(next);
      if (nextWord && (WC_JOIN.test(c) || (WC_NUMJOIN.test(c) && prevDigit && WC_DIGIT.test(next)))) continue;
    }
    inWord = false;
    if (WC_SKIP.test(c)) continue;
    n++;                                                              // 其他符號（+ $ ♥ ★ …）
  }
  return n;
}
