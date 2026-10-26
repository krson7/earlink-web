#pragma once
#include <stdint.h>
#include <string>

namespace earlink {
constexpr size_t MAX_TEXT_BYTES = 4096;
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
    if (size < 6 || data[0] != 0x45 || data[1] != 0x4c || data[2] != 1) {
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
