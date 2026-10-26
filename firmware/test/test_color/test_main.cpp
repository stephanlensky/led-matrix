#include <color.h>
#include <unity.h>

using namespace color;

void test_maps_black_and_white_to_extremes() {
  const ColorTable table = createColorTable(255);
  TEST_ASSERT_EQUAL_HEX16(0x0000, getRgb565(table, 0, 0, 0));
  TEST_ASSERT_EQUAL_HEX16(0xffff, getRgb565(table, 255, 255, 255));
  TEST_ASSERT_EQUAL_HEX16(0xf800, getRgb565(table, 255, 0, 0));
  TEST_ASSERT_EQUAL_HEX16(0x07e0, getRgb565(table, 0, 255, 0));
  TEST_ASSERT_EQUAL_HEX16(0x001f, getRgb565(table, 0, 0, 255));
}

void test_applies_gamma() {
  const ColorTable table = createColorTable(255);
  TEST_ASSERT_EQUAL(14, table.green[128] >> 5);
}

void test_scales_by_brightness() {
  const ColorTable table = createColorTable(128);
  TEST_ASSERT_EQUAL(32, table.green[255] >> 5);
  TEST_ASSERT_EQUAL_HEX16(0x0000, getRgb565(createColorTable(0), 255, 255, 255));
}

void test_converts_frames() {
  const ColorTable table = createColorTable(255);
  const uint8_t rgb[] = {255, 0, 0, 0, 0, 255};
  uint16_t rgb565[2];
  convertFrame(table, rgb, rgb565, 2);
  TEST_ASSERT_EQUAL_HEX16(0xf800, rgb565[0]);
  TEST_ASSERT_EQUAL_HEX16(0x001f, rgb565[1]);
}

void setUp() {}

void tearDown() {}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_maps_black_and_white_to_extremes);
  RUN_TEST(test_applies_gamma);
  RUN_TEST(test_scales_by_brightness);
  RUN_TEST(test_converts_frames);
  return UNITY_END();
}
