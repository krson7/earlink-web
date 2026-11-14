#include <cassert>
#include <fstream>
#include <iostream>
#include "../earlink/KeyboardProtocol.h"
#include "../earlink/Config.h"
using namespace earlink::keyboard;

struct Keys {
  Scanner scanner;
  uint32_t now = 0;
  Keys() { scanner.tick(0, now); }
  Input set(uint16_t mask, uint32_t held = 20) {
    scanner.tick(mask, now); now += held;
    return scanner.tick(mask, now);
  }
  Input release(uint32_t held = 20) { return set(0, held); }
};

static void scanTests() {
  // Exhaustive 63 nonblank chords and the user's actual GPIO-dot assignment.
  const int pins[] = {26, 27, 21, 33, 12, 32, 13, 25, 14};
  for (unsigned i = 0; i < 9; ++i) assert(config::KEY_PINS[i] == pins[i]);
  for (uint16_t dots = 1; dots < 64; ++dots) {
    Keys keys; assert(keys.set(dots).action == Action::None);
    const auto input = keys.release(); assert(input.action == Action::Cell && input.cell == dots);
    assert(keys.scanner.tick(0, keys.now + 100).action == Action::None);
  }
  Keys sequential;
  sequential.set(1); sequential.set(3); sequential.set(2);
  const auto chord = sequential.release(); assert(chord.action == Action::Cell && chord.cell == 3);
  Keys separate; separate.set(1); assert(separate.release().cell == 1);
  separate.set(2); assert(separate.release().cell == 2);
  // Every dot+function combination is ignored, including later function presses.
  for (const auto fn : {SPACE, BACKSPACE, SEND}) for (uint16_t dots = 1; dots < 64; ++dots) {
    Keys keys; keys.set(dots); keys.set(uint16_t(dots | fn));
    assert(keys.release().action == Action::Invalid);
  }
  for (const auto combination : {uint16_t(SPACE | BACKSPACE), uint16_t(SPACE | SEND), uint16_t(BACKSPACE | SEND), uint16_t(SPACE | BACKSPACE | SEND)}) {
    Keys keys; keys.set(combination); assert(keys.release().action == Action::Invalid);
  }
  Keys space; space.set(SPACE); assert(space.release().action == Action::Space);
  Keys send; send.set(SEND); assert(send.release().action == Action::Send);
  for (uint32_t held : {20u, 799u, 800u, 1200u}) {
    Keys keys; keys.set(BACKSPACE); keys.now += held - 20;
    assert(keys.release().action == (held >= 800 ? Action::Clear : Action::Backspace));
  }
  // Bounce never becomes a chord; held boot keys do not submit or type.
  Keys bounce; bounce.set(1, 5); bounce.set(0, 5); bounce.set(1, 5); bounce.set(0, 30);
  assert(bounce.scanner.tick(0, 100).action == Action::None);
  Scanner boot; boot.tick(SEND, 0); boot.tick(SEND, 1000); boot.tick(0, 1001);
  assert(boot.tick(0, 1021).action == Action::None);
  Keys wrap; wrap.now = 0xfffffff0; wrap.set(1); assert(wrap.release().cell == 1);
  Keys longMixed; longMixed.set(BACKSPACE); longMixed.now += 1000; longMixed.set(BACKSPACE | 1);
  assert(longMixed.release().action == Action::Invalid);
}

static void stateTests() {
  State state; state.apply({Action::Cell, 8}, true, 0);
  state.apply({Action::Send, 0}, true, 0);
  assert(state.feedback == Feedback::Unavailable && state.cells.size() == 1 && !state.requestId);
  state.ready(true, 0); state.apply({Action::Send, 0}, false, 1); assert(!state.requestId);
  state.apply({Action::Send, 0}, true, 2); const auto request = state.requestId;
  assert(request && state.pending == state.cells);
  state.apply({Action::Send, 0}, true, 3); assert(state.requestId == request);
  state.apply({Action::Cell, 35}, true, 4);
  state.acknowledge(request + 1, true); assert(state.cells.size() == 2);
  state.acknowledge(request, true); assert(state.cells == std::vector<uint8_t>({35}));
  state.acknowledge(request, true); assert(state.cells.size() == 1);
  state.apply({Action::Send, 0}, true, 5); state.acknowledge(state.requestId, false);
  assert(state.cells.size() == 1 && state.feedback == Feedback::Rejected);
  // Appending, deleting or clearing during flight must not erase later input.
  state.apply({Action::Send, 0}, true, 6);
  state.apply({Action::Backspace, 0}, true, 7); state.apply({Action::Cell, 8}, true, 8);
  state.acknowledge(state.requestId, true); assert(state.cells == std::vector<uint8_t>({8}));
  state.apply({Action::Send, 0}, true, 9); state.apply({Action::Clear, 0}, true, 10);
  state.apply({Action::Space, 0}, true, 11); state.acknowledge(state.requestId, true);
  assert(state.cells == std::vector<uint8_t>({0}));
  state.apply({Action::Send, 0}, true, 12); const auto pending = state.requestId;
  state.disconnected(); state.tick(12 + REQUEST_TIMEOUT_MS);
  assert(state.requestId == pending && state.feedback == Feedback::Timeout && state.cells.size() == 1);
  state.ready(true, 40000); state.apply({Action::Send, 0}, true, 40001);
  assert(state.requestId == pending); state.acknowledge(pending, true); assert(state.cells.empty());
  state.apply({Action::Send, 0}, true, 40002); assert(state.feedback == Feedback::Empty);
  state.apply({Action::Cell, 1}, true, 40003); state.apply({Action::Send, 0}, true, 46000);
  assert(!state.requestId && state.feedback == Feedback::Unavailable);
  for (size_t i = 0; i < MAX_CELLS + 10; ++i) state.apply({Action::Cell, 1}, false, 47000);
  assert(state.cells.size() == MAX_CELLS && state.feedback == Feedback::Full);
  state.apply({Action::Clear, 0}, false, 47001); assert(state.cells.empty());
  state.ready(true, 0xfffffff0); assert(state.available(20));
}

static void snapshotTests(const char* fixturePath) {
  State state;
  state.cells = {26, 35, 18, 8, 46}; // Independent fixed dots: 245 126 25 4 2346 = 한글.
  state.ready(true, 0); state.apply({Action::Send, 0}, true, 1);
  Snapshot snapshot; snapshot.begin(state, 0x12345678);
  std::ofstream fixture(fixturePath, std::ios::binary); assert(fixture.good());
  unsigned frames = 0;
  while (snapshot.active()) {
    const auto p = snapshot.next(); assert(p.size > 0 && p.size <= 20);
    fixture.put(char(p.size)); fixture.write(reinterpret_cast<const char*>(p.bytes.data()), p.size); ++frames;
  }
  assert(frames == 3);
  state.cells.assign(MAX_CELLS, 63); state.pending = state.cells;
  snapshot.begin(state, 0xffffffff); auto begin = snapshot.next();
  assert(begin.size == 19 && get32(begin.bytes.data() + 2) == 0xffffffff);
  // In-flight changes cannot mutate an already captured frame sequence.
  state.cells.clear(); size_t received = 0;
  while (snapshot.active()) {
    const auto p = snapshot.next();
    if (p.bytes[1] == 2) { received += p.size - 8; for (unsigned i = 8; i < p.size; ++i) assert(p.bytes[i] == 63); }
  }
  assert(received == MAX_CELLS * 2);
}

int main(int argc, char** argv) {
  assert(argc == 2);
  scanTests(); stateTests(); snapshotTests(argv[1]);
  std::cout << "PASS: keyboard chords/debounce/mixed keys/800ms/wrap, draft retention/ACK/edit/capacity, MTU snapshots and native browser fixture.\n";
}
