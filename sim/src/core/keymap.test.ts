// 공유 테스트 벡터 /shared/test-vectors/keymap.json + 키맵 도우미 단위 테스트
import { describe, expect, it } from 'vitest';
import suite from '@shared/test-vectors/keymap.json';
import { DEFAULT_KEYMAP } from './config';
import { bindingSource, formatBinding, isKnownKey, isMacro, listActions, parseBinding } from './keymap';
import type { Binding, ModeId } from './types';
import { runKeymapCase, type KeymapSuite } from './vectors';

const s = suite as unknown as KeymapSuite;

describe('벡터: keymap', () => {
  for (const c of s.cases) {
    it(`${c.mode}/${c.app}/${c.os}/${c.action}`, () => {
      expect(runKeymapCase(c, DEFAULT_KEYMAP).failures).toEqual([]);
    });
  }
});

describe('keymap.json 무결성', () => {
  it('모든 키 이름이 hid-usage.json 에 있다(매크로 단계 포함)', () => {
    const keysOf = (b: Binding | null | undefined): string[] =>
      !b ? [] : isMacro(b) ? b.steps.flatMap((st) => ('chord' in st ? [st.chord.key] : [])) : [b.key];
    for (const mode of DEFAULT_KEYMAP.modeOrder) {
      for (const app of DEFAULT_KEYMAP.modes[mode].appOrder) {
        for (const a of listActions(DEFAULT_KEYMAP, mode as ModeId, app)) {
          for (const b of [a.win, a.mac, a.winAlt, a.macAlt]) {
            for (const k of keysOf(b)) expect(isKnownKey(k), `${mode}/${app}/${a.id} ${k}`).toBe(true);
          }
        }
      }
    }
  });
  it('실행 모드는 2쪽 × 6타일, 시계 모드는 동작 없음', () => {
    expect(listActions(DEFAULT_KEYMAP, 'launch', 'launcher').length).toBe(12);
    expect(listActions(DEFAULT_KEYMAP, 'clock', 'clock').length).toBe(0);
    expect(DEFAULT_KEYMAP.modeOrder[0]).toBe('clock');
  });
});

describe('매크로 표기 ↔ 바인딩', () => {
  it('왕복', () => {
    for (const src of ['Win+R; wait 300; text claude://claude.ai/new; wait 50; Enter', 'consumer MUTE', 'Win+1', 'Ctrl+T; text a b']) {
      const r = parseBinding(src);
      expect(r.ok, src).toBe(true);
      if (r.ok) expect(bindingSource(r.binding)).toBe(src);
    }
  });
  it('키 하나 = 키 조합, 빈 칸 = null', () => {
    const r = parseBinding('Win+1');
    expect(r.ok && !isMacro(r.binding)).toBe(true);
    const e = parseBinding('  ');
    expect(e.ok && e.binding === null).toBe(true);
  });
  it('오류: 한글 text, wait 범위, 모르는 소비자 키', () => {
    expect(parseBinding('text 한글').ok).toBe(false);
    expect(parseBinding('wait 5000').ok).toBe(false);
    expect(parseBinding('consumer FOO').ok).toBe(false);
  });
  it('표기', () => {
    const r = parseBinding('Win+R; wait 300; text powerpnt; wait 50; Enter');
    expect(r.ok && formatBinding(r.binding, 'win')).toBe('Win+R → powerpnt → Enter');
  });
});
