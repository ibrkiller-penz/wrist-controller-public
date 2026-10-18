# 시뮬레이터 구조 (sim/ARCHITECTURE.md)

2026-10-16 · 개발팀 리드(1번) · 기준: `../손목컨트롤러_작업지시서.md`, `../design/*`, `../docs/research/*`

이 문서는 병렬로 일하는 개발자들이 **바꾸지 않고 기대어 쓰는 계약**이다. 계약(타입·함수 시그니처·파일 소유)을 바꿔야 하면 직접 고치지 말고 리드에게 요청한다.

## 0. 명령

```bash
cd sim
npm install          # 처음 한 번
npm run dev          # http://localhost:5173 (같은 Wi-Fi 폰은 --host 로 열림. 센서는 HTTPS 필요)
npm test             # vitest — 공유 테스트 벡터 포함
npm run build        # tsc --noEmit + vite build → dist/ (index.html, install.html)
node scripts/gen-test-vectors.mjs   # /shared/test-vectors/*.json 다시 만들기(리드 전용)
```

Vite 별칭: `@shared/*` → `../shared/*`, `@design/*` → `../design/*`, `@/*` → `src/*`. dev 서버는 저장소 루트까지 읽을 수 있게 `server.fs.allow` 를 열어 두었다.

## 1. 파일과 담당

**자기 담당 파일만 만들고 고친다.** 남의 파일은 읽기만. 새 파일은 자기 폴더 안에 만든다.

| 경로 | 담당 | 내용 |
| --- | --- | --- |
| `src/core/*` | 리드 | 순수 로직(DOM 금지). 펌웨어 C++ 와 같은 동작 — 테스트 벡터로 대조 |
| `src/app.ts`, `src/main.ts`, `src/shell/*`, `src/styles/*`, `index.html`, `vite.config.ts`, `package.json` | 리드 | App, 진입점, 툴바·3열 배치 |
| `src/watch/*` | watch 모듈 | 시계 에뮬레이터(베젤·측면 버튼·세 모드 화면·시트·토스트) |
| `src/pc/pc.ts`, `src/pc/pc.css` (+ `src/pc/` 새 파일) | pc 모듈 | 가상 PC(슬라이드 10장·가짜 VS Code·회의 창·커서) |
| `src/pc/hidLog.ts`, `src/pc/hidLog.css` | pc 모듈 | HID 로그 패널 |
| `src/input/*` | input 모듈 | IMU 입력원(드래그·폰·녹화 재생), 손목 움직임 패널, 툴바 입력 세그먼트 |
| `src/settings/*`, `src/install/*`, `install.html` | settings 모듈 | 설정 패널(keymap·gesture 편집·검증·내보내기), 시계에 설치 페이지 |
| `/shared/*.json`, `/shared/schema/*`, `/shared/test-vectors/*` | 리드 | 설정 원본·스키마·벡터 |

`package.json` 에 의존성을 더해야 하면 리드에게 요청한다(동시에 `npm install` 하면 lock 파일이 깨진다).

## 2. 데이터 흐름

```
 입력(시계 화면·측면 버튼·IMU)                 설정(keymap.json / gesture.json)
            │ app.dispatch(InputEvent)                  │ app.setConfig()
            ▼                                           ▼
   ┌──────────────── App (src/app.ts) ────────────────────────┐
   │  state ← core.step(state, input, {now, keymap, gesture})  │
   │  result.hid / dropped ──▶ app.hid (HidBus)                │
   │  result.events + state ──▶ app.subscribe(listener)        │
   └───────────────────────────────────────────────────────────┘
        │ hid.subscribe()               │ hid.subscribe(…, {includeDropped:true})   │ app.subscribe()
        ▼                               ▼                                           ▼
     가상 PC                         HID 로그(KEY/MOUSE/MEDIA + 버림)             시계 화면·툴바·로그 SYS 행
```

- 모듈끼리 서로 import 하지 않는다. 오직 `App` 으로 이야기한다.
- 상태는 `app.dispatch` 로만 바꾼다. `app.state` 는 읽기 전용(직접 수정 금지).
- **키 이름·단축키를 코드에 쓰지 않는다**(작업지시서: 키 배치는 keymap.json 에서만). 라벨·힌트는 `app.keymap` + `core/keymap.ts` 로 만든다. 가상 PC 가 받은 키를 해석할 때만 키 이름(RIGHT, F5 …)을 본다.

## 3. App API (`src/app.ts`)

```ts
class App {
  readonly hid: HidBus;                          // HID 이벤트 버스
  get state(): Readonly<CoreState>;              // 현재 상태
  get keymap(): Readonly<Keymap>;                // 현재 keymap (설정 화면 반영값)
  get gesture(): Readonly<GestureConfig>;        // 현재 gesture
  get config(): Readonly<{ keymap; gesture }>;
  get deviceName(): string;                      // BLE 장치 이름(기본 keymap.settings.deviceName)
  get connected(): boolean;

  now(): number;                                 // performance.now 기준 ms — IMU 샘플 t 도 이 기준
  showElapsed(): number;                         // 발표 경과 시간 ms (쇼 시작 전 0)

  dispatch(input: InputEvent, at?: number): StepResult;   // 입력 → 상태·HID·알림
  imu(sample: ImuSample): StepResult;                     // = dispatch({t:'imu', sample})
  subscribe(fn: (c: AppChange) => void): () => void;      // 반환값 호출 = 해지

  setConnected(connected: boolean): void;        // BLE 연결 흉내 (= dispatch({t:'connection'}))
  toggleConnected(): void;
  setConfig(cfg: Partial<{ keymap: Keymap; gesture: GestureConfig }>): void;  // 검증 통과한 값만
  resetConfig(which?: 'keymap' | 'gesture' | 'both'): void;                  // /shared 기본값으로
  setDeviceName(name: string): void;

  start(): void;  stop(): void;                  // 50ms tick 타이머(main.ts 가 start)
}

interface AppChange {
  state: CoreState;
  reason: 'input' | 'config' | 'prefs';
  input: InputEvent | null;     // reason 'input' 일 때
  result: StepResult | null;    // { state, hid: Emitted[], dropped: Emitted[], events: CoreEvent[] }
}
```

- `tick` 입력은 무엇인가 바뀌었을 때(알림·HID 가 있을 때)만 구독자에게 알린다. 경과 시간처럼 매초 바뀌는 표시는 각 모듈이 `requestAnimationFrame`/`setInterval` 로 `app.showElapsed()` 를 읽어 그린다.
- IMU 는 샘플마다 알림이 간다(초당 60~100회). 무거운 다시 그리기는 `change.input?.t === 'imu'` 일 때 건너뛰거나 rAF 로 묶는다.
- `localStorage` 에는 사용자 선택(모드·OS·앱·감도·장치 이름, 키 `wrist-sim.prefs.v1`)과 테마(`wrist-sim.theme`)만 저장한다. 모두 try/catch — 실패해도 동작한다. keymap/gesture 편집본 보관은 settings 모듈 몫(키 `wrist-sim.settings.*` 권장).

### HidBus (`src/core/hidBus.ts`)

```ts
interface HidRecord { at: number; ev: HidEvent; source: InputSource; action: ActionId | null; dropped: boolean }
hid.subscribe(fn: (r: HidRecord) => void, opts?: { includeDropped?: boolean }): () => void
```

- 기본 구독 = 실제로 PC 에 도착한 것만(가상 PC 용). `includeDropped: true` = 끊김으로 버린 것도(HID 로그 용, `r.dropped` 로 구분).
- 버린 이벤트는 쌓아 두지 않는다. 재연결해도 다시 나오지 않는다.

## 4. 타입 (`src/core/types.ts` 요약 — 원문이 기준)

```ts
type ModeId = 'present' | 'coding' | 'meeting';          // 디자인 data-mode 와 같은 id
type OsId = 'win' | 'mac';
type Mod = 'ctrl' | 'shift' | 'alt' | 'gui';            // mac Cmd = gui, Option = alt
interface Chord { mods: Mod[]; key: string }            // key = /shared/hid-usage.json keys 이름

type HidEvent =
  | { t: 'key'; mods: Mod[]; key: string }              // 누르고 떼기 한 번
  | { t: 'mouseMove'; dx: number; dy: number }          // 정수 px
  | { t: 'mouseButton'; button: 'left' | 'right' | 'middle'; down: boolean }
  | { t: 'consumer'; usage: number };

type InputEvent =
  | { t: 'tap'; x: number; y: number }                  // 시계 화면 410×502 좌표
  | { t: 'longPress'; x: number; y: number }            // 600ms (gesture.touch.holdMs)
  | { t: 'swipe'; dir: 'left' | 'right' | 'up' | 'down' }  // left = 다음 모드, down = 쇼 시트
  | { t: 'button'; id: 'boot' | 'pwr'; action: 'down' | 'up' | 'short' | 'long' }
  | { t: 'imu'; sample: { t: number; gx: number; gy: number; gz: number } }   // deg/s
  | { t: 'tick' }
  | { t: 'connection'; connected: boolean }
  | { t: 'setMode'; mode: ModeId } | { t: 'setApp'; mode: ModeId; app: AppId }
  | { t: 'setOs'; os: OsId } | { t: 'setSensitivity'; level: number }
  | { t: 'setLocked'; locked: boolean };

type InputSource = 'touch' | 'hold' | 'swipe' | 'sheet' | 'button' | 'gesture' | 'air' | 'system';
interface Emitted { ev: HidEvent; source: InputSource; action: ActionId | null }
interface StepResult { state: CoreState; hid: Emitted[]; dropped: Emitted[]; events: CoreEvent[] }
```

`CoreState` 주요 필드(화면 그리기용):

| 필드 | 뜻 |
| --- | --- |
| `mode`, `os`, `apps.{present,coding,meeting}` | 현재 모드·OS·모드별 앱 |
| `connected`, `everConnected` | BLE 연결(끊김 배너 / 연결 대기 전체화면 구분) |
| `locked` | 제스처 잠금 |
| `screenOn` | PWR 짧게 누름으로 끈 화면 |
| `sheet.open` | 쇼 시작/종료 시트 |
| `show.{running, startedAt, blackout}` | 쇼 진행·경과 시간 기준·암전 칩 |
| `meeting[app].{mic, camera, hand}` | 회의 추정 상태 `unknown/on/off`, `down/up` |
| `button` | 측면 버튼 누름 유지 중 정보(`downAt`, `air`, `longFired`) — 길게 누름 진행 막대용 |
| `air.active` | 에어마우스 중(포인터 링) |
| `sensitivity` | 설정값 |

`CoreEvent`(`change.result.events`) — 시계 피드백·SYS 로그용:
`mode, app, os, lock, connection, sheet, air, show, blackout, screen, sensitivity`,
`action{action, source, sent}`(플래시: `sent=false` 면 끊김 흔들림), `flick{dir}`, `flickRejected{reason}`,
`ignored{source:'gesture', reason:'locked'|'cooldown'}`,
`estimate{app, target, value, synced}`.

## 5. 코어 함수 (`src/core/*`, `@/core` 에서 import)

| 파일 | 공개 함수 |
| --- | --- |
| `config.ts` | `DEFAULT_KEYMAP`, `DEFAULT_GESTURE`, `defaultKeymap()`, `defaultGesture()` (깊은 복사) |
| `keymap.ts` | `resolveChord(keymap, mode, app, action, os): Chord \| null`, `listActions(keymap, mode, app)`, `findAction(…)`, `formatChord(chord, os): string`("Ctrl+Shift+P"/"Cmd+Shift+P"), `keyLabel(key, os)`, `parseChord(text)`, `chordToReport(chord) → {modifier, usage}`, `KEY_NAMES`, `isKnownKey`, `keyUsage`, `modBits` |
| `layout.ts` | `hitTest(mode, sheetOpen, x, y, keymap, codingApp)`, 좌표 상수 `SCREEN_W/H`, `STATUSBAR_H`, `PRESENT_ZONES`, `CODING_TILES`, `MEETING_CHIPS`, `MEETING_TILES`, `SHEET` — 시계 화면 그리기는 이 상수를 써서 판정 영역과 어긋나지 않게 한다 |
| `modeMachine.ts` | `initState(keymap, patch?)`, `step(state, input, ctx)`, `showElapsed(state, now)` |
| `gesture.ts` | `initFlick()`, `flickStep(state, sample, cfg)` — 설정 화면 실시간 그래프가 따로 돌려 볼 수 있다 |
| `airmouse.ts` | `initAirMouse()`, `airStart(now)`, `airStop()`, `airStep(state, sample, cfg, sensitivity)` |
| `imu.ts` | `initBias()`, `biasStep(…)`, `emaAlpha(dt, tau)`, `logicalAxis(v, axis, imuCfg)` |
| `hidBus.ts` | `HidBus`, `HidRecord` |
| `vectors.ts` | 테스트 벡터 실행기 `runMachineCase`, `runKeymapCase`, `partialMatch`, `deepMerge` |

알고리즘 세부(펌웨어와 같은 수식)는 `/shared/test-vectors/README.md` 3~6장이 기준이다.

## 6. 모듈 진입 시그니처 (main.ts 가 부른다 — 바꾸지 말 것)

```ts
// src/watch/watch.ts
export function mountWatch(root: HTMLElement, app: App): void;
// src/pc/pc.ts
export function mountPC(root: HTMLElement, app: App): void;
// src/pc/hidLog.ts
export function mountHidLog(root: HTMLElement, app: App): void;
// src/input/inputPanel.ts
export interface InputSlots { panel: HTMLElement; toolbar: HTMLElement; notice: HTMLElement }
export function mountInputPanel(slots: InputSlots, app: App): void;
// src/input/imuSources.ts
export interface ImuSource { readonly kind: 'drag' | 'phone' | 'replay'; readonly running: boolean; start(): void | Promise<void>; stop(): void }
export function createDragSource(app: App, pad: HTMLElement): ImuSource;
export function createPhoneSource(app: App): ImuSource;          // start() 는 click 핸들러 안에서 동기 호출
export function createReplaySource(app: App, samples: ImuSample[], opts?: { speed?: number; loop?: boolean }): ImuSource;
export function parseImuCsv(text: string): ImuSample[];          // 머리글 t_ms,gx,gy,gz (펌웨어 녹화 형식)
// src/settings/settingsPanel.ts
export interface SettingsHandle { open(): void; close(): void; readonly isOpen: boolean }
export function mountSettings(root: HTMLElement, app: App): SettingsHandle;
// src/install/install.ts — install.html 의 #install-root 를 채운다
```

`index.html` 자리: `#toolbar`(리드), `#notice-root`(input: 안내 띠, 지금은 비어 있음), `#watch-root`(watch), `#input-root`(input: 손목 움직임 패널), `#pc-root`(pc), `#log-root`(pc: 로그), `#settings-root`(settings).

### 모듈별 핵심 약속

- **watch**: 터치 판정(탭 이동 < `touch.tapMaxMovePx` & < `holdMs` / 길게 `holdMs` / 가로 스와이프 ≥ `swipeMinPx` & 세로 < `swipeMaxOffAxisPx`(또는 fling) / 상단 `topEdgePx` 안에서 시작해 아래로 `sheetPullMinPx` 이상 = `swipe down`)을 하고 **결과만** dispatch. 좌표는 축척을 되돌려 410×502 로. 측면 버튼은 원시 `down`/`up` 을 보낸다(Space = BOOT, P = PWR, 입력칸 포커스·`e.repeat` 제외). 길게 누름 진행 막대는 `state.button.downAt` 과 `gesture.button.longPressMs` 로.
- **pc**: `hid.subscribe` 만으로 반응. 커서는 `mouseMove` 누적, 클릭은 `mouseButton`. 연결 상태 알약은 `state.connected` 표시(토글은 툴바 `BLE` 버튼, 원하면 `app.toggleConnected()` 를 같이 걸어도 됨). 로그의 마우스 이동은 100ms 창으로 묶기.
- **input**: IMU 샘플 t 는 `app.now()` 기준. 녹화 재생은 첫 샘플을 재생 시작 시각에 맞춰 옮긴다. 판정은 코어가 한다.
- **settings**: ajv `Ajv2020` 로 `/shared/schema/keymap.schema.json`, `gesture.schema.json` 검증(`import schema from '@shared/schema/keymap.schema.json'`). 오류 0개일 때만 `app.setConfig`. 단축키 칸은 `parseChord`/`formatChord`.

## 7. CSS 규칙

- 토큰: `src/styles/tokens.css` 는 `design/tokens.css` 의 **복사본**이다(main.ts 가 import). 값은 고치지 말고 디자인팀에 요청 → 원본 수정 → 리드가 다시 복사.
- 각 모듈은 자기 CSS 파일만 쓰고 자기 TS 에서 import 한다: `src/watch/watch.css`, `src/pc/pc.css`, `src/pc/hidLog.css`, `src/input/input.css`, `src/settings/settings.css`, `src/install/install.css`. 셸은 `src/shell/shell.css`, 공통 바탕은 `src/styles/base.css`(리드).
- 클래스 접두사로 충돌을 막는다: watch `.watch-*`(시계 화면 안은 `.wc-*` 토큰 클래스 `.wc-screen`, `.wc-icon` 사용 가능), pc `.pc-*`, 로그 `.log-*`, input `.in-*`, settings `.set-*`, install `.inst-*`, 셸 `.sim-*`. 전역 태그 선택자(`button {}` 등)와 `:root` 변수 추가 금지.
- 색은 토큰만(`--wc-*` 시계 안, `--sim-*` 바깥). 시계 화면 루트에 `data-mode="present|coding|meeting"` 을 달면 `--wc-accent*` 가 바뀐다. 라이트/다크는 `--sim-*` 가 자동 처리(`<html data-theme>` 는 툴바가 관리).
- 움직임은 `transform`/`opacity` 만, 시간은 `--wc-motion-*` 토큰. `prefers-reduced-motion` 존중.
- 아이콘: main.ts 가 `design/icons.svg` 스프라이트를 `<body>` 맨 앞에 인라인한다 → `<svg class="wc-icon"><use href="#i-save"/></svg>`. install 페이지는 필요하면 `@design/icons.svg?raw` 를 직접 인라인.
- 화면 폭 375px 에서도 가로 스크롤이 생기면 안 된다(design/simulator-layout.md 2.1).

## 8. 테스트

- 코어 테스트: `src/core/*.test.ts` — 공유 벡터(`/shared/test-vectors/*.json`)와 스키마 검사. 모듈 담당자는 자기 폴더에 `*.test.ts` 를 둘 수 있다(vitest `environment: node` — DOM 이 필요하면 리드에게 jsdom 추가 요청).
- 1단계 체크리스트 ↔ 벡터: 튕김 인식/천천히 돌리기 무시(`gesture.json`), 버튼 놓으면 정지·드리프트 없음(`airmouse.json`), 연결 끊김 시 무시·몰아 보내지 않음(`mode.json`, `gesture.json`). 음성은 2026-10-17 에 기능과 함께 뺐다(`docs/research/gemini-later.md`).

## 9. 리드가 정한 것 (디자인·조사 문서와 다른 점)

| 항목 | 결정 | 이유 |
| --- | --- | --- |
| 모드 id | `present`/`coding`/`meeting` | design/tokens.css `data-mode` 와 일치(작업 지시의 `presentation` 대신) |
| 측면 주 버튼 | `boot` (keymap `settings.primaryButton`) | design/simulator-layout 4.2 제안 채택. PWR 짧게 = 화면 켜기·끄기 |
| 짧게/에어마우스 경계 | `airMouse.holdToStartMs = 250` | design/watch-presentation 2.5 제안 |
| 잠금 길게 누름 | 2000ms 동안 데드존 넘는 움직임이 없을 때만 | 에어마우스 중 손목을 움직이면 잠금 판정 취소 |
| gesture.json 키 이름 | `flick.cooldownMs`, `flick.peakThresholdDps`, `airMouse.lowpassTauMs`, `airMouse.deadzoneDps.{enter,exit}` | design/settings-install 2.7 의 '가정 키'(`thresholdDps`, `windowMs`, `lowpassHz`)는 이 이름으로 대체 |
| 에어마우스 곡선 | `px/s = gain·|ω|^1.3`, 감도 gain 0.6 / 1.0 / 1.6 | 조사 문서의 '샘플당 0.25배' 대신 dt 기반 px/s 로 바꿔 브라우저·펌웨어 결과를 맞춤 |
| 튕김 검출 | 조사 문서 4.2 + `quietBefore.guardMs`(50ms, 상승부 제외) + 인식 순간 히스토리 비움·재인식 금지 중 미기록 | 연달아 넘길 때 앞 튕김이 배경 RMS 를 올려 다음 튕김을 막던 문제 해결 |
| 암전 키 | `B` (keymap note 에 대안 `PERIOD`) | 지시서 값 유지, 한글 IME 실측 뒤 결정 |
| 음성 | 넣지 않는다(2026-10-17 최종 결정) | C6 메모리 부족 — 나중 계획은 docs/research/gemini-later.md |
