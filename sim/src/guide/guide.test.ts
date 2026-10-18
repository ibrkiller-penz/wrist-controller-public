// 따라 하기 안내서(guide.html)에 적힌 판정값이 shared/gesture.json 과 같은지 검사한다.
// guide.html 의 <span data-g="경로" data-v="값">사람이 읽는 값</span> 을 모두 찾아
//  1) data-v 가 gesture.json 의 그 경로 값과 같은지
//  2) 밀리초 값이면 화면 글자에 초 단위(예: 360 → 0.36, 2000 → 2)가 들어 있는지 본다.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import gesture from '@shared/gesture.json';

const html = readFileSync(fileURLToPath(new URL('../../guide.html', import.meta.url)), 'utf8');

function lookup(path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], gesture);
}

describe('guide.html 판정값', () => {
  const marks = [...html.matchAll(/<span data-g="([^"]+)" data-v="([^"]+)">([^<]*)<\/span>/g)];

  it('표시가 하나 이상 있다', () => {
    expect(marks.length).toBeGreaterThan(3);
  });

  for (const [, path, v, text] of marks) {
    it(`${path} = ${v} (${text})`, () => {
      const actual = lookup(path);
      expect(actual, `gesture.json 에 ${path} 가 없음`).toBeTypeOf('number');
      expect(Number(v)).toBe(actual);
      if (/Ms$/.test(path)) expect(text).toContain(`${(actual as number) / 1000}초`);
    });
  }

  it('따라 하기 링크와 서비스워커 진입점이 있다', () => {
    expect(html).toContain('src="/src/guide/guide.ts"');
    expect(html).toContain('href="./install.html"');
  });
});
