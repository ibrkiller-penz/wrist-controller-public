// 시계 화면 터치 영역 판정 — sim/src/core/layout.ts 대응. 좌표 410×502, 모든 범위는 [시작, 끝).
// 펌웨어 LVGL 은 위젯 이벤트를 쓰지만, 테스트 벡터 재현과 위젯 배치 기준을 위해 같은 표를 둔다.
#pragma once

#include "wc/types.h"

namespace wc {

constexpr int SCREEN_W = 410;
constexpr int SCREEN_H = 502;
constexpr int STATUSBAR_H = 56;

struct Rect {
  int x0, y0, x1, y1;
};

constexpr int PRESENT_PREV_END = 120;
constexpr int PRESENT_NEXT_START = 290;

// 실행 모드 2×3 타일(행 우선, 한 쪽 6칸). keymap actions 인덱스 = 쪽 × 6 + 칸. 쪽 점 띠를 두려고 높이 124
constexpr Rect LAUNCH_TILES[6] = {
    {16, 64, 199, 188},  {211, 64, 394, 188},  {16, 200, 199, 324},
    {211, 200, 394, 324}, {16, 336, 199, 460}, {211, 336, 394, 460},
};
constexpr int LAUNCH_TILES_PER_PAGE = 6;
// 쪽 점 띠 — 누르면 다음 쪽
constexpr Rect LAUNCH_DOTS = {0, 462, 410, 502};
// 회의 앱 칩(appOrder 순)
constexpr Rect MEETING_CHIPS[3] = {{16, 40, 134, 118}, {146, 40, 264, 118}, {276, 40, 394, 118}};
// 회의 타일: mic, camera, hand (MeetingActionId 순)
constexpr Rect MEETING_TILES[3] = {{16, 124, 394, 344}, {16, 356, 199, 486}, {211, 356, 394, 486}};
// 쇼 시작/종료 시트(design/v2/README.md 2.4 변형 A: 높이 344 + 설정 행). y ≥ 높이 = 바깥(닫기)
constexpr int SHEET_HEIGHT = 344;
constexpr Rect SHEET_SHOW_START = {24, 92, 195, 212};
constexpr Rect SHEET_SHOW_END = {215, 92, 386, 212};
// 시트 맨 아래 설정 행 — 탭하면 시트를 닫고 시계 설정 화면을 연다(터치 판정 TouchGesture 가 처리, 코어 입력 아님)
constexpr Rect SHEET_SETTINGS_ROW = {16, 236, 394, 324};

// 전원 끄기 확인 화면(실기 피드백 11) — [끄기] [취소] 183×112(터치 최소 88 이상)
constexpr Rect POWER_OFF_BTN = {16, 300, 199, 412};
constexpr Rect POWER_CANCEL_BTN = {211, 300, 394, 412};

// ---- 그리기 좌표(v2, design/v2/README.md 2.1·3.1) — 펌웨어 ui.cpp 와 시뮬레이터 screens.ts 가 같은 값을 쓴다
// 상태줄 레일 4칸: x = RAIL_X0 + i·RAIL_PITCH, y RAIL_Y, 78×3. i = 시계 0, 발표 1, 실행 2, 회의 3
constexpr int RAIL_X0 = 40, RAIL_PITCH = 84, RAIL_Y = 49, RAIL_W = 78, RAIL_H = 3;
inline int railIndex(ModeId m) {
  switch (m) {
    case ModeId::Clock: return 0;
    case ModeId::Present: return 1;
    case ModeId::Launch: return 2;
    case ModeId::Meeting: return 3;
  }
  return 0;
}
// 큰 숫자 칸 5개(시계 HH:MM, 발표 MM:SS 공용, num_128): x, 폭. y 144, 높이 154
constexpr int DIGIT_X[5] = {25, 105, 185, 225, 305};
constexpr int DIGIT_W[5] = {80, 80, 40, 80, 80};
constexpr int DIGIT_Y = 144, DIGIT_H = 154;

enum class HitKind : uint8_t { None, PresentZone, LaunchTile, LaunchDots, MeetingChip, MeetingTile, SheetButton, SheetScrim };
enum class PresentZone : uint8_t { Prev, Center, Next };

struct HitTarget {
  HitKind kind = HitKind::None;
  PresentZone zone = PresentZone::Center;     // PresentZone
  int index = -1;                             // LaunchTile(쪽 안 칸 0..5)
  std::optional<ActionId> action;             // LaunchTile(없으면 nullopt), SheetButton(ShowStart/ShowEnd)
  AppId app = AppId::Zoom;                    // MeetingChip
  MeetingActionId meetingAction = MeetingActionId::Mic;  // MeetingTile
};

inline bool inRect(double x, double y, const Rect& r) { return x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1; }

HitTarget hitTest(ModeId mode, bool sheetOpen, double x, double y, const Keymap& km, AppId launchApp = AppId::Launcher,
                  int launchPage = 0);

}  // namespace wc
