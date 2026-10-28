#include "protocol.h"

#include <cstring>

namespace protocol {

namespace {

constexpr uint8_t magic[] = {0x4c, 0x4d};
constexpr uint8_t repeatFlag = 0x80;

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
         type == static_cast<uint8_t>(MessageType::compressedFrame) ||
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

std::optional<CompressedFrameChunk> decodeCompressedFrameChunk(const uint8_t* data, size_t size) {
  if (getMessageType(data, size) != MessageType::compressedFrame ||
      size < compressedFrameHeaderSize) {
    return std::nullopt;
  }
  const uint16_t offset = readUint16(data + 10);
  const uint16_t chunkPixels = readUint16(data + 12);
  if (chunkPixels == 0 || offset + chunkPixels > pixelCount) {
    return std::nullopt;
  }
  return CompressedFrameChunk{
      .sequence = readUint32(data + 4),
      .chunkIndex = data[8],
      .chunkCount = data[9],
      .offset = offset,
      .pixelCount = chunkPixels,
      .data = data + compressedFrameHeaderSize,
      .dataSize = size - compressedFrameHeaderSize,
  };
}

bool decodeRunLength(const uint8_t* data, size_t size, uint8_t* pixels, size_t pixelCount) {
  size_t position = 0;
  size_t pixel = 0;
  while (position < size) {
    const uint8_t token = data[position++];
    const bool isRepeat = token >= repeatFlag;
    const size_t count = (token & (repeatFlag - 1)) + 1;
    const size_t tokenSize = isRepeat ? channels : count * channels;
    if (pixel + count > pixelCount || position + tokenSize > size) {
      return false;
    }
    if (isRepeat) {
      for (size_t index = 0; index < count; index++) {
        std::memcpy(pixels + (pixel + index) * channels, data + position, channels);
      }
    } else {
      std::memcpy(pixels + pixel * channels, data + position, tokenSize);
    }
    position += tokenSize;
    pixel += count;
  }
  return pixel == pixelCount;
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
  bytes[10] = status.features;
  writeUint32(&bytes[12], status.uptimeMs);
  writeUint32(&bytes[16], status.framesShown);
  writeUint32(&bytes[20], status.framesDropped);
  writeUint32(&bytes[24], status.shownSequence);
  writeUint16(&bytes[28], status.shownAgeMs);
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

bool FrameAssembler::start(uint32_t sequence, uint8_t chunkIndex, uint8_t chunkCount) {
  if (chunkIndex >= chunkCount) {
    return false;
  }
  if (pendingSequence != sequence) {
    if (isStale(sequence)) {
      return false;
    }
    if (pendingSequence) {
      framesDropped++;
    }
    pendingSequence = sequence;
    latestSequence = sequence;
    received.reset();
  }
  return true;
}

bool FrameAssembler::finish(uint8_t chunkIndex, uint8_t chunkCount) {
  received.set(chunkIndex);
  if (received.count() < chunkCount) {
    return false;
  }
  pendingSequence.reset();
  return true;
}

bool FrameAssembler::add(const FrameChunk& chunk) {
  if (!start(chunk.sequence, chunk.chunkIndex, chunk.chunkCount)) {
    return false;
  }
  std::memcpy(frame + chunk.offset * channels, chunk.pixels, chunk.pixelCount * channels);
  return finish(chunk.chunkIndex, chunk.chunkCount);
}

bool FrameAssembler::add(const CompressedFrameChunk& chunk) {
  if (!start(chunk.sequence, chunk.chunkIndex, chunk.chunkCount) ||
      !decodeRunLength(chunk.data, chunk.dataSize, frame + chunk.offset * channels,
                       chunk.pixelCount)) {
    return false;
  }
  return finish(chunk.chunkIndex, chunk.chunkCount);
}

}  // namespace protocol
