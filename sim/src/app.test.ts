// App 통합 동작: dispatch → HID 버스·구독, 연결 토글, 설정 교체
import { describe, expect, it } from 'vitest';
import { App } from './app';
import type { HidRecord } from './core/hidBus';
import { defaultKeymap } from './core/config';

function makeApp() {
  let t = 0;
  const app = new App({ persist: false, tickMs: 0, clock: () => t });
  app.dispatch({ t: 'setMode', mode: 'present' }); // 기본 시작 모드는 시계(키 안 보냄) — 이 테스트는 발표 모드 기준
  return { app, advance: (ms: number) => (t += ms) };
}

describe('App', () => {
  it('탭 → 버스로 HID 전달, 구독자에게 알림', () => {
    const { app } = makeApp();
    const pc: HidRecord[] = [];
    let changes = 0;
    app.hid.subscribe((r) => pc.push(r));
    app.subscribe(() => changes++);
    app.dispatch({ t: 'tap', x: 350, y: 300 });
    expect(pc.map((r) => r.ev)).toEqual([{ t: 'key', mods: [], key: 'RIGHT' }]);
    expect(pc[0].source).toBe('touch');
    expect(pc[0].action).toBe('next');
    expect(changes).toBe(1);
  });

  it('연결 끊김: PC 는 못 받고 로그는 버림으로 받음, 재연결 후 몰아 보내지 않음', () => {
    const { app } = makeApp();
    const pc: HidRecord[] = [];
    const log: HidRecord[] = [];
    app.hid.subscribe((r) => pc.push(r));
    app.hid.subscribe((r) => log.push(r), { includeDropped: true });
    app.toggleConnected();
    expect(app.connected).toBe(false);
    app.dispatch({ t: 'tap', x: 350, y: 300 });
    app.toggleConnected();
    expect(pc.length).toBe(0);
    expect(log.map((r) => r.dropped)).toEqual([true]);
    app.dispatch({ t: 'tap', x: 350, y: 300 });
    expect(pc.length).toBe(1);
  });

  it('tick 은 변화가 있을 때만 알린다', () => {
    const { app, advance } = makeApp();
    let changes = 0;
    app.subscribe(() => changes++);
    app.dispatch({ t: 'swipe', dir: 'down' }); // 시트 열기
    expect(changes).toBe(1);
    advance(100);
    app.dispatch({ t: 'tick' });
    expect(changes).toBe(1);
    advance(3000);
    app.dispatch({ t: 'tick' }); // 시트 자동 닫힘
    expect(changes).toBe(2);
    expect(app.state.sheet.open).toBe(false);
  });

  it('setConfig: 바뀐 키가 바로 반영', () => {
    const { app } = makeApp();
    const km = defaultKeymap();
    km.modes.present.apps.powerpoint.actions[0].win = { mods: [], key: 'PAGEDOWN' };
    app.setConfig({ keymap: km });
    const r = app.dispatch({ t: 'tap', x: 350, y: 300 });
    expect(r.hid[0].ev).toEqual({ t: 'key', mods: [], key: 'PAGEDOWN' });
    app.resetConfig();
    expect(app.dispatch({ t: 'tap', x: 350, y: 300 }).hid[0].ev).toEqual({ t: 'key', mods: [], key: 'RIGHT' });
  });

  it('setConfig: 없어진 앱 id 는 기본 앱으로', () => {
    const { app } = makeApp();
    app.dispatch({ t: 'setApp', mode: 'meeting', app: 'teams' });
    const km = defaultKeymap();
    delete (km.modes.meeting.apps as Record<string, unknown>).teams;
    km.modes.meeting.appOrder = ['zoom', 'meet'];
    app.setConfig({ keymap: km });
    expect(app.state.apps.meeting).toBe('zoom');
  });
});
