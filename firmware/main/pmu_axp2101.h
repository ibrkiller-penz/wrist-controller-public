// AXP2101 전원 관리 칩 — 배터리 잔량·충전 상태 읽기만(설정은 쓰지 않는다) — 2단계 9번(STEP9)
// 근거: docs/research/hardware.md 2.7(I2C 0x34, 공용 버스), AXP2101 데이터시트 레지스터 표
//   0x00 상태1(bit3 = 배터리 있음), 0x01 상태2(bit6:5 = 01 충전 중), 0xA4 연료계 잔량 %(0~100)
// 레지스터 의미는 데이터시트·XPowersLib 기준이며 실기 확인 필요.
#pragma once

#include <stdbool.h>

#include "driver/i2c_master.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t wc_pmu_init(i2c_master_bus_handle_t bus);
// percent: 0~100, 배터리가 없거나 읽기 실패면 -1
esp_err_t wc_pmu_read(int* percent, bool* charging);

#ifdef __cplusplus
}
#endif
