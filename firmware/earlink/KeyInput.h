#pragma once
#include <stdint.h>
#include <string>
#include "Config.h"

// Perkins-style chording on the 9 keys in Config.h.
// A chord is every key pressed between the first press and the moment all
// keys are up again; it takes effect on release. Holding ERASE alone for
// KEY_CLEAR_HOLD_MS clears everything at once (nothing more on release).
namespace earlink {
namespace keys {
using namespace config::keyrole;

enum class Action : uint8_t { NONE, CELL, SPACE, ERASE, CLEAR, SEND, IGNORED };
struct Event { Action action = Action::NONE; uint8_t cell = 0; uint16_t chord = 0; };

inline std::string describe(uint16_t chord) {
  static const char* const names[] = {"점1","점2","점3","점4","점5","점6","띄어쓰기","전송","지우기"};
  std::string s;
  for (unsigned i = 0; i < 9; ++i)
    if (chord & (1u << i)) { if (!s.empty()) s += '+'; s += names[i]; }
  return s.empty() ? std::string("-") : s;
}
inline const char* actionName(Action a) {
  switch (a) {
    case Action::CELL: return "cell";
    case Action::SPACE: return "space";
    case Action::ERASE: return "erase";
    case Action::CLEAR: return "clear";
    case Action::SEND: return "send";
    case Action::IGNORED: return "ignored";
    default: return "none";
  }
}

// Pure logic: feed the raw "pressed" mask and the time; no Arduino calls.
class ChordReader {
 public:
  uint32_t debounceMs = config::KEY_DEBOUNCE_MS;
  uint32_t holdMs = config::KEY_CLEAR_HOLD_MS;
  uint16_t pressed() const { return stable; }

  Event update(uint16_t raw, uint32_t now) {
    Event event;
    if (raw != candidate) { candidate = raw; candidateAt = now; }
    else if (candidate != stable && uint32_t(now - candidateAt) >= debounceMs) {
      if (!chord && candidate) pressedAt = now;
      stable = candidate;
      chord |= stable;
      if (!stable && chord) {
        if (!consumed) event = classify(chord);
        chord = 0; consumed = false;
      }
    }
    if (!consumed && stable == ERASE && chord == ERASE && uint32_t(now - pressedAt) >= holdMs) {
      consumed = true; event.action = Action::CLEAR; event.chord = chord;
    }
    return event;
  }

 private:
  uint16_t candidate = 0, stable = 0, chord = 0;
  uint32_t candidateAt = 0, pressedAt = 0;
  bool consumed = false;

  static Event classify(uint16_t chord) {
    Event e; e.chord = chord;
    if (!(chord & ~ALL_DOTS)) { e.action = Action::CELL; e.cell = uint8_t(chord & ALL_DOTS); }
    else if (chord == SPACE) e.action = Action::SPACE;
    else if (chord == ERASE) e.action = Action::ERASE;
    else if (chord == SEND) e.action = Action::SEND;
    else e.action = Action::IGNORED; // dots mixed with a function key
    return e;
  }
};

#ifdef ARDUINO
class KeyInput {
 public:
  ChordReader reader;
  void begin() const {
    for (int i = 0; i < config::KEY_COUNT; ++i) pinMode(config::KEY_PINS[i], INPUT_PULLUP);
  }
  uint16_t read() const {
    uint16_t mask = 0;
    for (int i = 0; i < config::KEY_COUNT; ++i)
      if (digitalRead(config::KEY_PINS[i]) == LOW) mask |= config::KEY_ROLES[i];
    return mask;
  }
  Event poll(uint32_t now) { return reader.update(read(), now); }
};
#endif
}
}
