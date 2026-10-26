#pragma once

#include <Arduino.h>

#include <initializer_list>

namespace display {

bool begin(uint8_t brightness);
void setBrightness(uint8_t brightness);
void showFrame(const uint8_t* rgb);
void showTestPattern();
void showLines(std::initializer_list<String> lines);
void clear();
bool isReady();
uint32_t getRefreshRate();
uint32_t getFramePeriodUs();

}  // namespace display
