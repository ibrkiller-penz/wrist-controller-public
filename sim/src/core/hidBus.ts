/**
 * HID 이벤트 버스 — 시계(코어)가 낸 HID 이벤트를 가상 PC·HID 로그에 나눠 준다. DOM 없음.
 * 연결 끊김 중 들어온 이벤트는 '버림(dropped)' 표시만 붙여 로그 구독자에게만 알리고, PC 쪽에는 전달하지 않는다.
 * 버린 이벤트는 쌓아 두지 않는다(재연결 후 몰아서 보내지 않음 — 작업지시서 '지켜야 할 것').
 */
import type { ActionId, HidEvent, InputSource } from './types';

export interface HidRecord {
  /** 발생 시각 ms (App 시계 기준) */
  at: number;
  ev: HidEvent;
  source: InputSource;
  action: ActionId | null;
  /** 연결 끊김으로 버려짐 */
  dropped: boolean;
}

export type HidListener = (rec: HidRecord) => void;

export interface SubscribeOptions {
  /** true 면 버린 이벤트도 받는다(HID 로그용). 기본 false = 실제로 PC 에 도착한 것만(가상 PC 용) */
  includeDropped?: boolean;
}

export class HidBus {
  private listeners: { fn: HidListener; includeDropped: boolean }[] = [];
  private _connected = true;

  get connected(): boolean {
    return this._connected;
  }

  setConnected(connected: boolean): void {
    this._connected = connected;
  }

  /** 구독. 반환값을 호출하면 해지 */
  subscribe(fn: HidListener, opts: SubscribeOptions = {}): () => void {
    const entry = { fn, includeDropped: opts.includeDropped ?? false };
    this.listeners.push(entry);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== entry);
    };
  }

  /**
   * 이벤트 발행. 버스가 끊김 상태이거나 rec.dropped 가 true 면 버림으로 처리한다.
   * 반환: 실제로 발행된 기록(dropped 확정값 포함)
   */
  emit(rec: Omit<HidRecord, 'dropped'> & { dropped?: boolean }): HidRecord {
    const out: HidRecord = { ...rec, dropped: Boolean(rec.dropped) || !this._connected };
    for (const l of [...this.listeners]) {
      if (out.dropped && !l.includeDropped) continue;
      try {
        l.fn(out);
      } catch (err) {
        console.error('[hidBus] 구독자 오류', err);
      }
    }
    return out;
  }

  clear(): void {
    this.listeners = [];
  }
}
