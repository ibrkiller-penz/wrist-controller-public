/**
 * JSON 원문 위치 찾기 — 설정 화면 'JSON 원문' 탭의 오류 줄:열 표시용(담당: settings 모듈).
 * JSON.parse 의 오류 메시지는 브라우저마다 위치 표기가 달라서, 작은 파서를 따로 두어
 *  (1) 문법 오류의 줄:열, (2) 각 값(JSON Pointer)의 시작 줄:열 을 구한다. 값 자체는 JSON.parse 결과를 쓴다.
 */

export interface TextPos {
  /** 1부터 */
  line: number;
  /** 1부터 */
  col: number;
  /** 0부터 문자 위치 */
  offset: number;
}

export interface LocateResult {
  /** JSON Pointer('' = 루트, '/modes/present') → 값 시작 위치 */
  pointers: Map<string, TextPos>;
  error: { pos: TextPos; message: string } | null;
}

const escPtr = (k: string) => k.replace(/~/g, '~0').replace(/\//g, '~1');

export function posAt(text: string, offset: number): TextPos {
  let line = 1;
  let last = -1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      last = i;
    }
  }
  return { line, col: offset - last, offset };
}

class Fail extends Error {
  constructor(
    public at: number,
    msg: string,
  ) {
    super(msg);
  }
}

export function locateJson(text: string): LocateResult {
  const pointers = new Map<string, TextPos>();
  let i = 0;
  const n = text.length;
  const ws = () => {
    while (i < n) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i++;
      else break;
    }
  };
  const expect = (ch: string, what: string) => {
    if (text[i] !== ch) throw new Fail(i, i >= n ? `${what}이(가) 필요한데 파일이 끝났습니다` : `${what}이(가) 필요합니다 ("${text[i]}" 발견)`);
    i++;
  };
  const str = (): string => {
    const start = i;
    expect('"', '따옴표(")');
    let out = '';
    while (i < n) {
      const c = text[i];
      if (c === '"') {
        i++;
        return out;
      }
      if (c === '\\') {
        const e = text[i + 1];
        if (e === 'u') {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Fail(i, '잘못된 \\u 이스케이프');
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          continue;
        }
        const map: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (!(e in map)) throw new Fail(i, '잘못된 이스케이프 문자');
        out += map[e];
        i += 2;
        continue;
      }
      if (c === '\n') throw new Fail(i, '문자열 안에서 줄이 바뀌었습니다(닫는 따옴표 누락?)');
      out += c;
      i++;
    }
    throw new Fail(start, '닫는 따옴표가 없습니다');
  };
  const value = (ptr: string) => {
    ws();
    pointers.set(ptr, posAt(text, i));
    const c = text[i];
    if (c === '{') {
      i++;
      ws();
      if (text[i] === '}') {
        i++;
        return;
      }
      for (;;) {
        ws();
        if (text[i] === '}') throw new Fail(i, '마지막 항목 뒤에 쉼표가 있습니다');
        const k = str();
        ws();
        expect(':', '콜론(:)');
        value(`${ptr}/${escPtr(k)}`);
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === '}') {
          i++;
          return;
        }
        throw new Fail(i, i >= n ? '닫는 } 가 없습니다' : `쉼표(,) 또는 } 가 필요합니다 ("${text[i]}" 발견)`);
      }
    }
    if (c === '[') {
      i++;
      ws();
      if (text[i] === ']') {
        i++;
        return;
      }
      for (let idx = 0; ; idx++) {
        ws();
        if (text[i] === ']') throw new Fail(i, '마지막 항목 뒤에 쉼표가 있습니다');
        value(`${ptr}/${idx}`);
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === ']') {
          i++;
          return;
        }
        throw new Fail(i, i >= n ? '닫는 ] 가 없습니다' : `쉼표(,) 또는 ] 가 필요합니다 ("${text[i]}" 발견)`);
      }
    }
    if (c === '"') {
      str();
      return;
    }
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i, i + 64));
    if (m && m[0].length > 0 && m[0] !== '-') {
      i += m[0].length;
      return;
    }
    for (const lit of ['true', 'false', 'null']) {
      if (text.startsWith(lit, i)) {
        i += lit.length;
        return;
      }
    }
    if (i >= n) throw new Fail(i, '값이 필요한데 파일이 끝났습니다');
    if (c === "'") throw new Fail(i, '작은따옴표 대신 큰따옴표(")를 쓰세요');
    throw new Fail(i, `알 수 없는 값 "${text.slice(i, i + 12).split(/[\s,}\]]/)[0]}"`);
  };
  try {
    value('');
    ws();
    if (i < n) throw new Fail(i, 'JSON 이 끝난 뒤에 글자가 더 있습니다');
    return { pointers, error: null };
  } catch (e) {
    if (e instanceof Fail) return { pointers, error: { pos: posAt(text, e.at), message: e.message } };
    throw e;
  }
}

/** pointer 의 위치. 없으면 가장 가까운 상위 값 위치 */
export function pointerPos(loc: LocateResult, ptr: string): TextPos | null {
  let p = ptr;
  for (;;) {
    const hit = loc.pointers.get(p);
    if (hit) return hit;
    if (p === '') return null;
    p = p.slice(0, p.lastIndexOf('/'));
  }
}
