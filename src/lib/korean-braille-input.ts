/** Korean keyboard input, MCST 2024-0005 clauses 1–18.
 * Logical dots only (dot 1 = bit 0); never physical solenoid channel numbers.
 * Reparse the raw cells after every edit so compound vowels/finals can change.
 * This Korean-first input mode does not guess English, numbers or punctuation.
 */
export function dotMask(dots: string): number {
  let mask = 0;
  for (const dot of dots) {
    if (dot < "1" || dot > "6") throw new Error("잘못된 점 번호입니다.");
    mask |= 1 << (Number(dot) - 1);
  }
  return mask;
}

const INITIAL = ["4", "6-4", "14", "24", "6-24", "5", "15", "45", "6-45",
  "6", "6-6", "", "46", "6-46", "56", "124", "125", "145", "245"];
const VOWEL = ["126", "1235", "345", "345-1235", "234", "1345", "156", "34",
  "136", "1236", "1236-1235", "13456", "346", "134", "1234", "1234-1235",
  "134-1235", "146", "246", "2456", "135"];
const FINAL = ["", "1", "1-1", "1-3", "25", "25-13", "25-356", "35", "2",
  "2-1", "2-26", "2-12", "2-3", "2-236", "2-256", "2-356", "26", "12",
  "12-3", "3", "34", "2356", "13", "23", "235", "236", "256", "356"];
const A = ["1246", "6-1246", "14", "24", "6-24", "", "15", "45", "6-45",
  "123", "6-123", "", "46", "6-46", "", "124", "125", "145", "245"];
const CONSONANTS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const CONTRACTIONS: [string, number, number][] = [
  ["1456", 4, 1], ["23456", 4, 4], ["2345", 4, 8], ["16", 6, 4],
  ["1256", 6, 8], ["12456", 6, 21], ["1346", 8, 1], ["12356", 8, 4],
  ["123456", 8, 21], ["1245", 13, 4], ["12346", 13, 8], ["1356", 18, 4],
  ["2346", 18, 8], ["12345", 20, 4],
];
const WORDS: [string, string][] = [
  ["1-234", "그래서"], ["1-14", "그러나"], ["1-25", "그러면"],
  ["1-26", "그러므로"], ["1-1345", "그런데"], ["1-136", "그리고"], ["1-156", "그리하여"],
];
const FINAL_EXTENSIONS: Record<number, [string, number][]> = {
  1: [["1", 2], ["3", 3]],
  4: [["13", 5], ["356", 6]],
  8: [["1", 9], ["26", 10], ["12", 11], ["3", 12], ["236", 13], ["256", 14], ["356", 15]],
};
type Sign = { cells: number[]; index: number };
function signs(patterns: string[]): Sign[] {
  return patterns.flatMap((pattern, index) => pattern ? [{ cells: pattern.split("-").map(dotMask), index }] : [])
    .sort((a, b) => b.cells.length - a.cells.length);
}
const initialSigns = signs(INITIAL), vowelSigns = signs(VOWEL), finalSigns = signs(FINAL), aSigns = signs(A);
const contractionSigns = CONTRACTIONS.map(([pattern, vowel, final]) => ({ cell: dotMask(pattern), vowel, final }));
const wordSigns = WORDS.map(([pattern, text]) => ({ cells: pattern.split("-").map(dotMask), text }));
function match(cells: readonly number[], at: number, table: Sign[]): Sign | undefined {
  return table.find((sign) => sign.cells.every((cell, i) => cells[at + i] === cell));
}
function syllable(initial: number, vowel: number, final: number): string {
  return String.fromCharCode(0xac00 + initial * 588 + vowel * 28 + final);
}

export type BrailleInputText = {
  text: string;
  braille: string;
  complete: boolean;
  issues: string[];
};

export function decodeKoreanBraille(cells: readonly number[]): BrailleInputText {
  if (cells.some((cell) => !Number.isInteger(cell) || cell < 0 || cell > 63)) throw new Error("잘못된 점자 입력입니다.");
  let text = "", at = 0, wordStart = true;
  const issues: string[] = [];
  while (at < cells.length) {
    const start = at;
    const cell = cells[at];
    if (cell === 0) { text += " "; at++; wordStart = true; continue; }
    if (wordStart) {
      const word = wordSigns.find((sign) => sign.cells.every((value, i) => cells[at + i] === value));
      if (word) { text += word.text; at += word.cells.length; wordStart = false; continue; }
    }
    // Clauses 11/12: a separator before a vowel prevents treating it as a final
    // or extending the preceding compound vowel.
    if (cell === dotMask("36") && text && !wordStart && match(cells, at + 1, vowelSigns)) { at++; continue; }
    // 것 / 껏 have their own two/three-cell sign.
    const tenseGeot = cell === dotMask("6") && cells[at + 1] === dotMask("456");
    if ((cell === dotMask("456") || tenseGeot) && cells[at + (tenseGeot ? 2 : 1)] === dotMask("234")) {
      text += tenseGeot ? "껏" : "것"; at += tenseGeot ? 3 : 2; wordStart = false; continue;
    }

    let initial = 11, vowel = -1, final = 0;
    const aSign = match(cells, at, aSigns);
    const initialSign = match(cells, at, initialSigns);
    // 가/사 signs are full syllables, while most other ㅏ signs are also initials.
    if (aSign && [0, 1, 9, 10].includes(aSign.index)) {
      initial = aSign.index; vowel = 0; at += aSign.cells.length;
    } else if (initialSign) {
      initial = initialSign.index; at += initialSign.cells.length;
    }
    if (vowel < 0) {
      const contraction = contractionSigns.find((sign) => sign.cell === cells[at]);
      const vowelSign = match(cells, at, vowelSigns);
      if (contraction) {
        vowel = contraction.vowel; final = contraction.final; at++;
        // Clause 17: the 영 sign after ㅅ/ㅆ/ㅈ/ㅉ/ㅊ means 성/썽/정/쩡/청.
        if (vowel === 6 && final === 21 && [9, 10, 12, 13, 14].includes(initial)) vowel = 4;
      } else if (vowelSign) { vowel = vowelSign.index; at += vowelSign.cells.length; }
      else if (initialSign && aSign && aSign.index === initial) vowel = 0;
      else if (initialSign) {
        text += CONSONANTS[initial];
        issues.push(`${start + 1}번째 칸: 자음 뒤에 모음을 입력해 주세요.`);
        wordStart = false; continue;
      }
    }
    if (vowel < 0) {
      // Keep unknown cells visible; never silently drop or send them as guessed text.
      text += String.fromCharCode(0x2800 + cell); at = start + 1;
      issues.push(`${start + 1}번째 칸: 현재 한글 입력에서 해석할 수 없는 점자입니다.`);
      wordStart = false; continue;
    }
    if (final) {
      const extension = FINAL_EXTENSIONS[final]?.find(([pattern]) => cells[at] === dotMask(pattern));
      if (extension) { final = extension[1]; at++; }
    } else {
      const finalSign = match(cells, at, finalSigns);
      if (finalSign) { final = finalSign.index; at += finalSign.cells.length; }
    }
    text += syllable(initial, vowel, final); wordStart = false;
  }
  return {
    text, braille: cells.map((cell) => String.fromCharCode(0x2800 + cell)).join(""),
    complete: issues.length === 0, issues,
  };
}

