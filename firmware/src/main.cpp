#include <Arduino.h>
#include <WiFi.h>
#include <protocol.h>

#include <optional>

#include "display.h"
#include "network.h"
#include "settings.h"
#include "udp.h"

namespace {

constexpr uint32_t testPatternMs = 2000;
constexpr size_t maxPacketsPerLoop = 64;

uint8_t packet[protocol::maxPacketSize + 1];
uint8_t frame[protocol::frameSize];
protocol::FrameAssembler assembler(frame);
uint8_t brightness;
uint32_t framesShown = 0;
uint32_t framesShownAtLastStatus = 0;
uint32_t lastStatusAt = 0;
std::optional<uint32_t> lastFrameAt;
bool wasStreaming = false;
std::optional<String> shownAddress;

bool isStreaming(uint32_t now) {
  return lastFrameAt && now - *lastFrameAt < protocol::frameTimeoutMs;
}

void sendStatus(uint32_t now) {
  lastStatusAt = now;
  if (!network::isConnected()) {
    return;
  }
  const auto status = protocol::encodeStatus({
      .brightness = brightness,
      .mode = isStreaming(now) ? protocol::Mode::streaming : protocol::Mode::idle,
      .uptimeMs = now,
      .framesShown = framesShown,
      .framesDropped = assembler.getFramesDropped(),
  });
  udp::send(network::getStatusAddress(), protocol::serverPort, status.data(), status.size());
}

void logStatus(uint32_t now) {
  Serial.printf("%s  %u fps  refresh %u Hz  shown %u  dropped %u  brightness %u  rssi %d\n",
                isStreaming(now) ? "streaming" : "idle",
                static_cast<unsigned>(framesShown - framesShownAtLastStatus),
                static_cast<unsigned>(display::getRefreshCount()),
                static_cast<unsigned>(framesShown),
                static_cast<unsigned>(assembler.getFramesDropped()), brightness,
                static_cast<int>(WiFi.RSSI()));
  framesShownAtLastStatus = framesShown;
}

void setBrightness(uint8_t value, uint32_t now) {
  if (value != brightness) {
    brightness = value;
    settings::setBrightness(value);
    display::setBrightness(value);
  }
  sendStatus(now);
}

void handlePacket(size_t size, uint32_t now) {
  const auto type = protocol::getMessageType(packet, size);
  if (type == protocol::MessageType::frame) {
    const auto chunk = protocol::decodeFrameChunk(packet, size);
    if (chunk && assembler.add(*chunk)) {
      display::showFrame(frame);
      framesShown++;
      lastFrameAt = now;
    }
  } else if (type == protocol::MessageType::setBrightness) {
    const auto value = protocol::decodeSetBrightness(packet, size);
    if (value) {
      setBrightness(*value, now);
    }
  }
}

void receivePackets(uint32_t now) {
  for (size_t i = 0; i < maxPacketsPerLoop; i++) {
    const size_t size = udp::receive(packet, sizeof(packet));
    if (size == 0) {
      return;
    }
    if (size <= protocol::maxPacketSize) {
      handlePacket(size, now);
    }
  }
}

void showNetwork() {
  const String address = network::isConnected() ? network::getLocalAddress().toString() : "";
  if (address == shownAddress) {
    return;
  }
  shownAddress = address;
  Serial.printf("network %s address %s\n", network::getName().c_str(), address.c_str());
  display::showLines({"LED MATRIX", network::getName(),
                      address.isEmpty() ? String("CONNECTING") : address,
                      "UDP " + String(protocol::devicePort)});
}

}  // namespace

void setup() {
  Serial.begin(115200);
  settings::begin();
  brightness = settings::getBrightness();
  if (!display::begin(brightness)) {
    Serial.println("display failed to start");
  }
  display::showTestPattern();
  network::begin();
  if (!udp::begin(protocol::devicePort)) {
    Serial.println("udp socket failed to open");
  }
  delay(testPatternMs);
}

void loop() {
  const uint32_t now = millis();
  receivePackets(now);
  const bool streaming = isStreaming(now);
  if (wasStreaming && !streaming) {
    display::clear();
  }
  wasStreaming = streaming;
  if (!lastFrameAt) {
    showNetwork();
  }
  if (now - lastStatusAt >= protocol::statusIntervalMs) {
    logStatus(now);
    sendStatus(now);
  }
}
