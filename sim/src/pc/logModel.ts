/**
 * HID 로그 모델 — DOM 없음(테스트 가능).
 * HID 기록(HidRecord)과 시스템 알림(CoreEvent)을 사람이 읽는 행으로 바꾸고, 마우스 이동을 100ms 창으로 묶는다.
 * 명세: design/simulator-layout.md 6장.
 */
import hidUsage from '@shared/hid-usage.json';
import type { HidRecord } from '../core/hidBus';
import { chordToReport, expandMacro, formatChord, formatSteps, listActions } from '../core/keymap';
import type { ActionId, AppId, CoreEvent, GestureConfig, HidEvent, InputEvent, InputSource, Keymap, ModeId, OsId } from '../core/types';

export type LogKind = 'key' | 'mouse' | 'media' | 'sys';

export interface LogEntry {
  id: number;
  /** 시각 ms (페이지 시작 기준, App 시계) */
  at: number;
  kind: LogKind;
  dropped: boolean;
  /** 본문(주) */
  main: string;
  /** 본문(보조, 흐린 글자) */
  sub: string;
  /** 출처 표시(터치/버튼/…/사이트) */
  source: string;
  /** 마우스 이동 묶음: 합계와 보고 수 */
  move?: { dx: number; dy: number; n: number };
  /** 마우스 버튼 누름 행(뗌이 오면 '클릭'으로 합친다) */
  press?: { button: string; at: number };
}

/** JSON 내보내기용 원본 기록(묶지 않은 것) */
export type RawRecord =
  | { at: number; t: 'hid'; ev: HidEvent; source: InputSource; action: ActionId | null; dropped: boolean }
  | { at: number; t: 'sys'; event: CoreEvent | { t: 'config' }; source: string };

/** 로그 해석에 필요한 문맥(현재 설정) */
export interface LogContext {
  keymap: Keymap;
  gesture: GestureConfig;
  os: OsId;
  mode: ModeId;
  apps: Record<ModeId, AppId>;
}

export const MOVE_GROUP_MS = 100;
export const CLICK_MERGE_MS = 600;
export const MAX_ROWS = 1000;
export const MAX_RAW = 20000;

export const SOURCE_LABEL: Record<InputSource, string> = {
  touch: '터치',
  hold: '길게',
  swipe: '스와이프',
  sheet: '시트',
  button: '버튼',
  gesture: '제스처',
  air: '에어',
  system: '시스템',
};

const BUTTON_LABEL: Record<string, string> = { left: '왼쪽', right: '오른쪽', middle: '가운데' };

const CONSUMER_LABEL: Record<string, string> = {
  MUTE: '음소거',
  VOLUME_UP: '볼륨 +',
  VOLUME_DOWN: '볼륨 −',
  PLAY_PAUSE: '재생/일시정지',
  NEXT_TRACK: '다음 곡',
  PREV_TRACK: '이전 곡',
};
const CONSUMER_BY_USAGE: Record<number, string> = Object.fromEntries(
  Object.entries((hidUsage as { consumer: Record<string, string> }).consumer).map(([name, hex]) => [parseInt(hex, 16), name]),
);

const hex = (n: number, width: number) => `0x${n.toString(16).toUpperCase().padStart(width, '0')}`;
/** 부호 있는 정수 표기(−는 진짜 빼기 기호) */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/** 페이지 시작 기준 mm:ss.mmm */
export function formatTime(ms: number): string {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = (t % 60000) / 1000;
  return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
}

/** 동작 id → 라벨. 현재 모드·앱을 먼저 보고 없으면 모든 모드·앱에서 찾는다 */
export function actionLabelAny(ctx: LogContext, action: ActionId): string {
  const cur = listActions(ctx.keymap, ctx.mode, ctx.apps[ctx.mode]).find((a) => a.id === action);
  if (cur) return cur.label;
  for (const mode of Object.keys(ctx.keymap.modes) as ModeId[])
    for (const app of Object.keys(ctx.keymap.modes[mode].apps) as AppId[]) {
      const a = listActions(ctx.keymap, mode, app).find((x) => x.id === action);
      if (a) return a.label;
    }
  return action;
}

/** HID 이벤트 하나 → {종류, 주, 보조} (마우스 이동은 묶음 쪽에서 다시 쓴다) */
export function describeHid(ev: HidEvent, action: ActionId | null, ctx: LogContext): { kind: LogKind; main: string; sub: string } {
  switch (ev.t) {
    case 'key': {
      const { modifier, usage } = chordToReport({ mods: ev.mods, key: ev.key });
      const label = action ? actionLabelAny(ctx, action) : '';
      const code = modifier ? `${hex(usage, 2)} 수정자 ${hex(modifier, 2)}` : hex(usage, 2);
      return { kind: 'key', main: formatChord({ mods: ev.mods, key: ev.key }, ctx.os), sub: [label, code].filter(Boolean).join(' · ') };
    }
    case 'mouseMove':
      return { kind: 'mouse', main: `이동 Δx ${signed(ev.dx)} Δy ${signed(ev.dy)}`, sub: '×1' };
    case 'mouseButton':
      return { kind: 'mouse', main: `${BUTTON_LABEL[ev.button] ?? ev.button} 버튼 ${ev.down ? '누름' : '뗌'}`, sub: '' };
    case 'consumer': {
      const name = CONSUMER_BY_USAGE[ev.usage];
      return { kind: 'media', main: name ? (CONSUMER_LABEL[name] ?? name) : '미디어 키', sub: hex(ev.usage, 4) };
    }
    case 'macro': {
      // 매크로: 'Win+R → powerpnt → Enter' + 보고서 수·걸리는 시간
      const reps = expandMacro(ev.steps);
      const ms = reps.reduce((t, r) => t + (r.r === 'wait' ? r.ms : 0), 0);
      const label = action ? actionLabelAny(ctx, action) : '';
      const n = reps.filter((r) => r.r !== 'wait').length;
      return { kind: 'key', main: formatSteps(ev.steps, ctx.os), sub: [label, `매크로 보고서 ${n}개 · ${ms}ms`].filter(Boolean).join(' · ') };
    }
  }
}

const IGNORE_REASON: Record<string, string> = {
  locked: '잠금 중이라 무시',
  cooldown: '재인식 금지 중 — 무시',
};
const FLICK_REJECT: Record<string, string> = {
  tooShort: '너무 짧음',
  tooLong: '너무 김(천천히 돌리기)',
  noRebound: '되돌림 없음',
  notDominant: '다른 축 움직임이 큼',
  notQuiet: '직전 움직임이 많음',
};

/**
 * 시스템 알림 → 로그 문장. 화면 표시용으로만 쓰는 알림(action·estimate·sheet·show·blackout)은 null(기록 안 함):
 * 키 행이 이미 같은 정보를 보여 준다.
 */
export function describeSys(e: CoreEvent, ctx: LogContext, input: InputEvent | null): string | null {
  const modeName = (m: ModeId) => ctx.keymap.modes[m]?.name ?? m;
  switch (e.t) {
    case 'mode':
      return `모드 → ${modeName(e.mode)}`;
    case 'app':
      return `앱 → ${ctx.keymap.modes[e.mode]?.apps[e.app]?.name ?? e.app} (${modeName(e.mode)})`;
    case 'os':
      return `PC 운영체제 → ${e.os === 'mac' ? 'macOS' : 'Windows'}`;
    case 'lock':
      return e.locked ? '잠금 켜짐 — 제스처 무시' : '잠금 풀림';
    case 'connection':
      return e.connected ? 'BLE 연결됨' : 'BLE 연결 끊김 — 입력은 버림';
    case 'air':
      return e.active ? '에어마우스 시작' : '에어마우스 끝';
    case 'screen':
      return e.on ? '시계 화면 켜짐' : '시계 화면 꺼짐';
    case 'sensitivity': {
      const name = ctx.gesture.airMouse.sensitivity[e.level]?.name;
      return `에어마우스 감도 → ${name ?? e.level + 1}`;
    }
    case 'flick': {
      const sec = ctx.gesture.flick.cooldownMs / 1000;
      return `튕김 감지(${e.dir === 'out' ? '바깥' : '안'}) — ${sec}초 재인식 금지`;
    }
    case 'flickRejected':
      return `튕김 아님 — ${FLICK_REJECT[e.reason] ?? e.reason}`;
    case 'launchPage':
      return `실행 모드 ${e.page + 1}쪽`;
    case 'ignored':
      return `튕김 ${IGNORE_REASON[e.reason] ?? e.reason}`;
    default:
      return null;
  }
}

/** 알림을 일으킨 입력 → 출처 표시 */
export function sysSource(e: CoreEvent, input: InputEvent | null): string {
  if (e.t === 'air') return SOURCE_LABEL.air;
  if (e.t === 'flick' || e.t === 'flickRejected') return SOURCE_LABEL.gesture;
  if (!input) return '사이트';
  switch (input.t) {
    case 'tap':
      return SOURCE_LABEL.touch;
    case 'longPress':
      return SOURCE_LABEL.hold;
    case 'swipe':
      return SOURCE_LABEL.swipe;
    case 'button':
      return SOURCE_LABEL.button;
    case 'imu':
      return SOURCE_LABEL.gesture;
    case 'tick':
    case 'connection':
      return SOURCE_LABEL.system;
    default:
      return '사이트';
  }
}

// ---------------------------------------------------------------------------
// 로그 모델(행 목록 + 원본 기록)
// ---------------------------------------------------------------------------

export type LogChange = { type: 'add'; entry: LogEntry } | { type: 'update'; entry: LogEntry } | { type: 'remove'; ids: number[] } | { type: 'clear' };

export class LogModel {
  readonly entries: LogEntry[] = [];
  readonly raw: RawRecord[] = [];
  private nextId = 1;
  private moveStart = 0;

  constructor(
    private maxRows = MAX_ROWS,
    private maxRaw = MAX_RAW,
  ) {}

  /** HID 기록 추가. 반환: 화면에 반영할 변화 목록 */
  addHid(rec: HidRecord, ctx: LogContext): LogChange[] {
    this.pushRaw({ at: rec.at, t: 'hid', ev: rec.ev, source: rec.source, action: rec.action, dropped: rec.dropped });
    const last = this.entries[this.entries.length - 1];
    const source = SOURCE_LABEL[rec.source] ?? rec.source;
    const ev = rec.ev;

    // 마우스 이동: 바로 앞 행이 같은 출처·같은 버림 여부의 이동 묶음이고 100ms 창 안이면 합친다
    if (ev.t === 'mouseMove') {
      if (last?.move && last.dropped === rec.dropped && last.source === source && rec.at - this.moveStart < MOVE_GROUP_MS && rec.at >= this.moveStart) {
        last.move.dx += ev.dx;
        last.move.dy += ev.dy;
        last.move.n += 1;
        last.main = `이동 Δx ${signed(last.move.dx)} Δy ${signed(last.move.dy)}`;
        last.sub = `×${last.move.n}`;
        return [{ type: 'update', entry: last }];
      }
      this.moveStart = rec.at;
      const d = describeHid(ev, rec.action, ctx);
      return this.add({ at: rec.at, kind: 'mouse', dropped: rec.dropped, main: d.main, sub: d.sub, source, move: { dx: ev.dx, dy: ev.dy, n: 1 } });
    }

    // 마우스 버튼 뗌: 바로 앞 행이 같은 버튼 누름이면 '클릭' 한 줄로 합친다
    if (ev.t === 'mouseButton' && !ev.down && last?.press && last.press.button === ev.button && last.dropped === rec.dropped && rec.at - last.press.at <= CLICK_MERGE_MS) {
      last.main = `${BUTTON_LABEL[ev.button] ?? ev.button} 클릭`;
      last.press = undefined;
      return [{ type: 'update', entry: last }];
    }

    const d = describeHid(ev, rec.action, ctx);
    const entry: Omit<LogEntry, 'id'> = { at: rec.at, kind: d.kind, dropped: rec.dropped, main: d.main, sub: d.sub, source };
    if (ev.t === 'mouseButton' && ev.down) entry.press = { button: ev.button, at: rec.at };
    return this.add(entry);
  }

  /** 시스템 알림 추가(기록하지 않는 종류면 빈 목록) */
  addSys(at: number, e: CoreEvent, ctx: LogContext, input: InputEvent | null): LogChange[] {
    const text = describeSys(e, ctx, input);
    if (text === null) return [];
    const source = sysSource(e, input);
    this.pushRaw({ at, t: 'sys', event: e, source });
    return this.add({ at, kind: 'sys', dropped: false, main: text, sub: '', source });
  }

  /** 자유 문장 SYS 행(설정 반영 등) */
  addNote(at: number, text: string, source = '사이트'): LogChange[] {
    this.pushRaw({ at, t: 'sys', event: { t: 'config' }, source });
    return this.add({ at, kind: 'sys', dropped: false, main: text, sub: '', source });
  }

  clear(): LogChange[] {
    this.entries.length = 0;
    this.raw.length = 0;
    return [{ type: 'clear' }];
  }

  /** 내보내기 JSON 객체. hid/dropped 배열은 /shared/test-vectors 의 expect.hid·dropped 와 같은 HidEvent 형식 */
  toExport(meta: { os: OsId; mode: ModeId; deviceName: string; exportedAt: string }): object {
    return {
      $comment:
        '손목 컨트롤러 시뮬레이터 HID 로그. records = 시간순 원본(마우스 이동 묶지 않음), hid = PC 에 도착한 HidEvent 목록(test-vector expect.hid 형식), dropped = 연결 끊김으로 버린 것.',
      kind: 'wrist-sim-hid-log',
      version: 1,
      ...meta,
      records: this.raw,
      hid: this.raw.filter((r): r is Extract<RawRecord, { t: 'hid' }> => r.t === 'hid' && !r.dropped).map((r) => r.ev),
      dropped: this.raw.filter((r): r is Extract<RawRecord, { t: 'hid' }> => r.t === 'hid' && r.dropped).map((r) => r.ev),
    };
  }

  private add(e: Omit<LogEntry, 'id'>): LogChange[] {
    const entry: LogEntry = { ...e, id: this.nextId++ };
    this.entries.push(entry);
    const changes: LogChange[] = [{ type: 'add', entry }];
    if (this.entries.length > this.maxRows) {
      const removed = this.entries.splice(0, this.entries.length - this.maxRows);
      changes.push({ type: 'remove', ids: removed.map((r) => r.id) });
    }
    return changes;
  }

  private pushRaw(r: RawRecord): void {
    this.raw.push(r);
    if (this.raw.length > this.maxRaw) this.raw.splice(0, this.raw.length - this.maxRaw);
  }
}
