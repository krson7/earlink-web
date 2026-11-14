#pragma once
#include <stdint.h>
#include <stddef.h>

namespace config {
// User-confirmed GPIO roles. 74HC595, three 6-dot cells.
constexpr int DATA_PIN = 16;   
constexpr int LATCH_PIN = 17;  
constexpr int CLOCK_PIN = 18;
constexpr uint8_t CELL_COUNT = 3;
// All 18 logical/physical assignments now live in BrailleMapping.h.
// GPIO output enabled. Mapping uses the user-confirmed solenoid layout.
// false still runs BLE, conversion and pagination, with Serial output only.
constexpr bool OUTPUT_ENABLED = true;
constexpr uint32_t CONNECT_PULSE_MS = 200; // One vertical column (3 channels).
constexpr uint32_t CONNECT_GAP_MS = 50;    // Release before the next column.
constexpr uint32_t PAGE_MS = 2000;
constexpr uint32_t BLANK_MS = 250;
constexpr uint32_t RECEIVE_TIMEOUT_MS = 10000;
constexpr uint32_t HOLD_TIMEOUT_MS = 10000; // Clear held page; next/previous can redisplay.
constexpr size_t MIN_FREE_HEAP_BYTES = 16384; // reserve for existing BLE/event processing

// ===== Perkins-style keys (typing -> app) =====
// Pressed = connected to GND, read with INPUT_PULLUP (LOW = pressed).
// GPIO12 is a boot strapping pin: GND-side buttons are safe for it.
namespace keyrole {
constexpr uint16_t DOT1 = 1u << 0, DOT2 = 1u << 1, DOT3 = 1u << 2,
                   DOT4 = 1u << 3, DOT5 = 1u << 4, DOT6 = 1u << 5,
                   SPACE = 1u << 6, SEND = 1u << 7, ERASE = 1u << 8;
constexpr uint16_t ALL_DOTS = 0x3f;
}
// Left to right as the keys sit on the device.
constexpr int KEY_COUNT = 9;
constexpr int KEY_PINS[KEY_COUNT] = {14, 21, 27, 26, 13, 33, 12, 32, 25};
constexpr uint16_t KEY_ROLES[KEY_COUNT] = {
  keyrole::SEND, keyrole::DOT3, keyrole::DOT2, keyrole::DOT1, keyrole::SPACE,
  keyrole::DOT4, keyrole::DOT5, keyrole::DOT6, keyrole::ERASE
};
constexpr uint32_t KEY_DEBOUNCE_MS = 25;
constexpr uint32_t KEY_CLEAR_HOLD_MS = 800;  // hold ERASE alone: clear everything
constexpr size_t MAX_INPUT_CELLS = 256;
constexpr uint32_t INPUT_PACKET_GAP_MS = 8;  // between BLE notifications
}
