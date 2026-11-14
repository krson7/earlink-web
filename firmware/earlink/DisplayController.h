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
