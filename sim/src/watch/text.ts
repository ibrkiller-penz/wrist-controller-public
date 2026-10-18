/**
 * 시계 화면 문구 — 원본은 /shared/strings.ko.json 한 곳(design/v2/README.md 1.2).
 * 펌웨어는 같은 JSON 으로 만든 strings_gen.h 를 쓰므로, 시계 화면에 보이는 한글은 TS 코드에 직접 쓰지 않고 t(키) 로만 꺼낸다.
 * 모드 이름·동작 라벨·앱 이름은 keymap.json 이 원본이다.
 *
 * 개발 모드에서는 화면에 쓰는 글자가 글꼴 서브셋(charset.txt, 펌웨어 kr_* 와 같은 범위)에 있는지 확인해
 * 없는 글자를 글자당 한 번 console.warn 으로 알린다(실기에서는 두부 ▯ 로 보일 글자).
 */
import data from '@shared/strings.ko.json';
import charsetRaw from '../../../firmware/main/fonts/charset.txt?raw';

export type StrKey = keyof typeof data.strings;

const STR: Record<string, string> = data.strings;

/** 이름 후보(뒤에 공백 + 끝자리 4자를 붙여 쓴다, README 3.5) */
export const NAME_CANDIDATES: readonly string[] = data.nameCandidates;

/** 문구 꺼내기. %d·%s 를 순서대로 args 로 바꾼다(C printf 와 같은 자리 표시) */
export function t(key: StrKey, ...args: (string | number)[]): string {
  const raw = STR[key];
  if (raw === undefined) {
    if (import.meta.env.DEV) console.warn(`[문구] strings.ko.json 에 없는 키: ${key}`);
    return key;
  }
  let i = 0;
  return raw.replace(/%[ds]/g, () => String(args[i++] ?? ''));
}

// ---------------------------------------------------------------------------
// 개발용 글리프 검사
// ---------------------------------------------------------------------------
const charset = new Set<string>([...charsetRaw.replace(/[\r\n]/g, '')]);
const warned = new Set<string>();

/** 화면에 쓸 글자가 글꼴 범위 밖이면 글자당 한 번 경고(개발 모드 전용) */
export function checkGlyphs(text: string): void {
  if (!import.meta.env.DEV || !text) return;
  for (const ch of text) {
    if (charset.has(ch) || warned.has(ch)) continue;
    warned.add(ch);
    const cp = ch.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0');
    console.warn(`[글꼴] 서브셋에 없는 글자 "${ch}" (U+${cp}) — 문구: "${text}"`);
  }
}
