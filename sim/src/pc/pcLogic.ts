/**
 * 가상 PC 순수 로직 — DOM 없음(테스트 가능).
 * 받은 HID 키를 "지금 떠 있는 앱"의 단축키로 해석하고, 앱별 화면 상태(슬라이드·편집기·회의)를 바꾼다.
 *
 * 키 값은 코드에 쓰지 않는다. 받은 키 조합을 keymap(app.keymap)의 현재 OS 조합과 비교해 동작 id 를 찾는다.
 * 그래서 설정 화면에서 keymap 을 바꾸면 가상 PC 반응도 그대로 따라간다.
 */
import { isMacro, listActions } from '../core/keymap';
import type { ActionId, AppId, Chord, Keymap, MeetingAppId, Mod, ModeId, OsId } from '../core/types';

// ---------------------------------------------------------------------------
// 키 해석
// ---------------------------------------------------------------------------

/** 두 키 조합이 같은가: 키 이름이 같고 수정자가 집합으로 같다(순서 무관) */
export function chordEquals(a: Chord, b: Chord): boolean {
  if (a.key !== b.key) return false;
  const sa = new Set<Mod>(a.mods);
  const sb = new Set<Mod>(b.mods);
  if (sa.size !== sb.size) return false;
  for (const m of sa) if (!sb.has(m)) return false;
  return true;
}

/** (모드, 앱, OS) 에서 받은 키 조합에 해당하는 동작 id. 없으면 null */
export function matchAction(keymap: Keymap, mode: ModeId, app: AppId, os: OsId, chord: Chord): ActionId | null {
  for (const a of listActions(keymap, mode, app)) {
    const c = a[os];
    if (c && !isMacro(c) && chordEquals(c, chord)) return a.id;
  }
  return null;
}

/** 같은 모드의 다른 앱 중 이 키 조합을 쓰는 앱(이름 표시용). 예: Zoom 이 떠 있는데 Teams 마이크 키가 오면 ['teams'] */
export function otherAppsUsing(keymap: Keymap, mode: ModeId, app: AppId, os: OsId, chord: Chord): AppId[] {
  const m = keymap.modes[mode];
  if (!m) return [];
  const order = (m.appOrder?.length ? m.appOrder : (Object.keys(m.apps) as AppId[])).filter((id) => id !== app);
  return order.filter((other) => matchAction(keymap, mode, other, os, chord) !== null);
}

/** 앱 표시 이름(keymap 의 name). 없으면 id */
export function appName(keymap: Keymap, mode: ModeId, app: AppId): string {
  return keymap.modes[mode]?.apps[app]?.name ?? app;
}

/** 동작 라벨(keymap 의 label). 없으면 id */
export function actionLabel(keymap: Keymap, mode: ModeId, app: AppId, action: ActionId): string {
  return listActions(keymap, mode, app).find((a) => a.id === action)?.label ?? action;
}

// ---------------------------------------------------------------------------
// 가상 화면 좌표(커서)
// ---------------------------------------------------------------------------

export const PC_W = 1920;
export const PC_H = 1200;

export interface Cursor {
  x: number;
  y: number;
}

/** 상대 이동을 더하고 화면 경계(0 ~ W-1, 0 ~ H-1)로 자른다 */
export function moveCursor(c: Cursor, dx: number, dy: number, w = PC_W, h = PC_H): Cursor {
  const clamp = (v: number, max: number) => Math.min(max - 1, Math.max(0, v));
  return { x: clamp(c.x + dx, w), y: clamp(c.y + dy, h) };
}

// ---------------------------------------------------------------------------
// 슬라이드 프로그램 (발표 모드)
// ---------------------------------------------------------------------------

export type SlideView = 'edit' | 'show' | 'black';

export interface SlideDeckState {
  index: number;
  count: number;
  view: SlideView;
}

/** 반응 결과: 바뀐 상태 + (반응이 없을 때) 이유 */
export interface Reaction<S> {
  state: S;
  /** 반응 없음의 이유(화면에 짧게 알림). 반응했으면 null */
  note: string | null;
}

export function initDeck(count = 10): SlideDeckState {
  return { index: 0, count, view: 'edit' };
}

export function deckReact(s: SlideDeckState, action: ActionId): Reaction<SlideDeckState> {
  const last = s.count - 1;
  switch (action) {
    case 'next':
    case 'prev': {
      const d = action === 'next' ? 1 : -1;
      const index = Math.max(0, Math.min(last, s.index + d));
      // 암전 중 넘기면 실제 프로그램처럼 암전이 풀리며 넘어간다
      const view: SlideView = s.view === 'black' ? 'show' : s.view;
      if (index === s.index) return { state: { ...s, view }, note: action === 'next' ? '마지막 슬라이드입니다' : '첫 슬라이드입니다' };
      return { state: { ...s, index, view }, note: null };
    }
    case 'blackout':
      if (s.view === 'edit') return { state: s, note: '암전은 쇼 진행 중에만 동작합니다' };
      return { state: { ...s, view: s.view === 'black' ? 'show' : 'black' }, note: null };
    case 'showStart':
      return { state: { ...s, index: 0, view: 'show' }, note: null };
    case 'showEnd':
      if (s.view === 'edit') return { state: s, note: '쇼가 진행 중이 아닙니다' };
      return { state: { ...s, view: 'edit' }, note: null };
    default:
      return { state: s, note: '이 앱에선 반응 없음' };
  }
}

// ---------------------------------------------------------------------------
// 바탕화면·작업표시줄 (실행 모드) — 받은 키로만 바뀐다(실제 PC 처럼)
// ---------------------------------------------------------------------------

/** 1쪽 타일 순서 = Ctrl+Alt+1~6 바로 가기 키 순서(설치 페이지 'PC 바로 가기 키 설정') */
export const TASKBAR_APPS = ['claude', 'kakao', 'chrome', 'ppt', 'excel', 'hwp'] as const;
export type TaskbarApp = (typeof TASKBAR_APPS)[number];

export interface DesktopState {
  /** 열린 창(작업표시줄 순서와 무관하게 연 순서) */
  open: TaskbarApp[];
  /** 맨 앞 창. null = 바탕화면 */
  front: TaskbarApp | null;
  locked: boolean;
  muted: boolean;
  /** 화면 출력 메뉴(Win+P) 열림 */
  displayMenu: boolean;
  /** 마지막 반응 문장(상태줄) */
  status: string;
  /** 크롬으로 연 주소(업무포털) */
  url: string;
}

export function initDesktop(): DesktopState {
  return { open: [], front: null, locked: false, muted: false, displayMenu: false, status: '', url: '' };
}

const isTaskbarApp = (a: string): a is TaskbarApp => (TASKBAR_APPS as readonly string[]).includes(a);

function openApp(s: DesktopState, app: TaskbarApp, how: string): DesktopState {
  const open = s.open.includes(app) ? s.open : [...s.open, app];
  return { ...s, open, front: app, displayMenu: false, status: `${how}` };
}

/**
 * 실행 모드 동작 → 바탕화면 반응. via = 'key'(Win+숫자 등 한 번 누름) | 'macro'(Win+R·Spotlight 매크로).
 * url = 업무포털 주소(매크로 text 에 들어간 값).
 */
export function desktopReact(s: DesktopState, action: ActionId, via: 'key' | 'macro', label: string, url = ''): Reaction<DesktopState> {
  if (s.locked && action !== 'lock') return { state: s, note: '화면이 잠겨 있습니다(PC 에서 직접 풀기)' };
  if (isTaskbarApp(action)) {
    return { state: openApp(s, action, `${label} 창 열림 — ${via === 'key' ? 'Ctrl+Alt+숫자 바로 가기 키' : '실행 창(Win+R)/Spotlight'}`), note: null };
  }
  switch (action) {
    case 'portal':
      return { state: { ...openApp(s, 'chrome', `크롬 새 탭 — ${url || '(주소 없음)'}`), url }, note: null };
    case 'capture':
      return { state: { ...s, status: '영역 캡처 — 클립보드에 복사됨' }, note: null };
    case 'lock':
      return { state: { ...s, locked: true, status: '화면 잠김' }, note: null };
    case 'desktop':
      return { state: { ...s, front: s.front === null && s.open.length ? s.open[s.open.length - 1] : null, status: '바탕화면 보기' }, note: null };
    case 'display':
      return { state: { ...s, displayMenu: !s.displayMenu, status: '화면 출력 전환 메뉴' }, note: null };
    case 'mute':
      return { state: { ...s, muted: !s.muted, status: s.muted ? '소리 켜짐' : '음소거' }, note: null };
    default:
      return { state: s, note: '이 화면에선 반응 없음' };
  }
}

// ---------------------------------------------------------------------------
// 회의 창 (회의 모드) — 앱마다 따로 상태를 갖는다
// ---------------------------------------------------------------------------

export interface MeetingWindowState {
  mic: boolean;
  camera: boolean;
  hand: boolean;
}

export function initMeeting(): Record<MeetingAppId, MeetingWindowState> {
  // 목업과 같은 시작 상태: 마이크 켜짐, 카메라 꺼짐, 손 내림
  const one = (): MeetingWindowState => ({ mic: true, camera: false, hand: false });
  return { zoom: one(), teams: one(), meet: one() };
}

export function meetingReact(s: MeetingWindowState, action: ActionId): Reaction<MeetingWindowState> {
  switch (action) {
    case 'mic':
      return { state: { ...s, mic: !s.mic }, note: null };
    case 'camera':
      return { state: { ...s, camera: !s.camera }, note: null };
    case 'hand':
      return { state: { ...s, hand: !s.hand }, note: null };
    default:
      return { state: s, note: '이 앱에선 반응 없음' };
  }
}
