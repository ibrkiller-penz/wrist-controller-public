/**
 * App — 시뮬레이터 전체의 단일 상태 보관소.
 * 코어 리듀서(step)를 감싸 시간·설정·HID 버스·구독을 관리한다. 모든 UI 모듈은 이 객체 하나만 받는다.
 *
 * 규칙
 *  - 상태는 app.dispatch(input) 로만 바꾼다(직접 수정 금지). 읽기는 app.state.
 *  - HID 는 app.hid(HidBus) 를 구독한다: 가상 PC 는 기본 구독(버림 제외), HID 로그는 { includeDropped: true }.
 *  - 시스템 알림(모드 전환·잠금·무시된 제스처 등)은 app.subscribe 의 change.result.events 로 받는다.
 *  - 시각은 app.now() (performance.now 기준 ms). IMU 샘플 t 도 같은 기준이어야 한다.
 */
import { defaultGesture, defaultKeymap } from './core/config';
import { HidBus } from './core/hidBus';
import { initState, showElapsed, step } from './core/modeMachine';
import type {
  AppId,
  CoreState,
  GestureConfig,
  ImuSample,
  InputEvent,
  Keymap,
  ModeId,
  OsId,
  StepResult,
} from './core/types';

export interface AppChange {
  state: CoreState;
  /** 'input' = dispatch, 'config' = setConfig/resetConfig, 'prefs' = 장치 이름 등 비코어 설정 */
  reason: 'input' | 'config' | 'prefs';
  input: InputEvent | null;
  result: StepResult | null;
}

export type AppListener = (change: AppChange) => void;

export interface AppConfig {
  keymap: Keymap;
  gesture: GestureConfig;
}

export interface AppOptions {
  keymap?: Keymap;
  gesture?: GestureConfig;
  /** 시각 함수(테스트용). 기본 performance.now */
  clock?: () => number;
  /** 사용자 선택(모드·OS·감도 등)을 localStorage 에 저장/복원. 기본 true */
  persist?: boolean;
  /** 타이머 입력(tick) 간격 ms. 0 이면 자동 tick 없음. 기본 50 */
  tickMs?: number;
}

/** localStorage 에 남기는 사용자 선택(새로고침 대비 편의 기능 — 실패해도 동작에 지장 없음) */
interface Prefs {
  v: 1;
  mode?: ModeId;
  os?: OsId;
  apps?: Partial<Record<ModeId, AppId>>;
  sensitivity?: number;
  deviceName?: string;
}

const PREFS_KEY = 'wrist-sim.prefs.v1';

function loadPrefs(): Prefs | null {
  try {
    const raw = globalThis.localStorage?.getItem(PREFS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Prefs;
    return p && p.v === 1 ? p : null;
  } catch {
    return null;
  }
}

function savePrefs(p: Prefs): void {
  try {
    globalThis.localStorage?.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* 사생활 보호 모드 등 — 무시 */
  }
}

export class App {
  /** HID 이벤트 버스(가상 PC·HID 로그가 구독) */
  readonly hid = new HidBus();

  private _state: CoreState;
  private _keymap: Keymap;
  private _gesture: GestureConfig;
  private _deviceName: string;
  private listeners = new Set<AppListener>();
  private clock: () => number;
  private persist: boolean;
  private tickMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: AppOptions = {}) {
    this._keymap = opts.keymap ? structuredClone(opts.keymap) : defaultKeymap();
    this._gesture = opts.gesture ? structuredClone(opts.gesture) : defaultGesture();
    this.clock = opts.clock ?? (() => performance.now());
    this.persist = opts.persist ?? true;
    this.tickMs = opts.tickMs ?? 50;
    this._state = initState(this._keymap);
    this._deviceName = this._keymap.settings.deviceName;
    if (this.persist) this.restorePrefs();
    this.hid.setConnected(this._state.connected);
  }

  // ------------------------------------------------------------------ 읽기
  get state(): Readonly<CoreState> {
    return this._state;
  }
  get keymap(): Readonly<Keymap> {
    return this._keymap;
  }
  get gesture(): Readonly<GestureConfig> {
    return this._gesture;
  }
  get config(): Readonly<AppConfig> {
    return { keymap: this._keymap, gesture: this._gesture };
  }
  /** BLE 장치 이름(시계 설정에서 바꿀 수 있음, 기본 keymap.settings.deviceName) */
  get deviceName(): string {
    return this._deviceName;
  }
  /** 현재 시각 ms (performance.now 기준) */
  now(): number {
    return this.clock();
  }
  /** 발표 경과 시간 ms */
  showElapsed(): number {
    return showElapsed(this._state, this.now());
  }

  // ------------------------------------------------------------------ 입력
  /**
   * 입력 하나를 코어에 넣는다. 결과의 HID 는 버스로 내보내고 구독자에게 알린다.
   * @param at 시각(생략하면 now()). imu 입력은 sample.t 를 쓴다.
   */
  dispatch(input: InputEvent, at?: number): StepResult {
    const now = at ?? this.now();
    const result = step(this._state, input, { now, keymap: this._keymap, gesture: this._gesture });
    this._state = result.state;
    this.hid.setConnected(this._state.connected);
    const ts = input.t === 'imu' ? input.sample.t : now;
    for (const e of result.hid) this.hid.emit({ at: ts, ev: e.ev, source: e.source, action: e.action });
    for (const e of result.dropped) this.hid.emit({ at: ts, ev: e.ev, source: e.source, action: e.action, dropped: true });
    if (this.persist && result.events.some((e) => ['mode', 'app', 'os', 'sensitivity'].includes(e.t))) this.savePrefsNow();
    // tick 은 무엇인가 바뀌었을 때만 알린다(50ms 마다 화면을 다시 그리지 않게)
    if (input.t !== 'tick' || result.events.length > 0 || result.hid.length > 0 || result.dropped.length > 0) {
      this.notify({ state: this._state, reason: 'input', input, result });
    }
    return result;
  }

  /** IMU 샘플 편의 함수 */
  imu(sample: ImuSample): StepResult {
    return this.dispatch({ t: 'imu', sample });
  }

  /** 구독. 반환 함수를 부르면 해지 */
  subscribe(listener: AppListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ------------------------------------------------------------------ 연결 상태(시뮬레이션 전용 토글)
  get connected(): boolean {
    return this._state.connected;
  }
  setConnected(connected: boolean): void {
    this.dispatch({ t: 'connection', connected });
  }
  toggleConnected(): void {
    this.setConnected(!this._state.connected);
  }

  // ------------------------------------------------------------------ 설정 교체
  /**
   * keymap / gesture 교체(설정 화면이 검증을 통과한 값만 넘긴다). 진행 중 에어마우스·버튼 판정은 초기화하지 않지만
   * 현재 앱 id 가 새 keymap 에 없으면 그 모드의 defaultApp 으로 되돌린다.
   */
  setConfig(cfg: Partial<AppConfig>): void {
    if (cfg.keymap) this._keymap = structuredClone(cfg.keymap);
    if (cfg.gesture) this._gesture = structuredClone(cfg.gesture);
    const s = structuredClone(this._state);
    for (const mode of ['clock', 'present', 'launch', 'meeting'] as const) {
      const m = this._keymap.modes[mode];
      if (m && !m.apps[s.apps[mode]]) (s.apps as Record<ModeId, AppId>)[mode] = m.defaultApp;
    }
    const levels = this._gesture.airMouse.sensitivity.length;
    if (s.sensitivity >= levels) s.sensitivity = levels - 1;
    this._state = s;
    this.notify({ state: this._state, reason: 'config', input: null, result: null });
  }

  /** 저장소 기본값(/shared/*.json)으로 되돌림 */
  resetConfig(which: 'keymap' | 'gesture' | 'both' = 'both'): void {
    this.setConfig({
      keymap: which !== 'gesture' ? defaultKeymap() : undefined,
      gesture: which !== 'keymap' ? defaultGesture() : undefined,
    });
  }

  setDeviceName(name: string): void {
    const n = name.trim();
    if (!n) return;
    this._deviceName = n;
    if (this.persist) this.savePrefsNow();
    this.notify({ state: this._state, reason: 'prefs', input: null, result: null });
  }

  // ------------------------------------------------------------------ 타이머
  /** 주기적 tick 입력 시작(시트 자동 닫힘, 버튼 길게 누름 판정 등). main.ts 가 부른다 */
  start(): void {
    if (this.timer !== null || this.tickMs <= 0) return;
    this.timer = setInterval(() => this.dispatch({ t: 'tick' }), this.tickMs);
  }
  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  // ------------------------------------------------------------------ 내부
  private notify(change: AppChange): void {
    for (const l of [...this.listeners]) {
      try {
        l(change);
      } catch (err) {
        console.error('[app] 구독자 오류', err);
      }
    }
  }

  private restorePrefs(): void {
    const p = loadPrefs();
    if (!p) return;
    const now = this.now();
    const run = (input: InputEvent) => {
      this._state = step(this._state, input, { now, keymap: this._keymap, gesture: this._gesture }).state;
    };
    if (p.mode && this._keymap.modes[p.mode]) run({ t: 'setMode', mode: p.mode });
    if (p.os === 'win' || p.os === 'mac') run({ t: 'setOs', os: p.os });
    for (const [mode, app] of Object.entries(p.apps ?? {})) if (app) run({ t: 'setApp', mode: mode as ModeId, app });
    if (typeof p.sensitivity === 'number') run({ t: 'setSensitivity', level: p.sensitivity });
    if (typeof p.deviceName === 'string' && p.deviceName.trim()) this._deviceName = p.deviceName;
  }

  private savePrefsNow(): void {
    const s = this._state;
    savePrefs({ v: 1, mode: s.mode, os: s.os, apps: { ...s.apps }, sensitivity: s.sensitivity, deviceName: this._deviceName });
  }
}
