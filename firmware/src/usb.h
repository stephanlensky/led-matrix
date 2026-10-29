#pragma once

#include <cstddef>
#include <cstdint>

namespace usb {

void begin();
size_t receive(uint8_t* buffer, size_t size);
bool send(const uint8_t* data, size_t size);
bool sendText(const char* text, size_t size);
void update();

}  // namespace usb
