#include <cassert>
#include <fstream>
#include <iostream>
#include <iterator>
#include "../earlink/BrailleText.h"
#include "../earlink/Protocol.h"
#include "../earlink/Pager.h"

using namespace earlink;

static Message message(uint16_t id, std::initializer_list<uint8_t> cells) {
  Message result; result.id = id; result.translation.cells = cells; return result;
}

static void translationTests() {
  assert(translate(u8"한글").cells == std::vector<uint8_t>({dots("245"), dots("126"), dots("25"), dots("4"), dots("246"), dots("2")}));
  assert(translate(u8"아").cells == std::vector<uint8_t>({dots("126")}));
  assert(translate(u8"아예").cells == std::vector<uint8_t>({dots("126"), dots("36"), dots("34")}));
  assert(translate(u8"우애").cells == std::vector<uint8_t>({dots("134"), dots("36"), dots("1235")}));
  assert(translate(u8"꿇").cells == std::vector<uint8_t>({dots("6"), dots("4"), dots("134"), dots("2"), dots("356")}));
  assert(translate(u8"있").cells == std::vector<uint8_t>({dots("135"), dots("34")}));
  assert(translate("123").cells == std::vector<uint8_t>({dots("3456"), dots("1"), dots("12"), dots("14")}));
  assert(translate("Aa").cells == std::vector<uint8_t>({dots("356"), dots("6"), dots("1"), dots("1"), dots("256")}));
  assert(translate(u8"😀").unsupported == 1);
  assert(translate(u8"ㄱ").unsupported == 1);
  assert(translate(u8"⠁⠂⠄").cells == std::vector<uint8_t>({1, 2, 4}));
  assert(translate(std::string("\xf0\x80\x80\x80", 4)).unsupported == 1);
  // All modern syllables must stay within 6-dot cells with bounded expansion.
  for (uint32_t cp = 0xac00; cp <= 0xd7a3; ++cp) {
    std::string s;
    s += char(0xe0 | (cp >> 12)); s += char(0x80 | ((cp >> 6) & 63)); s += char(0x80 | (cp & 63));
    const auto translated = translate(s);
    assert(!translated.cells.empty() && translated.cells.size() <= 6 && translated.unsupported == 0);
    for (const auto cell : translated.cells) assert(cell < 64);
  }
}

static void pagerTests() {
  Pager p;
  assert(p.enqueue(message(1, {1, 2, 3, 4}), 0));
  assert(p.pages() == 2 && p.output() == (std::array<uint8_t, 3>{1, 2, 3}));
  assert(!p.tick(2999)); assert(p.tick(3000));
  assert(p.output() == (std::array<uint8_t, 3>{0, 0, 0}));
  assert(!p.tick(3249)); assert(p.tick(3250));
  assert(p.output() == (std::array<uint8_t, 3>{4, 0, 0}));
  assert(p.enqueue(message(2, {5}), 3251));
  assert(p.enqueue(message(3, {6}), 3251));
  assert(p.enqueue(message(4, {7}), 3251));
  assert(!p.enqueue(message(5, {8}), 3251));
  assert(p.tick(6250)); assert(!p.active());
  assert(p.tick(6500)); assert(p.current.id == 2);
  p.clear(); assert(!p.active() && p.queued() == 0 && !p.visible);
  p.setAutomatic(false, 0);
  assert(p.enqueue(message(9, {1, 2, 3, 4, 5, 6, 7}), 0));
  assert(!p.tick(3000)); assert(p.tick(10000)); assert(!p.visible);
  p.previous(10001); assert(p.tick(10251)); assert(p.visible && p.page == 0);
  p.next(10252); assert(p.tick(10502)); assert(p.page == 1);
  p.previous(10503); assert(p.tick(10753)); assert(p.page == 0);
  p.clear();
  p.setAutomatic(true, 0xfffffff0);
  assert(p.enqueue(message(10, {1}), 0xfffffff0));
  assert(p.tick(uint32_t(0xfffffff0u + 3000u))); // millis wraparound
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
}

int main(int argc, char** argv) {
  assert(argc == 3);
  translationTests(); pagerTests(); receiverTests(argv[1], argv[2]);
  std::cout << "PASS: translation, 11172 syllable bounds, pagination, queue, timing, browser-to-firmware packets\n";
}
