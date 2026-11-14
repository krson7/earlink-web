// Perkins key input: braille cells -> text (BrailleInput.h), chords (KeyInput.h)
// and the device -> web framing (InputSender.h).
// Usage: input_test <fixture.bin> <expected.json>
// The fixture holds real InputSender packets ([length][packet]...) for
// tests/earlink-input.test.mjs, which reassembles them with the web code.
#include <cstdio>
#include <fstream>
#include <map>
#include <string>
#include <vector>
#include "../earlink/BrailleText.h"
#include "../earlink/BrailleInput.h"
#include "../earlink/KeyInput.h"
#include "../earlink/InputSender.h"

using namespace earlink;
static int failures = 0;

static void check(bool ok, const std::string& what) {
  if (ok) return;
  ++failures;
  std::printf("FAIL %s\n", what.c_str());
}
static std::string character(uint32_t cp) { std::string s; input::appendUtf8(s, cp); return s; }

// text -> cells (firmware translator) -> typed into Composer -> text.
// Whatever comes back must translate to exactly the typed cells again.
static std::string roundTrip(const std::string& text) {
  const Translation typed = translate(text);
  input::Composer composer(100000);
  for (const uint8_t cell : typed.cells) composer.add(cell);
  const std::string read = composer.text();
  const Translation again = translate(read);
  check(!again.unsupported && again.cells == typed.cells, "cell-exact: " + text + " -> " + read);
  return read;
}
static void expect(const std::string& text, const std::string& want) {
  const std::string got = roundTrip(text);
  check(got == want, "read " + text + " -> " + got + ", expected " + want);
}

static void sentences() {
  const char* const same[] = {
    "안녕하세요", "가방", "그래서 밥을 먹었어요.", "오늘 3시에 만나요.", "밥 먹었어?", "가격은 5,000원입니다!",
    "ㅋㅋㅋ 진짜?", "진짜ㅋㅋ", "ㅠㅠ", "ㅎㅎ 좋아", "아예 몰라", "얘기해", "야애", "와애", "와!", "같이 가자",
    "집 앞 카페", "끝.", "숲 속", "부엌", "그런데 왜?", "그리하여", "그러므로", "그러면서", "것", "껏", "성공",
    "정말", "청소", "셩", "옹기", "옹", "섞다", "읊다", "닭", "값", "삶", "않다", "괜찮아", "웨딩", "쉬어", "뛰어",
    "의자", "희망", "1.5", "3,000", "10시 30분", "2층", "1월", "3원", "사과", "싸다", "까치", "차", "팠다",
    "나아가", "자아", "음...", "뭐…", "뭐?!", "가?", "가.", "가!", "아...", "오케이~", "점심: 김밥", "나/너",
    "만났다", "탔어", "잤다", "바빴다", "지혜", "은혜", "혜택", "예", "쇠", "의의", "영어", "연필",
  };
  for (const char* text : same) expect(text, text);
  // Same braille, different reading: documented preferences.
  expect("3명", "3 명");   // K44 blank after a number
  expect("2통", "2 통");
  expect("아.", "앞");      // final ㅍ = '.'; 앞 is in FINAL_NOUNS
  expect("옹!", "ㅋ");      // 123456 + 235 at word start reads as jamo
  expect("녜", "났");       // ㅖ and final ㅆ are both 34
  expect("핬", "혜");
  // Outside the input scope: sent as Unicode braille, still cell-exact.
  for (const char* text : {"a/b", "(웃음)"}) {
    const std::string got = roundTrip(text);
    check(got.find("\xe2\xa0") != std::string::npos, std::string("raw braille for ") + text);
  }
  // Preview of a syllable still being typed: an initial alone stays raw.
  input::Composer composer;
  for (const uint8_t cell : translate("고").cells) composer.add(cell);
  composer.erase();
  check(composer.text() == character(0x2808), "dangling initial ㄱ previews as ⠈");
}

static void exhaustive() {
  struct Context { const char* before; const char* after; };
  const Context contexts[] = {
    {"", "다"}, {"", "아"}, {"", "애"}, {"", "예"}, {"", "이"}, {"", "요"}, {"", "어"}, {"", "우"},
    {"", "의"}, {"", "와"}, {"아", "다"}, {"야", "다"}, {"와", "다"}, {"우", "다"}, {"워", "다"},
    {"가", "다"}, {"나", "다"}, {"", ""}
  };
  long total = 0, known = 0, endMark = 0;
  for (const auto& context : contexts) {
    for (uint32_t cp = 0xac00; cp <= 0xd7a3; ++cp) {
      const std::string text = std::string(context.before) + character(cp) + context.after;
      ++total;
      if (roundTrip(text) == text) continue;
      const int l = int((cp - 0xac00) / 588), v = int((cp - 0xac00) % 588 / 28), t = int((cp - 0xac00) % 28);
      // ㅖ (34) and final ㅆ (34) after an initial that is also its ㅏ contraction.
      const bool shared = *rules::A_SYLLABLE[l] && std::string(rules::A_SYLLABLE[l]) == rules::INITIAL[l];
      if (shared && (v == 7 || (v == 0 && t == 20))) { ++known; continue; }
      // 옹 + ㅜ/예 at word start reads as jamo (123456 + 134 / 34).
      if (cp == 0xc639 && (std::string(context.after) == "우" || std::string(context.after) == "예")) { ++known; continue; }
      // A lone syllable ending in ㄾ ㄿ ㅋ ㅌ ㅍ reads as a mark (. ? !).
      if (!*context.before && !*context.after && (t == 13 || t == 14 || t == 24 || t == 25 || t == 26)) { ++endMark; continue; }
      check(false, "context " + text);
    }
  }
  std::printf("input exhaustive: %ld texts, all cell-exact; %ld shared ㅖ/ㅆ or 옹 readings, %ld lone final-as-mark\n",
              total, known, endMark);
}

static void chords() {
  using namespace config::keyrole;
  keys::ChordReader reader;
  uint32_t now = 0;
  std::vector<keys::Event> events;
  auto hold = [&](uint16_t mask, uint32_t ms) {
    for (uint32_t i = 0; i < ms; i += 2, now += 2) {
      const auto event = reader.update(mask, now);
      if (event.action != keys::Action::NONE) events.push_back(event);
    }
  };
  auto expectOne = [&](const char* name, keys::Action action, uint8_t cell) {
    check(events.size() == 1 && events[0].action == action && events[0].cell == cell, std::string("chord ") + name);
    events.clear();
  };
  hold(DOT1, 10); hold(DOT1 | DOT2, 15); hold(DOT1 | DOT2 | DOT4 | DOT6, 120); hold(DOT2 | DOT4, 10); hold(0, 60);
  expectOne("staggered 1246", keys::Action::CELL, 0x2b);
  for (int i = 0; i < 4; ++i) { hold(DOT3, 2); hold(0, 2); }
  hold(DOT3, 80);
  for (int i = 0; i < 3; ++i) { hold(0, 2); hold(DOT3, 2); }
  hold(0, 60);
  expectOne("bouncing dot 3", keys::Action::CELL, 0x04);
  hold(DOT1 | SPACE, 1); hold(0, 60);
  check(events.empty(), "1 ms glitch ignored"); events.clear();
  hold(SPACE, 80); hold(0, 60); expectOne("space", keys::Action::SPACE, 0);
  hold(ERASE, 80); hold(0, 60); expectOne("erase tap", keys::Action::ERASE, 0);
  hold(ERASE, 1000); hold(0, 60); expectOne("erase hold clears once", keys::Action::CLEAR, 0);
  hold(SEND, 80); hold(0, 60); expectOne("send", keys::Action::SEND, 0);
  hold(DOT1 | SEND, 80); hold(0, 60); expectOne("dot + send ignored", keys::Action::IGNORED, 0);
  check(keys::describe(DOT1 | DOT2 | SPACE) == "점1+점2+띄어쓰기", "describe chord");
}

// Typing session through Composer + InputSender, recorded for the web test.
struct Recorder { std::vector<std::vector<uint8_t>> packets; };
static void record(const uint8_t* data, size_t size, void* context) {
  static_cast<Recorder*>(context)->packets.emplace_back(data, data + size);
}
static void sender(const char* fixturePath, const char* expectedPath) {
  Recorder recorder;
  InputSender out;
  input::Composer composer;
  uint32_t now = 0;
  auto pump = [&](int ticks) { for (int i = 0; i < ticks; ++i) { now += 8; out.tick(now, record, &recorder); } };
  auto type = [&](const char* text, int ticksPerCell) {
    for (const uint8_t cell : translate(text).cells) { composer.add(cell); out.push(composer.text(), false); pump(ticksPerCell); }
  };
  type("안녕하세요 반갑습니다!", 2);   // fast typing: most previews are superseded mid-way
  const std::string sent = composer.text();
  out.push(sent, true); composer.clear();
  type("ㅋㅋ", 40);
  const std::string draft = composer.text();
  while (!out.idle()) pump(1);
  for (const auto& packet : recorder.packets) check(packet.size() <= 20, "packet fits 20 bytes");
  check(sent == "안녕하세요 반갑습니다!" && draft == "ㅋㅋ", "typed session text");

  std::ofstream fixture(fixturePath, std::ios::binary);
  for (const auto& packet : recorder.packets) {
    fixture.put(char(packet.size()));
    fixture.write(reinterpret_cast<const char*>(packet.data()), std::streamsize(packet.size()));
  }
  std::ofstream expected(expectedPath, std::ios::binary);
  expected << "{\"committed\":[\"" << sent << "\"],\"draft\":\"" << draft << "\"}\n";
  check(bool(fixture) && bool(expected), "write fixture");
  std::printf("input sender: %zu packets\n", recorder.packets.size());
}

int main(int argc, char** argv) {
  if (argc != 3) { std::fprintf(stderr, "usage: input_test <fixture.bin> <expected.json>\n"); return 2; }
  sentences();
  chords();
  sender(argv[1], argv[2]);
  exhaustive();
  std::printf("input tests: %s (%d failures)\n", failures ? "FAILED" : "PASS", failures);
  return failures ? 1 : 0;
}
