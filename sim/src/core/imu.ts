/**
 * IMU 전처리 — 자이로 영점(bias) 추적과 논리 축(yaw/pitch/roll) 꺼내기.
 * 펌웨어 C++ 도 같은 수식을 쓴다(README: /shared/test-vectors/README.md "알고리즘" 절).
 */
import type { BiasState, GestureConfig, ImuSample, LogicalAxis } from './types';

export function initBias(): BiasState {
  return { bias: [0, 0, 0], stillSince: null, lastT: null };
}

/** 시간 기반 EMA 계수. dt<=0 이거나 tau<=0 이면 1(즉시 따라감) */
export function emaAlpha(dtMs: number, tauMs: number): number {
  if (dtMs <= 0 || tauMs <= 0) return 1;
  return 1 - Math.exp(-dtMs / tauMs);
}

/**
 * 영점 추적: 세 축 모두 |g - bias| < stillThresholdDps 상태가 stillMs 이상 이어지면
 * bias 를 시정수 trackTauMs 로 아주 천천히 따라간다. 보정된 샘플을 돌려준다.
 */
export function biasStep(
  st: BiasState,
  s: ImuSample,
  cfg: GestureConfig['imu']['biasCalib'],
): { state: BiasState; out: ImuSample } {
  const raw: [number, number, number] = [s.gx, s.gy, s.gz];
  if (!cfg.enabled) {
    return { state: { ...st, lastT: s.t }, out: { ...s } };
  }
  const dt = st.lastT === null ? 0 : s.t - st.lastT;
  const bias: [number, number, number] = [st.bias[0], st.bias[1], st.bias[2]];
  const still = raw.every((v, i) => Math.abs(v - bias[i]) < cfg.stillThresholdDps);
  let stillSince = st.stillSince;
  if (still) {
    if (stillSince === null) stillSince = s.t;
    if (s.t - stillSince >= cfg.stillMs) {
      const a = emaAlpha(dt, cfg.trackTauMs);
      for (let i = 0; i < 3; i++) bias[i] += a * (raw[i] - bias[i]);
    }
  } else {
    stillSince = null;
  }
  return {
    state: { bias, stillSince, lastT: s.t },
    out: { t: s.t, gx: raw[0] - bias[0], gy: raw[1] - bias[1], gz: raw[2] - bias[2] },
  };
}

const AXIS_INDEX = { gx: 0, gy: 1, gz: 2 } as const;

/** 센서 축 배열 [gx,gy,gz] 에서 논리 축 값(axisSign 적용) */
export function logicalAxis(v: readonly [number, number, number], axis: LogicalAxis, imu: GestureConfig['imu']): number {
  return v[AXIS_INDEX[imu.axisMap[axis]]] * imu.axisSign[axis];
}

/** 논리 축이 쓰는 센서 축 인덱스(0..2) */
export function axisIndex(axis: LogicalAxis, imu: GestureConfig['imu']): number {
  return AXIS_INDEX[imu.axisMap[axis]];
}
