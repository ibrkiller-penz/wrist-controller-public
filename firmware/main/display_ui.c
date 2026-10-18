// 화면 구현 — Waveshare BSP waveshare/esp32_c6_touch_amoled_2_06 2.0.0 + esp_lvgl_port 2.x + LVGL 9.5
//
// 초기화 순서는 BSP 의 bsp_display_start_with_config() 와 같다(공식 예제 02_lvgl_demo_v9 는 bsp_display_start() 한 줄).
//   lvgl_port_init → bsp_display_new(QSPI·CO5300 초기화 명령·열 오프셋 0x16) → lvgl_port_add_disp
//   → 짝수 좌표 rounder(LV_EVENT_INVALIDATE_AREA) → 터치(FT3168, ft5x06) → 밝기
// bsp_display_start() 를 그대로 쓰지 않는 이유(hardware.md 4장, BSP 2.0.0 소스 확인):
//   - BSP 는 sw_rotate=true 로 등록해 esp_lvgl_port 가 회전용 버퍼를 하나 더(그리기 버퍼와 같은 크기) 잡는다.
//     회전을 쓰지 않으므로 끈다(PSRAM 없음, 내부 RAM 절약).
//   - BSP 는 buff_dma=false·단일 버퍼. 여기서는 DMA 가능 내부 RAM 에 이중 버퍼(그리는 동안 전송).
//   - SPI 최대 전송 크기를 전체 화면(411,640B) 대신 그리기 버퍼 크기로 줄인다(DMA 설명자 절약).
//   줄 수는 BSP Kconfig CONFIG_BSP_DISPLAY_LVGL_BUF_HEIGHT(sdkconfig.defaults 40, 기본 100)를 그대로 쓴다.
// 실기 확인 필요: 화면 방향·열 오프셋(22px)·색 순서(바이트 교환), 밝기, 터치 좌표.
#include "display_ui.h"

#include <string.h>

#include "bsp/display.h"
#include "bsp/esp-bsp.h"
#include "bsp/touch.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_touch_ft5x06.h"
#include "esp_heap_caps.h"
#include "esp_lcd_panel_ops.h"
#include "esp_timer.h"
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_lvgl_port.h"
#include "lvgl.h"

static const char* TAG = "wc_ui";

static bool s_ok = false;
static esp_lcd_touch_handle_t s_tp = NULL;
static esp_lcd_panel_handle_t s_panel = NULL;

// 터치 INT(ISR 에서 세움) — 한 번이라도 오면 INT 배선이 살아 있다는 뜻이라 확인 읽기를 멈춘다
static volatile bool s_touch_int = false;
static volatile bool s_touch_int_seen = false;
static void IRAM_ATTR touch_isr(esp_lcd_touch_handle_t tp) {
  (void)tp;
  s_touch_int = true;
  s_touch_int_seen = true;
}

// 터치 칩 하나 만들기: RST 펄스(낮음 20ms) → 300ms 대기 → I2C 패널 IO → ft5x06(드라이버 리셋 없음) → INT 등록
static esp_err_t touch_try_init(void) {
  const gpio_config_t rst = {
      .pin_bit_mask = 1ULL << BSP_LCD_TOUCH_RST,
      .mode = GPIO_MODE_OUTPUT,
  };
  gpio_config(&rst);
  gpio_set_level((gpio_num_t)BSP_LCD_TOUCH_RST, 0);
  vTaskDelay(pdMS_TO_TICKS(20));
  gpio_set_level((gpio_num_t)BSP_LCD_TOUCH_RST, 1);
  vTaskDelay(pdMS_TO_TICKS(300));
  // 드라이버 내부 오류 로그는 끄고(재시도 중 반복되므로) 이 파일이 요약한다
  esp_log_level_set("lcd_panel.io.i2c", ESP_LOG_NONE);
  esp_log_level_set("FT5x06", ESP_LOG_NONE);
  esp_lcd_panel_io_handle_t io = NULL;
  esp_lcd_panel_io_i2c_config_t io_cfg = ESP_LCD_TOUCH_IO_I2C_FT5x06_CONFIG();
  io_cfg.scl_speed_hz = 400000;
  esp_err_t err = esp_lcd_new_panel_io_i2c(bsp_i2c_get_handle(), &io_cfg, &io);
  if (err != ESP_OK) return err;
  const esp_lcd_touch_config_t cfg = {
      .x_max = BSP_LCD_H_RES,
      .y_max = BSP_LCD_V_RES,
      .rst_gpio_num = GPIO_NUM_NC,  // 리셋은 위에서 직접(충분히 기다린 뒤)
      .int_gpio_num = BSP_LCD_TOUCH_INT,
      .levels = {.reset = 0, .interrupt = 0},
      .flags = {.swap_xy = 0, .mirror_x = 0, .mirror_y = 0},
  };
  esp_lcd_touch_handle_t tp = NULL;
  err = esp_lcd_touch_new_i2c_ft5x06(io, &cfg, &tp);
  if (err != ESP_OK || !tp) {
    esp_lcd_panel_io_del(io);
    return err != ESP_OK ? err : ESP_FAIL;
  }
  // FT3168 은 무터치 2초 뒤 monitor(절전) 상태로 들어가고(ft5x06 드라이버가 TIME_ENTER_MONITOR=2 를 쓴다),
  // 그 상태에서 I2C 읽기에 NACK 할 때가 있다. Waveshare 공식 Arduino 예제처럼 INT(GPIO15, 하강 에지)가 왔을 때·
  // 손가락이 닿아 있는 동안만 읽는다(wc_ui_touch_read).
  gpio_set_pull_mode((gpio_num_t)BSP_LCD_TOUCH_INT, GPIO_PULLUP_ONLY);
  if (esp_lcd_touch_register_interrupt_callback(tp, touch_isr) != ESP_OK) {
    ESP_LOGW(TAG, "터치 INT 등록 실패 — 1초 간격 확인 읽기로만 감지");
  }
  s_tp = tp;
  ESP_LOGI(TAG, "터치 FT3168 초기화 완료(INT 구동 읽기)");
  return ESP_OK;
}
// CO5300: 갱신 영역의 시작 좌표는 짝수, 끝 좌표는 홀수여야 한다(BSP·샤오즈·Arduino 예제 공통 코드)
static void rounder_event_cb(lv_event_t* e) {
  lv_area_t* area = (lv_area_t*)lv_event_get_param(e);
  area->x1 = (area->x1 >> 1) << 1;
  area->y1 = (area->y1 >> 1) << 1;
  area->x2 = ((area->x2 >> 1) << 1) + 1;
  area->y2 = ((area->y2 >> 1) << 1) + 1;
}

esp_err_t wc_ui_init(int brightness_percent) {
  // 1. LVGL 포트(타이머 + LVGL 태스크). 우선순위 4 = 입력 태스크(5)·NimBLE 보다 낮게(firmware-stack.md 4장)
  const lvgl_port_cfg_t port_cfg = ESP_LVGL_PORT_INIT_CONFIG();
  esp_err_t err = lvgl_port_init(&port_cfg);
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "lvgl_port_init 실패 %s", esp_err_to_name(err));
    return err;
  }

  // 2. 패널(QSPI SPI2, CO5300 초기화 명령, set_gap(0x16, 0), 화면 켜기) — BSP 함수 그대로
  const int lines = LVGL_BUFFER_HEIGHT;  // CONFIG_BSP_DISPLAY_LVGL_BUF_HEIGHT
  const uint32_t buf_px = (uint32_t)BSP_LCD_H_RES * (uint32_t)lines;
  const bsp_display_config_t disp_config = {
      .max_transfer_sz = (int)(BSP_LCD_H_RES * (lines + 2) * BSP_LCD_BITS_PER_PIXEL / 8),
  };
  esp_lcd_panel_handle_t panel = NULL;
  esp_lcd_panel_io_handle_t io = NULL;
  err = bsp_display_new(&disp_config, &panel, &io);
  s_panel = panel;
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "bsp_display_new 실패 %s", esp_err_to_name(err));
    return err;
  }

  // 3. LVGL 화면 등록 — RGB565 + 바이트 교환(BSP 와 같음), 부분 렌더, 이중 DMA 버퍼(내부 RAM)
  lvgl_port_display_cfg_t disp_cfg;
  memset(&disp_cfg, 0, sizeof(disp_cfg));
  disp_cfg.io_handle = io;
  disp_cfg.panel_handle = panel;
  disp_cfg.buffer_size = buf_px;
  disp_cfg.double_buffer = true;
  disp_cfg.hres = BSP_LCD_H_RES;
  disp_cfg.vres = BSP_LCD_V_RES;
  disp_cfg.monochrome = false;
  disp_cfg.color_format = LV_COLOR_FORMAT_RGB565;
  disp_cfg.flags.buff_dma = 1;
  disp_cfg.flags.buff_spiram = 0;  // C6 는 PSRAM 이 없다
  disp_cfg.flags.sw_rotate = 0;
  disp_cfg.flags.swap_bytes = 1;
  lv_display_t* disp = lvgl_port_add_disp(&disp_cfg);
  if (!disp) {
    ESP_LOGE(TAG, "lvgl_port_add_disp 실패(버퍼 %u줄 × 2 = %u바이트)", (unsigned)lines, (unsigned)(buf_px * 2 * 2));
    return ESP_ERR_NO_MEM;
  }
  lv_display_add_event_cb(disp, rounder_event_cb, LV_EVENT_INVALIDATE_AREA, NULL);
  ESP_LOGI(TAG, "LVGL 그리기 버퍼 %d줄 × 2 = %u바이트(DMA 내부 RAM)", lines, (unsigned)(buf_px * 2 * 2));

  // 4. 터치(FT3168, esp_lcd_touch_ft5x06, x_max 410·y_max 502, 회전·미러 없음)
  //    LVGL indev 로 등록하지 않고 wc_ui_touch_read() 로 원시 좌표를 읽는다: 제스처 판정(탭/길게/스와이프)을
  //    시뮬레이터와 같은 코드(wc::TouchGesture)로 하려면 손가락 샘플이 그대로 필요하고, I2C 를 한 곳에서만 읽게 하려는 것.
  //    BSP bsp_touch_new() 는 드라이버가 RST 를 10ms 만 기다린 뒤 바로 설정을 써서 첫 부팅에 간헐 실패했다
  //    (실기 로그 'FT5x06 init failed (0x103)'). 그래서 직접 RST 펄스 + 300ms 대기 후 만들고(드라이버 리셋 끔),
  //    최대 3번 다시 시도, 그래도 안 되면 터치 태스크가 5초마다 다시 시도한다.
  for (int attempt = 1; attempt <= 3 && !s_tp; ++attempt) {
    if (touch_try_init() == ESP_OK) break;
    ESP_LOGW(TAG, "터치 초기화 실패(%d/3)", attempt);
  }
  if (!s_tp) ESP_LOGW(TAG, "터치 초기화 실패 — 화면만 사용, 5초마다 다시 시도");

  // 5. 순검정 배경(AMOLED 는 검정 화소가 꺼져 전력이 적다). 화면 내용은 ui.cpp
  if (lvgl_port_lock(0)) {
    lv_obj_t* scr = lv_screen_active();
    lv_obj_set_style_bg_color(scr, lv_color_hex(0x000000), 0);
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);
    lvgl_port_unlock();
  }

  // 6. 밝기(CO5300 명령 0x51, 0~100%)
  err = bsp_display_brightness_set(brightness_percent);
  if (err != ESP_OK) ESP_LOGW(TAG, "밝기 설정 실패 %s", esp_err_to_name(err));

  s_ok = true;
  return ESP_OK;
}

// 터치 읽기 상태
static bool s_touch_active = false;  // 마지막 읽기에서 손가락이 있었나(있는 동안은 칩이 active 라 계속 읽는다)
static int64_t s_next_probe_us = 0;  // INT 를 아직 못 봤을 때 1초 간격 확인 읽기
static int s_fail_run = 0;           // 연속 실패(INT·접촉 중 읽기만 센다)
static int s_fail_total = 0, s_fail_probe = 0, s_resets = 0;
static int64_t s_next_report_us = 0, s_last_reset_us = 0;

#define TOUCH_FAIL_RESET_RUN 5        // 연속 실패 이만큼이면 RST(GPIO10) 로 칩 재시작
#define TOUCH_RESET_MIN_GAP_US 10000000LL
#define TOUCH_REPORT_US 10000000LL    // 실패 요약 로그 간격
#define TOUCH_RETRY_US 5000000LL      // 초기화 실패 뒤 다시 시도 간격
static int64_t s_next_init_us = 0;

static void touch_reset(void) {
  // FT3168 RST(GPIO10, 낮음 = 리셋). BSP 가 출력으로 설정해 둔 핀이다. 리셋 뒤 칩 준비에 약 200ms
  gpio_set_level((gpio_num_t)BSP_LCD_TOUCH_RST, 0);
  vTaskDelay(pdMS_TO_TICKS(10));
  gpio_set_level((gpio_num_t)BSP_LCD_TOUCH_RST, 1);
  vTaskDelay(pdMS_TO_TICKS(300));
  s_resets++;
}

bool wc_ui_touch_read(int* x, int* y) {
  if (!s_tp) {
    // 부팅 때 초기화가 실패했으면 백그라운드(터치 태스크)에서 5초마다 다시 시도
    const int64_t t = esp_timer_get_time();
    if (s_ok && t >= s_next_init_us) {
      s_next_init_us = t + TOUCH_RETRY_US;
      if (touch_try_init() == ESP_OK) ESP_LOGI(TAG, "터치 다시 시도 성공");
    }
    return false;
  }
  const int64_t now = esp_timer_get_time();
  if (now >= s_next_report_us) {
    if (s_fail_total || s_fail_probe || s_resets) {
      ESP_LOGW(TAG, "터치 I2C 실패 %d회(확인 읽기 %d회), 칩 리셋 %d회 — 최근 10초, 실패는 '터치 없음'으로 처리", s_fail_total,
               s_fail_probe, s_resets);
    }
    s_fail_total = s_fail_probe = s_resets = 0;
    s_next_report_us = now + TOUCH_REPORT_US;
  }
  const bool int_low = gpio_get_level((gpio_num_t)BSP_LCD_TOUCH_INT) == 0;
  const bool wanted = s_touch_active || s_touch_int || int_low;
  const bool probe = !wanted && !s_touch_int_seen && now >= s_next_probe_us;
  if (!wanted && !probe) return false;  // 손가락도 INT 도 없으면 I2C 를 건드리지 않는다(monitor 상태 NACK 방지)
  s_touch_int = false;
  if (probe) s_next_probe_us = now + 1000000LL;

  if (esp_lcd_touch_read_data(s_tp) != ESP_OK) {
    s_touch_active = false;  // 실패 = 터치 없음(제스처는 손을 뗀 것으로 처리)
    if (probe) {
      s_fail_probe++;
      return false;
    }
    s_fail_total++;
    if (++s_fail_run >= TOUCH_FAIL_RESET_RUN && now - s_last_reset_us >= TOUCH_RESET_MIN_GAP_US) {
      s_fail_run = 0;
      s_last_reset_us = now;
      touch_reset();
    }
    return false;
  }
  s_fail_run = 0;
  esp_lcd_touch_point_data_t pt[1];
  uint8_t cnt = 0;
  if (esp_lcd_touch_get_data(s_tp, pt, &cnt, 1) != ESP_OK || cnt == 0) {
    s_touch_active = false;
    return false;
  }
  s_touch_active = true;
  int tx = pt[0].x;
  int ty = pt[0].y;
  // 화면 좌표(410×502, 코어 layout 과 같은 기준)로. 방향이 다르면 board_pins.h 의 TOUCH_* 값을 바꾼다(실기 확인 필요)
#if WC_TOUCH_SWAP_XY
  int tmp = tx; tx = ty; ty = tmp;
#endif
#if WC_TOUCH_MIRROR_X
  tx = BSP_LCD_H_RES - 1 - tx;
#endif
#if WC_TOUCH_MIRROR_Y
  ty = BSP_LCD_V_RES - 1 - ty;
#endif
  if (tx < 0) tx = 0;
  if (tx >= BSP_LCD_H_RES) tx = BSP_LCD_H_RES - 1;
  if (ty < 0) ty = 0;
  if (ty >= BSP_LCD_V_RES) ty = BSP_LCD_V_RES - 1;
  *x = tx;
  *y = ty;
  return true;
}

esp_err_t wc_ui_set_brightness(int percent) {
  if (!s_ok) return ESP_ERR_INVALID_STATE;
  return bsp_display_brightness_set(percent);
}

esp_err_t wc_ui_panel_on(bool on) {
  if (!s_ok || !s_panel) return ESP_ERR_INVALID_STATE;
  // 끌 때: 밝기 0 → 패널 표시 끔(AMOLED 화소 전부 꺼짐). 켤 때: 표시 켬 → 밝기는 호출한 쪽이 다시 정한다
  if (!on) bsp_display_brightness_set(0);
  return esp_lcd_panel_disp_on_off(s_panel, on);
}

i2c_master_bus_handle_t wc_board_i2c(void) { return bsp_i2c_get_handle(); }
