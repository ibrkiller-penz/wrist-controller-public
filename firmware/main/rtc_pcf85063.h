// PCF85063A 실시간 시계(RTC) — 시계 모드 시각의 출처. I2C 0x51(공용 버스), UTC 로 저장한다.
// 근거: docs/research/hardware.md(보드 RTC PCF85063A), NXP PCF85063A 데이터시트 레지스터 표
//   0x04 초(BCD, bit7 OS = 전원이 끊겨 시각을 믿을 수 없음) · 0x05 분 · 0x06 시(24h) · 0x07 일 · 0x08 요일 · 0x09 월 · 0x0A 년(00~99)
// 실기 확인 필요: 주소(0x51), 배터리 백업 동작.
#pragma once

#include <stdbool.h>
#include <time.h>

#include "driver/i2c_master.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t wc_rtc_init(i2c_master_bus_handle_t bus);
// RTC → UTC 유닉스 초. 시각을 믿을 수 없으면(OS 비트·2024년 이전) ESP_ERR_INVALID_STATE
esp_err_t wc_rtc_read(time_t* utc);
esp_err_t wc_rtc_write(time_t utc);

#ifdef __cplusplus
}
#endif
