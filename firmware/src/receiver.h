#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>

namespace receiver {

struct InflateStats {
  uint32_t frames = 0;
  uint32_t totalUs = 0;
  uint32_t maxUs = 0;
};

bool begin();
std::optional<uint32_t> takeFrame(uint8_t* frame);
size_t getQueuedFrames();
std::optional<uint8_t> takeBrightness();
uint32_t getFramesDropped();
uint32_t getPacketsReceived();
InflateStats takeInflateStats();
bool isSerialActive();

}  // namespace receiver
