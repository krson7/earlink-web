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
