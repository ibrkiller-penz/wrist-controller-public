/**
 * 손목 튕김(flick) 검출기 — 순수 함수. 근거: docs/research/web-and-algorithms.md 4.2 (설계 제안).
 *
 * 판정 순서(샘플마다):
 *  1. 세 축에 시간 기반 EMA 전처리(prefilterTauMs).
 *  2. 판정 축(flick.axis → imu.axisMap/axisSign) 값 r, 나머지 두 축 합성 크기 off.
 *  3. 재인식 금지(cooldownUntil) 중이면 판정하지 않는다.
 *  4. idle: |r| >= 임계값(고정 peakThresholdDps 와 최근 adaptive.windowMs RMS×배수 중 큰 값) 이면
 *       |r| < axisDominanceRatio×off → notDominant,
 *       [t-guardMs-windowMs, t-guardMs) 구간 RMS >= quietBefore.maxRmsDps → notQuiet (guard = 튕김 상승부 제외),
 *       아니면 above 진입(부호 sign 기억).
 *  5. above: 같은 부호로 임계값 이상이면 피크 갱신. 진입 후 maxAboveMs 초과 → tooLong(천천히 크게 돌리기).
 *       임계값 아래로 내려온 첫 샘플에서 지속시간 = t - aboveStart. minAboveMs 미만 → tooShort.
 *       rebound.required 가 아니면 즉시 인식, 맞으면 rebound 로.
 *  6. rebound: 피크 후 rebound.windowMs 안에 반대 방향으로 max(minRatio×피크, minDps) 이상 → 인식.
 *       시간 초과 → noRebound.
 *  7. blocked: 거부된 뒤 |r| 이 임계값 아래로 내려올 때까지 다시 판정하지 않는다.
 *  인식: 방향 = sign×outwardSign > 0 ? 'out'(다음) : 'in'(이전). cooldownUntil = t + cooldownMs, 히스토리 비움.
 *  히스토리(세 축 제곱합)는 판정 뒤에 현재 샘플을 넣고, 재인식 금지 중에는 넣지 않는다.
 */
import { axisIndex, emaAlpha } from './imu';
import type { AccelFlickState, FlickReject, FlickState, GestureConfig, ImuSample, LogicalAxis } from './types';

export function initFlick(cooldownUntil = -Infinity): FlickState {
  return {
    filt: null,
    lastT: null,
    hist: [],
    phase: 'idle',
    sign: 1,
    threshold: 0,
    aboveStart: 0,
    peak: 0,
    peakT: 0,
    reboundNeed: 0,
    cooldownUntil,
    acc: initAccelFlick(),
  };
}

export function initAccelFlick(): AccelFlickState {
  return { lpf: null, lastT: null, hist: [], phase: 'idle', aboveStart: 0, peak: 0 };
}

export interface FlickResult {
  state: FlickState;
  fired: 'out' | 'in' | null;
  rejected: FlickReject | null;
  /** 재인식 금지 중에 임계값을 넘는 움직임이 시작됨(로그용) */
  cooldownHit: boolean;
  /** accel 방식: 인식·기각된 움직임의 hp 피크(g, 실기 튜닝 로그용) */
  peakG?: number;
}

/** hist 중 [from, to) 구간 RMS. 표본이 없으면 0 */
function rms(hist: readonly [number, number][], from: number, to: number): number {
  let sum = 0;
  let n = 0;
  for (const [t, sq] of hist) {
    if (t >= from && t < to) {
      sum += sq;
      n++;
    }
  }
  return n === 0 ? 0 : Math.sqrt(sum / n);
}

const OTHERS: Record<number, [number, number]> = { 0: [1, 2], 1: [0, 2], 2: [0, 1] };

/**
 * accel 방식(기본, 실기 피드백 9): 중력 제거 가속도 크기 hp = |a − LPF(a)|(LPF = 시간 기반 EMA, 시정수 accel.lpfTauMs).
 *  - 재인식 금지(cooldownUntil) 중: hp ≥ peakG 면 cooldownHit 한 번(blocked), 히스토리는 쌓지 않는다.
 *  - idle: hp ≥ peakG → 피크 전 [t−guard−window, t−guard) hp RMS > quietMaxRmsG 면 notQuiet 기각, 아니면 above.
 *  - above: hp ≥ peakG 동안 피크 갱신, maxAboveMs 를 넘기면 tooLong 기각(긴 흔들기). 임계값 아래로 내려오면 인식.
 *  - blocked: hp < peakG 가 될 때까지 판정하지 않는다.
 *  인식은 방향이 없다 → 항상 'out'(다음). 가속도가 없는 샘플은 판정하지 않는다.
 */
function accelFlickStep(st: FlickState, s: ImuSample, cfg: GestureConfig): FlickResult {
  const f = cfg.flick;
  const c = f.accel;
  const acc: AccelFlickState = { ...st.acc, hist: st.acc.hist.slice() };
  const out: FlickResult = { state: { ...st, acc }, fired: null, rejected: null, cooldownHit: false };
  if (s.ax === undefined || s.ay === undefined || s.az === undefined) return out;
  const t = s.t;
  const a: [number, number, number] = [s.ax, s.ay, s.az];
  const dt = acc.lastT === null ? 0 : t - acc.lastT;
  const al = emaAlpha(dt, c.lpfTauMs);
  const lpf: [number, number, number] =
    acc.lpf === null ? [a[0], a[1], a[2]] : [acc.lpf[0] + al * (a[0] - acc.lpf[0]), acc.lpf[1] + al * (a[1] - acc.lpf[1]), acc.lpf[2] + al * (a[2] - acc.lpf[2])];
  acc.lpf = lpf;
  acc.lastT = t;
  const hp = Math.hypot(a[0] - lpf[0], a[1] - lpf[1], a[2] - lpf[2]);
  const thr = c.peakG;
  const reject = (why: FlickReject) => {
    out.rejected = why;
    out.peakG = acc.peak;
    acc.phase = hp >= thr ? 'blocked' : 'idle';
  };
  if (t < st.cooldownUntil) {
    if (acc.phase !== 'blocked') {
      if (hp >= thr) {
        out.cooldownHit = true;
        acc.phase = 'blocked';
      } else {
        acc.phase = 'idle';
      }
    } else if (hp < thr) {
      acc.phase = 'idle';
    }
  } else {
    switch (acc.phase) {
      case 'idle':
        if (hp >= thr) {
          acc.peak = hp;
          if (rms(acc.hist, t - c.quietGuardMs - c.quietWindowMs, t - c.quietGuardMs) > c.quietMaxRmsG) {
            reject('notQuiet');
          } else {
            acc.phase = 'above';
            acc.aboveStart = t;
          }
        }
        break;
      case 'above':
        if (hp >= thr) {
          if (hp > acc.peak) acc.peak = hp;
          if (t - acc.aboveStart > c.maxAboveMs) reject('tooLong');
        } else {
          out.fired = 'out';
          out.peakG = acc.peak;
          out.state.cooldownUntil = t + f.cooldownMs;
          acc.phase = 'idle';
          acc.hist = [];
        }
        break;
      case 'blocked':
        if (hp < thr) acc.phase = 'idle';
        break;
    }
  }
  if (t >= out.state.cooldownUntil) acc.hist.push([t, hp * hp]);
  let cut = 0;
  while (cut < acc.hist.length && acc.hist[cut][0] < t - c.quietWindowMs - c.quietGuardMs) cut++;
  if (cut > 0) acc.hist.splice(0, cut);
  return out;
}

export function flickStep(prev: FlickState, s: ImuSample, cfg: GestureConfig): FlickResult {
  if ((cfg.flick.detector ?? 'accel') === 'accel') return accelFlickStep(prev, s, cfg);
  const f = cfg.flick;
  const st: FlickState = { ...prev, hist: prev.hist.slice() };
  const t = s.t;
  const raw: [number, number, number] = [s.gx, s.gy, s.gz];

  // 1. 전처리
  const dt = st.lastT === null ? 0 : t - st.lastT;
  const a = emaAlpha(dt, f.prefilterTauMs);
  const filt: [number, number, number] =
    st.filt === null
      ? [raw[0], raw[1], raw[2]]
      : [st.filt[0] + a * (raw[0] - st.filt[0]), st.filt[1] + a * (raw[1] - st.filt[1]), st.filt[2] + a * (raw[2] - st.filt[2])];
  st.filt = filt;
  st.lastT = t;

  // 2. 판정 축
  const axis: LogicalAxis = f.axis;
  const idx = axisIndex(axis, cfg.imu);
  const r = filt[idx] * cfg.imu.axisSign[axis];
  const [o1, o2] = OTHERS[idx];
  const off = Math.sqrt(filt[o1] * filt[o1] + filt[o2] * filt[o2]);
  const abs = Math.abs(r);
  const sgn: 1 | -1 = r >= 0 ? 1 : -1;

  let fired: 'out' | 'in' | null = null;
  let rejected: FlickReject | null = null;
  let cooldownHit = false;

  const fire = () => {
    fired = st.sign * f.outwardSign > 0 ? 'out' : 'in';
    st.cooldownUntil = t + f.cooldownMs;
    st.phase = 'idle';
    st.hist = []; // 인식된 튕김 자체는 배경 움직임으로 치지 않는다
  };
  const reject = (why: FlickReject) => {
    rejected = why;
    st.phase = abs >= st.threshold ? 'blocked' : 'idle';
  };

  if (t < st.cooldownUntil) {
    // 3. 재인식 금지 중
    if (st.phase !== 'blocked') {
      if (abs >= f.peakThresholdDps) {
        cooldownHit = true;
        st.phase = 'blocked';
        st.threshold = f.peakThresholdDps;
      } else {
        st.phase = 'idle';
      }
    } else if (abs < st.threshold) {
      st.phase = 'idle';
    }
  } else {
    switch (st.phase) {
      case 'idle': {
        let thr = f.peakThresholdDps;
        if (f.adaptive.enabled) thr = Math.max(thr, rms(st.hist, t - f.adaptive.windowMs, t) * f.adaptive.rmsMultiplier);
        if (abs >= thr) {
          st.threshold = thr;
          if (abs < f.axisDominanceRatio * off) {
            reject('notDominant');
          } else if (
            rms(st.hist, t - f.quietBefore.guardMs - f.quietBefore.windowMs, t - f.quietBefore.guardMs) >= f.quietBefore.maxRmsDps
          ) {
            reject('notQuiet');
          } else {
            st.phase = 'above';
            st.sign = sgn;
            st.aboveStart = t;
            st.peak = abs;
            st.peakT = t;
          }
        }
        break;
      }
      case 'above': {
        if (sgn === st.sign && abs >= st.threshold) {
          if (abs > st.peak) {
            st.peak = abs;
            st.peakT = t;
          }
          if (t - st.aboveStart > f.maxAboveMs) reject('tooLong');
        } else {
          const dur = t - st.aboveStart;
          if (dur < f.minAboveMs) {
            reject('tooShort');
          } else if (!f.rebound.required) {
            fire();
          } else {
            st.phase = 'rebound';
            st.reboundNeed = Math.max(f.rebound.minRatio * st.peak, f.rebound.minDps);
            if (-st.sign * r >= st.reboundNeed) fire();
          }
        }
        break;
      }
      case 'rebound': {
        if (-st.sign * r >= st.reboundNeed) fire();
        else if (t - st.peakT > f.rebound.windowMs) reject('noRebound');
        break;
      }
      case 'blocked': {
        if (abs < st.threshold) st.phase = 'idle';
        break;
      }
    }
  }

  // 히스토리 갱신(현재 샘플은 판정 뒤에 넣는다 = 판정 구간은 [t-window, t)).
  // 재인식 금지 중(인식 직후 포함)에는 쌓지 않는다 — 연달아 튕긴 동작이 배경 RMS 를 올려 다음 튕김을 막지 않게.
  if (t >= st.cooldownUntil) st.hist.push([t, filt[0] * filt[0] + filt[1] * filt[1] + filt[2] * filt[2]]);
  const keep = Math.max(f.adaptive.windowMs, f.quietBefore.windowMs);
  let cut = 0;
  while (cut < st.hist.length && st.hist[cut][0] < t - keep) cut++;
  if (cut > 0) st.hist.splice(0, cut);

  return { state: st, fired, rejected, cooldownHit };
}
