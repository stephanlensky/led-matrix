#include "receiver.h"

#include <Arduino.h>
#include <protocol.h>
#include <scheduler.h>

#include <atomic>
#include <cstring>
#include <mutex>

#include "udp.h"
#include "usb.h"

namespace receiver {

namespace {

constexpr uint32_t taskStackSize = 4096;
constexpr TickType_t serialPollTicks = 1;
constexpr UBaseType_t taskPriority = 20;
constexpr BaseType_t taskCore = 0;
constexpr int noBrightness = -1;

constexpr size_t queueSize = 8;
constexpr size_t targetDepth = 3;

enum class Source { udp, serial };

uint8_t packet[protocol::maxPacketSize + 1];
uint8_t serialBuffer[1024];
protocol::SerialDecoder serialDecoder;
Source source = Source::udp;
std::mutex packetMutex;
uint8_t assembled[protocol::frameSize];
uint8_t* queue = nullptr;
uint32_t sequences[queueSize];
size_t queueStart = 0;
size_t queueCount = 0;
protocol::FrameAssembler assembler(assembled);
std::mutex queueMutex;
scheduler::FrameScheduler frameScheduler(targetDepth);
uint32_t framesReplaced = 0;
std::atomic<int> brightness{noBrightness};
std::atomic<uint32_t> framesDropped{0};
std::atomic<uint32_t> packetsReceived{0};
std::atomic<bool> hasSerialPacket{false};
std::atomic<uint32_t> serialPacketAt{0};

size_t getSlot(size_t index) { return (queueStart + index) % queueSize; }

uint8_t* getQueuedFrame(size_t index) { return queue + getSlot(index) * protocol::frameSize; }

void addFrame(uint32_t sequence) {
  std::lock_guard lock(queueMutex);
  frameScheduler.addFrame(sequence, micros());
  if (queueCount == queueSize) {
    queueStart = (queueStart + 1) % queueSize;
    queueCount--;
    framesReplaced++;
  }
  std::memcpy(getQueuedFrame(queueCount), assembled, protocol::frameSize);
  sequences[getSlot(queueCount)] = sequence;
  queueCount++;
  framesDropped = assembler.getFramesDropped() + framesReplaced;
}

void handlePacket(Source packetSource, const uint8_t* data, size_t size) {
  std::lock_guard lock(packetMutex);
  if (packetSource != source) {
    assembler.reset();
    source = packetSource;
  }
  const auto type = protocol::getMessageType(data, size);
  if (type == protocol::MessageType::frame) {
    const auto chunk = protocol::decodeFrameChunk(data, size);
    if (chunk && assembler.add(*chunk)) {
      addFrame(chunk->sequence);
    }
  } else if (type == protocol::MessageType::compressedFrame) {
    const auto chunk = protocol::decodeCompressedFrameChunk(data, size);
    if (chunk && assembler.add(*chunk)) {
      addFrame(chunk->sequence);
    }
  } else if (type == protocol::MessageType::setBrightness) {
    const auto value = protocol::decodeSetBrightness(data, size);
    if (value) {
      brightness = *value;
    }
  }
}

void handleSerialPacket(const uint8_t* data, size_t size) {
  if (!protocol::getMessageType(data, size)) {
    return;
  }
  packetsReceived++;
  serialPacketAt = millis();
  hasSerialPacket = true;
  handlePacket(Source::serial, data, size);
}

void receive(void*) {
  while (true) {
    const size_t size = udp::receive(packet, sizeof(packet));
    if (size > 0) {
      packetsReceived++;
    }
    if (size > 0 && size <= protocol::maxPacketSize && !isSerialActive()) {
      handlePacket(Source::udp, packet, size);
    }
  }
}

void receiveSerial(void*) {
  while (true) {
    const size_t size = usb::receive(serialBuffer, sizeof(serialBuffer));
    if (size == 0) {
      vTaskDelay(serialPollTicks);
      continue;
    }
    serialDecoder.add(serialBuffer, size, handleSerialPacket);
  }
}

}  // namespace

bool begin() {
  queue = static_cast<uint8_t*>(
      heap_caps_malloc(queueSize * protocol::frameSize, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  return queue && udp::begin(protocol::devicePort) &&
         xTaskCreatePinnedToCore(receive, "receiver", taskStackSize, nullptr, taskPriority, nullptr,
                                 taskCore) == pdPASS &&
         xTaskCreatePinnedToCore(receiveSerial, "serial receiver", taskStackSize, nullptr,
                                 taskPriority, nullptr, taskCore) == pdPASS;
}

std::optional<uint32_t> takeFrame(uint8_t* frame) {
  std::lock_guard lock(queueMutex);
  const uint32_t now = micros();
  if (!frameScheduler.isDue(queueCount, now)) {
    return std::nullopt;
  }
  std::memcpy(frame, getQueuedFrame(0), protocol::frameSize);
  const uint32_t sequence = sequences[queueStart];
  queueStart = (queueStart + 1) % queueSize;
  queueCount--;
  frameScheduler.setShown(queueCount, now);
  return sequence;
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

bool isSerialActive() {
  return hasSerialPacket && millis() - serialPacketAt < protocol::frameTimeoutMs;
}

}  // namespace receiver
