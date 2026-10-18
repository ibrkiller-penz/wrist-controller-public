// 공유 테스트 벡터 /shared/test-vectors/airmouse.json 을 코어에 돌려 검증한다.
import { describe, expect, it } from 'vitest';
import suite from '@shared/test-vectors/airmouse.json';
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
