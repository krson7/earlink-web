#include <algorithm>
#include <chrono>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
#include "../earlink/BrailleText.h"
#include "../earlink/Protocol.h"

static void require(bool ok, const char* message) { if (!ok) throw std::runtime_error(message); }
static std::string utf8(uint32_t cp) {
  std::string out;
  out += char(0xe0 | (cp >> 12)); out += char(0x80 | ((cp >> 6) & 63)); out += char(0x80 | (cp & 63));
  return out;
}
struct Record { std::vector<uint8_t> plain; bool silent, numeric; };
static uint64_t cases = 0, suffixes = 0, spaces = 0, mixed = 0, partialNfd = 0, roundtrips = 0;
static void compare(const std::string& text, const std::vector<uint8_t>& expected) {
  const auto actual = earlink::translate(text); ++cases;
  require(actual.unsupported == 0 && actual.cells == expected, "context oracle mismatch");
}
int main(int argc, char** argv) {
  if (argc != 3) return 2;
  const auto start = std::chrono::steady_clock::now();
  bool passed = false; std::string error;
  try {
    std::ifstream file(argv[1], std::ios::binary);
    char header[8]{}; file.read(header, 8);
    require(file.good() && std::string(header,4) == "ELG1", "missing independent oracle");
    std::vector<Record> records(11172);
    for (auto& r : records) {
      const int length = file.get(); require(length > 0 && length <= 6, "bad oracle length");
      for (int i = 0; i < length; ++i) { int c = file.get(); require(c >= 0 && c < 64, "bad oracle cell"); r.plain.push_back(uint8_t(c)); }
      const int before = file.get(); require(before > 0 && before <= 6, "bad before-vowel oracle");
      file.ignore(before); file.ignore(2);
      r.silent = file.get() != 0; r.numeric = file.get() != 0;
      require(file.good(), "truncated oracle");
    }
    const std::vector<std::string> words = {u8"그래서",u8"그러나",u8"그러면",u8"그러므로",u8"그런데",u8"그리고",u8"그리하여"};
    const std::vector<uint8_t> second = {14,9,18,34,29,37,49}; // K18: 234,14,25,26,1345,136,156
    // Correct 26-dot mask is 34 (dots 2+6), 156 is 49 (1+5+6).
    for (uint32_t offset = 0; offset < records.size(); ++offset) {
      const auto& r = records[offset]; const auto syllable = utf8(0xac00 + offset);
      for (size_t w = 0; w < words.size(); ++w) {
        if (!r.silent) {
          std::vector<uint8_t> expected = {1,second[w]}; expected.insert(expected.end(),r.plain.begin(),r.plain.end());
          compare(words[w]+syllable,expected); ++suffixes;
        }
        auto expected = r.plain; expected.push_back(0); expected.push_back(1); expected.push_back(second[w]);
        compare(syllable+" "+words[w],expected); ++spaces;
      }
      std::vector<uint8_t> expected = {60,1,3};
      if (r.numeric) expected.push_back(0);
      expected.insert(expected.end(),r.plain.begin(),r.plain.end());
      expected.insert(expected.end(),{60,9,25});
      if (r.numeric) expected.push_back(0);
      expected.insert(expected.end(),r.plain.begin(),r.plain.end());
      compare("12"+syllable+"34"+syllable,expected); ++mixed;
      const uint32_t tail = offset % 28;
      if (tail) { compare(utf8(0xac00+offset-tail)+utf8(0x11a7+tail),r.plain); ++partialNfd; }
    }
    // Fixed independently transcribed words, repeated as a long Korean message.
    const std::vector<std::string> text = {u8"안녕하세요",u8"대한민국",u8"강산",u8"그래서",u8"그러면서",u8"그리고",u8"학교",u8"것"};
    const std::vector<std::vector<uint8_t>> cells = {{35,18,9,59,26,32,29,44},{10,23,26,18,17,31,8,13,1},
      {43,54,7,18},{1,14},{1,18,32,14},{1,37},{26,1,8,44},{56,14}};
    std::string phrase; std::vector<uint8_t> expectedPhrase;
    for (size_t i = 0; i < text.size(); ++i) {
      phrase += text[i] + " "; expectedPhrase.insert(expectedPhrase.end(),cells[i].begin(),cells[i].end()); expectedPhrase.push_back(0);
    }
    std::string longText; std::vector<uint8_t> longExpected;
    while (longText.size()+phrase.size() <= earlink::MAX_TEXT_BYTES) {
      longText += phrase; longExpected.insert(longExpected.end(),expectedPhrase.begin(),expectedPhrase.end());
    }
    compare(longText,longExpected);
    for (size_t chunk = 1; chunk <= 12; ++chunk) {
      earlink::Receiver receiver;
      uint8_t p[20] = {0x45,0x4c,1,1,1,0,0,0};
      p[6] = uint8_t(longText.size()); p[7] = uint8_t(longText.size() >> 8);
      require(receiver.accept(p,8,0) == earlink::NONE, "long BEGIN");
      for (size_t offset = 0; offset < longText.size();) {
        const auto length = (std::min)(chunk,longText.size()-offset);
        p[3] = 2; p[6] = uint8_t(offset); p[7] = uint8_t(offset >> 8);
        std::copy(longText.begin()+offset,longText.begin()+offset+length,p+8);
        require(receiver.accept(p,length+8,uint32_t(offset)) == earlink::NONE, "long DATA"); offset += length;
      }
      p[3] = 3;
      require(receiver.accept(p,6,5000) == earlink::ACCEPTED && receiver.text == longText, "long COMMIT");
      compare(receiver.text,longExpected); ++roundtrips;
    }
    passed = true;
  } catch (const std::exception& e) { error = e.what(); std::cerr << error << '\n'; }
  const auto elapsed = std::chrono::duration<double>(std::chrono::steady_clock::now()-start).count();
  std::ofstream report(argv[2]);
  report << "{\n  \"passed\": " << (passed ? "true" : "false") << ",\n  \"cases\": " << cases
    << ",\n  \"consonant_suffixes\": " << suffixes << ",\n  \"space_boundaries\": " << spaces
    << ",\n  \"numeric_mode_resets\": " << mixed << ",\n  \"partial_nfd\": " << partialNfd
    << ",\n  \"long_packet_roundtrips\": " << roundtrips << ",\n  \"seconds\": " << elapsed
    << ",\n  \"scope\": \"rule-derived context and software checks; hardware UNVERIFIED\",\n  \"error\": \"" << error << "\"\n}\n";
  std::cout << (passed ? "PASS" : "FAIL") << ": additional context cases=" << cases << '\n';
  return passed ? 0 : 1;
}
