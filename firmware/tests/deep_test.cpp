#include <algorithm>
#include <array>
#include <chrono>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
#include "../earlink/BrailleText.h"
#include "../earlink/Protocol.h"
#include "../earlink/Pager.h"
#include "../earlink/BrailleMapping.h"

using Clock = std::chrono::steady_clock;
using earlink::Translation;
static uint64_t assertions = 0, translations = 0, pairs = 0, fuzzy = 0, protocolSteps = 0, pagerSteps = 0;
static const auto started = Clock::now();
static auto lastProgress = started;
static std::string phase;
static uint64_t randomState = 0x4541524c494e4b24ULL;
static uint64_t random64() {
  randomState ^= randomState << 13; randomState ^= randomState >> 7; randomState ^= randomState << 17;
  return randomState;
}
static double seconds() { return std::chrono::duration<double>(Clock::now() - started).count(); }
static void check(bool condition, const char* reason) {
  ++assertions;
  if (!condition) throw std::runtime_error(reason);
}
static void progress(bool force = false) {
  if (force || Clock::now() - lastProgress >= std::chrono::seconds(5)) {
    std::cout << "phase=" << phase << " elapsed=" << seconds() << "s pairs=" << pairs
              << " translations=" << translations << " fuzz=" << fuzzy << std::endl;
    lastProgress = Clock::now();
  }
}
static void appendUtf8(std::string& s, uint32_t cp) {
  if (cp < 0x80) s += char(cp);
  else if (cp < 0x800) { s += char(0xc0 | (cp >> 6)); s += char(0x80 | (cp & 63)); }
  else if (cp < 0x10000) {
    s += char(0xe0 | (cp >> 12)); s += char(0x80 | ((cp >> 6) & 63)); s += char(0x80 | (cp & 63));
  } else {
    s += char(0xf0 | (cp >> 18)); s += char(0x80 | ((cp >> 12) & 63));
    s += char(0x80 | ((cp >> 6) & 63)); s += char(0x80 | (cp & 63));
  }
}
static std::string encoded(uint32_t cp) { std::string result; appendUtf8(result, cp); return result; }
struct Oracle {
  std::string text;
  std::vector<uint8_t> plain, before;
  uint8_t left = 0, right = 0, silent = 0, numericSpace = 0;
};
static std::vector<Oracle> loadOracle(const char* path) {
  std::ifstream file(path, std::ios::binary);
  char header[8]{}; file.read(header, 8);
  check(file.good() && std::string(header, 4) == "ELG1", "oracle header");
  const unsigned count = uint8_t(header[4]) | (unsigned(uint8_t(header[5])) << 8);
  check(count == 11172 && header[6] == 0 && header[7] == 0, "oracle length");
  std::vector<Oracle> records(count);
  for (unsigned i = 0; i < count; ++i) {
    auto& r = records[i]; r.text = encoded(0xac00 + i);
    for (auto* cells : {&r.plain, &r.before}) {
      const int length = file.get(); check(length > 0 && length <= 6, "oracle cell length");
      for (int j = 0; j < length; ++j) { const int c = file.get(); check(c >= 0 && c < 64, "oracle cell mask"); cells->push_back(uint8_t(c)); }
    }
    r.left = uint8_t(file.get()); r.right = uint8_t(file.get());
    r.silent = uint8_t(file.get()); r.numericSpace = uint8_t(file.get());
    check(r.left < 3 && r.right < 3 && r.silent < 2 && r.numericSpace < 2 && file.good(), "oracle metadata");
  }
  check(file.get() == EOF, "oracle trailing data");
  return records;
}
static bool separator(const Oracle& left, const Oracle& right) {
  // Independently authored K11/K12 class truth table. No firmware table consulted.
  static const bool needs[3][3] = {{false,false,false},{false,true,false},{false,true,true}};
  return needs[left.left][right.right];
}
static void compare(const std::string& text, const uint8_t* expected, size_t count, const char* context) {
  ++translations;
  const auto result = earlink::translate(text);
  if (result.unsupported || result.cells.size() != count || !std::equal(result.cells.begin(), result.cells.end(), expected)) {
    std::cerr << "Mismatch " << context << " input(hex)=";
    for (unsigned char c : text) std::cerr << std::hex << unsigned(c) << ' ';
    std::cerr << " expected=";
    for (size_t i = 0; i < count; ++i) std::cerr << unsigned(expected[i]) << ',';
    std::cerr << " actual=";
    for (auto c : result.cells) std::cerr << unsigned(c) << ',';
    std::cerr << std::dec << " unsupported=" << result.unsupported << std::endl;
    throw std::runtime_error(context);
  }
  ++assertions;
}
static std::vector<uint8_t> joined(const std::vector<Oracle>& all, const std::vector<uint32_t>& cps) {
  std::vector<uint8_t> out;
  for (size_t i = 0; i < cps.size(); ++i) {
    const auto& r = all[cps[i] - 0xac00];
    if (i && separator(all[cps[i-1] - 0xac00], r)) out.push_back(36);
    const auto& cells = i + 1 < cps.size() && all[cps[i+1] - 0xac00].silent ? r.before : r.plain;
    out.insert(out.end(), cells.begin(), cells.end());
  }
  return out;
}
static void oracleChecks(const std::vector<Oracle>& all, bool fullMatrix) {
  phase = "all-syllables-and-numbers"; progress(true);
  static const uint8_t digits[10] = {26,1,3,9,25,17,11,27,19,10};
  for (const auto& r : all) {
    compare(r.text, r.plain.data(), r.plain.size(), "K1-K17 standalone syllable");
    for (unsigned digit = 0; digit < 10; ++digit) {
      std::vector<uint8_t> expected = {60, digits[digit]};
      if (r.numericSpace) expected.push_back(0);
      expected.insert(expected.end(), r.plain.begin(), r.plain.end());
      compare(std::string(1, char('0' + digit)) + r.text, expected.data(), expected.size(), "K44 numeric prefix");
    }
  }
  phase = fullMatrix ? "all-124813584-syllable-pairs" : "sampled-syllable-pairs";
  progress(true);
  for (size_t i = 0; i < all.size(); ++i) {
    const auto& left = all[i];
    for (size_t j = 0; j < all.size(); ++j) {
      if (!fullMatrix && j % 127 != i % 127) continue;
      const auto& right = all[j];
      std::array<uint8_t, 13> expected{};
      const auto& first = right.silent ? left.before : left.plain;
      auto end = std::copy(first.begin(), first.end(), expected.begin());
      if (separator(left, right)) *end++ = 36;
      end = std::copy(right.plain.begin(), right.plain.end(), end);
      compare(left.text + right.text, expected.data(), size_t(end - expected.begin()), "K11-K17 adjacent syllables");
      ++pairs;
    }
    if (i % 128 == 0) progress();
  }
  // All modern syllables attached BEFORE each complete abbreviation must
  // prevent K18, regardless of whether the suffix happens to look identical.
  phase = "K18-all-Hangul-prefixes"; progress(true);
  const std::array<std::vector<uint32_t>, 7> words = {{
    {0xadf8,0xb798,0xc11c},{0xadf8,0xb7ec,0xb098},{0xadf8,0xb7ec,0xba74},
    {0xadf8,0xb7ec,0xbbc0,0xb85c},{0xadf8,0xb7f0,0xb370},{0xadf8,0xb9ac,0xace0},
    {0xadf8,0xb9ac,0xd558,0xc5ec}
  }};
  for (uint32_t cp = 0xac00; cp <= 0xd7a3; ++cp) {
    for (const auto& word : words) {
      std::vector<uint32_t> cps{cp}; cps.insert(cps.end(), word.begin(), word.end());
      const auto expected = joined(all, cps);
      std::string text; for (const auto letter : cps) appendUtf8(text, letter);
      compare(text, expected.data(), expected.size(), "K18 no abbreviation after Hangul prefix");
    }
  }
}
struct AuditProbe { size_t bytes = 0; unsigned issues = 0; };
static void probe(const earlink::Audit& e, void* user) {
  auto& p = *static_cast<AuditProbe*>(user);
  check(e.byteOffset <= p.bytes && e.characterOffset <= p.bytes, "audit source bounds");
  check(e.cellBegin <= e.cellEnd && e.cellEnd <= earlink::MAX_TRANSLATION_CELLS, "audit cell bounds");
  if (e.issue) ++p.issues;
}
static void invariants(const std::string& text) {
  const auto measured = earlink::measureTranslation(text);
  AuditProbe audit{text.size(), 0};
  const auto result = earlink::translate(text, probe, &audit); ++translations;
  check(measured.cells == result.cells.size() && measured.unsupported == result.unsupported, "measurement/output mismatch");
  check(audit.issues == result.unsupported, "diagnostic count mismatch");
  check(result.cells.size() <= earlink::MAX_TRANSLATION_CELLS, "output limit exceeded");
  for (const auto c : result.cells) check(c < 64, "not a six-dot cell");
  if (text.size() > earlink::MAX_TEXT_BYTES) check(result.unsupported && result.cells.empty(), "input oversize not rejected");
  earlink::Message m; m.id = 1; m.translation = result;
  earlink::Pager p;
  if (result.unsupported) check(!p.enqueue(std::move(m), 0), "incomplete translation accepted by Pager");
  ++fuzzy;
}
static void utf8Checks() {
  phase = "all-Unicode-scalars-and-short-invalid-sequences"; progress(true);
  for (uint32_t cp = 0; cp <= 0x10ffff; ++cp) {
    const auto text = encoded(cp);
    const auto decoded = earlink::utf8::decode(text, 0);
    const bool scalar = cp < 0xd800 || cp > 0xdfff;
    check(decoded.valid == scalar && decoded.end == text.size(), "Unicode scalar validation");
    if (scalar) check(decoded.cp == cp, "Unicode decode/encode mismatch");
  }
  for (unsigned a = 0; a < 256; ++a) for (unsigned b = 0; b < 256; ++b)
    invariants(std::string({char(a), char(b)}));
  phase = "all-input-length-boundaries"; progress(true);
  const std::array<std::string, 7> atoms = {{"7", u8"가", u8"나이", u8"수애", "? ", "Hello ", std::string("\xf0\x80\x80\x80",4)}};
  for (const auto& atom : atoms) {
    std::string stream;
    while (stream.size() < earlink::MAX_TEXT_BYTES + 2) stream += atom;
    for (size_t size = 0; size <= earlink::MAX_TEXT_BYTES + 1; ++size) invariants(stream.substr(0, size));
  }
}
static void stateFuzz() {
  earlink::Receiver receiver;
  earlink::Pager pager;
  uint32_t now = 0xffff0000;
  std::array<uint8_t, 32> packet{};
  const size_t payloadSize = size_t(random64() % 128 + 1);
  std::string payload(payloadSize, '\0');
  for (auto& byte : payload) byte = char(random64());
  packet[0] = 0x45; packet[1] = 0x4c; packet[2] = 1; packet[3] = 1;
  packet[4] = 1; packet[5] = 2; packet[6] = uint8_t(payloadSize); packet[7] = 0;
  check(receiver.accept(packet.data(), 8, now) == earlink::NONE, "valid BEGIN rejected"); ++protocolSteps;
  for (size_t offset = 0; offset < payloadSize;) {
    const size_t length = (std::min)(size_t(random64() % 12 + 1), payloadSize - offset);
    packet[3] = 2; packet[6] = uint8_t(offset); packet[7] = uint8_t(offset >> 8);
    std::copy(payload.begin() + offset, payload.begin() + offset + length, packet.begin() + 8);
    check(receiver.accept(packet.data(), length + 8, now++) == earlink::NONE, "valid DATA rejected");
    ++protocolSteps; offset += length;
  }
  packet[3] = 3;
  check(receiver.accept(packet.data(), 6, now++) == earlink::ACCEPTED && receiver.text == payload, "valid fragmented roundtrip");
  ++protocolSteps; receiver.reset();
  for (unsigned i = 0; i < 128; ++i) {
    now += uint32_t(random64() % 10001);
    for (auto& byte : packet) byte = uint8_t(random64());
    if (i % 2) { packet[0] = 0x45; packet[1] = 0x4c; packet[2] = 1; }
    receiver.accept(packet.data(), size_t(random64() % 33), now);
    check(receiver.text.size() <= earlink::MAX_TEXT_BYTES, "Receiver grew past limit"); ++protocolSteps;
    switch (random64() % 7) {
      case 0: {
        earlink::Message m; m.id = uint16_t(random64());
        m.translation.cells.assign(size_t(random64() % 64 + 1), uint8_t(random64() & 63));
        pager.enqueue(std::move(m), now); break;
      }
      case 1: pager.next(now); break;
      case 2: pager.previous(now); break;
      case 3: pager.setAutomatic(bool(random64() & 1), now); break;
      case 4: pager.clear(); break;
      default: pager.tick(now); break;
    }
    check(pager.queued() <= 3 && pager.bufferedCells() <= earlink::MAX_BUFFERED_CELLS, "Pager queue/storage invariant");
    if (pager.active()) check(pager.page < pager.pages(), "Pager current page invalid");
    for (const auto cell : pager.output()) check(cell < 64, "Pager emitted invalid mask");
    ++pagerSteps;
  }
}
static void timedFuzz(unsigned duration) {
  phase = "seeded-mixed-input-and-state-soak"; progress(true);
  const std::array<std::string, 19> atoms = {{u8"가",u8"나이",u8"그래서",u8"오그리고",u8"아예",u8"수애",u8"ㄱ",u8"ㄸ",
    u8"😀",u8"한",u8"간","? ","Hello ","123,45.6",u8"‘’",u8"…","\r\n",std::string("\xf4\x90\x80\x80",4)," "}};
  do {
    for (unsigned i = 0; i < 64; ++i) {
      std::string text;
      if (random64() & 1) {
        const size_t count = size_t(random64() % 4098);
        text.resize(count);
        for (auto& byte : text) byte = char(random64());
      } else {
        const size_t count = size_t(random64() % 513);
        for (size_t n = 0; n < count; ++n) text += atoms[size_t(random64() % atoms.size())];
      }
      invariants(text);
    }
    stateFuzz(); progress();
  } while (seconds() < duration || fuzzy < 100000);
}
int main(int argc, char** argv) {
  if (argc != 5) return 2;
  const unsigned duration = unsigned(std::stoul(argv[3]));
  const bool fullMatrix = std::string(argv[4]) == "full";
  bool passed = true; std::string error;
  try {
    const auto oracle = loadOracle(argv[1]);
    oracleChecks(oracle, fullMatrix); utf8Checks(); timedFuzz(duration);
  } catch (const std::exception& e) { passed = false; error = e.what(); std::cerr << error << std::endl; }
  phase = passed ? "complete" : "FAILED"; progress(true);
  std::ofstream report(argv[2]);
  report << "{\n  \"passed\": " << (passed ? "true" : "false") << ",\n  \"seconds\": " << seconds()
    << ",\n  \"full_pair_matrix\": " << (fullMatrix ? "true" : "false") << ",\n  \"syllable_pairs\": " << pairs
    << ",\n  \"translation_cases\": " << translations << ",\n  \"invariant_fuzz_cases\": " << fuzzy
    << ",\n  \"protocol_steps\": " << protocolSteps << ",\n  \"pager_steps\": " << pagerSteps
    << ",\n  \"assertions\": " << assertions << ",\n  \"seed\": \"4541524c494e4b24\",\n  \"error\": \"" << error << "\"\n}\n";
  return passed ? 0 : 1;
}
