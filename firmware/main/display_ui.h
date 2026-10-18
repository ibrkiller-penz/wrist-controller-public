// 화면 하드웨어(Waveshare C6 BSP + LVGL 9) — 2단계 2번(STEP2) 패널·LVGL, 5번(STEP5) 터치, 9번(STEP9) 밝기·끄기
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "driver/i2c_master.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif


// BSP 로 화면·터치·LVGL 을 켠다. 실패해도 펌웨어(BLE·버튼)는 계속 돈다.
esp_err_t wc_ui_init(int brightness_percent);

// 화면 내용(세 모드 UI)은 ui.cpp(C++). 여기는 패널·LVGL·터치·밝기만.
esp_err_t wc_ui_set_brightness(int percent);
// 보드 공용 I2C 버스(SDA 8·SCL 7 — 터치·IMU·PMU 가 같이 쓴다). BSP 가 처음 부를 때 만든다.
i2c_master_bus_handle_t wc_board_i2c(void);

// 패널 표시 켜기/끄기(STEP9 화면 자동 꺼짐)
esp_err_t wc_ui_panel_on(bool on);

// 터치 한 번 읽기(I2C). 손가락이 닿아 있으면 true + 화면 좌표(0..409, 0..501). 터치 태스크 한 곳에서만 부른다.
bool wc_ui_touch_read(int* x, int* y);

// 터치 좌표 보정(실기 확인 필요 — 공식 BSP 는 셋 다 0). 0/1
#ifndef WC_TOUCH_SWAP_XY
#define WC_TOUCH_SWAP_XY 0
#endif
#ifndef WC_TOUCH_MIRROR_X
#define WC_TOUCH_MIRROR_X 0
#endif
#ifndef WC_TOUCH_MIRROR_Y
#define WC_TOUCH_MIRROR_Y 0
#endif

#ifdef __cplusplus
}
#endif
