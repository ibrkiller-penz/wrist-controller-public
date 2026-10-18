// AXP2101 — 배터리 잔량·충전 상태 읽기. 쓰기는 '측정 기능 켜기' 비트만(읽고-바꾸고-쓰기, 해당 비트만 1):
//   REG 0x68 bit0 배터리 감지 켜기, REG 0x18 bit3 연료계(gauge) 켜기, REG 0x30 bit0 배터리 전압 ADC 켜기
//   (XPowersLib enableBattDetection / enableGauge / enableBattVoltageMeasure 와 같은 비트).
// 전원 레일·충전 전압/전류·전원 키 같은 전원 경로 설정은 쓰지 않는다(공장/샤오즈 설정 유지).
// 샤오즈(원래 펌웨어)는 0xA4 를 배터리 확인 없이 그대로 읽는다 → 0x00 bit3(배터리 있음)이 0 이어도 0xA4 가 0~100 이면 쓴다.
#include "pmu_axp2101.h"

#include "esp_log.h"

static const char* TAG = "wc_pmu";
static i2c_master_dev_handle_t s_dev = NULL;
static int s_logLeft = 3;  // 원값 로그를 처음 몇 번만(그 뒤에는 값이 바뀔 때만)
static uint8_t s_last[3] = {0xFF, 0xFF, 0xFF};

#define AXP2101_ADDR 0x34
#define REG_STATUS1 0x00
#define REG_STATUS2 0x01
#define REG_GAUGE_CTRL 0x18  // bit3 = 연료계 켜기
#define REG_ADC_EN 0x30      // bit0 = 배터리 전압 측정
#define REG_BATDET 0x68      // bit0 = 배터리 감지 켜기
#define REG_BAT_PERCENT 0xA4

static esp_err_t rd(uint8_t reg, uint8_t* v) { return i2c_master_transmit_receive(s_dev, &reg, 1, v, 1, 50); }
static esp_err_t wr(uint8_t reg, uint8_t v) {
  const uint8_t b[2] = {reg, v};
  return i2c_master_transmit(s_dev, b, sizeof(b), 50);
}

// 측정 기능 비트만 켠다(이미 켜져 있으면 쓰지 않는다)
static void set_bit(uint8_t reg, uint8_t mask, const char* what) {
  uint8_t v = 0;
  if (rd(reg, &v) != ESP_OK) return;
  if (v & mask) {
    ESP_LOGI(TAG, "%s 이미 켜짐(0x%02X=0x%02X)", what, reg, v);
    return;
  }
  const esp_err_t err = wr(reg, (uint8_t)(v | mask));
  ESP_LOGI(TAG, "%s 켬: 0x%02X 0x%02X → 0x%02X (%s)", what, reg, v, (uint8_t)(v | mask), esp_err_to_name(err));
}

esp_err_t wc_pmu_init(i2c_master_bus_handle_t bus) {
  if (!bus) return ESP_ERR_INVALID_ARG;
  if (i2c_master_probe(bus, AXP2101_ADDR, 50) != ESP_OK) {
    ESP_LOGW(TAG, "AXP2101(0x34) 응답 없음 — 배터리 표시 '--%%'");
    return ESP_ERR_NOT_FOUND;
  }
  i2c_device_config_t cfg = {
      .dev_addr_length = I2C_ADDR_BIT_LEN_7,
      .device_address = AXP2101_ADDR,
      .scl_speed_hz = 400000,
  };
  esp_err_t err = i2c_master_bus_add_device(bus, &cfg, &s_dev);
  if (err != ESP_OK) return err;
  ESP_LOGI(TAG, "AXP2101 찾음");
  set_bit(REG_BATDET, 0x01, "배터리 감지");
  set_bit(REG_GAUGE_CTRL, 0x08, "연료계");
  set_bit(REG_ADC_EN, 0x01, "배터리 전압 ADC");
  return ESP_OK;
}

esp_err_t wc_pmu_read(int* percent, bool* charging) {
  *percent = -1;
  *charging = false;
  if (!s_dev) return ESP_ERR_INVALID_STATE;
  uint8_t s1 = 0, s2 = 0, pct = 0;
  esp_err_t err = rd(REG_STATUS1, &s1);
  if (err == ESP_OK) err = rd(REG_STATUS2, &s2);
  if (err == ESP_OK) err = rd(REG_BAT_PERCENT, &pct);
  if (err != ESP_OK) {
    ESP_LOGW(TAG, "읽기 실패 %s", esp_err_to_name(err));
    return err;
  }
  if (s_logLeft > 0 || s1 != s_last[0] || (s2 & 0x67) != (s_last[1] & 0x67) || pct != s_last[2]) {
    if (s_logLeft > 0) --s_logLeft;
    ESP_LOGI(TAG, "원값 0x00=0x%02X(배터리 있음 %d) 0x01=0x%02X(충전 방향 %d) 0xA4=%u", s1, (s1 >> 3) & 1, s2,
             (s2 >> 5) & 3, pct);
  }
  s_last[0] = s1;
  s_last[1] = s2;
  s_last[2] = pct;
  *charging = ((s2 >> 5) & 0x03) == 0x01;
  // 배터리 있음 비트와 관계없이 0xA4 를 쓴다(샤오즈와 같음). 101 이상은 무효.
  // 단 '배터리 없음 + 0%' 는 배터리 없는 보드(SKU 32769)일 수 있어 모름(-1)으로 둔다
  const bool present = (s1 & 0x08) != 0;
  if (pct <= 100 && (present || pct > 0)) *percent = pct;
  return ESP_OK;
}
