#pragma once
#include <stdint.h>
#include <string>
#include <vector>

namespace earlink {
struct Translation {
  std::vector<uint8_t> cells;
  uint16_t unsupported = 0;
};

inline uint8_t dots(const char* numbers) {
  uint8_t mask = 0;
  for (; *numbers; ++numbers) mask |= uint8_t(1u << (*numbers - '1'));
  return mask;
}

inline void appendDots(std::vector<uint8_t>& out, const char* pattern) {
  if (!*pattern) return;
  uint8_t mask = 0;
  for (; *pattern; ++pattern) {
    if (*pattern == '-') { out.push_back(mask); mask = 0; }
    else mask |= uint8_t(1u << (*pattern - '1'));
  }
  out.push_back(mask);
}

// Modern Hangul basic, uncontracted spelling for the MVP.
// Not a full Korean/UEB literary translator; scope and sources are in README.md.
// These are dot-number facts, not PCB output-bit assignments.
inline Translation translate(const std::string& text) {
  static const char* initial[] = {
    "4", "6-4", "14", "24", "6-24", "5", "15", "45", "6-45",
    "6", "6-6", "", "46", "6-46", "56", "124", "125", "145", "245"
  };
  static const char* vowel[] = {
    "126", "1235", "345", "345-1235", "234", "1345", "156", "34",
    "136", "1236", "1236-1235", "13456", "346", "134", "1234",
    "1234-1235", "134-1235", "146", "246", "2456", "135"
  };
  static const char* final[] = {
    "", "1", "1-1", "1-3", "25", "25-13", "25-356", "35", "2",
    "2-1", "2-26", "2-12", "2-3", "2-236", "2-256", "2-356",
    "26", "12", "12-3", "3", "34", "2356", "13", "23", "235", "236", "256", "356"
  };
  static const char* latin[] = {
    "1", "12", "14", "145", "15", "124", "1245", "125", "24", "245",
    "13", "123", "134", "1345", "135", "1234", "12345", "1235", "234", "2345",
    "136", "1236", "2456", "1346", "13456", "1356"
  };
  Translation result;
  bool numbers = false, english = false;
  int previousOpenVowel = -1;
  for (size_t i = 0; i < text.size();) {
    const uint8_t first = uint8_t(text[i++]);
    uint32_t cp = first;
    int count = 0;
    uint32_t minimum = 0;
    if (first >= 0xc2 && first <= 0xdf) { count = 1; cp &= 0x1f; minimum = 0x80; }
    else if (first >= 0xe0 && first <= 0xef) { count = 2; cp &= 0x0f; minimum = 0x800; }
    else if (first >= 0xf0 && first <= 0xf4) { count = 3; cp &= 7; minimum = 0x10000; }
    else if (first >= 0x80) cp = 0xfffd;
    for (int j = 0; j < count; ++j) {
      if (i >= text.size() || (uint8_t(text[i]) & 0xc0) != 0x80) { cp = 0xfffd; break; }
      cp = (cp << 6) | (uint8_t(text[i++]) & 0x3f);
    }
    if (cp < minimum || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) cp = 0xfffd;
    const bool isLatin = (cp >= 'a' && cp <= 'z') || (cp >= 'A' && cp <= 'Z');
    const bool isDigit = cp >= '0' && cp <= '9';
    if (english && !isLatin) { appendDots(result.cells, "256"); english = false; }
    if (isDigit) {
      if (!numbers) appendDots(result.cells, "3456");
      appendDots(result.cells, latin[cp == '0' ? 9 : cp - '1']);
      numbers = true;
      previousOpenVowel = -1;
      continue;
    }
    // End a number run unambiguously before a following letter.
    if (numbers && (isLatin || (cp >= 0xac00 && cp <= 0xd7a3))) result.cells.push_back(0);
    numbers = false;
    if (cp >= 0xac00 && cp <= 0xd7a3) {
      const uint32_t offset = cp - 0xac00;
      const int l = offset / 588, v = (offset % 588) / 28, t = offset % 28;
      // Distinguish a following 예, and 야/와/우/워 + 애, from a compound/final.
      if (l == 11 && previousOpenVowel >= 0 &&
          (v == 7 || (v == 1 && (previousOpenVowel == 2 || previousOpenVowel == 9 ||
                                previousOpenVowel == 13 || previousOpenVowel == 14)))) {
        appendDots(result.cells, "36");
      }
      appendDots(result.cells, initial[l]);
      appendDots(result.cells, vowel[v]);
      appendDots(result.cells, final[t]);
      previousOpenVowel = t == 0 ? v : -1;
      continue;
    }
    previousOpenVowel = -1;
    if (isLatin) {
      if (!english) appendDots(result.cells, "356");
      english = true;
      if (cp <= 'Z') { appendDots(result.cells, "6"); cp += 'a' - 'A'; }
      appendDots(result.cells, latin[cp - 'a']);
    } else if (cp >= 0x2800 && cp <= 0x283f) {
      result.cells.push_back(uint8_t(cp - 0x2800));
    } else {
      switch (cp) {
        case ' ': case '\n': case '\r': case '\t': result.cells.push_back(0); break;
        case '.': appendDots(result.cells, "256"); break;
        case ',': appendDots(result.cells, "5"); break;
        case '?': appendDots(result.cells, "236"); break;
        case '!': appendDots(result.cells, "456"); break;
        case '-': appendDots(result.cells, "36"); break;
        default:
          // Do not silently delete unsupported content (emoji, isolated jamo, etc.).
          appendDots(result.cells, "236");
          ++result.unsupported;
      }
    }
  }
  if (english) appendDots(result.cells, "256");
  return result;
}
}
