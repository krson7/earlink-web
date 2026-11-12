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
// GPIO output enabled. Physical dot positions are still unverified.
// false still runs BLE, conversion and pagination, with Serial output only.
constexpr bool OUTPUT_ENABLED = true;
constexpr uint32_t PAGE_MS = 3000;
constexpr uint32_t BLANK_MS = 250;
constexpr uint32_t RECEIVE_TIMEOUT_MS = 10000;
constexpr uint32_t HOLD_TIMEOUT_MS = 10000; // Clear held page; next/previous can redisplay.
constexpr size_t MIN_FREE_HEAP_BYTES = 16384; // reserve for existing BLE/event processing
}
