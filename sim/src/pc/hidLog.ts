/**
 * HID 로그 패널 — 담당: pc 모듈 개발자(로그 포함).
 * 명세: design/simulator-layout.md 6장 (필터 칩, 100ms 마우스 묶음, 버림 표시, JSON 내보내기).
 *
 * 계약
 *  - export function mountHidLog(root: HTMLElement, app: App): void
 *  - HID 행: app.hid.subscribe(rec => ..., { includeDropped: true }). rec.dropped 면 '버림' 표시.
 *  - SYS 행: app.subscribe(change => change.result?.events) — CoreEvent('mode','lock','connection','flickRejected','ignored' …).
 *  - 표기: core/keymap.ts formatChord / chordToReport (logModel.ts 가 감싼다).
 *
 * 행 만들기·마우스 묶기·내보내기 형식은 logModel.ts(순수 로직)에 있고, 이 파일은 DOM 만 다룬다.
 * 일시정지는 표시만 멈춘다(기록은 계속). 다시 보기를 누르면 그동안 쌓인 기록을 한 번에 그린다.
 */
import type { App } from '../app';
import { LogModel, formatTime, type LogChange, type LogContext, type LogEntry, type LogKind } from './logModel';
import './hidLog.css';

const KIND_BADGE: Record<LogKind, string> = { key: 'KEY', mouse: 'MOUSE', media: 'MEDIA', sys: 'SYS' };
const FILTERS: { id: 'all' | LogKind; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'key', label: '키' },
  { id: 'mouse', label: '마우스' },
  { id: 'media', label: '미디어' },
  { id: 'sys', label: '시스템' },
];
/** 맨 아래에서 이 거리(px) 안이면 '맨 아래에 있다'고 본다 */
const BOTTOM_SLACK = 12;

export function mountHidLog(root: HTMLElement, app: App): void {
  root.classList.add('log-root');
  root.innerHTML = `
    <section class="log-panel" aria-label="HID 로그">
      <header class="log-panel__head">
        <h2 class="log-panel__title">HID 로그</h2>
        <span class="log-count">0건</span>
        <span class="log-spacer"></span>
        <button type="button" class="log-btn log-pause" aria-pressed="false">일시정지</button>
        <button type="button" class="log-btn log-clear">지우기</button>
        <button type="button" class="log-btn log-export" title="원본 기록을 JSON 파일로 저장">JSON</button>
      </header>
      <div class="log-filters" role="group" aria-label="종류 필터">
        ${FILTERS.map((f) => `<button type="button" class="log-chip" data-f="${f.id}" aria-pressed="${f.id === 'all'}">${f.id === 'all' ? '' : '<i aria-hidden="true"></i>'}${f.label}</button>`).join('')}
      </div>
      <div class="log-cols" aria-hidden="true"><span>시간</span><span>종류</span><span>내용</span><span>출처</span></div>
      <div class="log-body">
        <ol class="log-list" role="log" aria-live="polite" aria-label="HID 기록" data-filter="all"></ol>
        <button type="button" class="log-more" hidden>새 기록 0건 ↓</button>
      </div>
      <footer class="log-foot"><span>마우스 이동은 100ms씩 묶음</span><span class="log-auto" data-on="true">자동 스크롤 <b aria-hidden="true">●</b></span></footer>
    </section>`;

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => {
    const el = root.querySelector<T>(sel);
    if (!el) throw new Error(`[hidLog] ${sel} 없음`);
    return el;
  };
  const list = $<HTMLOListElement>('.log-list');
  const count = $('.log-count');
  const pauseBtn = $<HTMLButtonElement>('.log-pause');
  const clearBtn = $<HTMLButtonElement>('.log-clear');
  const exportBtn = $<HTMLButtonElement>('.log-export');
  const more = $<HTMLButtonElement>('.log-more');
  const auto = $('.log-auto');
  const chips = [...root.querySelectorAll<HTMLButtonElement>('.log-chip')];

  const model = new LogModel();
  const rows = new Map<number, HTMLLIElement>();
  let paused = false;
  let unseen = 0;

  const ctx = (): LogContext => {
    const s = app.state;
    return { keymap: app.keymap as LogContext['keymap'], gesture: app.gesture as LogContext['gesture'], os: s.os, mode: s.mode, apps: s.apps };
  };

  // ---------------------------------------------------------------- 행 그리기
  function fillRow(li: HTMLLIElement, e: LogEntry): void {
    li.dataset.t = e.kind;
    li.dataset.dropped = String(e.dropped);
    const full = `${e.main}${e.sub ? ` ${e.sub}` : ''}${e.dropped ? ' (버림)' : ''}`;
    li.title = `${formatTime(e.at)} ${KIND_BADGE[e.kind]} ${full} · ${e.source}`;
    li.innerHTML = '';
    const tm = el('span', 'log-row__tm', formatTime(e.at));
    const ty = el('span', 'log-row__ty', KIND_BADGE[e.kind]);
    const ct = el('span', 'log-row__ct');
    const main = el('span', 'log-row__main', e.main);
    ct.append(main);
    if (e.sub) ct.append(' ', el('em', 'log-row__sub', e.sub));
    if (e.dropped) ct.append(el('b', 'log-row__drop', '버림'));
    const src = el('span', 'log-row__src', e.source);
    li.append(tm, ty, ct, src);
  }

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
    const n = document.createElement(tag);
    n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function atBottom(): boolean {
    return list.scrollHeight - list.scrollTop - list.clientHeight <= BOTTOM_SLACK;
  }

  function scrollToEnd(): void {
    list.scrollTop = list.scrollHeight;
    unseen = 0;
    more.hidden = true;
  }

  function updateCount(): void {
    count.textContent = `${model.entries.length}건`;
  }

  function apply(changes: LogChange[]): void {
    updateCount();
    if (paused) return;
    const follow = atBottom();
    let added = 0;
    for (const c of changes) {
      if (c.type === 'add') {
        const li = el('li', 'log-row is-new');
        fillRow(li, c.entry);
        li.addEventListener('animationend', () => li.classList.remove('is-new'), { once: true });
        list.append(li);
        rows.set(c.entry.id, li);
        added++;
      } else if (c.type === 'update') {
        const li = rows.get(c.entry.id);
        if (li) fillRow(li, c.entry);
      } else if (c.type === 'remove') {
        for (const id of c.ids) {
          rows.get(id)?.remove();
          rows.delete(id);
        }
      } else if (c.type === 'clear') {
        list.textContent = '';
        rows.clear();
      }
    }
    if (follow) scrollToEnd();
    else if (added > 0) {
      unseen += added;
      more.textContent = `새 기록 ${unseen}건 ↓`;
      more.hidden = false;
    }
  }

  /** 전체 다시 그리기(일시정지 해제 때) */
  function renderAll(): void {
    list.textContent = '';
    rows.clear();
    const frag = document.createDocumentFragment();
    for (const e of model.entries) {
      const li = el('li', 'log-row');
      fillRow(li, e);
      frag.append(li);
      rows.set(e.id, li);
    }
    list.append(frag);
    updateCount();
    scrollToEnd();
  }

  // ---------------------------------------------------------------- 구독
  app.hid.subscribe((rec) => apply(model.addHid(rec, ctx())), { includeDropped: true });

  app.subscribe((change) => {
    if (change.reason === 'config') {
      apply(model.addNote(app.now(), '설정 반영 (keymap·gesture)'));
      return;
    }
    if (change.reason === 'prefs') {
      apply(model.addNote(app.now(), `장치 이름 → ${app.deviceName}`));
      return;
    }
    const events = change.result?.events;
    if (!events || events.length === 0) return;
    const at = change.input?.t === 'imu' ? change.input.sample.t : app.now();
    const c = ctx();
    const changes: LogChange[] = [];
    for (const e of events) changes.push(...model.addSys(at, e, c, change.input));
    if (changes.length) apply(changes);
  });

  // ---------------------------------------------------------------- 조작
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.setAttribute('aria-pressed', String(paused));
    pauseBtn.textContent = paused ? '다시 보기' : '일시정지';
    root.querySelector('.log-panel')?.setAttribute('data-paused', String(paused));
    if (!paused) renderAll();
  });

  clearBtn.addEventListener('click', () => {
    apply(model.clear());
    updateCount();
    unseen = 0;
    more.hidden = true;
  });

  exportBtn.addEventListener('click', () => {
    const now = new Date();
    const data = model.toExport({ os: app.state.os, mode: app.state.mode, deviceName: app.deviceName, exportedAt: now.toISOString() });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const pad = (n: number) => String(n).padStart(2, '0');
    const a = document.createElement('a');
    a.href = url;
    a.download = `hid-log-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  for (const chip of chips) {
    chip.addEventListener('click', () => {
      for (const c of chips) c.setAttribute('aria-pressed', String(c === chip));
      list.dataset.filter = chip.dataset.f ?? 'all';
      scrollToEnd();
    });
  }

  more.addEventListener('click', scrollToEnd);
  list.addEventListener('scroll', () => {
    const bottom = atBottom();
    auto.dataset.on = String(bottom);
    if (bottom) {
      unseen = 0;
      more.hidden = true;
    }
  });

  // 시작 기록
  apply(model.addNote(app.now(), app.state.connected ? `BLE 연결됨 · ${app.deviceName}` : 'BLE 연결 끊김', '시스템'));
}
