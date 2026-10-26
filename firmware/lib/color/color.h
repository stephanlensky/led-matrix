#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

namespace color {

constexpr float gamma = 2.2f;

struct ColorTable {
  std::array<uint16_t, 256> red;
  std::array<uint16_t, 256> green;
  std::array<uint16_t, 256> blue;
};

ColorTable createColorTable(uint8_t brightness);

inline uint16_t getRgb565(const ColorTable& table, uint8_t red, uint8_t green, uint8_t blue) {
  return table.red[red] | table.green[green] | table.blue[blue];
}

void convertFrame(const ColorTable& table, const uint8_t* rgb, uint16_t* rgb565, size_t pixelCount);

}  // namespace color
