# 공유 테스트 벡터 (`/shared/test-vectors/`)

2026-10-16 · 개발팀 리드(1번)

시뮬레이션(TS, `sim/src/core/`)과 펌웨어 로직(C++17, `firmware/logic/`)이 **같은 입력에 같은 출력**을 내는지 확인하는 입력 → 기대 출력 묶음이다. 두 쪽 테스트가 이 폴더의 JSON 을 그대로 읽어 통과해야 한다(작업지시서 "로직 공유 원칙").

- 파일을 손으로 고치지 말고 `node sim/scripts/gen-test-vectors.mjs` 로 다시 만든다. 기대값은 그 스크립트 안에 사람이 적은 값이다(구현 출력을 복사하지 않음). IMU 파형만 코드로 만든다.
- 형식 스키마: `/shared/schema/test-vector.schema.json`
- 기준 설정: 저장소의 `/shared/keymap.json`, `/shared/gesture.json` (케이스의 `configPatch` 로 일부만 덮을 수 있음)
- TS 실행기: `sim/src/core/vectors.ts` (`runMachineCase`, `runKeymapCase`). C++ 실행기는 이 문서의 규칙을 그대로 따른다.

| 파일 | suite | 내용 | 1단계 체크리스트 |
| --- | --- | --- | --- |
| `mode.json` | mode | 모드 전환(시계→발표→실행→회의), 시계는 키 안 보냄, 발표 탭·암전·쇼 시트, 실행 타일 2쪽(탭·길게·쪽 넘기기), 회의 3앱·추정 상태, 잠금, 연결 끊김 | 세 모드 전환·모드별 키, 연결 끊김 무시 |
| `keymap.json` | keymap | (모드, 앱, OS, 동작) → 키 조합·표기·수정자 바이트·사용 코드 | 모드별 키 |
| `gesture.json` | gesture | 손목 튕김(바깥=다음, 안=이전), 천천히 돌리기·걷기·팔 휘두르기 무시, 0.8초 재인식 금지, 잠금·끊김 | 튕김 인식 / 천천히 돌리기 무시 |
| `airmouse.json` | airmouse | 데드존·EMA·감도, 버튼 놓으면 즉시 정지·드리프트 없음, 짧게 누름=다음, 길게=잠금 | 버튼 놓으면 멈추고 흐르지 않음 |
| `macro.json` | macro | 매크로 단계(chord/wait/text/consumer) → HID 보고서 열(누름→뗌, 글자 사이 15ms)·표기 | 실행 모드 타일 |

---

## 1. 파일 형식

### 1.1 상태 기계 suite (`mode`, `gesture`, `airmouse`)

음성(`voice.json`, `vnext.json`)은 2026-10-17 에 기능과 함께 지웠다.

```jsonc
{
  "suite": "gesture",
  "description": "…",
  "cases": [
    {
      "id": "flick-out-next",               // 고유 id
      "desc": "…", "checklist": "…",          // 선택: 설명, 작업지시서 체크리스트 항목
      "init": { "mode": "present", "connected": true },   // 선택: 초기 상태 덮어쓰기(아래 1.3)
      "configPatch": { "gesture": { "flick": { "peakThresholdDps": 400 } } }, // 선택: 설정 깊은 병합
      "steps": [
        { "at": 0, "input": { "t": "tap", "x": 350, "y": 300 }, "expect": { … } },   // 입력 한 개
        { "imu": { "start": 0, "dt": 10, "samples": [[gx, gy, gz], …] }, "expect": { … } } // IMU 묶음
      ]
    }
  ]
}
```

- **입력 단계** `{at, input}`: `step(state, input, {now: at})` 를 한 번 부른다. `input` 은 `InputEvent`(2장).
- **IMU 묶음 단계** `{imu: {start, dt, samples}}`: i 번째 샘플을 `{t:'imu', sample:{t: start + i·dt, gx, gy, gz}}` 로 차례로 넣는다. 이때 now = 샘플 t. 단위 deg/s(센서 축). 샘플이 6개 값 `[gx, gy, gz, ax, ay, az]` 이면 가속도(g, 중력 포함)도 넣는다 — 손목 튕김 기본 판정(accel)은 가속도가 있어야 동작한다. `gesture.json` 의 옛 각속도 합성 케이스는 생성기가 `configPatch.gesture.flick.detector = 'gyro'` 를 붙인다. 가속도 판정 벡터: `accel.json`(합성), `imu-real.json`(실기 녹화).
- `expect` 는 **그 단계에서 나온 출력 전체**(IMU 묶음이면 모든 샘플의 출력을 이어 붙인 것)에 대해 검사한다. `expect` 가 없으면 검사 없이 진행만 한다.

### 1.2 `expect` 필드 (모두 선택)

| 필드 | 비교 방법 |
| --- | --- |
| `hid` | 보낸 HID 전체 목록과 **순서·개수까지 정확히** 같아야 함(mouseMove 포함) |
| `keys` | 보낸 HID 중 mouseMove 를 뺀 목록과 정확히 같아야 함 |
| `dropped` | 연결 끊김으로 버린 HID 중 mouseMove 를 뺀 목록과 정확히 같아야 함 |
| `mouse` | 보낸 mouseMove 의 `dx` 합, `dy` 합, 보고 개수가 각각 `[최소, 최대]` 범위 안(경계 포함). 부동소수 차이로 1px 씩 달라질 수 있어 범위로 검사한다 |
| `droppedMouse.count` | 버린 mouseMove 개수 범위 |
| `state` | 단계 뒤 상태의 **부분 일치**: 적힌 필드만 비교, 객체는 재귀, 배열은 길이와 각 원소 |
| `events` | 시스템 알림(CoreEvent) 목록에 적힌 항목들이 **순서대로 부분열**로 들어 있어야 함. 각 항목은 부분 일치 |
| `noEvents` | 이 `t` 값을 가진 알림이 하나도 없어야 함 |

HID 이벤트 비교: `key` 는 `key` 이름이 같고 `mods` 가 **집합으로** 같으면 같다(순서 무관). `mouseButton` 은 `button`·`down`, `consumer` 는 `usage`.

### 1.3 초기 상태 (`init`)

`initState(keymap)` 의 기본값 위에 `init` 의 **최상위 필드를 얕게 덮어쓴다**(`meeting` 처럼 객체를 줄 때는 통째로 준다).

| 필드 | 기본값 |
| --- | --- |
| `mode` / `os` / `sensitivity` | `keymap.settings` 값 (`present` / `win` / `1`) |
| `apps` | 각 모드의 `defaultApp` (`powerpoint`, `vscode`, `zoom`) |
| `connected`, `everConnected` | `true`, `true` |
| `disconnectedAt` | `null` |
| `locked` | `false` |
| `screenOn` | `true` |
| `sheet` | `{open:false, lastActivity:0}` |
| `show` | `{running:false, startedAt:null, blackout:false}` |
| `meeting` | 세 앱 모두 `{mic:'unknown', camera:'unknown', hand:'down'}` |
| `button` | `null` |
| `bias`, `air`, `flick` | 0 으로 초기화된 필터 상태 |

### 1.4 키맵 suite (`keymap`)

```jsonc
{ "mode": "coding", "app": "vscode", "os": "mac", "action": "palette",
  "expect": { "chord": {"mods":["gui","shift"],"key":"P"}, "label": "Cmd+Shift+P", "modifier": "0x0A", "usage": "0x13" } }
```

- `chord: null` 이면 정의 없음(라벨 `""`). 예: 회의 모드에 `save` 동작은 없다.
- `modifier` = 수정자 비트 OR (`ctrl 0x01, shift 0x02, alt 0x04, gui 0x08`, `/shared/hid-usage.json`), `usage` = 키보드 페이지 사용 코드. 둘 다 대문자 16진 두 자리.
- `label` 표기 규칙: 수정자 순서 win = Ctrl, Alt, Shift, Win / mac = Ctrl, Cmd, Option, Shift. 이름 mac: gui→`Cmd`, alt→`Option`, ENTER→`Return`. 키 표시: RIGHT `→`, LEFT `←`, UP `↑`, DOWN `↓`, ESCAPE `Esc`, GRAVE `` ` ``, SLASH `/`, PERIOD `.` … (전체 표는 `sim/src/core/keymap.ts` `KEY_LABEL`). 구분자는 `+`.

---

## 2. 입력·출력 타입 (C++ 는 같은 이름의 구조체/열거형으로)

```ts
type HidEvent =
  | { t: 'key'; mods: ('ctrl'|'shift'|'alt'|'gui')[]; key: string }   // 누르고 떼기 한 번
  | { t: 'mouseMove'; dx: number; dy: number }                        // 정수 px, 아래가 +dy
  | { t: 'mouseButton'; button: 'left'|'right'|'middle'; down: boolean }
  | { t: 'consumer'; usage: number };

type InputEvent =
  | { t: 'tap'; x; y } | { t: 'longPress'; x; y }                     // 화면 410×502 좌표
  | { t: 'swipe'; dir: 'left'|'right'|'up'|'down' }
  | { t: 'button'; id: 'boot'|'pwr'; action: 'down'|'up'|'short'|'long' }
  | { t: 'imu'; sample: { t; gx; gy; gz } }                           // deg/s
  | { t: 'tick' }                                                     // 시간만 흐름(타이머 판정)
  | { t: 'connection'; connected: boolean }
  | { t: 'setMode'; mode } | { t: 'setApp'; mode; app } | { t: 'setOs'; os }
  | { t: 'setSensitivity'; level } | { t: 'setLocked'; locked };
```

CoreEvent(`events`)의 `t`: `mode, app, os, lock, connection, sheet, air, show, blackout, screen, sensitivity, action, flick, flickRejected, ignored, estimate, launchPage`. `ignored` 는 `source:'gesture'`, `reason:'locked'|'cooldown'` 뿐이다. 필드는 `sim/src/core/types.ts` 참고.

---

## 3. 상태 기계 규칙 (`step`)

처리 순서: **① 타이머 → ② 입력 → ③ 타이머**. now = 입력 단계의 `at`, IMU 면 샘플 t.

### 3.1 키 전송 공통 (`sendAction(action, source)`)

1. 현재 모드·현재 앱·OS 로 keymap 에서 키 조합을 찾는다. 없거나 `null` 이면 아무것도 하지 않는다.
2. 연결됨이면 `hid` 에, 끊김이면 `dropped` 에 넣는다. 알림 `{t:'action', action, source, sent}`.
3. **보냈을 때만** 부수효과: 발표 모드 `next/prev` → 암전 해제, `blackout` → 암전 홀짝 뒤집기, `showStart` → `show.running=true, startedAt=now` + 암전 해제, `showEnd` → `running=false, startedAt=null` + 암전 해제. 끊김 중에는 상태가 바뀌지 않는다(재연결 후 몰아서 보내지 않음).

### 3.2 타이머

- 시트 열림이고 `now − sheet.lastActivity ≥ timing.sheetAutoCloseMs` → 닫기.
- 버튼 누름 유지 중(`button` 있음), `held = now − downAt`:
  - 발표 모드 + 주 버튼(`keymap.settings.primaryButton`) + 아직 에어마우스 아님 + 길게 미발동 + `held ≥ airMouse.holdToStartMs` → 에어마우스 시작(필터 리셋, `since=now`), 튕김 검출기 리셋(재인식 금지 시각은 유지).
  - 길게 미발동 + `moved=false` + `held ≥ button.longPressMs` → 잠금 토글, 에어마우스 정지, `longFired=true`.

### 3.3 입력별

| 입력 | 처리 |
| --- | --- |
| `button down` | 다른 버튼이 눌려 있으면 무시. `button={id, downAt:now, air:false, moved:false, longFired:false}` |
| `button up` | 같은 id 일 때만. 에어마우스였으면 정지(필터 전부 0), 길게 발동했으면 아무것도, 아니면 **짧게 누름** |
| `button short` | 짧게 누름: 주 버튼이면 발표 모드에서 `next`(source `button`), 다른 모드는 없음. 주 버튼이 아니면 `screenOn` 뒤집기 |
| `button long` | 잠금 토글 |
| `tap` | 에어마우스 중 → `mouseButton left down` + `up`. 시트 열림 → 시트 버튼이면 그 동작(source `sheet`) 후 시트 닫기, 덮개(y ≥ 240)면 닫기, 그 밖은 `lastActivity=now`. 아니면 4장 영역 판정: 발표 좌=`prev`, 우=`next`, 중앙=없음 / 코딩 타일 i = 현재 앱 `actions[i]` / 회의 칩 = 앱 선택, 회의 타일 = 토글(3.4) |
| `longPress` | 에어마우스 중·시트 열림이면 무시. 발표 중앙 = `blackout`(source `hold`), 발표 좌우·코딩 타일 = 탭과 같은 동작(source `hold`), 회의 타일 = 표시만 맞추기(3.4), 회의 칩 = 앱 선택 |
| `swipe left/right` | 에어마우스 중·시트 열림이면 무시. `keymap.modeOrder` 에서 left=다음, right=이전(순환). 모드가 바뀌면 에어마우스 정지·시트 닫기·튕김 검출기 리셋 |
| `swipe down` | 발표 모드이고 시트 닫힘 → 시트 열기(`lastActivity=now`) |
| `swipe up` | 시트 열림 → 닫기 |
| `imu` | 영점 보정(5.1) → 에어마우스 중이면 5.2(데드존 넘으면 `button.moved=true`, 0 이 아닌 이동이면 mouseMove 전송, source `air`) / 아니고 발표 모드이고 버튼이 안 눌렸으면 5.3 튕김: 거부면 `flickRejected`, 재인식 금지 중 넘김이면 `ignored(cooldown)`, 인식이면 잠금 중 `ignored(locked)`, 아니면 `flick` + `sendAction(out→next, in→prev, 'gesture')` |
| `connection` | 값이 바뀔 때만. 끊김: `disconnectedAt=now`. 연결: `now − disconnectedAt > timing.meetingEstimateResetMs` 면 세 앱 추정값 초기화, `disconnectedAt=null`, `everConnected=true` |
| `setMode/App/Os/Sensitivity/Locked` | 그대로 반영(감도는 0..단계수−1 로 반올림·자르기, 없는 모드·앱 id 는 무시) |

### 3.4 회의 추정 상태

- 탭: 키를 **보냈을 때만** 마이크·카메라 `on↔off`(unknown 은 그대로), 손 `down↔up`. 알림 `estimate{synced:false}`.
- 길게 누름(키 안 보냄): 마이크·카메라 `off 면 on, 그 밖(unknown/on)은 off`, 손 `down↔up`. 알림 `estimate{synced:true}`.
- 추정값은 앱별로 따로 기억한다.

---

## 4. 화면 영역 (반열린 구간 `[시작, 끝)`, 좌표 410×502)

| 모드 | 영역 |
| --- | --- |
| 시트 열림(우선) | 쇼 시작 `x 24–195, y 92–212`, 쇼 종료 `x 215–386, y 92–212`, 덮개 `y ≥ 240` |
| 발표 | `y < 56` 없음(상태줄). `x < 120` 이전, `120 ≤ x < 290` 중앙, `x ≥ 290` 다음 |
| 코딩 | 타일 i(행 우선): `[16,64,199,196] [211,64,394,196] [16,208,199,340] [211,208,394,340] [16,352,199,484] [211,352,394,484]` (x0,y0,x1,y1) |
| 회의 | 마이크 `[16,124,394,344]`, 카메라 `[16,356,199,486]`, 손 `[211,356,394,486]`, 칩(appOrder 순) `[16,40,134,118] [146,40,264,118] [276,40,394,118]` |

---

## 5. 알고리즘 (모든 필터는 샘플 수가 아니라 dt(ms) 기반)

`emaAlpha(dt, tau) = (dt ≤ 0 or tau ≤ 0) ? 1 : 1 − exp(−dt/tau)`.
논리 축 값 = 센서 축(`imu.axisMap`) × `imu.axisSign`. 기본: yaw=gz, pitch=gx, roll=gy.

### 5.1 영점(bias) 추적 — `imu.biasCalib`

`enabled=false` 면 그대로 통과. 아니면 `dt = (첫 샘플 ? 0 : t − lastT)`, 세 축 모두 `|g − bias| < stillThresholdDps` 면 정지 — 정지 시작 시각을 기억하고 `t − stillSince ≥ stillMs` 이면 `bias += emaAlpha(dt, trackTauMs)·(g − bias)`. 정지가 아니면 `stillSince=null`. 출력 = `g − bias`.

### 5.2 에어마우스 — `airMouse`

- 시작 후 `t − since < startSuppressMs` 인 샘플은 **아무 상태도 바꾸지 않고** 출력 0(lastT 도 그대로).
- `dt = (lastT 없음 ? 0 : t − lastT)`. 감도 gain = `sensitivity[state.sensitivity].gain`.
- 축 X ← yaw, Y ← pitch(`invertY` 면 부호 반전). 축마다:
  1. 데드존(히스테리시스): 정지 중 `|w| ≥ enter` → 움직임, 움직임 중 `|w| < exit` → 정지. `w' = 움직임 ? sign(w)·(|w| − exit) : 0`
  2. `ema += emaAlpha(dt, lowpassTauMs)·(w' − ema)`; `|ema| < 0.01` 이면 `ema = 0`
  3. `d = gain · sign(ema) · |ema|^exponent · dt / 1000`, `[-maxPxPerReport, +maxPxPerReport]` 로 자름 (`sign(0)=0`)
  4. `resid += d; out = trunc(resid)`(0 쪽으로 버림); `resid −= out`
- 두 축 `out` 이 모두 0 이면 보고하지 않는다. 버튼을 놓으면 상태 전체(ema·resid·데드존 상태)를 0 으로 → 즉시 정지, 드리프트 없음.

### 5.3 손목 튕김 — `flick`

상태: `filt[3]`, `lastT`, `hist`(시각, 세 축 제곱합) 목록, `phase ∈ {idle, above, rebound, blocked}`, `sign`, `threshold`, `aboveStart`, `peak`, `peakT`, `reboundNeed`, `cooldownUntil`.

샘플마다:

1. `filt = (첫 샘플 ? raw : filt + emaAlpha(dt, prefilterTauMs)·(raw − filt))`.
2. `r` = 판정 축(`flick.axis`) 논리 값, `off` = 나머지 두 센서 축 filt 의 합성 크기 `√(a²+b²)`, `abs=|r|`, `sgn = r ≥ 0 ? +1 : −1`.
3. `RMS(from, to)` = hist 중 `from ≤ t' < to` 인 제곱합 평균의 제곱근(없으면 0).
4. **재인식 금지 중**(`t < cooldownUntil`): phase 가 blocked 가 아니면 — `abs ≥ peakThresholdDps` 이면 `cooldownHit`, phase=blocked, threshold=peakThresholdDps / 아니면 phase=idle. blocked 이면 `abs < threshold` 일 때 idle.
5. 아니면 phase 별:
   - **idle**: `thr = peakThresholdDps`, adaptive 면 `thr = max(thr, RMS(t − adaptive.windowMs, t)·rmsMultiplier)`. `abs ≥ thr` 이면 `threshold=thr` 로 두고 — `abs < axisDominanceRatio·off` → 거부 `notDominant` / `RMS(t − guardMs − windowMs, t − guardMs) ≥ quietBefore.maxRmsDps` → 거부 `notQuiet` / 아니면 phase=above, `sign=sgn, aboveStart=t, peak=abs, peakT=t`.
   - **above**: `sgn == sign` 이고 `abs ≥ threshold` 면 피크 갱신(더 크면 peak·peakT), 그리고 `t − aboveStart > maxAboveMs` 면 거부 `tooLong`. 그 밖(내려옴·부호 바뀜): `dur = t − aboveStart`; `dur < minAboveMs` → 거부 `tooShort` / `rebound.required=false` → 인식 / 아니면 phase=rebound, `reboundNeed = max(minRatio·peak, minDps)` 로 두고 **이 샘플로 바로** rebound 검사.
   - **rebound**: `−sign·r ≥ reboundNeed` → 인식 / `t − peakT > rebound.windowMs` → 거부 `noRebound`.
   - **blocked**: `abs < threshold` 면 idle.
   - 거부: phase = (`abs ≥ threshold` ? blocked : idle).
   - 인식: 방향 = `sign·outwardSign > 0 ? out : in`, `cooldownUntil = t + cooldownMs`, phase=idle, **hist 비움**.
6. 끝으로 `t ≥ cooldownUntil` 이면 hist 에 `(t, fx²+fy²+fz²)` 추가(재인식 금지 중에는 쌓지 않음). `t − max(adaptive.windowMs, quietBefore.windowMs)` 보다 오래된 항목 삭제.

---

## 6. (빈 장) 음성 판정

2026-10-17 에 음성 기능을 뺐다. 나중 계획: `docs/research/gemini-later.md`.

---

## 7. C++ 실행기 구현 메모

- JSON 은 시험 코드에서만 읽는다(호스트 빌드, 예: nlohmann/json). 펌웨어 본체는 `tools/` 가 만든 C 헤더를 쓴다.
- 부동소수는 `double`, `exp`·`pow`·`sqrt`·`trunc` 를 같은 순서로 계산한다. 이동량은 범위 검사라 1px 차이는 통과한다.
- 상태 부분 일치(`expect.state`)는 C++ 상태를 JSON 으로 직렬화해 같은 규칙으로 비교하면 가장 쉽다. 필드 이름은 TS `CoreState` 와 같게 둔다.
