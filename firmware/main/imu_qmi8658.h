// QMI8658(6축 IMU) 최소 드라이버 — 2단계 6번(STEP6)
// 근거: docs/research/hardware.md 2.4(I2C 공용 버스 SDA=8·SCL=7), QMI8658A 데이터시트 레지스터 표.
// 주소는 SA0 배선에 따라 0x6B 또는 0x6A — 런타임에 둘 다 찔러 보고 WHO_AM_I(0x05)로 확인한다(board_pins.h TODO).
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "driver/i2c_master.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

// gyro_range_dps: 16..2048 중 가장 가까운 값 이상, accel 은 ±4g 고정, 출력 주기 약 125Hz(데이터시트 ODR 표).
// 성공하면 *addr_out 에 찾은 주소.
esp_err_t wc_imu_init(i2c_master_bus_handle_t bus, int gyro_range_dps, uint8_t* addr_out);

// 한 샘플 읽기: 각속도 deg/s(센서 축 gx,gy,gz), 가속도 g(ax,ay,az)
esp_err_t wc_imu_read(float gyro_dps[3], float accel_g[3]);

#ifdef __cplusplus
}
#endif
