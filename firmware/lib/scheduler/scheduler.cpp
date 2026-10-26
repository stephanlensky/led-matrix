#include "scheduler.h"

#include <algorithm>

namespace scheduler {

namespace {

int32_t getDistance(uint32_t from, uint32_t to) { return static_cast<int32_t>(to - from); }

}  // namespace

FrameScheduler::FrameScheduler(size_t targetDepth) : targetDepth(targetDepth) {}

void FrameScheduler::addFrame(uint32_t sequence, uint32_t nowUs) {
  if (lastSequence) {
    const int32_t frames = getDistance(*lastSequence, sequence);
    if (frames > 0 && frames <= static_cast<int32_t>(maxSequenceGap)) {
      const int64_t gap = (nowUs - lastArrivalUs) / frames;
      const int64_t updated = intervalUs + (gap - static_cast<int64_t>(intervalUs)) / 16;
      intervalUs = std::clamp<int64_t>(updated, minIntervalUs, maxIntervalUs);
    }
  }
  lastSequence = sequence;
  lastArrivalUs = nowUs;
}

bool FrameScheduler::isDue(size_t queued, uint32_t nowUs) {
  if (queued == 0) {
    isBuffering = true;
    return false;
  }
  if (isBuffering) {
    if (queued < targetDepth) {
      return false;
    }
    isBuffering = false;
    nextShowUs = nowUs;
  }
  return getDistance(nextShowUs, nowUs) >= 0;
}

void FrameScheduler::setShown(size_t queued, uint32_t nowUs) {
  uint32_t step = intervalUs;
  if (queued > targetDepth) {
    step -= intervalUs / 8;
  } else if (queued + 1 < targetDepth) {
    step += intervalUs / 8;
  }
  nextShowUs += step;
  if (getDistance(nextShowUs, nowUs) > static_cast<int32_t>(intervalUs)) {
    nextShowUs = nowUs;
  }
}

}  // namespace scheduler
