#pragma once
#include <stddef.h>
namespace earlink {
constexpr size_t MAX_TEXT_BYTES = 4096;
constexpr size_t MAX_TRANSLATION_CELLS = MAX_TEXT_BYTES * 6 + 16;
constexpr size_t MAX_BUFFERED_CELLS = 32768; // current + waiting, queue length still 3
}
