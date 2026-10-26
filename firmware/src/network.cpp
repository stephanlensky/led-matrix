#include "network.h"

#include <WiFi.h>

namespace network {

namespace {

constexpr const char* hostname = "led-matrix";

bool isStation() { return strlen(STATION_SSID) > 0; }

}  // namespace

void begin() {
  WiFi.setHostname(hostname);
  if (isStation()) {
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(STATION_SSID, STATION_PASSWORD);
  } else {
    WiFi.mode(WIFI_AP);
    WiFi.softAP(ACCESS_POINT_SSID, ACCESS_POINT_PASSWORD);
  }
  WiFi.setSleep(false);
}

bool isConnected() { return !isStation() || WiFi.status() == WL_CONNECTED; }

String getName() { return isStation() ? STATION_SSID : ACCESS_POINT_SSID; }

IPAddress getLocalAddress() { return isStation() ? WiFi.localIP() : WiFi.softAPIP(); }

IPAddress getStatusAddress() {
  IPAddress server;
  if (server.fromString(SERVER_HOST)) {
    return server;
  }
  return isStation() ? WiFi.broadcastIP() : WiFi.softAPBroadcastIP();
}

}  // namespace network
