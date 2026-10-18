/**
 * 손목 움직임(IMU) 입력원 — 담당: input 모듈 (src/input/*).
 * 근거: docs/research/web-and-algorithms.md 2장 (폰은 DeviceMotionEvent.rotationRate = deg/s 를 주 입력으로),
 *       design/simulator-layout.md 4.4 (손목 움직임 패널).
 *
 * 계약 (sim/ARCHITECTURE.md 6장 — 시그니처는 바꾸지 않고, 선택 인자·추가 필드만 더했다)
 *  - 모든 입력원은 ImuSource 를 돌려주고, 샘플을 app.imu({t, gx, gy, gz, ax, ay, az}) 로 넣는다.
 *    t 는 app.now() 와 같은 기준(performance.now ms, 단조 증가). g* 는 센서 축 각속도 deg/s,
 *    a* 는 센서 축 가속도 g(중력 포함) — 기본 accel 방식 튕김 판정(hp = |a − LPF(a)|)에 쓴다. 가속도가 없는 샘플은 accel 방식으로 판정되지 않는다.
 *    논리 축(yaw/pitch/roll) 변환·바이어스 제거·튕김/에어마우스 판정은 코어가 한다 — 여기서는 원시 값만 만든다.
 *
 * 드래그 패드 축 결정(입력 모듈 담당 결정 — README.md 에도 기록)
 *  - 세로 드래그 dy → gx (pitch, 기본 axisMap 기준). 아래로 끌면 +.
 *  - 가로 드래그 dx → 'auto' 일 때:
 *      측면 버튼을 누르고 있으면(state.button ≠ null, 에어마우스 중 포함) gz (yaw = 포인터 좌우)
 *      그 밖에는 gy (roll = 튕김 축). 오른쪽으로 끌면 + (= 바깥 튕김 = 다음, outwardSign 1 기준)
 *    Shift 를 누른 채 끌면 위 선택을 뒤집는다. 패널에서 'roll' / 'yaw' 고정도 고를 수 있다.
 *  - 속도 → 각속도: 최근 30ms 창의 포인터 이동 속도(px/s) × DRAG_DPS_PER_PX_S(0.5).
 *    예) 80px 를 80ms 에 휙 = 1000px/s → 500°/s (튕김 임계 300°/s 초과), 천천히 200px/s → 100°/s.
 *  - 샘플링: 누르고 있는 동안 10ms(100Hz, gesture.json imu.sampleRateHz 와 같은 간격)마다, 놓은 뒤 300ms 동안 0 샘플.
 *  - 가속도(ax, ay, az, g): 중력 az = 1 g 고정 + 각속도 변화에 비례하는 선가속도(접선 가속도 ∝ dω/dt 흉내).
 *    d = ω − EMA(ω, 시정수 DRAG_ACC_TAU_MS 40ms) (가로 → ax, 세로 → ay), 크기 m = |d| × DRAG_G_PER_DPS(1/150 g per °/s),
 *    m < 1 g 이면 m² 로 누른다(천천히 끌 때 포인터 속도 흔들림 억제), 8 g 로 자른다. 방향은 d 방향.
 *    가속할 때 +, 멈출 때 − 의 두 봉우리(실기 튕김 파형과 같은 모양 — 두 번째 봉우리는 재인식 금지에 걸린다).
 *    예) 휙 80px/80ms(500°/s 까지 ~50ms 에 오름) → d ≈ 350°/s → 약 2.3 g (accel 임계 1.0 g 위 → 튕김),
 *        천천히 200px/s(100°/s 까지 0.3초에 걸쳐) → d ≈ 15°/s → 0.01 g 수준 (무시), 흔들림으로 d 가 50°/s 튀어도 0.11 g.
 */
import type { App } from '../app';
import type { ImuSample } from '../core/types';

export type ImuSourceKind = 'drag' | 'phone' | 'replay';

export interface ImuSource {
  readonly kind: ImuSourceKind;
  readonly running: boolean;
  start(): void | Promise<void>;
  stop(): void;
}

/** 드래그 속도(px/s) → 각속도(deg/s) 배율 */
export const DRAG_DPS_PER_PX_S = 0.5;
/** 드래그 패드 샘플 간격(ms) */
export const DRAG_SAMPLE_MS = 10;
/** 속도 계산 창(ms) */
const DRAG_VEL_WINDOW_MS = 30;
/** 놓은 뒤 0 샘플을 보내는 시간(ms) — 필터가 0 으로 가라앉는 것을 확인하려고 */
const DRAG_TAIL_MS = 300;
/** 드래그 합성 가속도: 각속도 변화(ω − EMA(ω)) 1°/s 당 g */
export const DRAG_G_PER_DPS = 1 / 150;
/** 드래그 합성 가속도: 각속도 EMA 시정수(ms) */
export const DRAG_ACC_TAU_MS = 40;
/** 합성 선가속도 상한(g, 센서 ±16 g 범위 안) */
const DRAG_G_MAX = 8;

/**
 * 드래그 각속도 → 가속도 합성기(상태 있음). step(t, h, v): h = 가로 각속도(roll 또는 yaw), v = 세로(pitch), deg/s.
 * 반환 ax/ay/az 는 g(중력 az = 1 포함). 순수 계산이라 테스트에서 직접 쓴다.
 */
export function createDragAccel(): { step(t: number, h: number, v: number): { ax: number; ay: number; az: number }; reset(): void } {
  let sh = 0;
  let sv = 0;
  let lastT: number | null = null;
  const clip = (x: number) => Math.max(-DRAG_G_MAX, Math.min(DRAG_G_MAX, x));
  return {
    step(t, h, v) {
      const al = lastT === null ? 0 : 1 - Math.exp(-Math.max(0, t - lastT) / DRAG_ACC_TAU_MS);
      lastT = t;
      sh += al * (h - sh);
      sv += al * (v - sv);
      const dh = h - sh;
      const dv = v - sv;
      const lin = Math.hypot(dh, dv) * DRAG_G_PER_DPS;
      if (lin === 0) return { ax: 0, ay: 0, az: 1 };
      // 1 g 아래는 제곱으로 눌러 천천히 끌 때의 포인터 속도 흔들림(이벤트 간격 잡음)이 가속도로 번지지 않게
      const k = clip(lin < 1 ? lin * lin : lin) / lin;
      return { ax: round3(dh * DRAG_G_PER_DPS * k), ay: round3(dv * DRAG_G_PER_DPS * k), az: 1 };
    },
    reset() {
      sh = 0;
      sv = 0;
      lastT = null;
    },
  };
}

export type DragHorizontalAxis = 'auto' | 'roll' | 'yaw';

export interface DragSource extends ImuSource {
  readonly kind: 'drag';
  /** 가로 드래그가 만들 축 */
  horizontal: DragHorizontalAxis;
  /** 마지막으로 보낸 샘플(표시용) */
  readonly last: ImuSample | null;
}

// ---------------------------------------------------------------------------
// 1. 마우스 드래그 패드
// ---------------------------------------------------------------------------

export function createDragSource(
  app: App,
  pad: HTMLElement,
  opts: { dpsPerPxS?: number; horizontal?: DragHorizontalAxis } = {},
): DragSource {
  const k = opts.dpsPerPxS ?? DRAG_DPS_PER_PX_S;
  let running = false;
  let horizontal: DragHorizontalAxis = opts.horizontal ?? 'auto';
  let last: ImuSample | null = null;

  let pointerId: number | null = null;
  let shift = false;
  let origin = { x: 0, y: 0 };
  /** (시각 ms, x, y) — 최근 포인터 위치 */
  let hist: { t: number; x: number; y: number }[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let tailUntil = 0;
  let lastT = -Infinity;
  const accel = createDragAccel();

  const setKnob = (dx: number, dy: number) => {
    const r = pad.getBoundingClientRect();
    const mx = r.width / 2 - 12;
    const my = r.height / 2 - 12;
    pad.style.setProperty('--in-knob-x', `${Math.max(-mx, Math.min(mx, dx))}px`);
    pad.style.setProperty('--in-knob-y', `${Math.max(-my, Math.min(my, dy))}px`);
  };

  const velocity = (now: number): { vx: number; vy: number } => {
    if (pointerId === null || hist.length === 0) return { vx: 0, vy: 0 };
    const cur = hist[hist.length - 1];
    const from = now - DRAG_VEL_WINDOW_MS;
    // 창 안에 움직임이 없으면(마지막 위치가 창 시작보다 오래됨) 속도 0 — 멈추면 바로 0 이 되어 흐르지 않는다
    if (cur.t <= from) return { vx: 0, vy: 0 };
    // from 시각의 위치(선형 보간). 기록이 창보다 짧으면 가장 오래된 점
    let past = hist[0];
    for (let i = hist.length - 1; i > 0; i--) {
      const a = hist[i - 1];
      const b = hist[i];
      if (a.t <= from && b.t >= from) {
        const u = b.t === a.t ? 1 : (from - a.t) / (b.t - a.t);
        past = { t: from, x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
        break;
      }
    }
    const span = Math.max(DRAG_SAMPLE_MS, now - past.t);
    return { vx: ((cur.x - past.x) / span) * 1000, vy: ((cur.y - past.y) / span) * 1000 };
  };

  const horizontalIsYaw = (): boolean => {
    let yaw = horizontal === 'yaw' || (horizontal === 'auto' && (app.state.button !== null || app.state.air.active));
    if (shift) yaw = !yaw;
    return yaw;
  };

  const tick = () => {
    const now = app.now();
    if (pointerId === null && now > tailUntil) {
      stopTimer();
      return;
    }
    const t = Math.max(now, lastT + 0.001);
    lastT = t;
    const { vx, vy } = velocity(now);
    const h = round2(vx * k);
    const v = round2(vy * k);
    const yaw = horizontalIsYaw();
    const sample: ImuSample = { t, gx: v, gy: yaw ? 0 : h, gz: yaw ? h : 0, ...accel.step(t, h, v) };
    last = sample;
    app.imu(sample);
    // 오래된 포인터 기록 정리
    const keep = now - 200;
    while (hist.length > 2 && hist[1].t < keep) hist.shift();
  };

  const startTimer = () => {
    if (timer === null) timer = setInterval(tick, DRAG_SAMPLE_MS);
  };
  const stopTimer = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  const record = (e: PointerEvent) => {
    const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const evs = list.length > 0 ? list : [e];
    for (const c of evs) {
      // 이벤트 timeStamp 는 performance.now 와 같은 기준. app.now() 와 어긋나지 않게 미래 값은 자른다
      const t = Math.min(c.timeStamp || app.now(), app.now());
      hist.push({ t, x: c.clientX, y: c.clientY });
    }
    setKnob(e.clientX - origin.x, e.clientY - origin.y);
  };

  const onDown = (e: PointerEvent) => {
    if (!running || pointerId !== null) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    pointerId = e.pointerId;
    shift = e.shiftKey;
    try {
      pad.setPointerCapture(e.pointerId);
    } catch {
      /* 무시 */
    }
    origin = { x: e.clientX, y: e.clientY };
    hist = [{ t: app.now(), x: e.clientX, y: e.clientY }];
    pad.dataset.dragging = 'true';
    startTimer();
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    shift = e.shiftKey;
    record(e);
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    hist = [];
    delete pad.dataset.dragging;
    setKnob(0, 0);
    tailUntil = app.now() + DRAG_TAIL_MS;
  };

  return {
    kind: 'drag',
    get running() {
      return running;
    },
    get horizontal() {
      return horizontal;
    },
    set horizontal(v: DragHorizontalAxis) {
      horizontal = v;
    },
    get last() {
      return last;
    },
    start() {
      if (running) return;
      running = true;
      pad.addEventListener('pointerdown', onDown);
      pad.addEventListener('pointermove', onMove);
      pad.addEventListener('pointerup', onUp);
      pad.addEventListener('pointercancel', onUp);
      pad.addEventListener('lostpointercapture', onUp);
      setKnob(0, 0);
    },
    stop() {
      if (!running) return;
      running = false;
      pad.removeEventListener('pointerdown', onDown);
      pad.removeEventListener('pointermove', onMove);
      pad.removeEventListener('pointerup', onUp);
      pad.removeEventListener('pointercancel', onUp);
      pad.removeEventListener('lostpointercapture', onUp);
      pointerId = null;
      hist = [];
      delete pad.dataset.dragging;
      setKnob(0, 0);
      // 멈출 때 0 샘플 하나 — 마지막 값이 남지 않게
      stopTimer();
      const t = Math.max(app.now(), lastT + 0.001);
      lastT = t;
      app.imu({ t, gx: 0, gy: 0, gz: 0, ax: 0, ay: 0, az: 1 });
    },
  };
}

// ---------------------------------------------------------------------------
// 2. 스마트폰 센서 (DeviceMotionEvent.rotationRate, deg/s)
// ---------------------------------------------------------------------------

export interface PhoneStatus {
  /** 'idle' 시작 전, 'asking' 권한 묻는 중, 'on' 받는 중, 'nodata' 켜졌는데 값이 안 옴, 'error' */
  state: 'idle' | 'asking' | 'on' | 'nodata' | 'error';
  message: string;
  /** DeviceOrientation 각도(표시용, 도) */
  beta: number | null;
  gamma: number | null;
  /** 마지막 rotationRate 샘플 */
  last: ImuSample | null;
  /** 받은 이벤트 간격 ms(event.interval 또는 실측) */
  intervalMs: number | null;
}

export interface PhoneSource extends ImuSource {
  readonly kind: 'phone';
  readonly status: PhoneStatus;
  onChange(fn: (s: PhoneStatus) => void): () => void;
}

/** 이 브라우저에 DeviceMotion 인터페이스가 있나(데스크톱 Chrome 도 인터페이스는 있다 — 실제 값은 start 후 확인) */
export function phoneSensorAvailable(): boolean {
  return typeof globalThis.DeviceMotionEvent !== 'undefined';
}

/** 표준 중력가속도 m/s² (DeviceMotion m/s² → g) */
export const STANDARD_GRAVITY = 9.80665;

type PermissionFn = () => Promise<'granted' | 'denied' | string>;

/**
 * 폰 DeviceMotion 입력원.
 * start() 는 반드시 버튼 click 핸들러 안에서 동기적으로 호출한다(iOS 13+ requestPermission 은 사용자 동작 안에서만 허용,
 * 그 앞에 await 를 두면 WebKit 이 거부한다). HTTPS(보안 컨텍스트)가 아니면 센서·권한 모두 막힌다.
 * 축: rotationRate.beta → gx, gamma → gy, alpha → gz (조사 문서 2.3 예. 실제 손목 방향 매핑은 gesture.json imu.axisMap 으로 맞춘다).
 *     beta·gamma·alpha 는 각각 기기 x·y·z 축 회전이므로 가속도도 같은 기기 축으로:
 *     accelerationIncludingGravity.x/y/z (m/s²) ÷ 9.80665 → ax/ay/az (g, 중력 포함 — 화면 위로 눕히면 az ≈ +1).
 *     가속도 값이 없는 브라우저면 ax/ay/az 를 넣지 않는다(그때 accel 방식 튕김은 잡히지 않는다 — gyro 방식으로 바꿔 시험).
 */
export function createPhoneSource(app: App): PhoneSource {
  let running = false;
  const status: PhoneStatus = { state: 'idle', message: '', beta: null, gamma: null, last: null, intervalMs: null };
  const fns = new Set<(s: PhoneStatus) => void>();
  const emit = () => fns.forEach((f) => f({ ...status }));
  let lastT = -Infinity;
  let lastEventAt: number | null = null;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let emitPending = false;

  const set = (state: PhoneStatus['state'], message: string) => {
    status.state = state;
    status.message = message;
    emit();
  };

  const onMotion = (e: DeviceMotionEvent) => {
    const rr = e.rotationRate;
    if (!rr || (rr.alpha === null && rr.beta === null && rr.gamma === null)) return;
    const now = app.now();
    const t = Math.max(now, lastT + 0.001);
    lastT = t;
    const sample: ImuSample = { t, gx: rr.beta ?? 0, gy: rr.gamma ?? 0, gz: rr.alpha ?? 0 };
    const ag = e.accelerationIncludingGravity;
    if (ag && ag.x !== null && ag.y !== null && ag.z !== null) {
      sample.ax = ag.x / STANDARD_GRAVITY;
      sample.ay = ag.y / STANDARD_GRAVITY;
      sample.az = ag.z / STANDARD_GRAVITY;
    }
    status.intervalMs = e.interval > 0 ? e.interval : lastEventAt !== null ? now - lastEventAt : null;
    lastEventAt = now;
    status.last = sample;
    if (status.state !== 'on') set('on', '폰 센서 사용 중');
    app.imu(sample);
    // 상태 알림은 한 프레임에 한 번만
    if (!emitPending) {
      emitPending = true;
      requestAnimationFrame(() => {
        emitPending = false;
        emit();
      });
    }
  };
  const onOrientation = (e: DeviceOrientationEvent) => {
    status.beta = e.beta;
    status.gamma = e.gamma;
  };

  const attach = () => {
    window.addEventListener('devicemotion', onMotion);
    window.addEventListener('deviceorientation', onOrientation);
    running = true;
    set('asking', '센서 값을 기다리는 중…');
    lastEventAt = null;
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      if (running && lastEventAt === null)
        set('nodata', '센서 값이 들어오지 않습니다. 자이로가 있는 스마트폰에서 HTTPS 주소로 열어 주세요(데스크톱 브라우저는 값이 없습니다).');
    }, 2000);
  };

  return {
    kind: 'phone',
    get running() {
      return running;
    },
    get status() {
      return { ...status };
    },
    onChange(fn) {
      fns.add(fn);
      return () => {
        fns.delete(fn);
      };
    },
    start(): Promise<void> {
      if (running) return Promise.resolve();
      if (!phoneSensorAvailable()) {
        set('error', '이 브라우저에는 DeviceMotion 센서 인터페이스가 없습니다.');
        return Promise.resolve();
      }
      if (!globalThis.isSecureContext) {
        set(
          'error',
          '센서는 보안 연결(HTTPS 또는 localhost)에서만 켜집니다. 같은 Wi-Fi 의 http://192.168… 주소로는 막힙니다 — 배포된 HTTPS 사이트로 열어 주세요.',
        );
        return Promise.resolve();
      }
      // ↓ 여기까지 동기. requestPermission 호출 전에 await 를 넣지 말 것(iOS)
      const DM = globalThis.DeviceMotionEvent as unknown as { requestPermission?: PermissionFn };
      const DO = (globalThis as unknown as { DeviceOrientationEvent?: { requestPermission?: PermissionFn } }).DeviceOrientationEvent;
      if (typeof DM.requestPermission === 'function') {
        status.state = 'asking';
        status.message = '센서 권한을 묻는 중…';
        const pMotion = DM.requestPermission();
        const pOrient = typeof DO?.requestPermission === 'function' ? DO.requestPermission().catch(() => 'denied') : Promise.resolve('granted');
        emit();
        return Promise.all([pMotion, pOrient])
          .then(([r]) => {
            if (r !== 'granted') {
              set('error', '센서 권한이 거부되었습니다. Safari 설정 → 웹 사이트 → 동작 및 방향 접근에서 허용한 뒤 다시 시도하세요.');
              return;
            }
            attach();
          })
          .catch((err: unknown) => {
            set('error', `센서 권한 요청 실패: ${err instanceof Error ? err.message : String(err)} (버튼을 직접 눌러 다시 시도)`);
          });
      }
      attach();
      return Promise.resolve();
    },
    stop() {
      if (watchdog) clearTimeout(watchdog);
      watchdog = null;
      if (!running) return;
      running = false;
      window.removeEventListener('devicemotion', onMotion);
      window.removeEventListener('deviceorientation', onOrientation);
      const t = Math.max(app.now(), lastT + 0.001);
      lastT = t;
      app.imu({ t, gx: 0, gy: 0, gz: 0 });
      set('idle', '');
    },
  };
}

// ---------------------------------------------------------------------------
// 3. 녹화 재생 (CSV)
// ---------------------------------------------------------------------------

export interface ReplaySource extends ImuSource {
  readonly kind: 'replay';
  /** 녹화 길이 ms (첫 샘플 기준) */
  readonly durationMs: number;
  /** 현재 재생 위치 ms */
  readonly positionMs: number;
  readonly sampleCount: number;
  /** 끝까지 재생했나 */
  readonly ended: boolean;
  speed: number;
  loop: boolean;
  /** 일시정지(위치 유지). stop() 은 처음으로 되감는다 */
  pause(): void;
  seek(ms: number): void;
  onProgress(fn: (posMs: number, running: boolean) => void): () => void;
}

/**
 * 녹화 재생 입력원.
 * 샘플 시각은 재생 시작 시각(app.now())에 맞춰 옮긴다: t = 시작시각 + (원래 t − 시작 위치) / speed.
 * speed ≠ 1 이면 시간축이 줄거나 늘어나 튕김 지속시간 판정이 달라진다 — 수치 조정은 1× 또는 설정 화면의 '녹화 재판정'으로 한다.
 */
export function createReplaySource(
  app: App,
  samples: ImuSample[],
  opts: { speed?: number; loop?: boolean } = {},
): ReplaySource {
  const data = samples.slice().sort((a, b) => a.t - b.t);
  const t0 = data.length > 0 ? data[0].t : 0;
  const rel = data.map((s) => s.t - t0);
  const duration = rel.length > 0 ? rel[rel.length - 1] : 0;

  let speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
  let loop = opts.loop ?? false;
  let running = false;
  let ended = false;
  let pos = 0; // ms
  let idx = 0; // 다음에 보낼 샘플
  let wallStart = 0;
  let posStart = 0;
  let lastT = -Infinity;
  let timer: ReturnType<typeof setInterval> | null = null;
  const fns = new Set<(p: number, r: boolean) => void>();
  const progress = () => fns.forEach((f) => f(pos, running));

  const seekIndex = (ms: number) => {
    let i = 0;
    while (i < rel.length && rel[i] < ms) i++;
    return i;
  };

  const halt = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  const tick = () => {
    const now = app.now();
    pos = posStart + (now - wallStart) * speed;
    while (idx < data.length && rel[idx] <= pos) {
      const s = data[idx];
      const t = Math.max(wallStart + (rel[idx] - posStart) / speed, lastT + 0.001);
      lastT = t;
      app.imu({ ...s, t });
      idx++;
    }
    if (idx >= data.length) {
      if (loop && data.length > 1) {
        // 처음으로: 시각은 계속 앞으로
        idx = 0;
        posStart = 0;
        wallStart = Math.max(now, lastT + 1);
        pos = 0;
      } else {
        pos = duration;
        running = false;
        ended = true;
        halt();
        // 끝난 뒤 0 하나 — 마지막 값이 남지 않게
        const t = Math.max(app.now(), lastT + 0.001);
        lastT = t;
        app.imu({ t, gx: 0, gy: 0, gz: 0 });
      }
    }
    progress();
  };

  const src: ReplaySource = {
    kind: 'replay',
    get running() {
      return running;
    },
    get durationMs() {
      return duration;
    },
    get positionMs() {
      return pos;
    },
    get sampleCount() {
      return data.length;
    },
    get ended() {
      return ended;
    },
    get speed() {
      return speed;
    },
    set speed(v: number) {
      if (!(v > 0)) return;
      if (running) {
        // 지금 위치에서 새 속도로 이어 간다
        const now = app.now();
        posStart = posStart + (now - wallStart) * speed;
        wallStart = now;
      }
      speed = v;
    },
    get loop() {
      return loop;
    },
    set loop(v: boolean) {
      loop = v;
    },
    start() {
      if (running || data.length === 0) return;
      if (ended || pos >= duration) {
        pos = 0;
        ended = false;
      }
      idx = seekIndex(pos);
      posStart = pos;
      wallStart = Math.max(app.now(), lastT + 0.001);
      running = true;
      timer = setInterval(tick, 10);
      progress();
    },
    pause() {
      if (!running) return;
      tick();
      running = false;
      halt();
      progress();
    },
    stop() {
      const was = running;
      running = false;
      halt();
      pos = 0;
      idx = 0;
      ended = false;
      if (was) {
        const t = Math.max(app.now(), lastT + 0.001);
        lastT = t;
        app.imu({ t, gx: 0, gy: 0, gz: 0 });
      }
      progress();
    },
    seek(ms: number) {
      pos = Math.max(0, Math.min(duration, ms));
      ended = false;
      idx = seekIndex(pos);
      posStart = pos;
      wallStart = Math.max(app.now(), lastT + 0.001);
      progress();
    },
    onProgress(fn) {
      fns.add(fn);
      return () => {
        fns.delete(fn);
      };
    },
  };
  return src;
}

// ---------------------------------------------------------------------------
// 4. CSV 파싱 / 쓰기 — 펌웨어 녹화 형식 (README.md 'IMU 녹화 CSV 형식')
// ---------------------------------------------------------------------------

/**
 * IMU 녹화 CSV 파싱 — 펌웨어 2단계 6번 '녹화 기능(시리얼로 CSV 출력)'과 공유하는 형식.
 * 형식: 머리글 `t_ms,gx,gy,gz,ax,ay,az` (각속도 deg/s, 가속도 g·중력 포함). 가속도 열은 선택 —
 * 있으면 샘플에 ax/ay/az 로 넣어 코어에 보낸다(기본 accel 방식 튕김 판정에 쓴다). 없으면 accel 방식은 튕김을 잡지 않는다.
 *  - '#' 으로 시작하는 줄은 주석, 빈 줄은 무시. 구분자는 쉼표(세미콜론·탭도 허용).
 *  - 머리글이 있으면 열 이름(t_ms|t, gx, gy, gz, ax, ay, az)으로 찾고, 없으면 앞 네 열을 t,gx,gy,gz, 그다음 세 열(있으면)을 ax,ay,az 로 본다.
 *  - 숫자가 아닌 줄, 시각이 앞 줄보다 크지 않은 줄은 건너뛴다. 가속도 칸이 숫자가 아니면 그 줄은 가속도 없이 넣는다.
 */
export function parseImuCsv(text: string): ImuSample[] {
  const out: ImuSample[] = [];
  let col = { t: 0, gx: 1, gy: 2, gz: 3, ax: 4, ay: 5, az: 6 };
  let lastT = -Infinity;
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const cells = s.split(/[,;\t]/).map((v) => v.trim());
    if (/[a-z]/i.test(cells[0]) && !/^[-+]?(\d|\.\d)/.test(cells[0])) {
      // 머리글
      const names = cells.map((c) => c.toLowerCase());
      const find = (...keys: string[]) => names.findIndex((n) => keys.includes(n));
      const t = find('t_ms', 't', 'time_ms', 'ms');
      const gx = find('gx', 'gyro_x');
      const gy = find('gy', 'gyro_y');
      const gz = find('gz', 'gyro_z');
      const ax = find('ax', 'acc_x', 'accel_x');
      const ay = find('ay', 'acc_y', 'accel_y');
      const az = find('az', 'acc_z', 'accel_z');
      if (t >= 0 && gx >= 0 && gy >= 0 && gz >= 0) col = { t, gx, gy, gz, ax, ay, az };
      continue;
    }
    const t = Number(cells[col.t]);
    const gx = Number(cells[col.gx]);
    const gy = Number(cells[col.gy]);
    const gz = Number(cells[col.gz]);
    if (![t, gx, gy, gz].every((v) => Number.isFinite(v))) continue;
    if (t <= lastT) continue;
    lastT = t;
    const num = (i: number) => (i >= 0 && i < cells.length && cells[i] !== '' ? Number(cells[i]) : NaN);
    const ax = num(col.ax);
    const ay = num(col.ay);
    const az = num(col.az);
    if ([ax, ay, az].every((v) => Number.isFinite(v))) out.push({ t, gx, gy, gz, ax, ay, az });
    else out.push({ t, gx, gy, gz });
  }
  return out;
}

/** 샘플 → CSV 문자열(가속도가 없는 샘플은 0,0,1 g 로 채운다). 합성 파형을 내려받거나 샘플 파일을 만들 때 */
export function formatImuCsv(samples: readonly ImuSample[], comment?: string): string {
  const lines: string[] = [];
  if (comment) for (const c of comment.split('\n')) lines.push(`# ${c}`);
  lines.push('t_ms,gx,gy,gz,ax,ay,az');
  const t0 = samples.length > 0 ? samples[0].t : 0;
  for (const s of samples) {
    const acc =
      s.ax !== undefined && s.ay !== undefined && s.az !== undefined ? `${s.ax.toFixed(3)},${s.ay.toFixed(3)},${s.az.toFixed(3)}` : '0.000,0.000,1.000';
    lines.push(`${Math.round(s.t - t0)},${s.gx.toFixed(2)},${s.gy.toFixed(2)},${s.gz.toFixed(2)},${acc}`);
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// 5. 합성 파형 — '튕김 / 천천히 돌리기 / 걷기' 를 버튼 하나로 재현(체크리스트 확인용)
//    축은 기본 axisMap(roll=gy, pitch=gx, yaw=gz) 기준. t 는 0 부터 ms.
// ---------------------------------------------------------------------------

/** 결정적 의사 난수(재현 가능한 잡음) */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

export interface SynthOpts {
  /** 샘플 간격 ms (기본 10 = 100Hz) */
  dtMs?: number;
  /** 잡음 진폭 deg/s (기본 1.5) */
  noise?: number;
  seed?: number;
}

/** 합성 가속도 잡음 진폭 g */
const ACC_NOISE_G = 0.005;

/**
 * 각속도 파형에 가속도 채널(ax, ay, az, g, 중력 포함)을 붙인다.
 *  - 중력: 처음엔 +z(화면 위, az = 1 g). gx(pitch)·gy(roll) 를 적분한 각도만큼 기울인다
 *    → ax = −sin θy·cos θx, ay = sin θx, az = cos θx·cos θy (gz 는 z 축 회전이라 중력 방향을 바꾸지 않는다).
 *    천천히 돌리기·걷기는 이 '천천히 도는 중력'만 생겨 hp = |a − LPF(a)| 가 작다(≈ 시정수 × 회전 속도).
 *  - lin(t, i): 손목의 선가속도(g, 센서 축) — 튕김의 짧은 펄스, 걷기의 발 디딤 충격 등.
 */
function withAccel(
  samples: ImuSample[],
  seed: number,
  lin?: (t: number, i: number) => [number, number, number],
): ImuSample[] {
  const n = rng(seed ^ 0x5a5a);
  let thx = 0;
  let thy = 0;
  let prevT: number | null = null;
  const D = Math.PI / 180;
  return samples.map((s, i) => {
    if (prevT !== null) {
      const dt = (s.t - prevT) / 1000;
      thx += s.gx * dt * D;
      thy += s.gy * dt * D;
    }
    prevT = s.t;
    const l = lin ? lin(s.t, i) : [0, 0, 0];
    return {
      ...s,
      ax: round3(-Math.sin(thy) * Math.cos(thx) + l[0] + n() * ACC_NOISE_G),
      ay: round3(Math.sin(thx) + l[1] + n() * ACC_NOISE_G),
      az: round3(Math.cos(thx) * Math.cos(thy) + l[2] + n() * ACC_NOISE_G),
    };
  });
}

/** 조용히 있기 (가속도 = 중력 1 g + 잡음) */
export function synthRest(ms: number, o: SynthOpts = {}): ImuSample[] {
  const dt = o.dtMs ?? 10;
  const n = rng(o.seed ?? 7);
  const a = o.noise ?? 1.5;
  const out: ImuSample[] = [];
  for (let t = 0; t < ms; t += dt) out.push({ t, gx: round2(n() * a), gy: round2(n() * a), gz: round2(n() * a) });
  return withAccel(out, o.seed ?? 7);
}

/**
 * 손목 튕김 한 번: 판정 축(roll) 반 사인 피크 → 반대 방향 되돌림(반동). 앞뒤로 조용한 구간 포함.
 * dir 'out' = + 방향(outwardSign 1 기준 '다음'), 'in' = − 방향('이전').
 * 가속도: 각속도가 오르는 동안(riseMs + 20ms ≈ 110ms) x 축 반 사인 펄스(기본 피크 3.2 g, peakDps 520 기준 비례 — peakG 로 직접 지정 가능)
 *        + 되돌림 때 반대쪽 작은 펄스(0.2배) + 회전에 따른 중력 기울기. accel 방식 hp 피크 ≈ 2.4 g(실기 세게 2.8–4.6, 약하게 1.35–1.84).
 */
export function synthFlick(
  dir: 'out' | 'in',
  o: SynthOpts & { peakDps?: number; riseMs?: number; leadMs?: number; tailMs?: number; peakG?: number } = {},
): ImuSample[] {
  const dt = o.dtMs ?? 10;
  const n = rng(o.seed ?? 11);
  const a = o.noise ?? 1.5;
  const P = o.peakDps ?? 520;
  const rise = o.riseMs ?? 90;
  const back = 120;
  const lead = o.leadMs ?? 350;
  const tail = o.tailMs ?? 400;
  const sgn = dir === 'out' ? 1 : -1;
  const G = o.peakG ?? (3.2 * P) / 520;
  const pulse = rise + 20;
  const out: ImuSample[] = [];
  const total = lead + rise + back + tail;
  for (let t = 0; t < total; t += dt) {
    let r = 0;
    const u = t - lead;
    if (u >= 0 && u < rise) r = sgn * P * Math.sin((Math.PI * u) / rise);
    else if (u >= rise && u < rise + back) r = -sgn * 0.45 * P * Math.sin((Math.PI * (u - rise)) / back);
    out.push({ t, gx: round2(0.15 * r + n() * a), gy: round2(r + n() * a), gz: round2(0.1 * r + n() * a) });
  }
  return withAccel(out, o.seed ?? 11, (t) => {
    const u = t - lead;
    let x = 0;
    if (u >= 0 && u < pulse) x = sgn * G * Math.sin((Math.PI * u) / pulse);
    else if (u >= pulse && u < pulse + back) x = -sgn * 0.2 * G * Math.sin((Math.PI * (u - pulse)) / back);
    return [x, 0.2 * Math.abs(x), 0];
  });
}

/** 천천히 손목 돌리기: 판정 축 사인파(진폭 150°/s, 주기 1.6s) — 튕김으로 인식되면 안 된다. 가속도 = 천천히 기우는 중력 */
export function synthSlowRotate(ms = 3200, o: SynthOpts & { ampDps?: number; periodMs?: number } = {}): ImuSample[] {
  const dt = o.dtMs ?? 10;
  const n = rng(o.seed ?? 23);
  const a = o.noise ?? 1.5;
  const A = o.ampDps ?? 150;
  const T = o.periodMs ?? 1600;
  const out: ImuSample[] = [];
  for (let t = 0; t < ms; t += dt) {
    const r = A * Math.sin((2 * Math.PI * t) / T);
    out.push({ t, gx: round2(0.1 * r + n() * a), gy: round2(r + n() * a), gz: round2(n() * a) });
  }
  return withAccel(out, o.seed ?? 23);
}

/** 크게 천천히 한 번 돌리기: 임계값은 넘지만 오래 걸림(tooLong) — 무시되어야 한다. 가속도 = 크게 도는 중력(hp 가 길게 이어짐) */
export function synthBigSlowTurn(o: SynthOpts & { peakDps?: number; durMs?: number } = {}): ImuSample[] {
  const dt = o.dtMs ?? 10;
  const n = rng(o.seed ?? 31);
  const a = o.noise ?? 1.5;
  const P = o.peakDps ?? 380;
  const D = o.durMs ?? 900;
  const out: ImuSample[] = [];
  const lead = 300;
  for (let t = 0; t < lead + 2 * D + 300; t += dt) {
    const u = t - lead;
    let r = 0;
    if (u >= 0 && u < D) r = P * Math.sin((Math.PI * u) / D);
    else if (u >= D && u < 2 * D) r = -P * Math.sin((Math.PI * (u - D)) / D);
    out.push({ t, gx: round2(0.1 * r + n() * a), gy: round2(r + n() * a), gz: round2(n() * a) });
  }
  return withAccel(out, o.seed ?? 31);
}

/**
 * 걷기 팔 흔들림(약 0.9Hz): pitch 가 크고 roll 은 작다 — 무시되어야 한다.
 * 가속도: 팔 흔들림에 따라 기우는 중력 + 걸음(2Hz)마다 짧은 발 디딤 충격(z, ≤0.3 g) + 좌우 흔들림(x, 0.08 g).
 */
export function synthWalk(ms = 3000, o: SynthOpts = {}): ImuSample[] {
  const dt = o.dtMs ?? 10;
  const n = rng(o.seed ?? 41);
  const a = o.noise ?? 3;
  const out: ImuSample[] = [];
  for (let t = 0; t < ms; t += dt) {
    const w = (2 * Math.PI * t) / 1100;
    out.push({
      t,
      gx: round2(110 * Math.sin(w) + n() * a),
      gy: round2(55 * Math.sin(w + 0.6) + n() * a),
      gz: round2(35 * Math.sin(2 * w) + n() * a),
    });
  }
  return withAccel(out, o.seed ?? 41, (t) => {
    const step = t % 500; // 2Hz
    const impact = step < 40 ? 0.3 * Math.sin((Math.PI * step) / 40) : 0;
    return [0.08 * Math.sin((2 * Math.PI * t) / 1100), 0, impact];
  });
}

/** 여러 조각을 시간 순서로 잇는다(각 조각의 t 는 0 부터) */
export function concatSamples(...parts: ImuSample[][]): ImuSample[] {
  const out: ImuSample[] = [];
  let base = 0;
  for (const p of parts) {
    if (p.length === 0) continue;
    const dt = p.length > 1 ? p[1].t - p[0].t : 10;
    for (const s of p) out.push({ ...s, t: base + s.t });
    base = out[out.length - 1].t + dt;
  }
  return out;
}
