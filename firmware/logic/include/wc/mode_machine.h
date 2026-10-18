// 모드 상태 기계 — sim/src/core/modeMachine.ts 대응.
// 순수 리듀서: step(state, input, ctx) → {새 상태, 보낼 HID, 버린 HID, 시스템 알림}.
// 처리 순서: ① 타이머 → ② 입력 → ③ 타이머. 규칙은 /shared/test-vectors/README.md 3장.
#pragma once

#include "wc/types.h"

namespace wc {

// 초기 상태. keymap.settings 기본값, 연결됨, 잠금 해제, 화면 켜짐.
CoreState initState(const Keymap& km);

// state 는 바꾸지 않고 새 상태를 돌려준다. imu 입력이면 now 로 sample.t 를 쓴다.
StepResult step(const CoreState& state, const InputEvent& input, const StepContext& ctx);

// 발표 경과 시간(ms). 쇼가 시작되지 않았으면 0
double showElapsed(const CoreState& state, double now);

}  // namespace wc
