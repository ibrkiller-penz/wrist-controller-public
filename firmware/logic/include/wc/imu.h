// IMU 전처리 — sim/src/core/imu.ts 대응. 자이로 영점(bias) 추적과 논리 축 꺼내기.
#pragma once

#include "wc/types.h"

namespace wc {

BiasState initBias();

// 시간 기반 EMA 계수. dt<=0 이거나 tau<=0 이면 1
double emaAlpha(double dtMs, double tauMs);

struct BiasResult {
  BiasState state;
  ImuSample out;
};

// 영점 추적: 세 축 모두 |g - bias| < stillThresholdDps 가 stillMs 이상 이어지면 bias 를 trackTauMs 로 따라간다.
BiasResult biasStep(const BiasState& st, const ImuSample& s, const GestureConfig::Imu::BiasCalib& cfg);

// 센서 축 배열 [gx,gy,gz] 에서 논리 축 값(axisSign 적용)
double logicalAxis(const std::array<double, 3>& v, LogicalAxis axis, const GestureConfig::Imu& imu);

// 논리 축이 쓰는 센서 축 인덱스(0..2)
int axisIndex(LogicalAxis axis, const GestureConfig::Imu& imu);

}  // namespace wc
