// 시계 화면 터치 영역 판정 구현 — sim/src/core/layout.ts hitTest 와 같은 순서.
#include "wc/layout.h"

#include "wc/keymap.h"

namespace wc {

HitTarget hitTest(ModeId mode, bool sheetOpen, double x, double y, const Keymap& km, AppId launchApp, int launchPage) {
  HitTarget h;
  if (sheetOpen) {
    if (inRect(x, y, SHEET_SHOW_START)) {
      h.kind = HitKind::SheetButton;
      h.action = ActionId::ShowStart;
    } else if (inRect(x, y, SHEET_SHOW_END)) {
      h.kind = HitKind::SheetButton;
      h.action = ActionId::ShowEnd;
    } else if (y >= SHEET_HEIGHT) {
      h.kind = HitKind::SheetScrim;
    }
    return h;
  }
  switch (mode) {
    case ModeId::Present: {
      if (y < STATUSBAR_H || y >= SCREEN_H || x < 0 || x >= SCREEN_W) return h;
      h.kind = HitKind::PresentZone;
      if (x < PRESENT_PREV_END) {
        h.zone = PresentZone::Prev;
      } else if (x < PRESENT_NEXT_START) {
        h.zone = PresentZone::Center;
      } else {
        h.zone = PresentZone::Next;
      }
      return h;
    }
    case ModeId::Launch: {
      if (inRect(x, y, LAUNCH_DOTS)) {
        h.kind = HitKind::LaunchDots;
        return h;
      }
      for (int i = 0; i < LAUNCH_TILES_PER_PAGE; ++i) {
        if (inRect(x, y, LAUNCH_TILES[i])) {
          h.kind = HitKind::LaunchTile;
          h.index = i;
          const KeymapApp* app = findApp(km, ModeId::Launch, launchApp);
          const size_t ai = static_cast<size_t>(launchPage * LAUNCH_TILES_PER_PAGE + i);
          if (app && ai < app->actions.size()) h.action = app->actions[ai].id;
          return h;
        }
      }
      return h;
    }
    case ModeId::Clock:
      return h;
    case ModeId::Meeting: {
      for (int a = 0; a < 3; ++a) {
        if (inRect(x, y, MEETING_TILES[a])) {
          h.kind = HitKind::MeetingTile;
          h.meetingAction = static_cast<MeetingActionId>(a);
          return h;
        }
      }
      const auto& order = km.modes[idx(ModeId::Meeting)].appOrder;
      for (int i = 0; i < 3; ++i) {
        if (inRect(x, y, MEETING_CHIPS[i])) {
          if (static_cast<size_t>(i) < order.size()) {
            h.kind = HitKind::MeetingChip;
            h.app = order[static_cast<size_t>(i)];
          }
          return h;
        }
      }
      return h;
    }
  }
  return h;
}

}  // namespace wc
