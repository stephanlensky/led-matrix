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
constexpr size_t compressedFrameHeaderSize = 14;
constexpr size_t deflateFrameHeaderSize = 16;
constexpr size_t setBrightnessSize = headerSize + 1;
constexpr size_t statusSize = 32;
constexpr size_t maxPacketSize = 1472;
constexpr uint8_t serialDelimiter = 0x00;
constexpr size_t maxEncodedSerialSize = maxPacketSize + (maxPacketSize + 253) / 254 + 1;
constexpr uint32_t staleFrameWindow = 16;
constexpr uint32_t frameTimeoutMs = 2000;
constexpr uint32_t statusIntervalMs = 1000;
constexpr uint16_t width = 64;
constexpr uint16_t height = 64;
constexpr size_t channels = 3;
constexpr size_t pixelCount = width * height;
constexpr size_t frameSize = pixelCount * channels;
constexpr uint8_t compressedFramesFeature = 0x01;
constexpr uint8_t deflateFramesFeature = 0x02;

enum class MessageType : uint8_t {
  frame = 0x01,
  setBrightness = 0x02,
  compressedFrame = 0x03,
  deflateFrame = 0x04,
  status = 0x81,
  log = 0x82
};

enum class Mode : uint8_t { idle = 0, streaming = 1, fallback = 2 };

enum class DeflateFilter : uint8_t { none = 0, sub = 1 };

struct FrameChunk {
  uint32_t sequence;
  uint8_t chunkIndex;
  uint8_t chunkCount;
  uint16_t offset;
  const uint8_t* pixels;
  size_t pixelCount;
};

struct CompressedFrameChunk {
  uint32_t sequence;
  uint8_t chunkIndex;
  uint8_t chunkCount;
  uint16_t offset;
  uint16_t pixelCount;
  const uint8_t* data;
  size_t dataSize;
};

struct DeflateFrameChunk {
  uint32_t sequence;
  uint8_t chunkIndex;
  uint8_t chunkCount;
  uint16_t offset;
  uint16_t size;
  DeflateFilter filter;
  const uint8_t* data;
  size_t dataSize;
};

struct Status {
  uint8_t brightness;
  Mode mode;
  uint8_t features;
  uint32_t uptimeMs;
  uint32_t framesShown;
  uint32_t framesDropped;
  uint32_t shownSequence;
  uint16_t shownAgeMs;
};

std::optional<MessageType> getMessageType(const uint8_t* data, size_t size);
std::optional<FrameChunk> decodeFrameChunk(const uint8_t* data, size_t size);
std::optional<CompressedFrameChunk> decodeCompressedFrameChunk(const uint8_t* data, size_t size);
std::optional<DeflateFrameChunk> decodeDeflateFrameChunk(const uint8_t* data, size_t size);
bool decodeRunLength(const uint8_t* data, size_t size, uint8_t* pixels, size_t pixelCount);
std::optional<size_t> inflateRaw(const uint8_t* data, size_t size, uint8_t* output,
                                 size_t outputSize);
void removeSubFilter(uint8_t* frame);
bool inflateFrame(const uint8_t* data, size_t size, DeflateFilter filter, uint8_t* frame);
std::optional<uint8_t> decodeSetBrightness(const uint8_t* data, size_t size);
std::array<uint8_t, statusSize> encodeStatus(const Status& status);
size_t encodeLog(const char* text, size_t size, uint8_t* packet);
size_t encodeSerialPacket(const uint8_t* data, size_t size, uint8_t* encoded);

class SerialDecoder {
 public:
  bool add(uint8_t byte);
  const uint8_t* getPacket() const { return packet.data(); }
  size_t getPacketSize() const { return packetSize; }

  template <typename Handler>
  void add(const uint8_t* data, size_t size, Handler&& handle) {
    for (size_t index = 0; index < size; index++) {
      if (add(data[index])) {
        handle(packet.data(), packetSize);
      }
    }
  }

 private:
  void append(uint8_t byte);
  void reset();

  std::array<uint8_t, maxPacketSize> packet{};
  size_t size = 0;
  size_t packetSize = 0;
  uint8_t remaining = 0;
  bool isStarted = false;
  bool isZeroPending = false;
  bool isDiscarding = false;
};

class FrameAssembler {
 public:
  FrameAssembler(uint8_t* frame, uint8_t* deflated);
  bool add(const FrameChunk& chunk);
  bool add(const CompressedFrameChunk& chunk);
  bool add(const DeflateFrameChunk& chunk);
  void reset();
  uint32_t getFramesDropped() const { return framesDropped; }

 private:
  bool isStale(uint32_t sequence) const;
  bool start(uint32_t sequence, uint8_t chunkIndex, uint8_t chunkCount);
  bool finish(uint8_t chunkIndex, uint8_t chunkCount);

  uint8_t* frame;
  uint8_t* deflated;
  std::optional<uint16_t> deflatedSize;
  DeflateFilter deflatedFilter = DeflateFilter::none;
  std::optional<uint32_t> pendingSequence;
  std::optional<uint32_t> latestSequence;
  std::bitset<256> received;
  uint32_t framesDropped = 0;
};

}  // namespace protocol
