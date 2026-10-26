#pragma once

#include <IPAddress.h>

#include <cstddef>
#include <cstdint>

namespace udp {

bool begin(uint16_t port);
size_t receive(uint8_t* buffer, size_t size);
void send(const IPAddress& address, uint16_t port, const uint8_t* data, size_t size);

}  // namespace udp
