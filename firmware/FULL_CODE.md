# EARLINK 파일별 전체 코드

실제 프로젝트 파일을 그대로 읽어 생성한 문서입니다. 파일별 전체 내용을 생략 없이 수록합니다.
현재 펌웨어는 2024 점역·BLE·연결 파도를 사용합니다. 문자 돌출점은 LOW, 배경은 HIGH이며 대기·종료는 전체 LOW입니다.
`earlink`의 헤더 11개와 `earlink.ino`를 같은 스케치 폴더에 둡니다. `backups`는 이전 동작의 보관본이며 현재 출력 정책으로 사용하지 않습니다.
지원 범위와 미구현 사항은 [RULES_2024.md](RULES_2024.md), 검증은 [결과 표](validation/BRAILLE_RESULTS.md)를 참조하세요.

코드 수정 후 `python firmware/tools/export_full_code.py`로 다시 생성합니다.

## firmware/earlink/Config.h

```cpp
#pragma once
#include <stdint.h>
#include <stddef.h>

namespace config {
// User-confirmed GPIO roles. 74HC595, three 6-dot cells.
constexpr int DATA_PIN = 16;   
constexpr int LATCH_PIN = 17;  
constexpr int CLOCK_PIN = 18;
constexpr uint8_t CELL_COUNT = 3;
// All 18 logical/physical assignments now live in BrailleMapping.h.
// GPIO output enabled. Mapping uses the user-confirmed solenoid layout.
// false still runs BLE, conversion and pagination, with Serial output only.
constexpr bool OUTPUT_ENABLED = true;
constexpr uint32_t CONNECT_PULSE_MS = 200; // One vertical column (3 channels).
constexpr uint32_t CONNECT_GAP_MS = 50;    // Release before the next column.
constexpr uint32_t PAGE_MS = 2000;
constexpr uint32_t BLANK_MS = 250;
constexpr uint32_t RECEIVE_TIMEOUT_MS = 10000;
constexpr uint32_t HOLD_TIMEOUT_MS = 10000; // Clear held page; next/previous can redisplay.
constexpr size_t MIN_FREE_HEAP_BYTES = 16384; // reserve for existing BLE/event processing
}
```

## firmware/earlink/EarlinkLimits.h

```cpp
#pragma once
#include <stddef.h>
namespace earlink {
constexpr size_t MAX_TEXT_BYTES = 4096;
constexpr size_t MAX_TRANSLATION_CELLS = MAX_TEXT_BYTES * 6 + 16;
constexpr size_t MAX_BUFFERED_CELLS = 32768; // current + waiting, queue length still 3
}
```

## firmware/earlink/Utf8.h

```cpp
#pragma once
#include <stdint.h>
#include <string>
namespace earlink {
namespace utf8 {
struct Token {
  uint32_t cp = 0;
  size_t begin = 0, end = 0;
  uint16_t characters = 1;
  bool valid = true;
};
// Strict scalar decoding. A following ASCII byte is never swallowed by an error.
inline Token decode(const std::string& text, size_t at) {
  Token t; t.begin = at; t.end = at;
  if (at >= text.size()) { t.characters = 0; return t; }
  const uint8_t lead = uint8_t(text[at++]);
  t.cp = lead;
  unsigned count = 0; uint32_t minimum = 0;
  if (lead < 0x80) { t.end = at; return t; }
  if (lead >= 0xc0 && lead <= 0xdf) { count = 1; t.cp &= 31; minimum = 0x80; }
  else if (lead >= 0xe0 && lead <= 0xef) { count = 2; t.cp &= 15; minimum = 0x800; }
  else if (lead >= 0xf0 && lead <= 0xf7) { count = 3; t.cp &= 7; minimum = 0x10000; }
  else t.valid = false;
  for (unsigned i = 0; i < count; ++i) {
    if (at == text.size() || (uint8_t(text[at]) & 0xc0) != 0x80) { t.valid = false; break; }
    t.cp = (t.cp << 6) | (uint8_t(text[at++]) & 63);
  }
  if (t.cp < minimum || t.cp > 0x10ffff || (t.cp >= 0xd800 && t.cp <= 0xdfff)) t.valid = false;
  if (!t.valid) t.cp = 0xfffd;
  t.end = at; return t;
}
// Compose modern L+V(+T), without allocating a normalized copy of the input.
// Compatibility jamo remain standalone letters; no guessed composition.
inline Token next(const std::string& text, size_t at) {
  Token t = decode(text, at);
  if (t.valid && t.cp >= 0xac00 && t.cp <= 0xd7a3 && (t.cp - 0xac00) % 28 == 0) {
    const Token tail = decode(text, t.end);
    if (tail.valid && tail.characters && tail.cp >= 0x11a8 && tail.cp <= 0x11c2) {
      t.cp += tail.cp - 0x11a7; t.end = tail.end; t.characters = 2;
    }
  }
  if (t.valid && t.cp >= 0x1100 && t.cp <= 0x1112) {
    const Token v = decode(text, t.end);
    if (v.valid && v.characters && v.cp >= 0x1161 && v.cp <= 0x1175) {
      const Token tail = decode(text, v.end);
      const bool hasTail = tail.valid && tail.characters && tail.cp >= 0x11a8 && tail.cp <= 0x11c2;
      t.cp = 0xac00 + (t.cp - 0x1100) * 588 + (v.cp - 0x1161) * 28 + (hasTail ? tail.cp - 0x11a7 : 0);
      t.end = hasTail ? tail.end : v.end;
      t.characters = hasTail ? 3 : 2;
    }
  }
  return t;
}
}
}
```

## firmware/earlink/BrailleRules.h

```cpp
#pragma once
#include <stdint.h>
// NIKL, 2024 revised Korean Braille, MCST 2024-0005.
// See ../RULES_2024.md for printed pages, source URL and limitations.
// Logical dot numbers only; '-' separates cells. No GPIO polarity here.
namespace earlink {
namespace rules {
// Korean clauses 1, 2 (pp.3-4).
static const char* const INITIAL[19] = {
  "4","6-4","14","24","6-24","5","15","45","6-45",
  "6","6-6","","46","6-46","56","124","125","145","245"
};
// Clauses 6, 7 (pp.5-6).
static const char* const VOWEL[21] = {
  "126","1235","345","345-1235","234","1345","156","34",
  "136","1236","1236-1235","13456","346","134","1234",
  "1234-1235","134-1235","146","246","2456","135"
};
// Clauses 3-5 (pp.4-5).
static const char* const FINAL[28] = {
  "","1","1-1","1-3","25","25-13","25-356","35","2",
  "2-1","2-26","2-12","2-3","2-236","2-256","2-356",
  "26","12","12-3","3","34","2356","13","23","235","236","256","356"
};
static const uint8_t FIRST_FINAL[28] = {
  0,1,1,1,4,4,4,7,8,8,8,8,8,8,8,8,16,17,17,19,20,21,22,23,24,25,26,27
};
static const char* const REMAINDER[28] = {
  "","","1","3","","13","356","","","1","26","12","3","236","256","356",
  "","","3","","","","","","","","",""
};
struct Contraction { uint8_t vowel, final; const char* pattern; };
// Clause 15 (pp.10-11): 억 언 얼 연 열 영 옥 온 옹 운 울 은 을 인.
static const Contraction VC[] = {
  {4,1,"1456"},{4,4,"23456"},{4,8,"2345"},{6,4,"16"},
  {6,8,"1256"},{6,21,"12456"},{8,1,"1346"},{8,4,"12356"},
  {8,21,"123456"},{13,4,"1245"},{13,8,"12346"},{18,4,"1356"},
  {18,8,"2346"},{20,4,"12345"}
};
// Clause 13: 가/사 have distinct signs; the others omit vowel a.
static const char* const A_SYLLABLE[19] = {
  "1246","6-1246","14","24","6-24","","15","45","6-45",
  "123","6-123","","46","6-46","","124","125","145","245"
};
// Clause 28 and Appendix 1 (p.208).
static const char* const LATIN[26] = {
  "1","12","14","145","15","124","1245","125","24","245",
  "13","123","134","1345","135","1234","12345","1235","234","2345",
  "136","1236","2456","1346","13456","1356"
};
struct Word { uint32_t syllables[4]; const char* pattern; };
// Complete list, clause 18 (pp.12-13); Unicode literals also work with NFD input.
static const Word WORDS[] = {
  {{U'그',U'래',U'서',0},"1-234"},{{U'그',U'러',U'나',0},"1-14"},
  {{U'그',U'러',U'면',0},"1-25"},{{U'그',U'러',U'므',U'로'},"1-26"},
  {{U'그',U'런',U'데',0},"1-1345"},{{U'그',U'리',U'고',0},"1-136"},
  {{U'그',U'리',U'하',U'여'},"1-156"}
};
struct Symbol { uint32_t cp; const char* pattern; };
// Clauses 49, 50, 52, 54, 55, 59, 61-63, 71; ellipses require run handling.
static const Symbol PUNCTUATION[] = {
  {'.',"256"},{',',"5"},{'?',"236"},{'!',"235"},
  {0xb7,"5-23"},{':',"5-2"},{';',"56-23"},{'/',"456-34"},
  {0x201c,"236"},{0x201d,"356"},{0x2018,"6-236"},{0x2019,"356-3"},
  {'(',"236-3"},{')',"6-356"},{'{',"236-2"},{'}',"5-356"},
  {'[',"236-23"},{']',"56-356"},{0x300e,"56-236"},{0x300f,"356-23"},
  {0x300c,"5-236"},{0x300d,"356-2"},{0x300a,"56-2356"},{0x300b,"2356-23"},
  {0x3008,"5-2356"},{0x3009,"2356-2"},{0x2015,"36-36"},
  {'-',"36"},{'~',"4-35"},{0x223c,"4-35"},{0x02d0,"6-3"},
  {'@',"4-1"},{'^',"4-26"},{'#',"456-1456"},{'_',"456-36"},
  {'\\',"456-16"},{'|',"456-1256"},{0x203b,"5-35"},{'*',"5-35"},
  {0x2033,"356-356"}
};
}
}
```

## firmware/earlink/BrailleText.h

```cpp
#pragma once
#include <stdint.h>
#include <cstring>
#include <string>
#include <vector>
#include "EarlinkLimits.h"
#include "Utf8.h"
#include "BrailleRules.h"

namespace earlink {
struct Translation {
  std::vector<uint8_t> cells;
  uint16_t unsupported = 0;
};
inline uint8_t dots(const char* numbers) {
  uint8_t mask = 0;
  for (; *numbers; ++numbers)
    if (*numbers >= '1' && *numbers <= '6') mask |= uint8_t(1u << (*numbers - '1'));
  return mask;
}
inline void appendDots(std::vector<uint8_t>& out, const char* pattern) {
  if (!*pattern) return;
  uint8_t mask = 0;
  for (; *pattern; ++pattern) {
    if (*pattern == '-') { out.push_back(mask); mask = 0; }
    else if (*pattern >= '1' && *pattern <= '6') mask |= uint8_t(1u << (*pattern - '1'));
  }
  out.push_back(mask);
}
// Optional streaming audit: no trace vectors or decoded input buffer on ESP32.
// Original UTF-8 byte/scalar offsets are zero based; cellEnd is exclusive.
struct Audit {
  size_t byteOffset, characterOffset, cellBegin, cellEnd;
  uint32_t codepoint;
  const char* rule;
  bool issue;
};
using AuditCallback = void (*)(const Audit&, void*);
struct Measurement { size_t cells = 0; uint16_t unsupported = 0; };

namespace detail {
inline bool hangul(uint32_t cp) { return cp >= 0xac00 && cp <= 0xd7a3; }
inline bool latin(uint32_t cp) { return (cp >= 'a' && cp <= 'z') || (cp >= 'A' && cp <= 'Z'); }
inline bool digit(uint32_t cp) { return cp >= '0' && cp <= '9'; }
inline bool upper(uint32_t cp) { return cp >= 'A' && cp <= 'Z'; }
inline bool space(uint32_t cp) { return cp == ' ' || cp == '\n' || cp == '\r' || cp == '\t'; }
inline bool opening(uint32_t cp) {
  return cp == '(' || cp == '[' || cp == '{' || cp == 0x201c || cp == 0x2018 ||
         cp == 0x300c || cp == 0x300e || cp == 0x3008 || cp == 0x300a || cp == '"';
}
inline bool closing(uint32_t cp) {
  return cp == ')' || cp == ']' || cp == '}' || cp == 0x201d || cp == 0x2019 ||
         cp == 0x300d || cp == 0x300f || cp == 0x3009 || cp == 0x300b || cp == '"';
}
// Isolated consonants use final forms (K8/K10). No final ㄸ/ㅃ/ㅉ is invented.
inline int consonant(uint32_t cp) {
  static const int8_t compat[30] = {
    1,2,3,4,5,6,7,-1,8,9,10,11,12,13,14,15,16,17,-1,18,19,20,21,22,-1,23,24,25,26,27
  };
  static const int8_t leading[19] = {1,2,4,7,-1,8,16,17,-1,19,20,21,22,-1,23,24,25,26,27};
  if (cp >= 0x3131 && cp <= 0x314e) return compat[cp - 0x3131];
  if (cp >= 0x1100 && cp <= 0x1112) return leading[cp - 0x1100];
  if (cp >= 0x11a8 && cp <= 0x11c2) return int(cp - 0x11a7);
  return -1;
}
inline int isolatedVowel(uint32_t cp) {
  if (cp >= 0x314f && cp <= 0x3163) return int(cp - 0x314f);
  if (cp >= 0x1161 && cp <= 0x1175) return int(cp - 0x1161);
  return -1;
}

class Translator {
 public:
  Translator(const std::string& input, std::vector<uint8_t>* output,
             AuditCallback callback = nullptr, void* context = nullptr)
      : text(input), out(output), audit(callback), user(context) {}
  Measurement run() {
    if (text.size() > MAX_TEXT_BYTES) {
      token = utf8::next(text, 0); issue("LIMIT.input-bytes"); return measured;
    }
    for (size_t pos = 0; pos < text.size();) {
      token = utf8::next(text, pos);
      const auto after = utf8::next(text, token.end);
      const uint32_t cp = token.cp;
      if (!token.valid) {
        finishRoman(cp); issue("UTF8.invalid"); numbers = false;
      } else if (hangul(cp)) {
        finishRoman(cp);
        const uint32_t n = cp - 0xac00;
        const int l = int(n / 588), v = int(n % 588 / 28), t = int(n % 28);
        if (numbers && (l == 2 || l == 3 || l == 6 || l == 15 || l == 16 || l == 17 || l == 18 ||
                        (l == 11 && v == 13 && rules::FIRST_FINAL[t] == 4)))
          emit("", "K44.number-hangul-space", true);
        numbers = false;
        bool shortened = false;
        if (wordStart) {
          for (const auto& word : rules::WORDS) {
            size_t cursor = pos; uint16_t scalars = 0; unsigned w = 0;
            for (; w < 4 && word.syllables[w]; ++w) {
              const auto got = utf8::next(text, cursor);
              if (!got.characters || !got.valid || word.syllables[w] != got.cp) break;
              cursor = got.end; scalars += got.characters;
            }
            if (w == 4 || word.syllables[w] == 0) {
              emit(word.pattern, "K18.abbreviation");
              token.end = cursor; token.characters = scalars; shortened = true; break;
            }
          }
        }
        if (!shortened) syllable(l, v, t, after.cp);
      } else if (latin(cp)) {
        romanLetter(pos); numbers = false;
      } else if (digit(cp)) {
        // K35: Roman+number has no Roman terminator; keep the span for later words.
        if (!numbers) emit("3456", "K40.number-sign");
        emit(rules::LATIN[cp == '0' ? 9 : cp - '1'], "K40.digit");
        numbers = true; capsWord = false;
      } else if (space(cp)) {
        if (roman && !space(previous)) {
          size_t next = token.end;
          while (next < text.size() && space(utf8::next(text, next).cp)) next = utf8::next(text, next).end;
          const uint32_t nextCp = utf8::next(text, next).cp;
          if (!latin(nextCp) && !digit(nextCp)) finishRoman(cp);
        }
        emit("", "SPACE.display-separator", true);
        if (cp == '\r' && after.cp == '\n') { token.end = after.end; ++token.characters; }
        numbers = false; capsWord = false;
      } else if ((cp == '.' || cp == ',') && numbers && digit(after.cp)) {
        emit(cp == '.' ? "256" : "2", cp == '.' ? "K43.K48.decimal" : "K41.K43.numeric-comma");
      } else if (cp >= 0x2800 && cp <= 0x283f) {
        finishRoman(cp); put(uint8_t(cp - 0x2800)); note("RAW.compatibility-cells", false, measured.cells - 1);
        numbers = false;
      } else {
        if (roman && romanContinues(after.cp, cp)) {
          if (opening(cp) || closing(cp)) issue("UNVERIFIED.K32.UEB-delimiter");
          if (!(cp == ',' || cp == ':' || cp == ';' || cp == '.' || cp == '?' || cp == '!' ||
                cp == '-' || cp == '/' || cp == '\'' || cp == 0x2026 || opening(cp) || closing(cp)))
            issue("UNVERIFIED.K32.UEB-symbol");
          if (cp == ',') emit("2", "K32.UEB.comma");
          else if (cp == ':') emit("25", "K32.UEB.colon");
          else if (cp == ';') emit("23", "K32.UEB.semicolon");
          else punctuation(cp, after.cp);
        } else { finishRoman(cp); punctuation(cp, after.cp); }
        capsWord = false; numbers = false;
      }
      if (!hangul(cp)) previousVowel = -1;
      if (space(cp)) attachedRun = false;
      wordStart = !hangul(cp) && !latin(cp) && !digit(cp) && consonant(cp) < 0 && isolatedVowel(cp) < 0;
      previous = cp; scalarOffset += token.characters; pos = token.end;
    }
    finishRoman(0);
    return measured;
  }

 private:
  const std::string& text;
  std::vector<uint8_t>* out;
  AuditCallback audit;
  void* user;
  Measurement measured;
  utf8::Token token;
  size_t scalarOffset = 0, passageEnd = 0;
  uint32_t previous = 0;
  int previousVowel = -1;
  bool numbers = false, roman = false, capsWord = false, capsPassage = false;
  bool wordStart = true, doubleQuote = false, singleQuote = false, attachedRun = false, inSquare = false;
  bool outputOverflow = false;
  void put(uint8_t cell) {
    if (measured.cells >= MAX_TRANSLATION_CELLS) {
      if (!outputOverflow) {
        outputOverflow = true;
        issue("LIMIT.output-cells");
      }
      return;
    }
    if (out) out->push_back(cell);
    ++measured.cells;
  }
  void note(const char* rule, bool problem, size_t begin) {
    if (audit) audit({token.begin, scalarOffset, begin, measured.cells, token.cp, rule, problem}, user);
  }
  void emit(const char* pattern, const char* rule, bool blank = false) {
    const size_t begin = measured.cells;
    if (blank) put(0);
    else if (*pattern) {
      uint8_t mask = 0;
      for (; *pattern; ++pattern) {
        if (*pattern == '-') { put(mask); mask = 0; }
        else mask |= uint8_t(1u << (*pattern - '1'));
      }
      put(mask);
    }
    note(rule, false, begin);
  }
  void issue(const char* reason) {
    if (measured.unsupported != UINT16_MAX) ++measured.unsupported;
    // No made-up glyph. Callers MUST reject an incomplete translation.
    note(reason, true, measured.cells);
  }
  void syllable(int l, int v, int t, uint32_t nextCp) {
    if (l == 11 && previousVowel >= 0 &&
        (v == 7 || (v == 1 && (previousVowel == 2 || previousVowel == 9 || previousVowel == 13 || previousVowel == 14))))
      emit("36", v == 7 ? "K11.vowel-separator" : "K12.vowel-separator");
    previousVowel = t == 0 ? v : -1;
    if ((l == 0 || l == 1) && v == 4 && t == 19) {
      if (l == 1) emit("6", "K16.tense-contraction");
      emit("456-234", "K15.geot"); return;
    }
    const bool nextVowel = hangul(nextCp) && (nextCp - 0xac00) / 588 == 11;
    if (v == 0 && *rules::A_SYLLABLE[l]) {
      const bool exception = (t == 0 && nextVowel && l != 0 && l != 1 && l != 9 && l != 10) || (l == 17 && t == 20);
      if (!exception) {
        emit(rules::A_SYLLABLE[l], "K13.K16.a-contraction");
        emit(rules::FINAL[t], "K3.K4.K5.final"); return;
      }
      emit("", l == 17 && t == 20 ? "K14.pat-exception" : "K14.following-vowel-exception");
    }
    emit(rules::INITIAL[l], "K1.K2.initial");
    if (v == 4 && t == 21 && (l == 9 || l == 10 || l == 12 || l == 13 || l == 14)) {
      emit("12456", "K17.seong-jeong-cheong"); return;
    }
    for (const auto& c : rules::VC) {
      // K17 reserves initial ㅅ/ㅆ/ㅈ/ㅉ/ㅊ + 영 for 성/썽/정/쩡/청.
      // The printed example 얄라셩 therefore spells 셩 with 여 + final ㅇ.
      if (v == 6 && t == 21 && (l == 9 || l == 10 || l == 12 || l == 13 || l == 14)) continue;
      if (v == c.vowel && rules::FIRST_FINAL[t] == c.final) {
        emit(c.pattern, "K15.vowel-final-contraction"); emit(rules::REMAINDER[t], "K5.remaining-final"); return;
      }
    }
    emit(rules::VOWEL[v], "K6.K7.vowel"); emit(rules::FINAL[t], "K3.K4.K5.final");
  }
  bool romanContinues(uint32_t nextCp, uint32_t cp) const {
    (void)cp;
    size_t at = token.end;
    while (space(nextCp) && at < text.size()) { at = utf8::next(text, at).end; nextCp = utf8::next(text, at).cp; }
    return latin(nextCp) || digit(nextCp);
  }
  void finishRoman(uint32_t following) {
    if (!roman) return;
    const bool terminal = following == '.' || following == '?' || following == '!' || following == 0x2026;
    const bool different = following == ',' || following == ':' || following == ';' || following == 0x2015;
    if (!numbers && !terminal && !different && !closing(following)) emit("256", "K29.roman-end");
    roman = false; capsWord = false;
  }
  // General UEB contractions have NOT been implemented. Only words independently
  // checked to need no contractions are accepted; others are reported/rejected.
  bool verifiedRomanWord(size_t begin, size_t end) const {
    if (end - begin == 1) return true;
    static const char* const verified[] = {
      "hello","book","happy","moon","purple","tea","welcome","new","york",
      "mcdonald","iot","ios","canada","los","angeles","ktx","who","mp","lp","kf","tv","kbs","cd",
      "cm","kg","mm","gb","fm","usb","hz","to","korea"
    };
    for (const char* word : verified) {
      if (std::strlen(word) != end - begin) continue;
      size_t i = begin;
      for (; i < end; ++i) {
        const char ch = upper(uint8_t(text[i])) ? char(text[i] + 32) : text[i];
        if (ch != word[i - begin]) break;
      }
      if (i == end) return true;
    }
    return false;
  }
  void romanLetter(size_t pos) {
    if (!latin(previous)) {
      size_t wordEnd = pos;
      while (wordEnd < text.size() && latin(uint8_t(text[wordEnd]))) ++wordEnd;
      if (!verifiedRomanWord(pos, wordEnd)) issue("UNVERIFIED.K32.K37.UEB-word");
      // The NIKL WHO example is the uppercase acronym. A lowercase "who"
      // requires UEB word-sign handling, which this limited Roman path lacks.
      if (wordEnd == pos + 3 && (text[pos] == 'w' || text[pos] == 'W') &&
          (text[pos+1] == 'h' || text[pos+1] == 'H') && (text[pos+2] == 'o' || text[pos+2] == 'O') &&
          !(text[pos] == 'W' && text[pos+1] == 'H' && text[pos+2] == 'O'))
        issue("UNVERIFIED.K32.UEB-who-wordsign");
      const bool alreadyRoman = roman;
      if (!roman) emit("356", "K29.roman-start");
      else if (numbers && token.cp >= 'a' && token.cp <= 'j') emit("56", "K32.UEB.numeric-letter");
      else if (alreadyRoman && !numbers && wordEnd == pos + 1 && token.cp != 'a' && token.cp != 'A' &&
               token.cp != 'i' && token.cp != 'I' && token.cp != 'o' && token.cp != 'O')
        emit("56", "K32.UEB.standalone-letter");
      if (wordEnd == pos + 2 && (text[pos] == 'c' || text[pos] == 'C') &&
          (text[pos+1] == 'd' || text[pos+1] == 'D')) emit("56", "K35.UEB.cd-disambiguation");
      roman = true;
      if (!capsPassage) {
        size_t p = pos, last = pos; unsigned words = 0;
        while (p < text.size()) {
          const size_t start = p;
          while (p < text.size() && upper(uint8_t(text[p]))) ++p;
          if (p == start || (p < text.size() && latin(uint8_t(text[p])))) break;
          ++words; last = p;
          const size_t gap = p;
          while (p < text.size() && text[p] == ' ') ++p;
          if (p == gap || p == text.size()) break;
        }
        if (words >= 3) { emit("6-6-6", "K28.capital-passage"); capsPassage = true; passageEnd = last; }
      }
    }
    if (upper(token.cp) && !capsPassage && !capsWord) {
      if (pos + 1 < text.size() && upper(uint8_t(text[pos + 1]))) { emit("6-6", "K28.capital-word"); capsWord = true; }
      else emit("6", "K28.capital-letter");
    } else if (!upper(token.cp) && capsWord) { emit("6-3", "K28.capital-word-end"); capsWord = false; }
    emit(rules::LATIN[(upper(token.cp) ? token.cp + 32 : token.cp) - 'a'], "K28.roman-letter");
    if (capsPassage && token.end == passageEnd) { emit("6-3", "K28.capital-passage-end"); capsPassage = false; }
  }
  void punctuation(uint32_t cp, uint32_t nextCp) {
    const int c = consonant(cp), v = isolatedVowel(cp);
    if (c >= 0) {
      bool attached = hangul(previous) || attachedRun;
      if (!attached && inSquare) {
        auto next = utf8::next(text, token.end);
        while (next.characters && consonant(next.cp) >= 0) next = utf8::next(text, next.end);
        attached = hangul(next.cp);
      }
      attachedRun = attached;
      emit(attached ? "456" : "123456", attached ? "K10.attached-consonant" : "K8.isolated-consonant");
      emit(rules::FINAL[c], "K3.K4.K5.final-form"); return;
    }
    if (v >= 0) { emit("123456", "K8.isolated-vowel"); emit(rules::VOWEL[v], "K6.K7.vowel"); return; }
    attachedRun = false;
    // K49 attachment: confusing standalone punctuation needs a transcriber
    // explanation. Do not silently present it as an ordinary sentence ending.
    if (!roman && (!token.begin || space(previous)) && cp == '?') {
      // Exact construction from the printed p.34 example: ?는 대개 ...
      emit("456-236", "K49.standalone-question");
      emit("", "K49.explanation-space", true);
      emit("6-3-15-12346-246-26-145-346-6-3", "K49.K66.question-name-note");
      return;
    }
    if (!roman && (!token.begin || space(previous)) &&
        (cp == '!' || cp == ',' || (cp == '.' && nextCp != '.')))
      issue("UNVERIFIED.K49.standalone-punctuation");
    if (cp == '"') {
      emit(doubleQuote ? "356" : "236", "K49.ascii-double-quote"); doubleQuote = !doubleQuote; return;
    }
    if (cp == '\'') {
      if ((latin(previous) && latin(nextCp)) || digit(nextCp)) emit("3", "K61.apostrophe");
      else { emit(singleQuote ? "356-3" : "6-236", "K49.ascii-single-quote"); singleQuote = !singleQuote; }
      return;
    }
    if (cp == 0x2018) singleQuote = true;
    if (cp == 0x2019 && !singleQuote && digit(nextCp)) { emit("3", "K61.apostrophe"); return; }
    if (cp == 0x2019) singleQuote = false;
    if (cp == '[') inSquare = true;
    if (cp == ']') inSquare = false;
    if (cp == 0x2026 || (cp == '.' && nextCp == '.')) {
      size_t at = token.begin; uint16_t count = 0;
      while (at < text.size()) { const auto t = utf8::next(text, at); if (t.cp != cp) break; at = t.end; ++count; }
      if ((cp == '.' && count != 3 && count != 6) || (cp == 0x2026 && count > 2)) issue("UNVERIFIED.K53.ellipsis-count");
      else emit(cp == '.' ? "256-256-256" : "6-6-6", "K53.ellipsis");
      token.end = at; token.characters = count; return;
    }
    const char* symbol = nullptr;
    switch (cp) {
      case '$': symbol = "356-4-234"; break;
      case 0x20a9: case 0xffe6: symbol = "356-4-2456"; break;
      case 0xa2: symbol = "356-4-14"; break;
      case 0x20ac: symbol = "356-4-15"; break;
      case 0xa3: symbol = "356-4-123"; break;
      case 0xa5: case 0xffe5: symbol = "356-4-13456"; break;
      case '%': symbol = "356-1234"; break;
      case 0x2030: symbol = "356-1234-134"; break;
      case 0xb0: symbol = "356-145"; break;
      case 0x2103: symbol = "356-145-6-14"; break;
      case 0x2109: symbol = "356-145-6-124"; break;
    }
    if (symbol) {
      emit(symbol, "K65.K69.currency-unit");
      if (hangul(nextCp)) emit("", "K65.K69.following-hangul-space", true);
      return;
    }
    for (const auto& p : rules::PUNCTUATION) if (p.cp == cp) {
      // K51 semantic contrast/list spacing cannot be inferred from a colon alone.
      if (cp == ':' && nextCp && !space(nextCp) && !(digit(previous) && digit(nextCp)) && !roman)
        issue("UNVERIFIED.K51.semantic-spacing");
      emit(p.pattern, "K49.K59.K71.punctuation");
      if (cp == ';' && nextCp && !space(nextCp)) emit("", "K59.semicolon-space", true);
      return;
    }
    issue("UNSUPPORTED.character");
  }
};
}
inline Measurement measureTranslation(const std::string& text) { return detail::Translator(text, nullptr).run(); }
inline Measurement measureTranslation(const std::string& text, AuditCallback audit, void* context) {
  return detail::Translator(text, nullptr, audit, context).run();
}
inline Translation translate(const std::string& text, AuditCallback audit, void* context) {
  Translation result;
  const auto size = measureTranslation(text);
  // Two streaming passes allocate exactly the necessary cell storage.
  result.cells.reserve(size.cells);
  const auto done = detail::Translator(text, &result.cells, audit, context).run();
  result.unsupported = done.unsupported;
  return result;
}
inline Translation translate(const std::string& text) { return translate(text, nullptr, nullptr); }
}
```

## firmware/earlink/BrailleMapping.h

```cpp
#pragma once
#include <array>
#include <stdint.h>
#include <stddef.h>

namespace earlink {
namespace mapping {
// Match the user's working test: T1..T6 = data[0] bits 0..5;
// T7..T12 = data[1], T13..T18 = data[2]. Send data[2] first.
// Unused bits 6/7 remain 0.
// T numbers are software channel labels, not 74HC595 Q pin numbers.
// Index = logical cell * 6 + dot - 1, reading orientation: 1 4 / 2 5 / 3 6.
// User-confirmed solenoid columns, left to right, each top to bottom:
// (1,3,5) (2,4,6) | (12,10,8) (11,9,7) | (18,16,14) (17,15,13).
// Solenoid numbers are interpreted as T1..T18 above. Confirmation describes
// the supplied layout; it does not mean this firmware was run on the device.
constexpr bool PHYSICAL_LAYOUT_VERIFIED = true;
constexpr std::array<uint8_t, 18> LOGICAL_TO_CHANNEL = {{
   1,  3,  5,  2,  4,  6, // logical cell 1, dots 1..6
  12, 10,  8, 11,  9,  7, // logical cell 2, dots 1..6
  18, 16, 14, 17, 15, 13  // logical cell 3, dots 1..6
}};
struct Validation {
  bool outOfRange = false, duplicate = false;
  uint32_t missingChannels = 0;
  uint32_t invalidPositions = 0;
  constexpr bool valid() const { return !outOfRange && !duplicate && !missingChannels && !invalidPositions; }
};
constexpr Validation validate(const std::array<uint8_t, 18>& table) {
  Validation result{}; uint32_t seen = 0;
  for (size_t i = 0; i < table.size(); ++i) {
    const uint8_t channel = table[i];
    if (channel < 1 || channel > 18) {
      result.outOfRange = true; result.invalidPositions |= uint32_t(1) << i; continue;
    }
    const uint32_t bit = uint32_t(1) << (channel - 1);
    if (seen & bit) { result.duplicate = true; result.invalidPositions |= uint32_t(1) << i; }
    seen |= bit;
  }
  result.missingChannels = 0x3ffffu & ~seen;
  return result;
}
static_assert(validate(LOGICAL_TO_CHANNEL).valid(), "Braille mapping must contain T1..T18 exactly once");

// Input bits name actuators to LOWER, not raised braille dots.
// HIGH=DOWN, LOW=UP/released, as confirmed by the connection wave.
// DisplayController handles page polarity; mapping must not invert again.
// Empty lowering mask / invalid mapping releases every channel.
inline std::array<uint8_t, 3> shiftBytes(const std::array<uint8_t, 3>& lowered,
                                      const std::array<uint8_t, 18>& table = LOGICAL_TO_CHANNEL) {
  std::array<uint8_t, 3> bytes = {{0, 0, 0}};
  if (!validate(table).valid()) return bytes;
  for (size_t logical = 0; logical < 18; ++logical) {
    if (lowered[logical / 6] & (1u << (logical % 6))) {
      const uint8_t index = uint8_t(table[logical] - 1);
      bytes[2 - index / 6] |= uint8_t(1u << (index % 6));
    }
  }
  return bytes;
}
}
}
```

## firmware/earlink/BrailleOutput.h

```cpp
#pragma once
#include <Arduino.h>
#include "BrailleMapping.h"
#include "Config.h"

namespace earlink {
class BrailleOutput {
 public:
  void write(const std::array<uint8_t, 3>& cells) const {
    if (!config::OUTPUT_ENABLED) return;
    const auto bytes = mapping::shiftBytes(cells);
    digitalWrite(config::LATCH_PIN, LOW);
    for (const auto byte : bytes)
      shiftOut(config::DATA_PIN, config::CLOCK_PIN, LSBFIRST, byte);
    digitalWrite(config::LATCH_PIN, HIGH);
  }
  void begin() const {
    if (config::OUTPUT_ENABLED) {
      pinMode(config::DATA_PIN, OUTPUT);
      pinMode(config::LATCH_PIN, OUTPUT);
      pinMode(config::CLOCK_PIN, OUTPUT);
      digitalWrite(config::DATA_PIN, LOW);
      digitalWrite(config::CLOCK_PIN, LOW);
      digitalWrite(config::LATCH_PIN, LOW);
      write({{0, 0, 0}}); // Release before logging or BLE initialization.
      Serial.println("[BRAILLE] Initial output 00 00 00 (all channels released)");
    }
    logMapping();
  }
 private:
  static void logMapping() {
    const auto validation = mapping::validate(mapping::LOGICAL_TO_CHANNEL);
    Serial.printf("[mapping] valid=%u physical=%s missing=%05lX invalid=%05lX\n",
      validation.valid(), mapping::PHYSICAL_LAYOUT_VERIFIED ? "user-confirmed" : "UNVERIFIED/provisional",
      static_cast<unsigned long>(validation.missingChannels), static_cast<unsigned long>(validation.invalidPositions));
    for (size_t i = 0; i < mapping::LOGICAL_TO_CHANNEL.size(); ++i)
      Serial.printf("[mapping] cell=%u dot=%u -> T%u\n",
        unsigned(i / 6 + 1), unsigned(i % 6 + 1), mapping::LOGICAL_TO_CHANNEL[i]);
  }
};
}
```

## firmware/earlink/Protocol.h

```cpp
#pragma once
#include <stdint.h>
#include <string>
#include "EarlinkLimits.h"

namespace earlink {
enum Result : uint8_t { NONE = 0, ACCEPTED = 1, BAD_PACKET = 2, TOO_LONG = 3,
                        OUT_OF_ORDER = 4, QUEUE_FULL = 5, TIMED_OUT = 6 };
inline uint16_t read16(const uint8_t* p) { return uint16_t(p[0]) | (uint16_t(p[1]) << 8); }
inline void write16(uint8_t* p, uint16_t value) { p[0] = value & 255; p[1] = value >> 8; }

class Receiver {
 public:
  uint16_t id = 0;
  std::string text;
  bool receiving = false;
  uint32_t lastAt = 0;

  void reset() { receiving = false; text.clear(); expected = 0; }
  Result accept(const uint8_t* data, size_t size, uint32_t now) {
    if (!data || size < 6 || size > 20 || data[0] != 0x45 || data[1] != 0x4c || data[2] != 1) {
      reset(); return BAD_PACKET;
    }
    const uint16_t incomingId = read16(data + 4);
    const uint8_t op = data[3];
    if (!incomingId) { reset(); return BAD_PACKET; }
    if (op == 1) {
      reset(); id = incomingId;
      if (size != 8) return BAD_PACKET;
      expected = read16(data + 6);
      if (!expected || expected > MAX_TEXT_BYTES) return TOO_LONG;
      text.reserve(expected); receiving = true; lastAt = now;
      return NONE;
    }
    if (!receiving || incomingId != id) {
      reset(); id = incomingId; return OUT_OF_ORDER;
    }
    lastAt = now;
    if (op == 2) {
      if (size < 9 || size > 20 || read16(data + 6) != text.size() ||
          text.size() + size - 8 > expected) { reset(); return OUT_OF_ORDER; }
      text.append(reinterpret_cast<const char*>(data + 8), size - 8);
      return NONE;
    }
    if (op == 3 && size == 6) {
      receiving = false;
      if (text.size() != expected) { reset(); return OUT_OF_ORDER; }
      return ACCEPTED;
    }
    reset(); return BAD_PACKET;
  }
 private:
  size_t expected = 0;
};
}
```

## firmware/earlink/Pager.h

```cpp
#pragma once
#include <array>
#include <deque>
#include <utility>
#include "BrailleText.h"

namespace earlink {
struct Message {
  uint16_t id = 0;
  Translation translation;
};

class Pager {
 public:
  bool automatic = true;
  bool visible = false;
  uint32_t intervalMs = 2000;
  uint32_t blankMs = 250;
  uint32_t holdTimeoutMs = 10000;
  uint16_t page = 0;
  Message current;

  bool active() const { return !current.translation.cells.empty(); }
  uint16_t pages() const { return uint16_t((current.translation.cells.size() + 2) / 3); }
  uint8_t queued() const { return uint8_t(waiting.size()); }
  size_t bufferedCells() const {
    size_t total = current.translation.cells.size();
    for (const auto& message : waiting) total += message.translation.cells.size();
    return total;
  }
  bool canEnqueue(size_t cells) const {
    return cells && cells <= MAX_TRANSLATION_CELLS && waiting.size() < 3 &&
           bufferedCells() + cells <= MAX_BUFFERED_CELLS;
  }
  bool enqueue(Message message, uint32_t now) {
    if (message.translation.unsupported || !canEnqueue(message.translation.cells.size())) return false;
    waiting.push_back(std::move(message));
    if (!active() && !gap) start(now);
    return true;
  }
  std::array<uint8_t, 3> output() const {
    std::array<uint8_t, 3> cells = {0, 0, 0};
    if (active() && visible) {
      for (size_t i = 0; i < 3; ++i) {
        const size_t index = size_t(page) * 3 + i;
        if (index < current.translation.cells.size()) cells[i] = current.translation.cells[index];
      }
    }
    return cells;
  }
  bool tick(uint32_t now) {
    if (gap) {
      if (uint32_t(now - changedAt) < blankMs) return false;
      gap = false;
      if (active()) { visible = true; changedAt = now; }
      else start(now);
      return true;
    }
    if (!active()) return false;
    if (automatic && uint32_t(now - changedAt) >= intervalMs) { next(now); return true; }
    if (!automatic && visible && uint32_t(now - changedAt) >= holdTimeoutMs) {
      visible = false; return true;
    }
    return false;
  }
  void next(uint32_t now) {
    if (!active()) { start(now); return; }
    if (++page >= pages()) { current = Message{}; page = 0; }
    visible = false; gap = true; changedAt = now;
  }
  void previous(uint32_t now) {
    if (!active()) return;
    if (page > 0) --page;
    gap = true; visible = false; changedAt = now;
  }
  void setAutomatic(bool value, uint32_t now) {
    automatic = value; changedAt = now;
    if (value && active() && !gap) visible = true;
  }
  // Queued text must get its full display time after the connection wave.
  void restartDisplayTimer(uint32_t now) { changedAt = now; }
  void clear() {
    waiting.clear(); current = Message{}; page = 0; visible = false; gap = false;
  }
 private:
  std::deque<Message> waiting;
  uint32_t changedAt = 0;
  bool gap = false;
  void start(uint32_t now) {
    if (waiting.empty()) return;
    current = std::move(waiting.front()); waiting.pop_front();
    page = 0; visible = true; changedAt = now;
  }
};
}
```

## firmware/earlink/ConnectionWave.h

```cpp
#pragma once
#include <array>
#include <stdint.h>

namespace earlink {
// Nonblocking left-to-right sweep of six vertical columns. Each pulse has
// exactly three selected dots; each gap and the final state release all dots.
class ConnectionWave {
 public:
  uint32_t pulseMs = 200;
  uint32_t gapMs = 50;
  bool active() const { return running; }
  void start(uint32_t now) {
    running = true; energized = true; column = 0; changedAt = now;
  }
  void cancel() { running = false; energized = false; column = 0; }
  std::array<uint8_t, 3> output() const {
    std::array<uint8_t, 3> cells = {{0, 0, 0}};
    if (running && energized) cells[column / 2] = column % 2 ? 0x38 : 0x07;
    return cells;
  }
  bool tick(uint32_t now) {
    if (!running || uint32_t(now - changedAt) < (energized ? pulseMs : gapMs)) return false;
    changedAt = now;
    if (energized) {
      energized = false;
      if (column == 5) running = false;
    } else {
      ++column; energized = true;
    }
    return true;
  }
 private:
  bool running = false, energized = false;
  uint8_t column = 0;
  uint32_t changedAt = 0;
};
}
```

## firmware/earlink/DisplayController.h

```cpp
#pragma once
#include "Pager.h"
#include "ConnectionWave.h"

namespace earlink {
// BLE reception/translation can continue during the wave. The page timer is
// suspended until the indication ends, and only one source drives the output.
// Pager bits name RAISED braille dots; output() bits name LOWERED actuators.
class DisplayController {
 public:
  Pager pager;
  ConnectionWave wave;
  void clear() { wave.cancel(); pager.clear(); }
  void startConnectionWave(uint32_t now) { clear(); wave.start(now); }
  bool pageVisible() const { return !wave.active() && pager.active() && pager.visible; }
  std::array<uint8_t, 3> output() const {
    if (wave.active()) return wave.output(); // Wave already names dots to lower.
    if (!pageVisible()) return {{0, 0, 0}}; // Idle/gaps/clear must release all.
    auto lowered = pager.output();
    // HIGH lowers a dot, LOW leaves it raised. Invert ONLY a visible page,
    // including its blank cells/padding, without an all-HIGH pre-clear step.
    for (auto& cell : lowered) cell = uint8_t((~cell) & 0x3f);
    return lowered;
  }
  bool tick(uint32_t now) {
    if (!wave.active()) return pager.tick(now);
    if (!wave.tick(now)) return false;
    if (!wave.active()) pager.restartDisplayTimer(now);
    return true;
  }
};
}
```

## firmware/earlink/earlink.ino

```cpp
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <esp_heap_caps.h>
#include <esp_system.h>
#include <atomic>
#include "Config.h"
#include "Protocol.h"
#include "DisplayController.h"
#include "BrailleOutput.h"

// Existing UUIDs and v1 wire format are unchanged.
static const char* SERVICE_UUID = "8f3a0001-7c3b-4b8a-9f52-123456789abc";
static const char* TEXT_UUID = "8f3a0002-7c3b-4b8a-9f52-123456789abc";
static const char* STATUS_UUID = "8f3a0003-7c3b-4b8a-9f52-123456789abc";
struct Event { uint8_t kind, size, data[20]; };
QueueHandle_t events = nullptr;
BLECharacteristic* statusCharacteristic = nullptr;
std::atomic<bool> connected(false), disconnected(false), overflow(false);
std::atomic<bool> connectionPending(false);
earlink::Receiver receiver;
earlink::DisplayController display;
earlink::Pager& pager = display.pager;
earlink::BrailleOutput brailleOutput;
uint16_t acknowledgedId = 0;
earlink::Result acknowledgedResult = earlink::NONE;

const char* resetReasonName(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON: return "POWERON";
    case ESP_RST_SW: return "SOFTWARE";
    case ESP_RST_PANIC: return "PANIC";
    case ESP_RST_INT_WDT: return "INTERRUPT_WATCHDOG";
    case ESP_RST_TASK_WDT: return "TASK_WATCHDOG";
    case ESP_RST_WDT: return "WATCHDOG";
    case ESP_RST_BROWNOUT: return "BROWNOUT";
    default: return "OTHER";
  }
}
void logHealth(uint32_t now) {
  static uint32_t lastAt = 0;
  if (uint32_t(now - lastAt) < 1000) return;
  lastAt = now;
  Serial.printf("[health] uptime_ms=%lu free=%u largest=%u connected=%u wave=%u\n",
    static_cast<unsigned long>(now), unsigned(heap_caps_get_free_size(MALLOC_CAP_8BIT)),
    unsigned(heap_caps_get_largest_free_block(MALLOC_CAP_8BIT)), unsigned(connected.load()),
    unsigned(display.wave.active()));
}

void writeOutput() {
  const auto raised = pager.output();
  const auto lowered = display.output();
  const auto wire = earlink::mapping::shiftBytes(lowered);
  brailleOutput.write(lowered);
  Serial.printf("[page] source=%s id=%u %u/%u braille=%02X,%02X,%02X down=%02X,%02X,%02X wire=%02X,%02X,%02X output=%s\n",
    display.wave.active() ? "wave" : (display.pageVisible() ? "page" : "idle"),
    pager.current.id, pager.active() ? pager.page + 1 : 0, pager.pages(),
    raised[0], raised[1], raised[2], lowered[0], lowered[1], lowered[2],
    wire[0], wire[1], wire[2], config::OUTPUT_ENABLED ? "GPIO" : "preview");
}
void publishStatus() {
  if (!statusCharacteristic) return;
  uint8_t state[16] = {};
  state[0] = 1;
  state[1] = (pager.active() ? 1 : 0) | (pager.automatic ? 2 : 0) |
             (config::OUTPUT_ENABLED ? 4 : 0) | (display.pageVisible() ? 8 : 0);
  earlink::write16(state + 2, acknowledgedId);
  state[4] = acknowledgedResult; state[5] = pager.queued();
  earlink::write16(state + 6, pager.current.id);
  earlink::write16(state + 8, pager.active() ? pager.page + 1 : 0);
  earlink::write16(state + 10, pager.pages());
  earlink::write16(state + 12, pager.current.translation.unsupported);
  earlink::write16(state + 14, uint16_t(pager.intervalMs));
  statusCharacteristic->setValue(state, sizeof(state));
  if (connected.load()) statusCharacteristic->notify();
}
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    connected.store(true); connectionPending.store(true); Serial.println("[BLE] Connected");
  }
  void onDisconnect(BLEServer*) override {
    connected.store(false); disconnected.store(true); Serial.println("[BLE] Disconnected");
  }
};
class WriteCallbacks : public BLECharacteristicCallbacks {
 public:
  explicit WriteCallbacks(uint8_t eventKind) : kind(eventKind) {}
  void onWrite(BLECharacteristic* characteristic) override {
    const auto value = characteristic->getValue(); // String (3.x) / std::string (2.x)
    Event event{}; event.kind = kind;
    if (!events || value.length() == 0 || value.length() > sizeof(event.data)) {
      overflow.store(true); return;
    }
    event.size = uint8_t(value.length());
    memcpy(event.data, value.c_str(), event.size);
    if (xQueueSend(events, &event, 0) != pdTRUE) overflow.store(true);
  }
 private:
  uint8_t kind;
};
void handleCommand(const Event& event, uint32_t now) {
  if (event.size < 2 || event.data[0] != 1) return;
  switch (event.data[1]) {
    case 1: pager.setAutomatic(false, now); pager.next(now); break;
    case 2: pager.setAutomatic(false, now); pager.previous(now); break;
    case 3: display.clear(); receiver.reset(); break;
    case 4: pager.setAutomatic(false, now); break;
    case 5: pager.setAutomatic(true, now); break;
    case 6:
      if (event.size == 4) {
        const uint16_t interval = earlink::read16(event.data + 2);
        if (interval >= 1000 && interval <= 10000) pager.intervalMs = interval;
      }
      break;
    default: return;
  }
  writeOutput(); publishStatus();
}
void logTranslationIssue(const earlink::Audit& record, void* context) {
  if (!record.issue) return;
  auto& logged = *static_cast<unsigned*>(context);
  if (logged++ < 32)
    Serial.printf("[translate] byte=%u character=%u U+%04lX reason=%s\n",
      unsigned(record.byteOffset), unsigned(record.characterOffset),
      static_cast<unsigned long>(record.codepoint), record.rule);
}
void acceptText(uint32_t now) {
  const auto measured = earlink::measureTranslation(receiver.text);
  if (measured.unsupported || !measured.cells) {
    unsigned logged = 0;
    earlink::measureTranslation(receiver.text, logTranslationIssue, &logged);
    Serial.printf("[translate] REJECT id=%u unsupported=%u; detailed logs capped at 32\n",
      receiver.id, measured.unsupported);
    acknowledgedResult = earlink::BAD_PACKET; // existing code: no partial/misleading output
    return;
  }
  const size_t freeBytes = heap_caps_get_free_size(MALLOC_CAP_8BIT);
  const size_t largest = heap_caps_get_largest_free_block(MALLOC_CAP_8BIT);
  if (!pager.canEnqueue(measured.cells) || measured.cells + config::MIN_FREE_HEAP_BYTES > freeBytes ||
      measured.cells > largest) {
    Serial.printf("[translate] REJECT capacity id=%u cells=%u free=%u largest=%u\n",
      receiver.id, unsigned(measured.cells), unsigned(freeBytes), unsigned(largest));
    acknowledgedResult = earlink::QUEUE_FULL; return;
  }
  earlink::Message message; message.id = receiver.id;
  message.translation = earlink::translate(receiver.text);
  if (!pager.enqueue(std::move(message), now)) acknowledgedResult = earlink::QUEUE_FULL;
}
void setup() {
  Serial.begin(115200);
  brailleOutput.begin(); // Active-high; startup releases every channel.
  const auto reason = esp_reset_reason();
  Serial.printf("[boot] reset=%s code=%u startup_bytes=00,00,00 output=%s\n",
    resetReasonName(reason), unsigned(reason), config::OUTPUT_ENABLED ? "GPIO" : "preview");
  display.wave.pulseMs = config::CONNECT_PULSE_MS;
  display.wave.gapMs = config::CONNECT_GAP_MS;
  pager.intervalMs = config::PAGE_MS; pager.blankMs = config::BLANK_MS;
  pager.holdTimeoutMs = config::HOLD_TIMEOUT_MS;
  events = xQueueCreate(16, sizeof(Event));
  if (!events) { Serial.println("[ERROR] Event queue allocation failed"); return; }
  Serial.println("[boot] Initializing BLE");
  BLEDevice::init("EarLink");
  Serial.println("[boot] BLE initialized");
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService* service = server->createService(SERVICE_UUID);
  auto* textCharacteristic = service->createCharacteristic(TEXT_UUID, BLECharacteristic::PROPERTY_WRITE);
  textCharacteristic->setCallbacks(new WriteCallbacks(1));
  statusCharacteristic = service->createCharacteristic(STATUS_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_NOTIFY);
  statusCharacteristic->addDescriptor(new BLE2902());
  statusCharacteristic->setCallbacks(new WriteCallbacks(2));
  publishStatus(); service->start();
  auto* advertising = server->getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID); advertising->setScanResponse(true); advertising->start();
  Serial.println("[EARLINK READY] HIGH=DOWN / LOW=UP; page: braille=LOW, background=HIGH; idle=00,00,00; BLE connect=column wave");
}
void loop() {
  logHealth(millis());
  if (!events) { delay(100); return; }
  if (disconnected.exchange(false)) {
    xQueueReset(events); receiver.reset(); display.clear();
    acknowledgedId = 0; acknowledgedResult = earlink::NONE;
    writeOutput(); publishStatus();
    if (!connected.load()) BLEDevice::startAdvertising();
    Serial.println("[BRAILLE] Disconnected - all channels released");
  }
  if (overflow.exchange(false)) {
    xQueueReset(events); receiver.reset();
    acknowledgedId = receiver.id; acknowledgedResult = earlink::BAD_PACKET;
    Serial.println("[BLE] Invalid write or event queue overflow"); publishStatus();
  }
  const uint32_t now = millis();
  if (connectionPending.exchange(false) && connected.load()) {
    display.startConnectionWave(now);
    writeOutput(); publishStatus();
    Serial.println("[wave] Begin: six columns, three channels per pulse");
  }
  Event event{};
  while (xQueueReceive(events, &event, 0) == pdTRUE) {
    if (!connected.load()) continue;
    if (event.kind == 2) { handleCommand(event, now); continue; }
    const auto result = receiver.accept(event.data, event.size, now);
    if (result == earlink::NONE) continue;
    acknowledgedId = receiver.id; acknowledgedResult = result;
    if (result == earlink::ACCEPTED) {
      acceptText(now); receiver.reset(); writeOutput();
    } else Serial.printf("[BLE] Packet rejected id=%u reason=%u\n", receiver.id, result);
    publishStatus();
  }
  if (receiver.receiving && uint32_t(now - receiver.lastAt) >= config::RECEIVE_TIMEOUT_MS) {
    acknowledgedId = receiver.id; acknowledgedResult = earlink::TIMED_OUT;
    receiver.reset(); Serial.println("[BLE] Receive timeout"); publishStatus();
  }
  if (display.tick(millis())) { writeOutput(); publishStatus(); }
  delay(2);
}
```

## firmware/backups/earlink-full.ino.txt

```cpp
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <esp_heap_caps.h>
#include <esp_system.h>
#include <atomic>
#include "Config.h"
#include "Protocol.h"
#include "Pager.h"
#include "BrailleOutput.h"

// Existing UUIDs and v1 wire format are unchanged.
static const char* SERVICE_UUID = "8f3a0001-7c3b-4b8a-9f52-123456789abc";
static const char* TEXT_UUID = "8f3a0002-7c3b-4b8a-9f52-123456789abc";
static const char* STATUS_UUID = "8f3a0003-7c3b-4b8a-9f52-123456789abc";
struct Event { uint8_t kind, size, data[20]; };
QueueHandle_t events = nullptr;
BLECharacteristic* statusCharacteristic = nullptr;
std::atomic<bool> connected(false), disconnected(false), overflow(false);
earlink::Receiver receiver;
earlink::Pager pager;
earlink::BrailleOutput brailleOutput;
uint16_t acknowledgedId = 0;
earlink::Result acknowledgedResult = earlink::NONE;

const char* resetReasonName(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON: return "POWERON";
    case ESP_RST_SW: return "SOFTWARE";
    case ESP_RST_PANIC: return "PANIC";
    case ESP_RST_INT_WDT: return "INTERRUPT_WATCHDOG";
    case ESP_RST_TASK_WDT: return "TASK_WATCHDOG";
    case ESP_RST_WDT: return "WATCHDOG";
    case ESP_RST_BROWNOUT: return "BROWNOUT";
    default: return "OTHER";
  }
}
void logHealth(uint32_t now) {
  static uint32_t lastAt = 0;
  if (uint32_t(now - lastAt) < 1000) return;
  lastAt = now;
  Serial.printf("[health] uptime_ms=%lu free=%u largest=%u connected=%u mode=%s\n",
    static_cast<unsigned long>(now), unsigned(heap_caps_get_free_size(MALLOC_CAP_8BIT)),
    unsigned(heap_caps_get_largest_free_block(MALLOC_CAP_8BIT)), unsigned(connected.load()),
    config::STARTUP_HOLD_DIAGNOSTIC ? "startup-hold" : "normal");
}

void writeOutput() {
  const auto cells = pager.output();
  brailleOutput.write(cells);
  Serial.printf("[page] id=%u %u/%u cells=%02X,%02X,%02X output=%s\n",
    pager.current.id, pager.active() ? pager.page + 1 : 0, pager.pages(),
    cells[0], cells[1], cells[2], config::OUTPUT_ENABLED ? "GPIO" : "preview");
}
void publishStatus() {
  if (!statusCharacteristic) return;
  uint8_t state[16] = {};
  state[0] = 1;
  state[1] = (pager.active() ? 1 : 0) | (pager.automatic ? 2 : 0) |
             (config::OUTPUT_ENABLED ? 4 : 0) | (pager.visible ? 8 : 0);
  earlink::write16(state + 2, acknowledgedId);
  state[4] = acknowledgedResult; state[5] = pager.queued();
  earlink::write16(state + 6, pager.current.id);
  earlink::write16(state + 8, pager.active() ? pager.page + 1 : 0);
  earlink::write16(state + 10, pager.pages());
  earlink::write16(state + 12, pager.current.translation.unsupported);
  earlink::write16(state + 14, uint16_t(pager.intervalMs));
  statusCharacteristic->setValue(state, sizeof(state));
  if (connected.load()) statusCharacteristic->notify();
}
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    connected.store(true); Serial.println("[BLE] Connected");
  }
  void onDisconnect(BLEServer*) override {
    connected.store(false); disconnected.store(true); Serial.println("[BLE] Disconnected");
  }
};
class WriteCallbacks : public BLECharacteristicCallbacks {
 public:
  explicit WriteCallbacks(uint8_t eventKind) : kind(eventKind) {}
  void onWrite(BLECharacteristic* characteristic) override {
    const auto value = characteristic->getValue(); // String (3.x) / std::string (2.x)
    Event event{}; event.kind = kind;
    if (!events || value.length() == 0 || value.length() > sizeof(event.data)) {
      overflow.store(true); return;
    }
    event.size = uint8_t(value.length());
    memcpy(event.data, value.c_str(), event.size);
    if (xQueueSend(events, &event, 0) != pdTRUE) overflow.store(true);
  }
 private:
  uint8_t kind;
};
void handleCommand(const Event& event, uint32_t now) {
  if (event.size < 2 || event.data[0] != 1) return;
  switch (event.data[1]) {
    case 1: pager.setAutomatic(false, now); pager.next(now); break;
    case 2: pager.setAutomatic(false, now); pager.previous(now); break;
    case 3: pager.clear(); receiver.reset(); break;
    case 4: pager.setAutomatic(false, now); break;
    case 5: pager.setAutomatic(true, now); break;
    case 6:
      if (event.size == 4) {
        const uint16_t interval = earlink::read16(event.data + 2);
        if (interval >= 1000 && interval <= 10000) pager.intervalMs = interval;
      }
      break;
    default: return;
  }
  writeOutput(); publishStatus();
}
void logTranslationIssue(const earlink::Audit& record, void* context) {
  if (!record.issue) return;
  auto& logged = *static_cast<unsigned*>(context);
  if (logged++ < 32)
    Serial.printf("[translate] byte=%u character=%u U+%04lX reason=%s\n",
      unsigned(record.byteOffset), unsigned(record.characterOffset),
      static_cast<unsigned long>(record.codepoint), record.rule);
}
void acceptText(uint32_t now) {
  const auto measured = earlink::measureTranslation(receiver.text);
  if (measured.unsupported || !measured.cells) {
    unsigned logged = 0;
    earlink::measureTranslation(receiver.text, logTranslationIssue, &logged);
    Serial.printf("[translate] REJECT id=%u unsupported=%u; detailed logs capped at 32\n",
      receiver.id, measured.unsupported);
    acknowledgedResult = earlink::BAD_PACKET; // existing code: no partial/misleading output
    return;
  }
  const size_t freeBytes = heap_caps_get_free_size(MALLOC_CAP_8BIT);
  const size_t largest = heap_caps_get_largest_free_block(MALLOC_CAP_8BIT);
  if (!pager.canEnqueue(measured.cells) || measured.cells + config::MIN_FREE_HEAP_BYTES > freeBytes ||
      measured.cells > largest) {
    Serial.printf("[translate] REJECT capacity id=%u cells=%u free=%u largest=%u\n",
      receiver.id, unsigned(measured.cells), unsigned(freeBytes), unsigned(largest));
    acknowledgedResult = earlink::QUEUE_FULL; return;
  }
  earlink::Message message; message.id = receiver.id;
  message.translation = earlink::translate(receiver.text);
  if (!pager.enqueue(std::move(message), now)) acknowledgedResult = earlink::QUEUE_FULL;
}
void setup() {
  Serial.begin(115200);
  brailleOutput.begin(); // retains active-low, LSBFIRST, 3-byte startup all DOWN
  const auto reason = esp_reset_reason();
  Serial.printf("[boot] reset=%s code=%u startup_bytes=3F,3F,3F output=%s\n",
    resetReasonName(reason), unsigned(reason), config::OUTPUT_ENABLED ? "GPIO" : "preview");
  if (config::STARTUP_HOLD_DIAGNOSTIC) {
    Serial.println("[diagnostic] Startup output latched once; BLE and paging skipped; drive level unchanged");
    return;
  }
  pager.intervalMs = config::PAGE_MS; pager.blankMs = config::BLANK_MS;
  pager.holdTimeoutMs = config::HOLD_TIMEOUT_MS;
  events = xQueueCreate(16, sizeof(Event));
  if (!events) { Serial.println("[ERROR] Event queue allocation failed"); return; }
  Serial.println("[boot] Initializing BLE");
  BLEDevice::init("EarLink");
  Serial.println("[boot] BLE initialized");
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService* service = server->createService(SERVICE_UUID);
  auto* textCharacteristic = service->createCharacteristic(TEXT_UUID, BLECharacteristic::PROPERTY_WRITE);
  textCharacteristic->setCallbacks(new WriteCallbacks(1));
  statusCharacteristic = service->createCharacteristic(STATUS_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_NOTIFY);
  statusCharacteristic->addDescriptor(new BLE2902());
  statusCharacteristic->setCallbacks(new WriteCallbacks(2));
  publishStatus(); service->start();
  auto* advertising = server->getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID); advertising->setScanResponse(true); advertising->start();
  Serial.println("[EARLINK READY] 3 cells / 18 dots; 1=DOWN / 0=UP; initial=DOWN");
}
void loop() {
  logHealth(millis());
  if (config::STARTUP_HOLD_DIAGNOSTIC) { delay(2); return; }
  if (!events) { delay(100); return; }
  if (disconnected.exchange(false)) {
    xQueueReset(events); receiver.reset(); pager.clear();
    acknowledgedId = 0; acknowledgedResult = earlink::NONE;
    writeOutput(); publishStatus(); BLEDevice::startAdvertising();
    Serial.println("[BRAILLE] Disconnected - all dots DOWN");
  }
  if (overflow.exchange(false)) {
    xQueueReset(events); receiver.reset();
    acknowledgedId = receiver.id; acknowledgedResult = earlink::BAD_PACKET;
    Serial.println("[BLE] Invalid write or event queue overflow"); publishStatus();
  }
  const uint32_t now = millis();
  Event event{};
  while (xQueueReceive(events, &event, 0) == pdTRUE) {
    if (!connected.load()) continue;
    if (event.kind == 2) { handleCommand(event, now); continue; }
    const auto result = receiver.accept(event.data, event.size, now);
    if (result == earlink::NONE) continue;
    acknowledgedId = receiver.id; acknowledgedResult = result;
    if (result == earlink::ACCEPTED) {
      acceptText(now); receiver.reset(); writeOutput();
    } else Serial.printf("[BLE] Packet rejected id=%u reason=%u\n", receiver.id, result);
    publishStatus();
  }
  if (receiver.receiving && uint32_t(now - receiver.lastAt) >= config::RECEIVE_TIMEOUT_MS) {
    acknowledgedId = receiver.id; acknowledgedResult = earlink::TIMED_OUT;
    receiver.reset(); Serial.println("[BLE] Receive timeout"); publishStatus();
  }
  if (pager.tick(now)) { writeOutput(); publishStatus(); }
  delay(2);
}
```

## firmware/backups/solenoid-all-high-hold.ino.txt

```cpp
#include <Arduino.h>

// Based on the user's working individual-solenoid test.
// 1 = apply the tested channel signal; 0 = release, as in allRelease().
// Each register uses only bits 0..5; unused bits 6 and 7 remain 0.
#define DATA_PIN 16
#define LATCH_PIN 17
#define CLOCK_PIN 18
#define CELL_COUNT 3

constexpr uint8_t ALL_DOWN_MASK = 0x3F;
uint8_t data[CELL_COUNT] = {0, 0, 0};

// Keep the working test's reverse register order and LSBFIRST.
void refresh() {
  digitalWrite(LATCH_PIN, LOW);
  for (int i = CELL_COUNT - 1; i >= 0; --i) {
    shiftOut(DATA_PIN, CLOCK_PIN, LSBFIRST, data[i]);
  }
  digitalWrite(LATCH_PIN, HIGH);
}

void allRelease() {
  for (int i = 0; i < CELL_COUNT; ++i) {
    data[i] = 0;
  }
  refresh();
}

void allDown() {
  for (int i = 0; i < CELL_COUNT; ++i) {
    data[i] = ALL_DOWN_MASK;
  }
  refresh();
}

void printStatus() {
  Serial.printf("[status] bytes=%02X %02X %02X uptime_ms=%lu\n",
    unsigned(data[2]), unsigned(data[1]), unsigned(data[0]),
    static_cast<unsigned long>(millis()));
  Serial.println("위 값은 전송한 명령값이며 실제 위치나 전류 측정값은 아닙니다.");
}

void printHelp() {
  Serial.println("on / down : 전체 18채널 신호 유지 (3F 3F 3F)");
  Serial.println("off       : 전체 신호 해제 (00 00 00)");
  Serial.println("status    : 전송값과 동작 시간 확인");
  Serial.println("help      : 명령어 출력");
}

void setup() {
  Serial.begin(115200);
  Serial.setTimeout(100);

  pinMode(DATA_PIN, OUTPUT);
  pinMode(LATCH_PIN, OUTPUT);
  pinMode(CLOCK_PIN, OUTPUT);
  digitalWrite(DATA_PIN, LOW);
  digitalWrite(CLOCK_PIN, LOW);
  digitalWrite(LATCH_PIN, LOW);

  allDown();
  Serial.println("EARLINK ESP32 ALL-DOWN HOLD TEST");
  Serial.println("전체 18채널에 신호를 보냈습니다. off 또는 전원 차단 전까지 유지합니다.");
  printStatus();
  printHelp();
}

void loop() {
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    command.toLowerCase();

    if (command == "on" || command == "down") {
      allDown();
      Serial.println("전체 18채널 신호 유지");
    } else if (command == "off") {
      allRelease();
      Serial.println("전체 신호 해제");
    } else if (command == "status") {
      printStatus();
    } else if (command == "help") {
      printHelp();
    } else if (command.length() > 0) {
      Serial.println("알 수 없는 명령어. help를 입력하세요.");
    }
  }
  delay(10);
}
```

## firmware/tests/core_test.cpp

```cpp
#include <cassert>
#include <fstream>
#include <iostream>
#include <iterator>
#include "../earlink/BrailleText.h"
#include "../earlink/Protocol.h"
#include "../earlink/Pager.h"
#include "../earlink/BrailleMapping.h"
#include "../earlink/DisplayController.h"

using namespace earlink;

static Message message(uint16_t id, std::initializer_list<uint8_t> cells) {
  Message result; result.id = id; result.translation.cells = cells; return result;
}
static void collectIssues(const Audit& audit, void* context) {
  if (audit.issue) static_cast<std::vector<Audit>*>(context)->push_back(audit);
}

static void translationTests() {
  assert(translate(u8"한글").cells == std::vector<uint8_t>({dots("245"), dots("25"), dots("4"), dots("2346")}));
  assert(translate(u8"아").cells == std::vector<uint8_t>({dots("126")}));
  assert(translate(u8"아예").cells == std::vector<uint8_t>({dots("126"), dots("36"), dots("34")}));
  assert(translate(u8"우애").cells == std::vector<uint8_t>({dots("134"), dots("36"), dots("1235")}));
  assert(translate(u8"꿇").cells == std::vector<uint8_t>({dots("6"), dots("4"), dots("12346"), dots("356")}));
  assert(translate(u8"있").cells == std::vector<uint8_t>({dots("135"), dots("34")}));
  assert(translate("123").cells == std::vector<uint8_t>({dots("3456"), dots("1"), dots("12"), dots("14")}));
  assert(translate("Aa").cells == std::vector<uint8_t>({dots("356"), dots("6"), dots("1"), dots("1"), dots("256")}));
  assert(translate(u8"😀").unsupported == 1);
  std::vector<Audit> issues;
  const auto incomplete = translate(u8"가😀나", collectIssues, &issues);
  assert(incomplete.unsupported == 1 && issues.size() == 1);
  assert(issues[0].byteOffset == 3 && issues[0].characterOffset == 1 && issues[0].codepoint == 0x1f600);
  issues.clear();
  translate(u8"가😀", collectIssues, &issues);
  assert(issues.size() == 1 && issues[0].byteOffset == 6 && issues[0].characterOffset == 2);
  assert(translate(u8"ㄱ").unsupported == 0);
  assert(translate(u8"⠁⠂⠄").cells == std::vector<uint8_t>({1, 2, 4}));
  assert(translate(std::string("\xf0\x80\x80\x80", 4)).unsupported == 1);
  for (const auto bad : {std::string("\xc0\xaf", 2), std::string("\xed\xa0\x80", 3),
                        std::string("\xf4\x90\x80\x80", 4), std::string("\xe3\x80", 2)})
    assert(translate(bad).unsupported == 1);
  assert(translate(std::string("\xe3", 1) + "7").cells == translate("7").cells);
  assert(translate(std::string(4097, '7')).unsupported == 1);
  const auto longNumber = translate(std::string(4096, '7'));
  assert(longNumber.unsupported == 0 && longNumber.cells.size() == 4097);
  const auto maximum = translate(std::string(4096, '*'));
  assert(maximum.cells.size() <= MAX_TRANSLATION_CELLS);
  std::string expanding;
  for (unsigned i = 0; i < 1756; ++i) expanding += "? ";
  const auto exactLimit = translate(expanding + "7777777");
  assert(exactLimit.unsupported == 0 && exactLimit.cells.size() == MAX_TRANSLATION_CELLS);
  issues.clear();
  const auto overflowLimit = translate(expanding + "77777777", collectIssues, &issues);
  assert(overflowLimit.unsupported == 1 && issues.size() == 1);
  assert(std::string(issues[0].rule) == "LIMIT.output-cells");
  assert(overflowLimit.cells.size() == MAX_TRANSLATION_CELLS);
  expanding.clear();
  for (unsigned i = 0; i < 2048; ++i) expanding += "? ";
  assert(expanding.size() == MAX_TEXT_BYTES && translate(expanding).unsupported == 1);
  assert(translate(u8"한글").cells == translate(u8"한글").cells);
  // All modern syllables must stay within 6-dot cells with bounded expansion.
  for (uint32_t cp = 0xac00; cp <= 0xd7a3; ++cp) {
    std::string s;
    s += char(0xe0 | (cp >> 12)); s += char(0x80 | ((cp >> 6) & 63)); s += char(0x80 | (cp & 63));
    const auto translated = translate(s);
    assert(!translated.cells.empty() && translated.cells.size() <= 6 && translated.unsupported == 0);
    for (const auto cell : translated.cells) assert(cell < 64);
    const uint32_t n = cp - 0xac00;
    const uint32_t jamo[] = {0x1100 + n/588, 0x1161 + n%588/28, 0x11a7 + n%28};
    std::string decomposed;
    for (size_t index = 0; index < (n%28 ? 3u : 2u); ++index) {
      const auto j = jamo[index];
      decomposed += char(0xe0 | (j >> 12));
      decomposed += char(0x80 | ((j >> 6) & 63));
      decomposed += char(0x80 | (j & 63));
    }
    assert(translate(decomposed).cells == translated.cells);
  }
}

static void mappingTests() {
  using namespace earlink::mapping;
  assert(validate(LOGICAL_TO_CHANNEL).valid());
  auto bad = LOGICAL_TO_CHANNEL;
  bad[0] = 0;
  assert(validate(bad).outOfRange && validate(bad).missingChannels && validate(bad).invalidPositions);
  assert(shiftBytes({{63,63,63}}, bad) == (std::array<uint8_t,3>{{0,0,0}}));
  bad = LOGICAL_TO_CHANNEL; bad[0] = 19; assert(validate(bad).outOfRange);
  bad = LOGICAL_TO_CHANNEL; bad[0] = bad[1];
  assert(validate(bad).duplicate && validate(bad).missingChannels);
  const std::array<uint8_t,18> crossCell = {{1,7,13,2,8,14,3,9,15,4,10,16,5,11,17,6,12,18}};
  assert(validate(crossCell).valid());
  for (size_t dot = 0; dot < 18; ++dot) {
    std::array<uint8_t,3> cells = {{0,0,0}}; cells[dot/6] = uint8_t(1u << (dot%6));
    const auto output = shiftBytes(cells, crossCell);
    const auto channel = crossCell[dot] - 1;
    for (size_t byte = 0; byte < 3; ++byte)
      assert(output[byte] == (byte == size_t(2-channel/6) ? (1 << (channel%6)) : 0));
  }
  // Independent geometry: the user's layout as horizontal rows, viewed from
  // the reading side. Do not derive this oracle from LOGICAL_TO_CHANNEL.
  const uint8_t physicalRows[3][6] = {
    {1, 2, 12, 11, 18, 17},
    {3, 4, 10,  9, 16, 15},
    {5, 6,  8,  7, 14, 13}
  };
  // Each requested lowering bit must signal its specified solenoid, HIGH=DOWN.
  for (size_t row = 0; row < 3; ++row) for (size_t column = 0; column < 6; ++column) {
    std::array<uint8_t,3> cells = {{0,0,0}};
    cells[column/2] = uint8_t(1u << (row + 3*(column%2)));
    std::array<uint8_t,3> expected = {{0,0,0}};
    const auto channel = physicalRows[row][column] - 1;
    expected[2-channel/6] |= uint8_t(1u << (channel%6));
    assert(shiftBytes(cells) == expected);
  }
  assert(shiftBytes({{0,0,0}}) == (std::array<uint8_t,3>{{0,0,0}}));
  assert(shiftBytes({{63,63,63}}) == (std::array<uint8_t,3>{{63,63,63}}));
  assert(shiftBytes({{1,2,4}}) == (std::array<uint8_t,3>{{2,8,1}}));
  // Exhaustive comparison against the physical geometry for all 18-bit pages.
  for (unsigned a = 0; a < 64; ++a) for (unsigned b = 0; b < 64; ++b) for (unsigned c = 0; c < 64; ++c) {
    const std::array<uint8_t,3> cells = {{uint8_t(a),uint8_t(b),uint8_t(c)}};
    std::array<uint8_t,3> expected = {{0,0,0}};
    for (size_t row = 0; row < 3; ++row) for (size_t column = 0; column < 6; ++column) {
      if (!(cells[column/2] & (1u << (row + 3*(column%2))))) continue;
      const auto channel = physicalRows[row][column] - 1;
      expected[2-channel/6] |= uint8_t(1u << (channel%6));
    }
    assert(shiftBytes(cells) == expected);
  }
}

static void connectionWaveTests() {
  const std::array<uint8_t,3> released = {{0,0,0}};
  // Expected serial bytes from the user's six physical columns and working
  // data[2] -> data[0] test. Only one group of three channels may be HIGH.
  const std::array<uint8_t,3> expected[] = {
    {{0,0,0x15}}, {{0,0,0x2a}}, {{0,0x2a,0}},
    {{0,0x15,0}}, {{0x2a,0,0}}, {{0x15,0,0}}
  };
  ConnectionWave wave;
  assert(!wave.active() && wave.output() == released && !wave.tick(100000));
  wave.start(100);
  uint32_t now = 100;
  for (size_t column = 0; column < 6; ++column) {
    assert(wave.active() && mapping::shiftBytes(wave.output()) == expected[column]);
    assert(!wave.tick(now + 199));
    assert(mapping::shiftBytes(wave.output()) == expected[column]);
    assert(wave.tick(now + 200));
    assert(wave.output() == released);
    if (column < 5) {
      assert(wave.active() && !wave.tick(now + 249));
      assert(wave.tick(now + 250));
      now += 250;
    }
  }
  assert(!wave.active() && !wave.tick(100000));
  wave.start(0xffffff80u);
  assert(!wave.tick(uint32_t(0xffffff80u + 199u)));
  assert(wave.tick(uint32_t(0xffffff80u + 200u)) && wave.output() == released);
  wave.cancel(); assert(!wave.active() && wave.output() == released);
  wave.start(42); assert(mapping::shiftBytes(wave.output()) == expected[0]);

  DisplayController display;
  display.startConnectionWave(0);
  assert(display.pager.enqueue(message(1, {1,2,3,4}), 10));
  assert(!display.pageVisible());
  assert(mapping::shiftBytes(display.output()) == expected[0]);
  for (uint32_t at = 200; at <= 1450; at += 250) {
    assert(display.tick(at));
    if (at < 1450) { assert(display.output() == released); assert(display.tick(at + 50)); }
  }
  assert(!display.wave.active() && display.pageVisible());
  assert(display.pager.page == 0 && display.output() == (std::array<uint8_t,3>{{62,61,60}}));
  assert(!display.tick(3449)); // Full 2000ms starts AFTER the wave, not at enqueue.
  assert(display.tick(3450) && display.output() == released);
  assert(display.tick(3700) && display.output() == (std::array<uint8_t,3>{{59,63,63}}));
  display.startConnectionWave(5000);
  assert(!display.pager.active());
  display.clear(); // Both disconnect and explicit clear must cancel the wave.
  assert(!display.wave.active() && !display.pageVisible() && display.output() == released);
  assert(!display.tick(100000));
  display.startConnectionWave(100001);
  assert(mapping::shiftBytes(display.output()) == expected[0]);
  display.clear();
  // A delayed/idle loop never starts a wave or energizes the default output.
  assert(!display.tick(200000) && mapping::shiftBytes(display.output()) == released);
}

static void raisedBrailleOutputTests() {
  const std::array<uint8_t,3> released = {{0,0,0}};
  DisplayController display;
  assert(mapping::shiftBytes(display.output()) == released);
  assert(display.pager.enqueue(message(1, {1,1,1}), 0));
  // Dot 1 must stay UP in each cell. All other dots go DOWN.
  assert(mapping::shiftBytes(display.output()) == (std::array<uint8_t,3>{{0x1f,0x1f,0x3e}}));
  // Independent horizontal geometry; do not use LOGICAL_TO_CHANNEL or the
  // controller's inversion formula to calculate the expected electrical state.
  const uint8_t rows[3][6] = {
    {1,2,12,11,18,17}, {3,4,10,9,16,15}, {5,6,8,7,14,13}
  };
  for (unsigned a = 0; a < 64; ++a) for (unsigned b = 0; b < 64; ++b) for (unsigned c = 0; c < 64; ++c) {
    auto& cells = display.pager.current.translation.cells;
    cells[0] = uint8_t(a); cells[1] = uint8_t(b); cells[2] = uint8_t(c);
    std::array<uint8_t,3> expected = released;
    for (size_t row = 0; row < 3; ++row) for (size_t column = 0; column < 6; ++column) {
      const bool mustStayRaised = (cells[column/2] & (1u << (row + 3*(column%2)))) != 0;
      if (!mustStayRaised) {
        const auto channel = rows[row][column] - 1;
        expected[2-channel/6] |= uint8_t(1u << (channel%6));
      }
    }
    assert(mapping::shiftBytes(display.output()) == expected);
  }
  display.clear(); assert(display.output() == released);
  assert(display.pager.enqueue(message(2, {0}), 0));
  // A displayed blank/padding must be DOWN, while IDLE remains entirely UP.
  assert(display.pageVisible() && display.output() == (std::array<uint8_t,3>{{63,63,63}}));
  assert(display.tick(2000) && display.output() == released);
  assert(display.tick(2250) && !display.pageVisible() && display.output() == released);
  display.pager.setAutomatic(false, 0);
  assert(display.pager.enqueue(message(3, {1}), 0));
  assert(display.output() == (std::array<uint8_t,3>{{62,63,63}}));
  assert(display.tick(10000) && display.output() == released);
  display.pager.previous(10001);
  assert(display.tick(10251) && display.output() == (std::array<uint8_t,3>{{62,63,63}}));
  display.clear(); assert(display.output() == released);
  const auto translated = translate(u8"가나다");
  assert(translated.unsupported == 0);
  Message word; word.id = 4; word.translation = translated;
  assert(display.pager.enqueue(std::move(word), 0));
  assert(mapping::shiftBytes(display.output()) == (std::array<uint8_t,3>{{0x27,0x0f,0x18}}));
}

static void pagerTests() {
  Pager p;
  assert(p.enqueue(message(1, {1, 2, 3, 4}), 0));
  assert(p.pages() == 2 && p.output() == (std::array<uint8_t, 3>{1, 2, 3}));
  assert(!p.tick(1999)); assert(p.tick(2000));
  assert(p.output() == (std::array<uint8_t, 3>{0, 0, 0}));
  assert(!p.tick(2249)); assert(p.tick(2250));
  assert(p.output() == (std::array<uint8_t, 3>{4, 0, 0}));
  assert(p.enqueue(message(2, {5}), 2251));
  assert(p.enqueue(message(3, {6}), 2251));
  assert(p.enqueue(message(4, {7}), 2251));
  assert(!p.enqueue(message(5, {8}), 2251));
  assert(p.tick(4250)); assert(!p.active());
  assert(p.tick(4500)); assert(p.current.id == 2);
  p.clear(); assert(!p.active() && p.queued() == 0 && !p.visible);
  assert(!p.enqueue(message(8, {}), 0));
  Message rejected = message(8, {1}); rejected.translation.unsupported = 1;
  assert(!p.enqueue(std::move(rejected), 0));
  Message enormous; enormous.translation.cells.resize(MAX_TRANSLATION_CELLS + 1);
  assert(!p.enqueue(std::move(enormous), 0));
  p.setAutomatic(false, 0);
  assert(p.enqueue(message(9, {1, 2, 3, 4, 5, 6, 7}), 0));
  assert(!p.tick(3000)); assert(p.tick(10000)); assert(!p.visible);
  p.previous(10001); assert(p.tick(10251)); assert(p.visible && p.page == 0);
  p.next(10252); assert(p.tick(10502)); assert(p.page == 1);
  p.previous(10503); assert(p.tick(10753)); assert(p.page == 0);
  p.clear();
  p.setAutomatic(true, 0xfffffff0);
  assert(p.enqueue(message(10, {1}), 0xfffffff0));
  assert(p.tick(uint32_t(0xfffffff0u + 2000u))); // millis wraparound
}

static void receiverTests(const char* packetsPath, const char* textPath) {
  Receiver r;
  std::ifstream packets(packetsPath, std::ios::binary);
  std::ifstream textFile(textPath, std::ios::binary);
  assert(packets.good() && textFile.good());
  const std::string expected((std::istreambuf_iterator<char>(textFile)), std::istreambuf_iterator<char>());
  Result last = NONE;
  uint32_t now = 0;
  for (int length; (length = packets.get()) != EOF;) {
    uint8_t bytes[20]{};
    assert(length > 0 && length <= 20);
    packets.read(reinterpret_cast<char*>(bytes), length);
    assert(packets.gcount() == length);
    last = r.accept(bytes, size_t(length), now++);
    assert(last == NONE || last == ACCEPTED);
  }
  assert(last == ACCEPTED && r.id == 513 && r.text == expected);
  const uint8_t begin[] = {0x45, 0x4c, 1, 1, 1, 0, 3, 0};
  const uint8_t incomplete[] = {0x45, 0x4c, 1, 3, 1, 0};
  assert(r.accept(begin, sizeof(begin), 0) == NONE);
  assert(r.accept(incomplete, sizeof(incomplete), 1) == OUT_OF_ORDER);
  assert(r.accept(begin, sizeof(begin), 2) == NONE);
  const uint8_t outOfOrder[] = {0x45, 0x4c, 1, 2, 1, 0, 1, 0, 'a'};
  assert(r.accept(outOfOrder, sizeof(outOfOrder), 3) == OUT_OF_ORDER);
  const uint8_t tooLong[] = {0x45, 0x4c, 1, 1, 1, 0, 1, 16};
  assert(r.accept(tooLong, sizeof(tooLong), 4) == TOO_LONG);
  assert(!r.receiving);
  assert(r.accept(nullptr, 20, 5) == BAD_PACKET);
  uint8_t oversized[21]{}; assert(r.accept(oversized, sizeof(oversized), 6) == BAD_PACKET);
}

int main(int argc, char** argv) {
  assert(argc == 3);
  translationTests(); mappingTests(); raisedBrailleOutputTests(); connectionWaveTests(); pagerTests(); receiverTests(argv[1], argv[2]);
  std::cout << "PASS: 11172 syllable bounds; 262144 lowering-mask and 262144 raised-braille electrical comparisons; blank/padding/manual expiry/idle polarity; six-column wave/timing/cancel/reconnect/page handover; browser packets. Device execution UNVERIFIED.\n";
}
```

## firmware/tests/cases_2024.py

```python
"""Independent fixed oracles, transcribed from the NIKL 2024 PDF.

Braille ASCII here is the PDF's *font encoding*, not firmware output.
The explicit dot chart below was checked against rendered PDF pp.3-12,20,27-31.
No expected value is obtained by calling translate(), decomposing text, or using
the firmware's rule tables. Rule-derived cases are individually composed here.
"""
ASCII_DOTS = {
    'A':'1','B':'12','C':'14','D':'145','E':'15','F':'124','G':'1245',
    'H':'125','I':'24','J':'245','K':'13','L':'123','M':'134','N':'1345',
    'O':'135','P':'1234','Q':'12345','R':'1235','S':'234','T':'2345',
    'U':'136','V':'1236','W':'2456','X':'1346','Y':'13456','Z':'1356',
    '@':'4','[':'246',']':'12456','^':'45','_':'456','!':'2346',
    '"':'5','#':'3456','$':'1246','%':'146','&':'12346',"'":'3',
    '(':'12356',')':'23456','*':'16','+':'346',',':'6','-':'36',
    '.':'46','/':'34','0':'356','1':'2','2':'23','3':'25','4':'256',
    '5':'26','6':'235','7':'2356','8':'236','9':'35',':':'156',
    ';':'56','<':'126','=':'123456','>':'345','?':'1456',
    '{':'246','|':'1256','}':'12456','~':'45','`':'0',' ':'0',
}
CASES = []
def add(text, source_ascii, clauses, evidence='official-example', verified=True, issues=0):
    CASES.append(dict(text=text, expected_dots=None if source_ascii is None else
        [ASCII_DOTS.get(c.upper(), ASCII_DOTS.get(c)) for c in source_ascii],
        source_ascii=source_ascii, clauses=clauses, evidence=evidence,
        verified=verified, issues=issues))

# Complete clause-13 table, printed p.9.
for text, sign in zip('가나다마바사자카타파하', '$cie^l.fhdj'):
    add(text, sign, 'K13 p.9', 'official-table')
add('가나다', '$ci', 'K13 p.9', 'manual-rule-composition')
add('강산', '$7l3', 'K13 p.9')
add('안녕하세요', '<3c}j,n+', 'K1,3,7,13,15 pp.3-11', 'manual-rule-composition')
add('대한민국', 'irj3eq@ma', 'K1,3,7,13,15 pp.3-11', 'manual-rule-composition')
add('학교', 'ja@+', 'K1,3,6,13 pp.3-9', 'manual-rule-composition')
add('한글', 'j3@!', 'K13,15 pp.9-11', 'manual-rule-composition')
add('것', '_s', 'K15 p.10', 'official-table')
# All 7 abbreviation entries, plus actual exceptions (pp.12-13).
for text, sign in [('그래서','as'),('그러나','ac'),('그러면','a3'),('그러므로','a5'),
                   ('그런데','an'),('그리고','au'),('그리하여','a:')]:
    add(text, sign, 'K18 p.12', 'official-table')
for text, sign in [('그래서인지','asq.o'),('그러나저러나','ac.s"sc'),('그러면서','a3,s'),
                   ('그런데도','aniu'),('그리하여도','a:iu'),('왜 그러나요?','vr`ac+8'),
                   ('오그리고','u@{"o@u'),('우그리고','m@{"o@u'),
                   ('쭈그리고',',.m@{"o@u'),('찡그리고',',.o7@{"o@u')]:
    add(text, sign, 'K18 suffix/preceding-letter exception p.13')
add('그림을 그리고 있다.', '@{"o5!`au`o/i4', 'K18 p.12')
add('그림을 그리고서 밥을 먹었다.', '@{"o5!`au,s`^b!`e?s/i4', 'K18 p.13')
add('비가 왔다. 그래서 소풍 계획은 취소되었다.',
    '~o$`v/i4`as`,udm7`@/jyaz`;mr,uiys/i4', 'K18 p.12')
add('아내는 조용히 그러나 단호하게 말했다.',
    '<crcz`.u+7jo`ac`i3juj@n`e1jr/i4', 'K18 p.12')
add('만약 결과가 그러면 어떻게 할 거니?',
    'e3>a`@|@v$`a3`s,is0@n`j1`@sco8', 'K18 p.12')
add('그러므로 오늘 저녁에 와야 한다.', 'a5`uc!`.sc:an`v>`j3i4', 'K18 p.12')
add('내 잘못이 크다. 그런데 누구를 원망하겠나.',
    'cr`.1eu\'o`f{i4`an`cm@m"!`p3e7j@n/c4', 'K18 p.12')
add('그리하여 그들은 친구 사이가 되었다.', 'a:`@{i!z`;q@m`lo$`iys/i4', 'K18 p.13')
# Explicit K14 exceptions, including 팠 (not the superficially similar 파+ㅆ).
for text, sign in [('나이','c<o'),('다음','i<[5'),('마우스','e<m,{'),('바위','^<mr'),
                   ('자아','.<<'),('카이로','f<o"u'),('넥타이','cnah<o'),
                   ('파이프','d<od{'),('하얀','j<>3'),('땅을 팠다.',',i7!`d</i4')]:
    add(text, sign, 'K14 pp.9-10')
for text, sign in [('가이','$o'),('사이','lo'),('밥이','^bo'),('까이',',$o'),
                   ('따이',',i<o'),('껐',',@s/'),('겄','@s/'),('갔','$/')]:
    add(text, sign, 'K4,13-16 pp.4,9-11', 'manual-rule-composition')
# VC contractions and remaining cluster finals, transcribed p.11.
for text, sign in [('억','?'),('언',')'),('얼','t'),('연','*'),('열','|'),('영','}'),
                   ('옥','x'),('온','('),('옹','='),('운','g'),('울','&'),('은','z'),('을','!'),('인','q')]:
    add(text,sign,'K15 p.10','official-table')
for text, sign in [('덕망','i?e7'),('기적','@o.?'),('꺾다',',@?ai'),('넋',"c?'"),
                   ('건전지','@).).o'),('얹다',')ki'),('벌레','~t"n'),('얽다','tai'),
                   ('젊다','.t5i'),('넓다','ctbi'),('변화','~*jv'),('수련',',m"*'),
                   ('별자리','~|."o'),('엷다','|bi'),('평화','d}jv'),('안녕','<3c}'),
                   ('복덕방','~xi?~7'),('볶다','~xai'),('논두렁','c(im"s7'),
                   ('동그라미','i=@{"<eo'),('순두부',',gim~m'),('불고기','~&@u@o'),
                   ('붉다','^&ai'),('굶다','@&5i'),('훑다','j&8i'),('근로','@z"u'),
                   ('끊다',',@z0i'),('글씨','@!,,o'),('긁다','@!ai'),('읊다','!4i'),
                   ('끓다',',@!0i'),('진실','.q,o1')]:
    add(text, sign, 'K15 p.11')
for text, sign in [('까치',',$;o'),('힘껏','jo5,_s'),('마음껏','e<{5,_s'),
                   ('불을 껐다.','~&!`,@s/i4'),('성가',',}$'),('말썽','e1,,]'),
                   ('정성','.},}'),('어정쩡','s.},.}'),('청년',';}c*'),('얄라셩','>1"<,:7')]:
    add(text, sign, 'K16-17 pp.11-12')
for text, sign in [('아예','<-/'),('도예','iu-/'),('뭐예요','ep-/+'),('서예',',s-/'),
                   ('야애','>-r'),('소화액',',ujv-ra'),('수액',',m-ra'),('파워앰프','d<p-r5d{')]:
    add(text, sign, 'K11-12 p.8')
for text, sign in [('ㄱ','=a'),('ㄱㄴㄷ','=a=3=9'),('ㅏ','=<'),('ㅖ','=/'),
                   ('ㄱ자','=a.'),('아이ㅅ','<o_\''),('ㄳ',"=a'"),('ㅆ','=/'),
                   ('꿇',',@&0'),('있','o/')]:
    add(text, sign, 'K3-10 pp.4-7', 'manual-rule-composition')
for text, sign in [('ㅑ','>'),('ㅓ','s'),('ㅕ',':'),('ㅗ','u'),('ㅛ','+'),('ㅜ','m'),
                   ('ㅠ','%'),('ㅡ','{'),('ㅣ','o'),('ㅐ','r'),('ㅒ','>r'),('ㅔ','n'),
                   ('ㅘ','v'),('ㅙ','vr'),('ㅚ','y'),('ㅝ','p'),('ㅞ','pr'),('ㅟ','mr'),('ㅢ','w')]:
    add(text,'='+sign,'K6-8 pp.5-6','manual-rule-composition')
# Numbers: unchanged numeric state only through decimal/comma, K43.
add('12345','#abcde','K40 p.27','manual-rule-composition')
for text, sign in [('0.48','#j4dh'),('1,000','#a1jjj'),('9,375명','#i1cge`e}'),
                   ('5,700,000원','#e1gjj1jjjp3'),('02)799-1000','#jb,0#gii-#ajjj'),
                   ('3·1 운동','#c"2#a`gi='),('5:3','#e"1#c'),
                   ('10/1~10/9','#aj_/#a@9#aj_/#i'),
                   ('1가','#a$'),('2권','#b@p3'),('3반','#c^3'),('4선','#d,)'),
                   ('5월','#ep1'),('6일','#fo1'),('7자루','#g."m'),('8꾸러미','#h,@m"seo'),
                   ('1년','#a`c*'),('2도','#b`iu'),('3명','#c`e]'),('4칸','#d`f3'),
                   ('5톤','#e`h('),('6평','#f`d]'),('7항','#g`j7'),('5운6기','#e`g#f@o')]:
    add(text, sign, 'K40-44 pp.27-28')
add('Hello','0,hello4','K28-29 pp.19-20','manual-rule-composition')
add('HELLO','0,,hello4','K28-29 pp.19-20','manual-rule-composition')
add('안녕하세요 123','<3c}j,n+`#abc','K13,15,40','manual-rule-composition')
add('Hello 안녕하세요','0,hello4`<3c}j,n+','K28-29,13,15','manual-rule-composition')
add('오늘 날씨가 좋습니다.','uc!`c1,,o$`.u0,{bcoi4','K1-7,13,15,49','manual-rule-composition')
add('안녕하세요!','<3c}j,n+6','K1-7,13,15,49','manual-rule-composition')
add('정말 감사합니다.','.}e1`$5ljbcoi4','K13,15,17,49','manual-rule-composition')
for text, sign in [('New York','0,new`,york4'),('NEW YORK','0,,new`,,york4'),
                   ('McDonald','0,mc,donald4'),('IoT','0,io,t4'),('iOS','0i,,os4'),
                   ('MP3','0,,mp#c'),('A4용지','0,a#d+7.o'),('LP 1장','0,,lp`#a.7'),
                   ('KBS 1 TV','0,,kbs`#a`,,tv4'),('WHO: 세계보건기구','0,,who"1`,n@/~u@)@o@m')]:
    add(text, sign, 'K28-35 pp.19-24','manual-rule-composition')
add('Hello123a','0,hello#abc;a4','K28-29,32,35,40','manual-rule-composition')
add('A4B','0,a#d,b4','K28-29,32,35,40','manual-rule-composition')
add('D-100','0,d-#ajj','K35 p.23','manual-rule-composition')
add('CD 1장','0;,,cd`#a.7','K35 p.24','manual-rule-composition')
add('a, b, c','0a1`;b1`;c4','K32 p.21','manual-rule-composition')
add('Hello-HELLO','0,hello-,,hello4','K29,32','manual-rule-composition')
add('WELCOME TO KOREA',"0,,,welcome`to`korea,'4",'K28-29 pp.19-20','manual-rule-composition')
add('123a','#abc0a4','K28-29,40','manual-rule-composition')
add('“Hello”','80,hello0','K34,49','manual-rule-composition')
add('Hello!','0,hello6','K33,49','manual-rule-composition')
add('Hello, 안녕','0,hello"`<3c}','K33 p.22','manual-rule-composition')
add('Hello, Hello','0,hello1`,hello4','K29,32','manual-rule-composition')
add('가\n나','$`c','display newline policy (not paper layout)','application-policy',False)
add('가\r\n나','$`c','display CRLF policy (not paper layout)','application-policy',False)
for text, sign in [('가, 나.','$"`c4'),('“가”','8$0'),('‘나’',",8c0'"),
                   ('(가)',"8'$,0"),('[나]','82c;0'),('{다}','81i"0'),
                   ('『가』',';8$02'),('「나」','"8c01'),('《다》',';7i72'),('〈마〉','"7e71'),
                   ('가―나','$--c'),('가-나','$-c'),('가…나','$,,,c'),('가……나','$,,,c'),
                   ('가...나','$444c'),('가......나','$444c'),('5%에','#e0p`n'),
                   ('밤ː나무',"^5,'cem")]:
    add(text, sign, 'K49,53-55,63,69 pp.31-45','manual-rule-composition')
# Normalization/compatibility errors are explicitly not certified literary tests.
add('한글','j3@!','Unicode modern NFD composition','application-policy',False)
add('간','$3','Unicode partial decomposition LV+T','application-policy',False)
add('⠁⠂⠄',None,'raw cell compatibility, not K67 printed-dot notation','application-policy',False)
for text, reason in [('😀','unsupported Unicode'),('ㄸ','standalone final form not verified'),
                     ('ㆆ','old Hangul not implemented'),('α','Greek not implemented'),
                     ('school','UEB contractions not implemented'),('Table of Contents','UEB contractions not implemented'),
                     ('청군:백군','colon semantics need human interpretation')]:
    add(text,None,reason,'unsupported/unverified',False,1 if text != 'Table of Contents' else 3)
add('who',None,'UEB strong wordsign context not implemented','unsupported/unverified',False,1)
add('?는',"_8`,\'e&[5d+,\'cz",'K49 attachment p.34','official-example')
add('?는 대개 앞말에 붙여 쓴다.',
    "_8`,\'e&[5d+,\'cz`ir@r`<4e1n`^m8:`,,zi4",'K49 attachment p.34','official-example')

# Further actual K8-K10 examples: independent jamo must not be confused with
# the attached consonants used inside phonetic spellings.
add('낫 놓고 ㄱ자도 모른다.', "c'`cu0@u`=a.iu`eu\"zi4", 'K8 attachment p.6')
add('ㅂ은 여섯 번째 자음이다.', "=bz`:,s'`~),.r`.<[5oi4", 'K8 attachment p.7')
add('삼각형 ㄱㄴㄷ','l5$aj}`=a=3=9','K8 p.6')
for text, sign in [('ㄱ. 유아기','=a4`%<@o'),('ㄴ. 아동기','=34`<i=@o'),
                   ('ㄷ. 청년기','=94`;]c*@o'),('ㄹ. 장년기','=14`.7c*@o'),('ㅁ. 노년기','=54`cuc*@o')]:
    add(text,sign,'K9 p.7')
for text, sign in [('[ㄹㄹ로마]','82_1_1"ue;0'),('[까ㄹㄹ로]','82,$_1_1"u;0'),
                   ('[봉주ㄹ흐]','82~=.m_1j{;0'),('[ㅅ떠디이]',"82_',isioo;0"),('[아이ㅅ]',"82<o_';0")]:
    add(text,sign,'K10 p.7','official-example-fragment')

# Additional independent oracles from exact, reviewed same-row PDF font pairs.
# The source coordinates and pinned PDF hash remain in the fixed corpus.
import json as _json
from pathlib import Path as _Path
_font_corpus = _json.loads(_Path(__file__).with_name('official_words_2024.json').read_text(encoding='utf-8'))
_page_clauses = {3:'K1',4:'K2-4',5:'K5-7',6:'K7-8',8:'K11-12',9:'K13-14',
                 10:'K14-15',11:'K15-16',12:'K16-18',13:'K18'}
for _word in _font_corpus['words']:
    _existing = [case for case in CASES if case['text'] == _word['text']]
    if _existing:
        if any(case['expected_dots'] != _word['expected_dots'] for case in _existing):
            raise ValueError('Conflicting independently authored oracles: ' + _word['text'])
        continue
    add(_word['text'],_word['source_ascii'],_page_clauses[_word['printed_page']] + ' p.' + str(_word['printed_page']),
        'official-coordinate-example')
    CASES[-1]['source_bbox'] = _word['source_bbox']
    CASES[-1]['braille_bbox'] = _word['braille_bbox']
```

## firmware/tests/braille_cli.cpp

```cpp
#include <fstream>
#include <iostream>
#include <string>
#include <vector>
#include "../earlink/BrailleText.h"

static void audit(const earlink::Audit& event, void* context) {
  auto& events = *static_cast<std::vector<earlink::Audit>*>(context);
  events.push_back(event);
}
int main(int argc, char** argv) {
  if (argc != 2) return 2;
  std::ifstream input(argv[1]);
  if (!input) return 2;
  std::string hex;
  while (std::getline(input, hex)) {
    std::string text;
    for (size_t i = 0; i + 1 < hex.size(); i += 2)
      text.push_back(char(std::stoi(hex.substr(i, 2), nullptr, 16)));
    std::vector<earlink::Audit> trace;
    const auto result = earlink::translate(text, audit, &trace);
    std::cout << result.unsupported << '\t';
    for (const auto cell : result.cells) std::cout << unsigned(cell) << ',';
    std::cout << '\t';
    for (const auto& e : trace)
      std::cout << e.byteOffset << ',' << e.characterOffset << ',' << e.codepoint << ','
                << e.cellBegin << ',' << e.cellEnd << ',' << e.rule << ',' << e.issue << '|';
    std::cout << '\n';
  }
}
```

## firmware/tests/run_tests.py

```python
"""Run from any directory: python firmware/tests/run_tests.py.
Requires Python 3, Node 22.18+, and MSVC C++ tools or g++/clang++.
No third-party Python packages are needed for tests.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from collections import Counter
from cases_2024 import CASES
from syllable_oracle_2024 import write_oracle

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / '.firmware-build'
REPORT = ROOT / 'firmware' / 'validation'
BUILD.mkdir(exist_ok=True)
REPORT.mkdir(exist_ok=True)

def run(args, **kwargs):
    return subprocess.run(args, cwd=ROOT, check=True, **kwargs)

def compile_tests():
    compiler = shutil.which('g++') or shutil.which('clang++')
    extension = '.exe' if os.name == 'nt' else ''
    programs = ['core_test', 'braille_cli', 'context_test']
    if compiler:
        for program in programs:
            run([compiler, '-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror',
                 str(ROOT / 'firmware/tests' / (program + '.cpp')),
                 '-o', str(BUILD / (program + extension))])
    elif os.name == 'nt':
        vswhere = Path(os.environ.get('ProgramFiles(x86)', 'C:/Program Files (x86)')) / 'Microsoft Visual Studio/Installer/vswhere.exe'
        if vswhere.exists():
            location = run([str(vswhere), '-latest', '-products', '*', '-requires',
                'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'],
                capture_output=True, text=True).stdout.strip()
            devcmd = Path(location) / 'Common7/Tools/VsDevCmd.bat'
        else:
            devcmd = Path('C:/Program Files/Microsoft Visual Studio/18/Community/Common7/Tools/VsDevCmd.bat')
        if not devcmd.exists():
            raise RuntimeError('Install MSVC C++ Build Tools or g++/clang++. No tests have run.')
        lines = ['@echo off', f'call "{devcmd}" -arch=x64 >nul', 'if errorlevel 1 exit /b 1']
        for program in programs:
            lines += [f'cl /nologo /EHsc /std:c++17 /utf-8 /W4 /WX /O2 '
                      f'/Fe:.firmware-build\\{program}.exe /Fo:.firmware-build\\{program}.obj '
                      f'firmware\\tests\\{program}.cpp', 'if errorlevel 1 exit /b 1']
        script = BUILD / 'compile-tests.cmd'
        script.write_text('\n'.join(lines) + '\n', encoding='utf-8')
        run(['cmd.exe', '/d', '/c', str(script)])
    else:
        raise RuntimeError('g++/clang++ required. No tests have run.')
    return [BUILD / (p + extension) for p in programs]

def mask(pattern):
    if pattern == '0':
        return 0
    if not pattern or any(c not in '123456' for c in pattern):
        raise ValueError(f'Invalid independently authored oracle: {pattern!r}')
    return sum(1 << (int(c) - 1) for c in pattern)

def braille(cells):
    return ''.join(chr(0x2800 + cell) for cell in cells)

def table_text(value):
    return str(value).replace('|', '\\|').replace('\r', '\\r').replace('\n', '\\n')

def main():
    node = shutil.which('node')
    if not node:
        raise RuntimeError('Node required for the real browser-packet fixtures.')
    run([node, '--experimental-strip-types', '--test', 'tests/earlink-protocol.test.mjs'])
    oracle = BUILD / 'hangul-oracle.bin'
    write_oracle(oracle)
    core, cli, context = compile_tests()
    run([str(core), str(BUILD / 'protocol-fixture.bin'), str(BUILD / 'protocol-text.txt')])
    run([str(context), str(oracle), str(REPORT / 'context-coverage.json')])
    inputs = BUILD / 'braille-inputs.hex'
    inputs.write_text(''.join(case['text'].encode('utf-8').hex() + '\n' for case in CASES), encoding='ascii')
    output = run([str(cli), str(inputs)], capture_output=True, text=True).stdout.splitlines()
    if len(output) != len(CASES):
        raise AssertionError('Native translator did not return every test case')
    results = []
    for case, line in zip(CASES, output):
        unsupported, encoded, encoded_trace = line.split('\t')
        cells = [int(c) for c in encoded.split(',') if c]
        expected = None if case['expected_dots'] is None else [mask(p) for p in case['expected_dots']]
        trace = []
        for record in encoded_trace.split('|'):
            if record:
                byte, character, cp, begin, end, rule, issue = record.split(',')
                trace.append(dict(byte_offset=int(byte), character_offset=int(character),
                    codepoint=f'U+{int(cp):04X}', cell_begin=int(begin), cell_end=int(end),
                    rule=rule, issue=bool(int(issue))))
        equal = expected is None or expected == cells
        regression = equal and int(unsupported) == case['issues'] and all(0 <= c < 64 for c in cells)
        status = ('PASS' if regression else 'FAIL') if case['verified'] else 'UNVERIFIED'
        per_cell = []
        for index, cell in enumerate(cells):
            per_cell.append(dict(index=index, braille=chr(0x2800 + cell),
                dots=''.join(str(dot) for dot in range(1, 7) if cell & (1 << (dot - 1))) or '0',
                mask=cell, binary=f'{cell:06b}',
                rules=list(dict.fromkeys(e['rule'] for e in trace if e['cell_begin'] <= index < e['cell_end']))))
        results.append(dict(**case, status=status, regression='PASS' if regression else 'FAIL',
            expected_braille=None if expected is None else braille(expected), actual_braille=braille(cells),
            cell_count=len(cells), unsupported=int(unsupported), cells=per_cell, trace=trace))
    counts = Counter(r['status'] for r in results)
    report = dict(standard='MCST 2024-0005 / NIKL 2024 revised Korean Braille',
        source='https://www.korean.go.kr/front/etcData/etcDataView.do?etc_seq=710&mn_id=207',
        scope='PC/software; PASS is only for the tested spelling and cited clauses. No general certification.',
        hardware='UNVERIFIED: no upload, physical BLE, T1-T18, tactile reading, power or coil temperature test.',
        summary=dict(counts), regression_failures=sum(r['regression'] == 'FAIL' for r in results), cases=results)
    (REPORT / 'braille-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    lines = ['# 점역 검증 결과', '', 'PC에서 실제 C++ 점역기를 실행한 결과입니다. 실제 하드웨어 검증은 **UNVERIFIED**입니다.', '',
        'PASS는 해당 입력과 명시한 조항의 대조 결과이며 규정 전체 구현·인증을 뜻하지 않습니다.',
        '공식 예시 전사와 수작업 규칙 조합을 `evidence`에서 구분합니다. 미대조 항목은 UNVERIFIED로 유지합니다.', '',
        f"결과: {dict(counts)} / 회귀 검사 실패: {report['regression_failures']}", '',
        '6비트 표시는 **bit5 → bit0**이며, 점 번호 1은 bit0입니다. 빈칸의 점 번호는 0입니다.', '',
        '| 입력 | 예상 점자 | 실제 점자 | 칸 | 점 번호(칸별) | 6비트(칸별) | 판정 | 근거 / 대조 방식 |',
        '|---|---|---|---:|---|---|---|---|']
    for r in results:
        values = [r['text'], r['expected_braille'] if r['expected_braille'] is not None else '미대조',
            r['actual_braille'], r['cell_count'], ' / '.join(c['dots'] for c in r['cells']),
            ' / '.join(c['binary'] for c in r['cells']), r['status'], r['clauses'] + ' / ' + r['evidence']]
        lines.append('| ' + ' | '.join(table_text(v) for v in values) + ' |')
    lines += ['', '## 적용 규칙과 원문 위치', '',
        'JSON 보고서의 각 입력에는 모든 칸의 점 번호·비트마스크·적용 규칙과 원문 바이트/문자 위치를 기록합니다.',
        '검증기에서 번역 결과로 정답을 생성하거나 정답을 자동 갱신하지 않습니다.', '']
    (REPORT / 'BRAILLE_RESULTS.md').write_text('\n'.join(lines), encoding='utf-8')
    print('Braille:', dict(counts), 'regression failures:', report['regression_failures'])
    for r in results:
        if r['regression'] == 'FAIL':
            print('FAIL', repr(r['text']), 'expected', r['source_ascii'], 'actual dots', [c['dots'] for c in r['cells']],
                  'unsupported', r['unsupported'], 'expected', r['issues'])
    return 1 if report['regression_failures'] else 0

if __name__ == '__main__':
    sys.exit(main())
```

## firmware/tests/official_words_2024.json

```json
{
  "pdf_sha256": "cb04780710a4b90f93b574d47afee7c01fa4a5593ad65414ec7857cdc1327612",
  "review": "Reviewed label/font pairing; excluded prose definitions; no translator output used",
  "method": "Same-row Korean label followed by HSBRL font run; retains source coordinates.",
  "limitation": "Word examples only; PDF-inserted ASCII spaces in glyph runs are removed, actual blank glyphs are retained.",
  "words": [
    {
      "text": "거리",
      "source_ascii": "@s\"o",
      "printed_page": 3,
      "source_bbox": [
        118.61571502685547,
        363.68255615234375,
        140.68374633789062,
        376.9050598144531
      ],
      "braille_bbox": [
        157.4746551513672,
        363.68255615234375,
        197.14968872070312,
        375.81329345703125
      ],
      "expected_dots": [
        "4",
        "234",
        "5",
        "135"
      ]
    },
    {
      "text": "너비",
      "source_ascii": "cs~o",
      "printed_page": 3,
      "source_bbox": [
        241.4291534423828,
        363.68255615234375,
        263.4971923828125,
        376.9050598144531
      ],
      "braille_bbox": [
        288.803466796875,
        363.68255615234375,
        328.478515625,
        375.81329345703125
      ],
      "expected_dots": [
        "14",
        "234",
        "45",
        "135"
      ]
    },
    {
      "text": "두더지",
      "source_ascii": "imis.o",
      "printed_page": 3,
      "source_bbox": [
        378.3949279785156,
        363.68255615234375,
        411.4969787597656,
        376.9050598144531
      ],
      "braille_bbox": [
        417.25384521484375,
        363.68255615234375,
        476.71844482421875,
        375.81329345703125
      ],
      "expected_dots": [
        "24",
        "134",
        "24",
        "234",
        "46",
        "135"
      ]
    },
    {
      "text": "리코더",
      "source_ascii": "\"ofuis",
      "printed_page": 3,
      "source_bbox": [
        118.61571502685547,
        388.85504150390625,
        151.7177734375,
        402.0775451660156
      ],
      "braille_bbox": [
        157.4746551513672,
        388.85504150390625,
        216.939208984375,
        400.98577880859375
      ],
      "expected_dots": [
        "5",
        "135",
        "124",
        "136",
        "24",
        "234"
      ]
    },
    {
      "text": "미소",
      "source_ascii": "eo,u",
      "printed_page": 3,
      "source_bbox": [
        241.4291534423828,
        388.85504150390625,
        263.4971923828125,
        402.0775451660156
      ],
      "braille_bbox": [
        288.803466796875,
        388.85504150390625,
        328.478515625,
        400.98577880859375
      ],
      "expected_dots": [
        "15",
        "135",
        "6",
        "136"
      ]
    },
    {
      "text": "보리",
      "source_ascii": "~u\"o",
      "printed_page": 3,
      "source_bbox": [
        378.3949279785156,
        388.85504150390625,
        400.4629821777344,
        402.0775451660156
      ],
      "braille_bbox": [
        417.25384521484375,
        388.85504150390625,
        456.92889404296875,
        400.98577880859375
      ],
      "expected_dots": [
        "45",
        "136",
        "5",
        "135"
      ]
    },
    {
      "text": "셔츠",
      "source_ascii": ",:;{",
      "printed_page": 3,
      "source_bbox": [
        118.61571502685547,
        413.90765380859375,
        140.68374633789062,
        427.1301574707031
      ],
      "braille_bbox": [
        157.4746551513672,
        413.90765380859375,
        197.14968872070312,
        426.03839111328125
      ],
      "expected_dots": [
        "6",
        "156",
        "56",
        "246"
      ]
    },
    {
      "text": "저고리",
      "source_ascii": ".s@u\"o",
      "printed_page": 3,
      "source_bbox": [
        241.4291534423828,
        413.90765380859375,
        274.5312194824219,
        427.1301574707031
      ],
      "braille_bbox": [
        288.803466796875,
        413.90765380859375,
        348.26806640625,
        426.03839111328125
      ],
      "expected_dots": [
        "46",
        "234",
        "4",
        "136",
        "5",
        "135"
      ]
    },
    {
      "text": "추수",
      "source_ascii": ";m,m",
      "printed_page": 3,
      "source_bbox": [
        378.3949279785156,
        413.90765380859375,
        400.4629821777344,
        427.1301574707031
      ],
      "braille_bbox": [
        417.25384521484375,
        413.90765380859375,
        456.92889404296875,
        426.03839111328125
      ],
      "expected_dots": [
        "56",
        "134",
        "6",
        "134"
      ]
    },
    {
      "text": "커피",
      "source_ascii": "fsdo",
      "printed_page": 3,
      "source_bbox": [
        118.61571502685547,
        439.08013916015625,
        140.68374633789062,
        452.3026428222656
      ],
      "braille_bbox": [
        157.4746551513672,
        439.08013916015625,
        197.14968872070312,
        451.21087646484375
      ],
      "expected_dots": [
        "124",
        "234",
        "145",
        "135"
      ]
    },
    {
      "text": "터무니",
      "source_ascii": "hsemco",
      "printed_page": 3,
      "source_bbox": [
        241.4291534423828,
        439.08013916015625,
        274.5312194824219,
        452.3026428222656
      ],
      "braille_bbox": [
        288.803466796875,
        439.08013916015625,
        348.26806640625,
        451.21087646484375
      ],
      "expected_dots": [
        "125",
        "234",
        "15",
        "134",
        "14",
        "135"
      ]
    },
    {
      "text": "피리",
      "source_ascii": "do\"o",
      "printed_page": 3,
      "source_bbox": [
        378.3949279785156,
        439.08013916015625,
        400.4629821777344,
        452.3026428222656
      ],
      "braille_bbox": [
        417.25384521484375,
        439.08013916015625,
        462.9259033203125,
        451.21087646484375
      ],
      "expected_dots": [
        "145",
        "135",
        "5",
        "135"
      ]
    },
    {
      "text": "호수",
      "source_ascii": "ju,m",
      "printed_page": 3,
      "source_bbox": [
        118.61571502685547,
        464.25262451171875,
        140.68374633789062,
        477.4751281738281
      ],
      "braille_bbox": [
        157.4746551513672,
        464.25262451171875,
        197.14968872070312,
        476.38336181640625
      ],
      "expected_dots": [
        "245",
        "136",
        "6",
        "134"
      ]
    },
    {
      "text": "아버지",
      "source_ascii": "<~s.o",
      "printed_page": 3,
      "source_bbox": [
        118.61571502685547,
        549.839111328125,
        151.7177734375,
        563.0616455078125
      ],
      "braille_bbox": [
        157.4746551513672,
        549.839111328125,
        206.98431396484375,
        561.9698486328125
      ],
      "expected_dots": [
        "126",
        "45",
        "234",
        "46",
        "135"
      ]
    },
    {
      "text": "야구",
      "source_ascii": ">@m",
      "printed_page": 3,
      "source_bbox": [
        233.03370666503906,
        549.839111328125,
        254.98147583007812,
        563.0616455078125
      ],
      "braille_bbox": [
        280.2880859375,
        549.839111328125,
        310.00823974609375,
        561.9698486328125
      ],
      "expected_dots": [
        "345",
        "4",
        "134"
      ]
    },
    {
      "text": "어머니",
      "source_ascii": "sesco",
      "printed_page": 3,
      "source_bbox": [
        361.4841003417969,
        549.839111328125,
        394.46588134765625,
        563.0616455078125
      ],
      "braille_bbox": [
        400.22308349609375,
        549.839111328125,
        449.85302734375,
        561.9698486328125
      ],
      "expected_dots": [
        "234",
        "15",
        "234",
        "14",
        "135"
      ]
    },
    {
      "text": "여우",
      "source_ascii": ":m",
      "printed_page": 3,
      "source_bbox": [
        118.61571502685547,
        574.8917236328125,
        140.68374633789062,
        588.1142578125
      ],
      "braille_bbox": [
        157.4746551513672,
        574.8917236328125,
        177.23989868164062,
        587.0224609375
      ],
      "expected_dots": [
        "156",
        "134"
      ]
    },
    {
      "text": "오이",
      "source_ascii": "uo",
      "printed_page": 3,
      "source_bbox": [
        233.03370666503906,
        574.8917236328125,
        254.98147583007812,
        588.1142578125
      ],
      "braille_bbox": [
        280.2880859375,
        574.8917236328125,
        300.173583984375,
        587.0224609375
      ],
      "expected_dots": [
        "136",
        "135"
      ]
    },
    {
      "text": "요리",
      "source_ascii": "+\"o",
      "printed_page": 3,
      "source_bbox": [
        361.4841003417969,
        574.8917236328125,
        383.5521240234375,
        588.1142578125
      ],
      "braille_bbox": [
        400.22308349609375,
        574.8917236328125,
        430.0634765625,
        587.0224609375
      ],
      "expected_dots": [
        "346",
        "5",
        "135"
      ]
    },
    {
      "text": "우유",
      "source_ascii": "m%",
      "printed_page": 3,
      "source_bbox": [
        118.61571502685547,
        600.064208984375,
        140.68374633789062,
        613.2867431640625
      ],
      "braille_bbox": [
        157.4746551513672,
        600.064208984375,
        177.23989868164062,
        612.1949462890625
      ],
      "expected_dots": [
        "134",
        "146"
      ]
    },
    {
      "text": "유리",
      "source_ascii": "%\"o",
      "printed_page": 3,
      "source_bbox": [
        233.03370666503906,
        600.064208984375,
        254.98147583007812,
        613.2867431640625
      ],
      "braille_bbox": [
        280.2880859375,
        600.064208984375,
        310.00823974609375,
        612.1949462890625
      ],
      "expected_dots": [
        "146",
        "5",
        "135"
      ]
    },
    {
      "text": "으스스",
      "source_ascii": "{,{,{",
      "printed_page": 3,
      "source_bbox": [
        361.4841003417969,
        600.064208984375,
        394.46588134765625,
        613.2867431640625
      ],
      "braille_bbox": [
        400.22308349609375,
        600.064208984375,
        449.85302734375,
        612.1949462890625
      ],
      "expected_dots": [
        "246",
        "6",
        "246",
        "6",
        "246"
      ]
    },
    {
      "text": "이모",
      "source_ascii": "oeu",
      "printed_page": 3,
      "source_bbox": [
        118.61571502685547,
        625.2366943359375,
        140.68374633789062,
        638.459228515625
      ],
      "braille_bbox": [
        157.4746551513672,
        625.2366943359375,
        187.19479370117188,
        637.367431640625
      ],
      "expected_dots": [
        "135",
        "15",
        "136"
      ]
    },
    {
      "text": "피아노",
      "source_ascii": "do<cu",
      "printed_page": 3,
      "source_bbox": [
        233.03370666503906,
        625.2366943359375,
        266.0154724121094,
        638.459228515625
      ],
      "braille_bbox": [
        280.2880859375,
        625.2366943359375,
        329.91802978515625,
        637.367431640625
      ],
      "expected_dots": [
        "145",
        "135",
        "126",
        "14",
        "136"
      ]
    },
    {
      "text": "도우미",
      "source_ascii": "iumeo",
      "printed_page": 3,
      "source_bbox": [
        361.4841003417969,
        625.2366943359375,
        394.46588134765625,
        638.459228515625
      ],
      "braille_bbox": [
        400.22308349609375,
        625.2366943359375,
        457.88909912109375,
        637.367431640625
      ],
      "expected_dots": [
        "24",
        "136",
        "134",
        "15",
        "135"
      ]
    },
    {
      "text": "러시아",
      "source_ascii": "\"s,o<",
      "printed_page": 3,
      "source_bbox": [
        118.61571502685547,
        650.289306640625,
        151.7177734375,
        663.5118408203125
      ],
      "braille_bbox": [
        157.4746551513672,
        650.289306640625,
        206.98431396484375,
        662.4200439453125
      ],
      "expected_dots": [
        "5",
        "234",
        "6",
        "135",
        "126"
      ]
    },
    {
      "text": "꾸러미",
      "source_ascii": ",@m\"seo",
      "printed_page": 4,
      "source_bbox": [
        118.61571502685547,
        210.8495635986328,
        151.7177734375,
        224.07208251953125
      ],
      "braille_bbox": [
        157.4746551513672,
        210.8495635986328,
        226.8941192626953,
        222.98031616210938
      ],
      "expected_dots": [
        "6",
        "4",
        "134",
        "5",
        "234",
        "15",
        "135"
      ]
    },
    {
      "text": "두꺼비",
      "source_ascii": "im,@s~o",
      "printed_page": 4,
      "source_bbox": [
        241.4291534423828,
        210.8495635986328,
        274.5312194824219,
        224.07208251953125
      ],
      "braille_bbox": [
        288.803466796875,
        210.8495635986328,
        358.22296142578125,
        222.98031616210938
      ],
      "expected_dots": [
        "24",
        "134",
        "6",
        "4",
        "234",
        "45",
        "135"
      ]
    },
    {
      "text": "뚜껑",
      "source_ascii": ",im,@s7",
      "printed_page": 4,
      "source_bbox": [
        378.3949279785156,
        210.8495635986328,
        400.4629821777344,
        224.07208251953125
      ],
      "braille_bbox": [
        420.0123596191406,
        210.8495635986328,
        489.431884765625,
        222.98031616210938
      ],
      "expected_dots": [
        "6",
        "24",
        "134",
        "6",
        "4",
        "234",
        "2356"
      ]
    },
    {
      "text": "허리띠",
      "source_ascii": "js\"o,io",
      "printed_page": 4,
      "source_bbox": [
        118.61571502685547,
        236.02206420898438,
        151.7177734375,
        249.2445831298828
      ],
      "braille_bbox": [
        157.4746551513672,
        236.02206420898438,
        226.8941192626953,
        248.15281677246094
      ],
      "expected_dots": [
        "245",
        "234",
        "5",
        "135",
        "6",
        "24",
        "135"
      ]
    },
    {
      "text": "뻐꾸기",
      "source_ascii": ",~s,@m@o",
      "printed_page": 4,
      "source_bbox": [
        241.4291534423828,
        236.02206420898438,
        274.5312194824219,
        249.2445831298828
      ],
      "braille_bbox": [
        288.803466796875,
        236.02206420898438,
        368.0576171875,
        248.15281677246094
      ],
      "expected_dots": [
        "6",
        "45",
        "234",
        "6",
        "4",
        "134",
        "4",
        "135"
      ]
    },
    {
      "text": "고삐",
      "source_ascii": "@u,~o",
      "printed_page": 4,
      "source_bbox": [
        378.3949279785156,
        236.02206420898438,
        400.4629821777344,
        249.2445831298828
      ],
      "braille_bbox": [
        420.0123596191406,
        236.02206420898438,
        469.642333984375,
        248.15281677246094
      ],
      "expected_dots": [
        "4",
        "136",
        "6",
        "45",
        "135"
      ]
    },
    {
      "text": "쓰기",
      "source_ascii": ",,{@o",
      "printed_page": 4,
      "source_bbox": [
        118.61571502685547,
        261.0746765136719,
        140.68374633789062,
        274.29718017578125
      ],
      "braille_bbox": [
        157.4746551513672,
        261.0746765136719,
        206.98431396484375,
        273.2054138183594
      ],
      "expected_dots": [
        "6",
        "6",
        "246",
        "4",
        "135"
      ]
    },
    {
      "text": "아저씨",
      "source_ascii": "<.s,,o",
      "printed_page": 4,
      "source_bbox": [
        241.4291534423828,
        261.0746765136719,
        274.5312194824219,
        274.29718017578125
      ],
      "braille_bbox": [
        288.803466796875,
        261.0746765136719,
        348.26806640625,
        273.2054138183594
      ],
      "expected_dots": [
        "126",
        "46",
        "234",
        "6",
        "6",
        "135"
      ]
    },
    {
      "text": "쭈르르",
      "source_ascii": ",.m\"{\"{",
      "printed_page": 4,
      "source_bbox": [
        378.3949279785156,
        261.0746765136719,
        411.4969787597656,
        274.29718017578125
      ],
      "braille_bbox": [
        420.0123596191406,
        261.0746765136719,
        489.431884765625,
        273.2054138183594
      ],
      "expected_dots": [
        "6",
        "46",
        "134",
        "5",
        "246",
        "5",
        "246"
      ]
    },
    {
      "text": "버찌",
      "source_ascii": "~s,.o",
      "printed_page": 4,
      "source_bbox": [
        118.61571502685547,
        286.2471618652344,
        140.68374633789062,
        299.46966552734375
      ],
      "braille_bbox": [
        157.4746551513672,
        286.2471618652344,
        206.98431396484375,
        298.3778991699219
      ],
      "expected_dots": [
        "45",
        "234",
        "6",
        "46",
        "135"
      ]
    },
    {
      "text": "국보",
      "source_ascii": "@ma~u",
      "printed_page": 4,
      "source_bbox": [
        118.61571502685547,
        500.33319091796875,
        140.68374633789062,
        513.5557250976562
      ],
      "braille_bbox": [
        157.4746551513672,
        500.33319091796875,
        206.98431396484375,
        512.4639282226562
      ],
      "expected_dots": [
        "4",
        "134",
        "1",
        "45",
        "136"
      ]
    },
    {
      "text": "윤리",
      "source_ascii": "%3\"o",
      "printed_page": 4,
      "source_bbox": [
        247.18603515625,
        500.33319091796875,
        269.1338195800781,
        513.5557250976562
      ],
      "braille_bbox": [
        294.4404296875,
        500.33319091796875,
        334.115478515625,
        512.4639282226562
      ],
      "expected_dots": [
        "146",
        "25",
        "5",
        "135"
      ]
    },
    {
      "text": "싣고",
      "source_ascii": ",o9@u",
      "printed_page": 4,
      "source_bbox": [
        364.2425842285156,
        500.33319091796875,
        386.3106384277344,
        513.5557250976562
      ],
      "braille_bbox": [
        405.86004638671875,
        500.33319091796875,
        455.489990234375,
        512.4639282226562
      ],
      "expected_dots": [
        "6",
        "135",
        "35",
        "4",
        "136"
      ]
    },
    {
      "text": "놀이",
      "source_ascii": "cu1o",
      "printed_page": 4,
      "source_bbox": [
        118.61571502685547,
        525.5056762695312,
        140.68374633789062,
        538.7282104492188
      ],
      "braille_bbox": [
        157.4746551513672,
        525.5056762695312,
        197.14968872070312,
        537.6364135742188
      ],
      "expected_dots": [
        "14",
        "136",
        "2",
        "135"
      ]
    },
    {
      "text": "솜씨",
      "source_ascii": ",u5,,o",
      "printed_page": 4,
      "source_bbox": [
        247.18603515625,
        525.5056762695312,
        269.1338195800781,
        538.7282104492188
      ],
      "braille_bbox": [
        294.4404296875,
        525.5056762695312,
        353.905029296875,
        537.6364135742188
      ],
      "expected_dots": [
        "6",
        "136",
        "26",
        "6",
        "6",
        "135"
      ]
    },
    {
      "text": "넙치",
      "source_ascii": "csb;o",
      "printed_page": 4,
      "source_bbox": [
        364.2425842285156,
        525.5056762695312,
        386.3106384277344,
        538.7282104492188
      ],
      "braille_bbox": [
        405.86004638671875,
        525.5056762695312,
        455.489990234375,
        537.6364135742188
      ],
      "expected_dots": [
        "14",
        "234",
        "12",
        "56",
        "135"
      ]
    },
    {
      "text": "놋그릇",
      "source_ascii": "cu'@{\"{'",
      "printed_page": 4,
      "source_bbox": [
        118.61571502685547,
        550.6781616210938,
        151.7177734375,
        563.9006958007812
      ],
      "braille_bbox": [
        157.4746551513672,
        550.6781616210938,
        236.72874450683594,
        562.8088989257812
      ],
      "expected_dots": [
        "14",
        "136",
        "3",
        "4",
        "246",
        "5",
        "246",
        "3"
      ]
    },
    {
      "text": "향기",
      "source_ascii": "j>7@o",
      "printed_page": 4,
      "source_bbox": [
        247.18603515625,
        550.6781616210938,
        269.1338195800781,
        563.9006958007812
      ],
      "braille_bbox": [
        294.4404296875,
        550.6781616210938,
        344.07037353515625,
        562.8088989257812
      ],
      "expected_dots": [
        "245",
        "345",
        "2356",
        "4",
        "135"
      ]
    },
    {
      "text": "엊저녁",
      "source_ascii": "sk.sc:a",
      "printed_page": 4,
      "source_bbox": [
        364.2425842285156,
        550.6781616210938,
        397.34466552734375,
        563.9006958007812
      ],
      "braille_bbox": [
        405.86004638671875,
        550.6781616210938,
        475.279541015625,
        562.8088989257812
      ],
      "expected_dots": [
        "234",
        "13",
        "46",
        "234",
        "14",
        "156",
        "1"
      ]
    },
    {
      "text": "윷놀이",
      "source_ascii": "%2cu1o",
      "printed_page": 4,
      "source_bbox": [
        118.61571502685547,
        575.7308349609375,
        151.7177734375,
        588.953369140625
      ],
      "braille_bbox": [
        157.4746551513672,
        575.7308349609375,
        216.939208984375,
        587.861572265625
      ],
      "expected_dots": [
        "146",
        "23",
        "14",
        "136",
        "2",
        "135"
      ]
    },
    {
      "text": "부엌",
      "source_ascii": "~ms6",
      "printed_page": 4,
      "source_bbox": [
        247.18603515625,
        575.7308349609375,
        269.1338195800781,
        588.953369140625
      ],
      "braille_bbox": [
        294.4404296875,
        575.7308349609375,
        334.115478515625,
        587.861572265625
      ],
      "expected_dots": [
        "45",
        "134",
        "234",
        "235"
      ]
    },
    {
      "text": "겉보리",
      "source_ascii": "@s8~u\"o",
      "printed_page": 4,
      "source_bbox": [
        364.2425842285156,
        575.7308349609375,
        397.34466552734375,
        588.953369140625
      ],
      "braille_bbox": [
        405.86004638671875,
        575.7308349609375,
        487.27349853515625,
        587.861572265625
      ],
      "expected_dots": [
        "4",
        "234",
        "236",
        "45",
        "136",
        "5",
        "135"
      ]
    },
    {
      "text": "앞집",
      "source_ascii": "<4.ob",
      "printed_page": 4,
      "source_bbox": [
        118.61571502685547,
        600.9033203125,
        140.68374633789062,
        614.1258544921875
      ],
      "braille_bbox": [
        157.4746551513672,
        600.9033203125,
        206.98431396484375,
        613.0340576171875
      ],
      "expected_dots": [
        "126",
        "256",
        "46",
        "135",
        "12"
      ]
    },
    {
      "text": "히읗",
      "source_ascii": "jo{0",
      "printed_page": 4,
      "source_bbox": [
        247.18603515625,
        600.9033203125,
        269.1338195800781,
        614.1258544921875
      ],
      "braille_bbox": [
        294.4404296875,
        600.9033203125,
        334.115478515625,
        613.0340576171875
      ],
      "expected_dots": [
        "245",
        "135",
        "246",
        "356"
      ]
    },
    {
      "text": "겪다",
      "source_ascii": "@:aai",
      "printed_page": 4,
      "source_bbox": [
        118.61571502685547,
        687.808349609375,
        140.68374633789062,
        701.0308837890625
      ],
      "braille_bbox": [
        166.7096405029297,
        687.808349609375,
        216.33958435058594,
        699.9390869140625
      ],
      "expected_dots": [
        "4",
        "156",
        "1",
        "1",
        "24"
      ]
    },
    {
      "text": "묶음",
      "source_ascii": "emaa[5",
      "printed_page": 4,
      "source_bbox": [
        268.7743225097656,
        687.808349609375,
        290.7224426269531,
        701.0308837890625
      ],
      "braille_bbox": [
        316.8682556152344,
        687.808349609375,
        376.3328857421875,
        699.9390869140625
      ],
      "expected_dots": [
        "15",
        "134",
        "1",
        "1",
        "246",
        "26"
      ]
    },
    {
      "text": "있다",
      "source_ascii": "o/i",
      "printed_page": 4,
      "source_bbox": [
        118.61571502685547,
        712.9808349609375,
        140.68374633789062,
        726.203369140625
      ],
      "braille_bbox": [
        166.7096405029297,
        712.9808349609375,
        196.55006408691406,
        725.111572265625
      ],
      "expected_dots": [
        "135",
        "34",
        "24"
      ]
    },
    {
      "text": "보았다",
      "source_ascii": "^u</i",
      "printed_page": 4,
      "source_bbox": [
        268.7743225097656,
        712.9808349609375,
        301.7564697265625,
        726.203369140625
      ],
      "braille_bbox": [
        316.8682556152344,
        712.9808349609375,
        366.37799072265625,
        725.111572265625
      ],
      "expected_dots": [
        "45",
        "136",
        "126",
        "34",
        "24"
      ]
    },
    {
      "text": "품삯",
      "source_ascii": "dm5la'",
      "printed_page": 5,
      "source_bbox": [
        118.61571502685547,
        264.5508728027344,
        140.68374633789062,
        277.77337646484375
      ],
      "braille_bbox": [
        157.4746551513672,
        264.5508728027344,
        216.9386749267578,
        276.6816101074219
      ],
      "expected_dots": [
        "145",
        "134",
        "26",
        "123",
        "1",
        "3"
      ]
    },
    {
      "text": "앉다",
      "source_ascii": "<3ki",
      "printed_page": 5,
      "source_bbox": [
        241.4291534423828,
        264.5508728027344,
        263.4971923828125,
        277.77337646484375
      ],
      "braille_bbox": [
        288.803466796875,
        264.5508728027344,
        328.478515625,
        276.6816101074219
      ],
      "expected_dots": [
        "126",
        "25",
        "13",
        "24"
      ]
    },
    {
      "text": "않다",
      "source_ascii": "<30i",
      "printed_page": 5,
      "source_bbox": [
        378.3949279785156,
        264.5508728027344,
        400.4629821777344,
        277.77337646484375
      ],
      "braille_bbox": [
        417.25384521484375,
        264.5508728027344,
        456.92889404296875,
        276.6816101074219
      ],
      "expected_dots": [
        "126",
        "25",
        "356",
        "24"
      ]
    },
    {
      "text": "읽다",
      "source_ascii": "o1ai",
      "printed_page": 5,
      "source_bbox": [
        118.61571502685547,
        289.7233581542969,
        140.68374633789062,
        302.94586181640625
      ],
      "braille_bbox": [
        157.4746551513672,
        289.7233581542969,
        197.14968872070312,
        301.8540954589844
      ],
      "expected_dots": [
        "135",
        "2",
        "1",
        "24"
      ]
    },
    {
      "text": "옮기다",
      "source_ascii": "u15@oi",
      "printed_page": 5,
      "source_bbox": [
        241.4291534423828,
        289.7233581542969,
        274.5312194824219,
        302.94586181640625
      ],
      "braille_bbox": [
        288.803466796875,
        289.7233581542969,
        348.26806640625,
        301.8540954589844
      ],
      "expected_dots": [
        "136",
        "2",
        "26",
        "4",
        "135",
        "24"
      ]
    },
    {
      "text": "얇다",
      "source_ascii": ">1bi",
      "printed_page": 5,
      "source_bbox": [
        378.3949279785156,
        289.7233581542969,
        400.4629821777344,
        302.94586181640625
      ],
      "braille_bbox": [
        417.25384521484375,
        289.7233581542969,
        456.92889404296875,
        301.8540954589844
      ],
      "expected_dots": [
        "345",
        "2",
        "12",
        "24"
      ]
    },
    {
      "text": "외곬",
      "source_ascii": "y@u1'",
      "printed_page": 5,
      "source_bbox": [
        118.61571502685547,
        314.7760009765625,
        140.68374633789062,
        327.9985046386719
      ],
      "braille_bbox": [
        157.4746551513672,
        314.7760009765625,
        206.98431396484375,
        326.90673828125
      ],
      "expected_dots": [
        "13456",
        "4",
        "136",
        "2",
        "3"
      ]
    },
    {
      "text": "핥다",
      "source_ascii": "j18i",
      "printed_page": 5,
      "source_bbox": [
        241.4291534423828,
        314.7760009765625,
        263.4971923828125,
        327.9985046386719
      ],
      "braille_bbox": [
        288.803466796875,
        314.7760009765625,
        328.478515625,
        326.90673828125
      ],
      "expected_dots": [
        "245",
        "2",
        "236",
        "24"
      ]
    },
    {
      "text": "옳다",
      "source_ascii": "u10i",
      "printed_page": 5,
      "source_bbox": [
        378.3949279785156,
        314.7760009765625,
        400.4629821777344,
        327.9985046386719
      ],
      "braille_bbox": [
        417.25384521484375,
        314.7760009765625,
        456.92889404296875,
        326.90673828125
      ],
      "expected_dots": [
        "136",
        "2",
        "356",
        "24"
      ]
    },
    {
      "text": "없다",
      "source_ascii": "sb'i",
      "printed_page": 5,
      "source_bbox": [
        118.61571502685547,
        339.948486328125,
        140.68374633789062,
        353.1709899902344
      ],
      "braille_bbox": [
        157.4746551513672,
        339.948486328125,
        197.14968872070312,
        352.0792236328125
      ],
      "expected_dots": [
        "234",
        "12",
        "3",
        "24"
      ]
    },
    {
      "text": "아리랑",
      "source_ascii": "<\"o\"<7",
      "printed_page": 5,
      "source_bbox": [
        118.61571502685547,
        546.4827880859375,
        151.7177734375,
        559.705322265625
      ],
      "braille_bbox": [
        157.4746551513672,
        546.4827880859375,
        216.939208984375,
        558.613525390625
      ],
      "expected_dots": [
        "126",
        "5",
        "135",
        "5",
        "126",
        "2356"
      ]
    },
    {
      "text": "고양이",
      "source_ascii": "@u>7o",
      "printed_page": 5,
      "source_bbox": [
        241.4291534423828,
        546.4827880859375,
        274.5312194824219,
        559.705322265625
      ],
      "braille_bbox": [
        288.803466796875,
        546.4827880859375,
        338.31317138671875,
        558.613525390625
      ],
      "expected_dots": [
        "4",
        "136",
        "345",
        "2356",
        "135"
      ]
    },
    {
      "text": "엄지",
      "source_ascii": "s5.o",
      "printed_page": 5,
      "source_bbox": [
        378.3949279785156,
        546.4827880859375,
        400.4629821777344,
        559.705322265625
      ],
      "braille_bbox": [
        417.25384521484375,
        546.4827880859375,
        456.92889404296875,
        558.613525390625
      ],
      "expected_dots": [
        "234",
        "26",
        "46",
        "135"
      ]
    },
    {
      "text": "무역",
      "source_ascii": "em:a",
      "printed_page": 5,
      "source_bbox": [
        118.61571502685547,
        571.6552734375,
        140.68374633789062,
        584.8778076171875
      ],
      "braille_bbox": [
        157.4746551513672,
        571.6552734375,
        197.14968872070312,
        583.7860107421875
      ],
      "expected_dots": [
        "15",
        "134",
        "156",
        "1"
      ]
    },
    {
      "text": "호랑이",
      "source_ascii": "ju\"<7o",
      "printed_page": 5,
      "source_bbox": [
        241.4291534423828,
        571.6552734375,
        274.5312194824219,
        584.8778076171875
      ],
      "braille_bbox": [
        288.803466796875,
        571.6552734375,
        348.26806640625,
        583.7860107421875
      ],
      "expected_dots": [
        "245",
        "136",
        "5",
        "126",
        "2356",
        "135"
      ]
    },
    {
      "text": "무용",
      "source_ascii": "em+7",
      "printed_page": 5,
      "source_bbox": [
        378.3949279785156,
        571.6552734375,
        400.4629821777344,
        584.8778076171875
      ],
      "braille_bbox": [
        417.25384521484375,
        571.6552734375,
        456.92889404296875,
        583.7860107421875
      ],
      "expected_dots": [
        "15",
        "134",
        "346",
        "2356"
      ]
    },
    {
      "text": "국수",
      "source_ascii": "@ma,m",
      "printed_page": 5,
      "source_bbox": [
        118.61571502685547,
        596.8277587890625,
        140.68374633789062,
        610.05029296875
      ],
      "braille_bbox": [
        157.4746551513672,
        596.8277587890625,
        206.98431396484375,
        608.95849609375
      ],
      "expected_dots": [
        "4",
        "134",
        "1",
        "6",
        "134"
      ]
    },
    {
      "text": "법률",
      "source_ascii": "~sb\"%1",
      "printed_page": 5,
      "source_bbox": [
        241.4291534423828,
        596.8277587890625,
        263.4971923828125,
        610.05029296875
      ],
      "braille_bbox": [
        288.803466796875,
        596.8277587890625,
        348.26806640625,
        608.95849609375
      ],
      "expected_dots": [
        "45",
        "234",
        "12",
        "5",
        "146",
        "2"
      ]
    },
    {
      "text": "특기",
      "source_ascii": "h{a@o",
      "printed_page": 5,
      "source_bbox": [
        378.3949279785156,
        596.8277587890625,
        400.4629821777344,
        610.05029296875
      ],
      "braille_bbox": [
        417.25384521484375,
        596.8277587890625,
        466.7635498046875,
        608.95849609375
      ],
      "expected_dots": [
        "125",
        "246",
        "1",
        "4",
        "135"
      ]
    },
    {
      "text": "코끼리",
      "source_ascii": "fu,@o\"o",
      "printed_page": 5,
      "source_bbox": [
        118.61571502685547,
        621.88037109375,
        151.7177734375,
        635.1029052734375
      ],
      "braille_bbox": [
        157.4746551513672,
        621.88037109375,
        226.8941192626953,
        634.0111083984375
      ],
      "expected_dots": [
        "124",
        "136",
        "6",
        "4",
        "135",
        "5",
        "135"
      ]
    },
    {
      "text": "매미",
      "source_ascii": "ereo",
      "printed_page": 6,
      "source_bbox": [
        118.61571502685547,
        104.52577209472656,
        140.68374633789062,
        117.74828338623047
      ],
      "braille_bbox": [
        157.4746551513672,
        104.52577209472656,
        197.14968872070312,
        116.6565170288086
      ],
      "expected_dots": [
        "15",
        "1235",
        "15",
        "135"
      ]
    },
    {
      "text": "얘기",
      "source_ascii": ">r@o",
      "printed_page": 6,
      "source_bbox": [
        241.4291534423828,
        104.52577209472656,
        263.4971923828125,
        117.74828338623047
      ],
      "braille_bbox": [
        288.803466796875,
        104.52577209472656,
        328.478515625,
        116.6565170288086
      ],
      "expected_dots": [
        "345",
        "1235",
        "4",
        "135"
      ]
    },
    {
      "text": "헤엄",
      "source_ascii": "jns5",
      "printed_page": 6,
      "source_bbox": [
        369.9994812011719,
        104.52577209472656,
        391.947265625,
        117.74828338623047
      ],
      "braille_bbox": [
        417.25384521484375,
        104.52577209472656,
        456.92889404296875,
        116.6565170288086
      ],
      "expected_dots": [
        "245",
        "1345",
        "234",
        "26"
      ]
    },
    {
      "text": "지혜",
      "source_ascii": ".oj/",
      "printed_page": 6,
      "source_bbox": [
        118.61571502685547,
        129.69825744628906,
        140.68374633789062,
        142.9207763671875
      ],
      "braille_bbox": [
        157.4746551513672,
        129.69825744628906,
        197.14968872070312,
        141.82901000976562
      ],
      "expected_dots": [
        "46",
        "135",
        "245",
        "34"
      ]
    },
    {
      "text": "광주리",
      "source_ascii": "@v7.m\"o",
      "printed_page": 6,
      "source_bbox": [
        241.4291534423828,
        129.69825744628906,
        274.5312194824219,
        142.9207763671875
      ],
      "braille_bbox": [
        288.803466796875,
        129.69825744628906,
        358.22296142578125,
        141.82901000976562
      ],
      "expected_dots": [
        "4",
        "1236",
        "2356",
        "46",
        "134",
        "5",
        "135"
      ]
    },
    {
      "text": "쾌활",
      "source_ascii": "fvrjv1",
      "printed_page": 6,
      "source_bbox": [
        369.9994812011719,
        129.69825744628906,
        391.947265625,
        142.9207763671875
      ],
      "braille_bbox": [
        417.25384521484375,
        129.69825744628906,
        476.71844482421875,
        141.82901000976562
      ],
      "expected_dots": [
        "124",
        "1236",
        "1235",
        "245",
        "1236",
        "2"
      ]
    },
    {
      "text": "피뢰침",
      "source_ascii": "do\"y;o5",
      "printed_page": 6,
      "source_bbox": [
        118.61571502685547,
        154.75086975097656,
        151.7177734375,
        167.973388671875
      ],
      "braille_bbox": [
        157.4746551513672,
        154.75086975097656,
        226.8941192626953,
        166.88162231445312
      ],
      "expected_dots": [
        "145",
        "135",
        "5",
        "13456",
        "56",
        "135",
        "26"
      ]
    },
    {
      "text": "권리",
      "source_ascii": "@p3\"o",
      "printed_page": 6,
      "source_bbox": [
        241.4291534423828,
        154.75086975097656,
        263.4971923828125,
        167.973388671875
      ],
      "braille_bbox": [
        288.803466796875,
        154.75086975097656,
        338.31317138671875,
        166.88162231445312
      ],
      "expected_dots": [
        "4",
        "1234",
        "25",
        "5",
        "135"
      ]
    },
    {
      "text": "우렁쉥이",
      "source_ascii": "m\"s7,pr7o",
      "printed_page": 6,
      "source_bbox": [
        369.9994812011719,
        154.75086975097656,
        414.015625,
        167.973388671875
      ],
      "braille_bbox": [
        417.25384521484375,
        154.75086975097656,
        506.462890625,
        166.88162231445312
      ],
      "expected_dots": [
        "134",
        "5",
        "234",
        "2356",
        "6",
        "1234",
        "1235",
        "2356",
        "135"
      ]
    },
    {
      "text": "쉼터",
      "source_ascii": ",mr5hs",
      "printed_page": 6,
      "source_bbox": [
        118.61571502685547,
        179.92337036132812,
        140.68374633789062,
        193.14588928222656
      ],
      "braille_bbox": [
        157.4746551513672,
        179.92337036132812,
        216.939208984375,
        192.0541229248047
      ],
      "expected_dots": [
        "6",
        "134",
        "1235",
        "26",
        "125",
        "234"
      ]
    },
    {
      "text": "무늬",
      "source_ascii": "emcw",
      "printed_page": 6,
      "source_bbox": [
        241.4291534423828,
        179.92337036132812,
        263.4971923828125,
        193.14588928222656
      ],
      "braille_bbox": [
        288.803466796875,
        179.92337036132812,
        328.478515625,
        192.0541229248047
      ],
      "expected_dots": [
        "15",
        "134",
        "14",
        "2456"
      ]
    },
    {
      "text": "아예",
      "source_ascii": "<-/",
      "printed_page": 8,
      "source_bbox": [
        118.61571502685547,
        184.3585205078125,
        140.68374633789062,
        197.58103942871094
      ],
      "braille_bbox": [
        169.5880889892578,
        184.3585205078125,
        199.3082275390625,
        196.48927307128906
      ],
      "expected_dots": [
        "126",
        "36",
        "34"
      ]
    },
    {
      "text": "도예",
      "source_ascii": "iu-/",
      "printed_page": 8,
      "source_bbox": [
        260.0190734863281,
        184.3585205078125,
        282.0871276855469,
        197.58103942871094
      ],
      "braille_bbox": [
        302.47607421875,
        184.3585205078125,
        342.151123046875,
        196.48927307128906
      ],
      "expected_dots": [
        "24",
        "136",
        "36",
        "34"
      ]
    },
    {
      "text": "뭐예요",
      "source_ascii": "ep-/+",
      "printed_page": 8,
      "source_bbox": [
        390.1485595703125,
        184.3585205078125,
        423.2506103515625,
        197.58103942871094
      ],
      "braille_bbox": [
        426.9685974121094,
        184.3585205078125,
        476.478271484375,
        196.48927307128906
      ],
      "expected_dots": [
        "15",
        "1234",
        "36",
        "34",
        "346"
      ]
    },
    {
      "text": "서예",
      "source_ascii": ",s-/",
      "printed_page": 8,
      "source_bbox": [
        118.61571502685547,
        209.531005859375,
        140.68374633789062,
        222.75352478027344
      ],
      "braille_bbox": [
        169.5880889892578,
        209.531005859375,
        209.26312255859375,
        221.66175842285156
      ],
      "expected_dots": [
        "6",
        "234",
        "36",
        "34"
      ]
    },
    {
      "text": "야애",
      "source_ascii": ">-r",
      "printed_page": 8,
      "source_bbox": [
        118.61571502685547,
        446.63189697265625,
        140.68374633789062,
        459.8544006347656
      ],
      "braille_bbox": [
        169.5880889892578,
        446.63189697265625,
        199.3082275390625,
        458.76263427734375
      ],
      "expected_dots": [
        "345",
        "36",
        "1235"
      ]
    },
    {
      "text": "소화액",
      "source_ascii": ",ujv-ra",
      "printed_page": 8,
      "source_bbox": [
        260.0190734863281,
        446.63189697265625,
        293.12115478515625,
        459.8544006347656
      ],
      "braille_bbox": [
        302.47607421875,
        446.63189697265625,
        371.89556884765625,
        458.76263427734375
      ],
      "expected_dots": [
        "6",
        "136",
        "245",
        "1236",
        "36",
        "1235",
        "1"
      ]
    },
    {
      "text": "수액",
      "source_ascii": ",m-ra",
      "printed_page": 8,
      "source_bbox": [
        390.1485595703125,
        446.63189697265625,
        412.2165832519531,
        459.8544006347656
      ],
      "braille_bbox": [
        426.9685974121094,
        446.63189697265625,
        476.478271484375,
        458.76263427734375
      ],
      "expected_dots": [
        "6",
        "134",
        "36",
        "1235",
        "1"
      ]
    },
    {
      "text": "파워앰프",
      "source_ascii": "d<p-r5d{",
      "printed_page": 8,
      "source_bbox": [
        118.61571502685547,
        471.68450927734375,
        162.63186645507812,
        484.9070129394531
      ],
      "braille_bbox": [
        169.5880889892578,
        471.68450927734375,
        248.9624481201172,
        483.81524658203125
      ],
      "expected_dots": [
        "145",
        "126",
        "1234",
        "36",
        "1235",
        "26",
        "145",
        "246"
      ]
    },
    {
      "text": "가지",
      "source_ascii": "$.o",
      "printed_page": 9,
      "source_bbox": [
        120.77454376220703,
        282.7709655761719,
        142.72232055664062,
        295.99346923828125
      ],
      "braille_bbox": [
        171.62698364257812,
        282.7709655761719,
        201.3471221923828,
        294.9017028808594
      ],
      "expected_dots": [
        "1246",
        "46",
        "135"
      ]
    },
    {
      "text": "나비",
      "source_ascii": "c~o",
      "printed_page": 9,
      "source_bbox": [
        242.26869201660156,
        282.7709655761719,
        264.33673095703125,
        295.99346923828125
      ],
      "braille_bbox": [
        281.9671936035156,
        282.7709655761719,
        311.68731689453125,
        294.9017028808594
      ],
      "expected_dots": [
        "14",
        "45",
        "135"
      ]
    },
    {
      "text": "다리미",
      "source_ascii": "i\"oeo",
      "printed_page": 9,
      "source_bbox": [
        344.093505859375,
        282.7709655761719,
        377.1955871582031,
        295.99346923828125
      ],
      "braille_bbox": [
        386.5505065917969,
        282.7709655761719,
        436.18048095703125,
        294.9017028808594
      ],
      "expected_dots": [
        "24",
        "5",
        "135",
        "15",
        "135"
      ]
    },
    {
      "text": "라디오",
      "source_ascii": "\"<iou",
      "printed_page": 9,
      "source_bbox": [
        120.77454376220703,
        307.9434509277344,
        153.75631713867188,
        321.16595458984375
      ],
      "braille_bbox": [
        171.62698364257812,
        307.9434509277344,
        221.25692749023438,
        320.0741882324219
      ],
      "expected_dots": [
        "5",
        "126",
        "24",
        "135",
        "136"
      ]
    },
    {
      "text": "고구마",
      "source_ascii": "@u@me",
      "printed_page": 9,
      "source_bbox": [
        242.26869201660156,
        307.9434509277344,
        275.3707580566406,
        321.16595458984375
      ],
      "braille_bbox": [
        281.9671936035156,
        307.9434509277344,
        331.47686767578125,
        320.0741882324219
      ],
      "expected_dots": [
        "4",
        "136",
        "4",
        "134",
        "15"
      ]
    },
    {
      "text": "바느질",
      "source_ascii": "~c{.o1",
      "printed_page": 9,
      "source_bbox": [
        344.093505859375,
        307.9434509277344,
        377.1955871582031,
        321.16595458984375
      ],
      "braille_bbox": [
        386.5505065917969,
        307.9434509277344,
        446.01507568359375,
        320.0741882324219
      ],
      "expected_dots": [
        "45",
        "14",
        "246",
        "46",
        "135",
        "2"
      ]
    },
    {
      "text": "사위",
      "source_ascii": "lmr",
      "printed_page": 9,
      "source_bbox": [
        120.77454376220703,
        332.99609375,
        142.72232055664062,
        346.2185974121094
      ],
      "braille_bbox": [
        171.62698364257812,
        332.99609375,
        201.3471221923828,
        345.1268310546875
      ],
      "expected_dots": [
        "123",
        "134",
        "1235"
      ]
    },
    {
      "text": "아궁이",
      "source_ascii": "<@m7o",
      "printed_page": 9,
      "source_bbox": [
        242.26869201660156,
        332.99609375,
        275.3707580566406,
        346.2185974121094
      ],
      "braille_bbox": [
        281.9671936035156,
        332.99609375,
        331.47686767578125,
        345.1268310546875
      ],
      "expected_dots": [
        "126",
        "4",
        "134",
        "2356",
        "135"
      ]
    },
    {
      "text": "도자기",
      "source_ascii": "iu.@o",
      "printed_page": 9,
      "source_bbox": [
        344.093505859375,
        332.99609375,
        377.1955871582031,
        346.2185974121094
      ],
      "braille_bbox": [
        386.5505065917969,
        332.99609375,
        436.18048095703125,
        345.1268310546875
      ],
      "expected_dots": [
        "24",
        "136",
        "46",
        "4",
        "135"
      ]
    },
    {
      "text": "기차",
      "source_ascii": "@o;<",
      "printed_page": 9,
      "source_bbox": [
        120.77454376220703,
        358.1685791015625,
        142.72265625,
        371.3910827636719
      ],
      "braille_bbox": [
        171.62698364257812,
        358.1685791015625,
        211.30201721191406,
        370.29931640625
      ],
      "expected_dots": [
        "4",
        "135",
        "56",
        "126"
      ]
    },
    {
      "text": "카메라",
      "source_ascii": "fen\"<",
      "printed_page": 9,
      "source_bbox": [
        242.26869201660156,
        358.1685791015625,
        275.3707580566406,
        371.3910827636719
      ],
      "braille_bbox": [
        281.9671936035156,
        358.1685791015625,
        331.47686767578125,
        370.29931640625
      ],
      "expected_dots": [
        "124",
        "15",
        "1345",
        "5",
        "126"
      ]
    },
    {
      "text": "실타래",
      "source_ascii": ",o1h\"r",
      "printed_page": 9,
      "source_bbox": [
        344.093505859375,
        358.1685791015625,
        377.1955871582031,
        371.3910827636719
      ],
      "braille_bbox": [
        386.5505065917969,
        358.1685791015625,
        446.01507568359375,
        370.29931640625
      ],
      "expected_dots": [
        "6",
        "135",
        "2",
        "125",
        "5",
        "1235"
      ]
    },
    {
      "text": "파도",
      "source_ascii": "diu",
      "printed_page": 9,
      "source_bbox": [
        120.77454376220703,
        383.22119140625,
        142.72265625,
        396.4436950683594
      ],
      "braille_bbox": [
        171.62698364257812,
        383.22119140625,
        201.3471221923828,
        395.3519287109375
      ],
      "expected_dots": [
        "145",
        "24",
        "136"
      ]
    },
    {
      "text": "하루",
      "source_ascii": "j\"m",
      "printed_page": 9,
      "source_bbox": [
        242.26869201660156,
        383.22119140625,
        264.33673095703125,
        396.4436950683594
      ],
      "braille_bbox": [
        281.9671936035156,
        383.22119140625,
        311.68731689453125,
        395.3519287109375
      ],
      "expected_dots": [
        "245",
        "5",
        "134"
      ]
    },
    {
      "text": "강산",
      "source_ascii": "$7l3",
      "printed_page": 9,
      "source_bbox": [
        120.77454376220703,
        490.5039367675781,
        142.72265625,
        503.7264404296875
      ],
      "braille_bbox": [
        168.74855041503906,
        490.5039367675781,
        208.423583984375,
        502.6346740722656
      ],
      "expected_dots": [
        "1246",
        "2356",
        "123",
        "25"
      ]
    },
    {
      "text": "낮잠",
      "source_ascii": "ck.5",
      "printed_page": 9,
      "source_bbox": [
        264.9364013671875,
        490.5039367675781,
        287.00445556640625,
        503.7264404296875
      ],
      "braille_bbox": [
        313.03033447265625,
        490.5039367675781,
        352.70538330078125,
        502.6346740722656
      ],
      "expected_dots": [
        "14",
        "13",
        "46",
        "26"
      ]
    },
    {
      "text": "단란",
      "source_ascii": "i3\"<3",
      "printed_page": 9,
      "source_bbox": [
        400.70281982421875,
        490.5039367675781,
        422.7708740234375,
        503.7264404296875
      ],
      "braille_bbox": [
        440.2813720703125,
        490.5039367675781,
        489.91131591796875,
        502.6346740722656
      ],
      "expected_dots": [
        "24",
        "25",
        "5",
        "126",
        "25"
      ]
    },
    {
      "text": "만찬",
      "source_ascii": "e3;<3",
      "printed_page": 9,
      "source_bbox": [
        120.77454376220703,
        512.799560546875,
        142.72265625,
        526.0220947265625
      ],
      "braille_bbox": [
        168.74855041503906,
        512.799560546875,
        218.37847900390625,
        524.9302978515625
      ],
      "expected_dots": [
        "15",
        "25",
        "56",
        "126",
        "25"
      ]
    },
    {
      "text": "안방",
      "source_ascii": "<3~7",
      "printed_page": 9,
      "source_bbox": [
        264.9364013671875,
        512.799560546875,
        287.00445556640625,
        526.0220947265625
      ],
      "braille_bbox": [
        313.03033447265625,
        512.799560546875,
        352.70538330078125,
        524.9302978515625
      ],
      "expected_dots": [
        "126",
        "25",
        "45",
        "2356"
      ]
    },
    {
      "text": "바캉스",
      "source_ascii": "~f7,{",
      "printed_page": 9,
      "source_bbox": [
        400.70281982421875,
        512.799560546875,
        433.6849670410156,
        526.0220947265625
      ],
      "braille_bbox": [
        440.2813720703125,
        512.799560546875,
        489.91131591796875,
        524.9302978515625
      ],
      "expected_dots": [
        "45",
        "124",
        "2356",
        "6",
        "246"
      ]
    },
    {
      "text": "갈비탕",
      "source_ascii": "$1~oh7",
      "printed_page": 9,
      "source_bbox": [
        120.77454376220703,
        535.09521484375,
        153.75665283203125,
        548.3177490234375
      ],
      "braille_bbox": [
        168.74855041503906,
        535.09521484375,
        228.3333740234375,
        547.2259521484375
      ],
      "expected_dots": [
        "1246",
        "2",
        "45",
        "135",
        "125",
        "2356"
      ]
    },
    {
      "text": "판소리",
      "source_ascii": "d3,u\"o",
      "printed_page": 9,
      "source_bbox": [
        264.9364013671875,
        535.09521484375,
        297.918212890625,
        548.3177490234375
      ],
      "braille_bbox": [
        313.03033447265625,
        535.09521484375,
        372.49493408203125,
        547.2259521484375
      ],
      "expected_dots": [
        "145",
        "25",
        "6",
        "136",
        "5",
        "135"
      ]
    },
    {
      "text": "합창",
      "source_ascii": "jb;<7",
      "printed_page": 9,
      "source_bbox": [
        400.70281982421875,
        535.09521484375,
        422.7708740234375,
        548.3177490234375
      ],
      "braille_bbox": [
        440.2813720703125,
        535.09521484375,
        489.91131591796875,
        547.2259521484375
      ],
      "expected_dots": [
        "245",
        "12",
        "56",
        "126",
        "2356"
      ]
    },
    {
      "text": "까마귀",
      "source_ascii": ",$e@mr",
      "printed_page": 9,
      "source_bbox": [
        120.77454376220703,
        557.390869140625,
        153.75665283203125,
        570.6134033203125
      ],
      "braille_bbox": [
        168.74855041503906,
        557.390869140625,
        228.3333740234375,
        569.5216064453125
      ],
      "expected_dots": [
        "6",
        "1246",
        "15",
        "4",
        "134",
        "1235"
      ]
    },
    {
      "text": "깜깜하다",
      "source_ascii": ",$5,$5ji",
      "printed_page": 9,
      "source_bbox": [
        264.9364013671875,
        557.390869140625,
        308.95257568359375,
        570.6134033203125
      ],
      "braille_bbox": [
        313.03033447265625,
        557.390869140625,
        392.40472412109375,
        569.5216064453125
      ],
      "expected_dots": [
        "6",
        "1246",
        "26",
        "6",
        "1246",
        "26",
        "245",
        "24"
      ]
    },
    {
      "text": "따님",
      "source_ascii": ",ico5",
      "printed_page": 9,
      "source_bbox": [
        400.70281982421875,
        557.390869140625,
        422.7708740234375,
        570.6134033203125
      ],
      "braille_bbox": [
        440.2813720703125,
        557.390869140625,
        489.91131591796875,
        569.5216064453125
      ],
      "expected_dots": [
        "6",
        "24",
        "14",
        "135",
        "26"
      ]
    },
    {
      "text": "딱따구리",
      "source_ascii": ",ia,i@m\"o",
      "printed_page": 9,
      "source_bbox": [
        120.77454376220703,
        579.6864624023438,
        164.79067993164062,
        592.9089965820312
      ],
      "braille_bbox": [
        168.74855041503906,
        579.6864624023438,
        258.07781982421875,
        591.8171997070312
      ],
      "expected_dots": [
        "6",
        "24",
        "1",
        "6",
        "24",
        "4",
        "134",
        "5",
        "135"
      ]
    },
    {
      "text": "오빠",
      "source_ascii": "u,~",
      "printed_page": 9,
      "source_bbox": [
        264.9364013671875,
        579.6864624023438,
        287.00445556640625,
        592.9089965820312
      ],
      "braille_bbox": [
        313.03033447265625,
        579.6864624023438,
        342.75048828125,
        591.8171997070312
      ],
      "expected_dots": [
        "136",
        "6",
        "45"
      ]
    },
    {
      "text": "빵집",
      "source_ascii": ",~7.ob",
      "printed_page": 9,
      "source_bbox": [
        400.70281982421875,
        579.6864624023438,
        422.7708740234375,
        592.9089965820312
      ],
      "braille_bbox": [
        440.2813720703125,
        579.6864624023438,
        499.7459716796875,
        591.8171997070312
      ],
      "expected_dots": [
        "6",
        "45",
        "2356",
        "46",
        "135",
        "12"
      ]
    },
    {
      "text": "싸구려",
      "source_ascii": ",l@m\":",
      "printed_page": 9,
      "source_bbox": [
        120.77454376220703,
        601.9821166992188,
        153.75665283203125,
        615.2046508789062
      ],
      "braille_bbox": [
        168.74855041503906,
        601.9821166992188,
        228.3333740234375,
        614.1128540039062
      ],
      "expected_dots": [
        "6",
        "123",
        "4",
        "134",
        "5",
        "156"
      ]
    },
    {
      "text": "찹쌀",
      "source_ascii": ";<b,l1",
      "printed_page": 9,
      "source_bbox": [
        264.9364013671875,
        601.9821166992188,
        287.00445556640625,
        615.2046508789062
      ],
      "braille_bbox": [
        313.03033447265625,
        601.9821166992188,
        372.49493408203125,
        614.1128540039062
      ],
      "expected_dots": [
        "56",
        "126",
        "12",
        "6",
        "123",
        "2"
      ]
    },
    {
      "text": "짜장",
      "source_ascii": ",..7",
      "printed_page": 9,
      "source_bbox": [
        400.70281982421875,
        601.9821166992188,
        422.7708740234375,
        615.2046508789062
      ],
      "braille_bbox": [
        440.2813720703125,
        601.9821166992188,
        479.9564208984375,
        614.1128540039062
      ],
      "expected_dots": [
        "6",
        "46",
        "46",
        "2356"
      ]
    },
    {
      "text": "짱구",
      "source_ascii": ",.7@m",
      "printed_page": 9,
      "source_bbox": [
        120.77454376220703,
        624.2777709960938,
        142.72265625,
        637.5003051757812
      ],
      "braille_bbox": [
        168.74855041503906,
        624.2777709960938,
        218.37847900390625,
        636.4085083007812
      ],
      "expected_dots": [
        "6",
        "46",
        "2356",
        "4",
        "134"
      ]
    },
    {
      "text": "나이",
      "source_ascii": "c<o",
      "printed_page": 9,
      "source_bbox": [
        120.77454376220703,
        731.5604858398438,
        142.72232055664062,
        744.7830200195312
      ],
      "braille_bbox": [
        157.4746551513672,
        731.5604858398438,
        187.19479370117188,
        743.6912231445312
      ],
      "expected_dots": [
        "14",
        "126",
        "135"
      ]
    },
    {
      "text": "다음",
      "source_ascii": "i<[5",
      "printed_page": 9,
      "source_bbox": [
        225.3578643798828,
        731.5604858398438,
        247.4259033203125,
        744.7830200195312
      ],
      "braille_bbox": [
        262.0579833984375,
        731.5604858398438,
        301.7330322265625,
        743.6912231445312
      ],
      "expected_dots": [
        "24",
        "126",
        "246",
        "26"
      ]
    },
    {
      "text": "마우스",
      "source_ascii": "e<m,{",
      "printed_page": 9,
      "source_bbox": [
        324.3042297363281,
        731.5604858398438,
        357.40631103515625,
        744.7830200195312
      ],
      "braille_bbox": [
        361.124267578125,
        731.5604858398438,
        410.63372802734375,
        743.6912231445312
      ],
      "expected_dots": [
        "15",
        "126",
        "134",
        "6",
        "246"
      ]
    },
    {
      "text": "바위",
      "source_ascii": "^<mr",
      "printed_page": 10,
      "source_bbox": [
        120.77454376220703,
        105.96419525146484,
        142.72232055664062,
        119.18670654296875
      ],
      "braille_bbox": [
        157.4746551513672,
        105.96419525146484,
        197.14968872070312,
        118.09494018554688
      ],
      "expected_dots": [
        "45",
        "126",
        "134",
        "1235"
      ]
    },
    {
      "text": "자아",
      "source_ascii": ".<<",
      "printed_page": 10,
      "source_bbox": [
        225.3578643798828,
        105.96419525146484,
        247.4259033203125,
        119.18670654296875
      ],
      "braille_bbox": [
        262.0579833984375,
        105.96419525146484,
        291.89837646484375,
        118.09494018554688
      ],
      "expected_dots": [
        "46",
        "126",
        "126"
      ]
    },
    {
      "text": "카이로",
      "source_ascii": "f<o\"u",
      "printed_page": 10,
      "source_bbox": [
        324.3042297363281,
        105.96419525146484,
        357.40631103515625,
        119.18670654296875
      ],
      "braille_bbox": [
        361.124267578125,
        105.96419525146484,
        410.63397216796875,
        118.09494018554688
      ],
      "expected_dots": [
        "124",
        "126",
        "135",
        "5",
        "136"
      ]
    },
    {
      "text": "넥타이",
      "source_ascii": "cnah<o",
      "printed_page": 10,
      "source_bbox": [
        120.77454376220703,
        131.01681518554688,
        153.75665283203125,
        144.2393341064453
      ],
      "braille_bbox": [
        157.4746551513672,
        131.01681518554688,
        216.939208984375,
        143.14756774902344
      ],
      "expected_dots": [
        "14",
        "1345",
        "1",
        "125",
        "126",
        "135"
      ]
    },
    {
      "text": "파이프",
      "source_ascii": "d<od{",
      "printed_page": 10,
      "source_bbox": [
        225.3578643798828,
        131.01681518554688,
        258.33966064453125,
        144.2393341064453
      ],
      "braille_bbox": [
        262.0579833984375,
        131.01681518554688,
        311.68792724609375,
        143.14756774902344
      ],
      "expected_dots": [
        "145",
        "126",
        "135",
        "145",
        "246"
      ]
    },
    {
      "text": "하얀",
      "source_ascii": "j<>3",
      "printed_page": 10,
      "source_bbox": [
        324.3042297363281,
        131.01681518554688,
        346.3722839355469,
        144.2393341064453
      ],
      "braille_bbox": [
        361.124267578125,
        131.01681518554688,
        400.79931640625,
        143.14756774902344
      ],
      "expected_dots": [
        "245",
        "126",
        "345",
        "25"
      ]
    },
    {
      "text": "억새",
      "source_ascii": "?,r",
      "printed_page": 10,
      "source_bbox": [
        120.77454376220703,
        510.4022216796875,
        142.72265625,
        523.624755859375
      ],
      "braille_bbox": [
        171.62698364257812,
        510.4022216796875,
        201.3471221923828,
        522.532958984375
      ],
      "expected_dots": [
        "1456",
        "6",
        "1235"
      ]
    },
    {
      "text": "추억",
      "source_ascii": ";m?",
      "printed_page": 10,
      "source_bbox": [
        242.26869201660156,
        510.4022216796875,
        264.33673095703125,
        523.624755859375
      ],
      "braille_bbox": [
        281.9671936035156,
        510.4022216796875,
        311.68731689453125,
        522.532958984375
      ],
      "expected_dots": [
        "56",
        "134",
        "1456"
      ]
    },
    {
      "text": "언어",
      "source_ascii": ")s",
      "printed_page": 10,
      "source_bbox": [
        352.60888671875,
        510.4022216796875,
        374.67694091796875,
        523.624755859375
      ],
      "braille_bbox": [
        403.4613342285156,
        510.4022216796875,
        423.34686279296875,
        522.532958984375
      ],
      "expected_dots": [
        "23456",
        "234"
      ]
    },
    {
      "text": "격언",
      "source_ascii": "@:a)",
      "printed_page": 10,
      "source_bbox": [
        120.77454376220703,
        532.6978149414062,
        142.72265625,
        545.9203491210938
      ],
      "braille_bbox": [
        171.62698364257812,
        532.6978149414062,
        211.30201721191406,
        544.8285522460938
      ],
      "expected_dots": [
        "4",
        "156",
        "1",
        "23456"
      ]
    },
    {
      "text": "얼룩",
      "source_ascii": "t\"ma",
      "printed_page": 10,
      "source_bbox": [
        242.26869201660156,
        532.6978149414062,
        264.33673095703125,
        545.9203491210938
      ],
      "braille_bbox": [
        281.9671936035156,
        532.6978149414062,
        321.6422119140625,
        544.8285522460938
      ],
      "expected_dots": [
        "2345",
        "5",
        "134",
        "1"
      ]
    },
    {
      "text": "하얼빈",
      "source_ascii": "j<t~q",
      "printed_page": 10,
      "source_bbox": [
        352.60888671875,
        532.6978149414062,
        385.5906982421875,
        545.9203491210938
      ],
      "braille_bbox": [
        403.4613342285156,
        532.6978149414062,
        453.09130859375,
        544.8285522460938
      ],
      "expected_dots": [
        "245",
        "126",
        "2345",
        "45",
        "12345"
      ]
    },
    {
      "text": "연필",
      "source_ascii": "*do1",
      "printed_page": 10,
      "source_bbox": [
        120.77454376220703,
        554.9934692382812,
        142.72265625,
        568.2160034179688
      ],
      "braille_bbox": [
        171.62698364257812,
        554.9934692382812,
        211.30201721191406,
        567.1242065429688
      ],
      "expected_dots": [
        "16",
        "145",
        "135",
        "2"
      ]
    },
    {
      "text": "자연",
      "source_ascii": ".<*",
      "printed_page": 10,
      "source_bbox": [
        242.26869201660156,
        554.9934692382812,
        264.33673095703125,
        568.2160034179688
      ],
      "braille_bbox": [
        281.9671936035156,
        554.9934692382812,
        311.68731689453125,
        567.1242065429688
      ],
      "expected_dots": [
        "46",
        "126",
        "16"
      ]
    },
    {
      "text": "열매",
      "source_ascii": "|er",
      "printed_page": 10,
      "source_bbox": [
        352.60888671875,
        554.9934692382812,
        374.67694091796875,
        568.2160034179688
      ],
      "braille_bbox": [
        403.4613342285156,
        554.9934692382812,
        433.3017578125,
        567.1242065429688
      ],
      "expected_dots": [
        "1256",
        "15",
        "1235"
      ]
    },
    {
      "text": "가열",
      "source_ascii": "$|",
      "printed_page": 10,
      "source_bbox": [
        120.77454376220703,
        577.2891235351562,
        142.72232055664062,
        590.5116577148438
      ],
      "braille_bbox": [
        171.62698364257812,
        577.2891235351562,
        191.5124969482422,
        589.4198608398438
      ],
      "expected_dots": [
        "1246",
        "1256"
      ]
    },
    {
      "text": "영어",
      "source_ascii": "}s",
      "printed_page": 10,
      "source_bbox": [
        242.26869201660156,
        577.2891235351562,
        264.33673095703125,
        590.5116577148438
      ],
      "braille_bbox": [
        281.9671936035156,
        577.2891235351562,
        301.732421875,
        589.4198608398438
      ],
      "expected_dots": [
        "12456",
        "234"
      ]
    },
    {
      "text": "환영",
      "source_ascii": "jv3}",
      "printed_page": 10,
      "source_bbox": [
        352.60888671875,
        577.2891235351562,
        374.67694091796875,
        590.5116577148438
      ],
      "braille_bbox": [
        403.4613342285156,
        577.2891235351562,
        443.13641357421875,
        589.4198608398438
      ],
      "expected_dots": [
        "245",
        "1236",
        "25",
        "12456"
      ]
    },
    {
      "text": "옥수수",
      "source_ascii": "x,m,m",
      "printed_page": 10,
      "source_bbox": [
        120.77454376220703,
        599.584716796875,
        153.75665283203125,
        612.8072509765625
      ],
      "braille_bbox": [
        171.62698364257812,
        599.584716796875,
        221.25692749023438,
        611.7154541015625
      ],
      "expected_dots": [
        "1346",
        "6",
        "134",
        "6",
        "134"
      ]
    },
    {
      "text": "가옥",
      "source_ascii": "$x",
      "printed_page": 10,
      "source_bbox": [
        242.26869201660156,
        599.584716796875,
        264.33673095703125,
        612.8072509765625
      ],
      "braille_bbox": [
        281.9671936035156,
        599.584716796875,
        301.732421875,
        611.7154541015625
      ],
      "expected_dots": [
        "1246",
        "1346"
      ]
    },
    {
      "text": "온도",
      "source_ascii": "(iu",
      "printed_page": 10,
      "source_bbox": [
        352.60888671875,
        599.584716796875,
        374.67694091796875,
        612.8072509765625
      ],
      "braille_bbox": [
        403.4613342285156,
        599.584716796875,
        433.3017578125,
        611.7154541015625
      ],
      "expected_dots": [
        "12356",
        "24",
        "136"
      ]
    },
    {
      "text": "오리온",
      "source_ascii": "u\"o(",
      "printed_page": 10,
      "source_bbox": [
        120.77454376220703,
        621.88037109375,
        153.75665283203125,
        635.1029052734375
      ],
      "braille_bbox": [
        171.62698364257812,
        621.88037109375,
        211.30201721191406,
        634.0111083984375
      ],
      "expected_dots": [
        "136",
        "5",
        "135",
        "12356"
      ]
    },
    {
      "text": "옹고집",
      "source_ascii": "=@u.ob",
      "printed_page": 10,
      "source_bbox": [
        242.26869201660156,
        621.88037109375,
        275.3707580566406,
        635.1029052734375
      ],
      "braille_bbox": [
        281.9671936035156,
        621.88037109375,
        341.4317626953125,
        634.0111083984375
      ],
      "expected_dots": [
        "123456",
        "4",
        "136",
        "46",
        "135",
        "12"
      ]
    },
    {
      "text": "새옹지마",
      "source_ascii": ",r=.oe",
      "printed_page": 10,
      "source_bbox": [
        352.60888671875,
        621.88037109375,
        396.62506103515625,
        635.1029052734375
      ],
      "braille_bbox": [
        403.4613342285156,
        621.88037109375,
        463.04620361328125,
        634.0111083984375
      ],
      "expected_dots": [
        "6",
        "1235",
        "123456",
        "46",
        "135",
        "15"
      ]
    },
    {
      "text": "운동장",
      "source_ascii": "gi=.7",
      "printed_page": 10,
      "source_bbox": [
        120.77454376220703,
        644.176025390625,
        153.75665283203125,
        657.3985595703125
      ],
      "braille_bbox": [
        171.62698364257812,
        644.176025390625,
        221.25692749023438,
        656.3067626953125
      ],
      "expected_dots": [
        "1245",
        "24",
        "123456",
        "46",
        "2356"
      ]
    },
    {
      "text": "행운",
      "source_ascii": "jr7g",
      "printed_page": 10,
      "source_bbox": [
        242.26869201660156,
        644.176025390625,
        264.33673095703125,
        657.3985595703125
      ],
      "braille_bbox": [
        281.9671936035156,
        644.176025390625,
        321.6422119140625,
        656.3067626953125
      ],
      "expected_dots": [
        "245",
        "1235",
        "2356",
        "1245"
      ]
    },
    {
      "text": "울타리",
      "source_ascii": "&h\"o",
      "printed_page": 10,
      "source_bbox": [
        352.60888671875,
        644.176025390625,
        385.5906982421875,
        657.3985595703125
      ],
      "braille_bbox": [
        403.4613342285156,
        644.176025390625,
        443.13641357421875,
        656.3067626953125
      ],
      "expected_dots": [
        "12346",
        "125",
        "5",
        "135"
      ]
    },
    {
      "text": "겨울",
      "source_ascii": "@:&",
      "printed_page": 10,
      "source_bbox": [
        120.77454376220703,
        666.4716186523438,
        142.72232055664062,
        679.6941528320312
      ],
      "braille_bbox": [
        171.62698364257812,
        666.4716186523438,
        201.3471221923828,
        678.6023559570312
      ],
      "expected_dots": [
        "4",
        "156",
        "12346"
      ]
    },
    {
      "text": "은하수",
      "source_ascii": "zj,m",
      "printed_page": 10,
      "source_bbox": [
        242.26869201660156,
        666.4716186523438,
        275.3707580566406,
        679.6941528320312
      ],
      "braille_bbox": [
        281.9671936035156,
        666.4716186523438,
        321.6422119140625,
        678.6023559570312
      ],
      "expected_dots": [
        "1356",
        "245",
        "6",
        "134"
      ]
    },
    {
      "text": "양은",
      "source_ascii": ">7z",
      "printed_page": 10,
      "source_bbox": [
        352.60888671875,
        666.4716186523438,
        374.67694091796875,
        679.6941528320312
      ],
      "braille_bbox": [
        403.4613342285156,
        666.4716186523438,
        433.3017578125,
        678.6023559570312
      ],
      "expected_dots": [
        "345",
        "2356",
        "1356"
      ]
    },
    {
      "text": "을지로",
      "source_ascii": "!.o\"u",
      "printed_page": 10,
      "source_bbox": [
        120.77454376220703,
        688.7672729492188,
        153.75631713867188,
        701.9898071289062
      ],
      "braille_bbox": [
        171.62698364257812,
        688.7672729492188,
        221.25692749023438,
        700.8980102539062
      ],
      "expected_dots": [
        "2346",
        "46",
        "135",
        "5",
        "136"
      ]
    },
    {
      "text": "가을",
      "source_ascii": "$!",
      "printed_page": 10,
      "source_bbox": [
        242.26869201660156,
        688.7672729492188,
        264.33673095703125,
        701.9898071289062
      ],
      "braille_bbox": [
        281.9671936035156,
        688.7672729492188,
        301.732421875,
        700.8980102539062
      ],
      "expected_dots": [
        "1246",
        "2346"
      ]
    },
    {
      "text": "인내",
      "source_ascii": "qcr",
      "printed_page": 10,
      "source_bbox": [
        352.60888671875,
        688.7672729492188,
        374.67694091796875,
        701.9898071289062
      ],
      "braille_bbox": [
        403.4613342285156,
        688.7672729492188,
        433.3017578125,
        700.8980102539062
      ],
      "expected_dots": [
        "12345",
        "14",
        "1235"
      ]
    },
    {
      "text": "거인",
      "source_ascii": "@sq",
      "printed_page": 10,
      "source_bbox": [
        120.77454376220703,
        711.0629272460938,
        142.72232055664062,
        724.2854614257812
      ],
      "braille_bbox": [
        171.62698364257812,
        711.0629272460938,
        201.3471221923828,
        723.1936645507812
      ],
      "expected_dots": [
        "4",
        "234",
        "12345"
      ]
    },
    {
      "text": "것이다",
      "source_ascii": "_soi",
      "printed_page": 10,
      "source_bbox": [
        242.26869201660156,
        711.0629272460938,
        275.3707580566406,
        724.2854614257812
      ],
      "braille_bbox": [
        281.9671936035156,
        711.0629272460938,
        321.6422119140625,
        723.1936645507812
      ],
      "expected_dots": [
        "456",
        "234",
        "135",
        "24"
      ]
    },
    {
      "text": "이것",
      "source_ascii": "o_s",
      "printed_page": 10,
      "source_bbox": [
        352.60888671875,
        711.0629272460938,
        374.67694091796875,
        724.2854614257812
      ],
      "braille_bbox": [
        403.4613342285156,
        711.0629272460938,
        433.3017578125,
        723.1936645507812
      ],
      "expected_dots": [
        "135",
        "456",
        "234"
      ]
    },
    {
      "text": "덕망",
      "source_ascii": "i?e7",
      "printed_page": 11,
      "source_bbox": [
        120.77454376220703,
        162.06288146972656,
        142.72232055664062,
        175.285400390625
      ],
      "braille_bbox": [
        169.70802307128906,
        162.06288146972656,
        209.383056640625,
        174.19363403320312
      ],
      "expected_dots": [
        "24",
        "1456",
        "15",
        "2356"
      ]
    },
    {
      "text": "기적",
      "source_ascii": "@o.?",
      "printed_page": 11,
      "source_bbox": [
        258.4599304199219,
        162.06288146972656,
        280.5279541015625,
        175.285400390625
      ],
      "braille_bbox": [
        298.5182189941406,
        162.06288146972656,
        338.1932373046875,
        174.19363403320312
      ],
      "expected_dots": [
        "4",
        "135",
        "46",
        "1456"
      ]
    },
    {
      "text": "꺾다",
      "source_ascii": ",@?ai",
      "printed_page": 11,
      "source_bbox": [
        382.1129150390625,
        162.06288146972656,
        404.1809387207031,
        175.285400390625
      ],
      "braille_bbox": [
        422.17120361328125,
        162.06288146972656,
        471.8011474609375,
        174.19363403320312
      ],
      "expected_dots": [
        "6",
        "4",
        "1456",
        "1",
        "24"
      ]
    },
    {
      "text": "넋",
      "source_ascii": "c?'",
      "printed_page": 11,
      "source_bbox": [
        120.77454376220703,
        187.11550903320312,
        131.80856323242188,
        200.33802795410156
      ],
      "braille_bbox": [
        169.70802307128906,
        187.11550903320312,
        199.42816162109375,
        199.2462615966797
      ],
      "expected_dots": [
        "14",
        "1456",
        "3"
      ]
    },
    {
      "text": "건전지",
      "source_ascii": "@).).o",
      "printed_page": 11,
      "source_bbox": [
        258.4599304199219,
        187.11550903320312,
        291.5619812011719,
        200.33802795410156
      ],
      "braille_bbox": [
        298.5182189941406,
        187.11550903320312,
        357.9827880859375,
        199.2462615966797
      ],
      "expected_dots": [
        "4",
        "23456",
        "46",
        "23456",
        "46",
        "135"
      ]
    },
    {
      "text": "개천절",
      "source_ascii": "@r;).t",
      "printed_page": 11,
      "source_bbox": [
        382.1129150390625,
        187.11550903320312,
        415.09503173828125,
        200.33802795410156
      ],
      "braille_bbox": [
        422.17120361328125,
        187.11550903320312,
        481.63580322265625,
        199.2462615966797
      ],
      "expected_dots": [
        "4",
        "1235",
        "56",
        "23456",
        "46",
        "2345"
      ]
    },
    {
      "text": "얹다",
      "source_ascii": ")ki",
      "printed_page": 11,
      "source_bbox": [
        120.77454376220703,
        212.28799438476562,
        142.72265625,
        225.51051330566406
      ],
      "braille_bbox": [
        169.70802307128906,
        212.28799438476562,
        199.42816162109375,
        224.4187469482422
      ],
      "expected_dots": [
        "23456",
        "13",
        "24"
      ]
    },
    {
      "text": "벌레",
      "source_ascii": "~t\"n",
      "printed_page": 11,
      "source_bbox": [
        258.4599304199219,
        212.28799438476562,
        280.5279541015625,
        225.51051330566406
      ],
      "braille_bbox": [
        298.5182189941406,
        212.28799438476562,
        338.1932373046875,
        224.4187469482422
      ],
      "expected_dots": [
        "45",
        "2345",
        "5",
        "1345"
      ]
    },
    {
      "text": "옷걸이",
      "source_ascii": "u'@to",
      "printed_page": 11,
      "source_bbox": [
        382.1129150390625,
        212.28799438476562,
        415.09503173828125,
        225.51051330566406
      ],
      "braille_bbox": [
        422.17120361328125,
        212.28799438476562,
        471.8011474609375,
        224.4187469482422
      ],
      "expected_dots": [
        "136",
        "3",
        "4",
        "2345",
        "135"
      ]
    },
    {
      "text": "얽다",
      "source_ascii": "tai",
      "printed_page": 11,
      "source_bbox": [
        120.77454376220703,
        237.3406219482422,
        142.72265625,
        250.56314086914062
      ],
      "braille_bbox": [
        169.70802307128906,
        237.3406219482422,
        199.42816162109375,
        249.47137451171875
      ],
      "expected_dots": [
        "2345",
        "1",
        "24"
      ]
    },
    {
      "text": "젊다",
      "source_ascii": ".t5i",
      "printed_page": 11,
      "source_bbox": [
        258.4599304199219,
        237.3406219482422,
        280.5279541015625,
        250.56314086914062
      ],
      "braille_bbox": [
        298.5182189941406,
        237.3406219482422,
        338.1932373046875,
        249.47137451171875
      ],
      "expected_dots": [
        "46",
        "2345",
        "26",
        "24"
      ]
    },
    {
      "text": "넓다",
      "source_ascii": "ctbi",
      "printed_page": 11,
      "source_bbox": [
        382.1129150390625,
        237.3406219482422,
        404.1809387207031,
        250.56314086914062
      ],
      "braille_bbox": [
        422.17120361328125,
        237.3406219482422,
        461.84625244140625,
        249.47137451171875
      ],
      "expected_dots": [
        "14",
        "2345",
        "12",
        "24"
      ]
    },
    {
      "text": "변화",
      "source_ascii": "~*jv",
      "printed_page": 11,
      "source_bbox": [
        120.77454376220703,
        262.5130920410156,
        142.72232055664062,
        275.735595703125
      ],
      "braille_bbox": [
        169.70802307128906,
        262.5130920410156,
        209.383056640625,
        274.6438293457031
      ],
      "expected_dots": [
        "45",
        "16",
        "245",
        "1236"
      ]
    },
    {
      "text": "수련",
      "source_ascii": ",m\"*",
      "printed_page": 11,
      "source_bbox": [
        258.4599304199219,
        262.5130920410156,
        280.5279541015625,
        275.735595703125
      ],
      "braille_bbox": [
        298.5182189941406,
        262.5130920410156,
        338.1932373046875,
        274.6438293457031
      ],
      "expected_dots": [
        "6",
        "134",
        "5",
        "16"
      ]
    },
    {
      "text": "별자리",
      "source_ascii": "~|.\"o",
      "printed_page": 11,
      "source_bbox": [
        382.1129150390625,
        262.5130920410156,
        415.0947265625,
        275.735595703125
      ],
      "braille_bbox": [
        422.17120361328125,
        262.5130920410156,
        471.8011474609375,
        274.6438293457031
      ],
      "expected_dots": [
        "45",
        "1256",
        "46",
        "5",
        "135"
      ]
    },
    {
      "text": "헌혈",
      "source_ascii": "j)j|",
      "printed_page": 11,
      "source_bbox": [
        120.77454376220703,
        287.56573486328125,
        142.72232055664062,
        300.7882385253906
      ],
      "braille_bbox": [
        169.70802307128906,
        287.56573486328125,
        209.383056640625,
        299.69647216796875
      ],
      "expected_dots": [
        "245",
        "23456",
        "245",
        "1256"
      ]
    },
    {
      "text": "엷다",
      "source_ascii": "|bi",
      "printed_page": 11,
      "source_bbox": [
        258.4599304199219,
        287.56573486328125,
        280.5279541015625,
        300.7882385253906
      ],
      "braille_bbox": [
        298.5182189941406,
        287.56573486328125,
        328.23834228515625,
        299.69647216796875
      ],
      "expected_dots": [
        "1256",
        "12",
        "24"
      ]
    },
    {
      "text": "평화",
      "source_ascii": "d}jv",
      "printed_page": 11,
      "source_bbox": [
        382.1129150390625,
        287.56573486328125,
        404.1809387207031,
        300.7882385253906
      ],
      "braille_bbox": [
        422.17120361328125,
        287.56573486328125,
        461.84625244140625,
        299.69647216796875
      ],
      "expected_dots": [
        "145",
        "12456",
        "245",
        "1236"
      ]
    },
    {
      "text": "안녕",
      "source_ascii": "<3c}",
      "printed_page": 11,
      "source_bbox": [
        120.77454376220703,
        312.73822021484375,
        142.72265625,
        325.9607238769531
      ],
      "braille_bbox": [
        169.70802307128906,
        312.73822021484375,
        209.383056640625,
        324.86895751953125
      ],
      "expected_dots": [
        "126",
        "25",
        "14",
        "12456"
      ]
    },
    {
      "text": "복덕방",
      "source_ascii": "~xi?~7",
      "printed_page": 11,
      "source_bbox": [
        258.4599304199219,
        312.73822021484375,
        291.5619812011719,
        325.9607238769531
      ],
      "braille_bbox": [
        298.5182189941406,
        312.73822021484375,
        357.9827880859375,
        324.86895751953125
      ],
      "expected_dots": [
        "45",
        "1346",
        "24",
        "1456",
        "45",
        "2356"
      ]
    },
    {
      "text": "가곡",
      "source_ascii": "$@x",
      "printed_page": 11,
      "source_bbox": [
        382.1129150390625,
        312.73822021484375,
        404.1809387207031,
        325.9607238769531
      ],
      "braille_bbox": [
        422.17120361328125,
        312.73822021484375,
        451.891357421875,
        324.86895751953125
      ],
      "expected_dots": [
        "1246",
        "4",
        "1346"
      ]
    },
    {
      "text": "볶다",
      "source_ascii": "~xai",
      "printed_page": 11,
      "source_bbox": [
        120.77454376220703,
        337.79083251953125,
        142.72265625,
        351.0133361816406
      ],
      "braille_bbox": [
        169.70802307128906,
        337.79083251953125,
        209.383056640625,
        349.92156982421875
      ],
      "expected_dots": [
        "45",
        "1346",
        "1",
        "24"
      ]
    },
    {
      "text": "논두렁",
      "source_ascii": "c(im\"s7",
      "printed_page": 11,
      "source_bbox": [
        258.4599304199219,
        337.79083251953125,
        291.5619812011719,
        351.0133361816406
      ],
      "braille_bbox": [
        298.5182189941406,
        337.79083251953125,
        367.93768310546875,
        349.92156982421875
      ],
      "expected_dots": [
        "14",
        "12356",
        "24",
        "134",
        "5",
        "234",
        "2356"
      ]
    },
    {
      "text": "용돈",
      "source_ascii": "+7i(",
      "printed_page": 11,
      "source_bbox": [
        382.1129150390625,
        337.79083251953125,
        404.1809387207031,
        351.0133361816406
      ],
      "braille_bbox": [
        422.17120361328125,
        337.79083251953125,
        461.84625244140625,
        349.92156982421875
      ],
      "expected_dots": [
        "346",
        "2356",
        "24",
        "12356"
      ]
    },
    {
      "text": "동그라미",
      "source_ascii": "i=@{\"<eo",
      "printed_page": 11,
      "source_bbox": [
        120.77454376220703,
        362.96331787109375,
        164.79067993164062,
        376.1858215332031
      ],
      "braille_bbox": [
        169.70802307128906,
        362.96331787109375,
        249.08238220214844,
        375.09405517578125
      ],
      "expected_dots": [
        "24",
        "123456",
        "4",
        "246",
        "5",
        "126",
        "15",
        "135"
      ]
    },
    {
      "text": "탁구공",
      "source_ascii": "ha@m@=",
      "printed_page": 11,
      "source_bbox": [
        258.4599304199219,
        362.96331787109375,
        291.5619812011719,
        376.1858215332031
      ],
      "braille_bbox": [
        298.5182189941406,
        362.96331787109375,
        357.9827880859375,
        375.09405517578125
      ],
      "expected_dots": [
        "125",
        "1",
        "4",
        "134",
        "4",
        "123456"
      ]
    },
    {
      "text": "순두부",
      "source_ascii": ",gim~m",
      "printed_page": 11,
      "source_bbox": [
        382.1129150390625,
        362.96331787109375,
        415.0947265625,
        376.1858215332031
      ],
      "braille_bbox": [
        422.17120361328125,
        362.96331787109375,
        481.63580322265625,
        375.09405517578125
      ],
      "expected_dots": [
        "6",
        "1245",
        "24",
        "134",
        "45",
        "134"
      ]
    },
    {
      "text": "숭례문",
      "source_ascii": ",m7\"/eg",
      "printed_page": 11,
      "source_bbox": [
        120.77454376220703,
        388.0159606933594,
        153.75665283203125,
        401.23846435546875
      ],
      "braille_bbox": [
        169.70802307128906,
        388.0159606933594,
        239.1274871826172,
        400.1466979980469
      ],
      "expected_dots": [
        "6",
        "134",
        "2356",
        "5",
        "34",
        "15",
        "1245"
      ]
    },
    {
      "text": "불고기",
      "source_ascii": "~&@u@o",
      "printed_page": 11,
      "source_bbox": [
        258.4599304199219,
        388.0159606933594,
        291.5619812011719,
        401.23846435546875
      ],
      "braille_bbox": [
        298.5182189941406,
        388.0159606933594,
        357.9827880859375,
        400.1466979980469
      ],
      "expected_dots": [
        "45",
        "12346",
        "4",
        "136",
        "4",
        "135"
      ]
    },
    {
      "text": "일출",
      "source_ascii": "o1;&",
      "printed_page": 11,
      "source_bbox": [
        382.1129150390625,
        388.0159606933594,
        404.1809387207031,
        401.23846435546875
      ],
      "braille_bbox": [
        422.17120361328125,
        388.0159606933594,
        461.84625244140625,
        400.1466979980469
      ],
      "expected_dots": [
        "135",
        "2",
        "56",
        "12346"
      ]
    },
    {
      "text": "붉다",
      "source_ascii": "^&ai",
      "printed_page": 11,
      "source_bbox": [
        120.77454376220703,
        413.1884460449219,
        142.72265625,
        426.41094970703125
      ],
      "braille_bbox": [
        169.70802307128906,
        413.1884460449219,
        209.383056640625,
        425.3191833496094
      ],
      "expected_dots": [
        "45",
        "12346",
        "1",
        "24"
      ]
    },
    {
      "text": "굶다",
      "source_ascii": "@&5i",
      "printed_page": 11,
      "source_bbox": [
        258.4599304199219,
        413.1884460449219,
        280.5279541015625,
        426.41094970703125
      ],
      "braille_bbox": [
        298.5182189941406,
        413.1884460449219,
        338.1932373046875,
        425.3191833496094
      ],
      "expected_dots": [
        "4",
        "12346",
        "26",
        "24"
      ]
    },
    {
      "text": "훑다",
      "source_ascii": "j&8i",
      "printed_page": 11,
      "source_bbox": [
        382.1129150390625,
        413.1884460449219,
        404.1809387207031,
        426.41094970703125
      ],
      "braille_bbox": [
        422.17120361328125,
        413.1884460449219,
        461.84625244140625,
        425.3191833496094
      ],
      "expected_dots": [
        "245",
        "12346",
        "236",
        "24"
      ]
    },
    {
      "text": "근로",
      "source_ascii": "@z\"u",
      "printed_page": 11,
      "source_bbox": [
        120.77454376220703,
        438.2410583496094,
        142.72265625,
        451.46356201171875
      ],
      "braille_bbox": [
        169.70802307128906,
        438.2410583496094,
        209.383056640625,
        450.3717956542969
      ],
      "expected_dots": [
        "4",
        "1356",
        "5",
        "136"
      ]
    },
    {
      "text": "마흔",
      "source_ascii": "ejz",
      "printed_page": 11,
      "source_bbox": [
        258.4599304199219,
        438.2410583496094,
        280.5279541015625,
        451.46356201171875
      ],
      "braille_bbox": [
        298.5182189941406,
        438.2410583496094,
        328.23834228515625,
        450.3717956542969
      ],
      "expected_dots": [
        "15",
        "245",
        "1356"
      ]
    },
    {
      "text": "끊다",
      "source_ascii": ",@z0i",
      "printed_page": 11,
      "source_bbox": [
        382.1129150390625,
        438.2410583496094,
        404.1809387207031,
        451.46356201171875
      ],
      "braille_bbox": [
        422.17120361328125,
        438.2410583496094,
        471.8011474609375,
        450.3717956542969
      ],
      "expected_dots": [
        "6",
        "4",
        "1356",
        "356",
        "24"
      ]
    },
    {
      "text": "글씨",
      "source_ascii": "@!,,o",
      "printed_page": 11,
      "source_bbox": [
        120.77454376220703,
        463.4135437011719,
        142.72232055664062,
        476.63604736328125
      ],
      "braille_bbox": [
        169.70802307128906,
        463.4135437011719,
        219.3379669189453,
        475.5442810058594
      ],
      "expected_dots": [
        "4",
        "2346",
        "6",
        "6",
        "135"
      ]
    },
    {
      "text": "구슬",
      "source_ascii": "@m,!",
      "printed_page": 11,
      "source_bbox": [
        258.4599304199219,
        463.4135437011719,
        280.5279541015625,
        476.63604736328125
      ],
      "braille_bbox": [
        298.5182189941406,
        463.4135437011719,
        338.1932373046875,
        475.5442810058594
      ],
      "expected_dots": [
        "4",
        "134",
        "6",
        "2346"
      ]
    },
    {
      "text": "긁다",
      "source_ascii": "@!ai",
      "printed_page": 11,
      "source_bbox": [
        382.1129150390625,
        463.4135437011719,
        404.1809387207031,
        476.63604736328125
      ],
      "braille_bbox": [
        422.17120361328125,
        463.4135437011719,
        461.84625244140625,
        475.5442810058594
      ],
      "expected_dots": [
        "4",
        "2346",
        "1",
        "24"
      ]
    },
    {
      "text": "읊다",
      "source_ascii": "!4i",
      "printed_page": 11,
      "source_bbox": [
        120.77454376220703,
        488.4661865234375,
        142.72265625,
        501.6886901855469
      ],
      "braille_bbox": [
        169.70802307128906,
        488.4661865234375,
        199.42816162109375,
        500.596923828125
      ],
      "expected_dots": [
        "2346",
        "256",
        "24"
      ]
    },
    {
      "text": "끓다",
      "source_ascii": ",@!0i",
      "printed_page": 11,
      "source_bbox": [
        258.4599304199219,
        488.4661865234375,
        280.5279541015625,
        501.6886901855469
      ],
      "braille_bbox": [
        298.5182189941406,
        488.4661865234375,
        348.148193359375,
        500.596923828125
      ],
      "expected_dots": [
        "6",
        "4",
        "2346",
        "356",
        "24"
      ]
    },
    {
      "text": "진실",
      "source_ascii": ".q,o1",
      "printed_page": 11,
      "source_bbox": [
        382.1129150390625,
        488.4661865234375,
        404.1809387207031,
        501.6886901855469
      ],
      "braille_bbox": [
        422.17120361328125,
        488.4661865234375,
        471.8011474609375,
        500.596923828125
      ],
      "expected_dots": [
        "46",
        "12345",
        "6",
        "135",
        "2"
      ]
    },
    {
      "text": "어린이",
      "source_ascii": "s\"qo",
      "printed_page": 11,
      "source_bbox": [
        120.77454376220703,
        513.638671875,
        153.75665283203125,
        526.8612060546875
      ],
      "braille_bbox": [
        169.70802307128906,
        513.638671875,
        209.383056640625,
        525.7694091796875
      ],
      "expected_dots": [
        "234",
        "5",
        "12345",
        "135"
      ]
    },
    {
      "text": "까치",
      "source_ascii": ",$;o",
      "printed_page": 11,
      "source_bbox": [
        120.77454376220703,
        624.0380249023438,
        142.72232055664062,
        637.2605590820312
      ],
      "braille_bbox": [
        168.98841857910156,
        624.0380249023438,
        208.6634521484375,
        636.1687622070312
      ],
      "expected_dots": [
        "6",
        "1246",
        "56",
        "135"
      ]
    },
    {
      "text": "깡충깡충",
      "source_ascii": ",$7;m7,$7;m7",
      "printed_page": 11,
      "source_bbox": [
        251.14389038085938,
        624.0380249023438,
        295.15972900390625,
        637.2605590820312
      ],
      "braille_bbox": [
        310.7515869140625,
        624.0380249023438,
        429.70501708984375,
        636.1687622070312
      ],
      "expected_dots": [
        "6",
        "1246",
        "2356",
        "56",
        "134",
        "2356",
        "6",
        "1246",
        "2356",
        "56",
        "134",
        "2356"
      ]
    },
    {
      "text": "싸리나무",
      "source_ascii": ",l\"ocem",
      "printed_page": 11,
      "source_bbox": [
        120.77454376220703,
        649.0906372070312,
        164.79067993164062,
        662.3131713867188
      ],
      "braille_bbox": [
        168.98841857910156,
        649.0906372070312,
        238.40762329101562,
        661.2213745117188
      ],
      "expected_dots": [
        "6",
        "123",
        "5",
        "135",
        "14",
        "15",
        "134"
      ]
    },
    {
      "text": "쌍둥이",
      "source_ascii": ",l7im7o",
      "printed_page": 11,
      "source_bbox": [
        251.14389038085938,
        649.0906372070312,
        284.2459411621094,
        662.3131713867188
      ],
      "braille_bbox": [
        310.7515869140625,
        649.0906372070312,
        380.17108154296875,
        661.2213745117188
      ],
      "expected_dots": [
        "6",
        "123",
        "2356",
        "24",
        "134",
        "2356",
        "135"
      ]
    },
    {
      "text": "힘껏",
      "source_ascii": "jo5,_s",
      "printed_page": 11,
      "source_bbox": [
        120.77454376220703,
        676.1378784179688,
        142.15185546875,
        687.1658325195312
      ],
      "braille_bbox": [
        168.98841857910156,
        674.2631225585938,
        228.45297241210938,
        686.3938598632812
      ],
      "expected_dots": [
        "245",
        "135",
        "26",
        "6",
        "456",
        "234"
      ]
    },
    {
      "text": "마음껏",
      "source_ascii": "e<{5,_s",
      "printed_page": 11,
      "source_bbox": [
        251.14389038085938,
        674.2631225585938,
        284.2459411621094,
        687.4856567382812
      ],
      "braille_bbox": [
        310.7515869140625,
        674.2631225585938,
        380.17108154296875,
        686.3938598632812
      ],
      "expected_dots": [
        "15",
        "126",
        "246",
        "26",
        "6",
        "456",
        "234"
      ]
    },
    {
      "text": "성가",
      "source_ascii": ",}$",
      "printed_page": 12,
      "source_bbox": [
        120.77454376220703,
        211.8085174560547,
        142.72232055664062,
        225.03103637695312
      ],
      "braille_bbox": [
        157.4746551513672,
        211.8085174560547,
        187.19479370117188,
        223.93927001953125
      ],
      "expected_dots": [
        "6",
        "12456",
        "1246"
      ]
    },
    {
      "text": "말썽",
      "source_ascii": "e1,,]",
      "printed_page": 12,
      "source_bbox": [
        225.3578643798828,
        211.8085174560547,
        247.4259033203125,
        225.03103637695312
      ],
      "braille_bbox": [
        262.0579833984375,
        211.8085174560547,
        311.68792724609375,
        223.93927001953125
      ],
      "expected_dots": [
        "15",
        "2",
        "6",
        "6",
        "12456"
      ]
    },
    {
      "text": "정성",
      "source_ascii": ".},}",
      "printed_page": 12,
      "source_bbox": [
        324.3042297363281,
        211.8085174560547,
        346.3722839355469,
        225.03103637695312
      ],
      "braille_bbox": [
        361.124267578125,
        211.8085174560547,
        400.79931640625,
        223.93927001953125
      ],
      "expected_dots": [
        "46",
        "12456",
        "6",
        "12456"
      ]
    },
    {
      "text": "어정쩡",
      "source_ascii": "s.},.}",
      "printed_page": 12,
      "source_bbox": [
        120.77454376220703,
        236.9810028076172,
        153.75665283203125,
        250.20352172851562
      ],
      "braille_bbox": [
        157.4746551513672,
        236.9810028076172,
        216.939208984375,
        249.11175537109375
      ],
      "expected_dots": [
        "234",
        "46",
        "12456",
        "6",
        "46",
        "12456"
      ]
    },
    {
      "text": "청년",
      "source_ascii": ";}c*",
      "printed_page": 12,
      "source_bbox": [
        225.3578643798828,
        236.9810028076172,
        247.4259033203125,
        250.20352172851562
      ],
      "braille_bbox": [
        262.0579833984375,
        236.9810028076172,
        301.7330322265625,
        249.11175537109375
      ],
      "expected_dots": [
        "56",
        "12456",
        "14",
        "16"
      ]
    },
    {
      "text": "얄라셩",
      "source_ascii": ">1\"<,:7",
      "printed_page": 12,
      "source_bbox": [
        324.3042297363281,
        236.9810028076172,
        357.40631103515625,
        250.20352172851562
      ],
      "braille_bbox": [
        361.124267578125,
        236.9810028076172,
        430.54376220703125,
        249.11175537109375
      ],
      "expected_dots": [
        "345",
        "2",
        "5",
        "126",
        "6",
        "156",
        "2356"
      ]
    },
    {
      "text": "그래서인지",
      "source_ascii": "asq.o",
      "printed_page": 13,
      "source_bbox": [
        120.77454376220703,
        209.4111328125,
        175.7041015625,
        222.63365173339844
      ],
      "braille_bbox": [
        195.61398315429688,
        209.4111328125,
        245.24392700195312,
        221.54188537597656
      ],
      "expected_dots": [
        "1",
        "234",
        "12345",
        "46",
        "135"
      ]
    },
    {
      "text": "그러나저러나",
      "source_ascii": "ac.s\"sc",
      "printed_page": 13,
      "source_bbox": [
        281.9671936035156,
        209.4111328125,
        347.9307861328125,
        222.63365173339844
      ],
      "braille_bbox": [
        362.5635070800781,
        209.4111328125,
        431.98297119140625,
        221.54188537597656
      ],
      "expected_dots": [
        "1",
        "14",
        "46",
        "234",
        "5",
        "234",
        "14"
      ]
    },
    {
      "text": "그러면서",
      "source_ascii": "a3,s",
      "printed_page": 13,
      "source_bbox": [
        120.77454376220703,
        231.70677185058594,
        164.79034423828125,
        244.92929077148438
      ],
      "braille_bbox": [
        195.61398315429688,
        231.70677185058594,
        235.2890167236328,
        243.8375244140625
      ],
      "expected_dots": [
        "1",
        "25",
        "6",
        "234"
      ]
    },
    {
      "text": "그런데도",
      "source_ascii": "aniu",
      "printed_page": 13,
      "source_bbox": [
        281.9671936035156,
        231.70677185058594,
        325.98333740234375,
        244.92929077148438
      ],
      "braille_bbox": [
        362.5635070800781,
        231.70677185058594,
        402.238525390625,
        243.8375244140625
      ],
      "expected_dots": [
        "1",
        "1345",
        "24",
        "136"
      ]
    },
    {
      "text": "그리하여도",
      "source_ascii": "a:iu",
      "printed_page": 13,
      "source_bbox": [
        120.77454376220703,
        254.00241088867188,
        175.7041015625,
        267.22491455078125
      ],
      "braille_bbox": [
        195.61398315429688,
        254.00241088867188,
        235.2890167236328,
        266.1331481933594
      ],
      "expected_dots": [
        "1",
        "156",
        "24",
        "136"
      ]
    },
    {
      "text": "오그리고",
      "source_ascii": "u@{\"o@u",
      "printed_page": 13,
      "source_bbox": [
        120.77454376220703,
        384.0602722167969,
        164.79034423828125,
        397.28277587890625
      ],
      "braille_bbox": [
        181.46165466308594,
        384.0602722167969,
        250.88111877441406,
        396.1910095214844
      ],
      "expected_dots": [
        "136",
        "4",
        "246",
        "5",
        "135",
        "4",
        "136"
      ]
    },
    {
      "text": "우그리고",
      "source_ascii": "m@{\"o@u",
      "printed_page": 13,
      "source_bbox": [
        293.2410583496094,
        384.0602722167969,
        337.25689697265625,
        397.28277587890625
      ],
      "braille_bbox": [
        354.0481262207031,
        384.0602722167969,
        423.46759033203125,
        396.1910095214844
      ],
      "expected_dots": [
        "134",
        "4",
        "246",
        "5",
        "135",
        "4",
        "136"
      ]
    },
    {
      "text": "쭈그리고",
      "source_ascii": ",.m@{\"o@u",
      "printed_page": 13,
      "source_bbox": [
        120.77454376220703,
        406.35589599609375,
        164.79034423828125,
        419.5783996582031
      ],
      "braille_bbox": [
        181.46165466308594,
        406.35589599609375,
        270.7908935546875,
        418.48663330078125
      ],
      "expected_dots": [
        "6",
        "46",
        "134",
        "4",
        "246",
        "5",
        "135",
        "4",
        "136"
      ]
    },
    {
      "text": "찡그리고",
      "source_ascii": ",.o7@{\"o@u",
      "printed_page": 13,
      "source_bbox": [
        293.2410583496094,
        406.35589599609375,
        337.25689697265625,
        419.5783996582031
      ],
      "braille_bbox": [
        354.0481262207031,
        406.35589599609375,
        453.2120361328125,
        418.48663330078125
      ],
      "expected_dots": [
        "6",
        "46",
        "135",
        "2356",
        "4",
        "246",
        "5",
        "135",
        "4",
        "136"
      ]
    }
  ],
  "excluded_non_examples": [
    {
      "text": "온표",
      "source_ascii": "=",
      "printed_page": 6,
      "source_bbox": [
        417.1339111328125,
        277.0172424316406,
        439.08203125,
        290.23974609375
      ],
      "braille_bbox": [
        444.7189636230469,
        277.0172424316406,
        454.64959716796875,
        289.1479797363281
      ]
    },
    {
      "text": "때에는",
      "source_ascii": "_",
      "printed_page": 7,
      "source_bbox": [
        345.7726135253906,
        432.36749267578125,
        378.7544250488281,
        445.5899963378906
      ],
      "braille_bbox": [
        384.271728515625,
        432.36749267578125,
        394.20233154296875,
        444.49822998046875
      ]
    },
    {
      "text": "의약자",
      "source_ascii": "}",
      "printed_page": 12,
      "source_bbox": [
        85.0339126586914,
        165.89869689941406,
        123.53305053710938,
        179.1212158203125
      ],
      "braille_bbox": [
        128.9301300048828,
        165.89869689941406,
        138.86074829101562,
        178.02944946289062
      ]
    }
  ]
}
```

## firmware/tests/syllable_oracle_2024.py

```python
"""Independent, rule-derived Hangul oracle for exhaustive tests.

This uses Python's Unicode NFD and written jamo keys, not the firmware's
integer tables, arithmetic decomposition, or translate() output. Dot facts are
transcribed in the official PDF font encoding. This is a second implementation
of our reading of clauses 1-17/44, NOT an independently certified translator.
Generated cases are rule-derived checks, not direct official-example PASSes.
"""
from pathlib import Path
import struct
import unicodedata
from cases_2024 import ASCII_DOTS

INITIAL = dict(zip('ᄀᄁᄂᄃᄄᄅᄆᄇᄈᄉᄊᄋᄌᄍᄎᄏᄐᄑᄒ',
    ['@',',@','c','i',',i','"','e','^',',^',',',',,','','.',',.',';','f','h','d','j']))
VOWEL = dict(zip('ᅡᅢᅣᅤᅥᅦᅧᅨᅩᅪᅫᅬᅭᅮᅯᅰᅱᅲᅳᅴᅵ',
    ['<','r','>','>r','s','n',':','/','u','v','vr','y','+','m','p','pr','mr','%','[','w','o']))
# Split final clusters into written jamo, independently of firmware final indexes.
TAIL_LETTERS = dict(zip('ᆨᆩᆪᆫᆬᆭᆮᆯᆰᆱᆲᆳᆴᆵᆶᆷᆸᆹᆺᆻᆼᆽᆾᆿᇀᇁᇂ',
    ['ㄱ','ㄱㄱ','ㄱㅅ','ㄴ','ㄴㅈ','ㄴㅎ','ㄷ','ㄹ','ㄹㄱ','ㄹㅁ','ㄹㅂ','ㄹㅅ',
     'ㄹㅌ','ㄹㅍ','ㄹㅎ','ㅁ','ㅂ','ㅂㅅ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']))
FINAL = dict(zip('ㄱㄴㄷㄹㅁㅂㅅㅆㅇㅈㅊㅋㅌㅍㅎ', ['a','3','9','1','5','b',"'",'/','7','k','2','6','8','4','0']))
# K15, printed pp.10-11. Keys use vowels as Unicode NFD letters + final letters.
VC = {'ᅥㄱ':'?','ᅥㄴ':')','ᅥㄹ':'t','ᅧㄴ':'*','ᅧㄹ':'|','ᅧㅇ':'}',
      'ᅩㄱ':'x','ᅩㄴ':'(','ᅩㅇ':'=','ᅮㄴ':'g','ᅮㄹ':'&','ᅳㄴ':'z','ᅳㄹ':'!','ᅵㄴ':'q'}
A = dict(zip('ᄀᄁᄂᄃᄄᄆᄇᄈᄉᄊᄌᄍᄏᄐᄑᄒ',
    ['$',',$','c','i',',i','e','^',',^','l',',l','.',',.','f','h','d','j']))
NO_A_BEFORE_VOWEL = set('ᄂᄃᄄᄆᄇᄈᄌᄍᄏᄐᄑᄒ')
SEONG = {'성':',}', '썽':',,}', '정':'.}', '쩡':',.}', '청':';}'}
SYEONG = set('셩쎵졍쪙쳥')

def ascii_cells(text):
    return bytes(sum(1 << (int(n)-1) for n in ASCII_DOTS[c.upper()]) if ASCII_DOTS[c.upper()] != '0' else 0
                 for c in text)

def spelling(syllable, before_vowel=False):
    letters = unicodedata.normalize('NFD', syllable)
    onset, vowel = letters[:2]
    final = TAIL_LETTERS.get(letters[2:] or '', '')
    if syllable in ('것', '껏'):
        return '_s' if syllable == '것' else ',_s'
    if vowel == 'ᅡ' and onset in A and syllable != '팠':
        if not (before_vowel and not final and onset in NO_A_BEFORE_VOWEL):
            return A[onset] + ''.join(FINAL[c] for c in final)
    if syllable in SEONG:
        return SEONG[syllable]
    if final and syllable not in SYEONG and vowel + final[0] in VC:
        return INITIAL[onset] + VC[vowel + final[0]] + ''.join(FINAL[c] for c in final[1:])
    return INITIAL[onset] + VOWEL[vowel] + ''.join(FINAL[c] for c in final)

def record(syllable):
    letters = unicodedata.normalize('NFD', syllable)
    onset, vowel = letters[:2]
    tail = letters[2:]
    # Previous-vowel class: 0=closed, 1=other open, 2=야/와/우/워 open.
    left = 0 if tail else (2 if vowel in 'ᅣᅪᅮᅯ' else 1)
    # Following-vowel class: 1=예, 2=애 with silent initial; else 0.
    right = (1 if vowel == 'ᅨ' else 2 if vowel == 'ᅢ' else 0) if onset == 'ᄋ' else 0
    numeric_space = onset in 'ᄂᄃᄆᄏᄐᄑᄒ' or (onset == 'ᄋ' and vowel == 'ᅮ' and tail and TAIL_LETTERS[tail].startswith('ㄴ'))
    return ascii_cells(spelling(syllable)), ascii_cells(spelling(syllable, True)), bytes([
        left, right, int(onset == 'ᄋ'), int(bool(numeric_space))])

def write_oracle(path):
    rows = [record(chr(cp)) for cp in range(0xac00, 0xd7a4)]
    data = bytearray(b'ELG1' + struct.pack('<I', len(rows)))
    for plain, before, metadata in rows:
        data += bytes([len(plain)]) + plain + bytes([len(before)]) + before + metadata
    Path(path).write_bytes(data)
    return len(rows)

if __name__ == '__main__':
    import sys
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.firmware-build/hangul-oracle.bin')
    print('Generated', write_oracle(target), 'rule-derived oracles:', target)
```

## firmware/tests/deep_test.cpp

```cpp
#include <algorithm>
#include <array>
#include <chrono>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
#include "../earlink/BrailleText.h"
#include "../earlink/Protocol.h"
#include "../earlink/Pager.h"
#include "../earlink/BrailleMapping.h"

using Clock = std::chrono::steady_clock;
using earlink::Translation;
static uint64_t assertions = 0, translations = 0, pairs = 0, fuzzy = 0, protocolSteps = 0, pagerSteps = 0;
static const auto started = Clock::now();
static auto lastProgress = started;
static std::string phase;
static uint64_t randomState = 0x4541524c494e4b24ULL;
static uint64_t random64() {
  randomState ^= randomState << 13; randomState ^= randomState >> 7; randomState ^= randomState << 17;
  return randomState;
}
static double seconds() { return std::chrono::duration<double>(Clock::now() - started).count(); }
static void check(bool condition, const char* reason) {
  ++assertions;
  if (!condition) throw std::runtime_error(reason);
}
static void progress(bool force = false) {
  if (force || Clock::now() - lastProgress >= std::chrono::seconds(5)) {
    std::cout << "phase=" << phase << " elapsed=" << seconds() << "s pairs=" << pairs
              << " translations=" << translations << " fuzz=" << fuzzy << std::endl;
    lastProgress = Clock::now();
  }
}
static void appendUtf8(std::string& s, uint32_t cp) {
  if (cp < 0x80) s += char(cp);
  else if (cp < 0x800) { s += char(0xc0 | (cp >> 6)); s += char(0x80 | (cp & 63)); }
  else if (cp < 0x10000) {
    s += char(0xe0 | (cp >> 12)); s += char(0x80 | ((cp >> 6) & 63)); s += char(0x80 | (cp & 63));
  } else {
    s += char(0xf0 | (cp >> 18)); s += char(0x80 | ((cp >> 12) & 63));
    s += char(0x80 | ((cp >> 6) & 63)); s += char(0x80 | (cp & 63));
  }
}
static std::string encoded(uint32_t cp) { std::string result; appendUtf8(result, cp); return result; }
struct Oracle {
  std::string text;
  std::vector<uint8_t> plain, before;
  uint8_t left = 0, right = 0, silent = 0, numericSpace = 0;
};
static std::vector<Oracle> loadOracle(const char* path) {
  std::ifstream file(path, std::ios::binary);
  char header[8]{}; file.read(header, 8);
  check(file.good() && std::string(header, 4) == "ELG1", "oracle header");
  const unsigned count = uint8_t(header[4]) | (unsigned(uint8_t(header[5])) << 8);
  check(count == 11172 && header[6] == 0 && header[7] == 0, "oracle length");
  std::vector<Oracle> records(count);
  for (unsigned i = 0; i < count; ++i) {
    auto& r = records[i]; r.text = encoded(0xac00 + i);
    for (auto* cells : {&r.plain, &r.before}) {
      const int length = file.get(); check(length > 0 && length <= 6, "oracle cell length");
      for (int j = 0; j < length; ++j) { const int c = file.get(); check(c >= 0 && c < 64, "oracle cell mask"); cells->push_back(uint8_t(c)); }
    }
    r.left = uint8_t(file.get()); r.right = uint8_t(file.get());
    r.silent = uint8_t(file.get()); r.numericSpace = uint8_t(file.get());
    check(r.left < 3 && r.right < 3 && r.silent < 2 && r.numericSpace < 2 && file.good(), "oracle metadata");
  }
  check(file.get() == EOF, "oracle trailing data");
  return records;
}
static bool separator(const Oracle& left, const Oracle& right) {
  // Independently authored K11/K12 class truth table. No firmware table consulted.
  static const bool needs[3][3] = {{false,false,false},{false,true,false},{false,true,true}};
  return needs[left.left][right.right];
}
static void compare(const std::string& text, const uint8_t* expected, size_t count, const char* context) {
  ++translations;
  const auto result = earlink::translate(text);
  if (result.unsupported || result.cells.size() != count || !std::equal(result.cells.begin(), result.cells.end(), expected)) {
    std::cerr << "Mismatch " << context << " input(hex)=";
    for (unsigned char c : text) std::cerr << std::hex << unsigned(c) << ' ';
    std::cerr << " expected=";
    for (size_t i = 0; i < count; ++i) std::cerr << unsigned(expected[i]) << ',';
    std::cerr << " actual=";
    for (auto c : result.cells) std::cerr << unsigned(c) << ',';
    std::cerr << std::dec << " unsupported=" << result.unsupported << std::endl;
    throw std::runtime_error(context);
  }
  ++assertions;
}
static std::vector<uint8_t> joined(const std::vector<Oracle>& all, const std::vector<uint32_t>& cps) {
  std::vector<uint8_t> out;
  for (size_t i = 0; i < cps.size(); ++i) {
    const auto& r = all[cps[i] - 0xac00];
    if (i && separator(all[cps[i-1] - 0xac00], r)) out.push_back(36);
    const auto& cells = i + 1 < cps.size() && all[cps[i+1] - 0xac00].silent ? r.before : r.plain;
    out.insert(out.end(), cells.begin(), cells.end());
  }
  return out;
}
static void oracleChecks(const std::vector<Oracle>& all, bool fullMatrix) {
  phase = "all-syllables-and-numbers"; progress(true);
  static const uint8_t digits[10] = {26,1,3,9,25,17,11,27,19,10};
  for (const auto& r : all) {
    compare(r.text, r.plain.data(), r.plain.size(), "K1-K17 standalone syllable");
    for (unsigned digit = 0; digit < 10; ++digit) {
      std::vector<uint8_t> expected = {60, digits[digit]};
      if (r.numericSpace) expected.push_back(0);
      expected.insert(expected.end(), r.plain.begin(), r.plain.end());
      compare(std::string(1, char('0' + digit)) + r.text, expected.data(), expected.size(), "K44 numeric prefix");
    }
  }
  phase = fullMatrix ? "all-124813584-syllable-pairs" : "sampled-syllable-pairs";
  progress(true);
  for (size_t i = 0; i < all.size(); ++i) {
    const auto& left = all[i];
    for (size_t j = 0; j < all.size(); ++j) {
      if (!fullMatrix && j % 127 != i % 127) continue;
      const auto& right = all[j];
      std::array<uint8_t, 13> expected{};
      const auto& first = right.silent ? left.before : left.plain;
      auto end = std::copy(first.begin(), first.end(), expected.begin());
      if (separator(left, right)) *end++ = 36;
      end = std::copy(right.plain.begin(), right.plain.end(), end);
      compare(left.text + right.text, expected.data(), size_t(end - expected.begin()), "K11-K17 adjacent syllables");
      ++pairs;
    }
    if (i % 128 == 0) progress();
  }
  // All modern syllables attached BEFORE each complete abbreviation must
  // prevent K18, regardless of whether the suffix happens to look identical.
  phase = "K18-all-Hangul-prefixes"; progress(true);
  const std::array<std::vector<uint32_t>, 7> words = {{
    {0xadf8,0xb798,0xc11c},{0xadf8,0xb7ec,0xb098},{0xadf8,0xb7ec,0xba74},
    {0xadf8,0xb7ec,0xbbc0,0xb85c},{0xadf8,0xb7f0,0xb370},{0xadf8,0xb9ac,0xace0},
    {0xadf8,0xb9ac,0xd558,0xc5ec}
  }};
  for (uint32_t cp = 0xac00; cp <= 0xd7a3; ++cp) {
    for (const auto& word : words) {
      std::vector<uint32_t> cps{cp}; cps.insert(cps.end(), word.begin(), word.end());
      const auto expected = joined(all, cps);
      std::string text; for (const auto letter : cps) appendUtf8(text, letter);
      compare(text, expected.data(), expected.size(), "K18 no abbreviation after Hangul prefix");
    }
  }
}
struct AuditProbe { size_t bytes = 0; unsigned issues = 0; };
static void probe(const earlink::Audit& e, void* user) {
  auto& p = *static_cast<AuditProbe*>(user);
  check(e.byteOffset <= p.bytes && e.characterOffset <= p.bytes, "audit source bounds");
  check(e.cellBegin <= e.cellEnd && e.cellEnd <= earlink::MAX_TRANSLATION_CELLS, "audit cell bounds");
  if (e.issue) ++p.issues;
}
static void invariants(const std::string& text) {
  const auto measured = earlink::measureTranslation(text);
  AuditProbe audit{text.size(), 0};
  const auto result = earlink::translate(text, probe, &audit); ++translations;
  check(measured.cells == result.cells.size() && measured.unsupported == result.unsupported, "measurement/output mismatch");
  check(audit.issues == result.unsupported, "diagnostic count mismatch");
  check(result.cells.size() <= earlink::MAX_TRANSLATION_CELLS, "output limit exceeded");
  for (const auto c : result.cells) check(c < 64, "not a six-dot cell");
  if (text.size() > earlink::MAX_TEXT_BYTES) check(result.unsupported && result.cells.empty(), "input oversize not rejected");
  earlink::Message m; m.id = 1; m.translation = result;
  earlink::Pager p;
  if (result.unsupported) check(!p.enqueue(std::move(m), 0), "incomplete translation accepted by Pager");
  ++fuzzy;
}
static void utf8Checks() {
  phase = "all-Unicode-scalars-and-short-invalid-sequences"; progress(true);
  for (uint32_t cp = 0; cp <= 0x10ffff; ++cp) {
    const auto text = encoded(cp);
    const auto decoded = earlink::utf8::decode(text, 0);
    const bool scalar = cp < 0xd800 || cp > 0xdfff;
    check(decoded.valid == scalar && decoded.end == text.size(), "Unicode scalar validation");
    if (scalar) check(decoded.cp == cp, "Unicode decode/encode mismatch");
  }
  for (unsigned a = 0; a < 256; ++a) for (unsigned b = 0; b < 256; ++b)
    invariants(std::string({char(a), char(b)}));
  phase = "all-input-length-boundaries"; progress(true);
  const std::array<std::string, 7> atoms = {{"7", u8"가", u8"나이", u8"수애", "? ", "Hello ", std::string("\xf0\x80\x80\x80",4)}};
  for (const auto& atom : atoms) {
    std::string stream;
    while (stream.size() < earlink::MAX_TEXT_BYTES + 2) stream += atom;
    for (size_t size = 0; size <= earlink::MAX_TEXT_BYTES + 1; ++size) invariants(stream.substr(0, size));
  }
}
static void stateFuzz() {
  earlink::Receiver receiver;
  earlink::Pager pager;
  uint32_t now = 0xffff0000;
  std::array<uint8_t, 32> packet{};
  const size_t payloadSize = size_t(random64() % 128 + 1);
  std::string payload(payloadSize, '\0');
  for (auto& byte : payload) byte = char(random64());
  packet[0] = 0x45; packet[1] = 0x4c; packet[2] = 1; packet[3] = 1;
  packet[4] = 1; packet[5] = 2; packet[6] = uint8_t(payloadSize); packet[7] = 0;
  check(receiver.accept(packet.data(), 8, now) == earlink::NONE, "valid BEGIN rejected"); ++protocolSteps;
  for (size_t offset = 0; offset < payloadSize;) {
    const size_t length = (std::min)(size_t(random64() % 12 + 1), payloadSize - offset);
    packet[3] = 2; packet[6] = uint8_t(offset); packet[7] = uint8_t(offset >> 8);
    std::copy(payload.begin() + offset, payload.begin() + offset + length, packet.begin() + 8);
    check(receiver.accept(packet.data(), length + 8, now++) == earlink::NONE, "valid DATA rejected");
    ++protocolSteps; offset += length;
  }
  packet[3] = 3;
  check(receiver.accept(packet.data(), 6, now++) == earlink::ACCEPTED && receiver.text == payload, "valid fragmented roundtrip");
  ++protocolSteps; receiver.reset();
  for (unsigned i = 0; i < 128; ++i) {
    now += uint32_t(random64() % 10001);
    for (auto& byte : packet) byte = uint8_t(random64());
    if (i % 2) { packet[0] = 0x45; packet[1] = 0x4c; packet[2] = 1; }
    receiver.accept(packet.data(), size_t(random64() % 33), now);
    check(receiver.text.size() <= earlink::MAX_TEXT_BYTES, "Receiver grew past limit"); ++protocolSteps;
    switch (random64() % 7) {
      case 0: {
        earlink::Message m; m.id = uint16_t(random64());
        m.translation.cells.assign(size_t(random64() % 64 + 1), uint8_t(random64() & 63));
        pager.enqueue(std::move(m), now); break;
      }
      case 1: pager.next(now); break;
      case 2: pager.previous(now); break;
      case 3: pager.setAutomatic(bool(random64() & 1), now); break;
      case 4: pager.clear(); break;
      default: pager.tick(now); break;
    }
    check(pager.queued() <= 3 && pager.bufferedCells() <= earlink::MAX_BUFFERED_CELLS, "Pager queue/storage invariant");
    if (pager.active()) check(pager.page < pager.pages(), "Pager current page invalid");
    for (const auto cell : pager.output()) check(cell < 64, "Pager emitted invalid mask");
    ++pagerSteps;
  }
}
static void timedFuzz(unsigned duration) {
  phase = "seeded-mixed-input-and-state-soak"; progress(true);
  const std::array<std::string, 19> atoms = {{u8"가",u8"나이",u8"그래서",u8"오그리고",u8"아예",u8"수애",u8"ㄱ",u8"ㄸ",
    u8"😀",u8"한",u8"간","? ","Hello ","123,45.6",u8"‘’",u8"…","\r\n",std::string("\xf4\x90\x80\x80",4)," "}};
  do {
    for (unsigned i = 0; i < 64; ++i) {
      std::string text;
      if (random64() & 1) {
        const size_t count = size_t(random64() % 4098);
        text.resize(count);
        for (auto& byte : text) byte = char(random64());
      } else {
        const size_t count = size_t(random64() % 513);
        for (size_t n = 0; n < count; ++n) text += atoms[size_t(random64() % atoms.size())];
      }
      invariants(text);
    }
    stateFuzz(); progress();
  } while (seconds() < duration || fuzzy < 100000);
}
int main(int argc, char** argv) {
  if (argc != 5) return 2;
  const unsigned duration = unsigned(std::stoul(argv[3]));
  const bool fullMatrix = std::string(argv[4]) == "full";
  bool passed = true; std::string error;
  try {
    const auto oracle = loadOracle(argv[1]);
    oracleChecks(oracle, fullMatrix); utf8Checks(); timedFuzz(duration);
  } catch (const std::exception& e) { passed = false; error = e.what(); std::cerr << error << std::endl; }
  phase = passed ? "complete" : "FAILED"; progress(true);
  std::ofstream report(argv[2]);
  report << "{\n  \"passed\": " << (passed ? "true" : "false") << ",\n  \"seconds\": " << seconds()
    << ",\n  \"full_pair_matrix\": " << (fullMatrix ? "true" : "false") << ",\n  \"syllable_pairs\": " << pairs
    << ",\n  \"translation_cases\": " << translations << ",\n  \"invariant_fuzz_cases\": " << fuzzy
    << ",\n  \"protocol_steps\": " << protocolSteps << ",\n  \"pager_steps\": " << pagerSteps
    << ",\n  \"assertions\": " << assertions << ",\n  \"seed\": \"4541524c494e4b24\",\n  \"error\": \"" << error << "\"\n}\n";
  return passed ? 0 : 1;
}
```

## firmware/tests/context_test.cpp

```cpp
#include <algorithm>
#include <chrono>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
#include "../earlink/BrailleText.h"
#include "../earlink/Protocol.h"

static void require(bool ok, const char* message) { if (!ok) throw std::runtime_error(message); }
static std::string utf8(uint32_t cp) {
  std::string out;
  out += char(0xe0 | (cp >> 12)); out += char(0x80 | ((cp >> 6) & 63)); out += char(0x80 | (cp & 63));
  return out;
}
struct Record { std::vector<uint8_t> plain; bool silent, numeric; };
static uint64_t cases = 0, suffixes = 0, spaces = 0, mixed = 0, partialNfd = 0, roundtrips = 0;
static void compare(const std::string& text, const std::vector<uint8_t>& expected) {
  const auto actual = earlink::translate(text); ++cases;
  require(actual.unsupported == 0 && actual.cells == expected, "context oracle mismatch");
}
int main(int argc, char** argv) {
  if (argc != 3) return 2;
  const auto start = std::chrono::steady_clock::now();
  bool passed = false; std::string error;
  try {
    std::ifstream file(argv[1], std::ios::binary);
    char header[8]{}; file.read(header, 8);
    require(file.good() && std::string(header,4) == "ELG1", "missing independent oracle");
    std::vector<Record> records(11172);
    for (auto& r : records) {
      const int length = file.get(); require(length > 0 && length <= 6, "bad oracle length");
      for (int i = 0; i < length; ++i) { int c = file.get(); require(c >= 0 && c < 64, "bad oracle cell"); r.plain.push_back(uint8_t(c)); }
      const int before = file.get(); require(before > 0 && before <= 6, "bad before-vowel oracle");
      file.ignore(before); file.ignore(2);
      r.silent = file.get() != 0; r.numeric = file.get() != 0;
      require(file.good(), "truncated oracle");
    }
    const std::vector<std::string> words = {u8"그래서",u8"그러나",u8"그러면",u8"그러므로",u8"그런데",u8"그리고",u8"그리하여"};
    const std::vector<uint8_t> second = {14,9,18,34,29,37,49}; // K18: 234,14,25,26,1345,136,156
    // Correct 26-dot mask is 34 (dots 2+6), 156 is 49 (1+5+6).
    for (uint32_t offset = 0; offset < records.size(); ++offset) {
      const auto& r = records[offset]; const auto syllable = utf8(0xac00 + offset);
      for (size_t w = 0; w < words.size(); ++w) {
        if (!r.silent) {
          std::vector<uint8_t> expected = {1,second[w]}; expected.insert(expected.end(),r.plain.begin(),r.plain.end());
          compare(words[w]+syllable,expected); ++suffixes;
        }
        auto expected = r.plain; expected.push_back(0); expected.push_back(1); expected.push_back(second[w]);
        compare(syllable+" "+words[w],expected); ++spaces;
      }
      std::vector<uint8_t> expected = {60,1,3};
      if (r.numeric) expected.push_back(0);
      expected.insert(expected.end(),r.plain.begin(),r.plain.end());
      expected.insert(expected.end(),{60,9,25});
      if (r.numeric) expected.push_back(0);
      expected.insert(expected.end(),r.plain.begin(),r.plain.end());
      compare("12"+syllable+"34"+syllable,expected); ++mixed;
      const uint32_t tail = offset % 28;
      if (tail) { compare(utf8(0xac00+offset-tail)+utf8(0x11a7+tail),r.plain); ++partialNfd; }
    }
    // Fixed independently transcribed words, repeated as a long Korean message.
    const std::vector<std::string> text = {u8"안녕하세요",u8"대한민국",u8"강산",u8"그래서",u8"그러면서",u8"그리고",u8"학교",u8"것"};
    const std::vector<std::vector<uint8_t>> cells = {{35,18,9,59,26,32,29,44},{10,23,26,18,17,31,8,13,1},
      {43,54,7,18},{1,14},{1,18,32,14},{1,37},{26,1,8,44},{56,14}};
    std::string phrase; std::vector<uint8_t> expectedPhrase;
    for (size_t i = 0; i < text.size(); ++i) {
      phrase += text[i] + " "; expectedPhrase.insert(expectedPhrase.end(),cells[i].begin(),cells[i].end()); expectedPhrase.push_back(0);
    }
    std::string longText; std::vector<uint8_t> longExpected;
    while (longText.size()+phrase.size() <= earlink::MAX_TEXT_BYTES) {
      longText += phrase; longExpected.insert(longExpected.end(),expectedPhrase.begin(),expectedPhrase.end());
    }
    compare(longText,longExpected);
    for (size_t chunk = 1; chunk <= 12; ++chunk) {
      earlink::Receiver receiver;
      uint8_t p[20] = {0x45,0x4c,1,1,1,0,0,0};
      p[6] = uint8_t(longText.size()); p[7] = uint8_t(longText.size() >> 8);
      require(receiver.accept(p,8,0) == earlink::NONE, "long BEGIN");
      for (size_t offset = 0; offset < longText.size();) {
        const auto length = (std::min)(chunk,longText.size()-offset);
        p[3] = 2; p[6] = uint8_t(offset); p[7] = uint8_t(offset >> 8);
        std::copy(longText.begin()+offset,longText.begin()+offset+length,p+8);
        require(receiver.accept(p,length+8,uint32_t(offset)) == earlink::NONE, "long DATA"); offset += length;
      }
      p[3] = 3;
      require(receiver.accept(p,6,5000) == earlink::ACCEPTED && receiver.text == longText, "long COMMIT");
      compare(receiver.text,longExpected); ++roundtrips;
    }
    passed = true;
  } catch (const std::exception& e) { error = e.what(); std::cerr << error << '\n'; }
  const auto elapsed = std::chrono::duration<double>(std::chrono::steady_clock::now()-start).count();
  std::ofstream report(argv[2]);
  report << "{\n  \"passed\": " << (passed ? "true" : "false") << ",\n  \"cases\": " << cases
    << ",\n  \"consonant_suffixes\": " << suffixes << ",\n  \"space_boundaries\": " << spaces
    << ",\n  \"numeric_mode_resets\": " << mixed << ",\n  \"partial_nfd\": " << partialNfd
    << ",\n  \"long_packet_roundtrips\": " << roundtrips << ",\n  \"seconds\": " << elapsed
    << ",\n  \"scope\": \"rule-derived context and software checks; hardware UNVERIFIED\",\n  \"error\": \"" << error << "\"\n}\n";
  std::cout << (passed ? "PASS" : "FAIL") << ": additional context cases=" << cases << '\n';
  return passed ? 0 : 1;
}
```

## firmware/tests/run_deep_tests.py

```python
"""Exhaustive rule-derived checks and a timed native/ASan soak (no hardware).

python firmware/tests/run_deep_tests.py --seconds 600
python firmware/tests/run_deep_tests.py --seconds 600 --asan
The full 11,172 squared matrix is mandatory unless --sampled is specified.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from syllable_oracle_2024 import write_oracle

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / '.firmware-build'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--seconds', type=int, default=600)
    parser.add_argument('--asan', action='store_true')
    parser.add_argument('--sampled', action='store_true')
    args = parser.parse_args()
    if args.seconds < 0:
        parser.error('--seconds must be nonnegative')
    BUILD.mkdir(exist_ok=True)
    oracle = BUILD / 'hangul-oracle.bin'
    write_oracle(oracle)
    name = 'deep-test-asan' if args.asan else 'deep-test-release'
    extension = '.exe' if os.name == 'nt' else ''
    executable = BUILD / (name + extension)
    compiler = shutil.which('g++') or shutil.which('clang++')
    report = ROOT / 'firmware/validation' / (name + '.json')
    report.parent.mkdir(exist_ok=True)
    # A failed compiler/runtime must never leave an earlier successful report.
    report.write_text(json.dumps(dict(passed=False, error='run has not completed',
        started_utc=datetime.now(timezone.utc).isoformat()), indent=2) + '\n', encoding='utf-8')
    hashed_files = [ROOT/'firmware/tests/deep_test.cpp', ROOT/'firmware/tests/syllable_oracle_2024.py',
                   *sorted((ROOT/'firmware/earlink').glob('*.h'))]
    hashes = {str(path.relative_to(ROOT)).replace('\\','/'):
              hashlib.sha256(path.read_bytes()).hexdigest() for path in hashed_files}
    command = [str(executable), str(oracle), str(report), str(args.seconds), 'sampled' if args.sampled else 'full']
    begin = time.perf_counter()
    if compiler:
        flags = ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-O1' if args.asan else '-O2']
        if args.asan:
            flags += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-g']
        subprocess.run([compiler, *flags, str(ROOT/'firmware/tests/deep_test.cpp'), '-o', str(executable)], cwd=ROOT, check=True)
        completed = subprocess.run(command, cwd=ROOT)
    elif os.name == 'nt':
        vswhere = Path(os.environ.get('ProgramFiles(x86)', 'C:/Program Files (x86)')) / 'Microsoft Visual Studio/Installer/vswhere.exe'
        location = subprocess.run([str(vswhere), '-latest', '-products', '*', '-requires',
            'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'],
            capture_output=True, text=True, check=True).stdout.strip()
        devcmd = Path(location) / 'Common7/Tools/VsDevCmd.bat'
        flags = '/fsanitize=address /Zi /O1 /MD' if args.asan else '/O2 /MD'
        # Run inside the developer environment so the matching ASan DLL is found.
        script = BUILD / (name + '.cmd')
        script.write_text('\n'.join([
            '@echo off', f'call "{devcmd}" -arch=x64 >nul', 'if errorlevel 1 exit /b 1',
            f'cl /nologo /EHsc /std:c++17 /utf-8 /W4 /WX {flags} '
            f'/Fe:.firmware-build\\{name}.exe /Fo:.firmware-build\\{name}.obj '
            f'/Fd:.firmware-build\\{name}.pdb firmware\\tests\\deep_test.cpp',
            'if errorlevel 1 exit /b 1',
            subprocess.list2cmdline(command), 'exit /b %errorlevel%', '']), encoding='utf-8')
        completed = subprocess.run(['cmd.exe', '/d', '/c', str(script)], cwd=ROOT)
    else:
        raise RuntimeError('C++17 compiler required')
    if report.exists():
        data = json.loads(report.read_text(encoding='utf-8'))
        data.update(instrumentation='AddressSanitizer (MSVC)' if args.asan and not compiler else
                    'AddressSanitizer+UndefinedBehaviorSanitizer' if args.asan else 'optimized native',
                    requested_seconds=args.seconds, total_runner_seconds=time.perf_counter()-begin,
                    classification='rule-derived conformance + software invariants; not full official certification',
                    hardware='UNVERIFIED; software-only execution', runner_exit_code=completed.returncode,
                    source_sha256=hashes, oracle_sha256=hashlib.sha256(oracle.read_bytes()).hexdigest(),
                    finished_utc=datetime.now(timezone.utc).isoformat())
        data['passed'] = bool(data.get('passed')) and completed.returncode == 0
        report.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return completed.returncode

if __name__ == '__main__':
    sys.exit(main())
```

## firmware/tools/export_full_code.py

```python
"""Export complete copyable files, in dependency order. No ZIP or elisions."""
from pathlib import Path
import hashlib

ROOT = Path(__file__).resolve().parents[2]
FILES = [
    'firmware/earlink/Config.h',
    'firmware/earlink/EarlinkLimits.h',
    'firmware/earlink/Utf8.h',
    'firmware/earlink/BrailleRules.h',
    'firmware/earlink/BrailleText.h',
    'firmware/earlink/BrailleMapping.h',
    'firmware/earlink/BrailleOutput.h',
    'firmware/earlink/Protocol.h',
    'firmware/earlink/Pager.h',
    'firmware/earlink/ConnectionWave.h',
    'firmware/earlink/DisplayController.h',
    'firmware/earlink/earlink.ino',
    'firmware/backups/earlink-full.ino.txt',
    'firmware/backups/solenoid-all-high-hold.ino.txt',
    'firmware/tests/core_test.cpp',
    'firmware/tests/cases_2024.py',
    'firmware/tests/braille_cli.cpp',
    'firmware/tests/run_tests.py',
    'firmware/tests/official_words_2024.json',
    'firmware/tests/syllable_oracle_2024.py',
    'firmware/tests/deep_test.cpp',
    'firmware/tests/context_test.cpp',
    'firmware/tests/run_deep_tests.py',
    'firmware/tools/export_full_code.py',
    'firmware/tools/check_official_source.py',
    'firmware/tools/extract_official_words.py',
    'package.json',
    '.gitignore',
]

def main():
    lines = ['# EARLINK 파일별 전체 코드', '',
        '실제 프로젝트 파일을 그대로 읽어 생성한 문서입니다. 파일별 전체 내용을 생략 없이 수록합니다.',
        '현재 펌웨어는 2024 점역·BLE·연결 파도를 사용합니다. 문자 돌출점은 LOW, 배경은 HIGH이며 대기·종료는 전체 LOW입니다.',
        '`earlink`의 헤더 11개와 `earlink.ino`를 같은 스케치 폴더에 둡니다. `backups`는 이전 동작의 보관본이며 현재 출력 정책으로 사용하지 않습니다.',
        '지원 범위와 미구현 사항은 [RULES_2024.md](RULES_2024.md), 검증은 [결과 표](validation/BRAILLE_RESULTS.md)를 참조하세요.', '',
        '코드 수정 후 `python firmware/tools/export_full_code.py`로 다시 생성합니다.', '']
    manifest = []
    for name in FILES:
        data = (ROOT / name).read_bytes()
        content = data.decode('utf-8').replace('\r\n', '\n')
        language = 'python' if name.endswith('.py') else 'json' if name.endswith('.json') else 'cpp' if name.endswith(('.h', '.cpp', '.ino', '.ino.txt')) else 'gitignore'
        lines += [f'## {name}', '', f'```{language}', content.rstrip('\n'), '```', '']
        manifest.append(dict(path=name, sha256=hashlib.sha256(content.encode('utf-8')).hexdigest()))
    (ROOT / 'firmware/FULL_CODE.md').write_text('\n'.join(lines), encoding='utf-8')
    import json
    target = ROOT / 'firmware/validation'
    target.mkdir(exist_ok=True)
    (target / 'code-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(f'Exported {len(FILES)} complete files to firmware/FULL_CODE.md')

if __name__ == '__main__':
    main()
```

## firmware/tools/check_official_source.py

```python
"""Optional oracle audit, independent of the C++ translator and its output.

python firmware/tools/check_official_source.py --pdf ORIGINAL.pdf
Requires pypdf only for this optional source audit (not run_tests.py).
Only nonblank dot sequences are checked mechanically; spacing/layout and rule
interpretation remain separately reviewed. This is not full transcription QA.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
EXPECTED_PDF_SHA256 = 'cb04780710a4b90f93b574d47afee7c01fa4a5593ad65414ec7857cdc1327612'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pdf', required=True, type=Path)
    parser.add_argument('--pypdf-path', type=Path)
    args = parser.parse_args()
    if args.pypdf_path:
        sys.path.insert(0, str(args.pypdf_path))
    from pypdf import PdfReader
    sys.path.insert(0, str(ROOT / 'firmware/tests'))
    from cases_2024 import ASCII_DOTS, CASES
    digest = hashlib.sha256(args.pdf.read_bytes()).hexdigest()
    if digest != EXPECTED_PDF_SHA256:
        raise ValueError('This audit requires the pinned original NIKL 2024 PDF; hash differs.')
    reader = PdfReader(args.pdf)
    pages = {}
    for printed in range(3, 50):
        runs = []
        def visitor(text, cm, tm, font, size):
            if font and 'HSBRL' in str(font.get('/BaseFont', '')):
                runs.append(text)
        reader.pages[printed + 5].extract_text(visitor_text=visitor)
        # Normalize equivalent uppercase/lowercase Braille font encodings and
        # retain only known nonblank Braille glyphs. No firmware tables loaded.
        pages[printed] = [ASCII_DOTS[c.upper()] for c in ''.join(runs)
                          if c.upper() in ASCII_DOTS and ASCII_DOTS[c.upper()] != '0']
    results = []
    for index, case in enumerate(CASES):
        if case['evidence'] not in ('official-table', 'official-example', 'official-coordinate-example', 'official-example-fragment'):
            continue
        match = re.search(r'pp?\.(\d+)(?:-(\d+))?', case['clauses'])
        if not match:
            results.append(dict(case_index=index, input=case['text'], status='UNVERIFIED', reason='no pinned page'))
            continue
        start = int(match[1]); end = int(match[2] or match[1])
        expected = [p for p in case['expected_dots'] if p != '0']
        candidates = []
        for page in range(start, end + 1):
            source = pages.get(page, [])
            if any(source[at:at+len(expected)] == expected for at in range(len(source) - len(expected) + 1)):
                candidates.append(page)
        results.append(dict(case_index=index, input=case['text'], clauses=case['clauses'],
            status='MATCH' if candidates else 'UNVERIFIED', matched_printed_pages=candidates))
    summary = dict(matched=sum(r['status'] == 'MATCH' for r in results),
                   unverified=sum(r['status'] != 'MATCH' for r in results))
    output = dict(pdf_sha256=digest, summary=summary,
        method='Pinned official PDF HSBRL glyphs vs fixed test oracles. Translator output is never read.',
        limitation='Nonblank glyph-sequence presence only; not spacing, exact word alignment or semantic/rule certification.',
        cases=results)
    target = ROOT / 'firmware/validation/official-source-audit.json'
    target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(summary))
    for record in results:
        if record['status'] != 'MATCH':
            print(record['case_index'], ascii(record['input']), record.get('clauses', record.get('reason')))
    return 0 if not summary['unverified'] else 1

if __name__ == '__main__':
    sys.exit(main())
```

## firmware/tools/extract_official_words.py

```python
"""Extract same-row Korean example/font pairs from the pinned NIKL PDF.

Optional source preparation only: requires PyMuPDF for --pdf. --layout accepts
the saved font/bounding-box JSON for development. Never reads translator output.
New data must be reviewed; this tool does not edit the fixed test corpus.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
PDF_HASH = 'cb04780710a4b90f93b574d47afee7c01fa4a5593ad65414ec7857cdc1327612'

def extract(pages):
    candidates = []
    for page in pages:
        rows = {}
        for block in page['blocks']:
            for line in block.get('lines', []):
                for span in line['spans']:
                    rows.setdefault(round(span.get('origin', [0, span['bbox'][1]])[1], 1), []).append(span)
        for spans in rows.values():
            slots = []
            for span in sorted(spans, key=lambda item: item['bbox'][0]):
                text = span['text'].strip()
                if not text:
                    continue
                is_braille = 'HSBRL' in span['font']
                if slots and slots[-1]['braille'] == is_braille and span['bbox'][0] - slots[-1]['bbox'][2] < (8 if is_braille else 3):
                    slots[-1]['text'] += text
                    slots[-1]['bbox'][2] = span['bbox'][2]
                else:
                    slots.append(dict(text=text, braille=is_braille, bbox=list(span['bbox'])))
            for label, braille in zip(slots, slots[1:]):
                if not label['braille'] and braille['braille'] and re.fullmatch(r'[\uac00-\ud7a3]{1,6}', label['text']):
                    candidates.append(dict(text=label['text'], source_ascii=braille['text'].replace(' ', ''),
                        printed_page=page['printed_page'], source_bbox=label['bbox'], braille_bbox=braille['bbox']))
    return candidates

def main():
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--pdf', type=Path)
    source.add_argument('--layout', type=Path)
    parser.add_argument('--pymupdf-path', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT/'.firmware-build/rules/word-candidates.json')
    args = parser.parse_args()
    if args.pdf:
        if hashlib.sha256(args.pdf.read_bytes()).hexdigest() != PDF_HASH:
            raise ValueError('The pinned NIKL PDF hash does not match')
        if args.pymupdf_path:
            sys.path.insert(0, str(args.pymupdf_path))
        import pymupdf
        document = pymupdf.open(args.pdf)
        pages = [dict(printed_page=page, blocks=document[page+5].get_text('dict')['blocks']) for page in range(3,14)]
    else:
        pages = json.loads(args.layout.read_text(encoding='utf-8'))
    words = extract(pages)
    args.output.write_text(json.dumps(dict(pdf_sha256=PDF_HASH, review='REQUIRED',
        method='Same-row Korean label followed by HSBRL font run; retains source coordinates.',
        limitation='Word examples only; PDF-inserted ASCII spaces in glyph runs are removed, actual blank glyphs are retained.',
        words=words), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Extracted', len(words), 'candidate word/font pairs')
    for page in range(3,14):
        print(page, [(w['text'], w['source_ascii']) for w in words if w['printed_page'] == page])

if __name__ == '__main__':
    main()
```

## package.json

```json
{
  "name": "earlink-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test:earlink": "node --experimental-strip-types --test tests/earlink-protocol.test.mjs",
    "test:firmware": "python firmware/tests/run_tests.py",
    "test:firmware:deep": "python firmware/tests/run_deep_tests.py --seconds 600",
    "test:firmware:asan": "python firmware/tests/run_deep_tests.py --seconds 600 --asan"
  },
  "dependencies": {
    "@mediapipe/tasks-vision": "^0.10.35",
    "next": "16.2.12",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/web-bluetooth": "^0.0.21",
    "eslint": "^9",
    "eslint-config-next": "16.2.12",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

## .gitignore

```gitignore
# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
/node_modules
/.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files (can opt-in for committing if needed)
.env*

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts

# local firmware compiler output
/.firmware-build/
/firmware/**/__pycache__/
```
