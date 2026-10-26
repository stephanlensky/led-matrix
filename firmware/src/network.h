#pragma once

#include <Arduino.h>
#include <IPAddress.h>

namespace network {

void begin();
bool isConnected();
String getName();
IPAddress getLocalAddress();
IPAddress getStatusAddress();

}  // namespace network
