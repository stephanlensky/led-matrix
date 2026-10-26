#include "receiver.h"

#include <Arduino.h>
#include <protocol.h>

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

uint8_t packet[protocol::maxPacketSize + 1];
uint8_t assembled[protocol::frameSize];
constexpr size_t queueSize = 3;

uint8_t queue[queueSize][protocol::frameSize];
size_t queueStart = 0;
size_t queueCount = 0;
protocol::FrameAssembler assembler(assembled);
std::mutex queueMutex;
uint32_t framesReplaced = 0;
std::atomic<int> brightness{noBrightness};
std::atomic<uint32_t> framesDropped{0};
std::atomic<uint32_t> packetsReceived{0};

void addFrame() {
  std::lock_guard lock(queueMutex);
  if (queueCount == queueSize) {
    queueStart = (queueStart + 1) % queueSize;
    queueCount--;
    framesReplaced++;
  }
  std::memcpy(queue[(queueStart + queueCount) % queueSize], assembled, protocol::frameSize);
  queueCount++;
  framesDropped = assembler.getFramesDropped() + framesReplaced;
}

void handlePacket(size_t size) {
  const auto type = protocol::getMessageType(packet, size);
  if (type == protocol::MessageType::frame) {
    const auto chunk = protocol::decodeFrameChunk(packet, size);
    if (chunk && assembler.add(*chunk)) {
      addFrame();
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
  return udp::begin(protocol::devicePort) &&
         xTaskCreatePinnedToCore(receive, "receiver", taskStackSize, nullptr, taskPriority, nullptr,
                                 taskCore) == pdPASS;
}

bool copyFrame(uint8_t* frame) {
  std::lock_guard lock(queueMutex);
  if (queueCount == 0) {
    return false;
  }
  std::memcpy(frame, queue[queueStart], protocol::frameSize);
  queueStart = (queueStart + 1) % queueSize;
  queueCount--;
  return true;
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
