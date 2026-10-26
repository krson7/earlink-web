#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <atomic>
#include "Config.h"
#include "Protocol.h"
#include "Pager.h"

static const char* SERVICE_UUID = "8f3a0001-7c3b-4b8a-9f52-123456789abc";
static const char* TEXT_UUID = "8f3a0002-7c3b-4b8a-9f52-123456789abc";
static const char* STATUS_UUID = "8f3a0003-7c3b-4b8a-9f52-123456789abc";

struct Event { uint8_t kind; uint8_t size; uint8_t data[20]; };
QueueHandle_t events;
BLECharacteristic* statusCharacteristic;
std::atomic<bool> connected(false), disconnected(false), overflow(false);
earlink::Receiver receiver;
earlink::Pager pager;
uint16_t acknowledgedId = 0;
earlink::Result acknowledgedResult = earlink::NONE;

void writeOutput() {
  const auto cells = pager.output();
  if (config::OUTPUT_ENABLED) {
    digitalWrite(config::LATCH_PIN, LOW);
    for (uint8_t i = 0; i < config::CELL_COUNT; ++i) {
      const uint8_t cell = cells[config::REVERSE_CELL_ORDER ? config::CELL_COUNT - 1 - i : i];
      uint8_t bits = 0;
      for (uint8_t dot = 0; dot < 6; ++dot) {
        if (cell & (1u << dot)) bits |= 1u << config::DOT_BITS[dot];
      }
      shiftOut(config::DATA_PIN, config::CLOCK_PIN, LSBFIRST, bits);
    }
    digitalWrite(config::LATCH_PIN, HIGH);
  }
  Serial.printf("[page] id=%u %u/%u cells=%02X,%02X,%02X output=%s\n",
                pager.current.id, pager.active() ? pager.page + 1 : 0, pager.pages(),
                cells[0], cells[1], cells[2], config::OUTPUT_ENABLED ? "GPIO" : "preview");
}

void publishStatus() {
  uint8_t state[16] = {};
  state[0] = 1;
  state[1] = (pager.active() ? 1 : 0) | (pager.automatic ? 2 : 0) |
             (config::OUTPUT_ENABLED ? 4 : 0) | (pager.visible ? 8 : 0);
  earlink::write16(state + 2, acknowledgedId);
  state[4] = acknowledgedResult;
  state[5] = pager.queued();
  earlink::write16(state + 6, pager.current.id);
  earlink::write16(state + 8, pager.active() ? pager.page + 1 : 0);
  earlink::write16(state + 10, pager.pages());
  earlink::write16(state + 12, pager.current.translation.unsupported);
  earlink::write16(state + 14, uint16_t(pager.intervalMs));
  statusCharacteristic->setValue(state, sizeof(state));
  if (connected.load()) statusCharacteristic->notify();
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override { connected.store(true); }
  void onDisconnect(BLEServer*) override { connected.store(false); disconnected.store(true); }
};

class WriteCallbacks : public BLECharacteristicCallbacks {
 public:
  explicit WriteCallbacks(uint8_t eventKind) : kind(eventKind) {}
  void onWrite(BLECharacteristic* characteristic) override {
    const String value = characteristic->getValue();
    Event event{};
    event.kind = kind;
    if (value.length() == 0 || value.length() > sizeof(event.data)) {
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
    case 3: pager.clear(); receiver.reset(); break;
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

void setup() {
  Serial.begin(115200);
  if (config::OUTPUT_ENABLED) {
    pinMode(config::DATA_PIN, OUTPUT);
    pinMode(config::LATCH_PIN, OUTPUT);
    pinMode(config::CLOCK_PIN, OUTPUT);
    digitalWrite(config::CLOCK_PIN, LOW);
    writeOutput(); // Shift and latch zeros; all_off alone would not update the PCB.
  }
  pager.intervalMs = config::PAGE_MS;
  pager.blankMs = config::BLANK_MS;
  pager.holdTimeoutMs = config::HOLD_TIMEOUT_MS;
  events = xQueueCreate(16, sizeof(Event));
  if (!events) { Serial.println("Event queue allocation failed"); return; }
  BLEDevice::init("EarLink");
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService* service = server->createService(SERVICE_UUID);
  auto* textCharacteristic = service->createCharacteristic(TEXT_UUID, BLECharacteristic::PROPERTY_WRITE);
  textCharacteristic->setCallbacks(new WriteCallbacks(1));
  statusCharacteristic = service->createCharacteristic(STATUS_UUID,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_NOTIFY);
  statusCharacteristic->addDescriptor(new BLE2902());
  statusCharacteristic->setCallbacks(new WriteCallbacks(2));
  publishStatus();
  service->start();
  auto* advertising = server->getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->start();
  Serial.println("EarLink ready: 3 cells, 5V/3A configuration. See Config.h for GPIO output setting.");
}

void loop() {
  if (!events) { delay(100); return; }
  if (disconnected.exchange(false)) {
    xQueueReset(events); receiver.reset(); pager.clear();
    acknowledgedId = 0; acknowledgedResult = earlink::NONE;
    writeOutput(); publishStatus();
    BLEDevice::startAdvertising();
  }
  if (overflow.exchange(false)) {
    xQueueReset(events); receiver.reset();
    acknowledgedId = receiver.id; acknowledgedResult = earlink::BAD_PACKET;
    publishStatus();
  }
  const uint32_t now = millis();
  Event event{};
  while (xQueueReceive(events, &event, 0) == pdTRUE) {
    if (!connected.load()) continue;
    if (event.kind == 2) { handleCommand(event, now); continue; }
    const auto result = receiver.accept(event.data, event.size, now);
    if (result == earlink::NONE) continue;
    acknowledgedId = receiver.id;
    acknowledgedResult = result;
    if (result == earlink::ACCEPTED) {
      earlink::Message message;
      message.id = receiver.id;
      message.translation = earlink::translate(receiver.text);
      if (!pager.enqueue(std::move(message), now)) acknowledgedResult = earlink::QUEUE_FULL;
      receiver.reset();
      writeOutput();
    }
    publishStatus();
  }
  if (receiver.receiving && uint32_t(now - receiver.lastAt) >= config::RECEIVE_TIMEOUT_MS) {
    acknowledgedId = receiver.id; acknowledgedResult = earlink::TIMED_OUT;
    receiver.reset(); publishStatus();
  }
  if (pager.tick(now)) { writeOutput(); publishStatus(); }
  delay(2);
}
