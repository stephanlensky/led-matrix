#pragma once

#include <cstdint>

namespace settings {

void begin();
uint8_t getBrightness();
void setBrightness(uint8_t brightness);

}  // namespace settings
