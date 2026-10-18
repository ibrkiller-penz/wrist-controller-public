/**
 * 시계 에뮬레이터 공용 DOM 도우미 — watch 모듈 내부 전용.
 * 좌표는 모두 시계 화면 410×502 기준 px(바깥 축척은 watch.ts 가 transform 으로만 처리).
 */

import { checkGlyphs } from './text';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 요소 만들기: el('div', 'watch-a watch-x', '글자') */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) {
    checkGlyphs(text);
    e.textContent = text;
  }
  return e;
}

/** 아이콘(스프라이트 #i-*). main.ts 가 design/icons.svg 를 본문 앞에 인라인해 두었다 */
export function icon(id: string, size: 'sm' | 'md' | 'lg' = 'md', cls = ''): SVGSVGElement {
  const s = document.createElementNS(SVG_NS, 'svg');
  const sizeCls = size === 'md' ? '' : ` wc-icon--${size}`;
  s.setAttribute('class', `wc-icon${sizeCls}${cls ? ' ' + cls : ''}`);
  s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS(SVG_NS, 'use');
  u.setAttribute('href', `#${id}`);
  s.appendChild(u);
  return s;
}

/** 아이콘 모양만 바꾸기 */
export function setIcon(svg: SVGSVGElement, id: string): void {
  const u = svg.querySelector('use');
  if (u && u.getAttribute('href') !== `#${id}`) u.setAttribute('href', `#${id}`);
}

/** 배터리 아이콘(외곽 + 잔량 막대). 막대 = 24 그리드 x 4.5, y 9.5, h 5, w 11.5×잔량 */
export function batteryIcon(): { svg: SVGSVGElement; bar: SVGRectElement } {
  const svg = icon('i-battery', 'sm', 'watch-sb__bat');
  const bar = document.createElementNS(SVG_NS, 'rect');
  bar.setAttribute('x', '4.5');
  bar.setAttribute('y', '9.5');
  bar.setAttribute('height', '5');
  bar.setAttribute('rx', '0.5');
  bar.setAttribute('fill', 'currentColor');
  bar.setAttribute('stroke', 'none');
  svg.appendChild(bar);
  return { svg, bar };
}

/** 절대 위치 지정(410×502 좌표) */
export function place<T extends HTMLElement>(e: T, x: number, y: number, w?: number, h?: number): T {
  e.style.left = `${x}px`;
  e.style.top = `${y}px`;
  if (w !== undefined) e.style.width = `${w}px`;
  if (h !== undefined) e.style.height = `${h}px`;
  return e;
}

/** CSS 애니메이션 다시 시작(같은 클래스를 연달아 줄 때) */
export function pulse(e: Element, cls: string): void {
  e.classList.remove(cls);
  void e.getBoundingClientRect();
  e.classList.add(cls);
}

/** 글자 바꾸기(같으면 DOM 을 건드리지 않음 — 다시 그리기 최소화) */
export function setText(e: Element, text: string): void {
  if (e.textContent !== text) {
    checkGlyphs(text);
    e.textContent = text;
  }
}

/**
 * 계단식 애니메이션(README 0.3): [지연 ms, 할 일] 목록을 setTimeout 으로 차례로 실행한다.
 * CSS transition·animation 대신 값(색·위치)을 단계마다 바꾼다. run 을 다시 부르면 남은 단계는 취소된다.
 */
export class Steps {
  private ids: ReturnType<typeof setTimeout>[] = [];

  run(steps: readonly (readonly [number, () => void])[]): void {
    this.cancel();
    for (const [ms, fn] of steps) {
      if (ms <= 0) fn();
      else this.ids.push(setTimeout(fn, ms));
    }
  }

  cancel(): void {
    for (const id of this.ids) clearTimeout(id);
    this.ids = [];
  }
}

/** 길게 누름 진행 막대: 150ms 부터 600ms 까지 5단계로 폭을 늘린다(README 3.2·3.3). 0 = 지움 */
export function holdBarSteps(bar: HTMLElement, maxW: number, holdMs: number, steps: Steps): void {
  bar.style.width = '0px';
  const start = 150;
  const seq: [number, () => void][] = [];
  for (let k = 1; k <= 5; k++) {
    const at = Math.round(start + ((holdMs - start) * (k - 1)) / 4);
    seq.push([at, () => (bar.style.width = `${Math.round((maxW * k) / 5)}px`)]);
  }
  steps.run(seq);
}

/** 경과 시간 mm:ss. 60분 넘어도 시로 넘기지 않고 99:59 에서 멈춤(design/watch-presentation 2.3) */
export function fmtElapsed(ms: number): string {
  const total = Math.min(Math.floor(Math.max(0, ms) / 1000), 99 * 60 + 59);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 24시간제 HH:MM */
export function fmtClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** UTF-8 바이트 수(BLE 장치 이름 상한 검사) */
export function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** 길이 제한 말줄임 */
export function ellipsis(s: string, max: number): string {
  const chars = [...s];
  return chars.length > max ? chars.slice(0, max).join('') + '…' : s;
}

/**
 * 조사 '(으)로' 중 '로'를 쓰는가(true = 로, false = 으로). 문구는 toast.appChangedRo / toast.appChangedEuro. 한글은 받침으로, 영문은 끝 글자 발음을 대략 추정.
 * 예) Zoom → Zoom으로, Teams → Teams로, Meet → Meet으로
 */
export function takesRo(word: string): boolean {
  const last = word.trim().slice(-1);
  if (!last) return true;
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    return jong === 0 || jong === 8; // 받침 없음 또는 ㄹ → 로
  }
  if (/[0-9]/.test(last)) return !/[036]/.test(last);
  return !/[bcdgkmnpt]/i.test(last);
}
