#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <esp_heap_caps.h>
#include <esp_system.h>
#include <esp_random.h>
#include <atomic>
#include "Config.h"
#include "Protocol.h"
#include "DisplayController.h"
#include "BrailleOutput.h"
#include "KeyboardProtocol.h"

// Existing UUIDs and v1 wire format are unchanged.
static const char* SERVICE_UUID = "8f3a0001-7c3b-4b8a-9f52-123456789abc";
static const char* TEXT_UUID = "8f3a0002-7c3b-4b8a-9f52-123456789abc";
static const char* STATUS_UUID = "8f3a0003-7c3b-4b8a-9f52-123456789abc";
static const char* KEYBOARD_UUID = "8f3a0004-7c3b-4b8a-9f52-123456789abc";
struct Event { uint8_t kind, size, data[20]; };
QueueHandle_t events = nullptr;
BLECharacteristic* statusCharacteristic = nullptr;
BLECharacteristic* keyboardCharacteristic = nullptr;
earlink::keyboard::Scanner keyboardScanner;
earlink::keyboard::State keyboardState;
earlink::keyboard::Snapshot keyboardSnapshot;
uint32_t keyboardBootId = 0, keyboardPublishedRevision = 0, keyboardSentAt = 0;
bool keyboardSyncRequested = false;
std::atomic<bool> connected(false), disconnected(false), overflow(false);
std::atomic<bool> connectionPending(false);
earlink::Receiver receiver;
earlink::DisplayController display;
earlink::Pager& pager = display.pager;
earlink::BrailleOutput brailleOutput;
uint16_t acknowledgedId = 0;
earlink::Result acknowledgedResult = earlink::NONE;

const char* resetReasonName(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON: return "POWERON";
    case ESP_RST_SW: return "SOFTWARE";
    case ESP_RST_PANIC: return "PANIC";
    case ESP_RST_INT_WDT: return "INTERRUPT_WATCHDOG";
    case ESP_RST_TASK_WDT: return "TASK_WATCHDOG";
    case ESP_RST_WDT: return "WATCHDOG";
    case ESP_RST_BROWNOUT: return "BROWNOUT";
    default: return "OTHER";
  }
}
void logHealth(uint32_t now) {
  static uint32_t lastAt = 0;
  if (uint32_t(now - lastAt) < 1000) return;
  lastAt = now;
  Serial.printf("[health] uptime_ms=%lu free=%u largest=%u connected=%u wave=%u\n",
    static_cast<unsigned long>(now), unsigned(heap_caps_get_free_size(MALLOC_CAP_8BIT)),
    unsigned(heap_caps_get_largest_free_block(MALLOC_CAP_8BIT)), unsigned(connected.load()),
    unsigned(display.wave.active()));
}

void writeOutput() {
  const auto raised = pager.output();
  const auto lowered = display.output();
  const auto wire = earlink::mapping::shiftBytes(lowered);
  brailleOutput.write(lowered);
  Serial.printf("[page] source=%s id=%u %u/%u braille=%02X,%02X,%02X down=%02X,%02X,%02X wire=%02X,%02X,%02X output=%s\n",
    display.wave.active() ? "wave" : (display.pageVisible() ? "page" : "idle"),
    pager.current.id, pager.active() ? pager.page + 1 : 0, pager.pages(),
    raised[0], raised[1], raised[2], lowered[0], lowered[1], lowered[2],
    wire[0], wire[1], wire[2], config::OUTPUT_ENABLED ? "GPIO" : "preview");
}
void publishStatus() {
  if (!statusCharacteristic) return;
  uint8_t state[16] = {};
  state[0] = 1;
  state[1] = (pager.active() ? 1 : 0) | (pager.automatic ? 2 : 0) |
             (config::OUTPUT_ENABLED ? 4 : 0) | (display.pageVisible() ? 8 : 0);
  earlink::write16(state + 2, acknowledgedId);
  state[4] = acknowledgedResult; state[5] = pager.queued();
  earlink::write16(state + 6, pager.current.id);
  earlink::write16(state + 8, pager.active() ? pager.page + 1 : 0);
  earlink::write16(state + 10, pager.pages());
  earlink::write16(state + 12, pager.current.translation.unsupported);
  earlink::write16(state + 14, uint16_t(pager.intervalMs));
  statusCharacteristic->setValue(state, sizeof(state));
  if (connected.load()) statusCharacteristic->notify();
}
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    connected.store(true); connectionPending.store(true); Serial.println("[BLE] Connected");
  }
  void onDisconnect(BLEServer*) override {
    connected.store(false); disconnected.store(true); Serial.println("[BLE] Disconnected");
  }
};
class WriteCallbacks : public BLECharacteristicCallbacks {
 public:
  explicit WriteCallbacks(uint8_t eventKind) : kind(eventKind) {}
  void onWrite(BLECharacteristic* characteristic) override {
    const auto value = characteristic->getValue(); // String (3.x) / std::string (2.x)
    Event event{}; event.kind = kind;
    if (!events || value.length() == 0 || value.length() > sizeof(event.data)) {
      overflow.store(true); return;
    }
    event.size = uint8_t(value.length());
    memcpy(event.data, value.c_str(), event.size);
    if (xQueueSend(events, &event, 0) != pdTRUE) overflow.store(true);
  }
 private:
  uint8_t kind;
};
void handleCommand(const Event& event, uint32_t now) {
  if (event.size < 2 || event.data[0] != 1) return;
  switch (event.data[1]) {
    case 1: pager.setAutomatic(false, now); pager.next(now); break;
    case 2: pager.setAutomatic(false, now); pager.previous(now); break;
    case 3: display.clear(); receiver.reset(); break;
    case 4: pager.setAutomatic(false, now); break;
    case 5: pager.setAutomatic(true, now); break;
    case 6:
      if (event.size == 4) {
        const uint16_t interval = earlink::read16(event.data + 2);
        if (interval >= 1000 && interval <= 10000) pager.intervalMs = interval;
      }
      break;
    default: return;
  }
  writeOutput(); publishStatus();
}
void logTranslationIssue(const earlink::Audit& record, void* context) {
  if (!record.issue) return;
  auto& logged = *static_cast<unsigned*>(context);
  if (logged++ < 32)
    Serial.printf("[translate] byte=%u character=%u U+%04lX reason=%s\n",
      unsigned(record.byteOffset), unsigned(record.characterOffset),
      static_cast<unsigned long>(record.codepoint), record.rule);
}
void acceptText(uint32_t now) {
  const auto measured = earlink::measureTranslation(receiver.text);
  if (measured.unsupported || !measured.cells) {
    unsigned logged = 0;
    earlink::measureTranslation(receiver.text, logTranslationIssue, &logged);
    Serial.printf("[translate] REJECT id=%u unsupported=%u; detailed logs capped at 32\n",
      receiver.id, measured.unsupported);
    acknowledgedResult = earlink::BAD_PACKET; // existing code: no partial/misleading output
    return;
  }
  const size_t freeBytes = heap_caps_get_free_size(MALLOC_CAP_8BIT);
  const size_t largest = heap_caps_get_largest_free_block(MALLOC_CAP_8BIT);
  if (!pager.canEnqueue(measured.cells) || measured.cells + config::MIN_FREE_HEAP_BYTES > freeBytes ||
      measured.cells > largest) {
    Serial.printf("[translate] REJECT capacity id=%u cells=%u free=%u largest=%u\n",
      receiver.id, unsigned(measured.cells), unsigned(freeBytes), unsigned(largest));
    acknowledgedResult = earlink::QUEUE_FULL; return;
  }
  earlink::Message message; message.id = receiver.id;
  message.translation = earlink::translate(receiver.text);
  if (!pager.enqueue(std::move(message), now)) acknowledgedResult = earlink::QUEUE_FULL;
}
void setup() {
  Serial.begin(115200);
  for (const int pin : config::KEY_PINS) pinMode(pin, INPUT_PULLUP);
  keyboardBootId = esp_random();
  brailleOutput.begin(); // Active-high; startup releases every channel.
  const auto reason = esp_reset_reason();
  Serial.printf("[boot] reset=%s code=%u startup_bytes=00,00,00 output=%s\n",
    resetReasonName(reason), unsigned(reason), config::OUTPUT_ENABLED ? "GPIO" : "preview");
  display.wave.pulseMs = config::CONNECT_PULSE_MS;
  display.wave.gapMs = config::CONNECT_GAP_MS;
  pager.intervalMs = config::PAGE_MS; pager.blankMs = config::BLANK_MS;
  pager.holdTimeoutMs = config::HOLD_TIMEOUT_MS;
  events = xQueueCreate(16, sizeof(Event));
  if (!events) { Serial.println("[ERROR] Event queue allocation failed"); return; }
  Serial.println("[boot] Initializing BLE");
  BLEDevice::init("EarLink");
  Serial.println("[boot] BLE initialized");
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService* service = server->createService(SERVICE_UUID);
  auto* textCharacteristic = service->createCharacteristic(TEXT_UUID, BLECharacteristic::PROPERTY_WRITE);
  textCharacteristic->setCallbacks(new WriteCallbacks(1));
  statusCharacteristic = service->createCharacteristic(STATUS_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_NOTIFY);
  statusCharacteristic->addDescriptor(new BLE2902());
  statusCharacteristic->setCallbacks(new WriteCallbacks(2));
  keyboardCharacteristic = service->createCharacteristic(KEYBOARD_UUID,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_NOTIFY);
  keyboardCharacteristic->addDescriptor(new BLE2902());
  keyboardCharacteristic->setCallbacks(new WriteCallbacks(3));
  publishStatus(); service->start();
  auto* advertising = server->getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID); advertising->setScanResponse(true); advertising->start();
  Serial.println("[EARLINK READY] HIGH=DOWN / LOW=UP; page: braille=LOW, background=HIGH; idle=00,00,00; BLE connect=column wave");
}
void loop() {
  logHealth(millis());
  if (!events) { delay(100); return; }
  if (disconnected.exchange(false)) {
    keyboardState.disconnected(); keyboardSnapshot.reset(); keyboardPublishedRevision = 0;
    xQueueReset(events); receiver.reset(); display.clear();
    acknowledgedId = 0; acknowledgedResult = earlink::NONE;
    writeOutput(); publishStatus();
    if (!connected.load()) BLEDevice::startAdvertising();
    Serial.println("[BRAILLE] Disconnected - all channels released");
  }
  if (overflow.exchange(false)) {
    xQueueReset(events); receiver.reset();
    acknowledgedId = receiver.id; acknowledgedResult = earlink::BAD_PACKET;
    Serial.println("[BLE] Invalid write or event queue overflow"); publishStatus();
  }
  const uint32_t now = millis();
  if (connectionPending.exchange(false) && connected.load()) {
    display.startConnectionWave(now);
    writeOutput(); publishStatus();
    Serial.println("[wave] Begin: six columns, three channels per pulse");
  }
  Event event{};
  while (xQueueReceive(events, &event, 0) == pdTRUE) {
    if (!connected.load()) continue;
    if (event.kind == 3) {
      if (event.size < 2 || event.data[0] != 1) continue;
      if (event.data[1] == 1 && event.size == 2) keyboardSyncRequested = true;
      else if (event.data[1] == 2 && event.size == 7 && event.data[6] <= 1)
        keyboardState.acknowledge(earlink::keyboard::get32(event.data + 2), event.data[6] == 1);
      else if (event.data[1] == 3 && event.size == 3 && event.data[2] <= 1)
        keyboardState.ready(event.data[2] == 1, now);
      else if (event.data[1] == 4 && event.size == 2)
        keyboardState.apply({earlink::keyboard::Action::Send, 0}, connected.load(), now);
      continue;
    }
    if (event.kind == 2) { handleCommand(event, now); continue; }
    const auto result = receiver.accept(event.data, event.size, now);
    if (result == earlink::NONE) continue;
    acknowledgedId = receiver.id; acknowledgedResult = result;
    if (result == earlink::ACCEPTED) {
      acceptText(now); receiver.reset(); writeOutput();
    } else Serial.printf("[BLE] Packet rejected id=%u reason=%u\n", receiver.id, result);
    publishStatus();
  }
  if (receiver.receiving && uint32_t(now - receiver.lastAt) >= config::RECEIVE_TIMEOUT_MS) {
    acknowledgedId = receiver.id; acknowledgedResult = earlink::TIMED_OUT;
    receiver.reset(); Serial.println("[BLE] Receive timeout"); publishStatus();
  }
  if (display.tick(millis())) { writeOutput(); publishStatus(); }
  uint16_t pressed = 0;
  for (unsigned i = 0; i < 9; ++i)
    if (digitalRead(config::KEY_PINS[i]) == LOW) pressed |= uint16_t(1u << i);
  const auto input = keyboardScanner.tick(pressed, millis());
  if (input.action == earlink::keyboard::Action::Invalid)
    Serial.println("[keyboard] Ignored mixed dot/function or multiple function keys");
  else if (input.action != earlink::keyboard::Action::None) {
    keyboardState.apply(input, connected.load(), millis());
    Serial.printf("[keyboard] action=%u dots=%02X cells=%u request=%lu feedback=%u\n",
      unsigned(input.action), input.cell, unsigned(keyboardState.cells.size()),
      static_cast<unsigned long>(keyboardState.requestId), unsigned(keyboardState.feedback));
  }
  keyboardState.tick(millis());
  if (connected.load() && keyboardCharacteristic && uint32_t(millis() - keyboardSentAt) >= 12) {
    if (!keyboardSnapshot.active() &&
        (keyboardSyncRequested || keyboardPublishedRevision != keyboardState.revision)) {
      keyboardSnapshot.begin(keyboardState, keyboardBootId); keyboardSyncRequested = false;
    }
    if (keyboardSnapshot.active()) {
      auto packet = keyboardSnapshot.next();
      keyboardCharacteristic->setValue(packet.bytes.data(), packet.size);
      keyboardCharacteristic->notify(); keyboardSentAt = millis();
      if (!keyboardSnapshot.active()) keyboardPublishedRevision = keyboardSnapshot.capturedRevision();
    }
  }
  delay(2);
}
