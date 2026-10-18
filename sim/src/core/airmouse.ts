/**
 * 에어마우스 필터 — 자이로 각속도(deg/s) → 커서 이동(px). 순수 함수.
 * 근거: docs/research/web-and-algorithms.md 3.3 (설계 제안).
 *
 * 축: 커서 X ← yaw, 커서 Y ← pitch (imu.axisMap/axisSign 적용, invertY 면 Y 부호 반전). roll 은 쓰지 않는다(튕김 축).
 * 축마다(샘플 시각 t, 직전 시각과의 dt):
 *   1. 시작 후 startSuppressMs 동안은 출력 0, 필터도 건드리지 않는다(누르는 동작의 흔들림 제거).
 *   2. 히스테리시스 데드존: 정지 중 |w| >= enter 면 움직임 시작, 움직이는 중 |w| < exit 면 정지.
 *      움직이는 중 w' = sign(w)·(|w| - exit), 정지 중 w' = 0.
 *   3. EMA: ema += α(w' - ema), α = 1 - exp(-dt/lowpassTauMs). |ema| < 0.01 이면 0 으로 스냅.
 *   4. 곡선: v(px/s) = gain · sign(ema) · |ema|^exponent,  d = v·dt/1000, |d| <= maxPxPerReport 로 자름.
 *   5. 잔여 누적: resid += d; out = trunc(resid)(0 쪽으로 버림); resid -= out.
 *   out 이 두 축 모두 0 이면 보고하지 않는다.
 * 버튼을 놓으면(stop) 상태 전체를 0 으로 리셋 → 즉시 정지, 잔여·필터가 남아 흐르지 않는다.
 */
import { logicalAxis } from './imu';
import type { AirAxisState, AirMouseState, GestureConfig, ImuSample } from './types';

const zeroAxis = (): AirAxisState => ({ moving: false, ema: 0, resid: 0 });

export function initAirMouse(): AirMouseState {
  return { active: false, since: 0, lastT: null, x: zeroAxis(), y: zeroAxis() };
}

/** 에어마우스 시작(버튼 누름 유지 판정 시점) */
export function airStart(now: number): AirMouseState {
  return { active: true, since: now, lastT: null, x: zeroAxis(), y: zeroAxis() };
}

/** 에어마우스 정지 — 필터·잔여 전부 리셋 */
export function airStop(): AirMouseState {
  return initAirMouse();
}

function axisStep(
  st: AirAxisState,
  w: number,
  dt: number,
  gain: number,
  cfg: GestureConfig['airMouse'],
): { st: AirAxisState; out: number } {
  const dz = cfg.deadzoneDps;
  let moving = st.moving;
  const aw = Math.abs(w);
  if (!moving && aw >= dz.enter) moving = true;
  else if (moving && aw < dz.exit) moving = false;
  const wp = moving ? Math.sign(w) * (aw - dz.exit) : 0;

  const alpha = dt <= 0 || cfg.lowpassTauMs <= 0 ? 1 : 1 - Math.exp(-dt / cfg.lowpassTauMs);
  let ema = st.ema + alpha * (wp - st.ema);
  if (Math.abs(ema) < 0.01) ema = 0;

  let d = (gain * Math.sign(ema) * Math.pow(Math.abs(ema), cfg.curve.exponent) * dt) / 1000;
  const cap = cfg.curve.maxPxPerReport;
  if (d > cap) d = cap;
  else if (d < -cap) d = -cap;

  let resid = st.resid + d;
  const out = Math.trunc(resid);
  resid -= out;
  return { st: { moving, ema, resid }, out };
}

export interface AirResult {
  state: AirMouseState;
  dx: number;
  dy: number;
  /** 데드존을 넘은 움직임이 있었나(잠금 길게 누름 취소 판정용) */
  moving: boolean;
}

/**
 * 샘플 하나 처리. 비활성이면 그대로 0.
 * @param sensitivity gesture.airMouse.sensitivity 인덱스(0..2)
 */
export function airStep(prev: AirMouseState, s: ImuSample, cfg: GestureConfig, sensitivity: number): AirResult {
  if (!prev.active) return { state: prev, dx: 0, dy: 0, moving: false };
  const am = cfg.airMouse;
  if (s.t - prev.since < am.startSuppressMs) {
    // 억제 구간: 시각만 기록하지 않는다(억제가 끝난 첫 샘플은 dt=0 으로 시작)
    return { state: prev, dx: 0, dy: 0, moving: false };
  }
  const dt = prev.lastT === null ? 0 : s.t - prev.lastT;
  const levels = am.sensitivity;
  const lvl = Math.min(Math.max(Math.round(sensitivity), 0), levels.length - 1);
  const gain = levels[lvl]?.gain ?? 1;
  const v: [number, number, number] = [s.gx, s.gy, s.gz];
  const wx = logicalAxis(v, 'yaw', cfg.imu);
  const wy = logicalAxis(v, 'pitch', cfg.imu) * (am.invertY ? -1 : 1);
  const rx = axisStep(prev.x, wx, dt, gain, am);
  const ry = axisStep(prev.y, wy, dt, gain, am);
  return {
    state: { active: true, since: prev.since, lastT: s.t, x: rx.st, y: ry.st },
    dx: rx.out,
    dy: ry.out,
    moving: rx.st.moving || ry.st.moving,
  };
}
