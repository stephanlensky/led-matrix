#include "display.h"

#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>
#include <Fonts/TomThumb.h>
#include <protocol.h>

namespace display {

namespace {

constexpr uint16_t minRefreshRate = 100;
constexpr uint8_t colorDepth = 8;
constexpr uint32_t rowPairs = protocol::height / 2;
constexpr int16_t lineHeight = 6;

HUB75_I2S_CFG getConfig() {
  HUB75_I2S_CFG config(protocol::width, protocol::height, 1,
                       {42, 41, 40, 38, 39, 37, 45, 36, 48, 35, 21, 47, 14, 2});
  config.double_buff = true;
  config.i2sspeed = static_cast<HUB75_I2S_CFG::clk_speed>(CLOCK_SPEED);
  config.min_refresh_rate = minRefreshRate;
  return config;
}

uint32_t getTransitionBit() {
  for (uint32_t bit = 0; bit < colorDepth; bit++) {
    const uint32_t estimatedPlanes = colorDepth + (1 << (colorDepth - 1 - bit)) - 1;
    if (CLOCK_SPEED / (protocol::width * rowPairs * estimatedPlanes) >= minRefreshRate) {
      return bit;
    }
  }
  return colorDepth - 1;
}

uint32_t getFramePeriodUs() {
  const uint32_t bit = getTransitionBit();
  const uint64_t planes = (1 << (colorDepth - bit)) + bit - 1;
  return protocol::width * rowPairs * planes * 1000000 / CLOCK_SPEED + 1;
}

MatrixPanel_I2S_DMA matrix(getConfig());
const uint32_t framePeriodUs = getFramePeriodUs();
uint32_t lastFlipAt = 0;

void flip() {
  matrix.flipDMABuffer();
  lastFlipAt = micros();
}

}  // namespace

bool begin(uint8_t brightness) {
  if (!matrix.begin()) {
    return false;
  }
  flip();
  setBrightness(brightness);
  matrix.setFont(&TomThumb);
  matrix.setTextWrap(false);
  return true;
}

void setBrightness(uint8_t brightness) { matrix.setBrightness8(brightness); }

void showFrame(const uint8_t* rgb) {
  for (int16_t y = 0; y < protocol::height; y++) {
    for (int16_t x = 0; x < protocol::width; x++) {
      const uint8_t* pixel = rgb + (y * protocol::width + x) * protocol::channels;
      matrix.drawPixelRGB888(x, y, pixel[0], pixel[1], pixel[2]);
    }
  }
  flip();
}

void showTestPattern() {
  const uint8_t bars[][3] = {{255, 0, 0}, {0, 255, 0}, {0, 0, 255}, {255, 255, 255}};
  const int16_t barWidth = protocol::width / 4;
  const int16_t half = protocol::height / 2;
  const int16_t stripHeight = half / 4;
  for (int16_t i = 0; i < 4; i++) {
    matrix.fillRect(i * barWidth, 0, barWidth, half, bars[i][0], bars[i][1], bars[i][2]);
  }
  for (int16_t x = 0; x < protocol::width; x++) {
    const uint8_t value = x * 255 / (protocol::width - 1);
    for (int16_t i = 0; i < 4; i++) {
      matrix.drawFastVLine(x, half + i * stripHeight, stripHeight, i == 0 || i == 3 ? value : 0,
                           i == 1 || i == 3 ? value : 0, i == 2 || i == 3 ? value : 0);
    }
  }
  flip();
}

void showLines(std::initializer_list<String> lines) {
  matrix.fillScreen(0);
  matrix.setTextColor(MatrixPanel_I2S_DMA::color565(255, 255, 255));
  int16_t y = lineHeight;
  for (const String& line : lines) {
    matrix.setCursor(1, y);
    matrix.print(line);
    y += lineHeight + 1;
  }
  flip();
}

void clear() {
  matrix.fillScreen(0);
  flip();
}

bool isReady() { return micros() - lastFlipAt >= framePeriodUs; }

uint32_t getRefreshRate() { return 1000000 / framePeriodUs; }

}  // namespace display
