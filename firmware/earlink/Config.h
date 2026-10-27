#pragma once
#include <stdint.h>

namespace config {
// User hardware: ESP32 Dev Module, 5V / 3A, three 6-dot cells.
// GPIO role order is provisional until checked against the actual PCB wiring.
constexpr int DATA_PIN = 16;   //4 5 6
constexpr int LATCH_PIN = 17;  
constexpr int CLOCK_PIN = 18;
constexpr uint8_t CELL_COUNT = 3;
// Standard reading orientation: 1 4 / 2 5 / 3 6.
// Entries are the shift-register bit indexes for dots 1..6.
constexpr uint8_t DOT_BITS[6] = {0, 1, 2, 3, 4, 5};
constexpr bool REVERSE_CELL_ORDER = true; // Matches the supplied Jooyoung example.
// GPIO output enabled; pin roles and DOT_BITS must match the actual PCB wiring.
// false still runs BLE, conversion and pagination, with Serial output only.
constexpr bool OUTPUT_ENABLED = true;
constexpr uint32_t PAGE_MS = 3000;
constexpr uint32_t BLANK_MS = 250;
constexpr uint32_t RECEIVE_TIMEOUT_MS = 10000;
constexpr uint32_t HOLD_TIMEOUT_MS = 10000; // Clear held page; next/previous can redisplay.
}
