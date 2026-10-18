/**
 * 코어 공용 타입 — 시뮬레이션(TS)과 펌웨어(C++, firmware/logic/)가 똑같이 구현하는 인터페이스.
 * 이 파일의 이름·필드를 바꾸면 /shared/test-vectors/README.md 와 sim/ARCHITECTURE.md 도 함께 고친다.
 * 규칙: src/core/ 는 DOM·window·localStorage 를 쓰지 않는다(순수 로직). 상태는 JSON 직렬화 가능한 평범한 객체.
 */

// ---------------------------------------------------------------------------
// 설정 파일 타입 (/shared/keymap.json, /shared/gesture.json)
// ---------------------------------------------------------------------------

/** clock = 시계(키 안 보냄, 기본 시작 모드), launch = 앱 실행 타일(2쪽 × 2×3) — docs/research/launcher.md */
export type ModeId = 'clock' | 'present' | 'launch' | 'meeting';
export type OsId = 'win' | 'mac';
export type ClockAppId = 'clock';
export type PresentAppId = 'powerpoint' | 'slides';
export type LaunchAppId = 'launcher';
export type MeetingAppId = 'zoom' | 'teams' | 'meet';
export type AppId = ClockAppId | PresentAppId | LaunchAppId | MeetingAppId;

export type PresentActionId = 'next' | 'prev' | 'blackout' | 'showStart' | 'showEnd';
/** 실행 모드 타일: 1쪽 앱 6개, 2쪽 업무 단축 6개 */
export type LaunchActionId =
  | 'claude' | 'kakao' | 'chrome' | 'ppt' | 'excel' | 'hwp'
  | 'capture' | 'lock' | 'desktop' | 'display' | 'mute' | 'portal';
export type MeetingActionId = 'mic' | 'camera' | 'hand';
export type ActionId = PresentActionId | LaunchActionId | MeetingActionId;

/** 수정자. mac 의 Cmd = gui, Option = alt */
export type Mod = 'ctrl' | 'shift' | 'alt' | 'gui';

/** 키 조합. key 는 /shared/hid-usage.json 의 keys 이름(예: 'RIGHT', 'P', 'F5', 'GRAVE') */
export interface Chord {
  mods: Mod[];
  key: string;
}

/** 매크로 한 단계(docs/research/launcher.md 3장). text 는 출력 가능한 ASCII 만, US 배열 키로 입력 */
export type MacroStep = { chord: Chord } | { wait: number } | { text: string } | { consumer: string };
export interface Macro {
  steps: MacroStep[];
}
/** 동작 하나: 키 조합(한 번 누름) 또는 매크로 */
export type Binding = Chord | Macro;

export interface KeymapAction {
  id: ActionId;
  label: string;
  icon: string | null;
  win: Binding | null;
  mac: Binding | null;
  /** 타일 길게 누르기(없거나 null = 길게 누르기 없음) */
  winAlt?: Binding | null;
  macAlt?: Binding | null;
  /** 매크로 text 의 {url} 자리. 비어 있으면 {url} 을 쓰는 동작은 비활성 */
  url?: string;
  note?: string;
}

export interface KeymapApp {
  name: string;
  source?: string;
  actions: KeymapAction[];
}

export interface KeymapMode {
  name: string;
  defaultApp: AppId;
  appOrder: AppId[];
  apps: Record<string, KeymapApp>;
}

export interface Keymap {
  $schema?: string;
  $comment?: string;
  version: 1;
  settings: {
    deviceName: string;
    deviceNameMaxBytes?: number;
    os: OsId;
    mode: ModeId;
    sensitivity: number;
    primaryButton: ButtonId;
  };
  modeOrder: ModeId[];
  modes: Record<ModeId, KeymapMode>;
}

export type ImuAxis = 'gx' | 'gy' | 'gz';
export type LogicalAxis = 'yaw' | 'pitch' | 'roll';

export interface GestureConfig {
  $schema?: string;
  $comment?: string;
  version: 1;
  imu: {
    sampleRateHz: number;
    gyroRangeDps: number;
    axisMap: Record<LogicalAxis, ImuAxis>;
    axisSign: Record<LogicalAxis, 1 | -1>;
    biasCalib: { enabled: boolean; stillThresholdDps: number; stillMs: number; trackTauMs: number };
  };
  airMouse: {
    /** 에어마우스 사용(기본 끔 — 실기 피드백 6). 꺼지면 BOOT 를 누르고 있어도 시작하지 않는다 */
    enabled: boolean;
    holdToStartMs: number;
    startSuppressMs: number;
    deadzoneDps: { enter: number; exit: number };
    lowpassTauMs: number;
    curve: { exponent: number; maxPxPerReport: number };
    sensitivity: { name: string; gain: number }[];
    invertY: boolean;
  };
  flick: {
    /** 손목 튕김 사용(기본 끔 — 실기 피드백 10). 꺼지면 판정 자체를 하지 않는다(IMU 는 손목 들기·녹화용으로 계속) */
    enabled: boolean;
    /** 판정 방식: 'accel' = 중력 제거 가속도 크기(기본, 실기 피드백 9 — 방향 무관 항상 다음), 'gyro' = 판정 축 각속도(옛 방식) */
    detector: 'accel' | 'gyro';
    axis: LogicalAxis;
    prefilterTauMs: number;
    peakThresholdDps: number;
    adaptive: { enabled: boolean; windowMs: number; rmsMultiplier: number };
    axisDominanceRatio: number;
    minAboveMs: number;
    maxAboveMs: number;
    rebound: { required: boolean; windowMs: number; minRatio: number; minDps: number };
    quietBefore: { windowMs: number; guardMs: number; maxRmsDps: number };
    cooldownMs: number;
    outwardSign: 1 | -1;
    /** 안쪽 튕김 동작: 'next' = 다음(기본, 실기 피드백 8 — 안쪽·바깥 모두 다음), 'none' = 무시, 'prev' = 이전 */
    inAction: 'none' | 'prev' | 'next';
    /** accel 방식 값: hp = |a − LPF(a)|(g, LPF 시정수 lpfTauMs). hp ≥ peakG 가 maxAboveMs 이하로 지나가면 인식.
     *  피크 전 [t−guard−window, t−guard) 의 hp RMS > quietMaxRmsG 면 기각(걷기·흔들기). 재인식 금지는 cooldownMs */
    accel: { lpfTauMs: number; peakG: number; maxAboveMs: number; quietWindowMs: number; quietGuardMs: number; quietMaxRmsG: number };
  };
  touch: {
    tapMaxMovePx: number;
    holdMs: number;
    /** 발표 가운데 길게 = 암전만 이 시간(ms). 다른 길게 누르기는 holdMs */
    blackoutHoldMs: number;
    swipeMinPx: number;
    swipeMaxOffAxisPx: number;
    /** 주 축 이동 > 비율 × 다른 축 이동 */
    swipeAxisRatio: number;
    /** 누른 뒤 이 시간(ms) 안에 떼야 스와이프 */
    swipeMaxMs: number;
    /** 쇼 진행 중 발표 모드의 모드 전환 스와이프 */
    showSwipeMinPx: number;
    showSwipeMaxOffAxisPx: number;
    sheetPullMinPx: number;
    pullMaxOffAxisPx: number;
    pullMaxMs: number;
    topEdgePx: number;
    /** 설정 화면: 위로 이만큼 + 축 비율이면 닫기(움직이는 도중에도) */
    settingsCloseMinPx: number;
    settingsCloseAxisRatio: number;
  };
  /** longPressMs = BOOT 길게(잠금), powerOffHoldMs = PWR 길게('전원을 끌까요?' 확인), powerConfirmTimeoutMs = 확인 자동 취소 */
  button: { longPressMs: number; powerOffHoldMs: number; powerConfirmTimeoutMs: number };
  timing: {
    sheetAutoCloseMs: number;
    meetingEstimateResetMs: number;
    /** 설정 화면 무입력 자동 닫힘 */
    settingsIdleCloseMs: number;
  };
  /** 시계 전원 관리(펌웨어 전용, 시뮬레이터는 쓰지 않음). 없으면 펌웨어 기본값 */
  power?: {
    screenOffMs: number;
    brightnessPercent: number;
    batteryPollMs: number;
    wristRaise: {
      enabled: boolean;
      faceAxis: 0 | 1 | 2;
      faceSign: 1 | -1;
      faceUpMinG: number;
      minDeltaG: number;
      windowMs: number;
    };
  };
}

// ---------------------------------------------------------------------------
// HID 출력
// ---------------------------------------------------------------------------

/**
 * 시계가 PC 로 보내는 HID 이벤트.
 * - key: 한 번 누르고 떼는 동작 전체(펌웨어는 [수정자+키] → [모두 0] 두 보고서로 보낸다).
 * - mouseMove: 상대 이동(px, 정수, 화면 아래가 +dy).
 * - mouseButton: 버튼 누름/뗌.
 * - consumer: 미디어 키(Consumer Page 사용 코드, 예 0x00E9 볼륨+).
 */
export type HidEvent =
  | { t: 'key'; mods: Mod[]; key: string }
  | { t: 'mouseMove'; dx: number; dy: number }
  | { t: 'mouseButton'; button: 'left' | 'right' | 'middle'; down: boolean }
  | { t: 'consumer'; usage: number }
  /** 매크로(단계 사이 대기 포함). {url} 은 이미 바뀐 상태. 보고서 열은 keymap.expandMacro 로 만든다 */
  | { t: 'macro'; steps: MacroStep[] };

/** 입력이 어디서 왔나 — HID 로그 '출처' 열 */
export type InputSource =
  | 'touch'
  | 'hold'
  | 'swipe'
  | 'sheet'
  | 'button'
  | 'gesture'
  | 'air'
  | 'system';

/** step 이 낸 HID 이벤트 + 부가 정보 */
export interface Emitted {
  ev: HidEvent;
  source: InputSource;
  /** keymap 동작 id. 에어마우스 이동·클릭은 null */
  action: ActionId | null;
}

// ---------------------------------------------------------------------------
// 입력 이벤트 (UI·센서 → 코어)
// ---------------------------------------------------------------------------

export type ButtonId = 'boot' | 'pwr';
export type SwipeDir = 'left' | 'right' | 'up' | 'down';

/** IMU 한 샘플. t = 측정 시각(ms, 단조 증가), g* = 각속도 deg/s (센서 축) */
export interface ImuSample {
  t: number;
  gx: number;
  gy: number;
  gz: number;
  /** 가속도 g(센서 축, 중력 포함). 없으면 accel 방식 튕김 판정을 하지 않는다 */
  ax?: number;
  ay?: number;
  az?: number;
}

/**
 * 코어가 받는 입력. 좌표는 시계 화면 410×502 기준 px(왼쪽 위 0,0).
 * 터치 판정(탭/길게/스와이프)은 UI(watch 모듈, 펌웨어 LVGL)가 하고 결과만 넘긴다.
 * 측면 버튼은 원시 down/up 을 넘기면 코어가 시간으로 판정한다(short/long 은 테스트·단축용 의미 이벤트).
 */
export type InputEvent =
  | { t: 'tap'; x: number; y: number }
  | { t: 'longPress'; x: number; y: number }
  | { t: 'swipe'; dir: SwipeDir }
  | { t: 'button'; id: ButtonId; action: 'down' | 'up' | 'short' | 'long' }
  | { t: 'imu'; sample: ImuSample }
  | { t: 'tick' }
  | { t: 'connection'; connected: boolean }
  | { t: 'setMode'; mode: ModeId }
  | { t: 'setApp'; mode: ModeId; app: AppId }
  | { t: 'setOs'; os: OsId }
  | { t: 'setSensitivity'; level: number }
  | { t: 'setLocked'; locked: boolean };

/** step 에 넘기는 문맥: 현재 시각과 설정 */
export interface StepContext {
  /** 현재 시각 ms (imu 입력이면 sample.t 를 쓴다) */
  now: number;
  keymap: Keymap;
  gesture: GestureConfig;
}

// ---------------------------------------------------------------------------
// 코어 상태 (JSON 직렬화 가능)
// ---------------------------------------------------------------------------

export type Estimate = 'unknown' | 'on' | 'off';
export interface MeetingEstimate {
  mic: Estimate;
  camera: Estimate;
  hand: 'down' | 'up';
}

export interface ButtonHold {
  id: ButtonId;
  downAt: number;
  /** 에어마우스가 시작됐나(발표 모드 주 버튼만) */
  air: boolean;
  /** 에어마우스가 데드존을 넘은 출력을 냈나(잠금 판정 취소용) */
  moved: boolean;
  /** 길게 누름(잠금 토글)이 이미 발동했나 */
  longFired: boolean;
}

export interface BiasState {
  bias: [number, number, number];
  stillSince: number | null;
  lastT: number | null;
}

export interface AirAxisState {
  moving: boolean;
  ema: number;
  resid: number;
}

export interface AirMouseState {
  active: boolean;
  since: number;
  lastT: number | null;
  x: AirAxisState;
  y: AirAxisState;
}

export type FlickPhase = 'idle' | 'above' | 'rebound' | 'blocked';
export type FlickReject = 'tooShort' | 'tooLong' | 'noRebound' | 'notDominant' | 'notQuiet';

/** accel 방식 튕김 판정 상태 */
export interface AccelFlickState {
  lpf: [number, number, number] | null;
  lastT: number | null;
  /** (시각, hp²) — 사전 정숙 RMS 용 */
  hist: [number, number][];
  phase: 'idle' | 'above' | 'blocked';
  aboveStart: number;
  peak: number;
}

export interface FlickState {
  filt: [number, number, number] | null;
  lastT: number | null;
  /** 최근 샘플의 (시각, 세 축 제곱합) — 적응 임계값·사전 정숙 RMS 계산용 */
  hist: [number, number][];
  phase: FlickPhase;
  sign: 1 | -1;
  threshold: number;
  aboveStart: number;
  peak: number;
  peakT: number;
  reboundNeed: number;
  cooldownUntil: number;
  /** accel 방식 상태(중력 제거 가속도) */
  acc: AccelFlickState;
}

export interface CoreState {
  mode: ModeId;
  /** 시계로 들어오기 직전 모드(BOOT 짧게: 시계 ↔ 이 모드). 처음은 발표 */
  prevMode: ModeId;
  os: OsId;
  apps: { clock: ClockAppId; present: PresentAppId; launch: LaunchAppId; meeting: MeetingAppId };
  /** 실행 모드 쪽(0 = 앱, 1 = 업무 단축) */
  launchPage: number;
  sensitivity: number;
  connected: boolean;
  everConnected: boolean;
  disconnectedAt: number | null;
  locked: boolean;
  screenOn: boolean;
  /** '전원을 끌까요?' 확인 화면(열린 시각). 열려 있으면 키·스와이프·튕김을 보내지 않는다 */
  powerConfirm: { since: number } | null;
  sheet: { open: boolean; lastActivity: number };
  show: { running: boolean; startedAt: number | null; blackout: boolean };
  meeting: Record<MeetingAppId, MeetingEstimate>;
  button: ButtonHold | null;
  bias: BiasState;
  air: AirMouseState;
  flick: FlickState;
}

// ---------------------------------------------------------------------------
// 코어가 내는 시스템 알림 (HID 로그 SYS 행, 시계 화면 피드백용)
// ---------------------------------------------------------------------------

export type CoreEvent =
  | { t: 'mode'; mode: ModeId }
  | { t: 'app'; mode: ModeId; app: AppId }
  | { t: 'os'; os: OsId }
  | { t: 'lock'; locked: boolean }
  | { t: 'connection'; connected: boolean }
  | { t: 'sheet'; open: boolean }
  | { t: 'air'; active: boolean }
  | { t: 'show'; running: boolean }
  | { t: 'blackout'; on: boolean }
  | { t: 'screen'; on: boolean }
  /** 전원 끄기 확인 화면 열림/닫힘 */
  | { t: 'powerConfirm'; open: boolean }
  /** 전원 끄기 요청 — 실제 차단은 펌웨어(AXP2101), 시뮬레이터는 '꺼짐' 화면 */
  | { t: 'powerOff' }
  | { t: 'sensitivity'; level: number }
  /** 실행 모드 쪽이 바뀜 */
  | { t: 'launchPage'; page: number }
  /** 키 동작이 실행됨(전송 또는 끊김으로 버림). 화면 플래시용 */
  | { t: 'action'; action: ActionId; source: InputSource; sent: boolean }
  | { t: 'flick'; dir: 'out' | 'in'; peakG?: number }
  | { t: 'flickRejected'; reason: FlickReject; peakG?: number }
  | { t: 'ignored'; source: 'gesture'; reason: 'locked' | 'cooldown' }
  | { t: 'estimate'; app: MeetingAppId; target: MeetingActionId; value: Estimate | 'down' | 'up'; synced: boolean };

export interface StepResult {
  state: CoreState;
  /** 실제로 PC 로 보낼 HID */
  hid: Emitted[];
  /** 연결 끊김으로 버린 HID(재연결 후에도 보내지 않음). 로그 표시용 */
  dropped: Emitted[];
  events: CoreEvent[];
}
