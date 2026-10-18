// 공유 테스트 벡터 /shared/test-vectors/touch.json — 원시 터치 샘플 → TouchGesture → 코어(펌웨어 wc::TouchGesture 와 같은 판정).
import { describe, expect, it } from 'vitest';
import suite from '@shared/test-vectors/touch.json';
import { DEFAULT_GESTURE, DEFAULT_KEYMAP } from './config';
import { runMachineCase, type MachineSuite } from './vectors';

const s = suite as unknown as MachineSuite;

describe(`벡터: ${s.suite}`, () => {
  for (const c of s.cases) {
    it(`${c.id}${c.checklist ? ' [' + c.checklist + ']' : ''}`, () => {
      const r = runMachineCase(c, DEFAULT_KEYMAP, DEFAULT_GESTURE);
      expect(r.failures).toEqual([]);
    });
  }
});
