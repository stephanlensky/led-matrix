#pragma once

#include <array>
#include <bitset>
#include <cstddef>
#include <cstdint>
#include <optional>

namespace protocol {

constexpr uint16_t devicePort = 7700;
constexpr uint16_t serverPort = 7701;
constexpr uint8_t version = 1;
constexpr size_t headerSize = 4;
constexpr size_t frameHeaderSize = 12;
constexpr size_t setBrightnessSize = headerSize + 1;
constexpr size_t statusSize = 24;
constexpr size_t maxPacketSize = 1472;
constexpr uint32_t staleFrameWindow = 16;
constexpr uint32_t frameTimeoutMs = 2000;
constexpr uint32_t statusIntervalMs = 1000;
constexpr uint16_t width = 64;
constexpr uint16_t height = 64;
constexpr size_t channels = 3;
constexpr size_t pixelCount = width * height;
constexpr size_t frameSize = pixelCount * channels;

enum class MessageType : uint8_t { frame = 0x01, setBrightness = 0x02, status = 0x81 };

enum class Mode : uint8_t { idle = 0, streaming = 1, fallback = 2 };

struct FrameChunk {
  uint32_t sequence;
  uint8_t chunkIndex;
  uint8_t chunkCount;
  uint16_t offset;
  const uint8_t* pixels;
  size_t pixelCount;
};

struct Status {
  uint8_t brightness;
  Mode mode;
  uint32_t uptimeMs;
  uint32_t framesShown;
  uint32_t framesDropped;
};

std::optional<MessageType> getMessageType(const uint8_t* data, size_t size);
std::optional<FrameChunk> decodeFrameChunk(const uint8_t* data, size_t size);
std::optional<uint8_t> decodeSetBrightness(const uint8_t* data, size_t size);
std::array<uint8_t, statusSize> encodeStatus(const Status& status);

class FrameAssembler {
 public:
  explicit FrameAssembler(uint8_t* frame);
  bool add(const FrameChunk& chunk);
  uint32_t getFramesDropped() const { return framesDropped; }

 private:
  bool isStale(uint32_t sequence) const;

  uint8_t* frame;
  std::optional<uint32_t> pendingSequence;
  std::optional<uint32_t> latestSequence;
  std::bitset<256> received;
  uint32_t framesDropped = 0;
};

}  // namespace protocol
