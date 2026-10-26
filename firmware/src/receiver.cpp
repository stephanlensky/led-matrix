#include "receiver.h"

#include <Arduino.h>
#include <protocol.h>
#include <scheduler.h>

#include <atomic>
#include <cstring>
#include <mutex>

#include "udp.h"

namespace receiver {

namespace {

constexpr uint32_t taskStackSize = 4096;
constexpr UBaseType_t taskPriority = 20;
constexpr BaseType_t taskCore = 0;
constexpr int noBrightness = -1;

constexpr size_t queueSize = 8;
constexpr size_t targetDepth = 3;

uint8_t packet[protocol::maxPacketSize + 1];
uint8_t assembled[protocol::frameSize];
uint8_t* queue = nullptr;
size_t queueStart = 0;
size_t queueCount = 0;
protocol::FrameAssembler assembler(assembled);
std::mutex queueMutex;
scheduler::FrameScheduler frameScheduler(targetDepth);
uint32_t framesReplaced = 0;
std::atomic<int> brightness{noBrightness};
std::atomic<uint32_t> framesDropped{0};
std::atomic<uint32_t> packetsReceived{0};

uint8_t* getQueuedFrame(size_t index) {
  return queue + ((queueStart + index) % queueSize) * protocol::frameSize;
}

void addFrame(uint32_t sequence) {
  std::lock_guard lock(queueMutex);
  frameScheduler.addFrame(sequence, micros());
  if (queueCount == queueSize) {
    queueStart = (queueStart + 1) % queueSize;
    queueCount--;
    framesReplaced++;
  }
  std::memcpy(getQueuedFrame(queueCount), assembled, protocol::frameSize);
  queueCount++;
  framesDropped = assembler.getFramesDropped() + framesReplaced;
}

void handlePacket(size_t size) {
  const auto type = protocol::getMessageType(packet, size);
  if (type == protocol::MessageType::frame) {
    const auto chunk = protocol::decodeFrameChunk(packet, size);
    if (chunk && assembler.add(*chunk)) {
      addFrame(chunk->sequence);
    }
  } else if (type == protocol::MessageType::setBrightness) {
    const auto value = protocol::decodeSetBrightness(packet, size);
    if (value) {
      brightness = *value;
    }
  }
}

void receive(void*) {
  while (true) {
    const size_t size = udp::receive(packet, sizeof(packet));
    if (size > 0) {
      packetsReceived++;
    }
    if (size > 0 && size <= protocol::maxPacketSize) {
      handlePacket(size);
    }
  }
}

}  // namespace

bool begin() {
  queue = static_cast<uint8_t*>(
      heap_caps_malloc(queueSize * protocol::frameSize, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  return queue && udp::begin(protocol::devicePort) &&
         xTaskCreatePinnedToCore(receive, "receiver", taskStackSize, nullptr, taskPriority, nullptr,
                                 taskCore) == pdPASS;
}

bool takeFrame(uint8_t* frame) {
  std::lock_guard lock(queueMutex);
  const uint32_t now = micros();
  if (!frameScheduler.isDue(queueCount, now)) {
    return false;
  }
  std::memcpy(frame, getQueuedFrame(0), protocol::frameSize);
  queueStart = (queueStart + 1) % queueSize;
  queueCount--;
  frameScheduler.setShown(queueCount, now);
  return true;
}

size_t getQueuedFrames() {
  std::lock_guard lock(queueMutex);
  return queueCount;
}

std::optional<uint8_t> takeBrightness() {
  const int value = brightness.exchange(noBrightness);
  if (value == noBrightness) {
    return std::nullopt;
  }
  return value;
}

uint32_t getFramesDropped() { return framesDropped; }

uint32_t getPacketsReceived() { return packetsReceived; }

}  // namespace receiver
