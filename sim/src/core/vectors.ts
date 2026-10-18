/**
 * 공유 테스트 벡터 실행기 — /shared/test-vectors/*.json 형식(README.md)을 해석해 코어에 돌린다.
 * vitest 와 (원하면) 시뮬레이터 개발자 패널이 함께 쓴다. 펌웨어 C++ 는 같은 규칙으로 자체 실행기를 둔다.
 */
import { chordToReport, expandMacro, formatChord, formatSteps, resolveChord, type MacroReport } from './keymap';
import { initState, step } from './modeMachine';
import { TouchGesture } from './touchGesture';
import type { ActionId, AppId, Chord, CoreEvent, CoreState, GestureConfig, HidEvent, InputEvent, Keymap, MacroStep, ModeId, OsId } from './types';

// ---------------------------------------------------------------- 형식
export interface ImuSeries {
  start: number;
  dt: number;
  samples: [number, number, number][];
}

export interface StepExpect {
  hid?: HidEvent[];
  keys?: HidEvent[];
  dropped?: HidEvent[];
  mouse?: { dx?: [number, number]; dy?: [number, number]; count?: [number, number] };
  droppedMouse?: { count?: [number, number] };
  state?: Record<string, unknown>;
  events?: Record<string, unknown>[];
  noEvents?: string[];
  /** touch suite: 이 단계에서 TouchGesture 가 낸 코어 입력 전체(부분 일치, 개수까지) */
  inputs?: Record<string, unknown>[];
  /** touch suite: 이 단계 뒤 설정 화면 요청이 있었나(takeSettingsRequest) */
  settingsRequest?: boolean;
}

export type VectorStep =
  | { at: number; input: InputEvent; expect?: StepExpect }
  | { imu: ImuSeries; expect?: StepExpect }
  /** touch suite: 원시 터치 샘플(down·move = 닿아 있음, up = 뗌) → TouchGesture → 코어 */
  | { at: number; touch: 'down' | 'move' | 'up'; x: number; y: number; expect?: StepExpect }
  /** touch suite: 누르고 있는 동안 시각만 흐름(길게 누름 판정) */
  | { at: number; poll: true; expect?: StepExpect };

export interface MachineCase {
  id: string;
  desc?: string;
  checklist?: string;
  init?: Partial<CoreState>;
  configPatch?: { keymap?: unknown; gesture?: unknown };
  steps: VectorStep[];
}

export interface MachineSuite {
  suite: string;
  description?: string;
  cases: MachineCase[];
}

export interface KeymapCase {
  mode: ModeId;
  app: AppId;
  os: OsId;
  action: ActionId;
  expect: { chord: Chord | null; label: string; modifier?: string; usage?: string };
}

export interface KeymapSuite {
  suite: 'keymap';
  description?: string;
  cases: KeymapCase[];
}

// ---------------------------------------------------------------- 비교 도우미
export function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === undefined) return structuredClone(base);
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return structuredClone(patch) as T;
  const out: Record<string, unknown> = structuredClone(base) as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    out[k] = k in out && out[k] !== null && typeof out[k] === 'object' && !Array.isArray(out[k]) ? deepMerge(out[k], v) : structuredClone(v);
  }
  return out as T;
}

/** expected 에 적힌 필드만 비교. 배열은 길이와 각 원소를 비교 */
export function partialMatch(actual: unknown, expected: unknown, path = ''): string[] {
  if (expected === null || typeof expected !== 'object') {
    return Object.is(actual, expected) || actual === expected ? [] : [`${path || '(값)'}: 기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`];
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return [`${path}: 배열이 아님 (${JSON.stringify(actual)})`];
    if (actual.length !== expected.length) return [`${path}: 길이 기대 ${expected.length}, 실제 ${actual.length}`];
    return expected.flatMap((e, i) => partialMatch(actual[i], e, `${path}[${i}]`));
  }
  if (actual === null || typeof actual !== 'object') return [`${path}: 객체가 아님 (${JSON.stringify(actual)})`];
  return Object.entries(expected as Record<string, unknown>).flatMap(([k, v]) =>
    partialMatch((actual as Record<string, unknown>)[k], v, path ? `${path}.${k}` : k),
  );
}

/** HID 이벤트 비교. 수정자는 순서와 무관(집합) */
export function hidEqual(a: HidEvent, b: HidEvent): boolean {
  if (a.t !== b.t) return false;
  switch (a.t) {
    case 'key': {
      const bb = b as typeof a;
      return a.key === bb.key && a.mods.length === bb.mods.length && a.mods.every((m) => bb.mods.includes(m));
    }
    case 'mouseMove': {
      const bb = b as typeof a;
      return a.dx === bb.dx && a.dy === bb.dy;
    }
    case 'mouseButton': {
      const bb = b as typeof a;
      return a.button === bb.button && a.down === bb.down;
    }
    case 'consumer':
      return a.usage === (b as typeof a).usage;
    case 'macro':
      return JSON.stringify(a.steps) === JSON.stringify((b as typeof a).steps);
  }
}

function listEqual(actual: HidEvent[], expected: HidEvent[], label: string): string[] {
  if (actual.length === expected.length && actual.every((a, i) => hidEqual(a, expected[i]))) return [];
  return [`${label}: 기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual.slice(0, 12))}${actual.length > 12 ? ` …(${actual.length}개)` : ''}`];
}

const inRange = (v: number, r: [number, number] | undefined) => r === undefined || (v >= r[0] && v <= r[1]);

// ---------------------------------------------------------------- 실행
export interface CaseResult {
  id: string;
  ok: boolean;
  failures: string[];
  finalState: CoreState;
}

export function runMachineCase(c: MachineCase, keymap: Keymap, gesture: GestureConfig): CaseResult {
  const km = deepMerge(keymap, c.configPatch?.keymap);
  const g = deepMerge(gesture, c.configPatch?.gesture);
  let state = initState(km, c.init ?? {});
  const failures: string[] = [];
  const touch = new TouchGesture();

  c.steps.forEach((st, si) => {
    const hid: HidEvent[] = [];
    const dropped: HidEvent[] = [];
    const events: CoreEvent[] = [];
    const run = (input: InputEvent, now: number) => {
      const r = step(state, input, { now, keymap: km, gesture: g });
      state = r.state;
      hid.push(...r.hid.map((e) => e.ev));
      dropped.push(...r.dropped.map((e) => e.ev));
      events.push(...r.events);
    };
    const inputs: InputEvent[] = [];
    if ('touch' in st) {
      const made = touch.sample(st.touch !== 'up', st.x, st.y, st.at, state, km, g);
      inputs.push(...made);
      for (const inp of made) run(inp, st.at);
    } else if ('poll' in st) {
      const made = touch.poll(st.at);
      inputs.push(...made);
      for (const inp of made) run(inp, st.at);
    } else if ('imu' in st) {
      st.imu.samples.forEach(([gx, gy, gz], i) => {
        const t = st.imu.start + i * st.imu.dt;
        run({ t: 'imu', sample: { t, gx, gy, gz } }, t);
      });
    } else {
      run(st.input, st.at);
    }
    const settingsRequest = touch.takeSettingsRequest();
    const ex = st.expect;
    if (!ex) return;
    const tag = `단계 ${si}`;
    if (ex.inputs) {
      const errs = partialMatch(inputs, ex.inputs, 'inputs');
      if (errs.length) failures.push(`${tag} ${errs.join('; ')} (실제 ${JSON.stringify(inputs)})`);
    }
    if (ex.settingsRequest !== undefined && ex.settingsRequest !== settingsRequest) {
      failures.push(`${tag} settingsRequest 기대 ${ex.settingsRequest}, 실제 ${settingsRequest}`);
    }
    const notMove = (e: HidEvent) => e.t !== 'mouseMove';
    if (ex.hid) failures.push(...listEqual(hid, ex.hid, `${tag} hid`));
    if (ex.keys) failures.push(...listEqual(hid.filter(notMove), ex.keys, `${tag} keys`));
    if (ex.dropped) failures.push(...listEqual(dropped.filter(notMove), ex.dropped, `${tag} dropped`));
    if (ex.mouse) {
      const moves = hid.filter((e): e is Extract<HidEvent, { t: 'mouseMove' }> => e.t === 'mouseMove');
      const dx = moves.reduce((s, m) => s + m.dx, 0);
      const dy = moves.reduce((s, m) => s + m.dy, 0);
      if (!inRange(dx, ex.mouse.dx)) failures.push(`${tag} mouse.dx 합 ${dx} 가 범위 ${JSON.stringify(ex.mouse.dx)} 밖`);
      if (!inRange(dy, ex.mouse.dy)) failures.push(`${tag} mouse.dy 합 ${dy} 가 범위 ${JSON.stringify(ex.mouse.dy)} 밖`);
      if (!inRange(moves.length, ex.mouse.count)) failures.push(`${tag} mouse 보고 수 ${moves.length} 가 범위 ${JSON.stringify(ex.mouse.count)} 밖`);
    }
    if (ex.droppedMouse) {
      const n = dropped.filter((e) => e.t === 'mouseMove').length;
      if (!inRange(n, ex.droppedMouse.count)) failures.push(`${tag} 버린 mouse 수 ${n} 가 범위 ${JSON.stringify(ex.droppedMouse.count)} 밖`);
    }
    if (ex.state) failures.push(...partialMatch(state, ex.state, 'state').map((m) => `${tag} ${m}`));
    if (ex.events) {
      // 순서 있는 부분열로 포함되어야 한다
      let from = 0;
      for (const want of ex.events) {
        const idx = events.findIndex((e, i) => i >= from && partialMatch(e, want).length === 0);
        if (idx < 0) {
          failures.push(`${tag} events: ${JSON.stringify(want)} 없음 (실제 ${JSON.stringify(events.slice(0, 10))})`);
          break;
        }
        from = idx + 1;
      }
    }
    if (ex.noEvents) {
      for (const t of ex.noEvents) if (events.some((e) => e.t === t)) failures.push(`${tag} noEvents: '${t}' 이벤트가 나옴`);
    }
  });

  return { id: c.id, ok: failures.length === 0, failures, finalState: state };
}

const hex2 = (n: number) => '0x' + n.toString(16).toUpperCase().padStart(2, '0');

export function runKeymapCase(c: KeymapCase, keymap: Keymap): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const chord = resolveChord(keymap, c.mode, c.app, c.action, c.os);
  const label = formatChord(chord, c.os);
  const tag = `${c.mode}/${c.app}/${c.os}/${c.action}`;
  if (c.expect.chord === null) {
    if (chord !== null) failures.push(`${tag}: 기대 null, 실제 ${JSON.stringify(chord)}`);
  } else if (!chord || !hidEqual({ t: 'key', ...chord }, { t: 'key', ...c.expect.chord })) {
    failures.push(`${tag}: 키 기대 ${JSON.stringify(c.expect.chord)}, 실제 ${JSON.stringify(chord)}`);
  }
  if (label !== c.expect.label) failures.push(`${tag}: 표기 기대 "${c.expect.label}", 실제 "${label}"`);
  if (chord && c.expect.modifier !== undefined) {
    const rep = chordToReport(chord);
    if (hex2(rep.modifier) !== c.expect.modifier) failures.push(`${tag}: 수정자 바이트 기대 ${c.expect.modifier}, 실제 ${hex2(rep.modifier)}`);
    if (c.expect.usage !== undefined && hex2(rep.usage) !== c.expect.usage) failures.push(`${tag}: 사용 코드 기대 ${c.expect.usage}, 실제 ${hex2(rep.usage)}`);
  }
  return { ok: failures.length === 0, failures };
}

// ---------------------------------------------------------------- 매크로 suite (macro.json)
export interface MacroCase {
  id: string;
  desc?: string;
  os?: OsId;
  steps: MacroStep[];
  expect: { reports: MacroReport[]; label?: string };
}

export interface MacroSuite {
  suite: 'macro';
  description?: string;
  cases: MacroCase[];
}

export function runMacroCase(c: MacroCase): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const reports = expandMacro(c.steps);
  if (JSON.stringify(reports) !== JSON.stringify(c.expect.reports)) {
    failures.push(`${c.id}: 보고서 기대 ${JSON.stringify(c.expect.reports)}, 실제 ${JSON.stringify(reports)}`);
  }
  if (c.expect.label !== undefined) {
    const label = formatSteps(c.steps, c.os ?? 'win');
    if (label !== c.expect.label) failures.push(`${c.id}: 표기 기대 "${c.expect.label}", 실제 "${label}"`);
  }
  return { ok: failures.length === 0, failures };
}
