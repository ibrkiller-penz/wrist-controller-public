/**
 * 터치 제스처 판정 — firmware/logic/src/touch_gesture.cpp(wc::TouchGesture)와 같은 규칙·같은 순서.
 * 원시 터치 샘플(누름/좌표/시각) → 코어 입력(tap / longPress / swipe). 순수 로직(타이머·DOM 없음).
 * 두 구현은 공유 벡터 /shared/test-vectors/touch.json 을 함께 통과해야 한다.
 *
 * 규칙(design/v2/README.md 1.4 · 4.4, 임계값은 gesture.touch):
 *  - 모든 키는 손을 뗄 때 보낸다. 이동이 tapMaxMovePx(12) 이상이면 탭·길게 누름을 취소한다.
 *  - 길게 누름 = holdMs(600) 유지(발표 가운데·실행 타일·회의 타일). 그 뒤 손을 떼도 탭은 없다.
 *    발표 가운데(암전)만 blackoutHoldMs(360) — 그 영역의 탭 상한도 360.
 *  - 가로 스와이프 = |dx| ≥ swipeMinPx, |dy| < swipeMaxOffAxisPx, |dx| > swipeAxisRatio·|dy|, swipeMaxMs 안.
 *    쇼 진행 중 발표 모드는 showSwipeMinPx / showSwipeMaxOffAxisPx. 상태줄에서 시작해도 모드 전환.
 *  - 실행 모드 세로 스와이프 = 같은 조건을 세로로(쪽 넘기기).
 *  - 위에서 당기기 = 시작 y < topEdgePx, 아래로 ≥ sheetPullMinPx, |dx| < pullMaxOffAxisPx, pullMaxMs 안.
 *    발표 = 쇼 시트(swipe down), 그 밖(연결 대기 포함) = 시계 설정 화면 요청(takeSettingsRequest).
 *  - 시트가 열려 있으면 모드 스와이프 금지. 시트 위로 쓸기 = 닫기, 설정 행 탭 = 닫기 + 설정 요청, 그 밖 탭 = 코어 tap.
 *  - 에어마우스 중: 움직이지 않고 떼면 tap(왼쪽 클릭). 화면 꺼짐: 버림. 연결 대기: 영역·스와이프 없음.
 */
import { SHEET, hitTest, inRectXY, type HitTarget } from './layout';
import type { CoreState, GestureConfig, InputEvent, Keymap } from './types';

type Kind = 'mode' | 'pull' | 'sheet' | 'air' | 'off';

/** 눌림 표시용(누르는 즉시 강조 — 전송은 뗄 때) */
export interface TouchPress {
  target: HitTarget;
  /** 시트 설정 행을 누르는 중 */
  sheetSettings: boolean;
  /** 누른 시각(ms) — 길게 누름 진행 표시용 */
  t0: number;
}

const waiting = (s: CoreState) => !s.connected && !s.everConnected;

export class TouchGesture {
  private _active = false;
  private kind: Kind = 'mode';
  private x0 = 0;
  private y0 = 0;
  private t0 = 0;
  private x = 0;
  private y = 0;
  private moved = false;
  private longFired = false;
  private canSwipe = true;
  private sheetSettings = false;
  private settingsRequest = false;
  private holdDue = -1;
  /** 이 시간 전에 떼야 탭(누른 대상에 따라 holdMs 또는 blackoutHoldMs) */
  private tapLimit = 600;
  private target: HitTarget = { kind: 'none' };

  get active(): boolean {
    return this._active;
  }

  /** 이번 손가락이 움직였나(12px 이상) — 화면 쪽 눌림 표시 취소용 */
  get isMoved(): boolean {
    return this.moved;
  }

  /** 길게 누름이 대기 중이면 그 시각(ms), 아니면 -1 — 시뮬레이터가 타이머를 맞추는 데 쓴다 */
  get holdAt(): number {
    return this.holdDue;
  }

  /** 시계 설정 화면 열기 요청. 읽으면 지워진다 */
  takeSettingsRequest(): boolean {
    const r = this.settingsRequest;
    this.settingsRequest = false;
    return r;
  }

  press(): TouchPress | null {
    if (!this._active || this.moved || this.longFired) return null;
    if (this.kind === 'sheet') return { target: this.target, sheetSettings: this.sheetSettings, t0: this.t0 };
    if (this.kind !== 'mode') return null;
    return { target: this.target, sheetSettings: false, t0: this.t0 };
  }

  /** 손가락 샘플 하나. touching=false 는 손을 뗌. 반환 = 코어에 dispatch 할 입력 */
  sample(touching: boolean, x: number, y: number, t: number, s: CoreState, km: Keymap, g: GestureConfig): InputEvent[] {
    const out: InputEvent[] = [];
    if (touching) {
      if (!this._active) this.down(x, y, t, s, km, g);
      else this.move(x, y, g);
    }
    out.push(...this.poll(t));
    if (!touching && this._active) this.up(t, s, g, out);
    return out;
  }

  /** 누르고 있는 동안 주기적으로(길게 누름 시각 판정) */
  poll(t: number): InputEvent[] {
    if (this._active && this.holdDue >= 0 && t >= this.holdDue) {
      this.holdDue = -1;
      if (!this.moved) {
        this.longFired = true;
        return [{ t: 'longPress', x: this.x0, y: this.y0 }];
      }
    }
    return [];
  }

  /** 포인터 취소(창 밖 등): 아무것도 보내지 않고 끝낸다 */
  cancel(): void {
    this._active = false;
    this.holdDue = -1;
  }

  private down(x: number, y: number, t: number, s: CoreState, km: Keymap, g: GestureConfig): void {
    this._active = true;
    this.kind = 'mode';
    this.x0 = this.x = x;
    this.y0 = this.y = y;
    this.t0 = t;
    this.moved = false;
    this.longFired = false;
    this.sheetSettings = false;
    this.holdDue = -1;
    this.tapLimit = g.touch.holdMs;
    this.target = { kind: 'none' };
    this.canSwipe = !s.air.active && !s.sheet.open && !waiting(s);

    if (!s.screenOn) {
      this.kind = 'off';
      return;
    }
    if (s.air.active) {
      this.kind = 'air';
      return;
    }
    if (s.sheet.open && s.mode === 'present') {
      this.kind = 'sheet';
      this.sheetSettings = inRectXY(x, y, SHEET.settingsRow);
      if (!this.sheetSettings) this.target = hitTest(s.mode, true, x, y, km, s.apps.launch, s.launchPage);
      return;
    }
    if (y < g.touch.topEdgePx) {
      this.kind = 'pull';
      return;
    }
    if (waiting(s)) return;
    const hit = hitTest(s.mode, false, x, y, km, s.apps.launch, s.launchPage);
    this.target = hit;
    if (hit.kind === 'presentZone' && hit.zone === 'center') {
      this.tapLimit = g.touch.blackoutHoldMs; // 암전만 짧게(실기 피드백 5)
      this.holdDue = t + g.touch.blackoutHoldMs;
    } else if (hit.kind === 'meetingTile' || hit.kind === 'launchTile') {
      this.holdDue = t + g.touch.holdMs;
    }
  }

  private move(x: number, y: number, g: GestureConfig): void {
    this.x = x;
    this.y = y;
    if (!this.moved && Math.hypot(x - this.x0, y - this.y0) >= g.touch.tapMaxMovePx) {
      this.moved = true;
      this.holdDue = -1;
    }
  }

  private up(t: number, s: CoreState, g: GestureConfig, out: InputEvent[]): void {
    this._active = false;
    this.holdDue = -1;
    const tc = g.touch;
    const dx = this.x - this.x0;
    const dy = this.y - this.y0;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const dt = t - this.t0;
    const isTap = !this.moved && !this.longFired && dt < this.tapLimit;
    const showRun = s.mode === 'present' && s.show.running;
    const minH = showRun ? tc.showSwipeMinPx : tc.swipeMinPx;
    const offH = showRun ? tc.showSwipeMaxOffAxisPx : tc.swipeMaxOffAxisPx;
    const swipeH = ax >= minH && ay < offH && ax > tc.swipeAxisRatio * ay && dt <= tc.swipeMaxMs;
    const swipeV = ay >= tc.swipeMinPx && ax < tc.swipeMaxOffAxisPx && ay > tc.swipeAxisRatio * ax && dt <= tc.swipeMaxMs;
    const pullOk = ax < tc.pullMaxOffAxisPx && dt <= tc.pullMaxMs;
    const pullDown = dy >= tc.sheetPullMinPx && pullOk;
    const pullUp = -dy >= tc.sheetPullMinPx && pullOk;
    const tap: InputEvent = { t: 'tap', x: this.x0, y: this.y0 };

    switch (this.kind) {
      case 'off':
        return;
      case 'air':
        if (!this.moved) out.push(tap);
        return;
      case 'sheet':
        if (pullUp) {
          out.push({ t: 'swipe', dir: 'up' });
        } else if (!this.moved) {
          if (this.sheetSettings) {
            out.push({ t: 'swipe', dir: 'up' });
            this.settingsRequest = true;
          } else {
            out.push(tap);
          }
        }
        return;
      case 'pull':
        if (pullDown) {
          if (s.mode === 'present' && !waiting(s)) out.push({ t: 'swipe', dir: 'down' });
          else this.settingsRequest = true;
          return;
        }
        if (this.canSwipe && swipeH) {
          out.push({ t: 'swipe', dir: dx < 0 ? 'left' : 'right' });
          return;
        }
        if (isTap && !waiting(s)) out.push(tap);
        return;
      case 'mode': {
        if (this.canSwipe && swipeH) {
          out.push({ t: 'swipe', dir: dx < 0 ? 'left' : 'right' });
          return;
        }
        if (s.mode === 'launch' && this.canSwipe && swipeV) {
          out.push({ t: 'swipe', dir: dy < 0 ? 'up' : 'down' });
          return;
        }
        const tg = this.target;
        if (tg.kind === 'launchTile') {
          if (!this.moved && !this.longFired) out.push(tap);
          return;
        }
        if (!isTap) return;
        if (
          (tg.kind === 'presentZone' && tg.zone !== 'center') ||
          tg.kind === 'launchDots' ||
          tg.kind === 'meetingChip' ||
          tg.kind === 'meetingTile'
        ) {
          out.push(tap);
        }
        return;
      }
    }
  }
}
