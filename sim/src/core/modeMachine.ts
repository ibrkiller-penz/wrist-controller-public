/**
 * 모드 상태 기계 — 입력 이벤트 하나 → (새 상태, 보낼 HID, 버린 HID, 시스템 알림).
 * 순수 리듀서: step(state, input, ctx). 같은 입력·같은 ctx 면 항상 같은 결과(펌웨어 C++ 와 테스트 벡터로 대조).
 *
 * 처리 순서: ① 타이머 처리(now 기준) → ② 입력 처리 → ③ 타이머 처리 한 번 더.
 * 타이머: 시트 자동 닫힘, 측면 버튼 누름 유지(에어마우스 시작·길게 누름 잠금).
 * 모든 키 전송은 sendAction() 한 곳을 지난다: 연결 끊김이면 dropped 로 가고 상태 부수효과(암전 홀짝,
 * 회의 추정값 등)도 적용하지 않는다(재연결 후 몰아서 보내지 않음).
 */
import { airStart, airStep, airStop, initAirMouse } from './airmouse';
import { flickStep, initFlick } from './gesture';
import { biasStep, initBias } from './imu';
import { isMacro, resolveBinding } from './keymap';
import { hitTest, LAUNCH_TILES_PER_PAGE } from './layout';
import type {
  ActionId,
  AppId,
  ButtonId,
  CoreEvent,
  CoreState,
  Emitted,
  GestureConfig,
  HidEvent,
  InputEvent,
  InputSource,
  Keymap,
  MeetingActionId,
  MeetingAppId,
  MeetingEstimate,
  ModeId,
  StepContext,
  StepResult,
} from './types';

const freshMeeting = (): MeetingEstimate => ({ mic: 'unknown', camera: 'unknown', hand: 'down' });

/**
 * 초기 상태. keymap.settings 의 기본값을 쓰고 patch 로 덮는다.
 * 기본: 연결됨(connected=true, everConnected=true), 잠금 해제, 화면 켜짐.
 */
export function initState(keymap: Keymap, patch: Partial<CoreState> = {}): CoreState {
  const st = keymap.settings;
  const base: CoreState = {
    mode: st.mode,
    prevMode: 'present',
    os: st.os,
    apps: {
      clock: 'clock',
      present: keymap.modes.present.defaultApp as CoreState['apps']['present'],
      launch: (keymap.modes.launch?.defaultApp ?? 'launcher') as CoreState['apps']['launch'],
      meeting: keymap.modes.meeting.defaultApp as CoreState['apps']['meeting'],
    },
    launchPage: 0,
    sensitivity: st.sensitivity,
    connected: true,
    everConnected: true,
    disconnectedAt: null,
    locked: false,
    screenOn: true,
    sheet: { open: false, lastActivity: 0 },
    show: { running: false, startedAt: null, blackout: false },
    meeting: { zoom: freshMeeting(), teams: freshMeeting(), meet: freshMeeting() },
    button: null,
    bias: initBias(),
    air: initAirMouse(),
    flick: initFlick(),
  };
  return { ...base, ...structuredClone(patch) };
}

/** 리듀서 내부 작업 공간 */
class Work {
  hid: Emitted[] = [];
  dropped: Emitted[] = [];
  events: CoreEvent[] = [];
  constructor(
    public s: CoreState,
    public now: number,
    public km: Keymap,
    public g: GestureConfig,
  ) {}

  emit(ev: HidEvent, source: InputSource, action: ActionId | null): boolean {
    const e: Emitted = { ev, source, action };
    if (this.s.connected) {
      this.hid.push(e);
      return true;
    }
    this.dropped.push(e);
    return false;
  }

  currentApp(mode: ModeId = this.s.mode): AppId {
    return this.s.apps[mode];
  }

  /**
   * keymap 동작 전송. 키가 정의돼 있지 않으면 아무것도 안 하고 false. 끊김이면 버리고 false.
   * alt = 길게 누르기 바인딩(winAlt/macAlt). 매크로 바인딩은 macro HID 이벤트 하나로 낸다.
   */
  sendAction(action: ActionId, source: InputSource, alt = false): boolean {
    const mode = this.s.mode;
    const b = resolveBinding(this.km, mode, this.currentApp(mode), action, this.s.os, alt);
    if (!b) return false;
    const ev: HidEvent = isMacro(b) ? { t: 'macro', steps: b.steps } : { t: 'key', mods: b.mods, key: b.key };
    const sent = this.emit(ev, source, action);
    this.events.push({ t: 'action', action, source, sent });
    if (sent && mode === 'present') this.presentSideEffects(action);
    return sent;
  }

  presentSideEffects(action: ActionId) {
    const show = this.s.show;
    const clearBlackout = () => {
      if (show.blackout) {
        show.blackout = false;
        this.events.push({ t: 'blackout', on: false });
      }
    };
    switch (action) {
      case 'next':
      case 'prev':
        clearBlackout();
        break;
      case 'blackout':
        show.blackout = !show.blackout;
        this.events.push({ t: 'blackout', on: show.blackout });
        break;
      case 'showStart':
        clearBlackout();
        show.running = true;
        show.startedAt = this.now;
        this.events.push({ t: 'show', running: true });
        break;
      case 'showEnd':
        clearBlackout();
        if (show.running) {
          show.running = false;
          this.events.push({ t: 'show', running: false });
        }
        show.startedAt = null;
        break;
    }
  }

  setLocked(locked: boolean) {
    if (this.s.locked === locked) return;
    this.s.locked = locked;
    this.events.push({ t: 'lock', locked });
  }

  setSheet(open: boolean) {
    if (this.s.sheet.open === open) return;
    this.s.sheet = { open, lastActivity: this.now };
    this.events.push({ t: 'sheet', open });
  }

  startAir() {
    this.s.air = airStart(this.now);
    this.s.flick = initFlick(this.s.flick.cooldownUntil);
    this.events.push({ t: 'air', active: true });
  }

  stopAir() {
    if (!this.s.air.active) return;
    this.s.air = airStop();
    this.events.push({ t: 'air', active: false });
  }

  setMode(mode: ModeId) {
    if (this.s.mode === mode) return;
    this.stopAir();
    this.setSheet(false);
    if (mode === 'clock') this.s.prevMode = this.s.mode;
    this.s.mode = mode;
    this.s.flick = initFlick(this.s.flick.cooldownUntil);
    this.events.push({ t: 'mode', mode });
  }

  /** 실행 모드 쪽 수(동작 6개당 1쪽, 최소 1) */
  launchPages(): number {
    const acts = this.km.modes.launch?.apps[this.s.apps.launch]?.actions ?? [];
    return Math.max(1, Math.ceil(acts.length / LAUNCH_TILES_PER_PAGE));
  }

  setLaunchPage(page: number) {
    const n = this.launchPages();
    const p = ((page % n) + n) % n;
    if (p === this.s.launchPage) return;
    this.s.launchPage = p;
    this.events.push({ t: 'launchPage', page: p });
  }

  setApp(mode: ModeId, app: AppId) {
    if (!this.km.modes[mode]?.apps[app]) return;
    if (this.s.apps[mode] === app) return;
    (this.s.apps as Record<ModeId, AppId>)[mode] = app;
    this.events.push({ t: 'app', mode, app });
  }

  // ---------------- 타이머 ----------------
  timers() {
    const s = this.s;
    const now = this.now;
    if (s.sheet.open && now - s.sheet.lastActivity >= this.g.timing.sheetAutoCloseMs) this.setSheet(false);
    const b = s.button;
    if (b) {
      const held = now - b.downAt;
      if (
        this.g.airMouse.enabled &&
        s.mode === 'present' &&
        b.id === this.km.settings.primaryButton &&
        !b.air &&
        !b.longFired &&
        held >= this.g.airMouse.holdToStartMs
      ) {
        b.air = true;
        this.startAir();
      }
      if (!b.longFired && !b.moved && held >= this.g.button.longPressMs) {
        b.longFired = true;
        this.setLocked(!s.locked);
        this.stopAir();
      }
    }
  }

  // ---------------- 입력 ----------------
  shortPress(id: ButtonId) {
    if (id === this.km.settings.primaryButton) {
      // BOOT 짧게 = 시계 모드로(모든 모드). 이미 시계면 직전 모드로. 키는 보내지 않는다(다음 = 오른쪽 탭·손목 튕김)
      if (this.s.mode === 'clock') {
        const back = this.s.prevMode !== 'clock' && this.km.modes[this.s.prevMode] ? this.s.prevMode : 'present';
        this.setMode(back);
      } else {
        this.setMode('clock');
      }
    } else {
      this.s.screenOn = !this.s.screenOn;
      this.events.push({ t: 'screen', on: this.s.screenOn });
    }
  }

  button(id: ButtonId, action: 'down' | 'up' | 'short' | 'long') {
    const s = this.s;
    switch (action) {
      case 'short':
        this.shortPress(id);
        return;
      case 'long':
        this.setLocked(!s.locked);
        return;
      case 'down':
        if (s.button) return; // 다른 버튼이 눌려 있으면 무시
        s.button = { id, downAt: this.now, air: false, moved: false, longFired: false };
        return;
      case 'up': {
        const b = s.button;
        if (!b || b.id !== id) return;
        s.button = null;
        if (b.air) this.stopAir();
        else if (!b.longFired) this.shortPress(id);
        return;
      }
    }
  }

  meetingToggle(action: MeetingActionId, source: InputSource) {
    const app = this.s.apps.meeting as MeetingAppId;
    if (!this.sendAction(action, source)) return;
    const est = this.s.meeting[app];
    if (action === 'hand') {
      est.hand = est.hand === 'up' ? 'down' : 'up';
      this.events.push({ t: 'estimate', app, target: action, value: est.hand, synced: false });
    } else {
      const v = est[action];
      if (v !== 'unknown') est[action] = v === 'on' ? 'off' : 'on';
      this.events.push({ t: 'estimate', app, target: action, value: est[action], synced: false });
    }
  }

  meetingSync(action: MeetingActionId) {
    const app = this.s.apps.meeting as MeetingAppId;
    const est = this.s.meeting[app];
    if (action === 'hand') {
      est.hand = est.hand === 'up' ? 'down' : 'up';
      this.events.push({ t: 'estimate', app, target: action, value: est.hand, synced: true });
    } else {
      est[action] = est[action] === 'off' ? 'on' : 'off';
      this.events.push({ t: 'estimate', app, target: action, value: est[action], synced: true });
    }
  }

  touch(kind: 'tap' | 'longPress', x: number, y: number) {
    const s = this.s;
    if (s.air.active) {
      // 에어마우스 중: 탭 = 왼쪽 클릭, 길게 누름은 무시
      if (kind === 'tap') {
        this.emit({ t: 'mouseButton', button: 'left', down: true }, 'air', null);
        this.emit({ t: 'mouseButton', button: 'left', down: false }, 'air', null);
      }
      return;
    }
    const hit = hitTest(s.mode, s.sheet.open, x, y, this.km, s.apps.launch, s.launchPage);
    if (s.sheet.open) {
      if (kind !== 'tap') return;
      if (hit.kind === 'sheetButton') {
        this.sendAction(hit.action, 'sheet');
        this.setSheet(false);
      } else if (hit.kind === 'sheetScrim') {
        this.setSheet(false);
      } else {
        s.sheet.lastActivity = this.now;
      }
      return;
    }
    const src: InputSource = kind === 'tap' ? 'touch' : 'hold';
    switch (hit.kind) {
      case 'presentZone':
        if (hit.zone === 'center') {
          if (kind === 'longPress') this.sendAction('blackout', 'hold');
        } else {
          this.sendAction(hit.zone, src);
        }
        return;
      case 'launchTile':
        // 탭 = 기본 바인딩, 길게 = 대안(winAlt/macAlt — 없으면 아무것도 안 함)
        if (hit.action) this.sendAction(hit.action, src, kind === 'longPress');
        return;
      case 'launchDots':
        if (kind === 'tap') this.setLaunchPage(s.launchPage + 1);
        return;
      case 'meetingChip':
        this.setApp('meeting', hit.app);
        return;
      case 'meetingTile':
        if (kind === 'tap') this.meetingToggle(hit.action, 'touch');
        else this.meetingSync(hit.action);
        return;
      default:
        return;
    }
  }

  swipe(dir: 'left' | 'right' | 'up' | 'down') {
    const s = this.s;
    if (s.air.active) return;
    if (dir === 'left' || dir === 'right') {
      if (s.sheet.open) return;
      const order = this.km.modeOrder;
      const i = Math.max(0, order.indexOf(s.mode));
      const n = order.length;
      const next = order[(i + (dir === 'left' ? 1 : n - 1)) % n];
      this.setMode(next);
    } else if (s.mode === 'launch' && !s.sheet.open) {
      // 실행 모드: 타일 영역 세로 스와이프 = 쪽 넘기기(위로 = 다음 쪽, 아래로 = 앞 쪽, 돌아감)
      this.setLaunchPage(s.launchPage + (dir === 'up' ? 1 : -1));
    } else if (dir === 'down') {
      if (s.mode === 'present' && !s.sheet.open) this.setSheet(true);
    } else if (s.sheet.open) {
      this.setSheet(false);
    }
  }

  imu(sample: { t: number; gx: number; gy: number; gz: number }) {
    const s = this.s;
    const bs = biasStep(s.bias, sample, this.g.imu.biasCalib);
    s.bias = bs.state;
    const v = bs.out;
    if (s.air.active) {
      const r = airStep(s.air, v, this.g, s.sensitivity);
      s.air = r.state;
      if (r.moving && s.button) s.button.moved = true;
      if (r.dx !== 0 || r.dy !== 0) this.emit({ t: 'mouseMove', dx: r.dx, dy: r.dy }, 'air', null);
      return;
    }
    if (s.mode !== 'present' || s.button) return;
    const fr = flickStep(s.flick, v, this.g);
    s.flick = fr.state;
    if (fr.rejected) this.events.push({ t: 'flickRejected', reason: fr.rejected });
    if (fr.cooldownHit) this.events.push({ t: 'ignored', source: 'gesture', reason: 'cooldown' });
    if (fr.fired) {
      if (s.locked) {
        this.events.push({ t: 'ignored', source: 'gesture', reason: 'locked' });
      } else {
        this.events.push({ t: 'flick', dir: fr.fired });
        // 바깥 = 다음. 안쪽은 flick.inAction: 'next'(기본 — 실기 피드백 8) = 다음, 'prev' = 이전, 'none' = 무시(이벤트만)
        const inAct = this.g.flick.inAction ?? 'next';
        if (fr.fired === 'out' || inAct === 'next') this.sendAction('next', 'gesture');
        else if (inAct === 'prev') this.sendAction('prev', 'gesture');
      }
    }
  }

  connection(connected: boolean) {
    const s = this.s;
    if (s.connected === connected) return;
    s.connected = connected;
    if (!connected) {
      s.disconnectedAt = this.now;
    } else {
      if (s.disconnectedAt !== null && this.now - s.disconnectedAt > this.g.timing.meetingEstimateResetMs) {
        for (const app of Object.keys(s.meeting) as MeetingAppId[]) s.meeting[app] = freshMeeting();
      }
      s.disconnectedAt = null;
      s.everConnected = true;
    }
    this.events.push({ t: 'connection', connected });
  }

  input(inp: InputEvent) {
    const s = this.s;
    switch (inp.t) {
      case 'tap':
      case 'longPress':
        this.touch(inp.t, inp.x, inp.y);
        return;
      case 'swipe':
        this.swipe(inp.dir);
        return;
      case 'button':
        this.button(inp.id, inp.action);
        return;
      case 'imu':
        this.imu(inp.sample);
        return;
      case 'tick':
        return;
      case 'connection':
        this.connection(inp.connected);
        return;
      case 'setMode':
        if (this.km.modes[inp.mode]) this.setMode(inp.mode);
        return;
      case 'setApp':
        this.setApp(inp.mode, inp.app);
        return;
      case 'setOs':
        if (s.os !== inp.os) {
          s.os = inp.os;
          this.events.push({ t: 'os', os: inp.os });
        }
        return;
      case 'setSensitivity': {
        const max = this.g.airMouse.sensitivity.length - 1;
        const lvl = Math.min(Math.max(Math.round(inp.level), 0), max);
        if (s.sensitivity !== lvl) {
          s.sensitivity = lvl;
          this.events.push({ t: 'sensitivity', level: lvl });
        }
        return;
      }
      case 'setLocked':
        this.setLocked(inp.locked);
        return;
    }
  }
}

/**
 * 순수 리듀서. state 는 바꾸지 않고 새 상태를 돌려준다.
 * imu 입력이면 now 로 sample.t 를 쓴다(ctx.now 무시).
 */
export function step(state: CoreState, input: InputEvent, ctx: StepContext): StepResult {
  const now = input.t === 'imu' ? input.sample.t : ctx.now;
  const w = new Work(structuredClone(state), now, ctx.keymap, ctx.gesture);
  w.timers();
  w.input(input);
  w.timers();
  return { state: w.s, hid: w.hid, dropped: w.dropped, events: w.events };
}

/** 발표 경과 시간(ms). 쇼가 시작되지 않았으면 0 */
export function showElapsed(state: CoreState, now: number): number {
  return state.show.running && state.show.startedAt !== null ? Math.max(0, now - state.show.startedAt) : 0;
}
