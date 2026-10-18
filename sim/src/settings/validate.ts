/**
 * keymap.json · gesture.json 검증 — 담당: settings 모듈.
 * 명세: design/settings-install.md 2.4 (오류 = 적용 막음, 경고 = 적용함).
 *  1) JSON 문법(줄:열) → 2) /shared/schema/*.schema.json (ajv Ajv2020) → 3) 스키마로 못 잡는 의미 검사.
 * 오류가 0개일 때만 설정 화면이 app.setConfig 로 반영한다.
 */
import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import keymapSchema from '@shared/schema/keymap.schema.json';
import gestureSchema from '@shared/schema/gesture.schema.json';
import { formatChord } from '../core/keymap';
import type { Chord, GestureConfig, Keymap, ModeId, OsId } from '../core/types';
import { locateJson, pointerPos } from './jsonLocate';

export type ConfigKind = 'keymap' | 'gesture';

export interface Issue {
  level: 'error' | 'warning';
  /** JSON Pointer (예: /modes/coding/apps/vscode/actions/0/win/key) */
  path: string;
  message: string;
  line?: number;
  col?: number;
}

export interface CheckResult<T> {
  /** 문법이 맞으면 파싱한 값(스키마 오류가 있어도) */
  value: T | null;
  issues: Issue[];
  errors: number;
  warnings: number;
}

/** 작업지시서 확정값 */
export const SPEC_COOLDOWN_MS = 800;
/** 시계 타일 라벨 권장 최대 글자 수 */
export const LABEL_WARN_LEN = 5;

let ajv: Ajv2020 | null = null;
const compiled: Partial<Record<ConfigKind, ValidateFunction>> = {};
function validator(kind: ConfigKind): ValidateFunction {
  ajv ??= new Ajv2020({ allErrors: true, strict: false });
  return (compiled[kind] ??= ajv.compile(kind === 'keymap' ? keymapSchema : gestureSchema));
}

export const SCHEMAS: Record<ConfigKind, unknown> = { keymap: keymapSchema, gesture: gestureSchema };

/** 스키마에서 JSON Pointer 위치의 하위 스키마(폼 범위 표시용). $ref 는 #/$defs 만 */
export function schemaAt(kind: ConfigKind, path: string): Record<string, unknown> | null {
  const root = SCHEMAS[kind] as Record<string, unknown>;
  let s: Record<string, unknown> | null = root;
  const deref = (x: Record<string, unknown>): Record<string, unknown> => {
    const ref = x.$ref;
    if (typeof ref === 'string' && ref.startsWith('#/$defs/')) {
      const d = (root.$defs as Record<string, Record<string, unknown>>)[ref.slice(8)];
      return d ? deref(d) : x;
    }
    return x;
  };
  for (const seg of path.split('/').filter(Boolean)) {
    if (!s) return null;
    s = deref(s);
    const props = s.properties as Record<string, Record<string, unknown>> | undefined;
    if (props && seg in props) s = props[seg];
    else if (/^\d+$/.test(seg) && s.items) s = s.items as Record<string, unknown>;
    else return null;
  }
  return s ? deref(s) : null;
}

const NAME: Record<string, string> = {
  win: 'Windows 단축키',
  mac: 'macOS 단축키',
  key: '키',
  mods: '수정자',
  label: '라벨',
  deviceName: '장치 이름',
};

function ajvMessage(e: ErrorObject): { path: string; message: string } {
  const path = e.instancePath;
  const last = path.split('/').pop() ?? '';
  const p = e.params as Record<string, unknown>;
  switch (e.keyword) {
    case 'required':
      return { path, message: `필수 항목 "${String(p.missingProperty)}" 이(가) 없습니다` };
    case 'additionalProperties':
      return { path, message: `알 수 없는 항목 "${String(p.additionalProperty)}"` };
    case 'enum': {
      const allowed = (p.allowedValues as unknown[]) ?? [];
      if (last === 'key') return { path, message: '알 수 없는 키 이름(hid-usage.json keys 에 없음)' };
      return { path, message: `허용되지 않은 값 — ${allowed.slice(0, 8).map((v) => JSON.stringify(v)).join(', ')}${allowed.length > 8 ? ' …' : ''} 중 하나` };
    }
    case 'const':
      return { path, message: `값은 ${JSON.stringify(p.allowedValue)} 이어야 합니다` };
    case 'type':
      return { path, message: `형식이 ${String(p.type)} 이어야 합니다` };
    case 'minimum':
    case 'exclusiveMinimum':
      return { path, message: `${String(p.limit)} 이상이어야 합니다(범위 밖)` };
    case 'maximum':
    case 'exclusiveMaximum':
      return { path, message: `${String(p.limit)} 이하여야 합니다(범위 밖)` };
    case 'minLength':
      return { path, message: `${NAME[last] ?? '글자'}가 비었습니다(최소 ${String(p.limit)}자)` };
    case 'maxLength':
      return { path, message: `${NAME[last] ?? '글자'}가 너무 깁니다(최대 ${String(p.limit)}자)` };
    case 'minItems':
      return { path, message: `항목이 ${String(p.limit)}개 이상이어야 합니다` };
    case 'maxItems':
      return { path, message: `항목이 ${String(p.limit)}개 이하여야 합니다` };
    case 'uniqueItems':
      return { path, message: last === 'mods' ? '같은 수정자가 중복되었습니다' : '중복 항목이 있습니다' };
    case 'pattern':
      return { path, message: `형식이 맞지 않습니다(${String(p.pattern)})` };
    default:
      return { path, message: e.message ?? e.keyword };
  }
}

function schemaIssues(kind: ConfigKind, value: unknown): Issue[] {
  const v = validator(kind);
  if (v(value)) return [];
  const out: Issue[] = [];
  const seen = new Set<string>();
  for (const e of v.errors ?? []) {
    // type 이 ["object","null"] 인 chord 에서 나오는 부수 오류(if/then 등)는 줄인다
    if (e.keyword === 'if' || e.keyword === 'anyOf' || e.keyword === 'oneOf') continue;
    const m = ajvMessage(e);
    const k = `${m.path}|${m.message}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ level: 'error', ...m });
  }
  return out;
}

const utf8Len = (s: string) => new TextEncoder().encode(s).length;

function keymapSemantics(km: Keymap): Issue[] {
  const out: Issue[] = [];
  const err = (path: string, message: string) => out.push({ level: 'error', path, message });
  const warn = (path: string, message: string) => out.push({ level: 'warning', path, message });

  const max = km.settings?.deviceNameMaxBytes ?? 29;
  if (typeof km.settings?.deviceName === 'string' && utf8Len(km.settings.deviceName) > max)
    err('/settings/deviceName', `장치 이름이 UTF-8 ${utf8Len(km.settings.deviceName)}바이트 — 최대 ${max}바이트(한글 1자 = 3바이트)`);

  for (const mode of Object.keys(km.modes ?? {}) as ModeId[]) {
    const m = km.modes[mode];
    if (!m?.apps) continue;
    if (!m.apps[m.defaultApp]) err(`/modes/${mode}/defaultApp`, `기본 앱 "${m.defaultApp}" 이(가) apps 에 없습니다`);
    (m.appOrder ?? []).forEach((a, i) => {
      if (!m.apps[a]) err(`/modes/${mode}/appOrder/${i}`, `앱 "${a}" 이(가) apps 에 없습니다`);
    });
    for (const [appId, app] of Object.entries(m.apps)) {
      const ids = new Set<string>();
      const chords: Record<OsId, Map<string, string>> = { win: new Map(), mac: new Map() };
      (app.actions ?? []).forEach((a, i) => {
        const base = `/modes/${mode}/apps/${appId}/actions/${i}`;
        if (ids.has(a.id)) err(`${base}/id`, `동작 id "${a.id}" 이(가) 중복되었습니다`);
        ids.add(a.id);
        if (typeof a.label === 'string' && [...a.label].length > LABEL_WARN_LEN)
          warn(`${base}/label`, `라벨 "${a.label}" 이(가) ${LABEL_WARN_LEN}글자를 넘어 시계 타일에서 잘릴 수 있습니다`);
        for (const os of ['win', 'mac'] as const) {
          const c = a[os] as Chord | null | undefined;
          if (!c || !Array.isArray(c.mods) || typeof c.key !== 'string') continue;
          const sig = `${[...c.mods].sort().join('+')}+${c.key}`;
          const prev = chords[os].get(sig);
          if (prev) warn(`${base}/${os}`, `${os === 'win' ? 'Windows' : 'macOS'} 단축키 ${formatChord(c, os)} 이(가) "${prev}" 와 겹칩니다`);
          else chords[os].set(sig, a.label);
        }
      });
      if (mode === 'present') {
        for (const need of ['next', 'prev'] as const)
          if (!ids.has(need)) warn(`/modes/${mode}/apps/${appId}/actions`, `"${need}" 동작이 없어 넘기기·튕김이 이 앱에서 아무 키도 보내지 않습니다`);
      }
    }
  }
  return out;
}

function gestureSemantics(g: GestureConfig): Issue[] {
  const out: Issue[] = [];
  const err = (path: string, message: string) => out.push({ level: 'error', path, message });
  const warn = (path: string, message: string) => out.push({ level: 'warning', path, message });
  const dz = g.airMouse?.deadzoneDps;
  if (dz && typeof dz.enter === 'number' && typeof dz.exit === 'number' && dz.exit > dz.enter)
    err('/airMouse/deadzoneDps/exit', `해제(exit ${dz.exit})는 진입(enter ${dz.enter}) 이하여야 합니다`);
  const f = g.flick;
  if (f && typeof f.minAboveMs === 'number' && typeof f.maxAboveMs === 'number' && f.minAboveMs >= f.maxAboveMs)
    err('/flick/maxAboveMs', `최대 지속(${f.maxAboveMs}ms)은 최소 지속(${f.minAboveMs}ms)보다 커야 합니다`);
  if (f && typeof f.cooldownMs === 'number' && f.cooldownMs !== SPEC_COOLDOWN_MS)
    warn('/flick/cooldownMs', `작업지시서 기준값은 ${SPEC_COOLDOWN_MS}ms 입니다(현재 ${f.cooldownMs}ms)`);
  const am = g.imu?.axisMap;
  if (am) {
    const vals = Object.values(am);
    if (new Set(vals).size !== vals.length) err('/imu/axisMap', 'yaw·pitch·roll 이 같은 센서 축을 가리킵니다(서로 달라야 함)');
  }
  if (f && f.axis && f.axis !== 'roll')
    warn('/flick/axis', `튕김 축이 ${f.axis} — 에어마우스(yaw·pitch)와 같은 축이면 포인터 이동이 튕김으로 잡힐 수 있습니다`);
  return out;
}

/** 값 검증(스키마 + 의미). 줄:열 없음 */
export function checkValue(kind: ConfigKind, value: unknown): Issue[] {
  const issues = schemaIssues(kind, value);
  // 스키마 오류가 있으면 의미 검사는 구조가 깨졌을 수 있어 조심스럽게(예외 무시)
  try {
    issues.push(...(kind === 'keymap' ? keymapSemantics(value as Keymap) : gestureSemantics(value as GestureConfig)));
  } catch {
    /* 구조가 크게 깨진 경우 — 스키마 오류로 충분 */
  }
  return issues;
}

/** 원문 검증: 문법 → 스키마 → 의미, 각 문제에 줄:열을 붙인다 */
export function checkText<T>(kind: ConfigKind, text: string): CheckResult<T> {
  const loc = locateJson(text);
  if (loc.error) {
    const issues: Issue[] = [{ level: 'error', path: '', message: `JSON 문법 오류: ${loc.error.message}`, line: loc.error.pos.line, col: loc.error.pos.col }];
    return { value: null, issues, errors: 1, warnings: 0 };
  }
  let value: T;
  try {
    value = JSON.parse(text) as T;
  } catch (e) {
    const issues: Issue[] = [{ level: 'error', path: '', message: `JSON 문법 오류: ${e instanceof Error ? e.message : String(e)}` }];
    return { value: null, issues, errors: 1, warnings: 0 };
  }
  const issues = checkValue(kind, value).map((is) => {
    const p = pointerPos(loc, is.path);
    return p ? { ...is, line: p.line, col: p.col } : is;
  });
  issues.sort((a, b) => (a.level === b.level ? (a.line ?? 0) - (b.line ?? 0) : a.level === 'error' ? -1 : 1));
  return { value, issues, errors: issues.filter((x) => x.level === 'error').length, warnings: issues.filter((x) => x.level === 'warning').length };
}

/** 내보내기 형식: 들여쓰기 2칸 + 끝 줄바꿈 1개 */
export function toJsonText(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

/** 두 값의 바뀐 말단 개수(가져오기 확인 대화상자용) */
export function countChanges(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return 1;
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  let n = 0;
  for (const k of keys) n += countChanges((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]);
  return n;
}
