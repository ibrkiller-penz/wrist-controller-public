// 에어마우스 필터 — sim/src/core/airmouse.ts 대응. 자이로 각속도(deg/s) → 커서 이동(px).
// 수식은 /shared/test-vectors/README.md 5.2.
#pragma once

#include "wc/types.h"

namespace wc {

AirMouseState initAirMouse();
AirMouseState airStart(double now);  // 에어마우스 시작(필터 0, since=now)
AirMouseState airStop();             // 정지 — 필터·잔여 전부 리셋(드리프트 없음)

struct AirResult {
  AirMouseState state;
  int dx = 0;
  int dy = 0;
  bool moving = false;  // 데드존을 넘은 움직임이 있었나(잠금 길게 누름 취소용)
};

// 샘플 하나 처리. 비활성이면 그대로 0. sensitivity = gesture.airMouse.sensitivity 인덱스
AirResult airStep(const AirMouseState& prev, const ImuSample& s, const GestureConfig& cfg, double sensitivity);

}  // namespace wc
