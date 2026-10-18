/**
 * 시계 화면 조각들(상태줄·모드 본문·시트·배너·토스트) — watch 모듈 내부 전용.
 * 명세: design/v2/README.md(01~10 보다 우선) 2장·3장. 펌웨어 ui.cpp 와 같은 화면·같은 좌표·같은 문구.
 *
 * 규칙
 *  - 각 조각은 DOM 을 한 번 만들고 update() 로 클래스·글자만 바꾼다.
 *  - 시계 화면 안 글자는 text.ts 의 t(키)(= shared/strings.ko.json) 또는 app.keymap(모드 이름·라벨)에서만 온다.
 *  - 좌표는 README 의 절대 px(410×502). 터치 판정 상수(LAUNCH_TILES, MEETING_TILES, SHEET 등)는 core/layout 을 쓴다.
 *  - 움직임은 계단식(Steps: setTimeout 으로 색·위치를 단계마다 바꿈)만. CSS transition·scale·opacity·그림자 금지.
 */
import {
  DIGITS,
  LAUNCH_TILES,
  LAUNCH_TILES_PER_PAGE,
  MEETING_TILES,
  RAIL,
  RAIL_ORDER,
  SHEET,
  findAction,
  formatBinding,
  listActions,
  resolveBinding,
} from '../core';
import type { ActionId, AppId, CoreState, Keymap, MeetingActionId, MeetingAppId, ModeId } from '../core';
import { Steps, batteryIcon, el, fmtElapsed, holdBarSteps, icon, place, setIcon, setText } from './dom';
import { t } from './text';
import type { StrKey } from './text';

type Rect = readonly [number, number, number, number];
const rectStyle = (e: HTMLElement, r: Rect) => place(e, r[0], r[1], r[2] - r[0], r[3] - r[1]);
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 키맵에서 (모드, 현재 앱, 동작) 의 라벨·힌트·키 유무를 읽는다 */
export function actionInfo(km: Keymap, s: CoreState, mode: ModeId, action: ActionId) {
  const app = s.apps[mode] as AppId;
  const a = findAction(km, mode, app, action);
  const b = resolveBinding(km, mode, app, action, s.os);
  return { label: a?.label ?? '', icon: a?.icon ?? null, hint: shortHint(formatBinding(b, s.os)), hasKey: b !== null };
}

/** 매크로 표기(Win+R → powerpnt → Enter)는 첫 단계만 남긴다 — 글꼴에 '→' 가 없고 칸도 좁다 */
function shortHint(full: string): string {
  const parts = full.split(' → ');
  return parts.length > 1 ? `${parts[0]} …` : full;
}

/** 'Ctrl+Alt+1' → 'C+A+1'(마지막 키 이름은 그대로) — 펌웨어 ui.cpp compactHint 와 같은 규칙 */
export function compactHint(h: string): string {
  const parts = h.split('+');
  if (parts.length < 2) return h;
  return [...parts.slice(0, -1).map((m) => m.charAt(0)), parts[parts.length - 1]].join('+');
}

/** 큰 숫자 5칸(num_128). 시계 HH:MM·발표 MM:SS 공용(README 3.1·3.2, layout.DIGITS) */
function mkDigits(parent: HTMLElement, yOff: number): HTMLDivElement[] {
  return DIGITS.x.map((x, i) => {
    const c = el('div', `watch-a watch-dg${i === 2 ? ' watch-dg--colon' : ''}`);
    place(c, x, DIGITS.y - yOff, DIGITS.w[i], DIGITS.h);
    parent.appendChild(c);
    return c;
  });
}

function setDigits(cells: HTMLDivElement[], text: string): void {
  [...text].forEach((ch, i) => cells[i] && setText(cells[i], ch));
}

/** 화살표(LV_SYMBOL_LEFT/RIGHT 대신 선 그림 — 글자가 아니므로 글꼴과 무관) */
function chevron(dir: 'l' | 'r'): SVGSVGElement {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 48 48');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'polyline');
  p.setAttribute('points', dir === 'l' ? '30,8 14,24 30,40' : '18,8 34,24 18,40');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '6');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  s.appendChild(p);
  return s;
}

// ===========================================================================
// 상태줄 0,0,410,56 (README 2.1)
// ===========================================================================
/** 지금 화면 종류: 모드 본문 / 설정 / 이름 선택 / 연결 대기 */
export type ScreenCtx = 'mode' | 'settings' | 'name' | 'waiting';

const SB_BURN: readonly (readonly [number, number])[] = [[0, 0], [2, 1], [-2, 2], [1, -1]];

export class StatusBar {
  readonly root = el('div', 'watch-a watch-sb');
  private chip = el('div', 'watch-a watch-sb__chip');
  private name = el('div', 'watch-a watch-sb__name watch-kr24');
  private time = el('div', 'watch-a watch-sb__time watch-kr20');
  private lock = icon('i-lock', 'sm', 'watch-sb__lock');
  private ble = icon('i-ble', 'sm', 'watch-sb__ble');
  private bat = batteryIcon();
  private pct = el('div', 'watch-a watch-sb__pct watch-kr20');
  private rail: HTMLDivElement[] = [];
  private chipSteps = new Steps();

  constructor() {
    place(this.chip, 32, 9, 72, 34);
    this.root.append(this.chip, this.name, this.time, this.lock, this.ble, this.bat.svg, this.pct);
    RAIL_ORDER.forEach((_, i) => {
      const r = el('div', 'watch-a watch-sb__rail');
      place(r, RAIL.x0 + i * RAIL.pitch, RAIL.y, RAIL.w, RAIL.h);
      this.root.appendChild(r);
      this.rail.push(r);
    });
  }

  update(s: CoreState, km: Keymap, ctx: ScreenCtx): void {
    const nonMode = ctx !== 'mode';
    this.root.dataset.ctx = ctx;
    setText(this.name, nonMode ? t(`screen.${ctx}` as StrKey) : km.modes[s.mode]?.name ?? s.mode);
    this.time.classList.toggle('is-hidden', nonMode || s.mode === 'clock');
    this.lock.classList.toggle('is-hidden', !s.locked);
    const waiting = !s.connected && !s.everConnected;
    const off = !s.connected && s.everConnected;
    this.root.classList.toggle('is-off', off);
    this.root.dataset.ble = s.connected ? 'on' : waiting ? 'wait' : 'off';
    setIcon(this.ble, off ? 'i-ble-off' : 'i-ble');
    this.ble.classList.toggle('watch-blink', off);
    const idx = RAIL_ORDER.indexOf(s.mode);
    this.rail.forEach((r, i) => {
      const on = !nonMode && i === idx;
      r.classList.toggle('is-on', on);
      r.classList.toggle('is-show', !on && !nonMode && i === 1 && s.show.running);
    });
  }

  /** 모드 전환 직후 600ms 이름 칩 반전(중앙 큰 제목 대신) */
  flashChip(): void {
    this.root.classList.add('is-inv');
    this.chipSteps.run([[600, () => this.root.classList.remove('is-inv')]]);
  }

  setClock(text: string): void {
    setText(this.time, text);
  }

  /** 시계 모드 번인 방지: 분마다 (0,0)→(2,1)→(−2,2)→(1,−1). minute < 0 = 고정 */
  setBurnIn(minute: number): void {
    const [dx, dy] = minute < 0 ? [0, 0] : SB_BURN[minute % SB_BURN.length];
    this.root.style.left = `${dx}px`;
    this.root.style.top = `${dy}px`;
  }

  /** 잔량(0~100, 5% 단위로 반올림해 그림)·충전 여부 */
  setBattery(pct: number, charging: boolean): void {
    const p = Math.max(0, Math.min(100, Math.round(pct / 5) * 5));
    this.bat.bar.setAttribute('width', String((11.5 * p) / 100));
    setText(this.pct, `${Math.round(pct)}%`);
    this.root.dataset.bat = charging ? 'charge' : pct <= 10 ? 'danger' : pct <= 20 ? 'warn' : 'ok';
  }
}

// ===========================================================================
// 발표 모드 본문 (README 3.2)
// ===========================================================================
type Phase = 'pre' | 'run' | 'ended';

export class PresentView {
  readonly root = el('div', 'watch-view watch-present');
  private zoneL = el('div', 'watch-a watch-zone is-hidden');
  private zoneR = el('div', 'watch-a watch-zone is-hidden');
  private edgeL = el('div', 'watch-a watch-edge');
  private edgeR = el('div', 'watch-a watch-edge');
  private arrowL = el('div', 'watch-a watch-arrow is-hidden');
  private arrowR = el('div', 'watch-a watch-arrow is-hidden');
  private dot = el('div', 'watch-a watch-pdot');
  private stateText = el('div', 'watch-a watch-pstate watch-kr24');
  private lockIc = icon('i-lock', 'sm', 'watch-plock');
  private lockText = el('div', 'watch-a watch-plock__t watch-kr24', t('present.locked'));
  private digits = el('div', 'watch-a watch-digits');
  private cells: HTMLDivElement[];
  private startHint = el('div', 'watch-a watch-starthint watch-kr20 watch-c', t('present.startHint'));
  private chip = el('div', 'watch-a watch-chip watch-kr28', t('present.blackChip'));
  private gauge = el('div', 'watch-a watch-gauge is-hidden');
  private gaugeFill = el('div', 'watch-a watch-gauge__fill');
  private hintL = el('div', 'watch-a watch-hint watch-kr20 watch-c');
  private hintM = el('div', 'watch-a watch-hint watch-kr20 watch-c');
  private hintR = el('div', 'watch-a watch-hint watch-kr20 watch-c');
  private ring = el('div', 'watch-a watch-ring');
  private ringDot = el('div', 'watch-a watch-ring__dot');
  private airLabel = el('div', 'watch-a watch-air-label watch-kr24 watch-c', t('present.airLabel'));
  private airHelp = el('div', 'watch-a watch-air-help watch-kr20 watch-c', t('present.airHelp'));
  private flashSteps = { l: new Steps(), r: new Steps() };
  private gaugeSteps = new Steps();
  private clickSteps = new Steps();

  /** 쇼 종료 후 멈춘 경과 시간(ms). null = 끝난 적 없음 */
  endedMs: number | null = null;

  constructor() {
    place(this.zoneL, 0, 64, 120, 422);
    place(this.zoneR, 290, 64, 120, 422);
    place(this.edgeL, 8, 162, 4, 120);
    place(this.edgeR, 398, 162, 4, 120);
    place(this.arrowL, 36, 328, 48, 48);
    place(this.arrowR, 326, 328, 48, 48);
    this.arrowL.appendChild(chevron('l'));
    this.arrowR.appendChild(chevron('r'));
    place(this.dot, 40, 120, 12, 12);
    place(this.stateText, 62, 111, 200, 30);
    this.lockIc.style.left = '300px';
    this.lockIc.style.top = '112px';
    place(this.lockText, 332, 111, 50, 30);
    place(this.digits, 0, 0, 410, 502);
    this.cells = mkDigits(this.digits, 0);
    place(this.startHint, 0, 308, 410, 30);
    place(this.chip, 123, 336, 164, 52);
    place(this.gauge, 135, 396, 140, 8);
    this.gauge.appendChild(this.gaugeFill);
    place(this.hintL, 0, 412, 120, 28);
    place(this.hintM, 120, 412, 170, 28);
    place(this.hintR, 290, 412, 120, 28);
    place(this.ring, 125, 180, 160, 160);
    place(this.ringDot, 199, 254, 12, 12);
    place(this.airLabel, 0, 352, 410, 30);
    place(this.airHelp, 0, 388, 410, 26);
    this.root.append(
      this.zoneL, this.zoneR, this.edgeL, this.edgeR, this.dot, this.stateText, this.lockIc, this.lockText,
      this.digits, this.startHint, this.chip, this.gauge, this.hintL, this.hintM, this.hintR,
      this.arrowL, this.arrowR, this.ring, this.ringDot, this.airLabel, this.airHelp,
    );
  }

  private phase(s: CoreState): Phase {
    return s.show.running ? 'run' : this.endedMs !== null ? 'ended' : 'pre';
  }

  update(s: CoreState, km: Keymap, elapsedMs: number): void {
    const prev = actionInfo(km, s, 'present', 'prev');
    const next = actionInfo(km, s, 'present', 'next');
    const black = actionInfo(km, s, 'present', 'blackout');
    this.root.classList.toggle('is-air', s.air.active);
    this.root.classList.toggle('is-off', !s.connected);
    this.root.classList.toggle('is-black', s.show.blackout);
    this.lockIc.classList.toggle('is-hidden', !s.locked);
    this.lockText.classList.toggle('is-hidden', !s.locked);
    this.chip.classList.toggle('is-hidden', !s.show.blackout);
    setText(this.hintL, prev.label ? t('present.hintPrev', prev.label) : '');
    setText(this.hintR, next.label ? t('present.hintNext', next.label) : '');
    setText(this.hintM, black.label ? (s.show.blackout ? t('present.hintResume') : t('present.hintHold', black.label)) : '');
    this.updateTimer(s, elapsedMs);
  }

  updateTimer(s: CoreState, elapsedMs: number): void {
    const phase = this.phase(s);
    const ms = phase === 'run' ? elapsedMs : phase === 'ended' ? this.endedMs ?? 0 : 0;
    setDigits(this.cells, fmtElapsed(ms));
    this.root.dataset.phase = phase;
    setText(this.stateText, t(phase === 'run' ? 'present.run' : phase === 'ended' ? 'present.ended' : 'present.pre'));
    this.startHint.classList.toggle('is-hidden', phase !== 'pre');
  }

  /** 넘김 플래시 3단계(0ms dim-border → 130ms dim → 260ms 숨김) + 큰 화살표 + 가장자리 레일 strong→accent */
  flash(side: 'l' | 'r'): void {
    const zone = side === 'l' ? this.zoneL : this.zoneR;
    const edge = side === 'l' ? this.edgeL : this.edgeR;
    const arrow = side === 'l' ? this.arrowL : this.arrowR;
    this.flashSteps[side].run([
      [0, () => {
        zone.classList.remove('is-hidden');
        zone.dataset.step = '1';
        edge.dataset.step = '1';
        arrow.classList.remove('is-hidden');
      }],
      [130, () => {
        zone.dataset.step = '2';
        edge.dataset.step = '2';
      }],
      [260, () => {
        zone.classList.add('is-hidden');
        delete zone.dataset.step;
        delete edge.dataset.step;
        arrow.classList.add('is-hidden');
      }],
    ]);
  }

  /** 가운데 길게 누름 게이지(150ms 부터 5단계, 600ms 에 140) */
  holdStart(holdMs: number): void {
    this.gauge.classList.remove('is-hidden');
    holdBarSteps(this.gaugeFill, 140, holdMs, this.gaugeSteps);
  }

  holdStop(): void {
    this.gaugeSteps.cancel();
    this.gauge.classList.add('is-hidden');
    this.gaugeFill.style.width = '0px';
  }

  /** 에어마우스 클릭 피드백: 링 안을 dim 으로 130ms */
  click(): void {
    this.clickSteps.run([
      [0, () => this.ring.classList.add('is-click')],
      [130, () => this.ring.classList.remove('is-click')],
    ]);
  }

  /** 잠금 판정 진행(측면 버튼을 절반 이상 누름) — 링·점을 잠금색으로 */
  setLockPending(on: boolean): void {
    this.root.classList.toggle('is-lockpend', on);
  }
}

// ===========================================================================
// 시계 모드 (README 3.1) — 키를 보내지 않는다. 시뮬레이터는 PC 시각(항상 동기화됨)
// ===========================================================================
const FACE_ORBIT: readonly (readonly [number, number])[] = [
  [0, 0], [8, 0], [8, 8], [0, 8], [-8, 8], [-8, 0], [-8, -8], [0, -8],
];
const FACE_Y = 56;

export class ClockView {
  readonly root = el('div', 'watch-view watch-clock');
  private face = el('div', 'watch-a watch-face');
  private cells: HTMLDivElement[];
  private dateRow = el('div', 'watch-a watch-daterow');
  private date = el('span', 'watch-date watch-kr28');
  private dow = el('span', 'watch-dow watch-kr28');

  constructor() {
    place(this.face, 0, FACE_Y, 410, 446);
    this.cells = mkDigits(this.face, FACE_Y);
    place(this.dateRow, 0, 300 - FACE_Y, 410, 40);
    this.dateRow.append(this.date, this.dow);
    this.face.appendChild(this.dateRow);
    this.root.appendChild(this.face);
  }

  update(now: Date = new Date()): void {
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    setDigits(this.cells, `${hh}:${mm}`);
    setText(this.date, t('clock.date', now.getMonth() + 1, now.getDate()));
    const d = now.getDay();
    setText(this.dow, t(`clock.dow${d}` as StrKey));
    this.dow.dataset.dow = d === 0 ? 'sun' : d === 6 ? 'sat' : '';
    // 번인 방지: 분마다 8점 궤도(±8px). 숫자가 바뀌는 분 경계와 같이 움직인다
    const [dx, dy] = FACE_ORBIT[Math.floor(now.getTime() / 60000) % FACE_ORBIT.length];
    this.face.style.left = `${dx}px`;
    this.face.style.top = `${FACE_Y + dy}px`;
  }
}

// ===========================================================================
// 실행 모드 — 2×3 타일 × 2쪽 (구조 유지, README 3.3 의 글꼴·좌표 일부)
// ===========================================================================
interface LaunchTile {
  root: HTMLDivElement;
  icon: SVGSVGElement;
  label: HTMLDivElement;
  hint: HTMLDivElement;
  bar: HTMLDivElement;
  action: ActionId | null;
  alt: boolean;
  okSteps: Steps;
  barSteps: Steps;
}

export class LaunchView {
  readonly root = el('div', 'watch-view watch-launch');
  readonly tiles: LaunchTile[] = [];
  private tabApps = el('div', 'watch-a watch-tab watch-kr20', t('launch.tabApps'));
  private tabWork = el('div', 'watch-a watch-tab watch-kr20', t('launch.tabWork'));

  constructor() {
    LAUNCH_TILES.forEach((r) => {
      const root = el('div', 'watch-a watch-tile watch-bd');
      rectStyle(root, r);
      const ic = icon('i-command', 'sm', 'watch-tile__icon');
      const label = el('div', 'watch-a watch-tile__label watch-kr28');
      const hint = el('div', 'watch-a watch-tile__hint watch-kr20 watch-r');
      const bar = el('div', 'watch-a watch-tile__bar');
      place(label, 16, 62, 151, 36);
      place(hint, 62, 22, 107, 26);
      place(bar, 16, 108, 0, 4);
      root.append(ic, label, hint, bar);
      this.root.appendChild(root);
      this.tiles.push({ root, icon: ic, label, hint, bar, action: null, alt: false, okSteps: new Steps(), barSteps: new Steps() });
    });
    this.tabApps.style.left = '135px';
    this.tabWork.style.left = '235px';
    for (const tab of [this.tabApps, this.tabWork]) {
      tab.style.top = '466px';
      tab.appendChild(el('i', 'watch-tab__line'));
      this.root.appendChild(tab);
    }
  }

  update(s: CoreState, km: Keymap): void {
    const all = listActions(km, 'launch', s.apps.launch);
    const actions = all.slice(s.launchPage * LAUNCH_TILES_PER_PAGE, (s.launchPage + 1) * LAUNCH_TILES_PER_PAGE);
    this.root.classList.toggle('is-off', !s.connected);
    this.tabApps.classList.toggle('is-on', s.launchPage === 0);
    this.tabWork.classList.toggle('is-on', s.launchPage === 1);
    this.tiles.forEach((tl, i) => {
      const a = actions[i];
      tl.action = a?.id ?? null;
      const b = a ? resolveBinding(km, 'launch', s.apps.launch, a.id, s.os) : null;
      tl.alt = !!a && !!(s.os === 'win' ? a.winAlt : a.macAlt);
      tl.root.classList.toggle('is-empty', !a);
      tl.root.classList.toggle('is-dis', !b);
      setIcon(tl.icon, a?.icon ?? 'i-command');
      tl.icon.classList.toggle('is-hidden', !a?.icon);
      setText(tl.label, a?.label ?? '');
      const full = formatBinding(b, s.os);
      // 비활성 타일은 힌트 자리에 이유(README 3.3): 포털 주소 없음 / Mac 미지원 / 키 없음
      const raw = a ? (s.os === 'win' ? a.win : a.mac) : null;
      const reason = !a || b ? null
        : raw ? t('launch.needUrl') // 바인딩은 있는데 풀리지 않음 = {url} 자리가 비었음
        : s.os === 'mac' ? t('launch.noMac')
        : t('launch.noKey');
      setText(tl.hint, reason ?? shortHint(full));
      tl.root.title = full;
      tl.hint.classList.remove('is-hidden');
      // 넘치면 수정자를 첫 글자로 줄인다(Ctrl+Alt+1 → C+A+1), 그래도 넘치면 숨긴다
      if (tl.hint.scrollWidth > 107 && !reason) setText(tl.hint, compactHint(shortHint(full)));
      if (tl.hint.scrollWidth > 107) tl.hint.classList.add('is-hidden');
    });
  }

  tileFor(action: ActionId): LaunchTile | undefined {
    return this.tiles.find((x) => x.action === action);
  }

  /** 눌림: 면 accent-dim + 2px accent 테두리(즉시). 대안 키가 있으면 길게 막대 */
  press(index: number, on: boolean, holdMs = 600): void {
    const tl = this.tiles[index];
    if (!tl) return;
    tl.root.classList.toggle('is-press', on);
    if (on && tl.alt) {
      holdBarSteps(tl.bar, 133, holdMs, tl.barSteps);
    } else {
      tl.barSteps.cancel();
      tl.bar.style.width = '0px';
    }
  }

  /** 탭 확정: 2px accent 테두리 400ms 유지 뒤 1px */
  flash(action: ActionId): void {
    const tl = this.tileFor(action);
    if (!tl) return;
    tl.okSteps.run([
      [0, () => tl.root.classList.add('is-ok')],
      [400, () => tl.root.classList.remove('is-ok')],
    ]);
  }
}

// ===========================================================================
// 회의 모드 — 앱 칩 + 마이크 큰 타일 + 카메라·손 들기 (구조 유지, README 3.4 글꼴·색)
// ===========================================================================
interface MeetTile {
  root: HTMLDivElement;
  icon: SVGSVGElement;
  label: HTMLDivElement;
  state: HTMLDivElement;
  hint?: HTMLDivElement;
  badge?: HTMLDivElement;
  sub?: HTMLDivElement;
  bar: HTMLDivElement;
  barW: number;
  okSteps: Steps;
  barSteps: Steps;
}

const MEET_CHIP_VIS: readonly Rect[] = [
  [16, 64, 134, 112], [146, 64, 264, 112], [276, 64, 394, 112],
];

export class MeetingView {
  readonly root = el('div', 'watch-view watch-meeting');
  readonly chips: { root: HTMLDivElement; app: MeetingAppId | null }[] = [];
  readonly tiles: Record<MeetingActionId, MeetTile>;

  constructor() {
    MEET_CHIP_VIS.forEach((r) => {
      const c = el('div', 'watch-a watch-mchip watch-bd watch-kr24');
      rectStyle(c, r);
      this.root.appendChild(c);
      this.chips.push({ root: c, app: null });
    });
    const mk = (action: MeetingActionId, big: boolean): MeetTile => {
      const root = el('div', `watch-a watch-mtile watch-bd watch-mtile--${action}${big ? ' watch-mtile--big' : ''}`);
      rectStyle(root, MEETING_TILES[action]);
      const ic = icon('i-mic', big ? 'lg' : 'md', 'watch-mtile__icon');
      const label = el('div', `watch-a watch-mtile__label watch-kr32${big ? ' watch-c' : ''}`);
      const state = el('div', 'watch-a watch-mtile__state watch-kr20');
      const bar = el('div', 'watch-a watch-mtile__bar');
      const t0: MeetTile = { root, icon: ic, label, state, bar, barW: big ? 322 : 143, okSteps: new Steps(), barSteps: new Steps() };
      if (big) {
        ic.style.left = '141px';
        ic.style.top = '30px';
        place(label, 0, 132, 378, 40);
        t0.hint = el('div', 'watch-a watch-mtile__hint watch-kr20');
        t0.badge = el('div', 'watch-a watch-mtile__badge watch-kr24 watch-c');
        t0.sub = el('div', 'watch-a watch-mtile__sub watch-kr24 watch-c');
        place(t0.hint, 20, 18, 220, 26);
        place(t0.badge, 358 - 72, 14, 72, 34);
        place(t0.sub, 0, 174, 378, 30);
        place(bar, 28, 208, 0, 4);
        root.append(ic, label, t0.hint, t0.badge, t0.sub, bar);
      } else {
        ic.style.left = '18px';
        ic.style.top = '12px';
        place(label, 18, 60, 147, 40);
        place(state, 18, 96, 147, 26);
        place(bar, 20, 124, 0, 4);
        root.append(ic, label, state, bar);
      }
      this.root.appendChild(root);
      return t0;
    };
    this.tiles = { mic: mk('mic', true), camera: mk('camera', false), hand: mk('hand', false) };
  }

  update(s: CoreState, km: Keymap): void {
    const mode = km.modes.meeting;
    const app = s.apps.meeting;
    this.root.classList.toggle('is-off', !s.connected);
    this.chips.forEach((c, i) => {
      const id = (mode?.appOrder[i] ?? null) as MeetingAppId | null;
      c.app = id;
      c.root.classList.toggle('is-hidden', !id);
      c.root.classList.toggle('is-sel', id === app);
      setText(c.root, id ? mode.apps[id]?.name ?? id : '');
    });
    const est = s.meeting[app];
    for (const action of ['mic', 'camera', 'hand'] as const) {
      const tl = this.tiles[action];
      const info = actionInfo(km, s, 'meeting', action);
      const baseIcon = info.icon ?? (action === 'mic' ? 'i-mic' : action === 'camera' ? 'i-camera' : 'i-hand');
      tl.root.classList.toggle('is-dis', !info.hasKey);
      if (action === 'hand') {
        const v = est.hand;
        tl.root.dataset.est = v;
        setIcon(tl.icon, baseIcon);
        setText(tl.state, info.hasKey ? t(v === 'up' ? 'meeting.up' : 'meeting.down') : t('meeting.noKey'));
        setText(tl.label, info.label);
        continue;
      }
      const v = est[action];
      tl.root.dataset.est = v;
      setIcon(tl.icon, v === 'off' ? `${baseIcon}-off` : baseIcon);
      if (action === 'mic') {
        setText(
          tl.label,
          v === 'unknown' ? info.label : t('meeting.labelState', info.label, t(v === 'on' ? 'meeting.on' : 'meeting.off')),
        );
        setText(tl.hint!, info.hint);
        setText(tl.badge!, t(v === 'unknown' ? 'meeting.unknown' : 'meeting.estimated'));
        setText(tl.sub!, !info.hasKey ? t('meeting.noKey') : v === 'unknown' ? t('meeting.unknownHint') : t('meeting.syncHint'));
      } else {
        setText(tl.label, info.label);
        setText(
          tl.state,
          info.hasKey ? t(v === 'on' ? 'meeting.on' : v === 'off' ? 'meeting.off' : 'meeting.unknown') : t('meeting.noKey'),
        );
      }
    }
  }

  pressChip(index: number, on: boolean): void {
    this.chips[index]?.root.classList.toggle('is-press', on);
  }

  /** 토글 타일 눌림 + 길게 누름 진행 막대(150ms 부터 5단계) */
  pressTile(action: MeetingActionId, on: boolean, holdMs = 600): void {
    const tl = this.tiles[action];
    tl.root.classList.toggle('is-press', on);
    if (on) holdBarSteps(tl.bar, tl.barW, holdMs, tl.barSteps);
    else {
      tl.barSteps.cancel();
      tl.bar.style.width = '0px';
    }
  }

  /** 탭 확정: 테두리 색 strong → accent → 원래 색(2단계, opa 없음) */
  flash(action: MeetingActionId): void {
    const tl = this.tiles[action];
    tl.okSteps.run([
      [0, () => (tl.root.dataset.ok = '1')],
      [130, () => (tl.root.dataset.ok = '2')],
      [260, () => delete tl.root.dataset.ok],
    ]);
  }
}

// ===========================================================================
// 연결 대기(페어링) 전체화면 — 한 번도 연결 안 됨 (README 3.5)
// ===========================================================================
/** 이름 끝 " XXXX"(MAC 끝 4자) 분리 */
export function splitSuffix(name: string): { base: string; suffix: string | null } {
  const m = /^(.*\S)\s([0-9A-Fa-f]{4})$/.exec(name.trim());
  return m ? { base: m[1], suffix: m[2].toUpperCase() } : { base: name.trim(), suffix: null };
}

export class WaitView {
  readonly root = el('div', 'watch-view watch-wait');
  private name = el('div', 'watch-a watch-wait__name watch-kr32 watch-c');
  private tail = el('div', 'watch-a watch-wait__tail watch-bd');
  private dots: HTMLElement[] = [];

  constructor() {
    const ic = icon('i-ble-off', 'md', 'watch-wait__icon');
    ic.style.left = '181px';
    ic.style.top = '72px';
    place(this.name, 20, 176, 370, 40);
    place(this.tail, 105, 232, 200, 72);
    this.root.append(ic, place(el('div', 'watch-a watch-wait__guide watch-kr24 watch-c', t('pair.guide')), 20, 136, 370, 30), this.name, this.tail);
    (['pair.step1', 'pair.step2', 'pair.step3'] as const).forEach((k, i) => {
      const y = 324 + i * 30;
      const n = place(el('div', 'watch-a watch-wait__num watch-kr20', String(i + 1)), 56, y + 3, 24, 24);
      const s = place(el('div', 'watch-a watch-wait__step watch-kr24', t(k)), 92, y, 300, 30);
      this.root.append(n, s);
    });
    this.root.appendChild(place(el('div', 'watch-a watch-wait__tip watch-kr20 watch-c', t('pair.tip')), 20, 428, 370, 26));
    [181, 205, 229].forEach((cx) => {
      const d = place(el('i', 'watch-a watch-wait__dot'), cx - 6, 466, 12, 12);
      this.root.appendChild(d);
      this.dots.push(d);
    });
  }

  update(deviceName: string, fallbackSuffix: string): void {
    const { base, suffix } = splitSuffix(deviceName);
    setText(this.name, base);
    setText(this.tail, suffix ?? fallbackSuffix);
  }

  /** 대기 점: 500ms 마다 하나씩 앞으로 */
  step(n: number): void {
    this.dots.forEach((d, i) => d.classList.toggle('is-on', i === n % 3));
  }
}

// ===========================================================================
// 쇼 시트 (README 2.4 변형 A, 발표만) — 덮개 없음, 0,0,410×344
// ===========================================================================
interface SheetBtn {
  root: HTMLDivElement;
  lbl: HTMLDivElement;
  key: HTMLDivElement;
  ic: SVGSVGElement;
}

export class Sheet {
  readonly root = el('div', 'watch-a watch-sheet is-hidden');
  private elapsed = el('div', 'watch-a watch-sheet__time watch-kr28 watch-r');
  readonly start: SheetBtn;
  readonly stop: SheetBtn;
  readonly settingsRow = el('div', 'watch-a watch-sheet__set watch-bd');
  private openSteps = new Steps();
  private shown = false;

  constructor() {
    place(this.root, 0, 0, 410, SHEET.height);
    const mk = (r: Rect): SheetBtn => {
      const root = el('div', 'watch-a watch-sbtn watch-bd');
      rectStyle(root, r);
      const ic = icon('i-play', 'sm', 'watch-sbtn__ic');
      const lbl = place(el('div', 'watch-a watch-sbtn__lbl watch-kr28'), 20, 28, 140, 36);
      const key = place(el('div', 'watch-a watch-sbtn__key watch-kr20'), 20, 72, 140, 26);
      ic.style.left = '127px';
      ic.style.top = '16px';
      root.append(ic, lbl, key);
      return { root, lbl, key, ic };
    };
    this.start = mk(SHEET.showStart);
    this.stop = mk(SHEET.showEnd);
    rectStyle(this.settingsRow, SHEET.settingsRow);
    this.settingsRow.append(
      place(el('div', 'watch-a watch-sheet__setttl watch-kr28', t('sheet.settings')), 24, 8, 300, 36),
      place(el('div', 'watch-a watch-sheet__setsub watch-kr24', t('sheet.settingsSub')), 24, 48, 300, 30),
      place(el('div', 'watch-a watch-sheet__setarrow watch-kr28 watch-r', t('settings.arrow')), 314, 26, 40, 36),
    );
    place(this.elapsed, 250, 28, 132, 40);
    this.root.append(
      place(el('div', 'watch-a watch-sheet__ttl watch-kr28', t('sheet.title')), 28, 28, 220, 40),
      this.elapsed,
      this.start.root,
      this.stop.root,
      this.settingsRow,
      place(el('div', 'watch-a watch-sheet__grab'), 185, 332, 40, 4),
    );
  }

  update(s: CoreState, km: Keymap, elapsedMs: number): void {
    const open = s.sheet.open && s.mode === 'present';
    this.setOpen(open);
    this.root.setAttribute('aria-hidden', String(!open));
    setText(this.elapsed, fmtElapsed(elapsedMs));
    for (const [part, action] of [[this.start, 'showStart'], [this.stop, 'showEnd']] as const) {
      const info = actionInfo(km, s, 'present', action);
      setText(part.lbl, info.label);
      setText(part.key, info.hint);
      setIcon(part.ic, info.icon ?? (action === 'showStart' ? 'i-play' : 'i-stop'));
      part.root.classList.toggle('is-dis', !s.connected || !info.hasKey);
    }
    // 권장 버튼: 쇼 시작 전이면 '쇼 시작', 진행 중이면 '쇼 종료'
    this.start.root.classList.toggle('is-rec', !s.show.running);
    this.stop.root.classList.toggle('is-rec', s.show.running);
  }

  setElapsed(ms: number): void {
    setText(this.elapsed, fmtElapsed(ms));
  }

  /** 열기 3단계 {0.6, 0.9, 1} 200ms(top 위치를 단계마다), 닫기는 즉시 */
  private setOpen(open: boolean): void {
    if (open === this.shown) return;
    this.shown = open;
    if (!open) {
      this.openSteps.cancel();
      this.root.classList.add('is-hidden');
      return;
    }
    const at = (f: number) => () => (this.root.style.top = `${Math.round(-SHEET.height * (1 - f))}px`);
    this.openSteps.run([
      [0, () => {
        at(0.6)();
        this.root.classList.remove('is-hidden');
      }],
      [100, at(0.9)],
      [200, at(1)],
    ]);
  }

  pressButton(which: 'showStart' | 'showEnd', on: boolean): void {
    (which === 'showStart' ? this.start : this.stop).root.classList.toggle('is-press', on);
  }
}

// ===========================================================================
// 연결 끊김 배너 16,438,378×48 한 줄 — 시계 모드에서는 띄우지 않음 (README 2.2, 실기 피드백 3)
// ===========================================================================
/** 끊김 배너 한 줄(16,438,378×48 — 펌웨어 ui.cpp BANNER_Y/H 와 같음) */
const BANNER_Y = 438;
const BANNER_H = 48;

export class Banner {
  readonly root = el('div', 'watch-a watch-banner watch-bd is-hidden');
  private ic = icon('i-ble-off', 'sm', 'watch-banner__ic watch-blink');
  private dot = el('i', 'watch-a watch-banner__ok is-hidden');
  /** 한 줄 '연결 끊김 · 12초'(실기 피드백 3: 배너를 48px 한 줄로) */
  private title = el('div', 'watch-a watch-banner__ttl watch-kr24');
  private state: 'hidden' | 'off' | 're' = 'hidden';
  private steps = new Steps();
  private shakeSteps = new Steps();
  private notSentUntil = 0;

  constructor() {
    place(this.root, 16, BANNER_Y, 378, BANNER_H);
    this.ic.style.left = '10px';
    this.ic.style.top = '10px';
    place(this.dot, 19, 19, 10, 10);
    place(this.title, 46, 0, 318, BANNER_H);
    this.title.style.lineHeight = `${BANNER_H}px`;
    this.root.append(this.ic, this.dot, this.title);
    this.root.setAttribute('role', 'status');
  }

  get visible(): boolean {
    return this.state !== 'hidden';
  }

  /** 끊김 상태 그리기(render·tick 에서 매번). now = app.now(). 시계 모드(설정 화면 아님)에서는 띄우지 않는다 */
  update(s: CoreState, now: number, settingsOpen = false): void {
    const off = !s.connected && s.everConnected && !(s.mode === 'clock' && !settingsOpen);
    if (off) {
      if (this.state !== 'off') this.showOff();
      setText(this.title, this.line(s, now));
    } else if (this.state === 'off' || (this.state === 're' && s.mode === 'clock' && !settingsOpen)) {
      this.hide();
    }
  }

  private line(s: CoreState, now: number): string {
    if (now < this.notSentUntil) return t('banner.lostNotSent');
    const sec = s.disconnectedAt === null ? 0 : Math.max(0, Math.floor((now - s.disconnectedAt) / 1000));
    return sec > 60 ? t('banner.lostCheck') : t('banner.lostSecs', sec);
  }

  private showOff(): void {
    const enter = this.state === 'hidden';
    this.state = 'off';
    this.root.classList.remove('is-re', 'is-hidden');
    this.ic.classList.remove('is-hidden');
    this.dot.classList.add('is-hidden');
    setText(this.title, t('banner.lostSecs', 0));
    if (!enter) {
      this.steps.cancel();
      this.root.style.top = `${BANNER_Y}px`;
      return;
    }
    // 등장 2단계 y 486 → 462 → 438 (120ms)
    this.steps.run([
      [0, () => (this.root.style.top = '486px')],
      [60, () => (this.root.style.top = '462px')],
      [120, () => (this.root.style.top = `${BANNER_Y}px`)],
    ]);
  }

  /** 재연결: 테두리 success, 아이콘 → 10px 점, '연결됨' 1600ms 뒤 즉시 숨김 */
  showReconnected(): void {
    if (this.state === 'hidden') return;
    this.state = 're';
    this.root.classList.add('is-re');
    this.root.style.top = `${BANNER_Y}px`;
    this.ic.classList.add('is-hidden');
    this.dot.classList.remove('is-hidden');
    setText(this.title, t('banner.reconnected'));
    this.steps.run([[1600, () => this.hide()]]);
  }

  hide(): void {
    this.steps.cancel();
    this.state = 'hidden';
    this.root.classList.add('is-hidden');
    this.root.classList.remove('is-re');
  }

  /** 끊긴 동안의 입력: x 16→10→22→10→22→16(80ms 단계) + 보조 문구 '보내지 못함' 800ms */
  shake(now: number): void {
    if (this.state !== 'off') return;
    this.notSentUntil = now + 800;
    setText(this.title, t('banner.lostNotSent'));
    const xs = [16, 10, 22, 10, 22, 16];
    this.shakeSteps.run(xs.map((x, i) => [i * 80, () => (this.root.style.left = `${x}px`)] as const));
  }
}

// ===========================================================================
// 토스트 — 16,64,378×64 하나. 새것이 오면 즉시 교체. 터치 통과 (README 2.3)
// ===========================================================================
export type ToastKind = 'info' | 'lock' | 'warn' | 'error' | 'success';

export class Toast {
  readonly root = el('div', 'watch-a watch-toast watch-bd is-hidden');
  private ic = icon('i-lock', 'sm', 'watch-toast__ic');
  private dot = el('i', 'watch-a watch-toast__dot');
  private text = el('div', 'watch-a watch-toast__t watch-kr24');
  private steps = new Steps();

  constructor() {
    place(this.root, 16, 64, 378, 64);
    this.ic.style.left = '24px';
    this.ic.style.top = '20px';
    place(this.dot, 31, 27, 10, 10);
    place(this.text, 60, 17, 302, 30);
    this.root.append(this.ic, this.dot, this.text);
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
  }

  show(kind: ToastKind, text: string, iconId: string | null = null): void {
    this.root.dataset.kind = kind;
    const useDot = kind === 'success';
    this.dot.classList.toggle('is-hidden', !useDot);
    this.ic.classList.toggle('is-hidden', useDot || !iconId);
    if (iconId) setIcon(this.ic, iconId);
    this.text.style.left = useDot || iconId ? '60px' : '24px';
    setText(this.text, text);
    this.root.classList.remove('is-hidden');
    // 등장 3단계 y −8 → −4 → 0 (100ms), 유지 1600ms, 퇴장 즉시
    this.steps.run([
      [0, () => (this.root.style.top = '56px')],
      [50, () => (this.root.style.top = '60px')],
      [100, () => (this.root.style.top = '64px')],
      [1700, () => this.root.classList.add('is-hidden')],
    ]);
  }
}
