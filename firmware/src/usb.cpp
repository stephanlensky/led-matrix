#include "usb.h"

#include <Arduino.h>
#include <protocol.h>

#include <algorithm>
#include <array>
#include <cstring>

namespace usb {

namespace {

constexpr size_t rxBufferSize = 16384;
constexpr size_t txBufferSize = 4096;

std::array<uint8_t, txBufferSize> pending;
size_t pendingStart = 0;
size_t pendingEnd = 0;
bool isAfterText = false;

bool reserve(size_t size) {
  if (pendingEnd + size <= pending.size()) {
    return true;
  }
  const size_t pendingSize = pendingEnd - pendingStart;
  if (pendingSize + size > pending.size()) {
    return false;
  }
  std::memmove(pending.data(), pending.data() + pendingStart, pendingSize);
  pendingStart = 0;
  pendingEnd = pendingSize;
  return true;
}

}  // namespace

void begin() {
  Serial.setRxBufferSize(rxBufferSize);
  Serial.begin();
  Serial.setTxTimeoutMs(0);
}

size_t receive(uint8_t* buffer, size_t size) {
  const int available = Serial.available();
  if (available <= 0) {
    return 0;
  }
  return Serial.read(buffer, std::min(size, static_cast<size_t>(available)));
}

bool send(const uint8_t* data, size_t size) {
  const size_t delimiterSize = isAfterText ? 1 : 0;
  if (size > protocol::maxPacketSize || !reserve(delimiterSize + protocol::maxEncodedSerialSize)) {
    return false;
  }
  if (isAfterText) {
    pending[pendingEnd++] = protocol::serialDelimiter;
    isAfterText = false;
  }
  pendingEnd += protocol::encodeSerialPacket(data, size, pending.data() + pendingEnd);
  return true;
}

bool sendText(const char* text, size_t size) {
  if (!reserve(size)) {
    return false;
  }
  std::memcpy(pending.data() + pendingEnd, text, size);
  pendingEnd += size;
  isAfterText = true;
  return true;
}

void update() {
  if (!Serial) {
    pendingStart = 0;
    pendingEnd = 0;
    return;
  }
  while (pendingStart < pendingEnd) {
    const int available = Serial.availableForWrite();
    if (available <= 0) {
      return;
    }
    const size_t size = std::min(pendingEnd - pendingStart, static_cast<size_t>(available));
    const size_t written = Serial.write(pending.data() + pendingStart, size);
    if (written == 0) {
      return;
    }
    pendingStart += written;
  }
  pendingStart = 0;
  pendingEnd = 0;
}

}  // namespace usb
