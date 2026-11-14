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
