#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <atomic>

#include "Config.h"
#include "Protocol.h"
#include "Pager.h"


// =====================================================
// BLE UUID
// =====================================================

static const char* SERVICE_UUID =
    "8f3a0001-7c3b-4b8a-9f52-123456789abc";

static const char* TEXT_UUID =
    "8f3a0002-7c3b-4b8a-9f52-123456789abc";

static const char* STATUS_UUID =
    "8f3a0003-7c3b-4b8a-9f52-123456789abc";


// =====================================================
// BLE 이벤트
// =====================================================

struct Event {
    uint8_t kind;
    uint8_t size;
    uint8_t data[20];
};

QueueHandle_t events;

BLECharacteristic* statusCharacteristic;

std::atomic<bool> connected(false);
std::atomic<bool> disconnected(false);
std::atomic<bool> overflow(false);


// =====================================================
// EARLINK 객체
// =====================================================

earlink::Receiver receiver;
earlink::Pager pager;

uint16_t acknowledgedId = 0;

earlink::Result acknowledgedResult = earlink::NONE;


// =====================================================
// 점자 출력
//
// 실제 하드웨어 동작:
//
// 출력 1 = 점자 내려감
// 출력 0 = 점자 올라감
//
// 따라서 점자가 필요한 위치만 0으로 출력한다.
//
// 평상시:
// 18개 모두 내려감
//
// 점자 표시:
// 필요한 점자만 올라감
//
// 표시 종료:
// 다시 모두 내려감
// =====================================================

void writeOutput()
{
    const auto cells = pager.output();

    if (config::OUTPUT_ENABLED)
    {
        digitalWrite(config::LATCH_PIN, LOW);

        for (uint8_t i = 0; i < config::CELL_COUNT; ++i)
        {
            // 기존 점자 칸 순서 유지
            const uint8_t cell =
                cells[
                    config::REVERSE_CELL_ORDER
                        ? config::CELL_COUNT - 1 - i
                        : i
                ];

            uint8_t bits = 0;

            // =========================================
            // 핵심 수정 부분
            //
            // 점자가 필요한 위치 = 0 = 올라감
            // 점자가 필요 없는 위치 = 1 = 내려감
            // =========================================

            for (uint8_t dot = 0; dot < 6; ++dot)
            {
                const bool shouldRise =
                    (cell & (1u << dot)) != 0;

                const uint8_t outputBit =
                    config::DOT_BITS[dot];

                if (!shouldRise)
                {
                    // 해당 점자 내려가기
                    bits |= uint8_t(1u << outputBit);
                }

                // shouldRise == true 인 경우:
                // 해당 출력 비트를 0으로 유지
                // 실제 점자는 올라감
            }

            // 기존 주영소프트 방식 유지
            shiftOut(
                config::DATA_PIN,
                config::CLOCK_PIN,
                LSBFIRST,
                bits
            );
        }

        // 74HC595 출력 반영
        digitalWrite(config::LATCH_PIN, HIGH);
    }

    Serial.printf(
        "[page] id=%u %u/%u cells=%02X,%02X,%02X output=%s\n",
        pager.current.id,
        pager.active() ? pager.page + 1 : 0,
        pager.pages(),
        cells[0],
        cells[1],
        cells[2],
        config::OUTPUT_ENABLED ? "GPIO" : "preview"
    );
}


// =====================================================
// BLE 상태 전송
// =====================================================

void publishStatus()
{
    uint8_t state[16] = {};

    state[0] = 1;

    state[1] =
        (pager.active() ? 1 : 0) |
        (pager.automatic ? 2 : 0) |
        (config::OUTPUT_ENABLED ? 4 : 0) |
        (pager.visible ? 8 : 0);

    earlink::write16(
        state + 2,
        acknowledgedId
    );

    state[4] = acknowledgedResult;

    state[5] = pager.queued();

    earlink::write16(
        state + 6,
        pager.current.id
    );

    earlink::write16(
        state + 8,
        pager.active() ? pager.page + 1 : 0
    );

    earlink::write16(
        state + 10,
        pager.pages()
    );

    earlink::write16(
        state + 12,
        pager.current.translation.unsupported
    );

    earlink::write16(
        state + 14,
        uint16_t(pager.intervalMs)
    );

    statusCharacteristic->setValue(
        state,
        sizeof(state)
    );

    if (connected.load())
    {
        statusCharacteristic->notify();
    }
}


// =====================================================
// BLE 연결 콜백
// =====================================================

class ServerCallbacks : public BLEServerCallbacks
{
    void onConnect(BLEServer*) override
    {
        connected.store(true);

        Serial.println("[BLE] Connected");
    }

    void onDisconnect(BLEServer*) override
    {
        connected.store(false);
        disconnected.store(true);

        Serial.println("[BLE] Disconnected");
    }
};


// =====================================================
// BLE 데이터 수신 콜백
// =====================================================

class WriteCallbacks : public BLECharacteristicCallbacks
{
public:

    explicit WriteCallbacks(uint8_t eventKind)
        : kind(eventKind)
    {
    }

    void onWrite(BLECharacteristic* characteristic) override
    {
        const String value = characteristic->getValue();

        Event event{};

        event.kind = kind;

        if (
            value.length() == 0 ||
            value.length() > sizeof(event.data)
        )
        {
            overflow.store(true);
            return;
        }

        event.size = uint8_t(value.length());

        memcpy(
            event.data,
            value.c_str(),
            event.size
        );

        if (
            xQueueSend(
                events,
                &event,
                0
            ) != pdTRUE
        )
        {
            overflow.store(true);
        }
    }

private:

    uint8_t kind;
};


// =====================================================
// BLE 명령어 처리
// =====================================================

void handleCommand(
    const Event& event,
    uint32_t now
)
{
    if (
        event.size < 2 ||
        event.data[0] != 1
    )
    {
        return;
    }

    switch (event.data[1])
    {
        // 다음 페이지
        case 1:
            pager.setAutomatic(false, now);
            pager.next(now);
            break;

        // 이전 페이지
        case 2:
            pager.setAutomatic(false, now);
            pager.previous(now);
            break;

        // 전체 초기화
        case 3:
            pager.clear();
            receiver.reset();
            break;

        // 자동 넘김 OFF
        case 4:
            pager.setAutomatic(false, now);
            break;

        // 자동 넘김 ON
        case 5:
            pager.setAutomatic(true, now);
            break;

        // 페이지 간격 변경
        case 6:
        {
            if (event.size == 4)
            {
                const uint16_t interval =
                    earlink::read16(event.data + 2);

                if (
                    interval >= 1000 &&
                    interval <= 10000
                )
                {
                    pager.intervalMs = interval;
                }
            }

            break;
        }

        default:
            return;
    }

    writeOutput();

    publishStatus();
}


// =====================================================
// ESP32 초기 설정
// =====================================================

void setup()
{
    Serial.begin(115200);

    // =========================================
    // 점자 출력 GPIO 초기화
    // =========================================

    if (config::OUTPUT_ENABLED)
    {
        pinMode(config::DATA_PIN, OUTPUT);
        pinMode(config::LATCH_PIN, OUTPUT);
        pinMode(config::CLOCK_PIN, OUTPUT);

        digitalWrite(config::DATA_PIN, LOW);
        digitalWrite(config::CLOCK_PIN, LOW);
        digitalWrite(config::LATCH_PIN, LOW);

        delay(100);

        // =====================================
        // ESP32 시작 시 18개 모두 내려가기
        //
        // pager.output()이 빈 점자 상태라면
        // 각 점자 칸의 6개 출력 비트를 1로 설정
        // =====================================

        writeOutput();

        Serial.println(
            "[BRAILLE] Initial output sent (all dots DOWN)"
        );
    }

    // =========================================
    // 페이지 설정
    // =========================================

    pager.intervalMs =
        config::PAGE_MS;

    pager.blankMs =
        config::BLANK_MS;

    pager.holdTimeoutMs =
        config::HOLD_TIMEOUT_MS;

    // =========================================
    // 이벤트 큐 생성
    // =========================================

    events = xQueueCreate(
        16,
        sizeof(Event)
    );

    if (!events)
    {
        Serial.println(
            "[ERROR] Event queue allocation failed"
        );

        return;
    }

    // =========================================
    // BLE 초기화
    // =========================================

    BLEDevice::init("EarLink");

    BLEServer* server =
        BLEDevice::createServer();

    server->setCallbacks(
        new ServerCallbacks()
    );

    BLEService* service =
        server->createService(SERVICE_UUID);

    // =========================================
    // TEXT characteristic
    // =========================================

    auto* textCharacteristic =
        service->createCharacteristic(
            TEXT_UUID,
            BLECharacteristic::PROPERTY_WRITE
        );

    textCharacteristic->setCallbacks(
        new WriteCallbacks(1)
    );

    // =========================================
    // STATUS characteristic
    // =========================================

    statusCharacteristic =
        service->createCharacteristic(
            STATUS_UUID,

            BLECharacteristic::PROPERTY_READ |
            BLECharacteristic::PROPERTY_WRITE |
            BLECharacteristic::PROPERTY_NOTIFY
        );

    statusCharacteristic->addDescriptor(
        new BLE2902()
    );

    statusCharacteristic->setCallbacks(
        new WriteCallbacks(2)
    );

    publishStatus();

    // =========================================
    // BLE 서비스 시작
    // =========================================

    service->start();

    auto* advertising =
        server->getAdvertising();

    advertising->addServiceUUID(
        SERVICE_UUID
    );

    advertising->setScanResponse(true);

    advertising->start();

    Serial.println();
    Serial.println("==================================");
    Serial.println(" EARLINK READY");
    Serial.println("==================================");

    Serial.println("[BLE] Device name: EarLink");
    Serial.println("[BRAILLE] 3 cells / 18 dots");
    Serial.println("[BRAILLE] Polarity: inverted");
    Serial.println("[BRAILLE] 1 = DOWN / 0 = UP");
    Serial.println("[BRAILLE] Initial state: DOWN");

    Serial.println("==================================");
}


// =====================================================
// 메인 루프
// =====================================================

void loop()
{
    if (!events)
    {
        delay(100);
        return;
    }

    // =========================================
    // BLE 연결 해제
    // =========================================

    if (disconnected.exchange(false))
    {
        xQueueReset(events);

        receiver.reset();

        pager.clear();

        acknowledgedId = 0;
        acknowledgedResult = earlink::NONE;

        // 메시지가 없어졌으므로 전체 점자 내려감
        writeOutput();

        publishStatus();

        BLEDevice::startAdvertising();

        Serial.println(
            "[BRAILLE] Disconnected - all dots DOWN"
        );
    }

    // =========================================
    // 수신 버퍼 초과
    // =========================================

    if (overflow.exchange(false))
    {
        xQueueReset(events);

        receiver.reset();

        acknowledgedId = receiver.id;
        acknowledgedResult = earlink::BAD_PACKET;

        publishStatus();
    }

    const uint32_t now = millis();

    Event event{};

    // =========================================
    // BLE 이벤트 처리
    // =========================================

    while (
        xQueueReceive(
            events,
            &event,
            0
        ) == pdTRUE
    )
    {
        if (!connected.load())
        {
            continue;
        }

        // =====================================
        // 명령어 수신
        // =====================================

        if (event.kind == 2)
        {
            handleCommand(
                event,
                now
            );

            continue;
        }

        // =====================================
        // 텍스트 패킷 수신
        // =====================================

        const auto result =
            receiver.accept(
                event.data,
                event.size,
                now
            );

        if (result == earlink::NONE)
        {
            continue;
        }

        acknowledgedId = receiver.id;
        acknowledgedResult = result;

        // =====================================
        // 정상 메시지 수신
        // =====================================

        if (result == earlink::ACCEPTED)
        {
            earlink::Message message;

            message.id = receiver.id;

            // 기존 한글 점자 변환 기능 유지
            message.translation =
                earlink::translate(
                    receiver.text
                );

            // 페이지 큐에 등록
            if (
                !pager.enqueue(
                    std::move(message),
                    now
                )
            )
            {
                acknowledgedResult =
                    earlink::QUEUE_FULL;
            }

            receiver.reset();

            // 변환된 점자를 실제 솔레노이드에 출력
            writeOutput();
        }

        publishStatus();
    }

    // =========================================
    // BLE 수신 타임아웃
    // =========================================

    if (
        receiver.receiving &&
        uint32_t(
            now - receiver.lastAt
        ) >= config::RECEIVE_TIMEOUT_MS
    )
    {
        acknowledgedId = receiver.id;

        acknowledgedResult =
            earlink::TIMED_OUT;

        receiver.reset();

        publishStatus();
    }

    // =========================================
    // 자동 페이지 넘김
    // =========================================

    if (pager.tick(now))
    {
        // 페이지 변경 시 점자 출력 갱신
        writeOutput();

        publishStatus();
    }

    delay(2);
}