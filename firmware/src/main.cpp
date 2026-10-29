#include <Arduino.h>
#include <WiFi.h>
#include <protocol.h>

#include <algorithm>
#include <cstdarg>
#include <optional>

#include "display.h"
#include "network.h"
#include "receiver.h"
#include "settings.h"
#include "udp.h"
#include "usb.h"

namespace {

constexpr uint32_t testPatternMs = 2000;

uint8_t frame[protocol::frameSize];
uint8_t brightness;
uint32_t framesShown = 0;
uint32_t framesShownAtLastStatus = 0;
uint32_t packetsAtLastStatus = 0;
uint32_t lastStatusAt = 0;
std::optional<uint32_t> lastFrameAt;
uint32_t shownSequence = 0;
uint32_t shownAtUs = 0;
bool wasStreaming = false;
bool wasSerialActive = false;
std::optional<String> shownAddress;

uint16_t getShownAgeMs() {
  const int32_t visibleAtUs = shownAtUs + display::getFramePeriodUs() / 2;
  const int32_t ageUs = micros() - visibleAtUs;
  return std::clamp<int32_t>(ageUs / 1000, 0, UINT16_MAX);
}

bool isStreaming(uint32_t now) {
  return lastFrameAt && now - *lastFrameAt < protocol::frameTimeoutMs;
}

void log(const char* format, ...) {
  char text[256];
  va_list arguments;
  va_start(arguments, format);
  const int written = vsnprintf(text, sizeof(text), format, arguments);
  va_end(arguments);
  const size_t size = std::clamp<int>(written, 0, sizeof(text) - 1);
  if (receiver::isSerialActive()) {
    uint8_t packet[protocol::maxPacketSize];
    usb::send(packet, protocol::encodeLog(text, size, packet));
  } else {
    usb::sendText(text, size);
    usb::sendText("\n", 1);
  }
}

void sendStatus(uint32_t now) {
  lastStatusAt = now;
  const bool isSerialActive = receiver::isSerialActive();
  if (!isSerialActive && !network::isConnected()) {
    return;
  }
  const auto status = protocol::encodeStatus({
      .brightness = brightness,
      .mode = isStreaming(now) ? protocol::Mode::streaming : protocol::Mode::idle,
      .features = protocol::compressedFramesFeature,
      .uptimeMs = now,
      .framesShown = framesShown,
      .framesDropped = receiver::getFramesDropped(),
      .shownSequence = shownSequence,
      .shownAgeMs = getShownAgeMs(),
  });
  if (isSerialActive) {
    usb::send(status.data(), status.size());
  } else {
    udp::send(network::getStatusAddress(), protocol::serverPort, status.data(), status.size());
  }
}

void logStatus(uint32_t now) {
  log("%s %s  %u packets/s  %u fps  queued %u  refresh %u Hz  shown %u  dropped %u  "
      "brightness %u  rssi %d",
      receiver::isSerialActive() ? "serial" : "udp", isStreaming(now) ? "streaming" : "idle",
      static_cast<unsigned>(receiver::getPacketsReceived() - packetsAtLastStatus),
      static_cast<unsigned>(framesShown - framesShownAtLastStatus),
      static_cast<unsigned>(receiver::getQueuedFrames()),
      static_cast<unsigned>(display::getRefreshRate()), static_cast<unsigned>(framesShown),
      static_cast<unsigned>(receiver::getFramesDropped()), brightness,
      static_cast<int>(WiFi.RSSI()));
  framesShownAtLastStatus = framesShown;
  packetsAtLastStatus = receiver::getPacketsReceived();
}

void setBrightness(uint8_t value, uint32_t now) {
  if (value != brightness) {
    brightness = value;
    settings::setBrightness(value);
    display::setBrightness(value);
  }
  sendStatus(now);
}

void updateFrame(uint32_t now) {
  if (!display::isReady()) {
    return;
  }
  const auto sequence = receiver::takeFrame(frame);
  if (sequence) {
    display::showFrame(frame);
    shownSequence = *sequence;
    shownAtUs = micros();
    framesShown++;
    lastFrameAt = now;
  }
}

void updateBrightness(uint32_t now) {
  const auto value = receiver::takeBrightness();
  if (value) {
    setBrightness(*value, now);
  }
}

void updateSerialHost(uint32_t now) {
  const bool isSerialActive = receiver::isSerialActive();
  if (isSerialActive != wasSerialActive) {
    wasSerialActive = isSerialActive;
    log("serial host %s", isSerialActive ? "active" : "inactive");
    sendStatus(now);
  }
}

void showNetwork() {
  const String address = network::isConnected() ? network::getLocalAddress().toString() : "";
  if (address == shownAddress) {
    return;
  }
  shownAddress = address;
  log("network %s address %s", network::getName().c_str(), address.c_str());
  display::showLines({"LED MATRIX", network::getName(),
                      address.isEmpty() ? String("CONNECTING") : address,
                      "UDP " + String(protocol::devicePort)});
}

}  // namespace

void setup() {
  usb::begin();
  settings::begin();
  brightness = settings::getBrightness();
  if (!display::begin(brightness)) {
    log("display failed to start");
  }
  display::showTestPattern();
  network::begin();
  if (!receiver::begin()) {
    log("receiver failed to start");
  }
  delay(testPatternMs);
}

void loop() {
  const uint32_t now = millis();
  updateSerialHost(now);
  updateBrightness(now);
  updateFrame(now);
  const bool streaming = isStreaming(now);
  if (wasStreaming && !streaming) {
    display::clear();
  }
  wasStreaming = streaming;
  if (!lastFrameAt) {
    showNetwork();
  }
  if (now - lastStatusAt >= protocol::statusIntervalMs) {
    sendStatus(now);
    logStatus(now);
  }
  usb::update();
}
