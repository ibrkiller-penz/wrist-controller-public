// 공유 테스트 벡터 생성기 — /shared/test-vectors/*.json 을 다시 만든다.
// 실행: node sim/scripts/gen-test-vectors.mjs   (저장소 루트 또는 sim 폴더 어디서든)
// 기대값은 이 스크립트에 손으로 적은 값이다(구현 출력에서 복사하지 않는다). IMU 파형만 코드로 만든다.
// 벡터 형식: /shared/test-vectors/README.md
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../shared/test-vectors');
mkdirSync(outDir, { recursive: true });

const K = (key, mods = []) => ({ t: 'key', mods, key });
const RIGHT = K('RIGHT');
const LEFT = K('LEFT');

// ---------------------------------------------------------------- IMU 파형 도우미
// 축 배치(gesture.json 기본): roll = gy, pitch = gx, yaw = gz. 샘플 = [gx, gy, gz], 10ms 간격.
const zeros = (n) => Array.from({ length: n }, () => [0, 0, 0]);
const roll = (vals) => vals.map((v) => [0, v, 0]);
const r1 = (x) => Math.round(x * 10) / 10;
const r3 = (x) => Math.round(x * 1000) / 1000;
// 바깥 튕김: 짧고 강한 회전(피크 600) + 자연스러운 되돌림
const FLICK = [150, 400, 600, 600, 600, 400, 150, -100, -250, -300, -250, -150, -50, 0, 0];
const flick = (sign = 1) => roll(FLICK.map((v) => v * sign));
const series = (start, samples, dt = 10) => ({ imu: { start, dt, samples } });
const cat = (...parts) => parts.flat();

// 에어마우스는 기본 끔(gesture.json airMouse.enabled=false, 실기 피드백 6) — 에어마우스 케이스는 켠 설정으로 돌린다
const AIR_ON = { gesture: { airMouse: { enabled: true } } };

// 튕김 판정 기본은 accel 방식(실기 피드백 9). gesture.json 의 옛 각속도 합성 케이스는 gyro 방식으로 돌린다
const GYRO = { flick: { detector: 'gyro' } };
const withGyro = (c) => ({ ...c, configPatch: { ...(c.configPatch ?? {}), gesture: { ...GYRO, ...(c.configPatch?.gesture ?? {}), flick: { ...GYRO.flick, ...(c.configPatch?.gesture?.flick ?? {}) } } } });

// 손목 튕김은 기본 끔(flick.enabled=false, 실기 피드백 10) — 튕김 벡터는 켠 설정으로 돌린다(keepDefault: true 인 케이스만 기본 설정)
const withFlickOn = (c) => {
  if (c.keepDefault) {
    const { keepDefault: _k, ...rest } = c;
    return rest;
  }
  const gp = c.configPatch?.gesture ?? {};
  return { ...c, configPatch: { ...(c.configPatch ?? {}), gesture: { ...gp, flick: { enabled: true, ...(gp.flick ?? {}) } } } };
};

function write(name, obj) {
  if (obj.suite === 'airmouse') obj.cases = obj.cases.map((c) => ({ ...c, configPatch: c.configPatch ?? AIR_ON }));
  if (name === 'gesture.json') obj.cases = obj.cases.map(withGyro);
  if (obj.suite === 'gesture') obj.cases = obj.cases.map(withFlickOn);
  // IMU 샘플 [gx, gy, gz] · [gx, gy, gz, ax, ay, az] 은 한 줄로 적어 파일을 짧게 유지
  const text = JSON.stringify(obj, null, 2).replace(
    /\[\s*(-?[\d.e+-]+(?:,\s*-?[\d.e+-]+){2,5})\s*\]/g,
    (_m, inner) => `[${inner.split(/,\s*/).join(', ')}]`,
  );
  writeFileSync(resolve(outDir, name), text + '\n');
  console.log('wrote', name, obj.cases.length, 'cases');
}

const P = { mode: 'present' };

// ================================================================ gesture.json
write('gesture.json', {
  suite: 'gesture',
  description: '손목 튕김 검출(모드 상태 기계 경유). 기본 설정: 발표 모드, PowerPoint, Windows, 연결됨.',
  cases: [
    {
      id: 'flick-out-next',
      checklist: '손목 제스처: 튕김은 인식',
      desc: '정지 500ms 후 바깥(+roll) 튕김 → 다음(→) 1회',
      init: P,
      steps: [{ ...series(0, cat(zeros(50), flick(1), zeros(30))), expect: { hid: [RIGHT], events: [{ t: 'flick', dir: 'out' }] } }],
    },
    {
      id: 'flick-in-next',
      checklist: '손목 튕김: 안쪽도 다음(기본 flick.inAction next — 실기 피드백 8)',
      desc: '안쪽(-roll) 튕김 → 다음(→) 1회',
      init: P,
      steps: [{ ...series(0, cat(zeros(50), flick(-1), zeros(30))), expect: { hid: [RIGHT], events: [{ t: 'flick', dir: 'in' }] } }],
    },
    {
      id: 'flick-in-ignored',
      desc: 'flick.inAction = none 이면 안쪽 튕김은 인식(이벤트)만, 키 없음',
      init: P,
      configPatch: { gesture: { flick: { inAction: 'none' } } },
      steps: [{ ...series(0, cat(zeros(50), flick(-1), zeros(30))), expect: { hid: [], events: [{ t: 'flick', dir: 'in' }] } }],
    },
    {
      id: 'flick-in-prev',
      desc: 'flick.inAction = prev 로 바꾸면 안쪽(-roll) 튕김 → 이전(←) 1회',
      init: P,
      configPatch: { gesture: { flick: { inAction: 'prev' } } },
      steps: [{ ...series(0, cat(zeros(50), flick(-1), zeros(30))), expect: { hid: [LEFT], events: [{ t: 'flick', dir: 'in' }] } }],
    },
    {
      id: 'slow-rotation-ignored',
      checklist: '손목 제스처: 천천히 돌리기는 무시',
      desc: '120 deg/s 로 1초 동안 천천히 돌렸다가 되돌림 → 아무것도 보내지 않음',
      init: P,
      steps: [
        {
          ...series(0, cat(zeros(30), roll(Array.from({ length: 100 }, (_, i) => r1(120 * Math.min(1, i / 10, (99 - i) / 10)))), roll(Array.from({ length: 100 }, (_, i) => r1(-120 * Math.min(1, i / 10, (99 - i) / 10)))), zeros(30))),
          expect: { hid: [], noEvents: ['flick'] },
        },
      ],
    },
    {
      id: 'long-fast-rotation-ignored',
      checklist: '손목 제스처: 천천히 돌리기는 무시',
      desc: '400 deg/s 로 600ms 동안 크게 돌리기(짧지 않음) → tooLong 으로 거부',
      init: P,
      steps: [
        {
          ...series(0, cat(zeros(50), roll([100, 250].concat(Array(60).fill(400), [250, 100])), zeros(30))),
          expect: { hid: [], events: [{ t: 'flickRejected', reason: 'tooLong' }], noEvents: ['flick'] },
        },
      ],
    },
    {
      id: 'cooldown-800ms',
      checklist: '한 번 인식 후 0.8초 재인식 금지',
      desc: '튕김(500ms) → 400ms 뒤 두 번째 튕김은 무시 → 1.5초 뒤 세 번째 튕김은 인식',
      init: P,
      steps: [
        { ...series(0, cat(zeros(50), flick(1))), expect: { hid: [RIGHT] } },
        { ...series(650, cat(zeros(25), flick(1))), expect: { hid: [], events: [{ t: 'ignored', source: 'gesture', reason: 'cooldown' }] } },
        { ...series(1050, cat(zeros(100), flick(1), zeros(20))), expect: { hid: [RIGHT] } },
      ],
    },
    {
      id: 'two-flicks-1200ms-apart',
      desc: '1.2초 간격으로 연달아 바깥 튕김 2번 → 둘 다 인식(앞 튕김이 배경 RMS 를 올리지 않음)',
      init: P,
      steps: [{ ...series(0, cat(zeros(50), flick(1), zeros(105), flick(1), zeros(30))), expect: { hid: [RIGHT, RIGHT] } }],
    },
    {
      id: 'walking-ignored',
      checklist: '손목 제스처: 걷기·손짓은 무시',
      desc: '걷기 팔 흔들림(pitch 250 deg/s 1.8Hz + roll 100 + yaw 80) 3초 → 아무것도 보내지 않음',
      init: P,
      steps: [
        {
          ...series(
            0,
            Array.from({ length: 300 }, (_, i) => {
              const s = (i * 10) / 1000;
              return [r1(250 * Math.sin(2 * Math.PI * 1.8 * s)), r1(100 * Math.sin(2 * Math.PI * 1.8 * s + 0.7)), r1(80 * Math.sin(2 * Math.PI * 3.6 * s))];
            }),
          ),
          expect: { hid: [], noEvents: ['flick'] },
        },
      ],
    },
    {
      id: 'gesture-while-moving-arm-ignored',
      checklist: '손목 제스처: 걷기·손짓은 무시',
      desc: '팔 전체를 휘두르며(pitch 500) 동시에 roll 600 → 판정 축이 우세하지 않아 거부',
      init: P,
      steps: [
        {
          ...series(0, cat(zeros(50), FLICK.map((v) => [Math.abs(v) * 1.2, v, 0]), zeros(30))),
          expect: { hid: [], events: [{ t: 'flickRejected', reason: 'notDominant' }], noEvents: ['flick'] },
        },
      ],
    },
    {
      id: 'no-rebound-ignored',
      desc: '되돌림 없이 한 방향으로만 튕김 → noRebound 로 거부',
      init: P,
      steps: [{ ...series(0, cat(zeros(50), roll([150, 400, 600, 600, 600, 400, 150, 0]), zeros(40))), expect: { hid: [], events: [{ t: 'flickRejected', reason: 'noRebound' }] } }],
    },
    {
      id: 'locked-ignored',
      checklist: '제스처 잠금',
      desc: '잠금 중 튕김 → 보내지 않고 ignored(locked)',
      init: { ...P, locked: true },
      steps: [{ ...series(0, cat(zeros(50), flick(1), zeros(30))), expect: { hid: [], dropped: [], events: [{ t: 'ignored', source: 'gesture', reason: 'locked' }] } }],
    },
    {
      id: 'disconnected-dropped',
      checklist: '연결 끊김 시 넘기기 입력은 무시',
      desc: '끊김 중 튕김 → hid 없음, dropped 에 → 1개',
      init: { ...P, connected: false },
      steps: [{ ...series(0, cat(zeros(50), flick(1), zeros(30))), expect: { hid: [], dropped: [RIGHT] } }],
    },
    {
      id: 'launch-mode-no-flick',
      desc: '코딩 모드에서는 튕김 판정 안 함',
      init: { mode: 'launch' },
      steps: [{ ...series(0, cat(zeros(50), flick(1), zeros(30))), expect: { hid: [], noEvents: ['flick'] } }],
    },
  ],
});

// ================================================================ airmouse.json
// 주 버튼(boot)을 누른 채 손목 이동. 누른 뒤 250ms 에 에어마우스 시작, 그 뒤 50ms 출력 억제.
const yaw = (vals) => vals.map((v) => [0, 0, v]);
const pitch = (vals) => vals.map((v) => [v, 0, 0]);
const hold = (dir, ms) => Array(ms / 10).fill(dir);

write('airmouse.json', {
  suite: 'airmouse',
  description: '에어마우스(데드존+EMA+감도). 기본: 발표 모드, 감도 1(보통), 연결됨. 이동량은 범위로 검사(부동소수 차이 허용).',
  cases: [
    {
      id: 'move-then-release-stops',
      checklist: '에어마우스: 버튼을 놓으면 커서가 멈추고 흐르지 않는다',
      desc: '버튼 누름 → 300ms 정지 → yaw 100 deg/s 500ms → 정지 200ms → 놓음 → 손목을 계속 움직여도 이동 0',
      init: P,
      steps: [
        { at: 0, input: { t: 'button', id: 'boot', action: 'down' }, expect: { hid: [] } },
        { ...series(10, cat(zeros(30), yaw(hold(100, 500)), zeros(20))), expect: { keys: [], mouse: { dx: [150, 240], dy: [0, 0], count: [30, 60] }, state: { air: { active: true } } } },
        { at: 1010, input: { t: 'button', id: 'boot', action: 'up' }, expect: { hid: [], state: { air: { active: false, x: { ema: 0, resid: 0 } } }, events: [{ t: 'air', active: false }] } },
        { ...series(1020, yaw(hold(150, 500))), expect: { hid: [] } },
      ],
    },
    {
      id: 'release-mid-motion',
      checklist: '에어마우스: 버튼을 놓으면 즉시 정지',
      desc: '빠르게 움직이는 도중(300 deg/s) 놓음 → 놓은 뒤 샘플에서 이동 0, 필터 리셋',
      init: P,
      steps: [
        { at: 0, input: { t: 'button', id: 'boot', action: 'down' } },
        { ...series(10, cat(zeros(30), yaw(hold(300, 300)))), expect: { mouse: { dx: [200, 1000] } } },
        { at: 620, input: { t: 'button', id: 'boot', action: 'up' }, expect: { hid: [] } },
        { ...series(630, yaw(hold(300, 200))), expect: { hid: [] } },
        { at: 900, input: { t: 'button', id: 'boot', action: 'down' } },
        { ...series(910, zeros(60)), expect: { hid: [] } },
      ],
    },
    {
      id: 'no-drift-small-bias',
      checklist: '에어마우스: 커서가 흐르지(drift) 않아야 함',
      desc: '버튼을 3초 누른 채 가만히(자이로 영점 오차 gz 1.5 deg/s ± 0.4 떨림) → 이동 0',
      init: P,
      steps: [
        { at: 0, input: { t: 'button', id: 'boot', action: 'down' } },
        { ...series(10, Array.from({ length: 150 }, (_, i) => [r1(0.4 * Math.sin(i * 1.3)), r1(0.3 * Math.cos(i * 0.7)), r1(1.5 + 0.4 * Math.sin(i * 2.1))])), expect: { hid: [] } },
      ],
    },
    {
      id: 'deadzone-tremor',
      desc: '손떨림 수준(±1.8 deg/s 진동) → 데드존 안이라 이동 0',
      init: P,
      steps: [
        { at: 0, input: { t: 'button', id: 'boot', action: 'down' } },
        { ...series(10, Array.from({ length: 100 }, (_, i) => [r1(1.8 * Math.sin(i * 0.9)), 0, r1(1.8 * Math.cos(i * 1.1))])), expect: { hid: [] } },
      ],
    },
    {
      id: 'pitch-moves-y',
      desc: 'pitch 80 deg/s 400ms → 커서 Y 만 + 방향 이동',
      init: P,
      steps: [
        { at: 0, input: { t: 'button', id: 'boot', action: 'down' } },
        { ...series(10, cat(zeros(30), pitch(hold(80, 400)), zeros(10))), expect: { mouse: { dx: [0, 0], dy: [80, 160] } } },
      ],
    },
    {
      id: 'sensitivity-high',
      desc: '감도 2(높음)는 같은 움직임에서 보통보다 더 멀리 간다(gain 1.6)',
      init: { ...P, sensitivity: 2 },
      steps: [
        { at: 0, input: { t: 'button', id: 'boot', action: 'down' } },
        { ...series(10, cat(zeros(30), yaw(hold(100, 500)), zeros(20))), expect: { mouse: { dx: [250, 380], dy: [0, 0] } } },
      ],
    },
    {
      id: 'sensitivity-low',
      desc: '감도 0(낮음, gain 0.6)',
      init: { ...P, sensitivity: 0 },
      steps: [
        { at: 0, input: { t: 'button', id: 'boot', action: 'down' } },
        { ...series(10, cat(zeros(30), yaw(hold(100, 500)), zeros(20))), expect: { mouse: { dx: [90, 145], dy: [0, 0] } } },
      ],
    },
    {
      id: 'short-press-clock',
      checklist: 'BOOT 짧게 = 시계 모드(키 안 보냄). 다음 = 오른쪽 탭·손목 튕김',
      desc: '250ms 안에 뗌 → 시계 모드로, 키 없음, 에어마우스 시작 안 함',
      init: P,
      steps: [
        { at: 0, input: { t: 'button', id: 'boot', action: 'down' } },
        { ...series(10, zeros(10)), expect: { hid: [] } },
        { at: 120, input: { t: 'button', id: 'boot', action: 'up' }, expect: { hid: [], noEvents: ['air'], state: { mode: 'clock', prevMode: 'present' } } },
      ],
    },
    {
      id: 'tap-clicks-during-air',
      desc: '에어마우스 중 화면 탭 = 왼쪽 클릭(누름·뗌), 슬라이드 키는 안 보냄',
      init: P,
      steps: [
        { at: 0, input: { t: 'button', id: 'boot', action: 'down' } },
        { at: 300, input: { t: 'tick' }, expect: { state: { air: { active: true } } } },
        { at: 400, input: { t: 'tap', x: 350, y: 300 }, expect: { hid: [{ t: 'mouseButton', button: 'left', down: true }, { t: 'mouseButton', button: 'left', down: false }] } },
        { at: 500, input: { t: 'button', id: 'boot', action: 'up' }, expect: { hid: [] } },
      ],
    },
    {
      id: 'long-hold-still-locks',
      checklist: '측면 버튼 길게 누름(2초): 제스처 잠금 토글',
      desc: '움직이지 않고 2초 누름 → 잠금 켜짐, 에어마우스 종료, 뗄 때 아무것도 안 보냄',
      init: P,
      steps: [
        { at: 0, input: { t: 'button', id: 'boot', action: 'down' } },
        { ...series(10, zeros(199)), expect: { hid: [], state: { locked: false } } },
        { at: 2000, input: { t: 'tick' }, expect: { state: { locked: true, air: { active: false } }, events: [{ t: 'lock', locked: true }] } },
        { at: 2500, input: { t: 'button', id: 'boot', action: 'up' }, expect: { hid: [], state: { locked: true } } },
      ],
    },
    {
      id: 'long-hold-moving-no-lock',
      desc: '2초 동안 손목을 움직이며 누름 → 잠금 판정 취소(에어마우스 계속)',
      init: P,
      steps: [
        { at: 0, input: { t: 'button', id: 'boot', action: 'down' } },
        { ...series(10, cat(zeros(30), yaw(hold(60, 1800)))), expect: { state: { locked: false, air: { active: true } } } },
        { at: 2100, input: { t: 'tick' }, expect: { state: { locked: false } } },
        { at: 2200, input: { t: 'button', id: 'boot', action: 'up' }, expect: { hid: [] } },
      ],
    },
    {
      id: 'disconnected-air-dropped',
      checklist: '연결 끊김 시 입력은 보내지 않음',
      desc: '끊김 중 에어마우스 → hid 없음, 버린 이동만 있음',
      init: { ...P, connected: false },
      steps: [
        { at: 0, input: { t: 'button', id: 'boot', action: 'down' } },
        { ...series(10, cat(zeros(30), yaw(hold(100, 300)))), expect: { hid: [], droppedMouse: { count: [1, 100] } } },
      ],
    },
    {
      id: 'launch-hold-no-air',
      desc: '코딩 모드에서 버튼 누름 유지 → 에어마우스 없음, 2초에 잠금',
      init: { mode: 'launch' },
      steps: [
        { at: 0, input: { t: 'button', id: 'boot', action: 'down' } },
        { ...series(10, cat(zeros(30), yaw(hold(100, 300)))), expect: { hid: [], state: { air: { active: false } } } },
        { at: 2000, input: { t: 'tick' }, expect: { state: { locked: true } } },
        { at: 2100, input: { t: 'button', id: 'boot', action: 'up' }, expect: { hid: [] } },
      ],
    },
  ],
});

// ================================================================ 공용 도우미(버튼·틱)
const BTN = (at, id, action, expect) => ({ at, input: { t: 'button', id, action }, ...(expect ? { expect } : {}) });
const TICK = (at, expect) => ({ at, input: { t: 'tick' }, ...(expect ? { expect } : {}) });

// ================================================================ mode.json
const T = (at, x, y, expect) => ({ at, input: { t: 'tap', x, y }, expect });
const L = (at, x, y, expect) => ({ at, input: { t: 'longPress', x, y }, expect });
const S = (at, dir, expect) => ({ at, input: { t: 'swipe', dir }, expect });
// 타일 중심 좌표
// 실행 모드 타일 중심(LAUNCH_TILES: 행 y 64~188, 200~324, 336~460)
const TILE = { t0: [107, 126], t1: [302, 126], t2: [107, 262], t3: [302, 262], t4: [107, 398], t5: [302, 398] };
const DOTS = [205, 480];
const CHIP = { zoom: [75, 88], teams: [205, 88], meet: [335, 88] };
const MIC = [205, 234];
const CAM = [107, 421];
const HAND = [302, 421];
const WIN = (k) => K(k, ['gui']);
const MACRO = (...steps) => ({ t: 'macro', steps });
const chS = (mods, key) => ({ chord: { mods, key } });
const winR = (cmd) => MACRO(chS(['gui'], 'R'), { wait: 300 }, { text: cmd }, { wait: 50 }, chS([], 'ENTER'));
const spot = (name) => MACRO(chS(['gui'], 'SPACE'), { wait: 300 }, { text: name }, { wait: 300 }, chS([], 'ENTER'));

write('mode.json', {
  suite: 'mode',
  description: '모드 전환·시계·발표·실행·회의·시트·잠금·연결 상태. 기본: keymap.json settings(시계, Windows, PowerPoint/Zoom), 연결됨.',
  cases: [
    {
      id: 'swipe-cycle',
      checklist: '모드 전환',
      desc: '왼쪽 스와이프 = 다음 모드(시계→발표→실행→회의→시계), 오른쪽 = 이전',
      init: P,
      steps: [
        S(0, 'left', { hid: [], state: { mode: 'launch' }, events: [{ t: 'mode', mode: 'launch' }] }),
        S(100, 'left', { state: { mode: 'meeting' } }),
        S(200, 'left', { state: { mode: 'clock' } }),
        S(250, 'left', { state: { mode: 'present' } }),
        S(300, 'right', { state: { mode: 'clock' } }),
        S(400, 'right', { state: { mode: 'meeting' } }),
      ],
    },
    {
      id: 'default-start-clock',
      desc: '기본 시작 모드 = 시계(keymap settings.mode)',
      steps: [{ at: 0, input: { t: 'tick' }, expect: { state: { mode: 'clock', launchPage: 0 } } }],
    },
    {
      id: 'boot-short-clock-toggle',
      checklist: 'BOOT 짧게 = 시계 ↔ 직전 모드(모든 모드), 키 안 보냄',
      init: { mode: 'launch' },
      steps: [
        BTN(0, 'boot', 'down'),
        BTN(100, 'boot', 'up', { hid: [], state: { mode: 'clock', prevMode: 'launch' }, events: [{ t: 'mode', mode: 'clock' }] }),
        BTN(200, 'boot', 'down'),
        BTN(300, 'boot', 'up', { hid: [], state: { mode: 'launch' } }),
        S(400, 'left', { state: { mode: 'meeting' } }),
        S(500, 'left', { state: { mode: 'clock', prevMode: 'meeting' } }),
        BTN(600, 'boot', 'down'),
        BTN(700, 'boot', 'up', { hid: [], state: { mode: 'meeting' } }),
        { at: 800, input: { t: 'setMode', mode: 'present' }, expect: { state: { mode: 'present' } } },
        BTN(900, 'boot', 'down'),
        BTN(1000, 'boot', 'up', { hid: [], state: { mode: 'clock', prevMode: 'present' } }),
      ],
    },
    {
      id: 'boot-hold-air-and-lock-keep-mode',
      desc: '발표 모드(에어마우스 켬): BOOT 누른 채 = 에어마우스(모드 그대로), 2초 = 잠금(모드 그대로)',
      init: P,
      configPatch: AIR_ON,
      steps: [
        BTN(0, 'boot', 'down'),
        { at: 300, input: { t: 'tick' }, expect: { state: { air: { active: true } } } },
        BTN(500, 'boot', 'up', { hid: [], state: { mode: 'present', air: { active: false } } }),
        { at: 1000, input: { t: 'setMode', mode: 'launch' } },
        BTN(1100, 'boot', 'down'),
        { at: 3200, input: { t: 'tick' }, expect: { state: { locked: true } } },
        BTN(3300, 'boot', 'up', { hid: [], state: { mode: 'launch', locked: true } }),
      ],
    },
    {
      id: 'air-off-by-default',
      checklist: '에어마우스 기본 끔: BOOT 를 누르고 있어도 시작 안 함, 손목 튕김은 그대로',
      init: P,
      steps: [
        BTN(0, 'boot', 'down'),
        { at: 300, input: { t: 'tick' }, expect: { state: { air: { active: false } }, noEvents: ['air'] } },
        { at: 1500, input: { t: 'tick' }, expect: { state: { air: { active: false } } } },
        BTN(1600, 'boot', 'up', { hid: [], noEvents: ['air'], state: { mode: 'clock', air: { active: false } } }),
        { at: 1700, input: { t: 'setMode', mode: 'present' } },
        BTN(1800, 'boot', 'down'),
        { at: 3900, input: { t: 'tick' }, expect: { state: { locked: true, air: { active: false } } } },
        BTN(4000, 'boot', 'up', { hid: [], state: { mode: 'present', locked: true } }),
      ],
    },
    {
      id: 'pwr-3s-power-confirm',
      checklist: 'PWR 3초 = 전원을 끌까요? 확인, 손을 뗀 뒤 PWR 짧게 = 끄기(전원 끄기 요청)',
      init: P,
      steps: [
        BTN(0, 'pwr', 'down'),
        { at: 2999, input: { t: 'tick' }, expect: { state: { powerConfirm: null, locked: false } } },
        { at: 3000, input: { t: 'tick' }, expect: { state: { powerConfirm: { since: 3000 } }, events: [{ t: 'powerConfirm', open: true }] } },
        BTN(3200, 'pwr', 'up', { hid: [], state: { screenOn: true, powerConfirm: { since: 3000 } }, noEvents: ['screen', 'powerOff'] }),
        T(3500, 350, 260, { hid: [], state: { powerConfirm: { since: 3000 } } }),
        S(3600, 'left', { state: { mode: 'present' } }),
        BTN(4000, 'pwr', 'down'),
        BTN(4100, 'pwr', 'up', { hid: [], events: [{ t: 'powerConfirm', open: false }, { t: 'powerOff' }], state: { powerConfirm: null, screenOn: false } }),
      ],
    },
    {
      id: 'pwr-under-3s-screen-toggle',
      desc: 'PWR 를 3초 전에 떼면 지금처럼 화면 켜기/끄기(잠금 아님 — 잠금은 BOOT 2초)',
      init: P,
      steps: [BTN(0, 'pwr', 'down'), { at: 2500, input: { t: 'tick' }, expect: { state: { locked: false } } }, BTN(2900, 'pwr', 'up', { state: { screenOn: false, powerConfirm: null, locked: false } })],
    },
    {
      id: 'power-confirm-boot-cancels',
      desc: '확인 화면에서 BOOT 짧게 = 취소(시계 모드로 가지 않는다)',
      init: { mode: 'present', powerConfirm: { since: 0 } },
      steps: [BTN(100, 'boot', 'down'), BTN(200, 'boot', 'up', { hid: [], events: [{ t: 'powerConfirm', open: false }], noEvents: ['powerOff', 'mode'], state: { mode: 'present', powerConfirm: null } })],
    },
    {
      id: 'power-confirm-timeout',
      desc: '확인 화면 10초 무입력 = 취소',
      init: { mode: 'present', powerConfirm: { since: 0 } },
      steps: [
        { at: 9999, input: { t: 'tick' }, expect: { state: { powerConfirm: { since: 0 } } } },
        { at: 10000, input: { t: 'tick' }, expect: { state: { powerConfirm: null }, events: [{ t: 'powerConfirm', open: false }], noEvents: ['powerOff'] } },
      ],
    },
    {
      id: 'power-confirm-touch-buttons',
      desc: '확인 화면 [취소] 탭 = 취소, [끄기] 탭 = 끄기',
      init: { mode: 'launch', powerConfirm: { since: 0 } },
      steps: [
        T(100, 300, 350, { hid: [], events: [{ t: 'powerConfirm', open: false }], state: { powerConfirm: null } }),
        BTN(200, 'pwr', 'down'),
        { at: 3200, input: { t: 'tick' }, expect: { events: [{ t: 'powerConfirm', open: true }] } },
        BTN(3300, 'pwr', 'up'),
        T(3400, 100, 350, { hid: [], events: [{ t: 'powerOff' }], state: { powerConfirm: null, screenOn: false } }),
      ],
    },
    {
      id: 'pwr-3s-wakes-screen',
      desc: '화면이 꺼져 있어도 PWR 3초면 확인 화면을 켠다',
      init: { mode: 'clock', screenOn: false },
      steps: [BTN(0, 'pwr', 'down'), { at: 3000, input: { t: 'tick' }, expect: { state: { screenOn: true, powerConfirm: { since: 3000 } } } }],
    },
    {
      id: 'clock-sends-nothing',
      checklist: '시계 모드 — 키 안 보냄',
      init: { mode: 'clock' },
      steps: [
        T(200, 350, 300, { hid: [] }),
        T(300, 60, 300, { hid: [] }),
        L(400, 205, 300, { hid: [] }),
        S(500, 'down', { hid: [], state: { sheet: { open: false } } }),
        S(700, 'left', { state: { mode: 'present' } }),
      ],
    },
    {
      id: 'present-taps',
      checklist: '모드별 키 입력',
      desc: '오른쪽 탭 = →, 왼쪽 탭 = ←, 중앙 탭 = 없음, 상태줄 탭 = 없음',
      init: P,
      steps: [T(0, 350, 300, { hid: [RIGHT] }), T(100, 60, 300, { hid: [LEFT] }), T(200, 205, 300, { hid: [] }), T(300, 350, 20, { hid: [] })],
    },
    {
      id: 'present-blackout',
      desc: '중앙 길게 누름 = B(암전 토글). 암전 중 다음 슬라이드를 보내면 암전 표시 해제',
      init: P,
      steps: [
        L(0, 205, 300, { hid: [K('PERIOD')], state: { show: { blackout: true } } }),
        L(1000, 205, 300, { hid: [K('PERIOD')], state: { show: { blackout: false } } }),
        L(2000, 205, 300, { hid: [K('PERIOD')], state: { show: { blackout: true } } }),
        T(3000, 350, 300, { hid: [RIGHT], state: { show: { blackout: false } } }),
      ],
    },
    {
      id: 'show-sheet',
      desc: '아래로 스와이프 → 시트 → 쇼 시작(F5), 다시 열어 쇼 종료(Esc)',
      init: P,
      steps: [
        S(0, 'down', { hid: [], state: { sheet: { open: true } } }),
        T(500, 100, 150, { hid: [K('F5')], state: { sheet: { open: false }, show: { running: true, startedAt: 500 } } }),
        S(60000, 'down', { state: { sheet: { open: true } } }),
        T(60500, 300, 150, { hid: [K('ESCAPE')], state: { sheet: { open: false }, show: { running: false } } }),
      ],
    },
    {
      id: 'sheet-blocks-and-closes',
      desc: '시트 열림 중 좌우 스와이프·슬라이드 탭 무시, 덮개 탭으로 닫힘, 3초 무입력 자동 닫힘',
      init: P,
      steps: [
        S(0, 'down', { state: { sheet: { open: true } } }),
        S(100, 'left', { state: { mode: 'present', sheet: { open: true } } }),
        T(200, 350, 400, { hid: [], state: { sheet: { open: false } } }),
        S(1000, 'down', { state: { sheet: { open: true } } }),
        { at: 3999, input: { t: 'tick' }, expect: { state: { sheet: { open: true } } } },
        { at: 4000, input: { t: 'tick' }, expect: { state: { sheet: { open: false } }, events: [{ t: 'sheet', open: false }] } },
      ],
    },
    {
      id: 'show-start-mac-powerpoint',
      desc: 'macOS PowerPoint 쇼 시작 = Cmd+Shift+Return',
      init: { ...P, os: 'mac' },
      steps: [S(0, 'down'), T(100, 100, 150, { hid: [K('ENTER', ['gui', 'shift'])] })],
    },
    {
      id: 'show-start-slides',
      desc: 'Google Slides(Windows) 쇼 시작 = Ctrl+F5',
      init: P,
      steps: [{ at: 0, input: { t: 'setApp', mode: 'present', app: 'slides' }, expect: { state: { apps: { present: 'slides' } } } }, S(10, 'down'), T(100, 100, 150, { hid: [K('F5', ['ctrl'])] })],
    },
    {
      id: 'launch-apps-win',
      checklist: '실행 1쪽: Ctrl+Alt+1~6(PC 시작 메뉴 바로 가기 키 — 설치 페이지 스크립트)',
      init: { mode: 'launch' },
      steps: Object.values(TILE).map(([x, y], i) => T(i * 100, x, y, { hid: [K(String(i + 1), ['ctrl', 'alt'])], events: [{ t: 'action', source: 'touch', sent: true }] })),
    },
    {
      id: 'launch-apps-long-win',
      checklist: '실행 1쪽 길게 = Win+R 대안(크롬·파워포인트·엑셀만 — Claude·카카오톡·한글은 App Paths 가 없어 없음)',
      init: { mode: 'launch' },
      steps: [
        L(0, ...TILE.t0, { hid: [] }),
        L(100, ...TILE.t1, { hid: [] }),
        L(200, ...TILE.t2, { hid: [winR('chrome')] }),
        L(300, ...TILE.t3, { hid: [winR('powerpnt')] }),
        L(400, ...TILE.t4, { hid: [winR('excel')] }),
        L(500, ...TILE.t5, { hid: [] }),
      ],
    },
    {
      id: 'launch-apps-mac',
      desc: 'macOS: Spotlight(Cmd+Space → 영문 이름 → Return)',
      init: { mode: 'launch', os: 'mac' },
      steps: [T(0, ...TILE.t0, { hid: [spot('Claude')] }), T(100, ...TILE.t1, { hid: [spot('KakaoTalk')] }), L(200, ...TILE.t3, { hid: [] })],
    },
    {
      id: 'launch-page2-win',
      checklist: '실행 2쪽: 캡처·잠금·바탕화면·화면 전환·음소거·업무포털(주소 비면 비활성)',
      init: { mode: 'launch' },
      steps: [
        S(0, 'up', { hid: [], state: { launchPage: 1 }, events: [{ t: 'launchPage', page: 1 }] }),
        T(100, ...TILE.t0, { hid: [K('S', ['gui', 'shift'])] }),
        T(200, ...TILE.t1, { hid: [WIN('L')] }),
        T(300, ...TILE.t2, { hid: [WIN('D')] }),
        T(400, ...TILE.t3, { hid: [WIN('P')] }),
        T(500, ...TILE.t4, { hid: [MACRO({ consumer: 'MUTE' })] }),
        T(600, ...TILE.t5, { hid: [] }),
        L(700, ...TILE.t0, { hid: [] }),
      ],
    },
    {
      id: 'launch-page2-mac',
      init: { mode: 'launch', os: 'mac', launchPage: 1 },
      steps: [T(0, ...TILE.t0, { hid: [K('5', ['gui', 'shift'])] }), T(100, ...TILE.t1, { hid: [K('Q', ['ctrl', 'gui'])] }), T(200, ...TILE.t2, { hid: [] }), T(300, ...TILE.t3, { hid: [] })],
    },
    {
      id: 'launch-page-switch',
      desc: '쪽 전환: 세로 스와이프(위 = 다음, 아래 = 앞, 돌아감) 또는 아래 쪽 점 탭. 가로 스와이프는 모드 전환',
      init: { mode: 'launch' },
      steps: [
        S(0, 'down', { state: { launchPage: 1 } }),
        S(100, 'down', { state: { launchPage: 0 } }),
        T(200, ...DOTS, { hid: [], state: { launchPage: 1 } }),
        T(300, ...DOTS, { state: { launchPage: 0 } }),
        S(400, 'left', { state: { mode: 'meeting', launchPage: 0 } }),
      ],
    },
    {
      id: 'launch-gap-tap',
      desc: '타일 사이 틈(간격 12px) 탭 → 없음',
      init: { mode: 'launch' },
      steps: [T(0, 205, 126, { hid: [] }), T(100, 107, 194, { hid: [] })],
    },
    {
      id: 'launch-disconnected-dropped',
      checklist: '연결 끊김 시 실행 타일은 버림',
      init: { mode: 'launch', connected: false },
      steps: [T(0, ...TILE.t0, { hid: [], dropped: [K('1', ['ctrl', 'alt'])] }), L(100, ...TILE.t3, { hid: [], dropped: [winR('powerpnt')] })],
    },
    {
      id: 'meeting-apps',
      checklist: 'Zoom, Teams, Meet 마이크 토글',
      init: { mode: 'meeting' },
      steps: [
        T(0, ...MIC, { hid: [K('A', ['alt'])] }),
        T(100, ...CHIP.teams, { hid: [], state: { apps: { meeting: 'teams' } } }),
        T(200, ...MIC, { hid: [K('M', ['ctrl', 'shift'])] }),
        T(300, ...CAM, { hid: [K('O', ['ctrl', 'shift'])] }),
        T(400, ...HAND, { hid: [K('K', ['ctrl', 'shift'])] }),
        T(500, ...CHIP.meet, { state: { apps: { meeting: 'meet' } } }),
        T(600, ...MIC, { hid: [K('D', ['ctrl'])] }),
        T(700, ...CAM, { hid: [K('E', ['ctrl'])] }),
        T(800, ...HAND, { hid: [K('H', ['ctrl', 'alt'])] }),
        T(900, ...CHIP.zoom, { state: { apps: { meeting: 'zoom' } } }),
        T(1000, ...CAM, { hid: [K('V', ['alt'])] }),
        T(1100, ...HAND, { hid: [K('Y', ['alt'])] }),
      ],
    },
    {
      id: 'meeting-mac',
      init: { mode: 'meeting', os: 'mac' },
      steps: [
        T(0, ...MIC, { hid: [K('A', ['gui', 'shift'])] }),
        T(100, ...HAND, { hid: [K('Y', ['alt'])] }),
        T(200, ...CHIP.meet),
        T(300, ...HAND, { hid: [K('H', ['ctrl', 'gui'])] }),
      ],
    },
    {
      id: 'meeting-estimate',
      desc: '추정 상태: 처음 unknown, 탭해도 unknown 유지 → 길게 눌러 off 로 맞춤(키 안 보냄) → 탭하면 on. 손 들기는 down↔up. 앱별 따로 기억',
      init: { mode: 'meeting' },
      steps: [
        T(0, ...MIC, { hid: [K('A', ['alt'])], state: { meeting: { zoom: { mic: 'unknown' } } } }),
        L(1000, ...MIC, { hid: [], state: { meeting: { zoom: { mic: 'off' } } }, events: [{ t: 'estimate', target: 'mic', value: 'off', synced: true }] }),
        T(2000, ...MIC, { hid: [K('A', ['alt'])], state: { meeting: { zoom: { mic: 'on' } } } }),
        T(3000, ...HAND, { state: { meeting: { zoom: { hand: 'up' } } } }),
        T(4000, ...CHIP.teams, { state: { meeting: { teams: { mic: 'unknown', hand: 'down' }, zoom: { mic: 'on' } } } }),
      ],
    },
    {
      id: 'disconnected-no-burst',
      checklist: '연결 끊김 시 넘기기 입력은 무시(재연결 후 몰아서 보내지 않음)',
      init: P,
      steps: [
        { at: 0, input: { t: 'connection', connected: false }, expect: { state: { connected: false }, events: [{ t: 'connection', connected: false }] } },
        T(100, 350, 300, { hid: [], dropped: [RIGHT] }),
        { at: 150, input: { t: 'button', id: 'boot', action: 'short' }, expect: { hid: [], dropped: [], state: { mode: 'clock' } } },
        { at: 160, input: { t: 'button', id: 'boot', action: 'short' }, expect: { hid: [], dropped: [], state: { mode: 'present' } } },
        L(200, 205, 300, { hid: [], dropped: [K('PERIOD')], state: { show: { blackout: false } } }),
        { at: 1000, input: { t: 'connection', connected: true }, expect: { hid: [], dropped: [], state: { connected: true } } },
        T(1100, 350, 300, { hid: [RIGHT] }),
      ],
    },
    {
      id: 'disconnected-meeting-no-estimate',
      desc: '끊김 중 회의 타일 탭 → 버림, 추정값 변화 없음',
      init: { mode: 'meeting', connected: false, meeting: { zoom: { mic: 'off', camera: 'unknown', hand: 'down' }, teams: { mic: 'unknown', camera: 'unknown', hand: 'down' }, meet: { mic: 'unknown', camera: 'unknown', hand: 'down' } } },
      steps: [T(0, ...MIC, { hid: [], dropped: [K('A', ['alt'])], state: { meeting: { zoom: { mic: 'off' } } } })],
    },
    {
      id: 'meeting-estimate-reset-after-30s',
      desc: '30초 넘게 끊겼다 재연결 → 마이크·카메라 unknown, 손 down',
      init: { mode: 'meeting', meeting: { zoom: { mic: 'on', camera: 'off', hand: 'up' }, teams: { mic: 'off', camera: 'unknown', hand: 'down' }, meet: { mic: 'unknown', camera: 'unknown', hand: 'down' } } },
      steps: [
        { at: 0, input: { t: 'connection', connected: false } },
        { at: 10000, input: { t: 'connection', connected: true }, expect: { state: { meeting: { zoom: { mic: 'on' } } } } },
        { at: 20000, input: { t: 'connection', connected: false } },
        { at: 50001, input: { t: 'connection', connected: true }, expect: { state: { meeting: { zoom: { mic: 'unknown', camera: 'unknown', hand: 'down' }, teams: { mic: 'unknown' } } } } },
      ],
    },
    {
      id: 'lock-keeps-touch',
      checklist: '잠금은 제스처만 막고 터치·버튼은 그대로',
      init: { mode: 'launch' },
      steps: [
        { at: 0, input: { t: 'button', id: 'boot', action: 'down' } },
        { at: 2000, input: { t: 'tick' }, expect: { state: { locked: true }, events: [{ t: 'lock', locked: true }] } },
        { at: 2100, input: { t: 'button', id: 'boot', action: 'up' }, expect: { hid: [] } },
        T(2200, ...TILE.t0, { hid: [K('1', ['ctrl', 'alt'])] }),
        S(2300, 'right', { state: { mode: 'present' } }),
        T(2400, 350, 300, { hid: [RIGHT] }),
        { at: 2600, input: { t: 'button', id: 'boot', action: 'long' }, expect: { state: { locked: false } } },
      ],
    },
    {
      id: 'pwr-short-screen',
      desc: 'PWR 짧게 = 화면 켜기·끄기(키 안 보냄)',
      init: P,
      steps: [
        { at: 0, input: { t: 'button', id: 'pwr', action: 'down' } },
        { at: 100, input: { t: 'button', id: 'pwr', action: 'up' }, expect: { hid: [], state: { screenOn: false } } },
      ],
    },
    {
      id: 'set-os-and-sensitivity',
      init: P,
      steps: [
        { at: 0, input: { t: 'setOs', os: 'mac' }, expect: { state: { os: 'mac' } } },
        { at: 10, input: { t: 'setSensitivity', level: 5 }, expect: { state: { sensitivity: 2 } } },
        { at: 20, input: { t: 'setMode', mode: 'meeting' }, expect: { state: { mode: 'meeting' } } },
      ],
    },
  ],
});

// ================================================================ keymap.json
const R = (mode, app, os, action, chord, label, modifier, usage) => ({ mode, app, os, action, expect: chord === null ? { chord: null, label: '' } : { chord, label, modifier, usage } });
const C = (mods, key) => ({ mods, key });
write('keymap.json', {
  suite: 'keymap',
  description: '키맵 해석: (모드, 앱, OS, 동작) → 키 조합·표시 문자열·HID 수정자 바이트·사용 코드. 근거: docs/research/shortcuts.md 3장.',
  cases: [
    R('present', 'powerpoint', 'win', 'next', C([], 'RIGHT'), '→', '0x00', '0x4F'),
    R('present', 'powerpoint', 'win', 'prev', C([], 'LEFT'), '←', '0x00', '0x50'),
    R('present', 'powerpoint', 'win', 'blackout', C([], 'PERIOD'), '.', '0x00', '0x37'),
    R('present', 'powerpoint', 'win', 'showStart', C([], 'F5'), 'F5', '0x00', '0x3E'),
    R('present', 'powerpoint', 'mac', 'showStart', C(['gui', 'shift'], 'ENTER'), 'Cmd+Shift+Return', '0x0A', '0x28'),
    R('present', 'powerpoint', 'win', 'showEnd', C([], 'ESCAPE'), 'Esc', '0x00', '0x29'),
    R('present', 'slides', 'win', 'showStart', C(['ctrl'], 'F5'), 'Ctrl+F5', '0x01', '0x3E'),
    R('present', 'slides', 'mac', 'showStart', C(['gui'], 'ENTER'), 'Cmd+Return', '0x08', '0x28'),
    R('launch', 'launcher', 'win', 'claude', C(['ctrl', 'alt'], '1'), 'Ctrl+Alt+1', '0x05', '0x1E'),
    R('launch', 'launcher', 'win', 'hwp', C(['ctrl', 'alt'], '6'), 'Ctrl+Alt+6', '0x05', '0x23'),
    R('launch', 'launcher', 'win', 'capture', C(['gui', 'shift'], 'S'), 'Shift+Win+S', '0x0A', '0x16'),
    R('launch', 'launcher', 'mac', 'capture', C(['gui', 'shift'], '5'), 'Cmd+Shift+5', '0x0A', '0x22'),
    R('launch', 'launcher', 'win', 'lock', C(['gui'], 'L'), 'Win+L', '0x08', '0x0F'),
    R('launch', 'launcher', 'mac', 'lock', C(['ctrl', 'gui'], 'Q'), 'Ctrl+Cmd+Q', '0x09', '0x14'),
    R('launch', 'launcher', 'win', 'desktop', C(['gui'], 'D'), 'Win+D', '0x08', '0x07'),
    R('launch', 'launcher', 'mac', 'desktop', null),
    R('launch', 'launcher', 'win', 'display', C(['gui'], 'P'), 'Win+P', '0x08', '0x13'),
    R('launch', 'launcher', 'win', 'mute', null),
    R('meeting', 'zoom', 'win', 'mic', C(['alt'], 'A'), 'Alt+A', '0x04', '0x04'),
    R('meeting', 'zoom', 'mac', 'mic', C(['gui', 'shift'], 'A'), 'Cmd+Shift+A', '0x0A', '0x04'),
    R('meeting', 'zoom', 'win', 'camera', C(['alt'], 'V'), 'Alt+V', '0x04', '0x19'),
    R('meeting', 'zoom', 'mac', 'hand', C(['alt'], 'Y'), 'Option+Y', '0x04', '0x1C'),
    R('meeting', 'teams', 'win', 'mic', C(['ctrl', 'shift'], 'M'), 'Ctrl+Shift+M', '0x03', '0x10'),
    R('meeting', 'teams', 'win', 'camera', C(['ctrl', 'shift'], 'O'), 'Ctrl+Shift+O', '0x03', '0x12'),
    R('meeting', 'teams', 'mac', 'hand', C(['gui', 'shift'], 'K'), 'Cmd+Shift+K', '0x0A', '0x0E'),
    R('meeting', 'meet', 'win', 'mic', C(['ctrl'], 'D'), 'Ctrl+D', '0x01', '0x07'),
    R('meeting', 'meet', 'win', 'camera', C(['ctrl'], 'E'), 'Ctrl+E', '0x01', '0x08'),
    R('meeting', 'meet', 'win', 'hand', C(['ctrl', 'alt'], 'H'), 'Ctrl+Alt+H', '0x05', '0x0B'),
    R('meeting', 'meet', 'mac', 'hand', C(['ctrl', 'gui'], 'H'), 'Ctrl+Cmd+H', '0x09', '0x0B'),
    R('meeting', 'zoom', 'win', 'claude', null),
  ],
});

// ================================================================ macro.json
const KB = (mod, usage) => ({ r: 'kbd', mod, usage });
const UP = KB(0, 0);
const WT = (ms) => ({ r: 'wait', ms });
write('macro.json', {
  suite: 'macro',
  description: '매크로 단계 → HID 보고서 열(키보드 [수정자, 키] 누름 → [0,0] 뗌, 글자 사이 15ms, 소비자 키 → 0). 근거: docs/research/launcher.md 3장.',
  cases: [
    {
      id: 'win-r-run',
      desc: 'Win+R → 300ms → "ex" → 50ms → Enter',
      steps: [chS(['gui'], 'R'), { wait: 300 }, { text: 'ex' }, { wait: 50 }, chS([], 'ENTER')],
      expect: { reports: [KB(0x08, 0x15), UP, WT(300), KB(0, 0x08), UP, WT(15), KB(0, 0x1b), UP, WT(50), KB(0, 0x28), UP], label: 'Win+R → ex → Enter' },
    },
    {
      id: 'text-shift-and-symbols',
      desc: '대문자·기호는 Shift, 콜론 = Shift+SEMICOLON, 슬래시 = SLASH, 공백 = SPACE',
      steps: [{ text: 'A:/ 1' }],
      expect: { reports: [KB(0x02, 0x04), UP, WT(15), KB(0x02, 0x33), UP, WT(15), KB(0, 0x38), UP, WT(15), KB(0, 0x2c), UP, WT(15), KB(0, 0x1e), UP] },
    },
    {
      id: 'consumer-mute',
      steps: [{ consumer: 'MUTE' }],
      expect: { reports: [{ r: 'consumer', usage: 0xe2 }, { r: 'consumer', usage: 0 }], label: 'Mute' },
    },
    {
      id: 'mac-spotlight',
      os: 'mac',
      steps: [chS(['gui'], 'SPACE'), { wait: 300 }, { text: 'Excel' }, { wait: 300 }, chS([], 'ENTER')],
      expect: {
        reports: [KB(0x08, 0x2c), UP, WT(300), KB(0x02, 0x08), UP, WT(15), KB(0, 0x1b), UP, WT(15), KB(0, 0x06), UP, WT(15), KB(0, 0x08), UP, WT(15), KB(0, 0x0f), UP, WT(300), KB(0, 0x28), UP],
        label: 'Cmd+Space → Excel → Return',
      },
    },
    {
      id: 'wait-clamped',
      desc: '대기는 0~3000ms 로 자른다',
      steps: [{ wait: 5000 }, chS(['ctrl'], 'T')],
      expect: { reports: [WT(3000), KB(0x01, 0x17), UP], label: 'Ctrl+T' },
    },
  ],
});

// ================================================================ imu-real.json
// 1호기 실기 녹화(2026-10-18, sim/public/samples/imu_real_flick_2026-10-18.csv, 원본 docs/imu_real_flick_2026-10-18_raw.txt).
// 기본 accel 방식(중력 제거 가속도 hp ≥ 1.0g): 세게 튕긴 9번 = 다음 9회, 끝의 천천히 구간 0회.
// 샘플 = [gx, gy, gz, ax, ay, az](가속도 g). 간격은 녹화 그대로 10ms 고정이다.
{
  const csv = readFileSync(resolve(here, '../public/samples/imu_real_flick_2026-10-18.csv'), 'utf8');
  const rows = csv.split(/\r?\n/).filter((l) => /^\d/.test(l)).map((l) => l.split(',').map(Number));
  const SPLIT = 43000; // 이 시각부터 끝까지 = 천천히 움직인 구간
  const toS = (rs) => rs.map((r) => [r[1], r[2], r[3], r[4], r[5], r[6]]);
  const a = rows.filter((r) => r[0] < SPLIT);
  const b = rows.filter((r) => r[0] >= SPLIT);
  write('imu-real.json', {
    suite: 'gesture',
    description: '실기 IMU 녹화 재생(1호기 2026-10-18). 기본 설정(accel 방식, 발표 모드). 세게 튕긴 9번 = 다음 9회, 끝의 천천히 구간 = 0회.',
    cases: [
      {
        id: 'real-flick-9-next',
        checklist: '실기 녹화: 손목 튕김 9회 = 다음 9회',
        init: P,
        steps: [
          { imu: { start: a[0][0], dt: 10, samples: toS(a) }, expect: { hid: Array(9).fill(RIGHT) } },
          { imu: { start: b[0][0], dt: 10, samples: toS(b) }, expect: { hid: [], noEvents: ['flick'] } },
        ],
      },
    ],
  });
}

// ================================================================ accel.json
// accel 방식 합성 파형(10ms 간격, 각속도 0, 중력 az = 1g). 실측(docs/imu_real_flick_2026-10-18_raw.txt):
// 세게 튕김 hp 2.8~4.6g, 약한 튕김 1.35~1.84g, 가만히 0.01g, 천천히 0.04g, 튕김 사이 0.07g.
{
  const A = (ax, ay, az) => [0, 0, 0, r3(ax), r3(ay), r3(az)];
  const still = (n, t0 = 0) => Array.from({ length: n }, (_, i) => A(0.004 * Math.sin((t0 + i) * 1.7), 0.003 * Math.cos((t0 + i) * 1.1), 1 + 0.004 * Math.sin((t0 + i) * 0.9)));
  // 걷기: 2Hz 발 디딤 충격(az +0.4g, 40ms 삼각) + 팔 흔들림(ax 0.3g 사인 2Hz), 30초
  const walk = Array.from({ length: 3000 }, (_, i) => {
    const t = i * 10;
    const ph = t % 500;
    const impact = ph < 40 ? 0.4 * (1 - Math.abs(ph - 20) / 20) : 0;
    return A(0.3 * Math.sin((2 * Math.PI * t) / 500), 0.05 * Math.sin((2 * Math.PI * t) / 1000), 1 + impact);
  });
  // 약한 튕김: ax 반사인 피크 1.3g, 120ms
  const weak = Array.from({ length: 12 }, (_, i) => A(1.3 * Math.sin((Math.PI * (i + 0.5)) / 12), 0, 1));
  // 긴 흔들기: 1.2g 로 600ms 동안 손목을 빙빙(10Hz 원운동 — hp 가 600ms 내내 1.0g 위) → tooLong
  const shake = Array.from({ length: 60 }, (_, i) => A(1.2 * Math.cos((2 * Math.PI * i) / 10), 1.2 * Math.sin((2 * Math.PI * i) / 10), 1));
  write('accel.json', {
    suite: 'gesture',
    description: 'accel 방식 튕김(기본) 합성 파형: 가만히 0회, 걷기 30초 0회, 약한 튕김(1.3g 120ms) 1회, 긴 흔들기(1.2g 600ms) 0회. 발표 모드.',
    cases: [
      { id: 'accel-still-none', desc: '가만히 3초 → 0회', init: P, steps: [{ ...series(0, still(300)), expect: { hid: [], noEvents: ['flick'] } }] },
      {
        id: 'flick-off-by-default',
        checklist: '손목 튕김 기본 끔(flick.enabled false): 튕겨도 아무것도 안 보냄',
        desc: '기본 설정(튕김 꺼짐)에서 약한 튕김 → 판정 자체를 안 함(이벤트·키 없음)',
        init: P,
        keepDefault: true,
        steps: [{ ...series(0, cat(still(100), weak, still(100, 112))), expect: { hid: [], noEvents: ['flick', 'flickRejected'] } }],
      },
      {
        id: 'accel-walk-none',
        checklist: '손목 제스처: 걷기는 무시(accel)',
        desc: '걷기 30초(2Hz 0.4g 충격 + 0.3g 흔들림) → 0회',
        init: P,
        steps: [{ ...series(0, cat(still(100), walk)), expect: { hid: [], noEvents: ['flick'] } }],
      },
      {
        id: 'accel-weak-flick-next',
        checklist: '손목 튕김(accel): 약한 튕김도 다음',
        desc: '가만히 1초 뒤 약한 튕김(피크 1.3g, 120ms) → 다음 1회, 이벤트에 hp 피크',
        init: P,
        steps: [{ ...series(0, cat(still(100), weak, still(100, 112))), expect: { hid: [RIGHT], events: [{ t: 'flick' }] } }],
      },
      {
        id: 'accel-long-shake-ignored',
        desc: '긴 흔들기(1.2g, 600ms) → 0회(임계 넘은 시간 250ms 초과 = tooLong)',
        init: P,
        steps: [{ ...series(0, cat(still(100), shake, still(100, 160))), expect: { hid: [], noEvents: ['flick'], events: [{ t: 'flickRejected', reason: 'tooLong' }] } }],
      },
      {
        id: 'accel-cooldown-800',
        desc: '약한 튕김 두 번을 0.5초 간격 → 1회(재인식 금지 800ms), 1초 간격 → 2회',
        init: P,
        steps: [
          { ...series(0, cat(still(100), weak, still(38, 112), weak, still(100, 162))), expect: { hid: [RIGHT] } },
          { ...series(2620, cat(still(100, 262), weak, still(100, 374))), expect: { hid: [RIGHT] } },
        ],
      },
      {
        id: 'accel-not-present-mode',
        desc: '발표 모드가 아니면(시계) 튕김 무시',
        init: { mode: 'clock' },
        steps: [{ ...series(0, cat(still(100), weak, still(100, 112))), expect: { hid: [], noEvents: ['flick'] } }],
      },
      {
        id: 'accel-locked-ignored',
        desc: '잠금 중 튕김 = 무시(키 없음)',
        init: { mode: 'present', locked: true },
        steps: [{ ...series(0, cat(still(100), weak, still(100, 112))), expect: { hid: [], events: [{ t: 'ignored', source: 'gesture', reason: 'locked' }] } }],
      },
    ],
  });
}

// ================================================================ touch.json
// 원시 터치 샘플 → TouchGesture(sim core/touchGesture.ts = firmware wc::TouchGesture) → 코어 입력 → HID.
// 판정 상수는 design/v2/README.md 1.4(gesture.json touch). 단계: { at, touch: 'down'|'move'|'up', x, y } 또는 { at, poll: true }.
// expect.inputs = 그 단계에서 TouchGesture 가 낸 코어 입력 전체(부분 일치, 개수까지), expect.settingsRequest = 설정 화면 요청.
{
  const D = (at, x, y, expect) => ({ at, touch: 'down', x, y, ...(expect ? { expect } : {}) });
  const M = (at, x, y, expect) => ({ at, touch: 'move', x, y, ...(expect ? { expect } : {}) });
  const U = (at, x, y, expect) => ({ at, touch: 'up', x, y, ...(expect ? { expect } : {}) });
  const PL = (at, expect) => ({ at, poll: true, ...(expect ? { expect } : {}) });
  const TAP = (x, y) => ({ t: 'tap', x, y });
  const SW = (dir) => ({ t: 'swipe', dir });
  const NONE = { inputs: [], keys: [] };
  const LA = { mode: 'launch' };
  const RUN = { mode: 'present', show: { running: true, startedAt: 0, blackout: false } };
  // 오른쪽 영역(x ≥ 290)에서 (dx, dy) 만큼 움직였다 뗀다
  const moveTap = (id, desc, dx, dy, expectUp) => ({
    id, desc, init: P,
    steps: [D(0, 340, 260), M(50, 340 + dx, 260 + dy), U(100, 340 + dx, 260 + dy, expectUp)],
  });
  // 가로 스와이프(시작 x 300, y 260)
  const swipe = (id, desc, init, dx, dy, dt, expectUp) => ({
    id, desc, init,
    steps: [D(0, 300, 260), M(dt / 2, 300 + dx / 2, 260 + dy / 2), M(dt, 300 + dx, 260 + dy), U(dt, 300 + dx, 260 + dy, expectUp)],
  });
  const pull = (id, desc, init, y0, dx, dy, dt, expectUp) => ({
    id, desc, init,
    steps: [D(0, 205, y0), M(dt / 2, 205 + dx / 2, y0 + dy / 2), M(dt, 205 + dx, y0 + dy), U(dt, 205 + dx, y0 + dy, expectUp)],
  });
  const openSheet = [D(0, 205, 20), M(100, 205, 120), U(150, 205, 120, { inputs: [SW('down')], state: { sheet: { open: true } } })];

  write('touch.json', {
    suite: 'touch',
    description: '터치 판정(TouchGesture) — 손 뗄 때 전송, 12px 탭 취소, 600ms 길게, 스와이프 80/60/1.5/800(쇼 중 140/50), 위에서 당기기 72/48/40/600. 기본: 발표 모드, PowerPoint, Windows, 연결됨.',
    cases: [
      {
        id: 'send-on-release',
        desc: '발표 오른쪽 누름: 누르는 순간에는 아무것도 보내지 않고, 뗄 때 다음(→) 1회',
        init: P,
        steps: [D(0, 350, 260, NONE), PL(50, NONE), U(120, 350, 260, { inputs: [TAP(350, 260)], keys: [RIGHT] })],
      },
      moveTap('move-11-is-tap', '이동 11px(12 미만) = 탭', 11, 0, { inputs: [TAP(340, 260)], keys: [RIGHT] }),
      moveTap('move-12-cancels', '이동 12px = 탭 취소(아무것도 안 보냄)', 12, 0, NONE),
      moveTap('move-13-cancels', '이동 13px = 탭 취소', -13, 0, NONE),
      moveTap('move-diag-11-is-tap', '대각선 (8, 8) = 11.3px → 탭', 8, 8, { inputs: [TAP(340, 260)], keys: [RIGHT] }),
      moveTap('move-diag-13-cancels', '대각선 (9, 9) = 12.7px → 취소', 9, 9, NONE),
      {
        id: 'zone-held-600-no-tap',
        desc: '오른쪽 영역을 600ms 이상 누르고 떼면 보내지 않음(탭은 600ms 전에 뗀 것만)',
        init: P,
        steps: [D(0, 350, 260), PL(300), U(600, 350, 260, NONE)],
      },
      {
        id: 'zone-599-is-tap',
        desc: '599ms 에 떼면 탭',
        init: P,
        steps: [D(0, 350, 260), U(599, 350, 260, { inputs: [TAP(350, 260)], keys: [RIGHT] })],
      },
      {
        id: 'center-long-360',
        desc: '발표 가운데(암전)만 360ms: 359ms 는 아직, 360ms 에 길게 누름 = 암전(.). 그 뒤 떼도 탭 없음',
        init: P,
        steps: [D(0, 205, 260), PL(359, NONE), PL(360, { inputs: [{ t: 'longPress', x: 205, y: 260 }], keys: [K('PERIOD')] }), U(800, 205, 260, NONE)],
      },
      {
        id: 'center-release-359-no-blackout',
        desc: '가운데를 359ms 에 떼면 암전 없음(탭도 동작 없음)',
        init: P,
        steps: [D(0, 205, 260), PL(300, NONE), U(359, 205, 260, NONE)],
      },
      {
        id: 'meeting-tile-hold-still-600',
        desc: '다른 길게 누르기는 600ms 그대로: 회의 마이크 타일 360ms 에는 아직 길게 아님, 599ms 에 떼면 탭',
        init: { mode: 'meeting' },
        steps: [D(0, 205, 230), PL(360, { inputs: [] }), U(599, 205, 230, { inputs: [TAP(205, 230)], keys: [K('A', ['alt'])] })],
      },
      {
        id: 'center-long-cancel-on-move',
        desc: '가운데를 누른 채 12px 움직이면 길게 누름 취소',
        init: P,
        steps: [D(0, 205, 260), M(200, 205, 272), PL(700, NONE), U(800, 205, 272, NONE)],
      },
      {
        id: 'center-short-tap-nothing',
        desc: '가운데 짧은 탭은 아무것도 보내지 않음',
        init: P,
        steps: [D(0, 205, 260), U(100, 205, 260, NONE)],
      },
      swipe('swipe-dx-79-no', '|dx| 79 = 스와이프 아님(이동했으므로 탭도 아님)', P, -79, 0, 200, { inputs: [], state: { mode: 'present' } }),
      swipe('swipe-dx-80-left', '|dx| 80 = 왼쪽 스와이프 → 다음 모드(실행), 키 없음', P, -80, 0, 200, { inputs: [SW('left')], keys: [], state: { mode: 'launch' } }),
      swipe('swipe-dx-80-right', '오른쪽 스와이프 → 이전 모드(시계)', P, 80, 0, 200, { inputs: [SW('right')], keys: [], state: { mode: 'clock' } }),
      swipe('swipe-dy-59-ok', '|dx| 100, |dy| 59 (< 60, 100 > 1.5·59) = 스와이프', P, -100, 59, 200, { inputs: [SW('left')] }),
      swipe('swipe-dy-60-no', '|dy| 60 = 스와이프 아님', P, -100, 60, 200, { inputs: [] }),
      swipe('swipe-ratio-no', '|dx| 80, |dy| 55: 80 ≤ 1.5·55 = 82.5 → 스와이프 아님', P, -80, 55, 200, { inputs: [] }),
      swipe('swipe-ratio-ok', '|dx| 90, |dy| 55: 90 > 82.5 → 스와이프', P, -90, 55, 200, { inputs: [SW('left')] }),
      swipe('swipe-800ms-ok', '800ms 에 떼면 스와이프', P, -100, 0, 800, { inputs: [SW('left')] }),
      swipe('swipe-801ms-no', '801ms 에 떼면 스와이프 아님', P, -100, 0, 801, { inputs: [] }),
      swipe('show-swipe-139-no', '쇼 진행 중 발표: |dx| 139 = 모드 전환 아님', RUN, -139, 0, 200, { inputs: [], state: { mode: 'present' } }),
      swipe('show-swipe-140-left', '쇼 진행 중 발표: |dx| 140 = 모드 전환', RUN, -140, 0, 200, { inputs: [SW('left')], state: { mode: 'launch' } }),
      swipe('show-swipe-dy-50-no', '쇼 진행 중 발표: |dy| 50 = 모드 전환 아님', RUN, -200, 50, 200, { inputs: [] }),
      {
        id: 'statusbar-swipe-mode',
        desc: '상태줄(y < 72)에서 시작한 가로 스와이프도 모드 전환',
        init: P,
        steps: [D(0, 300, 30), M(100, 250, 32), M(200, 200, 34), U(200, 200, 34, { inputs: [SW('left')], state: { mode: 'launch' } })],
      },
      pull('pull-48-sheet', '위에서 당기기: 시작 y 71, 아래로 48 = 쇼 시트 열림', P, 71, 0, 48, 300, { inputs: [SW('down')], state: { sheet: { open: true } } }),
      pull('pull-47-no', '아래로 47 = 당기기 아님', P, 71, 0, 47, 300, { inputs: [], state: { sheet: { open: false } } }),
      pull('pull-start-72-no', '시작 y 72 = 당기기 후보 아님(본문 터치)', P, 72, 0, 80, 300, { inputs: [], state: { sheet: { open: false } } }),
      pull('pull-dx-39-ok', '|dx| 39 = 당기기', P, 30, 39, 60, 300, { inputs: [SW('down')] }),
      pull('pull-dx-40-no', '|dx| 40 = 당기기 아님', P, 30, 40, 60, 300, { inputs: [] }),
      pull('pull-600ms-ok', '600ms 에 떼면 당기기', P, 30, 0, 60, 600, { inputs: [SW('down')] }),
      pull('pull-601ms-no', '601ms 에 떼면 당기기 아님', P, 30, 0, 60, 601, { inputs: [] }),
      pull('pull-launch-settings', '발표 외 모드 당기기 = 설정 화면 요청(코어 입력 없음)', LA, 20, 0, 80, 200, { inputs: [], settingsRequest: true }),
      {
        id: 'sheet-button-on-release',
        desc: '시트 쇼 시작 버튼: 누를 때는 보내지 않고 뗄 때 F5',
        init: P,
        steps: [...openSheet, D(1000, 100, 150, NONE), U(1100, 100, 150, { inputs: [TAP(100, 150)], keys: [K('F5')], state: { show: { running: true } } })],
      },
      {
        id: 'sheet-button-drag-cancels',
        desc: '시트 버튼을 누르고 12px 이상 끌면 취소',
        init: P,
        steps: [...openSheet, D(1000, 100, 150), M(1050, 100, 170), U(1100, 100, 170, NONE)],
      },
      {
        id: 'sheet-settings-row',
        desc: '시트 설정 행 탭 = 시트 닫기(swipe up) + 설정 화면 요청',
        init: P,
        steps: [...openSheet, D(1000, 205, 280), U(1100, 205, 280, { inputs: [SW('up')], keys: [], settingsRequest: true, state: { sheet: { open: false } } })],
      },
      {
        id: 'sheet-blocks-mode-swipe',
        desc: '시트가 열려 있으면 가로 스와이프로 모드가 바뀌지 않음',
        init: P,
        steps: [...openSheet, D(1000, 300, 200), M(1100, 250, 200), M(1200, 180, 200), U(1200, 180, 200, { inputs: [], state: { mode: 'present', sheet: { open: true } } })],
      },
      {
        id: 'sheet-swipe-up-closes',
        desc: '시트 위로 48px 쓸기 = 닫기',
        init: P,
        steps: [...openSheet, D(1000, 205, 300), M(1100, 205, 252), U(1150, 205, 252, { inputs: [SW('up')], state: { sheet: { open: false } } })],
      },
      {
        id: 'sheet-outside-tap-closes',
        desc: '시트 바깥(y ≥ 344) 탭 = 닫기, 키 없음',
        init: P,
        steps: [...openSheet, D(1000, 205, 420), U(1100, 205, 420, { inputs: [TAP(205, 420)], keys: [], state: { sheet: { open: false } } })],
      },
      {
        id: 'launch-tile-on-release',
        desc: '실행 타일: 누를 때 없음, 뗄 때 Ctrl+Alt+1',
        init: LA,
        steps: [D(0, 100, 126, NONE), U(150, 100, 126, { inputs: [TAP(100, 126)], keys: [K('1', ['ctrl', 'alt'])] })],
      },
      {
        id: 'launch-tile-long-600',
        desc: '실행 타일 600ms = 길게(대안 실행). 뗄 때 탭 없음',
        init: LA,
        steps: [D(0, 300, 262), PL(599, { inputs: [] }), PL(600, { inputs: [{ t: 'longPress', x: 300, y: 262 }] }), U(700, 300, 262, NONE)],
      },
      {
        id: 'launch-tile-move-12-cancels',
        desc: '실행 타일을 누르고 12px 움직이면 보내지 않음',
        init: LA,
        steps: [D(0, 100, 126), M(50, 112, 126), U(100, 112, 126, NONE)],
      },
      {
        id: 'launch-page-swipe',
        desc: '실행 모드 세로 스와이프(위로 80) = 2쪽, 키 없음',
        init: LA,
        steps: [D(0, 200, 300), M(100, 200, 260), M(200, 200, 220), U(200, 200, 220, { inputs: [SW('up')], keys: [], state: { launchPage: 1 } })],
      },
      {
        id: 'meeting-tile-on-release',
        desc: '회의 마이크 타일: 뗄 때 Alt+A(Zoom)',
        init: { mode: 'meeting' },
        steps: [D(0, 205, 230, NONE), U(120, 205, 230, { inputs: [TAP(205, 230)], keys: [K('A', ['alt'])] })],
      },
      {
        id: 'waiting-no-zones',
        desc: '첫 연결 전(연결 대기): 탭·스와이프 없음, 당기기 = 설정 화면 요청',
        init: { mode: 'present', connected: false, everConnected: false },
        steps: [
          D(0, 350, 260), U(100, 350, 260, { inputs: [] }),
          D(1000, 300, 260), M(1100, 200, 260), U(1150, 200, 260, { inputs: [], state: { mode: 'present' } }),
          D(2000, 205, 20), M(2100, 205, 120), U(2150, 205, 120, { inputs: [], settingsRequest: true }),
        ],
      },
      {
        id: 'power-confirm-tap-on-release',
        desc: '전원 끄기 확인 화면(시계 모드): [끄기] 를 누를 때는 없음, 뗄 때 tap → 전원 끄기 요청',
        init: { mode: 'clock', powerConfirm: { since: 0 } },
        steps: [D(100, 100, 350, { inputs: [] }), U(200, 100, 350, { inputs: [TAP(100, 350)], events: [{ t: 'powerOff' }] })],
      },
      {
        id: 'screen-off-ignored',
        desc: '화면이 꺼져 있으면 터치를 버린다',
        init: { mode: 'present', screenOn: false },
        steps: [D(0, 350, 260), U(100, 350, 260, { inputs: [] })],
      },
    ],
  });
}
