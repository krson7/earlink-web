#include <fstream>
#include <iostream>
#include <string>
#include <vector>
#include "../earlink/BrailleText.h"

static void audit(const earlink::Audit& event, void* context) {
  auto& events = *static_cast<std::vector<earlink::Audit>*>(context);
  events.push_back(event);
}
int main(int argc, char** argv) {
  if (argc != 2) return 2;
  std::ifstream input(argv[1]);
  if (!input) return 2;
  std::string hex;
  while (std::getline(input, hex)) {
    std::string text;
    for (size_t i = 0; i + 1 < hex.size(); i += 2)
      text.push_back(char(std::stoi(hex.substr(i, 2), nullptr, 16)));
    std::vector<earlink::Audit> trace;
    const auto result = earlink::translate(text, audit, &trace);
    std::cout << result.unsupported << '\t';
    for (const auto cell : result.cells) std::cout << unsigned(cell) << ',';
    std::cout << '\t';
    for (const auto& e : trace)
      std::cout << e.byteOffset << ',' << e.characterOffset << ',' << e.codepoint << ','
                << e.cellBegin << ',' << e.cellEnd << ',' << e.rule << ',' << e.issue << '|';
    std::cout << '\n';
  }
}
