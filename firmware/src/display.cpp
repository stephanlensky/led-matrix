#include "display.h"

#include <Adafruit_Protomatter.h>
#include <Fonts/TomThumb.h>
#include <color.h>
#include <protocol.h>

namespace display {

namespace {

uint8_t rgbPins[] = {42, 41, 40, 38, 39, 37};
uint8_t addressPins[] = {45, 36, 48, 35, 21};
constexpr uint8_t clockPin = 2;
constexpr uint8_t latchPin = 47;
constexpr uint8_t outputEnablePin = 14;
constexpr int16_t lineHeight = 6;

Adafruit_Protomatter matrix(protocol::width, BIT_DEPTH, 1, rgbPins, sizeof(addressPins),
                            addressPins, clockPin, latchPin, outputEnablePin, true);
color::ColorTable colorTable;

uint16_t getColor(uint8_t red, uint8_t green, uint8_t blue) {
  return color::getRgb565(colorTable, red, green, blue);
}

}  // namespace

bool begin(uint8_t brightness) {
  setBrightness(brightness);
  matrix.setFont(&TomThumb);
  matrix.setTextWrap(false);
  return matrix.begin() == PROTOMATTER_OK;
}

void setBrightness(uint8_t brightness) { colorTable = color::createColorTable(brightness); }

void showFrame(const uint8_t* rgb) {
  color::convertFrame(colorTable, rgb, matrix.getBuffer(), protocol::pixelCount);
  matrix.show();
}

void showTestPattern() {
  const uint16_t bars[] = {getColor(255, 0, 0), getColor(0, 255, 0), getColor(0, 0, 255),
                           getColor(255, 255, 255)};
  const int16_t barWidth = protocol::width / 4;
  const int16_t half = protocol::height / 2;
  const int16_t stripHeight = half / 4;
  for (int16_t i = 0; i < 4; i++) {
    matrix.fillRect(i * barWidth, 0, barWidth, half, bars[i]);
  }
  for (int16_t x = 0; x < protocol::width; x++) {
    const uint8_t value = x * 255 / (protocol::width - 1);
    const uint16_t strips[] = {getColor(value, 0, 0), getColor(0, value, 0), getColor(0, 0, value),
                               getColor(value, value, value)};
    for (int16_t i = 0; i < 4; i++) {
      matrix.drawFastVLine(x, half + i * stripHeight, stripHeight, strips[i]);
    }
  }
  matrix.show();
}

void showLines(std::initializer_list<String> lines) {
  matrix.fillScreen(0);
  matrix.setTextColor(getColor(255, 255, 255));
  int16_t y = lineHeight;
  for (const String& line : lines) {
    matrix.setCursor(1, y);
    matrix.print(line);
    y += lineHeight + 1;
  }
  matrix.show();
}

void clear() {
  matrix.fillScreen(0);
  matrix.show();
}

uint32_t getRefreshCount() { return matrix.getFrameCount(); }

}  // namespace display
