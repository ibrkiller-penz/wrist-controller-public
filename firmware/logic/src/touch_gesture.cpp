// 터치 제스처 판정 구현 — sim/src/core/touchGesture.ts 와 같은 순서·조건(공유 벡터 shared/test-vectors/touch.json).
// 규칙 원본: design/v2/README.md 1.4(판정 상수)·4.4(모든 키는 뗄 때). 설명은 wc/touch_gesture.h 머리말.
#include "wc/touch_gesture.h"

#include <cmath>

namespace wc {

namespace {
bool waiting(const CoreState& s) { return !s.connected && !s.everConnected; }
}  // namespace

std::vector<InputEvent> TouchGesture::sample(bool touching, double x, double y, double t, const CoreState& s,
                                             const Keymap& km, const GestureConfig& g) {
  std::vector<InputEvent> out;
  if (touching) {
    if (!active_) {
      down(x, y, t, s, km, g);
    } else {
      move(x, y, g);
    }
  }
  for (auto& e : poll(t, g)) out.push_back(std::move(e));
  if (!touching && active_) up(t, s, g, out);
  return out;
}

std::vector<InputEvent> TouchGesture::poll(double t, const GestureConfig& g) {
  (void)g;
  std::vector<InputEvent> out;
  if (active_ && holdDue_ >= 0 && t >= holdDue_) {
    holdDue_ = -1;
    if (!moved_) {
      longFired_ = true;
      out.push_back(InputEvent::longPress(x0_, y0_));
    }
  }
  return out;
}

TouchGesture::Press TouchGesture::press() const {
  Press p;
  if (!active_ || moved_ || longFired_) return p;
  p.t0 = t0_;
  if (kind_ == Kind::Sheet) {
    p.sheetSettings = sheetSettings_;
    if (target_.kind == HitKind::SheetButton) {
      p.kind = HitKind::SheetButton;
      p.index = target_.action == ActionId::ShowEnd ? 1 : 0;
    }
    return p;
  }
  if (kind_ != Kind::Mode) return p;
  p.kind = target_.kind;
  switch (target_.kind) {
    case HitKind::LaunchTile: p.index = target_.index; break;
    case HitKind::MeetingTile: p.index = static_cast<int>(target_.meetingAction); break;
    case HitKind::PresentZone: p.index = static_cast<int>(target_.zone); break;
    case HitKind::MeetingChip: p.index = target_.index; break;
    default: break;
  }
  return p;
}

void TouchGesture::down(double x, double y, double t, const CoreState& s, const Keymap& km, const GestureConfig& g) {
  active_ = true;
  kind_ = Kind::Mode;
  x0_ = x_ = x;
  y0_ = y_ = y;
  t0_ = t;
  moved_ = false;
  longFired_ = false;
  sheetSettings_ = false;
  holdDue_ = -1;
  tapLimit_ = g.touch.holdMs;
  target_ = HitTarget{};
  canSwipe_ = !s.air.active && !s.sheet.open && !waiting(s);

  if (!s.screenOn) {
    kind_ = Kind::Off;  // 화면이 꺼져 있으면 터치를 버린다(켜는 일은 펌웨어 전원 처리)
    return;
  }
  if (s.powerConfirmSince) {
    kind_ = Kind::Confirm;  // 전원 끄기 확인 화면: 움직이지 않고 떼면 tap(코어가 [끄기]·[취소] 판정)
    return;
  }
  if (s.air.active) {
    kind_ = Kind::Air;  // 에어마우스 중: 움직이지 않고 떼면 왼쪽 클릭
    return;
  }
  if (s.sheet.open && s.mode == ModeId::Present) {
    kind_ = Kind::Sheet;
    sheetSettings_ = inRect(x, y, SHEET_SETTINGS_ROW);
    if (!sheetSettings_) target_ = hitTest(s.mode, true, x, y, km, s.apps.launch, s.launchPage);
    return;
  }
  if (y < g.touch.topEdgePx) {
    kind_ = Kind::Pull;
    return;
  }
  if (waiting(s)) return;  // 연결 대기 화면: 영역 없음
  target_ = hitTest(s.mode, false, x, y, km, s.apps.launch, s.launchPage);
  if (target_.kind == HitKind::MeetingChip) {
    const auto& order = km.modes[idx(ModeId::Meeting)].appOrder;
    for (size_t i = 0; i < order.size(); ++i)
      if (order[i] == target_.app) target_.index = static_cast<int>(i);
  }
  if (target_.kind == HitKind::PresentZone && target_.zone == PresentZone::Center) {
    tapLimit_ = g.touch.blackoutHoldMs;  // 암전만 짧게(실기 피드백 5)
    holdDue_ = t + g.touch.blackoutHoldMs;
  } else if (target_.kind == HitKind::MeetingTile || target_.kind == HitKind::LaunchTile) {
    holdDue_ = t + g.touch.holdMs;
  }
}

void TouchGesture::move(double x, double y, const GestureConfig& g) {
  x_ = x;
  y_ = y;
  if (!moved_ && std::hypot(x - x0_, y - y0_) >= g.touch.tapMaxMovePx) {
    moved_ = true;
    holdDue_ = -1;  // 이동하면 길게 누름 대기도 취소
  }
}

void TouchGesture::up(double t, const CoreState& s, const GestureConfig& g, std::vector<InputEvent>& out) {
  active_ = false;
  holdDue_ = -1;
  const auto& tc = g.touch;
  const double dx = x_ - x0_;
  const double dy = y_ - y0_;
  const double ax = std::fabs(dx), ay = std::fabs(dy);
  const double dt = t - t0_;
  const bool isTap = !moved_ && !longFired_ && dt < tapLimit_;
  // 쇼 진행 중 발표 모드: 모드 전환 스와이프를 더 길게(넘김 탭이 스와이프로 새지 않게)
  const bool showRun = s.mode == ModeId::Present && s.show.running;
  const double minH = showRun ? tc.showSwipeMinPx : tc.swipeMinPx;
  const double offH = showRun ? tc.showSwipeMaxOffAxisPx : tc.swipeMaxOffAxisPx;
  const bool swipeH = ax >= minH && ay < offH && ax > tc.swipeAxisRatio * ay && dt <= tc.swipeMaxMs;
  const bool swipeV = ay >= tc.swipeMinPx && ax < tc.swipeMaxOffAxisPx && ay > tc.swipeAxisRatio * ax && dt <= tc.swipeMaxMs;
  const bool pullOk = ax < tc.pullMaxOffAxisPx && dt <= tc.pullMaxMs;
  const bool pullDown = dy >= tc.sheetPullMinPx && pullOk;
  const bool pullUp = -dy >= tc.sheetPullMinPx && pullOk;

  switch (kind_) {
    case Kind::Off:
      return;
    case Kind::Air:
      if (!moved_) out.push_back(InputEvent::tap(x0_, y0_));  // 왼쪽 클릭(뗄 때)
      return;
    case Kind::Confirm:
      if (!moved_) out.push_back(InputEvent::tap(x0_, y0_));
      return;
    case Kind::Sheet:
      if (pullUp) {
        out.push_back(InputEvent::swipe(SwipeDir::Up));  // 시트 닫기
      } else if (!moved_) {
        if (sheetSettings_) {
          out.push_back(InputEvent::swipe(SwipeDir::Up));  // 시트를 닫고
          settingsRequest_ = true;                          // 시계 설정 화면으로
        } else {
          out.push_back(InputEvent::tap(x0_, y0_));  // 시트 버튼 = 쇼 시작/종료, 바깥 = 닫기
        }
      }
      return;
    case Kind::Pull:
      if (pullDown) {
        // 발표 모드 = 쇼 시작/종료 시트. 다른 모드·연결 대기 = 시계 설정 화면(코어 입력 없음 — 펌웨어가 연다)
        if (s.mode == ModeId::Present && !waiting(s)) {
          out.push_back(InputEvent::swipe(SwipeDir::Down));
        } else {
          settingsRequest_ = true;
        }
        return;
      }
      if (canSwipe_ && swipeH) {
        out.push_back(InputEvent::swipe(dx < 0 ? SwipeDir::Left : SwipeDir::Right));  // 상태줄에서도 모드 전환
        return;
      }
      if (isTap && !waiting(s)) out.push_back(InputEvent::tap(x0_, y0_));  // 회의 앱 칩(y 40~) 등
      return;
    case Kind::Mode: {
      if (canSwipe_ && swipeH) {
        out.push_back(InputEvent::swipe(dx < 0 ? SwipeDir::Left : SwipeDir::Right));
        return;
      }
      // 실행 모드: 세로 스와이프 = 쪽 넘기기(위로 = 다음 쪽)
      if (s.mode == ModeId::Launch && canSwipe_ && swipeV) {
        out.push_back(InputEvent::swipe(dy < 0 ? SwipeDir::Up : SwipeDir::Down));
        return;
      }
      // 실행 타일: 움직이지 않고 뗐으면 전송(길게 누름이 이미 나갔으면 보내지 않음)
      if (target_.kind == HitKind::LaunchTile) {
        if (!moved_ && !longFired_) out.push_back(InputEvent::tap(x0_, y0_));
        return;
      }
      if (!isTap) return;
      // 발표 좌/우·실행 쪽 탭·회의 칩·회의 토글: 짧게 탭하고 뗄 때 전송
      if ((target_.kind == HitKind::PresentZone && target_.zone != PresentZone::Center) ||
          target_.kind == HitKind::LaunchDots || target_.kind == HitKind::MeetingChip ||
          target_.kind == HitKind::MeetingTile) {
        out.push_back(InputEvent::tap(x0_, y0_));
      }
      return;
    }
  }
}

}  // namespace wc
