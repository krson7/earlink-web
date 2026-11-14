#pragma once
#include <stdint.h>
#include <deque>
#include <string>
#include "Protocol.h"

// ===== Typed text, device -> app (for the app developer) =====
// Characteristic 8f3a0004-7c3b-4b8a-9f52-123456789abc, NOTIFY only.
// Subscribe (CCCD) to receive it. Same framing as the text the app writes,
// little-endian, one message = START, DATA..., END with the same nonzero id:
//   START  45 4C 01 01 id(2) length(2) flags(1)      9 bytes
//   DATA   45 4C 01 02 id(2) offset(2) bytes(1..12)  at most 20 bytes
//   END    45 4C 01 03 id(2)                         6 bytes
// Payload is UTF-8, `length` bytes in total (0 = the input is now empty).
// flags bit0 = 1: the user pressed SEND -> post it as a chat message and clear
//               the input field.
// flags bit0 = 0: preview while typing -> replace the whole input field.
// A newer START may arrive before an unfinished preview's END: drop the old
// one. Sent (flag 1) messages are always delivered completely and in order.
// Cells the device could not read arrive as Unicode braille (U+2800..U+283F).
namespace earlink {
class InputSender {
 public:
  using Notify = void (*)(const uint8_t* data, size_t size, void* context);
  uint32_t gapMs = 8;

  void push(const std::string& text, bool committed) {
    // A newer state replaces any preview that is waiting or half sent.
    if (sending && !queue.front().committed) { queue.pop_front(); sending = false; }
    for (auto it = queue.begin(); it != queue.end();) {
      if (!it->committed && !(sending && it == queue.begin())) it = queue.erase(it);
      else ++it;
    }
    Job job; job.id = nextId++; if (!nextId) nextId = 1;
    job.committed = committed;
    job.text = text.size() > 0xffff ? text.substr(0, 0xffff) : text;
    queue.push_back(std::move(job));
  }
  void reset() { queue.clear(); sending = false; }
  bool idle() const { return queue.empty(); }

  // Sends at most one packet. Returns true when a packet went out.
  bool tick(uint32_t now, Notify notify, void* context) {
    if (queue.empty() || uint32_t(now - lastAt) < gapMs) return false;
    Job& job = queue.front();
    uint8_t packet[20] = {0x45, 0x4c, 1, 0};
    write16(packet + 4, job.id);
    size_t size = 6;
    if (!sending) {
      sending = true; offset = 0;
      packet[3] = 1; write16(packet + 6, uint16_t(job.text.size())); packet[8] = job.committed ? 1 : 0;
      size = 9;
    } else if (offset < job.text.size()) {
      const size_t chunk = job.text.size() - offset < 12 ? job.text.size() - offset : 12;
      packet[3] = 2; write16(packet + 6, uint16_t(offset));
      for (size_t i = 0; i < chunk; ++i) packet[8 + i] = uint8_t(job.text[offset + i]);
      offset += chunk; size = 8 + chunk;
    } else {
      packet[3] = 3;
      queue.pop_front(); sending = false;
    }
    lastAt = now;
    notify(packet, size, context);
    return true;
  }

 private:
  struct Job { uint16_t id = 0; bool committed = false; std::string text; };
  std::deque<Job> queue;
  bool sending = false;
  size_t offset = 0;
  uint16_t nextId = 1;
  uint32_t lastAt = 0;
};
}
