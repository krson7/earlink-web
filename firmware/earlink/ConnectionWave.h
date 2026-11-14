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
