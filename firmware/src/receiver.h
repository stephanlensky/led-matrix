#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>

namespace receiver {

bool begin();
bool takeFrame(uint8_t* frame);
size_t getQueuedFrames();
std::optional<uint8_t> takeBrightness();
uint32_t getFramesDropped();
uint32_t getPacketsReceived();

}  // namespace receiver
