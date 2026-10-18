// 공유 테스트 벡터 /shared/test-vectors/accel.json — accel 방식 합성 파형(가만히·걷기·약한 튕김·긴 흔들기).
import { describe, expect, it } from 'vitest';
import suite from '@shared/test-vectors/accel.json';
import { DEFAULT_GESTURE, DEFAULT_KEYMAP } from './config';
import { runMachineCase, type MachineSuite } from './vectors';

const s = suite as unknown as MachineSuite;

describe(`벡터: accel 합성(${s.suite})`, () => {
  for (const c of s.cases) {
    it(c.id, () => {
      expect(runMachineCase(c, DEFAULT_KEYMAP, DEFAULT_GESTURE).failures).toEqual([]);
    });
  }
});
