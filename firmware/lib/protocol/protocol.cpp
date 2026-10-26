#include "protocol.h"

#include <cstring>

namespace protocol {

namespace {

constexpr uint8_t magic[] = {0x4c, 0x4d};

uint16_t readUint16(const uint8_t* data) { return data[0] | (data[1] << 8); }

uint32_t readUint32(const uint8_t* data) {
  return data[0] | (data[1] << 8) | (data[2] << 16) | (static_cast<uint32_t>(data[3]) << 24);
}

void writeUint16(uint8_t* data, uint16_t value) {
  data[0] = value & 0xff;
  data[1] = value >> 8;
}

void writeUint32(uint8_t* data, uint32_t value) {
  for (size_t i = 0; i < 4; i++) {
    data[i] = (value >> (i * 8)) & 0xff;
  }
}

bool isKnownType(uint8_t type) {
  return type == static_cast<uint8_t>(MessageType::frame) ||
         type == static_cast<uint8_t>(MessageType::setBrightness) ||
         type == static_cast<uint8_t>(MessageType::status);
}

int32_t getSequenceDistance(uint32_t from, uint32_t to) { return static_cast<int32_t>(to - from); }

}  // namespace

std::optional<MessageType> getMessageType(const uint8_t* data, size_t size) {
  if (size < headerSize || data[0] != magic[0] || data[1] != magic[1] || data[2] != version ||
      !isKnownType(data[3])) {
    return std::nullopt;
  }
  return static_cast<MessageType>(data[3]);
}

std::optional<FrameChunk> decodeFrameChunk(const uint8_t* data, size_t size) {
  if (getMessageType(data, size) != MessageType::frame || size <= frameHeaderSize) {
    return std::nullopt;
  }
  const size_t pixelBytes = size - frameHeaderSize;
  const uint16_t offset = readUint16(data + 10);
  if (pixelBytes % channels != 0 || offset + pixelBytes / channels > pixelCount) {
    return std::nullopt;
  }
  return FrameChunk{
      .sequence = readUint32(data + 4),
      .chunkIndex = data[8],
      .chunkCount = data[9],
      .offset = offset,
      .pixels = data + frameHeaderSize,
      .pixelCount = pixelBytes / channels,
  };
}

std::optional<uint8_t> decodeSetBrightness(const uint8_t* data, size_t size) {
  if (getMessageType(data, size) != MessageType::setBrightness || size < setBrightnessSize) {
    return std::nullopt;
  }
  return data[4];
}

std::array<uint8_t, statusSize> encodeStatus(const Status& status) {
  std::array<uint8_t, statusSize> bytes{};
  bytes[0] = magic[0];
  bytes[1] = magic[1];
  bytes[2] = version;
  bytes[3] = static_cast<uint8_t>(MessageType::status);
  writeUint16(&bytes[4], width);
  writeUint16(&bytes[6], height);
  bytes[8] = status.brightness;
  bytes[9] = static_cast<uint8_t>(status.mode);
  writeUint32(&bytes[12], status.uptimeMs);
  writeUint32(&bytes[16], status.framesShown);
  writeUint32(&bytes[20], status.framesDropped);
  return bytes;
}

FrameAssembler::FrameAssembler(uint8_t* frame) : frame(frame) {}

bool FrameAssembler::isStale(uint32_t sequence) const {
  if (!latestSequence) {
    return false;
  }
  const int32_t behind = getSequenceDistance(sequence, *latestSequence);
  return behind >= 0 && behind < static_cast<int32_t>(staleFrameWindow);
}

bool FrameAssembler::add(const FrameChunk& chunk) {
  if (chunk.chunkIndex >= chunk.chunkCount) {
    return false;
  }
  if (pendingSequence != chunk.sequence) {
    if (isStale(chunk.sequence)) {
      return false;
    }
    if (pendingSequence) {
      framesDropped++;
    }
    pendingSequence = chunk.sequence;
    latestSequence = chunk.sequence;
    received.reset();
  }
  std::memcpy(frame + chunk.offset * channels, chunk.pixels, chunk.pixelCount * channels);
  received.set(chunk.chunkIndex);
  if (received.count() < chunk.chunkCount) {
    return false;
  }
  pendingSequence.reset();
  return true;
}

}  // namespace protocol
