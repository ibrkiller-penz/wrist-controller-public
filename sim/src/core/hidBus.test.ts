import { describe, expect, it } from 'vitest';
import { HidBus, type HidRecord } from './hidBus';

describe('HidBus', () => {
  it('끊김 중 이벤트는 버림 표시, PC 구독자는 받지 않는다', () => {
    const bus = new HidBus();
    const pc: HidRecord[] = [];
    const log: HidRecord[] = [];
    bus.subscribe((r) => pc.push(r));
    bus.subscribe((r) => log.push(r), { includeDropped: true });
    bus.emit({ at: 0, ev: { t: 'key', mods: [], key: 'RIGHT' }, source: 'touch', action: 'next' });
    bus.setConnected(false);
    bus.emit({ at: 1, ev: { t: 'key', mods: [], key: 'RIGHT' }, source: 'touch', action: 'next' });
    bus.setConnected(true);
    expect(pc.length).toBe(1);
    expect(log.map((r) => r.dropped)).toEqual([false, true]);
  });
  it('구독 해지', () => {
    const bus = new HidBus();
    let n = 0;
    const off = bus.subscribe(() => n++);
    off();
    bus.emit({ at: 0, ev: { t: 'consumer', usage: 0xe9 }, source: 'touch', action: null });
    expect(n).toBe(0);
  });
});
