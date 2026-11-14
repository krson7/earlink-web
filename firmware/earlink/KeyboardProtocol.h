#pragma once
#include <array>
#include <vector>
#include "Keyboard.h"

namespace earlink {
namespace keyboard {
inline void put16(uint8_t* p, uint16_t n) { p[0] = uint8_t(n); p[1] = uint8_t(n >> 8); }
inline void put32(uint8_t* p, uint32_t n) {
  for (unsigned i = 0; i < 4; ++i) p[i] = uint8_t(n >> (8 * i));
}
inline uint32_t get32(const uint8_t* p) {
  uint32_t n = 0;
  for (unsigned i = 0; i < 4; ++i) n |= uint32_t(p[i]) << (8 * i);
  return n;
}
struct Packet { std::array<uint8_t, 20> bytes{}; uint8_t size = 0; };
// Stable snapshot: BEGIN(19), DATA(8+up to 12), END(6). Safe at ATT MTU 23.
// Never restart mid-snapshot when a key changes: finish it, then send the latest.
class Snapshot {
 public:
  void begin(const State& state, uint32_t boot) {
    revision = state.revision; request = state.requestId; bootId = boot;
    count = uint16_t(state.cells.size()); pendingCount = uint16_t(state.pending.size());
    feedback = uint8_t(state.feedback);
    data = state.cells; data.insert(data.end(), state.pending.begin(), state.pending.end());
    offset = 0; stage = 1;
  }
  bool active() const { return stage != 0; }
  uint32_t capturedRevision() const { return revision; }
  Packet next() {
    Packet packet;
    if (!stage) return packet;
    auto* p = packet.bytes.data(); p[0] = 1; p[1] = stage;
    if (stage == 1) {
      put32(p + 2, bootId); put32(p + 6, revision); put32(p + 10, request);
      put16(p + 14, count); put16(p + 16, pendingCount); p[18] = feedback;
      packet.size = 19; stage = data.empty() ? 3 : 2;
    } else if (stage == 2) {
      put32(p + 2, revision); put16(p + 6, uint16_t(offset));
      const size_t n = data.size() - offset < 12 ? data.size() - offset : 12;
      for (size_t i = 0; i < n; ++i) p[8 + i] = data[offset + i];
      packet.size = uint8_t(8 + n); offset += n;
      if (offset == data.size()) stage = 3;
    } else { put32(p + 2, revision); packet.size = 6; stage = 0; }
    return packet;
  }
  void reset() { stage = 0; }
 private:
  std::vector<uint8_t> data;
  size_t offset = 0;
  uint32_t revision = 0, request = 0, bootId = 0;
  uint16_t count = 0, pendingCount = 0;
  uint8_t stage = 0, feedback = 0;
};
}
}
