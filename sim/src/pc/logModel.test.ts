/** HID 로그 모델 테스트 — 마우스 100ms 묶음, 클릭 합치기, 버림 표시, 사람이 읽는 키 표기, 내보내기 형식. */
import { describe, expect, it } from 'vitest';
import { defaultGesture, defaultKeymap } from '../core/config';
import type { HidRecord } from '../core/hidBus';
import { formatChord, resolveChord } from '../core/keymap';
import { LogModel, formatTime, type LogContext } from './logModel';

const ctx: LogContext = {
  keymap: defaultKeymap(),
  gesture: defaultGesture(),
  os: 'win',
  mode: 'launch',
  apps: { clock: 'clock', present: 'powerpoint', launch: 'launcher', meeting: 'zoom' },
};
const rec = (at: number, ev: HidRecord['ev'], extra: Partial<HidRecord> = {}): HidRecord => ({ at, ev, source: 'air', action: null, dropped: false, ...extra });

describe('LogModel', () => {
  it('마우스 이동을 100ms 창으로 묶는다', () => {
    const m = new LogModel();
    for (let i = 0; i < 10; i++) m.addHid(rec(1000 + i * 10, { t: 'mouseMove', dx: 2, dy: -1 }), ctx);
    m.addHid(rec(1100, { t: 'mouseMove', dx: 1, dy: 1 }), ctx);
    expect(m.entries).toHaveLength(2);
    expect(m.entries[0].move).toEqual({ dx: 20, dy: -10, n: 10 });
    expect(m.entries[0].main).toBe('이동 Δx +20 Δy −10');
    expect(m.entries[0].sub).toBe('×10');
    expect(m.raw).toHaveLength(11);
  });

  it('키 행 사이에 끼면 묶지 않고, 버림 여부가 다르면 따로', () => {
    const m = new LogModel();
    m.addHid(rec(0, { t: 'mouseMove', dx: 1, dy: 0 }), ctx);
    m.addHid(rec(10, { t: 'mouseMove', dx: 1, dy: 0 }, { dropped: true }), ctx);
    expect(m.entries).toHaveLength(2);
    expect(m.entries[1].dropped).toBe(true);
  });

  it('누름+뗌은 클릭 한 줄', () => {
    const m = new LogModel();
    m.addHid(rec(0, { t: 'mouseButton', button: 'left', down: true }, { source: 'touch' }), ctx);
    m.addHid(rec(30, { t: 'mouseButton', button: 'left', down: false }, { source: 'touch' }), ctx);
    expect(m.entries).toHaveLength(1);
    expect(m.entries[0].main).toBe('왼쪽 클릭');
  });

  it('키는 사람이 읽는 표기 + 동작 라벨 + 사용 코드', () => {
    const m = new LogModel();
    const c = resolveChord(ctx.keymap, 'launch', 'launcher', 'claude', 'win')!;
    m.addHid(rec(0, { t: 'key', ...c }, { source: 'touch', action: 'claude' }), ctx);
    const e = m.entries[0];
    expect(e.kind).toBe('key');
    expect(e.main).toBe(formatChord(c, 'win'));
    expect(e.sub).toContain('Claude');
    expect(e.source).toBe('터치');
  });

  it('매크로는 단계 표기(대기 생략) + 보고서 수', () => {
    const m = new LogModel();
    const steps = [{ chord: { mods: ['gui' as const], key: 'R' } }, { wait: 300 }, { text: 'excel' }, { wait: 50 }, { chord: { mods: [], key: 'ENTER' } }];
    m.addHid(rec(0, { t: 'macro', steps }, { source: 'hold', action: 'excel' }), ctx);
    expect(m.entries[0].main).toBe('Win+R → excel → Enter');
    expect(m.entries[0].sub).toContain('매크로');
  });

  it('SYS: 모드 전환·무시된 튕김은 기록, 화면용 알림(action)은 생략', () => {
    const m = new LogModel();
    m.addSys(0, { t: 'mode', mode: 'meeting' }, ctx, { t: 'swipe', dir: 'left' });
    m.addSys(1, { t: 'ignored', source: 'gesture', reason: 'locked' }, ctx, null);
    m.addSys(2, { t: 'action', action: 'next', source: 'touch', sent: true }, ctx, null);
    expect(m.entries.map((e) => e.main)).toEqual(['모드 → 회의', '튕김 잠금 중이라 무시']);
    expect(m.entries[0].source).toBe('스와이프');
  });

  it('행이 최대치를 넘으면 오래된 것부터 지운다', () => {
    const m = new LogModel(3);
    for (let i = 0; i < 5; i++) m.addHid(rec(i * 1000, { t: 'consumer', usage: 0xe9 }, { source: 'button' }), ctx);
    expect(m.entries).toHaveLength(3);
    expect(m.entries[0].at).toBe(2000);
    expect(m.entries[0].main).toBe('볼륨 +');
  });

  it('내보내기: hid/dropped 는 test-vector 의 HidEvent 형식', () => {
    const m = new LogModel();
    m.addHid(rec(0, { t: 'key', mods: [], key: 'RIGHT' }, { source: 'touch', action: 'next' }), ctx);
    m.addHid(rec(5, { t: 'key', mods: [], key: 'RIGHT' }, { source: 'touch', action: 'next', dropped: true }), ctx);
    const out = m.toExport({ os: 'win', mode: 'present', deviceName: 'x', exportedAt: 't' }) as { hid: unknown[]; dropped: unknown[]; records: unknown[] };
    expect(out.hid).toEqual([{ t: 'key', mods: [], key: 'RIGHT' }]);
    expect(out.dropped).toHaveLength(1);
    expect(out.records).toHaveLength(2);
  });

  it('시간 표기 mm:ss.mmm', () => {
    expect(formatTime(83456.7)).toBe('01:23.457');
    expect(formatTime(0)).toBe('00:00.000');
  });
});
