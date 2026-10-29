#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>

namespace receiver {

bool begin();
std::optional<uint32_t> takeFrame(uint8_t* frame);
size_t getQueuedFrames();
std::optional<uint8_t> takeBrightness();
uint32_t getFramesDropped();
uint32_t getPacketsReceived();
bool isSerialActive();

}  // namespace receiver
