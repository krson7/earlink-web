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
