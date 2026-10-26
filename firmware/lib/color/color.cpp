#include "color.h"

#include <cmath>

namespace color {

namespace {

uint16_t getLevel(uint8_t value, uint8_t brightness, uint16_t maxLevel) {
  const float linear = std::pow(value / 255.0f, gamma) * (brightness / 255.0f);
  return static_cast<uint16_t>(std::lround(linear * maxLevel));
}

}  // namespace

ColorTable createColorTable(uint8_t brightness) {
  ColorTable table;
  for (size_t value = 0; value < 256; value++) {
    table.red[value] = getLevel(value, brightness, 31) << 11;
    table.green[value] = getLevel(value, brightness, 63) << 5;
    table.blue[value] = getLevel(value, brightness, 31);
  }
  return table;
}

void convertFrame(const ColorTable& table, const uint8_t* rgb, uint16_t* rgb565,
                  size_t pixelCount) {
  for (size_t i = 0; i < pixelCount; i++) {
    rgb565[i] = getRgb565(table, rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
  }
}

}  // namespace color
