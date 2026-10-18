/**
 * 키맵 해석 — keymap.json 에서 (모드, 앱, 동작, OS) → 키 조합을 찾고, 표시 문자열·HID 보고서 값으로 바꾼다.
 * 펌웨어는 tools/ 의 생성 스크립트가 같은 규칙으로 C 헤더를 만든다.
 */
import hidUsage from '@shared/hid-usage.json';
import type { ActionId, AppId, Binding, Chord, Keymap, KeymapAction, Macro, MacroStep, Mod, ModeId, OsId } from './types';

const MOD_BITS: Record<Mod, number> = {
  ctrl: parseInt(hidUsage.modifiers.ctrl, 16),
  shift: parseInt(hidUsage.modifiers.shift, 16),
  alt: parseInt(hidUsage.modifiers.alt, 16),
  gui: parseInt(hidUsage.modifiers.gui, 16),
};

const KEY_USAGE: Record<string, number> = Object.fromEntries(
  Object.entries(hidUsage.keys as Record<string, string>).map(([k, v]) => [k, parseInt(v, 16)]),
);

/** hid-usage.json 에 있는 모든 키 이름 */
export const KEY_NAMES: readonly string[] = Object.keys(KEY_USAGE);
export const MODS: readonly Mod[] = ['ctrl', 'shift', 'alt', 'gui'];

export function isKnownKey(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(KEY_USAGE, name);
}

/** 키 이름 → HID 키보드 페이지 사용 코드. 모르는 키면 -1 */
export function keyUsage(name: string): number {
  return isKnownKey(name) ? KEY_USAGE[name] : -1;
}

/** 수정자 목록 → 보고서 수정자 바이트 */
export function modBits(mods: readonly Mod[]): number {
  let b = 0;
  for (const m of mods) b |= MOD_BITS[m] ?? 0;
  return b;
}

/** 키 조합 → HID 보고서 값 {modifier, usage} */
export function chordToReport(chord: Chord): { modifier: number; usage: number } {
  return { modifier: modBits(chord.mods), usage: keyUsage(chord.key) };
}

/** 모드의 현재 앱에 정의된 동작 목록(배열 순서 = 화면 배치 순서) */
export function listActions(keymap: Keymap, mode: ModeId, app: AppId): KeymapAction[] {
  return keymap.modes[mode]?.apps[app]?.actions ?? [];
}

export function findAction(keymap: Keymap, mode: ModeId, app: AppId, action: ActionId): KeymapAction | null {
  return listActions(keymap, mode, app).find((a) => a.id === action) ?? null;
}

export function isMacro(b: Binding | null | undefined): b is Macro {
  return !!b && Array.isArray((b as Macro).steps);
}

/** 매크로 text 의 {url} 자리를 바꾼다. url 이 비었는데 {url} 을 쓰면 null(= 비활성) */
function substituteUrl(m: Macro, url: string | undefined): Macro | null {
  let ok = true;
  const steps = m.steps.map((st): MacroStep => {
    if ('text' in st && st.text.includes('{url}')) {
      if (!url) ok = false;
      return { text: st.text.split('{url}').join(url ?? '') };
    }
    if ('chord' in st) return { chord: { mods: [...st.chord.mods], key: st.chord.key } };
    return { ...st };
  });
  return ok ? { steps } : null;
}

/** 동작의 바인딩(키 조합 또는 매크로). alt = 길게 누르기(winAlt/macAlt). 없으면 null */
export function bindingOf(a: KeymapAction, os: OsId, alt = false): Binding | null {
  const b = alt ? (os === 'win' ? a.winAlt : a.macAlt) : a[os];
  if (!b) return null;
  if (isMacro(b)) return substituteUrl(b, a.url);
  return { mods: [...b.mods], key: b.key };
}

/** (모드, 앱, 동작, OS) → 바인딩. 정의가 없거나 null 이면 null(= 타일 비활성, 전송 안 함) */
export function resolveBinding(
  keymap: Keymap,
  mode: ModeId,
  app: AppId,
  action: ActionId,
  os: OsId,
  alt = false,
): Binding | null {
  const a = findAction(keymap, mode, app, action);
  return a ? bindingOf(a, os, alt) : null;
}

/** (모드, 앱, 동작, OS) → 키 조합. 정의가 없거나 null 이면 null. 매크로 동작이면 null(→ resolveBinding) */
export function resolveChord(keymap: Keymap, mode: ModeId, app: AppId, action: ActionId, os: OsId): Chord | null {
  const b = resolveBinding(keymap, mode, app, action, os);
  return b && !isMacro(b) ? b : null;
}

// ---------------------------------------------------------------------------
// 매크로 → HID 보고서 열 (펌웨어 firmware/logic keymap.cpp expandMacro 와 같은 규칙, 테스트 벡터 macro.json)
// ---------------------------------------------------------------------------

/** 글자 사이 간격(ms) — launcher.md 2.3 시작값 15ms(실기로 조정) */
export const MACRO_TEXT_GAP_MS = 15;
export const MACRO_MAX_STEPS = 24;

const SHIFTED: Record<string, string> = {
  '!': '1', '@': '2', '#': '3', $: '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
  _: 'MINUS', '+': 'EQUAL', '{': 'LEFTBRACKET', '}': 'RIGHTBRACKET', '|': 'BACKSLASH', ':': 'SEMICOLON',
  '"': 'QUOTE', '~': 'GRAVE', '<': 'COMMA', '>': 'PERIOD', '?': 'SLASH',
};
const PLAIN: Record<string, string> = {
  ' ': 'SPACE', '-': 'MINUS', '=': 'EQUAL', '[': 'LEFTBRACKET', ']': 'RIGHTBRACKET', '\\': 'BACKSLASH',
  ';': 'SEMICOLON', "'": 'QUOTE', '`': 'GRAVE', ',': 'COMMA', '.': 'PERIOD', '/': 'SLASH',
};

/** ASCII 한 글자 → US 배열 키 조합. 출력 불가 글자는 null */
export function charToChord(c: string): Chord | null {
  if (c.length !== 1) return null;
  if (c >= 'a' && c <= 'z') return { mods: [], key: c.toUpperCase() };
  if (c >= 'A' && c <= 'Z') return { mods: ['shift'], key: c };
  if (c >= '0' && c <= '9') return { mods: [], key: c };
  if (PLAIN[c]) return { mods: [], key: PLAIN[c] };
  if (SHIFTED[c]) return { mods: ['shift'], key: SHIFTED[c] };
  return null;
}

/** 소비자 키 이름 → 사용 코드(hid-usage.json consumer). 모르면 -1 */
export function consumerUsage(name: string): number {
  const v = (hidUsage.consumer as Record<string, string>)[name];
  return v ? parseInt(v, 16) : -1;
}

/** 매크로를 보낼 보고서 열. kbd = 키보드 보고서(수정자 바이트, 키 사용 코드 — 0,0 = 모두 뗌), consumer, wait */
export type MacroReport =
  | { r: 'kbd'; mod: number; usage: number }
  | { r: 'consumer'; usage: number }
  | { r: 'wait'; ms: number };

/**
 * 매크로 → 보고서 열. 규칙(펌웨어와 같음):
 *  chord = 누름[수정자, 키] → 뗌[0,0] / text = 글자마다 누름 → 뗌, 글자 사이 MACRO_TEXT_GAP_MS 대기 /
 *  consumer = [사용 코드] → [0] / wait = 대기(0~3000). 모르는 키·글자는 건너뛴다. 단계는 앞 MACRO_MAX_STEPS 개만.
 */
export function expandMacro(steps: readonly MacroStep[]): MacroReport[] {
  const out: MacroReport[] = [];
  const press = (c: Chord) => {
    const u = keyUsage(c.key);
    if (u < 0) return;
    out.push({ r: 'kbd', mod: modBits(c.mods), usage: u }, { r: 'kbd', mod: 0, usage: 0 });
  };
  for (const st of steps.slice(0, MACRO_MAX_STEPS)) {
    if ('chord' in st) press(st.chord);
    else if ('wait' in st) out.push({ r: 'wait', ms: Math.min(Math.max(Math.round(st.wait), 0), 3000) });
    else if ('consumer' in st) {
      const u = consumerUsage(st.consumer);
      if (u >= 0) out.push({ r: 'consumer', usage: u }, { r: 'consumer', usage: 0 });
    } else if ('text' in st) {
      let first = true;
      for (const ch of st.text) {
        const c = charToChord(ch);
        if (!c) continue;
        if (!first) out.push({ r: 'wait', ms: MACRO_TEXT_GAP_MS });
        press(c);
        first = false;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 표시 문자열
// ---------------------------------------------------------------------------

const MOD_ORDER: Record<OsId, Mod[]> = {
  win: ['ctrl', 'alt', 'shift', 'gui'],
  mac: ['ctrl', 'gui', 'alt', 'shift'],
};
const MOD_LABEL: Record<OsId, Record<Mod, string>> = {
  win: { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', gui: 'Win' },
  mac: { ctrl: 'Ctrl', alt: 'Option', shift: 'Shift', gui: 'Cmd' },
};
const KEY_LABEL: Record<string, string> = {
  RIGHT: '→', LEFT: '←', UP: '↑', DOWN: '↓',
  ESCAPE: 'Esc', ENTER: 'Enter', SPACE: 'Space', TAB: 'Tab', BACKSPACE: 'Backspace', DELETE: 'Del',
  PAGEUP: 'PgUp', PAGEDOWN: 'PgDn', HOME: 'Home', END: 'End', INSERT: 'Ins',
  GRAVE: '`', SLASH: '/', PERIOD: '.', COMMA: ',', MINUS: '-', EQUAL: '=', BACKSLASH: '\\',
  SEMICOLON: ';', QUOTE: "'", LEFTBRACKET: '[', RIGHTBRACKET: ']',
  LANG1: '한/영', LANG2: '한자', CAPSLOCK: 'CapsLock', PRINTSCREEN: 'PrtSc', SCROLLLOCK: 'ScrLk', PAUSE: 'Pause',
};

export function keyLabel(key: string, os: OsId): string {
  if (key === 'ENTER' && os === 'mac') return 'Return';
  return KEY_LABEL[key] ?? key;
}

/** 키 조합 → 사람이 읽는 표기. 예) win: "Ctrl+Shift+P", mac: "Cmd+Shift+P". null 이면 "" */
export function formatChord(chord: Chord | null, os: OsId): string {
  if (!chord) return '';
  const mods = MOD_ORDER[os].filter((m) => chord.mods.includes(m)).map((m) => MOD_LABEL[os][m]);
  return [...mods, keyLabel(chord.key, os)].join('+');
}

const CONSUMER_LABEL: Record<string, string> = {
  MUTE: 'Mute', VOLUME_UP: 'Vol+', VOLUME_DOWN: 'Vol-', PLAY_PAUSE: 'Play/Pause', NEXT_TRACK: 'Next track', PREV_TRACK: 'Prev track',
};

/** 매크로 단계 목록 → 표기. 대기는 빼고 " → " 로 잇는다. 예) "Win+R → powerpnt → Enter" */
export function formatSteps(steps: readonly MacroStep[], os: OsId): string {
  return steps
    .map((st) =>
      'chord' in st ? formatChord(st.chord, os) : 'text' in st ? st.text : 'consumer' in st ? (CONSUMER_LABEL[st.consumer] ?? st.consumer) : '',
    )
    .filter((t) => t !== '')
    .join(' → ');
}

/** 바인딩 → 표기(키 조합이면 formatChord, 매크로면 formatSteps). null 이면 "" */
export function formatBinding(b: Binding | null | undefined, os: OsId): string {
  if (!b) return '';
  return isMacro(b) ? formatSteps(b.steps, os) : formatChord(b, os);
}

// ---------------------------------------------------------------------------
// 표기 → 키 조합 (설정 화면 입력칸용)
// ---------------------------------------------------------------------------

const MOD_ALIASES: Record<string, Mod> = {
  ctrl: 'ctrl', control: 'ctrl', ctl: 'ctrl',
  shift: 'shift',
  alt: 'alt', option: 'alt', opt: 'alt',
  gui: 'gui', cmd: 'gui', command: 'gui', win: 'gui', meta: 'gui', super: 'gui',
};
const KEY_ALIASES: Record<string, string> = {
  '→': 'RIGHT', '←': 'LEFT', '↑': 'UP', '↓': 'DOWN',
  ARROWRIGHT: 'RIGHT', ARROWLEFT: 'LEFT', ARROWUP: 'UP', ARROWDOWN: 'DOWN',
  ESC: 'ESCAPE', RETURN: 'ENTER', DEL: 'DELETE', PGUP: 'PAGEUP', PGDN: 'PAGEDOWN', INS: 'INSERT',
  '`': 'GRAVE', BACKQUOTE: 'GRAVE', '/': 'SLASH', '.': 'PERIOD', ',': 'COMMA', '-': 'MINUS', '=': 'EQUAL',
  '\\': 'BACKSLASH', ';': 'SEMICOLON', "'": 'QUOTE', '[': 'LEFTBRACKET', ']': 'RIGHTBRACKET',
};

export type ParseChordResult = { ok: true; chord: Chord | null } | { ok: false; error: string };

/** "Ctrl+Shift+P", "Cmd+/" 같은 표기를 키 조합으로. 빈 문자열은 null(동작 없음)로 성공 */
export function parseChord(text: string): ParseChordResult {
  const s = text.trim();
  if (s === '') return { ok: true, chord: null };
  // '+' 키 자체는 지원하지 않는다(EQUAL 과 Shift 조합으로 표현)
  const parts = s.split('+').map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length === 0) return { ok: false, error: '빈 키 조합' };
  const mods: Mod[] = [];
  for (const p of parts.slice(0, -1)) {
    const m = MOD_ALIASES[p.toLowerCase()];
    if (!m) return { ok: false, error: `알 수 없는 수정자 "${p}"` };
    if (mods.includes(m)) return { ok: false, error: `수정자 중복 "${p}"` };
    mods.push(m);
  }
  const last = parts[parts.length - 1];
  if (MOD_ALIASES[last.toLowerCase()]) return { ok: false, error: '수정자만 있는 조합' };
  const upper = last.toUpperCase();
  const key = KEY_ALIASES[last] ?? KEY_ALIASES[upper] ?? upper;
  if (!isKnownKey(key)) return { ok: false, error: `알 수 없는 키 이름 "${last}"` };
  return { ok: true, chord: { mods, key } };
}

// ---------------------------------------------------------------------------
// 매크로 표기 ↔ 바인딩 (설정 화면 입력칸용). 단계는 ';' 로 나눈다.
//   "Win+R; wait 300; text claude://claude.ai/new; wait 50; Enter"   /   "consumer MUTE"
// 키 조합 단계는 parseChord 표기 그대로. 빈 문자열 = 동작 없음(null). 키 조합 하나뿐이면 매크로가 아니라 키 조합.
// ---------------------------------------------------------------------------

export type ParseBindingResult = { ok: true; binding: Binding | null } | { ok: false; error: string };

const ASCII_TEXT = /^[\x20-\x7E]{1,96}$/;

export function parseBinding(src: string): ParseBindingResult {
  const s = src.trim();
  if (s === '') return { ok: true, binding: null };
  const parts = s.split(';').map((p) => p.trim()).filter((p) => p.length > 0);
  const steps: MacroStep[] = [];
  for (const p of parts) {
    const m = /^(wait|text|consumer)\s+(.*)$/i.exec(p);
    if (m) {
      const kind = m[1].toLowerCase();
      const arg = m[2];
      if (kind === 'wait') {
        const n = Number(arg);
        if (!Number.isInteger(n) || n < 0 || n > 3000) return { ok: false, error: `wait 는 0~3000 정수(ms): "${arg}"` };
        steps.push({ wait: n });
      } else if (kind === 'text') {
        if (!ASCII_TEXT.test(arg)) return { ok: false, error: `text 는 영문·숫자·기호(ASCII) 1~96자만: "${arg}"` };
        steps.push({ text: arg });
      } else {
        const name = arg.trim().toUpperCase();
        if (consumerUsage(name) < 0) return { ok: false, error: `알 수 없는 소비자 키 "${arg}"` };
        steps.push({ consumer: name });
      }
      continue;
    }
    const r = parseChord(p);
    if (!r.ok) return r;
    if (r.chord) steps.push({ chord: r.chord });
  }
  if (steps.length === 0) return { ok: true, binding: null };
  if (steps.length > MACRO_MAX_STEPS) return { ok: false, error: `단계는 최대 ${MACRO_MAX_STEPS}개` };
  if (steps.length === 1 && 'chord' in steps[0]) return { ok: true, binding: steps[0].chord };
  return { ok: true, binding: { steps } };
}

/** 바인딩 → 입력칸 표기(parseBinding 과 왕복). 수정자는 Windows 표기(Win = gui) */
export function bindingSource(b: Binding | null | undefined): string {
  if (!b) return '';
  const steps: MacroStep[] = isMacro(b) ? b.steps : [{ chord: b }];
  return steps
    .map((st) =>
      'chord' in st
        ? formatChord(st.chord, 'win').replace(/→/g, 'Right').replace(/←/g, 'Left').replace(/↑/g, 'Up').replace(/↓/g, 'Down')
        : 'wait' in st
          ? `wait ${st.wait}`
          : 'text' in st
            ? `text ${st.text}`
            : `consumer ${st.consumer}`,
    )
    .join('; ');
}
