#pragma once
#include <stdint.h>
#include <stddef.h>
#include <vector>

namespace earlink {
namespace keyboard {
constexpr size_t MAX_CELLS = 512;
constexpr uint32_t DEBOUNCE_MS = 20;
constexpr uint32_t CLEAR_MS = 800;
constexpr uint32_t REQUEST_TIMEOUT_MS = 30000;
constexpr uint32_t READY_TIMEOUT_MS = 6000;
constexpr uint16_t SPACE = 1u << 6, BACKSPACE = 1u << 7, SEND = 1u << 8;
enum class Action : uint8_t { None, Cell, Space, Backspace, Clear, Send, Invalid };
struct Input { Action action = Action::None; uint8_t cell = 0; };

// One independent debounce timer per switch. No GPIO, BLE or display dependencies.
class Scanner {
 public:
  Input tick(uint16_t pressed, uint32_t now) {
    pressed &= 0x1ff;
    for (unsigned i = 0; i < 9; ++i) {
      const uint16_t bit = uint16_t(1u << i);
      if ((pressed & bit) != (raw & bit)) { raw ^= bit; changed[i] = now; }
      if ((raw & bit) != (stable & bit) && uint32_t(now - changed[i]) >= DEBOUNCE_MS)
        stable ^= bit;
    }
    // A key held through boot must be released before accepting input.
    if (!armed) { if (!pressed && !stable) armed = true; return {}; }
    if (stable) {
      if (!active) { active = true; started = now; }
      chord |= stable;
      return {};
    }
    if (!active) return {};
    active = false;
    const uint16_t keys = chord; chord = 0;
    const uint16_t functions = keys & 0x1c0;
    if ((functions && (keys & 63)) || (functions && (functions & (functions - 1))))
      return {Action::Invalid, 0};
    if (!functions) return {Action::Cell, uint8_t(keys & 63)};
    if (functions == SPACE) return {Action::Space, 0};
    if (functions == SEND) return {Action::Send, 0};
    return {uint32_t(now - started) >= CLEAR_MS ? Action::Clear : Action::Backspace, 0};
  }
 private:
  uint16_t raw = 0, stable = 0, chord = 0;
  uint32_t changed[9] = {}, started = 0;
  bool active = false, armed = false;
};

enum class Feedback : uint8_t { None, Full, Unavailable, Timeout, Rejected, Empty };
class State {
 public:
  std::vector<uint8_t> cells, pending;
  uint32_t revision = 1, requestId = 0;
  Feedback feedback = Feedback::None;

  void ready(bool value, uint32_t now) { webReady = value; readyAt = now; }
  void disconnected() { webReady = false; }
  bool available(uint32_t now) const {
    return webReady && uint32_t(now - readyAt) < READY_TIMEOUT_MS;
  }
  void apply(Input input, bool connected, uint32_t now) {
    if (input.action == Action::None || input.action == Action::Invalid) return;
    feedback = Feedback::None;
    switch (input.action) {
      case Action::Cell:
      case Action::Space:
        if (cells.size() >= MAX_CELLS) feedback = Feedback::Full;
        else cells.push_back(input.action == Action::Space ? 0 : input.cell);
        break;
      case Action::Backspace:
        if (!cells.empty()) {
          if (cells.size() <= pending.size()) prefixIntact = false;
          cells.pop_back();
        }
        break;
      case Action::Clear:
        cells.clear(); prefixIntact = false; break;
      case Action::Send:
        // Repeated send presses cannot enqueue the same pending message twice.
        if (requestId) { requestedAt = now; timedOut = false; ++revision; return; }
        if (!connected || !available(now)) feedback = Feedback::Unavailable;
        else if (cells.empty()) feedback = Feedback::Empty;
        else {
          pending = cells; prefixIntact = true; requestedAt = now; timedOut = false;
          if (++nextRequest == 0) ++nextRequest;
          requestId = nextRequest;
        }
        break;
      default: return;
    }
    ++revision;
  }
  void acknowledge(uint32_t id, bool accepted) {
    if (!id || id != requestId) return;
    // Only erase the original prefix; later typing and edits survive the ACK.
    if (accepted && prefixIntact)
      cells.erase(cells.begin(), cells.begin() + pending.size());
    feedback = accepted ? Feedback::None : Feedback::Rejected;
    pending.clear(); requestId = 0; ++revision;
  }
  void tick(uint32_t now) {
    if (requestId && !timedOut && uint32_t(now - requestedAt) >= REQUEST_TIMEOUT_MS) {
      // Keep the same request ID until an outcome arrives. An ACK lost on the
      // radio must not create a fresh ID and duplicate an already-sent message.
      timedOut = true; feedback = Feedback::Timeout; ++revision;
    }
  }
 private:
  bool webReady = false, prefixIntact = false, timedOut = false;
  uint32_t readyAt = 0, requestedAt = 0, nextRequest = 0;
};
}
}
