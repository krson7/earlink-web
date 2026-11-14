#pragma once
#include <stdint.h>
#include <algorithm>
#include <cstring>
#include <string>
#include <vector>
#include "BrailleText.h"

// Braille cells typed on the Perkins keys -> UTF-8 text for the app.
//
// The forward translator (BrailleText.h) is the single source of truth. A word
// is accepted only when translate(decoded) reproduces exactly the typed cells
// with no issue, so every context rule (ㅏ omission exceptions, 36 separator,
// abbreviations, number rules) is honoured without being re-implemented here.
// Candidates are tried in preference order; the first exact match wins.
//
// Scope: Hangul syllables and contractions, the 7 abbreviation words, numbers,
// . , ? ! ... … - ~ : ; /, isolated/attached jamo (ㅋㅋ, ㅠㅠ). Anything else is
// sent as Unicode braille (U+2800 + cell), which the forward translator accepts
// back unchanged, so nothing is dropped or guessed.
//
// Inherent braille ambiguities, resolved by preference:
//  - final ㅍ/ㅌ/ㅋ use the same cell as . ? ! — at the end of a word (or before
//    more of those marks) the mark wins unless the word ends with a noun in
//    FINAL_NOUNS (앞, 끝, 부엌 ...). Inside a word the final wins (같이, 앞으로).
//  - 123456 alone is 옹 and also the isolated-jamo sign: ㅋ/ㅠ win after a
//    non-Hangul character (ㅋㅋ, ㅠㅠ), 옹 wins otherwise.
//  - ㅖ is 34 and final ㅆ is 34, so 났/녜, 탔/톄, 잤/졔 ... share cells (only 팠
//    is spelled out by the rules). The ㅆ reading wins (만났다, 탔어, 바빴다),
//    except ㅎ where 혜 wins (지혜, 은혜, 혜택) over the rare 핬.
//  - a number followed by ㄴㄷㅁㅋㅌㅍㅎ/운 is printed with a blank, so "5명"
//    comes back as "5 명".
namespace earlink {
namespace input {

inline void appendUtf8(std::string& s, uint32_t cp) {
  if (cp < 0x80) s += char(cp);
  else if (cp < 0x800) { s += char(0xc0 | (cp >> 6)); s += char(0x80 | (cp & 63)); }
  else if (cp < 0x10000) {
    s += char(0xe0 | (cp >> 12)); s += char(0x80 | ((cp >> 6) & 63)); s += char(0x80 | (cp & 63));
  } else {
    s += char(0xf0 | (cp >> 18)); s += char(0x80 | ((cp >> 12) & 63));
    s += char(0x80 | ((cp >> 6) & 63)); s += char(0x80 | (cp & 63));
  }
}
inline void appendRaw(std::string& s, const uint8_t* cells, size_t n) {
  for (size_t i = 0; i < n; ++i) appendUtf8(s, 0x2800 + (cells[i] & 0x3f));
}
// Forward translation of a candidate; returns the issue count.
inline uint16_t encode(const std::string& text, std::vector<uint8_t>& cells) {
  cells.clear();
  return detail::Translator(text, &cells).run().unsupported;
}
// Matches a rules pattern ("6-4"; "" matches zero cells) at cells[at..limit).
inline bool match(const char* pattern, const uint8_t* cells, size_t limit, size_t at, size_t& end) {
  end = at;
  if (!*pattern) return true;
  uint8_t mask = 0;
  for (;; ++pattern) {
    if (*pattern == '-' || !*pattern) {
      if (end >= limit || cells[end] != mask) return false;
      ++end; mask = 0;
      if (!*pattern) return true;
    } else if (*pattern >= '1' && *pattern <= '6') mask |= uint8_t(1u << (*pattern - '1'));
  }
}

// Nouns that really end in ㅍ/ㅌ/ㅋ and often end a word ("집 앞", "끝.").
static const char* const FINAL_NOUNS[] = {
  "앞","옆","숲","잎","늪","짚","섶","무릎","헝겊",
  "끝","밭","밑","볕","솥","팥","겉","숱","부엌","녘"
};
struct Mark { const char* text; const char* pattern; };
static const Mark MARKS[] = {
  {"...","256-256-256"},{"…","6-6-6"},{".","256"},{",","5"},{"?","236"},{"!","235"},
  {"-","36"},{"~","4-35"},{":","5-2"},{";","56-23"},{"/","456-34"}
};

enum Kind : uint8_t { START, HANGUL, ABBREVIATION, NUMBER, PUNCT, JAMO };
struct Candidate { std::string text; size_t end; Kind kind; };

class WordDecoder {
 public:
  unsigned budget = 4000; // candidate trials per word, all attempts together
  unsigned used = 0;

  // Always returns a string; Unicode braille marks the cells it could not read.
  std::string decode(const uint8_t* cells, size_t n) {
    used = 0;
    std::string text;
    if (!n) return text;
    if (search(cells, n, n, text)) return text;
    // Usually the syllable still being typed (an initial without its vowel).
    for (size_t k = 1; k <= 3 && k < n; ++k)
      if (search(cells, n, n - k, text)) { appendRaw(text, cells + n - k, k); return text; }
    text.clear(); appendRaw(text, cells, n);
    return text;
  }

 private:
  struct Frame { size_t pos; std::vector<Candidate> options; size_t next; };
  std::vector<Frame> frames;
  std::vector<uint8_t> scratch;

  static uint8_t cell(const char* dots) { return earlink::dots(dots); }
  static bool punctLike(uint8_t c) { return c == cell("256") || c == cell("236") || c == cell("235"); }
  static bool endsWith(const std::string& s, const char* tail) {
    const size_t n = std::strlen(tail);
    return s.size() >= n && s.compare(s.size() - n, n, tail) == 0;
  }

  std::string joined() const {
    std::string s;
    for (const auto& f : frames) s += f.options[f.next - 1].text;
    return s;
  }
  // Every token except the last must already encode to exactly the typed cells
  // (a token's cells depend on at most the token after it).
  bool prefixOk(const std::string& text, const uint8_t* cells, size_t pos) {
    encode(text, scratch);
    return scratch.size() >= pos && std::equal(cells, cells + pos, scratch.begin());
  }
  bool finalOk(const std::string& text, const uint8_t* cells, size_t n, size_t limit) {
    std::string full = text;
    appendRaw(full, cells + limit, n - limit);
    return encode(full, scratch) == 0 && scratch.size() == n && std::equal(cells, cells + n, scratch.begin());
  }

  bool search(const uint8_t* cells, size_t n, size_t limit, std::string& out) {
    frames.clear();
    frames.push_back(Frame{0, {}, 0});
    generate(cells, limit, 0, START, std::string(), frames.back().options);
    while (!frames.empty()) {
      Frame& f = frames.back();
      if (f.next == f.options.size()) { frames.pop_back(); continue; }
      if (used >= budget) return false;
      ++used;
      const Candidate& c = f.options[f.next++];
      const std::string text = joined();
      if (!prefixOk(text, cells, f.pos)) continue;
      if (c.end == limit) {
        if (finalOk(text, cells, n, limit)) { out = text; return true; }
        continue;
      }
      const size_t end = c.end; const Kind kind = c.kind;
      frames.push_back(Frame{end, {}, 0});
      generate(cells, limit, end, kind, text, frames.back().options);
    }
    return false;
  }

  void generate(const uint8_t* cells, size_t limit, size_t pos, Kind prev, const std::string& before,
                std::vector<Candidate>& out) const {
    size_t end = 0;
    // K18 abbreviations only start a word.
    if (prev == START || prev == PUNCT) {
      for (const auto& word : rules::WORDS) {
        if (!match(word.pattern, cells, limit, pos, end)) continue;
        std::string text;
        for (unsigned w = 0; w < 4 && word.syllables[w]; ++w) appendUtf8(text, word.syllables[w]);
        out.push_back({text, end, ABBREVIATION});
      }
    }
    number(cells, limit, pos, out);
    std::vector<Candidate> early, late;
    jamo(cells, limit, pos, prev, early, late);
    out.insert(out.end(), early.begin(), early.end());
    syllables(cells, limit, pos, before, out);
    for (const auto& mark : MARKS)
      if (match(mark.pattern, cells, limit, pos, end)) out.push_back({mark.text, end, PUNCT});
    out.insert(out.end(), late.begin(), late.end());
  }

  static void number(const uint8_t* cells, size_t limit, size_t pos, std::vector<Candidate>& out) {
    if (pos >= limit || cells[pos] != cell("3456")) return;
    auto digitOf = [&](size_t at) -> int {
      if (at >= limit) return -1;
      for (int d = 0; d < 10; ++d) if (cells[at] == cell(rules::LATIN[d])) return d == 9 ? 0 : d + 1;
      return -1;
    };
    std::string text; size_t at = pos + 1; unsigned digits = 0;
    while (at < limit) {
      const int d = digitOf(at);
      if (d >= 0) { text += char('0' + d); ++at; ++digits; continue; }
      if (digits && (cells[at] == cell("2") || cells[at] == cell("256")) && digitOf(at + 1) >= 0) {
        text += cells[at] == cell("2") ? ',' : '.'; ++at; continue;
      }
      break;
    }
    if (digits) out.push_back({text, at, NUMBER});
  }

  static void jamo(const uint8_t* cells, size_t limit, size_t pos, Kind prev,
                   std::vector<Candidate>& early, std::vector<Candidate>& late) {
    size_t mid = 0, end = 0;
    const bool afterHangul = prev == HANGUL || prev == ABBREVIATION;
    if (match("123456", cells, limit, pos, mid)) {
      for (uint32_t cp = 0x3131; cp <= 0x314e; ++cp) {
        const int c = detail::consonant(cp);
        if (c < 0 || !match(rules::FINAL[c], cells, limit, mid, end)) continue;
        std::string text; appendUtf8(text, cp);
        (afterHangul ? late : early).push_back({text, end, JAMO});
      }
      for (int v = 0; v < 21; ++v) {
        if (!match(rules::VOWEL[v], cells, limit, mid, end)) continue;
        std::string text; appendUtf8(text, 0x314f + v);
        const bool favourite = v == 13 || v == 17 || v == 18; // ㅜ ㅠ ㅡ
        (!afterHangul && favourite ? early : late).push_back({text, end, JAMO});
      }
    }
    if (match("456", cells, limit, pos, mid)) {
      for (uint32_t cp = 0x3131; cp <= 0x314e; ++cp) {
        const int c = detail::consonant(cp);
        if (c < 0 || !match(rules::FINAL[c], cells, limit, mid, end)) continue;
        std::string text; appendUtf8(text, cp);
        late.push_back({text, end, JAMO});
      }
    }
  }

  struct Syllable { uint32_t cp; size_t end; bool demoted; bool rare; };
  static bool sjc(int l) { return l == 9 || l == 10 || l == 12 || l == 13 || l == 14; } // ㅅㅆㅈㅉㅊ

  static void syllables(const uint8_t* cells, size_t limit, size_t pos, const std::string& before,
                        std::vector<Candidate>& out) {
    std::vector<Syllable> found;
    auto add = [&](int l, int v, int t, size_t finalStart, size_t end) {
      const uint32_t cp = 0xac00 + uint32_t(l) * 588 + uint32_t(v) * 28 + uint32_t(t);
      bool demoted = false;
      if (end > finalStart && punctLike(cells[end - 1]) && (end == limit || punctLike(cells[end]))) {
        std::string word = before; appendUtf8(word, cp);
        demoted = true;
        for (const char* noun : FINAL_NOUNS) if (endsWith(word, noun)) demoted = false;
      }
      found.push_back({cp, end, demoted, l == 18 && v == 0 && t == 20}); // 핬 vs 혜
    };
    auto finals = [&](int l, int v, size_t at) {
      size_t end = 0;
      for (int t = 0; t < 28; ++t) if (match(rules::FINAL[t], cells, limit, at, end)) add(l, v, t, at, end);
    };
    for (int sep = 0; sep < 2; ++sep) {
      size_t p0 = pos;
      if (sep) { if (pos >= limit || cells[pos] != cell("36")) break; p0 = pos + 1; }
      size_t p1 = 0, p2 = 0, p3 = 0;
      if (!sep) {
        // K15/K16 것, 껏
        if (match("456-234", cells, limit, p0, p1)) add(0, 4, 19, p1, p1);
        if (match("6-456-234", cells, limit, p0, p1)) add(1, 4, 19, p1, p1);
        // K13 ㅏ omitted / 가, 사
        for (int l = 0; l < 19; ++l) {
          if (!*rules::A_SYLLABLE[l] || !match(rules::A_SYLLABLE[l], cells, limit, p0, p1)) continue;
          finals(l, 0, p1);
        }
      }
      for (int l = 0; l < 19; ++l) {
        if (sep && l != 11) continue; // separator precedes ㅇ+ㅖ/ㅐ only
        if (!match(rules::INITIAL[l], cells, limit, p0, p1)) continue;
        if (!sep && sjc(l) && match("12456", cells, limit, p1, p2)) add(l, 4, 21, p2, p2); // 성 정 청
        for (const auto& c : rules::VC) {
          if (sep || (c.vowel == 6 && c.final == 21 && sjc(l))) continue;
          if (!match(c.pattern, cells, limit, p1, p2)) continue;
          for (int t = 0; t < 28; ++t)
            if (rules::FIRST_FINAL[t] == c.final && match(rules::REMAINDER[t], cells, limit, p2, p3))
              add(l, c.vowel, t, p2, p3);
        }
        for (int v = 0; v < 21; ++v) {
          if (sep && v != 7 && v != 1) continue;
          if (p1 == p0 && l != 11) continue;
          if (match(rules::VOWEL[v], cells, limit, p1, p2)) finals(l, v, p2);
        }
      }
    }
    std::stable_sort(found.begin(), found.end(), [](const Syllable& a, const Syllable& b) {
      if (a.demoted != b.demoted) return !a.demoted;
      if (a.end != b.end) return a.end > b.end;
      return !a.rare && b.rare;
    });
    for (const auto& s : found) { std::string text; appendUtf8(text, s.cp); out.push_back({text, s.end, HANGUL}); }
  }
};

// The typed cells plus their decoded text. Words (split at blank cells) are
// cached, so typing only re-decodes the word being edited.
class Composer {
 public:
  explicit Composer(size_t maxCells = 256) : limit(maxCells) {}
  const std::vector<uint8_t>& cells() const { return typed; }
  bool empty() const { return typed.empty(); }
  bool add(uint8_t cell) {
    if (typed.size() >= limit) return false;
    typed.push_back(cell & 0x3f); return true;
  }
  bool erase() { if (typed.empty()) return false; typed.pop_back(); return true; }
  bool clear() { const bool had = !typed.empty(); typed.clear(); return had; }
  std::string text() {
    std::string result;
    std::vector<Word> words;
    size_t start = 0;
    for (size_t i = 0; i <= typed.size(); ++i) {
      if (i < typed.size() && typed[i]) continue;
      Word word{std::vector<uint8_t>(typed.begin() + start, typed.begin() + i), std::string()};
      const size_t index = words.size();
      if (index < cache.size() && cache[index].cells == word.cells) word.text = cache[index].text;
      else word.text = decoder.decode(word.cells.data(), word.cells.size());
      result += word.text;
      if (i < typed.size()) result += ' ';
      words.push_back(std::move(word));
      start = i + 1;
    }
    cache = std::move(words);
    return result;
  }
 private:
  struct Word { std::vector<uint8_t> cells; std::string text; };
  size_t limit;
  std::vector<uint8_t> typed;
  std::vector<Word> cache;
  WordDecoder decoder;
};
}
}
