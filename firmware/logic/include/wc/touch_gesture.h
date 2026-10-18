// 터치 제스처 판정 — sim/src/core/touchGesture.ts 와 같은 규칙(같은 공유 벡터 shared/test-vectors/touch.json 통과).
// 원시 터치 샘플(누름/좌표/시각)을 받아 코어 입력(tap/longPress/swipe)으로 바꾼다. 하드웨어 의존 없음(호스트 테스트 가능).
//
// 규칙(design/v2/README.md 1.4 · 4.4, 임계값은 GestureConfig::touch — shared/gesture.json → keymap_gen.h):
//   - 모든 키는 손을 뗄 때 보낸다. 이동이 tapMaxMovePx(12) 이상이면 탭·길게 누름을 취소한다.
//   - 길게 누름은 holdMs(600) 유지(이동 12px 미만). 발표 가운데·실행 타일·회의 타일만. 그 뒤 손을 떼도 탭은 없다.
//     발표 가운데(암전)만 blackoutHoldMs(360) — 그 영역의 탭 상한도 360(가운데 탭은 원래 동작 없음).
//   - 탭 = 이동 < 12px 이고 holdMs 전에 뗌(실행 타일·에어마우스·시트는 이동만 본다 — 길게 누름이 따로 있거나 없음).
//   - 가로 스와이프(모드 전환) = |dx| ≥ swipeMinPx(80), |dy| < swipeMaxOffAxisPx(60), |dx| > swipeAxisRatio(1.5)·|dy|,
//     swipeMaxMs(800) 안에 뗌. 쇼 진행 중 발표 모드는 |dx| ≥ showSwipeMinPx(140), |dy| < showSwipeMaxOffAxisPx(50).
//     상태줄(위 가장자리)에서 시작한 가로 스와이프도 모드 전환이다.
//   - 실행 모드 세로 스와이프(쪽 넘기기) = 같은 조건을 세로로(시작 y ≥ topEdgePx).
//   - 위에서 당기기 = 시작 y < topEdgePx(72), 아래로 ≥ sheetPullMinPx(48), |dx| < pullMaxOffAxisPx(40), pullMaxMs(600) 안.
//     발표 모드는 쇼 시트(swipe down), 그 밖의 모드는 시계 설정 화면 요청(takeSettingsRequest).
//   - 시트가 열려 있으면 모드 스와이프는 막는다. 시트 위로 쓸기(같은 당기기 조건, 위로) = 닫기(swipe up),
//     시트 설정 행 탭 = 닫기 + 설정 화면 요청, 그 밖의 탭 = 코어 tap(시트 버튼 = 쇼 시작/종료, 바깥 = 닫기). 모두 뗄 때.
//   - 에어마우스 중: 움직이지 않고 떼면 tap(= 왼쪽 클릭). 화면 꺼짐: 버린다. 첫 연결 전(연결 대기): 영역·스와이프 없음.
#pragma once

#include <vector>

#include "wc/layout.h"
#include "wc/types.h"

namespace wc {

class TouchGesture {
 public:
  // 눌림 표시용(누르는 즉시 화면이 그 대상을 강조한다 — 전송은 뗄 때)
  struct Press {
    HitKind kind = HitKind::None;
    int index = -1;  // LaunchTile 칸(0..5), MeetingTile 은 MeetingActionId 값, MeetingChip 은 칩 인덱스(0..2),
                     // PresentZone 은 zone 값, SheetButton 은 0 = 쇼 시작 / 1 = 쇼 종료
    bool sheetSettings = false;  // 시트 설정 행을 누르는 중
    double t0 = 0;               // 누른 시각(ms) — 길게 누름 진행 표시용
  };

  // 손가락 하나의 샘플. touching=false 는 손을 뗌. t 는 ms(코어 now 와 같은 기준).
  // 반환: 코어에 dispatch 할 입력(보통 0~1개, 시트 설정 행은 swipe up 1개 + 설정 요청).
  std::vector<InputEvent> sample(bool touching, double x, double y, double t, const CoreState& s, const Keymap& km,
                                 const GestureConfig& g);
  // 손가락을 대고 있는 동안 주기적으로 부른다(길게 누름 시각 판정). sample 안에서도 부르므로 따로 안 불러도 된다.
  std::vector<InputEvent> poll(double t, const GestureConfig& g);

  bool active() const { return active_; }
  // 시계 설정 화면 열기 요청(위 가장자리 당기기 — 발표 외 모드, 또는 시트 설정 행 탭). 읽으면 지워진다.
  bool takeSettingsRequest() {
    const bool r = settingsRequest_;
    settingsRequest_ = false;
    return r;
  }
  Press press() const;

 private:
  enum class Kind : uint8_t { Mode, Pull, Sheet, Air, Off };

  void down(double x, double y, double t, const CoreState& s, const Keymap& km, const GestureConfig& g);
  void move(double x, double y, const GestureConfig& g);
  void up(double t, const CoreState& s, const GestureConfig& g, std::vector<InputEvent>& out);

  bool active_ = false;
  Kind kind_ = Kind::Mode;
  double x0_ = 0, y0_ = 0, t0_ = 0, x_ = 0, y_ = 0;
  bool moved_ = false;
  bool longFired_ = false;
  bool canSwipe_ = true;
  bool sheetSettings_ = false;
  bool settingsRequest_ = false;
  double holdDue_ = -1;  // <0 이면 길게 누름 대기 없음
  double tapLimit_ = 600;  // 이 시간 전에 떼야 탭(누른 대상에 따라 holdMs 또는 blackoutHoldMs)
  HitTarget target_;
};

}  // namespace wc
