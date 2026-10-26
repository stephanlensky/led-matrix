#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>

namespace scheduler {

constexpr uint32_t defaultIntervalUs = 33333;
constexpr uint32_t minIntervalUs = 5000;
constexpr uint32_t maxIntervalUs = 500000;
constexpr uint32_t maxSequenceGap = 4;

class FrameScheduler {
 public:
  explicit FrameScheduler(size_t targetDepth);
  void addFrame(uint32_t sequence, uint32_t nowUs);
  bool isDue(size_t queued, uint32_t nowUs);
  void setShown(size_t queued, uint32_t nowUs);
  uint32_t getIntervalUs() const { return intervalUs; }

 private:
  size_t targetDepth;
  uint32_t intervalUs = defaultIntervalUs;
  std::optional<uint32_t> lastSequence;
  uint32_t lastArrivalUs = 0;
  bool isBuffering = true;
  uint32_t nextShowUs = 0;
};

}  // namespace scheduler
