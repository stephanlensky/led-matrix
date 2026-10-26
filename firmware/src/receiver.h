#pragma once

#include <cstdint>
#include <optional>

namespace receiver {

bool begin();
bool copyFrame(uint8_t* frame);
std::optional<uint8_t> takeBrightness();
uint32_t getFramesDropped();
uint32_t getPacketsReceived();

}  // namespace receiver
