// 손목 튕김(flick) 검출기 — sim/src/core/gesture.ts 대응. 판정 규칙은 /shared/test-vectors/README.md 5.3.
#pragma once

#include "wc/types.h"

namespace wc {

FlickState initFlick(double cooldownUntil = kNegInf);

struct FlickResult {
  FlickState state;
  std::optional<FlickDir> fired;        // 인식된 방향(out = 다음, in = 이전)
  std::optional<FlickReject> rejected;  // 거부 이유
  bool cooldownHit = false;             // 재인식 금지 중 임계값을 넘는 움직임(로그용)
  double peakG = -1;                    // accel 방식: 인식·기각된 움직임의 hp 피크(g). < 0 = 없음
};

FlickResult flickStep(const FlickState& prev, const ImuSample& s, const GestureConfig& cfg);

}  // namespace wc
