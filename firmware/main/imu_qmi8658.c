// QMI8658 최소 드라이버 구현 — 레지스터 값은 QMI8658A 데이터시트(Rev 0.x) 표 기준. 실기 확인 필요.
//   WHO_AM_I 0x00 = 0x05, CTRL1 0x02(주소 자동 증가 bit6), CTRL2 0x03(가속도 범위·ODR), CTRL3 0x04(자이로 범위·ODR),
//   CTRL7 0x08(aEN bit0, gEN bit1), 데이터 0x35~0x40(AX_L..GZ_H, 리틀 엔디언), 소프트 리셋 0x60 ← 0xB0
#include "imu_qmi8658.h"

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char* TAG = "wc_imu";

#define REG_WHO_AM_I 0x00
#define REG_CTRL1 0x02
#define REG_CTRL2 0x03
#define REG_CTRL3 0x04
#define REG_CTRL5 0x06
#define REG_CTRL7 0x08
#define REG_AX_L 0x35
#define REG_RESET 0x60
#define WHO_AM_I_VALUE 0x05

#define ODR_125HZ 0x06       // aODR/gODR 0110 ≈ 125Hz(6축 모드에서 자이로 ODR 이 기준)
#define ACC_FS_4G (0x01 << 4)
#define ACC_LSB_PER_G 8192.0f

static i2c_master_dev_handle_t s_dev = NULL;
static float s_gyro_lsb_per_dps = 32.0f;

static esp_err_t wr(uint8_t reg, uint8_t val) {
  const uint8_t b[2] = {reg, val};
  return i2c_master_transmit(s_dev, b, sizeof(b), 50);
}

static esp_err_t rd(uint8_t reg, uint8_t* out, size_t n) { return i2c_master_transmit_receive(s_dev, &reg, 1, out, n, 50); }

static esp_err_t attach(i2c_master_bus_handle_t bus, uint8_t addr) {
  if (i2c_master_probe(bus, addr, 50) != ESP_OK) return ESP_ERR_NOT_FOUND;
  i2c_device_config_t cfg = {
      .dev_addr_length = I2C_ADDR_BIT_LEN_7,
      .device_address = addr,
      .scl_speed_hz = 400000,
  };
  esp_err_t err = i2c_master_bus_add_device(bus, &cfg, &s_dev);
  if (err != ESP_OK) return err;
  uint8_t who = 0;
  err = rd(REG_WHO_AM_I, &who, 1);
  if (err != ESP_OK || who != WHO_AM_I_VALUE) {
    ESP_LOGW(TAG, "0x%02X 응답했으나 WHO_AM_I=0x%02X(기대 0x05)", addr, who);
    i2c_master_bus_rm_device(s_dev);
    s_dev = NULL;
    return ESP_ERR_NOT_FOUND;
  }
  return ESP_OK;
}

esp_err_t wc_imu_init(i2c_master_bus_handle_t bus, int gyro_range_dps, uint8_t* addr_out) {
  if (!bus) return ESP_ERR_INVALID_ARG;
  static const uint8_t addrs[2] = {0x6B, 0x6A};  // 회로도상 SA0=GND 면 0x6A — 둘 다 시도
  uint8_t found = 0;
  for (int i = 0; i < 2 && !found; ++i) {
    if (attach(bus, addrs[i]) == ESP_OK) found = addrs[i];
  }
  if (!found) {
    ESP_LOGE(TAG, "QMI8658 을 찾지 못함(0x6B/0x6A)");
    return ESP_ERR_NOT_FOUND;
  }
  if (addr_out) *addr_out = found;

  wr(REG_RESET, 0xB0);
  vTaskDelay(pdMS_TO_TICKS(20));

  // 자이로 범위: 16·32·…·2048 dps → 코드 0..7, 감도 LSB/dps = 2048/(범위/16)… = 32768/범위
  int code = 0;
  int range = 16;
  while (range < gyro_range_dps && code < 7) {
    range <<= 1;
    ++code;
  }
  s_gyro_lsb_per_dps = 32768.0f / (float)range;

  esp_err_t err = wr(REG_CTRL1, 0x40);  // 주소 자동 증가, 리틀 엔디언
  if (err == ESP_OK) err = wr(REG_CTRL2, ACC_FS_4G | ODR_125HZ);
  if (err == ESP_OK) err = wr(REG_CTRL3, (uint8_t)((code << 4) | ODR_125HZ));
  if (err == ESP_OK) err = wr(REG_CTRL5, 0x00);  // 내부 저역 필터 끔(코어가 거른다)
  if (err == ESP_OK) err = wr(REG_CTRL7, 0x03);  // 가속도 + 자이로 켬
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "설정 쓰기 실패 %s", esp_err_to_name(err));
    return err;
  }
  ESP_LOGI(TAG, "QMI8658 주소 0x%02X, 자이로 ±%d dps(%.1f LSB/dps), 가속도 ±4g, ~125Hz", found, range,
           (double)s_gyro_lsb_per_dps);
  return ESP_OK;
}

esp_err_t wc_imu_read(float gyro_dps[3], float accel_g[3]) {
  if (!s_dev) return ESP_ERR_INVALID_STATE;
  uint8_t b[12];
  esp_err_t err = rd(REG_AX_L, b, sizeof(b));
  if (err != ESP_OK) return err;
  for (int i = 0; i < 3; ++i) {
    const int16_t a = (int16_t)(b[2 * i] | (b[2 * i + 1] << 8));
    const int16_t g = (int16_t)(b[6 + 2 * i] | (b[6 + 2 * i + 1] << 8));
    accel_g[i] = (float)a / ACC_LSB_PER_G;
    gyro_dps[i] = (float)g / s_gyro_lsb_per_dps;
  }
  return ESP_OK;
}
