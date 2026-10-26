#include "settings.h"

#include <Preferences.h>

namespace settings {

namespace {

constexpr uint8_t defaultBrightness = 128;
Preferences preferences;

}  // namespace

void begin() { preferences.begin("led-matrix"); }

uint8_t getBrightness() { return preferences.getUChar("brightness", defaultBrightness); }

void setBrightness(uint8_t brightness) { preferences.putUChar("brightness", brightness); }

}  // namespace settings
