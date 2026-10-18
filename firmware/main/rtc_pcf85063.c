// PCF85063A 구현 — 읽기/쓰기만(알람·타이머 쓰지 않음). 시각은 UTC 로 둔다(시간대는 NVS, main.cpp).
#include "rtc_pcf85063.h"

#include <string.h>

#include "esp_log.h"

static const char* TAG = "wc_rtc";
static i2c_master_dev_handle_t s_dev = NULL;

#define RTC_ADDR 0x51
#define REG_SECONDS 0x04

static uint8_t bcd2bin(uint8_t v) { return (uint8_t)((v >> 4) * 10 + (v & 0x0F)); }
static uint8_t bin2bcd(uint8_t v) { return (uint8_t)(((v / 10) << 4) | (v % 10)); }

// 1970-01-01 기준 일 수 → 유닉스 초(UTC). timegm 이 없는 환경을 위해 직접 계산
static time_t utc_from_tm(const struct tm* t) {
  int y = t->tm_year + 1900;
  int m = t->tm_mon + 1;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const long days = 365L * y + y / 4 - y / 100 + y / 400 + (153 * (m - 3) + 2) / 5 + t->tm_mday - 719469L;
  return (time_t)(days * 86400L + t->tm_hour * 3600L + t->tm_min * 60L + t->tm_sec);
}

esp_err_t wc_rtc_init(i2c_master_bus_handle_t bus) {
  if (!bus) return ESP_ERR_INVALID_ARG;
  if (i2c_master_probe(bus, RTC_ADDR, 50) != ESP_OK) {
    ESP_LOGW(TAG, "PCF85063A(0x51) 응답 없음 — 시계 모드는 '--:--'(직렬 t 로 맞추면 전원이 켜져 있는 동안만 유지)");
    return ESP_ERR_NOT_FOUND;
  }
  i2c_device_config_t cfg = {
      .dev_addr_length = I2C_ADDR_BIT_LEN_7,
      .device_address = RTC_ADDR,
      .scl_speed_hz = 400000,
  };
  esp_err_t err = i2c_master_bus_add_device(bus, &cfg, &s_dev);
  if (err == ESP_OK) ESP_LOGI(TAG, "PCF85063A 찾음");
  return err;
}

esp_err_t wc_rtc_read(time_t* utc) {
  if (!s_dev) return ESP_ERR_INVALID_STATE;
  uint8_t reg = REG_SECONDS;
  uint8_t b[7];
  esp_err_t err = i2c_master_transmit_receive(s_dev, &reg, 1, b, sizeof(b), 50);
  if (err != ESP_OK) return err;
  if (b[0] & 0x80) return ESP_ERR_INVALID_STATE;  // OS: 발진 멈춤(전원 끊김) — 시각 무효
  struct tm t;
  memset(&t, 0, sizeof(t));
  t.tm_sec = bcd2bin(b[0] & 0x7F);
  t.tm_min = bcd2bin(b[1] & 0x7F);
  t.tm_hour = bcd2bin(b[2] & 0x3F);
  t.tm_mday = bcd2bin(b[3] & 0x3F);
  t.tm_mon = bcd2bin(b[5] & 0x1F) - 1;
  t.tm_year = 100 + bcd2bin(b[6]);
  if (t.tm_year + 1900 < 2024) return ESP_ERR_INVALID_STATE;
  *utc = utc_from_tm(&t);
  return ESP_OK;
}

esp_err_t wc_rtc_write(time_t utc) {
  if (!s_dev) return ESP_ERR_INVALID_STATE;
  struct tm t;
  gmtime_r(&utc, &t);
  const uint8_t b[8] = {
      REG_SECONDS,
      bin2bcd((uint8_t)t.tm_sec),  // OS 비트 0 으로 지움
      bin2bcd((uint8_t)t.tm_min),
      bin2bcd((uint8_t)t.tm_hour),
      bin2bcd((uint8_t)t.tm_mday),
      (uint8_t)t.tm_wday,
      bin2bcd((uint8_t)(t.tm_mon + 1)),
      bin2bcd((uint8_t)(t.tm_year % 100)),
  };
  return i2c_master_transmit(s_dev, b, sizeof(b), 50);
}
