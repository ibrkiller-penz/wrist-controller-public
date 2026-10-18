/**
 * 시계 화면 터치 영역 판정 — 좌표(410×502) → 무엇을 눌렀나. 순수 함수.
 * 좌표 원본: design/system.md 3장, design/watch-presentation.md, design/watch-coding-meeting.md, docs/research/launcher.md.
 * 펌웨어 LVGL 은 위젯 이벤트를 쓰지만, 테스트 벡터 재현을 위해 같은 표를 C++ 에도 둔다.
 * 범위는 모두 [시작, 끝) 반열린 구간.
 */
import type { ActionId, Keymap, MeetingActionId, MeetingAppId, ModeId } from './types';

export const SCREEN_W = 410;
export const SCREEN_H = 502;
export const STATUSBAR_H = 56;

type Rect = readonly [x0: number, y0: number, x1: number, y1: number];
const inRect = (x: number, y: number, r: Rect) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];

/** 발표 모드 세 영역(본문 y 56~502) */
export const PRESENT_ZONES = { prevEnd: 120, nextStart: 290 } as const;

/**
 * 실행 모드 2×3 타일 (행 우선, 한 쪽 6칸). keymap actions 인덱스 = 쪽 × 6 + 칸.
 * 아래 쪽 점 띠(LAUNCH_DOTS)를 두려고 타일 높이를 124 로 줄였다(옛 코딩 타일 132).
 */
export const LAUNCH_TILES: readonly Rect[] = [
  [16, 64, 199, 188], [211, 64, 394, 188],
  [16, 200, 199, 324], [211, 200, 394, 324],
  [16, 336, 199, 460], [211, 336, 394, 460],
];
export const LAUNCH_TILES_PER_PAGE = 6;
/** 쪽 점 띠 — 누르면 다음 쪽 */
export const LAUNCH_DOTS: Rect = [0, 462, 410, 502];

/** 회의 앱 칩(appOrder 순서). 터치 영역은 위아래로 늘린 y 40~118 (watch-coding-meeting D6) */
export const MEETING_CHIPS: readonly Rect[] = [
  [16, 40, 134, 118], [146, 40, 264, 118], [276, 40, 394, 118],
];
export const MEETING_TILES: Readonly<Record<MeetingActionId, Rect>> = {
  mic: [16, 124, 394, 344],
  camera: [16, 356, 199, 486],
  hand: [211, 356, 394, 486],
};

/** 쇼 시작/종료 시트(아래로 당기기). design/v2/README.md 2.4 변형 A: 높이 344 + 설정 행. y ≥ 높이 = 바깥(닫기) */
export const SHEET = {
  height: 344,
  showStart: [24, 92, 195, 212] as Rect,
  showEnd: [215, 92, 386, 212] as Rect,
  /** 맨 아래 설정 행 — 탭하면 시트를 닫고 시계 설정 화면(터치 판정 TouchGesture 가 처리, 코어 입력 아님) */
  settingsRow: [16, 236, 394, 324] as Rect,
} as const;

/** 전원 끄기 확인 화면(실기 피드백 11) — [끄기] [취소] 183×112 */
export const POWER_OFF_BTN: Rect = [16, 300, 199, 412];
export const POWER_CANCEL_BTN: Rect = [211, 300, 394, 412];

// ---- 그리기 좌표(v2, design/v2/README.md 2.1·3.1) — 펌웨어 wc/layout.h 와 같은 값
/** 상태줄 레일 4칸: x = x0 + i·pitch, y 49, 78×3 */
export const RAIL = { x0: 40, pitch: 84, y: 49, w: 78, h: 3 } as const;
/** 레일 칸 순서(i = 시계 0, 발표 1, 실행 2, 회의 3) */
export const RAIL_ORDER: readonly ModeId[] = ['clock', 'present', 'launch', 'meeting'];
/** 큰 숫자 칸 5개(시계 HH:MM, 발표 MM:SS 공용, num_128) */
export const DIGITS = { x: [25, 105, 185, 225, 305], w: [80, 80, 40, 80, 80], y: 144, h: 154 } as const;

export const inRectXY = (x: number, y: number, r: Rect) => inRect(x, y, r);

export type HitTarget =
  | { kind: 'none' }
  | { kind: 'presentZone'; zone: 'prev' | 'center' | 'next' }
  | { kind: 'launchTile'; index: number; action: ActionId | null }
  | { kind: 'launchDots' }
  | { kind: 'meetingChip'; app: MeetingAppId }
  | { kind: 'meetingTile'; action: MeetingActionId }
  | { kind: 'sheetButton'; action: 'showStart' | 'showEnd' }
  | { kind: 'sheetScrim' };

export function hitTest(
  mode: ModeId,
  sheetOpen: boolean,
  x: number,
  y: number,
  keymap: Keymap,
  launchApp = 'launcher',
  launchPage = 0,
): HitTarget {
  if (sheetOpen) {
    if (inRect(x, y, SHEET.showStart)) return { kind: 'sheetButton', action: 'showStart' };
    if (inRect(x, y, SHEET.showEnd)) return { kind: 'sheetButton', action: 'showEnd' };
    if (y >= SHEET.height) return { kind: 'sheetScrim' };
    return { kind: 'none' };
  }
  switch (mode) {
    case 'present': {
      if (y < STATUSBAR_H || y >= SCREEN_H || x < 0 || x >= SCREEN_W) return { kind: 'none' };
      if (x < PRESENT_ZONES.prevEnd) return { kind: 'presentZone', zone: 'prev' };
      if (x < PRESENT_ZONES.nextStart) return { kind: 'presentZone', zone: 'center' };
      return { kind: 'presentZone', zone: 'next' };
    }
    case 'launch': {
      if (inRect(x, y, LAUNCH_DOTS)) return { kind: 'launchDots' };
      const i = LAUNCH_TILES.findIndex((r) => inRect(x, y, r));
      if (i < 0) return { kind: 'none' };
      const actions = keymap.modes.launch?.apps[launchApp]?.actions ?? [];
      return { kind: 'launchTile', index: i, action: actions[launchPage * LAUNCH_TILES_PER_PAGE + i]?.id ?? null };
    }
    case 'clock':
      return { kind: 'none' };
    case 'meeting': {
      for (const a of ['mic', 'camera', 'hand'] as const) {
        if (inRect(x, y, MEETING_TILES[a])) return { kind: 'meetingTile', action: a };
      }
      const i = MEETING_CHIPS.findIndex((r) => inRect(x, y, r));
      const app = keymap.modes.meeting.appOrder[i];
      if (i >= 0 && app) return { kind: 'meetingChip', app: app as MeetingAppId };
      return { kind: 'none' };
    }
  }
}
