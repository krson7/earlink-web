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
  uint32_t intervalMs = 3000;
  uint32_t blankMs = 250;
  uint32_t holdTimeoutMs = 10000;
  uint16_t page = 0;
  Message current;

  bool active() const { return !current.translation.cells.empty(); }
  uint16_t pages() const { return uint16_t((current.translation.cells.size() + 2) / 3); }
  uint8_t queued() const { return uint8_t(waiting.size()); }
  bool enqueue(Message message, uint32_t now) {
    if (waiting.size() >= 3) return false;
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
