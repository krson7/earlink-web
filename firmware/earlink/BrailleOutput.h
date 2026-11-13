#pragma once
#include <Arduino.h>
#include "BrailleMapping.h"
#include "Config.h"

namespace earlink {
class BrailleOutput {
 public:
  void write(const std::array<uint8_t, 3>& cells) const {
    if (!config::OUTPUT_ENABLED) return;
    const auto bytes = mapping::shiftBytes(cells);
    digitalWrite(config::LATCH_PIN, LOW);
    for (const auto byte : bytes)
      shiftOut(config::DATA_PIN, config::CLOCK_PIN, LSBFIRST, byte);
    digitalWrite(config::LATCH_PIN, HIGH);
  }
  void begin() const {
    logMapping();
    if (!config::OUTPUT_ENABLED) return;
    pinMode(config::DATA_PIN, OUTPUT);
    pinMode(config::LATCH_PIN, OUTPUT);
    pinMode(config::CLOCK_PIN, OUTPUT);
    digitalWrite(config::DATA_PIN, LOW);
    digitalWrite(config::CLOCK_PIN, LOW);
    digitalWrite(config::LATCH_PIN, LOW);
    delay(100); // retained hardware initialization delay
    write({{0, 0, 0}});
    Serial.println("[BRAILLE] Initial output sent (all dots DOWN)");
  }
 private:
  static void logMapping() {
    const auto validation = mapping::validate(mapping::LOGICAL_TO_CHANNEL);
    Serial.printf("[mapping] valid=%u physical=%s missing=%05lX invalid=%05lX\n",
      validation.valid(), mapping::PHYSICAL_LAYOUT_VERIFIED ? "user-confirmed" : "UNVERIFIED/provisional",
      static_cast<unsigned long>(validation.missingChannels), static_cast<unsigned long>(validation.invalidPositions));
    for (size_t i = 0; i < mapping::LOGICAL_TO_CHANNEL.size(); ++i)
      Serial.printf("[mapping] cell=%u dot=%u -> T%u\n",
        unsigned(i / 6 + 1), unsigned(i % 6 + 1), mapping::LOGICAL_TO_CHANNEL[i]);
  }
};
}
