#include <protocol.h>
#include <unity.h>

#include <algorithm>
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
      .uptimeMs = 123456,
      .framesShown = 900,
      .framesDropped = 3,
      .shownSequence = 0x01020304,
      .shownAgeMs = 300,
  });
  const uint8_t expected[] = {0x4c, 0x4d, 1, 0x81, 64, 0, 64, 0, 128, 1, 0, 0, 0x40, 0xe2, 0x01, 0,
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
  return UNITY_END();
}
