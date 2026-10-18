// 공유 테스트 벡터 /shared/test-vectors/macro.json — 매크로 단계 → HID 보고서 열(펌웨어와 같은 규칙)
import { describe, expect, it } from 'vitest';
import suite from '@shared/test-vectors/macro.json';
import { runMacroCase, type MacroSuite } from './vectors';

const s = suite as unknown as MacroSuite;

describe(`벡터: ${s.suite}`, () => {
  for (const c of s.cases) {
    it(c.id, () => {
      expect(runMacroCase(c).failures).toEqual([]);
    });
  }
});
