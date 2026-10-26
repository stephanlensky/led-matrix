#include <scheduler.h>
#include <unity.h>

#include <deque>
#include <vector>

using namespace scheduler;

constexpr uint32_t intervalUs = 33333;
constexpr size_t targetDepth = 3;

struct Arrival {
  uint32_t sequence;
  uint32_t atUs;
};

std::vector<uint32_t> play(const std::vector<Arrival>& arrivals, uint32_t durationUs) {
  FrameScheduler frameScheduler(targetDepth);
  std::deque<uint32_t> queue;
  std::vector<uint32_t> shownAt;
  size_t next = 0;
  for (uint32_t now = 0; now < durationUs; now += 500) {
    while (next < arrivals.size() && arrivals[next].atUs <= now) {
      frameScheduler.addFrame(arrivals[next].sequence, now);
      queue.push_back(arrivals[next].sequence);
      next++;
    }
    if (frameScheduler.isDue(queue.size(), now)) {
      queue.pop_front();
      frameScheduler.setShown(queue.size(), now);
      shownAt.push_back(now);
    }
  }
  return shownAt;
}

std::vector<Arrival> getSteadyArrivals(size_t count) {
  std::vector<Arrival> arrivals;
  for (uint32_t i = 0; i < count; i++) {
    arrivals.push_back({i, i * intervalUs});
  }
  return arrivals;
}

uint32_t getMaxGap(const std::vector<uint32_t>& shownAt, size_t from) {
  uint32_t maxGap = 0;
  for (size_t i = from + 1; i < shownAt.size(); i++) {
    maxGap = std::max(maxGap, shownAt[i] - shownAt[i - 1]);
  }
  return maxGap;
}

void test_waits_for_target_depth_before_showing() {
  const auto shownAt = play(getSteadyArrivals(3), intervalUs * 3);
  TEST_ASSERT_EQUAL(1, shownAt.size());
  TEST_ASSERT_UINT32_WITHIN(500, 2 * intervalUs, shownAt[0]);
}

void test_shows_steady_stream_at_its_rate() {
  const auto shownAt = play(getSteadyArrivals(300), intervalUs * 300);
  TEST_ASSERT_GREATER_OR_EQUAL(295, shownAt.size());
  TEST_ASSERT_UINT32_WITHIN(intervalUs / 4, intervalUs, getMaxGap(shownAt, 10));
}

void test_smooths_bunched_arrivals() {
  std::vector<Arrival> arrivals;
  for (uint32_t i = 0; i < 300; i++) {
    const uint32_t bunch = i / 3 * 3;
    arrivals.push_back({i, (bunch + 2) * intervalUs + (i - bunch) * 500});
  }
  const auto shownAt = play(arrivals, intervalUs * 310);
  TEST_ASSERT_GREATER_OR_EQUAL(290, shownAt.size());
  TEST_ASSERT_UINT32_WITHIN(intervalUs / 4, intervalUs, getMaxGap(shownAt, 30));
}

void test_estimates_interval_from_arrivals() {
  FrameScheduler frameScheduler(targetDepth);
  for (uint32_t i = 0; i < 200; i++) {
    frameScheduler.addFrame(i, i * 20000);
  }
  TEST_ASSERT_UINT32_WITHIN(500, 20000, frameScheduler.getIntervalUs());
}

void test_ignores_restarted_sequences_when_estimating() {
  FrameScheduler frameScheduler(targetDepth);
  frameScheduler.addFrame(5000, 0);
  frameScheduler.addFrame(0, 10);
  frameScheduler.addFrame(1, 10 + intervalUs);
  TEST_ASSERT_EQUAL(intervalUs, frameScheduler.getIntervalUs());
}

void setUp() {}

void tearDown() {}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_waits_for_target_depth_before_showing);
  RUN_TEST(test_shows_steady_stream_at_its_rate);
  RUN_TEST(test_smooths_bunched_arrivals);
  RUN_TEST(test_estimates_interval_from_arrivals);
  RUN_TEST(test_ignores_restarted_sequences_when_estimating);
  return UNITY_END();
}
