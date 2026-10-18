/**
 * 시계 에뮬레이터 — 담당: watch 모듈 개발자 (이 파일과 src/watch/* 만 수정).
 * 명세: design/v2/README.md(01~10 보다 우선), design/simulator-layout.md 4장.
 * 펌웨어 ui.cpp 와 같은 화면(같은 문구 shared/strings.ko.json, 같은 글꼴 서브셋, 같은 좌표)을 그린다.
 *
 * 계약(바꾸지 말 것 — 바꿔야 하면 리드에게 요청)
 *  - export function mountWatch(root: HTMLElement, app: App): void
 *  - 터치 판정은 core/touchGesture(TouchGesture, 펌웨어 wc::TouchGesture 와 같은 규칙·같은 테스트 벡터)가 한다.
 *    이 파일은 포인터 → 샘플(410×502 좌표, app.now())을 넣고, 나온 입력을 app.dispatch 로 넘길 뿐이다.
 *  - 측면 버튼: 원시 down/up 을 app.dispatch. 키보드 Space = BOOT, P = PWR (입력칸 포커스·e.repeat 제외).
 *  - 화면 그리기는 app.state + app.keymap 으로. 키 이름을 코드에 쓰지 않는다.
 *  - 피드백(플래시·토스트)은 app.subscribe 의 change.result.events 로.
 *
 * 전송 시점(README 0.4·4.4): 모든 키는 손을 뗄 때(이동 12px 미만). 길게 누름은 600ms 에.
 * 눌림 표시는 누르는 즉시, 짧은 탭도 최소 120ms 보이게.
 * 시계 안 설정 화면이 열려 있으면 터치를 코어로 보내지 않는다(설정 조작이 PC 로 새지 않게) — 시뮬레이터 전용 판정.
 * 시계 화면 안 움직임은 계단식만(README 0.2·0.3): CSS transition·scale·opacity·그림자 없음, 모드 전환은 즉시 교체.
 */
import type { App, AppChange } from '../app';
import { SCREEN_H, SCREEN_W, TouchGesture } from '../core';
import type { ButtonId, CoreEvent, CoreState, InputEvent, ModeId, TouchPress } from '../core';
import { el, fmtClock, pulse, takesRo, setText } from './dom';
import { Banner, ClockView, LaunchView, MeetingView, PowerConfirmView, PresentView, Sheet, StatusBar, Toast, WaitView } from './screens';
import type { ScreenCtx } from './screens';
import { SIM_MAC_SUFFIX, SettingsScreen } from './settingsScreen';
import { t } from './text';
import './watch.css';

export function mountWatch(root: HTMLElement, app: App): void {
  new WatchEmulator(root, app);
}

/** 기기 모형 크기(축척 1) — design/simulator-layout 4.1 */
const DEVICE_W = 500;
const DEVICE_H = 542;
/** 시뮬레이션 배터리 잔량(실제 PMU 값 없음) */
const SIM_BATTERY = 82;
const MEETING_HINT_KEY = 'wrist-sim.watch.meetingHint';
/** 눌림 표시 최소 유지(--wc-motion-press-min) */
const PRESS_MIN_MS = 120;
/** 점멸 반주기(--wc-motion-blink 500/500) */
const BLINK_MS = 500;

/** 설정 화면이 열려 있을 때의 포인터(시뮬레이터 전용 판정 — 코어로 보내지 않음) */
interface SetSess {
  id: number;
  x0: number;
  y0: number;
  t0: number;
  x: number;
  y: number;
  cx: number;
  cy: number;
  moved: boolean;
  pressedEl: HTMLElement | null;
  scroll0: number;
  scrolling: boolean;
  /** 위로 쓸어 이미 닫았다(손을 뗄 때까지 무시) */
  closed: boolean;
}

interface SideHold {
  t0: number;
  /** 설정 화면에서 짧게(=닫기)인지 확인할 때까지 코어에 보내지 않고 기다리는 중 */
  deferred: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

class WatchEmulator {
  // ---------------- DOM
  private wrap = el('div', 'watch-wrap');
  private device = el('div', 'watch-device');
  private screen = el('div', 'wc-screen watch-screen');
  private bodyLayer = el('div', 'watch-a watch-body');
  private present = new PresentView();
  private clockV = new ClockView();
  private launch = new LaunchView();
  private meeting = new MeetingView();
  private wait = new WaitView();
  private views: Record<ModeId, HTMLElement>;
  private sb = new StatusBar();
  private sheet = new Sheet();
  private banner = new Banner();
  private toast = new Toast();
  private settings: SettingsScreen;
  private offCover = el('div', 'watch-a watch-offcover is-hidden');
  /** 전원 끄기 확인(실기 피드백 11) */
  private power = new PowerConfirmView();
  /** '전원 끄기' 뒤 꺼짐 화면 문구(시뮬레이터 흉내 — 실제 시계는 AXP2101 가 전원을 끊는다) */
  private offText = el('div', 'watch-a watch-kr24 watch-c watch-offcover__txt');
  private poweredOff = false;
  private caption = el('div', 'watch-caption');
  private side: Record<ButtonId, { btn: HTMLButtonElement; bar: HTMLDivElement }>;

  // ---------------- 상태
  private last: CoreState;
  private scale = 1;
  private tg = new TouchGesture();
  /** 지금 TouchGesture 로 가는 포인터 id(-1 = 없음) */
  private tgId = -1;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private setSess: SetSess | null = null;
  /** 지금 그려 둔 눌림 표시 */
  private pressKey = '';
  private pressAt = 0;
  private pressClear: (() => void) | null = null;
  private pendingClear: (() => void) | null = null;
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private sideHeld: Partial<Record<ButtonId, SideHold>> = {};
  private raf = 0;
  private clockText = '';
  private blinkN = 0;

  constructor(private root: HTMLElement, private app: App) {
    this.last = app.state;
    this.views = { clock: this.clockV.root, present: this.present.root, launch: this.launch.root, meeting: this.meeting.root };
    this.settings = new SettingsScreen(app, {
      toast: (text) => this.toast.show('info', text, 'i-ble'),
      onChange: () => this.render(),
    });
    this.side = { pwr: this.mkSide('pwr'), boot: this.mkSide('boot') };
    this.build();
    this.bindPointer();
    this.bindKeys();
    this.fit();
    this.render();
    this.tick();

    app.subscribe((c) => this.onChange(c));
    setInterval(() => this.tick(), 200);
    setInterval(() => this.blink(), BLINK_MS);
    window.addEventListener('resize', () => this.fit());
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.fit()).observe(document.body);
  }

  // =====================================================================
  // 만들기
  // =====================================================================
  private build(): void {
    this.root.classList.add('watch-root');
    const s = this.screen;
    s.setAttribute('role', 'application');
    s.setAttribute(
      'aria-label',
      '시계 화면. 탭: 좌·중앙·우 영역, 길게 누름: 0.6초, 좌우로 밀기: 모드 전환, 위 가장자리에서 아래로 끌기: 쇼 시트·설정. 키보드: ←/→ 왼쪽·오른쪽 탭, Enter 중앙 탭, Space BOOT, P PWR',
    );
    s.tabIndex = 0;
    for (const v of [this.clockV.root, this.present.root, this.launch.root, this.meeting.root, this.wait.root]) this.bodyLayer.appendChild(v);
    s.append(
      this.bodyLayer,
      this.settings.root,
      this.settings.picker,
      this.sb.root,
      this.banner.root,
      this.sheet.root,
      this.toast.root,
      this.settings.dialog,
      this.power.root,
      this.offCover,
    );
    this.offCover.appendChild(this.offText);
    const bezel = el('div', 'watch-bezel');
    bezel.appendChild(s);
    this.device.append(bezel, this.side.boot.btn, this.side.boot.bar, this.side.pwr.btn, this.side.pwr.bar); // 실물: 위 = BOOT, 아래 = PWR
    for (const id of ['pwr', 'boot'] as const) {
      const lab = el('div', `watch-sidelabel watch-sidelabel--${id}`);
      lab.append(el('b', '', id.toUpperCase()), el('span', '', id === 'pwr' ? 'P' : 'Space'));
      this.device.appendChild(lab);
    }
    this.wrap.appendChild(this.device);
    this.root.append(this.wrap, this.caption);
    this.sb.setBattery(SIM_BATTERY, false);
  }

  private mkSide(id: ButtonId): { btn: HTMLButtonElement; bar: HTMLDivElement } {
    const btn = el('button', `watch-side watch-side--${id}`);
    btn.type = 'button';
    btn.setAttribute(
      'aria-label',
      id === 'boot'
        ? 'BOOT 버튼(위). 짧게 = 시계 모드 ↔ 직전 모드, 누른 채 = 에어마우스(발표), 2초 = 잠금 (단축키 Space)'
        : 'PWR 버튼(아래), 화면 켜기·끄기 (단축키 P)',
    );
    const bar = el('div', `watch-sidebar watch-sidebar--${id}`);
    btn.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        /* 무시 */
      }
      this.sideDown(id);
    });
    const up = () => this.sideUp(id);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
    // 키보드 Enter/Space 로 버튼 자체를 누르는 것은 전역 Space 처리와 겹치므로 click 은 쓰지 않는다
    btn.addEventListener('click', (e) => e.preventDefault());
    return { btn, bar };
  }

  /** 축척: design/simulator-layout 2.1 표. 화면 안 좌표는 언제나 410×502 */
  private fit(): void {
    const w = window.innerWidth;
    let s: number;
    if (w >= 1600) s = 1;
    else if (w >= 1024) s = 0.75;
    else if (w >= 768) s = 0.6;
    else {
      const col = this.root.parentElement?.clientWidth || w - 32;
      s = Math.min(1, col / DEVICE_W);
    }
    s = Math.max(0.3, Math.round(s * 1000) / 1000);
    if (s === this.scale && this.wrap.style.width) return;
    this.scale = s;
    this.wrap.style.width = `${DEVICE_W * s}px`;
    this.wrap.style.height = `${DEVICE_H * s}px`;
    this.device.style.transform = `scale(${s})`;
    this.updateCaption();
  }

  private updateCaption(): void {
    const base = `${SCREEN_W}×${SCREEN_H} · ${Math.round(this.scale * 100)}%`;
    const extra = !this.app.state.screenOn ? ' · 화면 꺼짐 (PWR 로 켜기)' : this.settings?.isOpen ? ' · 시계 설정 화면' : '';
    const text = base + extra;
    if (this.caption.textContent !== text) this.caption.textContent = text;
  }

  // =====================================================================
  // 그리기
  // =====================================================================
  private get waiting(): boolean {
    const s = this.app.state;
    return !s.connected && !s.everConnected;
  }

  private ctx(): ScreenCtx {
    if (this.settings.isOpen) return this.settings.pickerOpen ? 'name' : 'settings';
    return this.waiting ? 'waiting' : 'mode';
  }

  private sheetElapsed(): number {
    const s = this.app.state;
    return s.show.running ? this.app.showElapsed() : this.present.endedMs ?? 0;
  }

  private render(): void {
    const s = this.app.state;
    const km = this.app.keymap;
    this.screen.dataset.mode = s.mode;
    this.sb.update(s, km, this.ctx());
    this.present.update(s, km, this.app.showElapsed());
    this.clockV.update();
    this.launch.update(s, km);
    this.meeting.update(s, km);
    this.wait.update(this.app.deviceName, SIM_MAC_SUFFIX);
    this.sheet.update(s, km, this.sheetElapsed());
    const waiting = this.waiting;
    this.screen.classList.toggle('is-waiting', waiting);
    this.wait.root.setAttribute('aria-hidden', String(!waiting));
    this.banner.update(s, this.app.now(), this.settings.isOpen);
    this.offCover.classList.toggle('is-hidden', s.screenOn);
    if (s.screenOn) this.poweredOff = false;
    setText(this.offText, this.poweredOff ? t('power.simOff') : '');
    this.power.update(s);
    if (this.settings.isOpen) this.settings.update(s);
    this.screen.classList.toggle('is-settings', this.settings.isOpen);
    this.showOnly(s.mode);
    this.burnIn();
    this.updateCaption();
    if (s.button) this.kickLoop();
  }

  /** 현재 모드 본문만 보이게(모드 전환은 즉시 교체 — 본문은 미끄러지지 않는다) */
  private showOnly(mode: ModeId): void {
    const waiting = this.waiting;
    for (const [m, v] of Object.entries(this.views) as [ModeId, HTMLElement][]) {
      v.classList.toggle('is-shown', m === mode && !waiting);
      v.setAttribute('aria-hidden', String(m !== mode || waiting));
    }
    this.wait.root.classList.toggle('is-shown', waiting);
  }

  /** 시계 모드 번인 방지: 상태줄 분 단위 4점(±2), 시계 본문은 ClockView 가 8점 궤도 */
  private burnIn(): void {
    const onClock = this.app.state.mode === 'clock' && this.ctx() === 'mode';
    this.sb.setBurnIn(onClock ? Math.floor(Date.now() / 60000) : -1);
  }

  /** 200ms 주기: 시각(분 단위)·경과 시간·배너 초·설정 자동 닫힘 */
  private tick(): void {
    const s = this.app.state;
    const now = this.app.now();
    const clock = fmtClock(new Date());
    if (clock !== this.clockText) {
      this.clockText = clock;
      this.sb.setClock(clock);
      this.burnIn();
    }
    this.present.updateTimer(s, this.app.showElapsed());
    this.sheet.setElapsed(this.sheetElapsed());
    if (s.mode === 'clock') this.clockV.update();
    this.banner.update(s, now, this.settings.isOpen);
    this.settings.checkIdle(now);
  }

  /** 500ms 점멸(끊김 BLE 아이콘, 발표 쇼 중 콜론) + 연결 대기 점 */
  private blink(): void {
    this.blinkN++;
    this.screen.classList.toggle('is-blink-off', this.blinkN % 2 === 1);
    if (this.waiting) this.wait.step(this.blinkN);
  }

  /** 측면 버튼 누름 유지 중: 길게 누름 진행 막대, 에어마우스 링 잠금 대기색 */
  private kickLoop(): void {
    if (!this.raf) this.raf = requestAnimationFrame(() => this.loop());
  }

  private loop(): void {
    this.raf = 0;
    const s = this.app.state;
    const b = s.button;
    const now = this.app.now();
    const longMs = this.app.gesture.button.longPressMs;
    for (const id of ['pwr', 'boot'] as const) {
      const bar = this.side[id].bar;
      const on = !!b && b.id === id && !b.moved && !b.longFired;
      bar.classList.toggle('is-on', on);
      bar.style.transform = on && b ? `scaleY(${Math.min(1, (now - b.downAt) / longMs)})` : 'scaleY(0)';
    }
    this.present.setLockPending(!!b && b.air && !b.moved && !b.longFired && now - b.downAt >= longMs / 2);
    if (b) this.kickLoop();
  }

  // =====================================================================
  // 앱 변경 알림
  // =====================================================================
  private onChange(c: AppChange): void {
    const events = c.result?.events ?? [];
    // IMU 는 초당 60~100회 — 알림이 없으면 다시 그리지 않는다(진행 막대·링은 rAF 가 처리)
    if (c.input?.t === 'imu' && events.length === 0) {
      this.last = c.state;
      return;
    }
    const prev = this.last;
    this.last = c.state;
    for (const ev of events) this.onEvent(ev, prev, c.state);
    this.render();
  }

  private onEvent(ev: CoreEvent, prev: CoreState, s: CoreState): void {
    const km = this.app.keymap;
    switch (ev.t) {
      case 'powerOff':
        this.poweredOff = true;
        return;
      case 'mode':
        if (prev.mode !== ev.mode) this.sb.flashChip();
        if (ev.mode === 'meeting') this.meetingHintOnce();
        return;
      case 'app': {
        if (ev.mode !== 'meeting') return;
        const name = km.modes.meeting.apps[ev.app]?.name ?? ev.app;
        this.toast.show('info', t(takesRo(name) ? 'toast.appChangedRo' : 'toast.appChangedEuro', name));
        return;
      }
      case 'lock':
        this.toast.show('lock', t(ev.locked ? 'toast.locked' : 'toast.unlocked'), 'i-lock');
        return;
      case 'connection':
        if (ev.connected) {
          if (!prev.everConnected) this.toast.show('success', t('toast.connected'));
          this.banner.showReconnected();
        }
        return;
      case 'show':
        if (ev.running) this.present.endedMs = null;
        else this.present.endedMs = prev.show.startedAt !== null ? Math.max(0, this.app.now() - prev.show.startedAt) : 0;
        return;
      case 'action':
        this.onAction(ev, s);
        return;
      case 'estimate':
        if (ev.synced) this.toast.show('info', t('toast.estimateOnly'));
        return;
      default:
        return;
    }
  }

  private onAction(ev: Extract<CoreEvent, { t: 'action' }>, s: CoreState): void {
    if (!ev.sent) {
      // 끊김: 영역 플래시 대신 배너 흔들림 + '보내지 못함'(입력을 보내지도 쌓지도 않음)
      this.banner.shake(this.app.now());
      return;
    }
    switch (s.mode) {
      case 'present':
        if (ev.action === 'next') this.present.flash('r');
        else if (ev.action === 'prev') this.present.flash('l');
        return;
      case 'launch':
        this.launch.flash(ev.action);
        return;
      case 'meeting':
        if (ev.action === 'mic' || ev.action === 'camera' || ev.action === 'hand') this.meeting.flash(ev.action);
        return;
    }
  }

  /** 첫 회의 모드 진입 때 한 번 '회의 창을 앞에 두세요' */
  private meetingHintOnce(): void {
    try {
      if (localStorage.getItem(MEETING_HINT_KEY)) return;
      localStorage.setItem(MEETING_HINT_KEY, '1');
    } catch {
      /* 저장 실패 시에도 한 번은 보여 준다 */
    }
    setTimeout(() => this.toast.show('info', t('toast.meetingHint')), 700);
  }

  // =====================================================================
  // 화면 포인터(마우스·터치) → TouchGesture
  // =====================================================================
  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.screen.getBoundingClientRect();
    const x = ((e.clientX - r.left) * SCREEN_W) / (r.width || SCREEN_W);
    const y = ((e.clientY - r.top) * SCREEN_H) / (r.height || SCREEN_H);
    return { x: Math.round(Math.max(0, Math.min(SCREEN_W - 1, x))), y: Math.round(Math.max(0, Math.min(SCREEN_H - 1, y))) };
  }

  private bindPointer(): void {
    const s = this.screen;
    s.addEventListener('pointerdown', (e) => this.onDown(e));
    s.addEventListener('pointermove', (e) => this.onMove(e));
    s.addEventListener('pointerup', (e) => this.onUp(e, false));
    s.addEventListener('pointercancel', (e) => this.onUp(e, true));
    s.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** TouchGesture 가 낸 입력을 코어로. 에어마우스 중 탭 = 클릭 표시 */
  private dispatchAll(inputs: InputEvent[]): void {
    for (const input of inputs) {
      const air = this.app.state.air.active;
      this.app.dispatch(input);
      if (input.t === 'tap' && air) this.present.click();
    }
    if (this.tg.takeSettingsRequest()) this.settings.open();
  }

  /** 샘플 하나 넣고 결과 처리 + 눌림 표시·길게 누름 타이머 갱신 */
  private feed(touching: boolean, x: number, y: number): void {
    // 시뮬레이터는 시계를 줄여 그린다(폰에서 66% 등). 손가락 떨림이 화면 px 로는 같아도 시계 좌표로는
    // 1/scale 배로 커져 12px 탭 취소에 걸리므로, 탭 취소 거리만 화면 px 기준으로 맞춘다(실기는 scale=1 이라 동일).
    const base = this.app.gesture;
    const scale = Math.min(1, (this.screen.getBoundingClientRect().width || SCREEN_W) / SCREEN_W);
    const g =
      scale < 1
        ? { ...base, touch: { ...base.touch, tapMaxMovePx: Math.round(base.touch.tapMaxMovePx / scale) } }
        : base;
    const out = this.tg.sample(touching, x, y, this.app.now(), this.app.state, this.app.keymap, g);
    this.dispatchAll(out);
    this.syncPress(this.tg.press());
    this.armHold();
  }

  /** 길게 누름 시각에 poll(TouchGesture 는 타이머가 없는 순수 로직) */
  private armHold(): void {
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = null;
    const at = this.tg.holdAt;
    if (!this.tg.active || at < 0) return;
    this.holdTimer = setTimeout(() => {
      this.holdTimer = null;
      if (!this.tg.active) return;
      this.dispatchAll(this.tg.poll(this.app.now()));
      this.syncPress(this.tg.press());
      this.armHold();
    }, Math.max(0, at - this.app.now()) + 1);
  }

  private onDown(e: PointerEvent): void {
    if (this.tgId >= 0 || this.setSess) return; // 두 번째 손가락은 무시
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      this.screen.setPointerCapture(e.pointerId);
    } catch {
      /* 무시 */
    }
    if (e.pointerType === 'mouse') this.screen.focus({ preventScroll: true });
    const { x, y } = this.local(e);
    if (this.settings.isOpen && this.app.state.screenOn) {
      this.setSess = {
        id: e.pointerId, x0: x, y0: y, t0: this.app.now(), x, y, cx: e.clientX, cy: e.clientY, moved: false,
        pressedEl: this.settings.press(e.clientX, e.clientY), scroll0: this.settings.scrollTop, scrolling: false,
        closed: false,
      };
      return;
    }
    this.tgId = e.pointerId;
    this.feed(true, x, y);
  }

  private onMove(e: PointerEvent): void {
    const { x, y } = this.local(e);
    if (this.tgId === e.pointerId) {
      this.feed(true, x, y);
      return;
    }
    const ss = this.setSess;
    if (!ss || ss.id !== e.pointerId) return;
    ss.x = x;
    ss.y = y;
    ss.cx = e.clientX;
    ss.cy = e.clientY;
    const dx = x - ss.x0;
    const dy = y - ss.y0;
    if (!ss.moved && Math.hypot(dx, dy) >= this.app.gesture.touch.tapMaxMovePx) ss.moved = true;
    if (ss.moved && !ss.scrolling && Math.abs(dy) > Math.abs(dx)) {
      ss.scrolling = true;
      this.settings.release(ss.pressedEl);
      ss.pressedEl = null;
    }
    if (ss.scrolling) this.settings.scrollTo(ss.scroll0, dy);
    // 위로 쓸어 닫기(펌웨어 main.cpp settingsSwipeUp 와 같은 규칙): 위로 settingsCloseMinPx 이상, 위로 > 비율 × 가로.
    // 손을 떼기 전에도 바로 닫는다. 시뮬레이터 설정은 길어서 스크롤하므로 맨 아래까지 내려가 있을 때만 닫는다
    const tc = this.app.gesture.touch;
    if (ss.moved && -dy >= tc.settingsCloseMinPx && -dy > tc.settingsCloseAxisRatio * Math.abs(dx) && this.settings.canSwipeClose(ss.scroll0)) {
      ss.closed = true;
      this.settings.release(ss.pressedEl);
      ss.pressedEl = null;
      this.settings.close();
    }
  }

  private onUp(e: PointerEvent, cancelled: boolean): void {
    try {
      this.screen.releasePointerCapture(e.pointerId);
    } catch {
      /* 무시 */
    }
    if (this.tgId === e.pointerId) {
      this.tgId = -1;
      if (cancelled) {
        this.tg.cancel();
        if (this.holdTimer) clearTimeout(this.holdTimer);
        this.holdTimer = null;
        this.syncPress(null);
        return;
      }
      const { x, y } = this.local(e);
      this.feed(false, x, y);
      return;
    }
    const ss = this.setSess;
    if (!ss || ss.id !== e.pointerId) return;
    this.setSess = null;
    this.settings.release(ss.pressedEl);
    if (ss.closed || ss.scrolling || cancelled) return;
    // 설정 화면: 오른쪽 가로 스와이프 = 뒤로, 움직이지 않고 뗌 = 선택(기준값은 gesture.touch)
    const tc = this.app.gesture.touch;
    const dx = ss.x - ss.x0;
    const dy = ss.y - ss.y0;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const dt = this.app.now() - ss.t0;
    const swipeH = ax >= tc.swipeMinPx && ay < tc.swipeMaxOffAxisPx && ax > tc.swipeAxisRatio * ay && dt <= tc.swipeMaxMs;
    if (swipeH && dx > 0) this.settings.back();
    else if (!ss.moved) this.settings.tap(ss.cx, ss.cy);
  }

  // ---------------------------------------------------------------- 눌림 표시
  /** TouchGesture.press() 결과로 눌림 표시를 즉시 그리고, 사라지면 최소 120ms 뒤에 지운다 */
  private syncPress(p: TouchPress | null): void {
    const key = p ? this.pressKeyOf(p) : '';
    if (key === this.pressKey) return;
    const now = this.app.now();
    if (this.pressClear) {
      const clear = this.pressClear;
      this.pressClear = null;
      const left = PRESS_MIN_MS - (now - this.pressAt);
      if (!key && left > 0) {
        this.flushPress();
        this.pendingClear = clear;
        this.pressTimer = setTimeout(() => this.flushPress(), left);
      } else clear();
    }
    this.pressKey = key;
    if (!p || !key) return;
    this.flushPress();
    this.pressAt = now;
    this.pressClear = this.drawPress(p);
  }

  /** 최소 유지 시간을 기다리던 눌림 표시를 지금 지운다 */
  private flushPress(): void {
    if (this.pressTimer) clearTimeout(this.pressTimer);
    this.pressTimer = null;
    const f = this.pendingClear;
    this.pendingClear = null;
    f?.();
  }

  private pressKeyOf(p: TouchPress): string {
    if (p.sheetSettings) return 'sheetSet';
    const tg = p.target;
    switch (tg.kind) {
      case 'presentZone':
        return tg.zone === 'center' ? 'pcenter' : '';
      case 'launchTile':
        return `lt${tg.index}`;
      case 'meetingChip':
        return `mc${tg.app}`;
      case 'meetingTile':
        return `mt${tg.action}`;
      case 'sheetButton':
        return `sb${tg.action}`;
      default:
        return '';
    }
  }

  /** 눌림 그리기 → 지우는 함수 */
  private drawPress(p: TouchPress): (() => void) | null {
    const s = this.app.state;
    const holdMs = this.app.gesture.touch.holdMs;
    if (p.sheetSettings) {
      this.sheet.settingsRow.classList.add('is-press');
      return () => this.sheet.settingsRow.classList.remove('is-press');
    }
    const tg = p.target;
    switch (tg.kind) {
      case 'presentZone':
        this.present.holdStart(this.app.gesture.touch.blackoutHoldMs);
        return () => this.present.holdStop();
      case 'launchTile':
        if (!s.connected || !tg.action) return null;
        this.launch.press(tg.index, true, holdMs);
        return () => this.launch.press(tg.index, false);
      case 'meetingChip': {
        const i = this.meeting.chips.findIndex((c) => c.app === tg.app);
        this.meeting.pressChip(i, true);
        return () => this.meeting.pressChip(i, false);
      }
      case 'meetingTile':
        this.meeting.pressTile(tg.action, true, holdMs);
        return () => this.meeting.pressTile(tg.action, false);
      case 'sheetButton':
        if (!s.connected) return null;
        this.sheet.pressButton(tg.action, true);
        return () => this.sheet.pressButton(tg.action, false);
      default:
        return null;
    }
  }

  // =====================================================================
  // 측면 버튼(화면 버튼 + 키보드)
  // =====================================================================
  private sideDown(id: ButtonId): void {
    if (this.sideHeld[id]) return;
    const hold: SideHold = { t0: this.app.now(), deferred: false, timer: null };
    this.sideHeld[id] = hold;
    this.side[id].btn.classList.add('is-press');
    if (this.settings.isOpen) {
      // 설정 화면이 열려 있으면 이 누름은 코어로 보내지 않고 뗄 때 설정을 닫는다(펌웨어와 같음):
      // BOOT = 닫고 시계 모드로, PWR = 닫기만(화면 끄기는 그다음 누름)
      hold.deferred = true;
      return;
    }
    this.app.dispatch({ t: 'button', id, action: 'down' });
    this.kickLoop();
  }

  private sideUp(id: ButtonId): void {
    const hold = this.sideHeld[id];
    if (!hold) return;
    delete this.sideHeld[id];
    const b = this.side[id].btn;
    b.classList.remove('is-press');
    pulse(b, 'is-release');
    if (hold.deferred) {
      if (hold.timer) clearTimeout(hold.timer);
      this.settings.close();
      if (id === this.app.keymap.settings.primaryButton) this.app.dispatch({ t: 'setMode', mode: 'clock' });
      return;
    }
    this.app.dispatch({ t: 'button', id, action: 'up' });
    this.kickLoop();
  }

  private bindKeys(): void {
    const isTyping = (target: EventTarget | null) => {
      const n = target as HTMLElement | null;
      if (!n || !n.tagName) return false;
      const tag = n.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || n.isContentEditable;
    };
    const keyId = (e: KeyboardEvent): ButtonId | null => {
      if (e.ctrlKey || e.metaKey || e.altKey) return null;
      if (e.code === 'Space' || e.key === ' ') return 'boot';
      if (e.code === 'KeyP' || e.key === 'p' || e.key === 'P') return 'pwr';
      return null;
    };
    document.addEventListener('keydown', (e) => {
      if (isTyping(e.target)) return;
      const id = keyId(e);
      if (id) {
        e.preventDefault();
        if (!e.repeat) this.sideDown(id);
        return;
      }
      // 시계 화면에 포커스가 있을 때: ←/→ = 왼쪽·오른쪽 탭, Enter = 중앙 탭(design/simulator-layout 4.3)
      if (e.target !== this.screen || e.repeat) return;
      const st = this.app.state;
      if (this.settings.isOpen || !st.screenOn || st.sheet.open) return;
      const y = Math.round((64 + 486) / 2);
      const map: Record<string, number> = { ArrowLeft: 60, ArrowRight: 350, Enter: 205 };
      const x = map[e.key];
      if (x === undefined) return;
      e.preventDefault();
      this.app.dispatch({ t: 'tap', x, y });
    });
    document.addEventListener('keyup', (e) => {
      const id = keyId(e);
      if (!id || !this.sideHeld[id]) return;
      e.preventDefault();
      this.sideUp(id);
    });
    // 창을 벗어나면 누름 유지를 풀어 준다(버튼이 눌린 채 남지 않게)
    window.addEventListener('blur', () => {
      for (const id of Object.keys(this.sideHeld) as ButtonId[]) this.sideUp(id);
    });
  }
}
