#include <protocol.h>
#include <unity.h>

#include <algorithm>
#include <fstream>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

using namespace protocol;

using Packet = std::vector<uint8_t>;
using Frame = std::vector<uint8_t>;

constexpr size_t maxChunkPixels = 448;

Frame createGradient() {
  Frame frame(frameSize);
  for (size_t y = 0; y < height; y++) {
    for (size_t x = 0; x < width; x++) {
      const size_t index = (y * width + x) * channels;
      frame[index] = x * 4;
      frame[index + 1] = y * 4;
      frame[index + 2] = (x + y) % 256;
    }
  }
  return frame;
}

std::vector<Packet> encodeFrame(const Frame& frame, uint32_t sequence) {
  const size_t chunkCount = (pixelCount + maxChunkPixels - 1) / maxChunkPixels;
  std::vector<Packet> packets;
  for (size_t chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
    const size_t offset = chunkIndex * maxChunkPixels;
    const size_t chunkPixels = std::min(maxChunkPixels, pixelCount - offset);
    Packet packet = {0x4c,
                     0x4d,
                     version,
                     static_cast<uint8_t>(MessageType::frame),
                     static_cast<uint8_t>(sequence),
                     static_cast<uint8_t>(sequence >> 8),
                     static_cast<uint8_t>(sequence >> 16),
                     static_cast<uint8_t>(sequence >> 24),
                     static_cast<uint8_t>(chunkIndex),
                     static_cast<uint8_t>(chunkCount),
                     static_cast<uint8_t>(offset),
                     static_cast<uint8_t>(offset >> 8)};
    packet.insert(packet.end(), frame.begin() + offset * channels,
                  frame.begin() + (offset + chunkPixels) * channels);
    packets.push_back(packet);
  }
  return packets;
}

std::vector<FrameChunk> getChunks(const std::vector<Packet>& packets) {
  std::vector<FrameChunk> chunks;
  for (const Packet& packet : packets) {
    chunks.push_back(decodeFrameChunk(packet.data(), packet.size()).value());
  }
  return chunks;
}

bool addAll(FrameAssembler& assembler, const std::vector<Packet>& packets) {
  bool isComplete = false;
  for (const FrameChunk& chunk : getChunks(packets)) {
    isComplete = assembler.add(chunk) || isComplete;
  }
  return isComplete;
}

std::vector<Packet> slice(const std::vector<Packet>& packets, size_t start, size_t end) {
  return {packets.begin() + start, packets.begin() + std::min(end, packets.size())};
}

void test_decodes_frame_chunk_header() {
  const auto packets = encodeFrame(createGradient(), 0x01020304);
  const auto chunk = decodeFrameChunk(packets[1].data(), packets[1].size());
  TEST_ASSERT_TRUE(chunk.has_value());
  TEST_ASSERT_EQUAL_HEX32(0x01020304, chunk->sequence);
  TEST_ASSERT_EQUAL(1, chunk->chunkIndex);
  TEST_ASSERT_EQUAL(10, chunk->chunkCount);
  TEST_ASSERT_EQUAL(448, chunk->offset);
  TEST_ASSERT_EQUAL(448, chunk->pixelCount);
}

void test_ignores_packets_with_wrong_magic_version_or_size() {
  const Packet packet = encodeFrame(createGradient(), 1)[0];
  const Packet wrongMagic = {0, 0, 1, 1};
  const Packet wrongVersion = {0x4c, 0x4d, 2, 1};
  const Packet unknownType = {0x4c, 0x4d, 1, 0x7f};
  TEST_ASSERT_FALSE(getMessageType(packet.data(), 3).has_value());
  TEST_ASSERT_FALSE(getMessageType(wrongMagic.data(), wrongMagic.size()).has_value());
  TEST_ASSERT_FALSE(getMessageType(wrongVersion.data(), wrongVersion.size()).has_value());
  TEST_ASSERT_FALSE(getMessageType(unknownType.data(), unknownType.size()).has_value());
  TEST_ASSERT_FALSE(decodeFrameChunk(packet.data(), 13).has_value());
  TEST_ASSERT_FALSE(decodeFrameChunk(packet.data(), frameHeaderSize).has_value());
}

void test_ignores_chunks_past_the_end_of_the_frame() {
  Packet packet = encodeFrame(createGradient(), 1)[9];
  packet[10] = 0xff;
  packet[11] = 0x0f;
  TEST_ASSERT_FALSE(decodeFrameChunk(packet.data(), packet.size()).has_value());
}

void test_decodes_set_brightness() {
  const Packet packet = {0x4c, 0x4d, 1, 0x02, 42};
  TEST_ASSERT_EQUAL(42, decodeSetBrightness(packet.data(), packet.size()).value());
  TEST_ASSERT_FALSE(decodeSetBrightness(packet.data(), 4).has_value());
}

void test_encodes_status_in_little_endian() {
  const auto bytes = encodeStatus({
      .brightness = 128,
      .mode = Mode::streaming,
      .features = compressedFramesFeature,
      .uptimeMs = 123456,
      .framesShown = 900,
      .framesDropped = 3,
      .shownSequence = 0x01020304,
      .shownAgeMs = 300,
  });
  const uint8_t expected[] = {0x4c, 0x4d, 1, 0x81, 64, 0, 64, 0, 128, 1, 1, 0, 0x40, 0xe2, 0x01, 0,
                              0x84, 3,    0, 0,    3,  0, 0,  0, 4,   3, 2, 1, 0x2c, 1,    0,    0};
  TEST_ASSERT_EQUAL_UINT8_ARRAY(expected, bytes.data(), statusSize);
}

void test_reassembles_frame_in_any_order() {
  const Frame frame = createGradient();
  Frame assembled(frameSize);
  FrameAssembler assembler(assembled.data());
  auto packets = encodeFrame(frame, 1);
  std::reverse(packets.begin(), packets.end());
  TEST_ASSERT_TRUE(addAll(assembler, packets));
  TEST_ASSERT_EQUAL_UINT8_ARRAY(frame.data(), assembled.data(), frameSize);
  const size_t index = (20 * width + 10) * channels;
  TEST_ASSERT_EQUAL(40, assembled[index]);
  TEST_ASSERT_EQUAL(80, assembled[index + 1]);
  TEST_ASSERT_EQUAL(30, assembled[index + 2]);
}

void test_drops_incomplete_frame_when_newer_one_starts() {
  Frame assembled(frameSize);
  FrameAssembler assembler(assembled.data());
  addAll(assembler, slice(encodeFrame(createGradient(), 1), 1, 10));
  TEST_ASSERT_TRUE(addAll(assembler, encodeFrame(createGradient(), 2)));
  TEST_ASSERT_EQUAL(1, assembler.getFramesDropped());
}

void test_ignores_late_chunks_from_older_frames() {
  Frame assembled(frameSize);
  FrameAssembler assembler(assembled.data());
  const auto older = encodeFrame(createGradient(), 5);
  const auto newer = encodeFrame(createGradient(), 6);
  addAll(assembler, slice(newer, 0, 1));
  addAll(assembler, slice(older, 1, 2));
  TEST_ASSERT_TRUE(addAll(assembler, slice(newer, 1, 10)));
  TEST_ASSERT_FALSE(addAll(assembler, older));
  TEST_ASSERT_EQUAL(0, assembler.getFramesDropped());
}

void test_accepts_restarted_sequence_far_behind() {
  Frame assembled(frameSize);
  FrameAssembler assembler(assembled.data());
  addAll(assembler, encodeFrame(createGradient(), 5000));
  TEST_ASSERT_TRUE(addAll(assembler, encodeFrame(createGradient(), 0)));
  TEST_ASSERT_FALSE(addAll(assembler, encodeFrame(createGradient(), 1 - staleFrameWindow)));
}

void test_follows_sequence_across_wraparound() {
  Frame assembled(frameSize);
  FrameAssembler assembler(assembled.data());
  addAll(assembler, encodeFrame(createGradient(), 0xffffffff));
  TEST_ASSERT_TRUE(addAll(assembler, encodeFrame(createGradient(), 0)));
  TEST_ASSERT_FALSE(addAll(assembler, encodeFrame(createGradient(), 0xffffffff)));
}

Packet createCompressedChunk(uint32_t sequence, uint8_t chunkIndex, uint8_t chunkCount,
                             uint16_t offset, uint16_t chunkPixels, const Packet& data) {
  Packet packet = {0x4c,
                   0x4d,
                   version,
                   static_cast<uint8_t>(MessageType::compressedFrame),
                   static_cast<uint8_t>(sequence),
                   static_cast<uint8_t>(sequence >> 8),
                   static_cast<uint8_t>(sequence >> 16),
                   static_cast<uint8_t>(sequence >> 24),
                   chunkIndex,
                   chunkCount,
                   static_cast<uint8_t>(offset),
                   static_cast<uint8_t>(offset >> 8),
                   static_cast<uint8_t>(chunkPixels),
                   static_cast<uint8_t>(chunkPixels >> 8)};
  packet.insert(packet.end(), data.begin(), data.end());
  return packet;
}

Packet getRepeatRuns(size_t count, uint8_t red, uint8_t green, uint8_t blue) {
  Packet data;
  for (size_t remaining = count; remaining > 0;) {
    const size_t run = std::min<size_t>(remaining, 128);
    data.insert(data.end(), {static_cast<uint8_t>(0x80 + run - 1), red, green, blue});
    remaining -= run;
  }
  return data;
}

bool addCompressed(FrameAssembler& assembler, const Packet& packet) {
  const auto chunk = decodeCompressedFrameChunk(packet.data(), packet.size());
  return chunk && assembler.add(*chunk);
}

void test_reassembles_compressed_frame() {
  Frame assembled(frameSize, 0xff);
  FrameAssembler assembler(assembled.data());
  Packet tail = {0x01, 10, 20, 30, 40, 50, 60};
  const Packet runs = getRepeatRuns(94, 0, 0, 255);
  tail.insert(tail.end(), runs.begin(), runs.end());
  const Packet head = createCompressedChunk(9, 0, 2, 0, 4000, getRepeatRuns(4000, 255, 0, 0));
  TEST_ASSERT_FALSE(addCompressed(assembler, createCompressedChunk(9, 1, 2, 4000, 96, tail)));
  TEST_ASSERT_TRUE(addCompressed(assembler, head));
  TEST_ASSERT_EQUAL(255, assembled[3999 * channels]);
  TEST_ASSERT_EQUAL(0, assembled[3999 * channels + 2]);
  TEST_ASSERT_EQUAL(10, assembled[4000 * channels]);
  TEST_ASSERT_EQUAL(60, assembled[4001 * channels + 2]);
  TEST_ASSERT_EQUAL(255, assembled[(pixelCount - 1) * channels + 2]);
}

void test_rejects_malformed_runs() {
  uint8_t pixels[2 * channels];
  const uint8_t valid[] = {0x81, 1, 2, 3};
  const uint8_t overflow[] = {0x82, 1, 2, 3};
  const uint8_t shortRun[] = {0x80, 1, 2, 3};
  const uint8_t truncated[] = {0x01, 1, 2, 3};
  TEST_ASSERT_TRUE(decodeRunLength(valid, sizeof(valid), pixels, 2));
  TEST_ASSERT_EQUAL(3, pixels[5]);
  TEST_ASSERT_FALSE(decodeRunLength(overflow, sizeof(overflow), pixels, 2));
  TEST_ASSERT_FALSE(decodeRunLength(shortRun, sizeof(shortRun), pixels, 2));
  TEST_ASSERT_FALSE(decodeRunLength(truncated, sizeof(truncated), pixels, 2));
  const Packet outside = createCompressedChunk(1, 0, 1, 4090, 10, getRepeatRuns(10, 1, 2, 3));
  TEST_ASSERT_FALSE(decodeCompressedFrameChunk(outside.data(), outside.size()).has_value());
}

Packet getBytes(const std::string& hex) {
  Packet bytes;
  for (size_t index = 0; index + 1 < hex.size(); index += 2) {
    bytes.push_back(static_cast<uint8_t>(std::stoul(hex.substr(index, 2), nullptr, 16)));
  }
  return bytes;
}

std::vector<std::pair<Packet, Packet>> getSerialVectors() {
  const std::string path = __FILE__;
  std::ifstream file(path.substr(0, path.find_last_of('/')) + "/../serial_vectors.txt");
  std::vector<std::pair<Packet, Packet>> vectors;
  std::string line;
  while (std::getline(file, line)) {
    if (line.empty() || line[0] == '#') {
      continue;
    }
    std::istringstream stream(line);
    std::string packet;
    std::string encoded;
    stream >> packet >> encoded;
    vectors.emplace_back(getBytes(packet), getBytes(encoded));
  }
  return vectors;
}

Packet encodeSerial(const Packet& packet) {
  Packet encoded(maxEncodedSerialSize);
  encoded.resize(encodeSerialPacket(packet.data(), packet.size(), encoded.data()));
  return encoded;
}

std::vector<Packet> decodeSerial(SerialDecoder& decoder, const Packet& stream, size_t chunkSize) {
  std::vector<Packet> packets;
  for (size_t start = 0; start < stream.size(); start += chunkSize) {
    decoder.add(stream.data() + start, std::min(chunkSize, stream.size() - start),
                [&](const uint8_t* data, size_t size) { packets.emplace_back(data, data + size); });
  }
  return packets;
}

Packet join(const std::vector<Packet>& packets) {
  Packet joined;
  for (const Packet& packet : packets) {
    joined.insert(joined.end(), packet.begin(), packet.end());
  }
  return joined;
}

void test_matches_shared_serial_vectors() {
  const auto vectors = getSerialVectors();
  TEST_ASSERT_EQUAL(13, vectors.size());
  for (const auto& [packet, encoded] : vectors) {
    const Packet actual = encodeSerial(packet);
    TEST_ASSERT_EQUAL(encoded.size(), actual.size());
    TEST_ASSERT_EQUAL_HEX8_ARRAY(encoded.data(), actual.data(), encoded.size());
    SerialDecoder decoder;
    const auto decoded = decodeSerial(decoder, encoded, 1);
    TEST_ASSERT_EQUAL(1, decoded.size());
    TEST_ASSERT_EQUAL(packet.size(), decoded[0].size());
    TEST_ASSERT_EQUAL_HEX8_ARRAY(packet.data(), decoded[0].data(), packet.size());
  }
}

void test_decodes_serial_stream_in_any_chunk_size() {
  const auto packets = encodeFrame(createGradient(), 9);
  Packet stream;
  for (const Packet& packet : packets) {
    const Packet encoded = encodeSerial(packet);
    stream.insert(stream.end(), encoded.begin(), encoded.end());
  }
  for (const size_t chunkSize : {size_t{1}, size_t{7}, size_t{64}, stream.size()}) {
    SerialDecoder decoder;
    const auto decoded = decodeSerial(decoder, stream, chunkSize);
    TEST_ASSERT_EQUAL(packets.size(), decoded.size());
    TEST_ASSERT_TRUE(decoded == packets);
  }
}

void test_decodes_serial_packets_up_to_max_size() {
  Packet largest(maxPacketSize);
  for (size_t index = 0; index < largest.size(); index++) {
    largest[index] = index % 300 < 260 ? static_cast<uint8_t>(index % 255 + 1) : 0;
  }
  Packet oversized(maxPacketSize + 1, 0x11);
  const Packet encoded = encodeSerial(largest);
  TEST_ASSERT_TRUE(encoded.size() <= maxEncodedSerialSize);
  TEST_ASSERT_TRUE(encodeSerial(Packet(maxPacketSize, 0x11)).size() == maxEncodedSerialSize);
  SerialDecoder decoder;
  const auto decoded =
      decodeSerial(decoder, join({encodeSerial(oversized), encoded, encodeSerial(oversized)}), 5);
  TEST_ASSERT_EQUAL(1, decoded.size());
  TEST_ASSERT_TRUE(decoded[0] == largest);
}

void test_resyncs_after_garbage_and_truncated_packets() {
  const Packet brightness = {0x4c, 0x4d, version, static_cast<uint8_t>(MessageType::setBrightness),
                             7};
  const Packet encoded = encodeSerial(brightness);
  const Packet truncated(encoded.begin(), encoded.begin() + 3);
  SerialDecoder decoder;
  const auto decoded = decodeSerial(decoder,
                                    join({{0x00, 0x00, 0x13, 0x37, 0xff, 0x00},
                                          encoded,
                                          {0x42, 0x43},
                                          encoded,
                                          truncated,
                                          {0x00},
                                          {0x09, 0x01, 0x00},
                                          encoded}),
                                    3);
  TEST_ASSERT_EQUAL(2, decoded.size());
  TEST_ASSERT_TRUE(decoded[0] == brightness);
  TEST_ASSERT_TRUE(decoded[1] == brightness);
}

void setUp() {}

void tearDown() {}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_decodes_frame_chunk_header);
  RUN_TEST(test_ignores_packets_with_wrong_magic_version_or_size);
  RUN_TEST(test_ignores_chunks_past_the_end_of_the_frame);
  RUN_TEST(test_decodes_set_brightness);
  RUN_TEST(test_encodes_status_in_little_endian);
  RUN_TEST(test_reassembles_frame_in_any_order);
  RUN_TEST(test_drops_incomplete_frame_when_newer_one_starts);
  RUN_TEST(test_ignores_late_chunks_from_older_frames);
  RUN_TEST(test_accepts_restarted_sequence_far_behind);
  RUN_TEST(test_follows_sequence_across_wraparound);
  RUN_TEST(test_reassembles_compressed_frame);
  RUN_TEST(test_rejects_malformed_runs);
  RUN_TEST(test_matches_shared_serial_vectors);
  RUN_TEST(test_decodes_serial_stream_in_any_chunk_size);
  RUN_TEST(test_decodes_serial_packets_up_to_max_size);
  RUN_TEST(test_resyncs_after_garbage_and_truncated_packets);
  return UNITY_END();
}
