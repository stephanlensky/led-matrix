#include "protocol.h"

#ifdef ESP_PLATFORM
#include <miniz.h>
#else
#include <zlib.h>
#endif

namespace protocol {

#ifdef ESP_PLATFORM

namespace {

tinfl_decompressor decompressor;

}  // namespace

std::optional<size_t> inflateRaw(const uint8_t* data, size_t size, uint8_t* output,
                                 size_t outputSize) {
  tinfl_init(&decompressor);
  size_t inputSize = size;
  size_t written = outputSize;
  const tinfl_status status = tinfl_decompress(&decompressor, data, &inputSize, output, output,
                                               &written, TINFL_FLAG_USING_NON_WRAPPING_OUTPUT_BUF);
  if (status != TINFL_STATUS_DONE) {
    return std::nullopt;
  }
  return written;
}

#else

std::optional<size_t> inflateRaw(const uint8_t* data, size_t size, uint8_t* output,
                                 size_t outputSize) {
  z_stream stream{};
  if (inflateInit2(&stream, -MAX_WBITS) != Z_OK) {
    return std::nullopt;
  }
  stream.next_in = const_cast<uint8_t*>(data);
  stream.avail_in = size;
  stream.next_out = output;
  stream.avail_out = outputSize;
  const int result = inflate(&stream, Z_FINISH);
  const size_t written = stream.total_out;
  inflateEnd(&stream);
  if (result != Z_STREAM_END) {
    return std::nullopt;
  }
  return written;
}

#endif

}  // namespace protocol
