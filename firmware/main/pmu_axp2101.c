// AXP2101 — 배터리 잔량·충전 상태 읽기. 쓰기는 '측정 기능 켜기' 비트만(읽고-바꾸고-쓰기, 해당 비트만 1):
//   REG 0x68 bit0 배터리 감지 켜기, REG 0x18 bit3 연료계(gauge) 켜기, REG 0x30 bit0 배터리 전압 ADC 켜기
//   (XPowersLib enableBattDetection / enableGauge / enableBattVoltageMeasure 와 같은 비트).
// 전원 레일·충전 전압/전류 같은 전원 경로 설정은 쓰지 않는다(공장/샤오즈 설정 유지).
// 예외(실기 피드백 11): 전원 키 강제 종료 시간(REG 0x27 bit3:2)만 — 4초 이하면 10초로 늘린다(PWR 3초 확인 화면이 먼저 뜨게).
//   소프트웨어 전원 끄기는 REG 0x10 bit0(XPowersLib shutdown()).
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
#define REG_COMMON_CONFIG 0x10  // bit0 = 소프트웨어 전원 끄기(XPowersLib shutdown)
#define REG_PWROFF_EN 0x22      // bit1 = 전원 키 길게 누름 종료 켜짐, bit0 = 1 이면 종료 대신 재시작(로그만)
#define REG_KEY_LEVEL 0x27      // bit1:0 켜기 시간, bit3:2 강제 종료 시간(XPowersLib setPowerKeyPressOn/OffTime)

static int s_on_ms = -1;
static int s_off_ms = -1;
static const int kOnMs[4] = {128, 512, 1000, 2000};
static const int kOffMs[4] = {4000, 6000, 8000, 10000};

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
  // 전원 키 시간(실기 피드백 11): 원래 값을 로그로 남기고, 강제 종료가 4초 이하면 10초로(PWR 3초 확인 화면이 먼저)
  uint8_t kl = 0, pe = 0;
  if (rd(REG_KEY_LEVEL, &kl) == ESP_OK) {
    const int off0 = kOffMs[(kl >> 2) & 3];
    s_on_ms = kOnMs[kl & 3];
    s_off_ms = off0;
    if (off0 <= 4000) {
      const uint8_t nv = (uint8_t)((kl & ~0x0C) | (3u << 2));
      const esp_err_t we = wr(REG_KEY_LEVEL, nv);
      uint8_t back = 0;
      if (we == ESP_OK && rd(REG_KEY_LEVEL, &back) == ESP_OK) s_off_ms = kOffMs[(back >> 2) & 3];
      ESP_LOGW(TAG, "전원 키: 켜기 %dms, 강제 종료 %dms → %dms 로 늘림(0x27 0x%02X → 0x%02X, %s)", s_on_ms, off0, s_off_ms, kl,
               nv, esp_err_to_name(we));
    } else {
      ESP_LOGI(TAG, "전원 키: 켜기 %dms, 강제 종료 %dms(0x27=0x%02X, 그대로)", s_on_ms, off0, kl);
    }
  }
  if (rd(REG_PWROFF_EN, &pe) == ESP_OK) {
    ESP_LOGI(TAG, "0x22=0x%02X(길게 누름 종료 %s, %s)", pe, (pe & 0x02) ? "켜짐" : "꺼짐", (pe & 0x01) ? "재시작" : "전원 끔");
  }
  return ESP_OK;
}

int wc_pmu_power_on_ms(void) { return s_on_ms; }
int wc_pmu_power_off_ms(void) { return s_off_ms; }

esp_err_t wc_pmu_shutdown(void) {
  if (!s_dev) return ESP_ERR_INVALID_STATE;
  uint8_t v = 0;
  esp_err_t err = rd(REG_COMMON_CONFIG, &v);
  if (err != ESP_OK) return err;
  ESP_LOGW(TAG, "소프트웨어 전원 끄기(0x10 0x%02X → 0x%02X)", v, (uint8_t)(v | 0x01));
  return wr(REG_COMMON_CONFIG, (uint8_t)(v | 0x01));
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
