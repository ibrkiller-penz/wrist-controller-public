// AXP2101 전원 관리 칩 — 배터리 잔량·충전 상태 읽기, 전원 키 강제 종료 시간 조정(4초 이하 → 10초), 소프트웨어 전원 끄기 — STEP9·실기 피드백 11
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

// 전원 키(PWRON) 시간 — REG 0x27 IRQ_OFF_ON_LEVEL_CTRL(XPowersLib get/setPowerKeyPress{On,Off}Time):
//   bit1:0 ON level  00 = 128ms, 01 = 512ms, 10 = 1s, 11 = 2s(꺼진 상태에서 이만큼 누르면 켜짐)
//   bit3:2 OFF level 00 = 4s, 01 = 6s, 10 = 8s, 11 = 10s(켜진 상태에서 이만큼 누르면 PMU 가 강제로 끔)
// 켜는 데 필요한 시간(ms). PMU 를 못 읽었으면 -1
int wc_pmu_power_on_ms(void);
// 하드웨어 강제 종료 시간(ms, 바꾼 뒤 값). 못 읽었으면 -1
int wc_pmu_power_off_ms(void);
// 소프트웨어 전원 차단 — REG 0x10 COMMON_CONFIG bit0(XPowersLib shutdown()). 성공하면 돌아오지 않을 수 있다
esp_err_t wc_pmu_shutdown(void);

#ifdef __cplusplus
}
#endif
