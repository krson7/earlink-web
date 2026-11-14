#include <cassert>
#include <fstream>
#include <iostream>
#include <iterator>
#include "../earlink/BrailleText.h"
#include "../earlink/Protocol.h"
#include "../earlink/Pager.h"
#include "../earlink/BrailleMapping.h"
#include "../earlink/DisplayController.h"

using namespace earlink;

static Message message(uint16_t id, std::initializer_list<uint8_t> cells) {
  Message result; result.id = id; result.translation.cells = cells; return result;
}
static void collectIssues(const Audit& audit, void* context) {
  if (audit.issue) static_cast<std::vector<Audit>*>(context)->push_back(audit);
}

static void translationTests() {
  assert(translate(u8"한글").cells == std::vector<uint8_t>({dots("245"), dots("25"), dots("4"), dots("2346")}));
  assert(translate(u8"아").cells == std::vector<uint8_t>({dots("126")}));
  assert(translate(u8"아예").cells == std::vector<uint8_t>({dots("126"), dots("36"), dots("34")}));
  assert(translate(u8"우애").cells == std::vector<uint8_t>({dots("134"), dots("36"), dots("1235")}));
  assert(translate(u8"꿇").cells == std::vector<uint8_t>({dots("6"), dots("4"), dots("12346"), dots("356")}));
  assert(translate(u8"있").cells == std::vector<uint8_t>({dots("135"), dots("34")}));
  assert(translate("123").cells == std::vector<uint8_t>({dots("3456"), dots("1"), dots("12"), dots("14")}));
  assert(translate("Aa").cells == std::vector<uint8_t>({dots("356"), dots("6"), dots("1"), dots("1"), dots("256")}));
  assert(translate(u8"😀").unsupported == 1);
  std::vector<Audit> issues;
  const auto incomplete = translate(u8"가😀나", collectIssues, &issues);
  assert(incomplete.unsupported == 1 && issues.size() == 1);
  assert(issues[0].byteOffset == 3 && issues[0].characterOffset == 1 && issues[0].codepoint == 0x1f600);
  issues.clear();
  translate(u8"가😀", collectIssues, &issues);
  assert(issues.size() == 1 && issues[0].byteOffset == 6 && issues[0].characterOffset == 2);
  assert(translate(u8"ㄱ").unsupported == 0);
  assert(translate(u8"⠁⠂⠄").cells == std::vector<uint8_t>({1, 2, 4}));
  assert(translate(std::string("\xf0\x80\x80\x80", 4)).unsupported == 1);
  for (const auto& bad : {std::string("\xc0\xaf", 2), std::string("\xed\xa0\x80", 3),
                        std::string("\xf4\x90\x80\x80", 4), std::string("\xe3\x80", 2)})
    assert(translate(bad).unsupported == 1);
  assert(translate(std::string("\xe3", 1) + "7").cells == translate("7").cells);
  assert(translate(std::string(4097, '7')).unsupported == 1);
  const auto longNumber = translate(std::string(4096, '7'));
  assert(longNumber.unsupported == 0 && longNumber.cells.size() == 4097);
  const auto maximum = translate(std::string(4096, '*'));
  assert(maximum.cells.size() <= MAX_TRANSLATION_CELLS);
  std::string expanding;
  for (unsigned i = 0; i < 1756; ++i) expanding += "? ";
  const auto exactLimit = translate(expanding + "7777777");
  assert(exactLimit.unsupported == 0 && exactLimit.cells.size() == MAX_TRANSLATION_CELLS);
  issues.clear();
  const auto overflowLimit = translate(expanding + "77777777", collectIssues, &issues);
  assert(overflowLimit.unsupported == 1 && issues.size() == 1);
  assert(std::string(issues[0].rule) == "LIMIT.output-cells");
  assert(overflowLimit.cells.size() == MAX_TRANSLATION_CELLS);
  expanding.clear();
  for (unsigned i = 0; i < 2048; ++i) expanding += "? ";
  assert(expanding.size() == MAX_TEXT_BYTES && translate(expanding).unsupported == 1);
  assert(translate(u8"한글").cells == translate(u8"한글").cells);
  // All modern syllables must stay within 6-dot cells with bounded expansion.
  for (uint32_t cp = 0xac00; cp <= 0xd7a3; ++cp) {
    std::string s;
    s += char(0xe0 | (cp >> 12)); s += char(0x80 | ((cp >> 6) & 63)); s += char(0x80 | (cp & 63));
    const auto translated = translate(s);
    assert(!translated.cells.empty() && translated.cells.size() <= 6 && translated.unsupported == 0);
    for (const auto cell : translated.cells) assert(cell < 64);
    const uint32_t n = cp - 0xac00;
    const uint32_t jamo[] = {0x1100 + n/588, 0x1161 + n%588/28, 0x11a7 + n%28};
    std::string decomposed;
    for (size_t index = 0; index < (n%28 ? 3u : 2u); ++index) {
      const auto j = jamo[index];
      decomposed += char(0xe0 | (j >> 12));
      decomposed += char(0x80 | ((j >> 6) & 63));
      decomposed += char(0x80 | (j & 63));
    }
    assert(translate(decomposed).cells == translated.cells);
  }
}

static void mappingTests() {
  using namespace earlink::mapping;
  assert(validate(LOGICAL_TO_CHANNEL).valid());
  auto bad = LOGICAL_TO_CHANNEL;
  bad[0] = 0;
  assert(validate(bad).outOfRange && validate(bad).missingChannels && validate(bad).invalidPositions);
  assert(shiftBytes({{63,63,63}}, bad) == (std::array<uint8_t,3>{{0,0,0}}));
  bad = LOGICAL_TO_CHANNEL; bad[0] = 19; assert(validate(bad).outOfRange);
  bad = LOGICAL_TO_CHANNEL; bad[0] = bad[1];
  assert(validate(bad).duplicate && validate(bad).missingChannels);
  const std::array<uint8_t,18> crossCell = {{1,7,13,2,8,14,3,9,15,4,10,16,5,11,17,6,12,18}};
  assert(validate(crossCell).valid());
  for (size_t dot = 0; dot < 18; ++dot) {
    std::array<uint8_t,3> cells = {{0,0,0}}; cells[dot/6] = uint8_t(1u << (dot%6));
    const auto output = shiftBytes(cells, crossCell);
    const auto channel = crossCell[dot] - 1;
    for (size_t byte = 0; byte < 3; ++byte)
      assert(output[byte] == (byte == size_t(2-channel/6) ? (1 << (channel%6)) : 0));
  }
  // Independent geometry: the user's layout as horizontal rows, viewed from
  // the reading side. Do not derive this oracle from LOGICAL_TO_CHANNEL.
  const uint8_t physicalRows[3][6] = {
    {1, 2, 12, 11, 18, 17},
    {3, 4, 10,  9, 16, 15},
    {5, 6,  8,  7, 14, 13}
  };
  // Each requested lowering bit must signal its specified solenoid, HIGH=DOWN.
  for (size_t row = 0; row < 3; ++row) for (size_t column = 0; column < 6; ++column) {
    std::array<uint8_t,3> cells = {{0,0,0}};
    cells[column/2] = uint8_t(1u << (row + 3*(column%2)));
    std::array<uint8_t,3> expected = {{0,0,0}};
    const auto channel = physicalRows[row][column] - 1;
    expected[2-channel/6] |= uint8_t(1u << (channel%6));
    assert(shiftBytes(cells) == expected);
  }
  assert(shiftBytes({{0,0,0}}) == (std::array<uint8_t,3>{{0,0,0}}));
  assert(shiftBytes({{63,63,63}}) == (std::array<uint8_t,3>{{63,63,63}}));
  assert(shiftBytes({{1,2,4}}) == (std::array<uint8_t,3>{{2,8,1}}));
  // Exhaustive comparison against the physical geometry for all 18-bit pages.
  for (unsigned a = 0; a < 64; ++a) for (unsigned b = 0; b < 64; ++b) for (unsigned c = 0; c < 64; ++c) {
    const std::array<uint8_t,3> cells = {{uint8_t(a),uint8_t(b),uint8_t(c)}};
    std::array<uint8_t,3> expected = {{0,0,0}};
    for (size_t row = 0; row < 3; ++row) for (size_t column = 0; column < 6; ++column) {
      if (!(cells[column/2] & (1u << (row + 3*(column%2))))) continue;
      const auto channel = physicalRows[row][column] - 1;
      expected[2-channel/6] |= uint8_t(1u << (channel%6));
    }
    assert(shiftBytes(cells) == expected);
  }
}

static void connectionWaveTests() {
  const std::array<uint8_t,3> released = {{0,0,0}};
  // Expected serial bytes from the user's six physical columns and working
  // data[2] -> data[0] test. Only one group of three channels may be HIGH.
  const std::array<uint8_t,3> expected[] = {
    {{0,0,0x15}}, {{0,0,0x2a}}, {{0,0x2a,0}},
    {{0,0x15,0}}, {{0x2a,0,0}}, {{0x15,0,0}}
  };
  ConnectionWave wave;
  assert(!wave.active() && wave.output() == released && !wave.tick(100000));
  wave.start(100);
  uint32_t now = 100;
  for (size_t column = 0; column < 6; ++column) {
    assert(wave.active() && mapping::shiftBytes(wave.output()) == expected[column]);
    assert(!wave.tick(now + 199));
    assert(mapping::shiftBytes(wave.output()) == expected[column]);
    assert(wave.tick(now + 200));
    assert(wave.output() == released);
    if (column < 5) {
      assert(wave.active() && !wave.tick(now + 249));
      assert(wave.tick(now + 250));
      now += 250;
    }
  }
  assert(!wave.active() && !wave.tick(100000));
  wave.start(0xffffff80u);
  assert(!wave.tick(uint32_t(0xffffff80u + 199u)));
  assert(wave.tick(uint32_t(0xffffff80u + 200u)) && wave.output() == released);
  wave.cancel(); assert(!wave.active() && wave.output() == released);
  wave.start(42); assert(mapping::shiftBytes(wave.output()) == expected[0]);

  DisplayController display;
  display.startConnectionWave(0);
  assert(display.pager.enqueue(message(1, {1,2,3,4}), 10));
  assert(!display.pageVisible());
  assert(mapping::shiftBytes(display.output()) == expected[0]);
  for (uint32_t at = 200; at <= 1450; at += 250) {
    assert(display.tick(at));
    if (at < 1450) { assert(display.output() == released); assert(display.tick(at + 50)); }
  }
  assert(!display.wave.active() && display.pageVisible());
  assert(display.pager.page == 0 && display.output() == (std::array<uint8_t,3>{{62,61,60}}));
  assert(!display.tick(3449)); // Full 2000ms starts AFTER the wave, not at enqueue.
  assert(display.tick(3450) && display.output() == released);
  assert(display.tick(3700) && display.output() == (std::array<uint8_t,3>{{59,63,63}}));
  display.startConnectionWave(5000);
  assert(!display.pager.active());
  display.clear(); // Both disconnect and explicit clear must cancel the wave.
  assert(!display.wave.active() && !display.pageVisible() && display.output() == released);
  assert(!display.tick(100000));
  display.startConnectionWave(100001);
  assert(mapping::shiftBytes(display.output()) == expected[0]);
  display.clear();
  // A delayed/idle loop never starts a wave or energizes the default output.
  assert(!display.tick(200000) && mapping::shiftBytes(display.output()) == released);
}

static void raisedBrailleOutputTests() {
  const std::array<uint8_t,3> released = {{0,0,0}};
  DisplayController display;
  assert(mapping::shiftBytes(display.output()) == released);
  assert(display.pager.enqueue(message(1, {1,1,1}), 0));
  // Dot 1 must stay UP in each cell. All other dots go DOWN.
  assert(mapping::shiftBytes(display.output()) == (std::array<uint8_t,3>{{0x1f,0x1f,0x3e}}));
  // Independent horizontal geometry; do not use LOGICAL_TO_CHANNEL or the
  // controller's inversion formula to calculate the expected electrical state.
  const uint8_t rows[3][6] = {
    {1,2,12,11,18,17}, {3,4,10,9,16,15}, {5,6,8,7,14,13}
  };
  for (unsigned a = 0; a < 64; ++a) for (unsigned b = 0; b < 64; ++b) for (unsigned c = 0; c < 64; ++c) {
    auto& cells = display.pager.current.translation.cells;
    cells[0] = uint8_t(a); cells[1] = uint8_t(b); cells[2] = uint8_t(c);
    std::array<uint8_t,3> expected = released;
    for (size_t row = 0; row < 3; ++row) for (size_t column = 0; column < 6; ++column) {
      const bool mustStayRaised = (cells[column/2] & (1u << (row + 3*(column%2)))) != 0;
      if (!mustStayRaised) {
        const auto channel = rows[row][column] - 1;
        expected[2-channel/6] |= uint8_t(1u << (channel%6));
      }
    }
    assert(mapping::shiftBytes(display.output()) == expected);
  }
  display.clear(); assert(display.output() == released);
  assert(display.pager.enqueue(message(2, {0}), 0));
  // A displayed blank/padding must be DOWN, while IDLE remains entirely UP.
  assert(display.pageVisible() && display.output() == (std::array<uint8_t,3>{{63,63,63}}));
  assert(display.tick(2000) && display.output() == released);
  assert(display.tick(2250) && !display.pageVisible() && display.output() == released);
  display.pager.setAutomatic(false, 0);
  assert(display.pager.enqueue(message(3, {1}), 0));
  assert(display.output() == (std::array<uint8_t,3>{{62,63,63}}));
  assert(display.tick(10000) && display.output() == released);
  display.pager.previous(10001);
  assert(display.tick(10251) && display.output() == (std::array<uint8_t,3>{{62,63,63}}));
  display.clear(); assert(display.output() == released);
  const auto translated = translate(u8"가나다");
  assert(translated.unsupported == 0);
  Message word; word.id = 4; word.translation = translated;
  assert(display.pager.enqueue(std::move(word), 0));
  assert(mapping::shiftBytes(display.output()) == (std::array<uint8_t,3>{{0x27,0x0f,0x18}}));
}

static void pagerTests() {
  Pager p;
  assert(p.enqueue(message(1, {1, 2, 3, 4}), 0));
  assert(p.pages() == 2 && p.output() == (std::array<uint8_t, 3>{1, 2, 3}));
  assert(!p.tick(1999)); assert(p.tick(2000));
  assert(p.output() == (std::array<uint8_t, 3>{0, 0, 0}));
  assert(!p.tick(2249)); assert(p.tick(2250));
  assert(p.output() == (std::array<uint8_t, 3>{4, 0, 0}));
  assert(p.enqueue(message(2, {5}), 2251));
  assert(p.enqueue(message(3, {6}), 2251));
  assert(p.enqueue(message(4, {7}), 2251));
  assert(!p.enqueue(message(5, {8}), 2251));
  assert(p.tick(4250)); assert(!p.active());
  assert(p.tick(4500)); assert(p.current.id == 2);
  p.clear(); assert(!p.active() && p.queued() == 0 && !p.visible);
  assert(!p.enqueue(message(8, {}), 0));
  Message rejected = message(8, {1}); rejected.translation.unsupported = 1;
  assert(!p.enqueue(std::move(rejected), 0));
  Message enormous; enormous.translation.cells.resize(MAX_TRANSLATION_CELLS + 1);
  assert(!p.enqueue(std::move(enormous), 0));
  p.setAutomatic(false, 0);
  assert(p.enqueue(message(9, {1, 2, 3, 4, 5, 6, 7}), 0));
  assert(!p.tick(3000)); assert(p.tick(10000)); assert(!p.visible);
  p.previous(10001); assert(p.tick(10251)); assert(p.visible && p.page == 0);
  p.next(10252); assert(p.tick(10502)); assert(p.page == 1);
  p.previous(10503); assert(p.tick(10753)); assert(p.page == 0);
  p.clear();
  p.setAutomatic(true, 0xfffffff0);
  assert(p.enqueue(message(10, {1}), 0xfffffff0));
  assert(p.tick(uint32_t(0xfffffff0u + 2000u))); // millis wraparound
}

static void receiverTests(const char* packetsPath, const char* textPath) {
  Receiver r;
  std::ifstream packets(packetsPath, std::ios::binary);
  std::ifstream textFile(textPath, std::ios::binary);
  assert(packets.good() && textFile.good());
  const std::string expected((std::istreambuf_iterator<char>(textFile)), std::istreambuf_iterator<char>());
  Result last = NONE;
  uint32_t now = 0;
  for (int length; (length = packets.get()) != EOF;) {
    uint8_t bytes[20]{};
    assert(length > 0 && length <= 20);
    packets.read(reinterpret_cast<char*>(bytes), length);
    assert(packets.gcount() == length);
    last = r.accept(bytes, size_t(length), now++);
    assert(last == NONE || last == ACCEPTED);
  }
  assert(last == ACCEPTED && r.id == 513 && r.text == expected);
  const uint8_t begin[] = {0x45, 0x4c, 1, 1, 1, 0, 3, 0};
  const uint8_t incomplete[] = {0x45, 0x4c, 1, 3, 1, 0};
  assert(r.accept(begin, sizeof(begin), 0) == NONE);
  assert(r.accept(incomplete, sizeof(incomplete), 1) == OUT_OF_ORDER);
  assert(r.accept(begin, sizeof(begin), 2) == NONE);
  const uint8_t outOfOrder[] = {0x45, 0x4c, 1, 2, 1, 0, 1, 0, 'a'};
  assert(r.accept(outOfOrder, sizeof(outOfOrder), 3) == OUT_OF_ORDER);
  const uint8_t tooLong[] = {0x45, 0x4c, 1, 1, 1, 0, 1, 16};
  assert(r.accept(tooLong, sizeof(tooLong), 4) == TOO_LONG);
  assert(!r.receiving);
  assert(r.accept(nullptr, 20, 5) == BAD_PACKET);
  uint8_t oversized[21]{}; assert(r.accept(oversized, sizeof(oversized), 6) == BAD_PACKET);
}

int main(int argc, char** argv) {
  assert(argc == 3);
  translationTests(); mappingTests(); raisedBrailleOutputTests(); connectionWaveTests(); pagerTests(); receiverTests(argv[1], argv[2]);
  std::cout << "PASS: 11172 syllable bounds; 262144 lowering-mask and 262144 raised-braille electrical comparisons; blank/padding/manual expiry/idle polarity; six-column wave/timing/cancel/reconnect/page handover; browser packets. Device execution UNVERIFIED.\n";
}
