#include "protocol.h"

#include <algorithm>
#include <cstring>

namespace protocol {

namespace {

constexpr uint8_t magic[] = {0x4c, 0x4d};
constexpr uint8_t repeatFlag = 0x80;
constexpr uint8_t maxBlockCode = 0xff;

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
         type == static_cast<uint8_t>(MessageType::deflateFrame) ||
         type == static_cast<uint8_t>(MessageType::status) ||
         type == static_cast<uint8_t>(MessageType::log);
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

std::optional<DeflateFrameChunk> decodeDeflateFrameChunk(const uint8_t* data, size_t size) {
  if (getMessageType(data, size) != MessageType::deflateFrame || size <= deflateFrameHeaderSize) {
    return std::nullopt;
  }
  const uint16_t offset = readUint16(data + 10);
  const uint16_t deflatedSize = readUint16(data + 12);
  const uint8_t filter = data[14];
  const size_t dataSize = size - deflateFrameHeaderSize;
  if (deflatedSize > frameSize || offset + dataSize > deflatedSize ||
      filter > static_cast<uint8_t>(DeflateFilter::sub)) {
    return std::nullopt;
  }
  return DeflateFrameChunk{
      .sequence = readUint32(data + 4),
      .chunkIndex = data[8],
      .chunkCount = data[9],
      .offset = offset,
      .size = deflatedSize,
      .filter = static_cast<DeflateFilter>(filter),
      .data = data + deflateFrameHeaderSize,
      .dataSize = dataSize,
  };
}

void removeSubFilter(uint8_t* frame) {
  constexpr size_t rowSize = width * channels;
  for (size_t row = 0; row < frameSize; row += rowSize) {
    for (size_t index = row + channels; index < row + rowSize; index++) {
      frame[index] += frame[index - channels];
    }
  }
}

bool inflateFrame(const uint8_t* data, size_t size, DeflateFilter filter, uint8_t* frame) {
  if (inflateRaw(data, size, frame, frameSize) != frameSize) {
    return false;
  }
  if (filter == DeflateFilter::sub) {
    removeSubFilter(frame);
  }
  return true;
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

size_t encodeLog(const char* text, size_t size, uint8_t* packet) {
  const size_t textSize = std::min(size, maxPacketSize - headerSize);
  packet[0] = magic[0];
  packet[1] = magic[1];
  packet[2] = version;
  packet[3] = static_cast<uint8_t>(MessageType::log);
  std::memcpy(packet + headerSize, text, textSize);
  return headerSize + textSize;
}

size_t encodeSerialPacket(const uint8_t* data, size_t size, uint8_t* encoded) {
  size_t codeIndex = 0;
  size_t position = 1;
  uint8_t code = 1;
  for (size_t index = 0; index < size; index++) {
    if (data[index] != serialDelimiter) {
      encoded[position++] = data[index];
      code++;
    }
    if (data[index] == serialDelimiter || (code == maxBlockCode && index + 1 < size)) {
      encoded[codeIndex] = code;
      code = 1;
      codeIndex = position++;
    }
  }
  encoded[codeIndex] = code;
  encoded[position++] = serialDelimiter;
  return position;
}

bool SerialDecoder::add(uint8_t byte) {
  if (byte == serialDelimiter) {
    const bool isComplete = isStarted && !isDiscarding && remaining == 0 && size > 0;
    packetSize = isComplete ? size : 0;
    reset();
    return isComplete;
  }
  if (isDiscarding) {
    return false;
  }
  if (remaining > 0) {
    append(byte);
    remaining--;
    return false;
  }
  if (isZeroPending) {
    append(serialDelimiter);
  }
  isStarted = true;
  isZeroPending = byte != maxBlockCode;
  remaining = byte - 1;
  return false;
}

void SerialDecoder::append(uint8_t byte) {
  if (size == packet.size()) {
    isDiscarding = true;
    return;
  }
  packet[size++] = byte;
}

void SerialDecoder::reset() {
  size = 0;
  remaining = 0;
  isStarted = false;
  isZeroPending = false;
  isDiscarding = false;
}

FrameAssembler::FrameAssembler(uint8_t* frame, uint8_t* deflated)
    : frame(frame), deflated(deflated) {}

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
    deflatedSize.reset();
  }
  return true;
}

void FrameAssembler::reset() {
  if (pendingSequence) {
    framesDropped++;
  }
  pendingSequence.reset();
  latestSequence.reset();
  received.reset();
  deflatedSize.reset();
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
  if (!start(chunk.sequence, chunk.chunkIndex, chunk.chunkCount) || deflatedSize) {
    return false;
  }
  std::memcpy(frame + chunk.offset * channels, chunk.pixels, chunk.pixelCount * channels);
  return finish(chunk.chunkIndex, chunk.chunkCount);
}

bool FrameAssembler::add(const CompressedFrameChunk& chunk) {
  if (!start(chunk.sequence, chunk.chunkIndex, chunk.chunkCount) || deflatedSize ||
      !decodeRunLength(chunk.data, chunk.dataSize, frame + chunk.offset * channels,
                       chunk.pixelCount)) {
    return false;
  }
  return finish(chunk.chunkIndex, chunk.chunkCount);
}

bool FrameAssembler::add(const DeflateFrameChunk& chunk) {
  if (!start(chunk.sequence, chunk.chunkIndex, chunk.chunkCount)) {
    return false;
  }
  if (!deflatedSize) {
    if (received.any()) {
      return false;
    }
    deflatedSize = chunk.size;
    deflatedFilter = chunk.filter;
  }
  if (chunk.size != *deflatedSize || chunk.filter != deflatedFilter) {
    return false;
  }
  std::memcpy(deflated + chunk.offset, chunk.data, chunk.dataSize);
  if (!finish(chunk.chunkIndex, chunk.chunkCount)) {
    return false;
  }
  const uint16_t size = *deflatedSize;
  deflatedSize.reset();
  if (!inflateFrame(deflated, size, deflatedFilter, frame)) {
    framesDropped++;
    return false;
  }
  return true;
}

}  // namespace protocol
