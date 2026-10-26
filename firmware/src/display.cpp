#include "display.h"

#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>
#include <Fonts/TomThumb.h>
#include <protocol.h>

namespace display {

namespace {

constexpr uint16_t minRefreshRate = 100;
constexpr int16_t lineHeight = 6;

HUB75_I2S_CFG getConfig() {
  HUB75_I2S_CFG config(protocol::width, protocol::height, 1,
                       {42, 41, 40, 38, 39, 37, 45, 36, 48, 35, 21, 47, 14, 2});
  config.double_buff = true;
  config.i2sspeed = static_cast<HUB75_I2S_CFG::clk_speed>(CLOCK_SPEED);
  config.min_refresh_rate = minRefreshRate;
  return config;
}

MatrixPanel_I2S_DMA matrix(getConfig());

}  // namespace

bool begin(uint8_t brightness) {
  if (!matrix.begin()) {
    return false;
  }
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
  matrix.flipDMABuffer();
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
  matrix.flipDMABuffer();
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
  matrix.flipDMABuffer();
}

void clear() {
  matrix.fillScreen(0);
  matrix.flipDMABuffer();
}

uint16_t getRefreshRate() { return matrix.calculated_refresh_rate; }

}  // namespace display
