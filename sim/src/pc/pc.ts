/**
 * 가상 PC 화면 — 담당: pc 모듈 개발자 (src/pc/pc.ts, pc.css 및 src/pc/ 아래 새 파일).
 * 명세: design/simulator-layout.md 5장 (슬라이드 10장, 가짜 VS Code, 회의 창, 가상 커서).
 *
 * 계약
 *  - export function mountPC(root: HTMLElement, app: App): void
 *  - 키·마우스 입력은 app.hid.subscribe(rec => ...) 로만 받는다(버림 제외 기본 구독 = 실제로 PC 에 도착한 것).
 *  - 실행 모드: 가짜 바탕화면 + 작업표시줄에 앱 창이 열리고(1쪽 = Ctrl+Alt+1~6 시작 메뉴 바로 가기 키), 매크로(Win+R …)는 HidRecord.action 으로 해석한다.
 *    시계 모드: 키를 보내지 않으므로 PC 화면은 그대로(머리줄에 '시계 모드 — 키 안 보냄').
 *  - 받은 키는 pcLogic.matchAction 으로 "지금 떠 있는 앱"(app.state.mode + apps[mode])의 keymap 조합과 비교해 해석한다.
 *    키 값을 코드에 쓰지 않으므로 설정 화면에서 keymap 을 바꾸면 PC 반응도 바뀐다.
 *  - 연결 상태 표시는 app.state.connected (app.subscribe 로 갱신). 알약을 누르면 app.toggleConnected().
 *
 * PC 쪽 상태(현재 슬라이드, 저장 여부, 마이크 켜짐 …)는 시계 상태와 따로 둔다 — 실제 PC 처럼 받은 키로만 바뀐다.
 */
import type { App } from '../app';
import type { HidRecord } from '../core/hidBus';
import { formatBinding, formatChord, formatSteps, listActions } from '../core/keymap';
import type { ActionId, Chord, HidEvent, MeetingAppId, ModeId } from '../core/types';
import type { HidRecord as Rec } from '../core/hidBus';
import { describeHid, type LogContext } from './logModel';
import {
  PC_H,
  PC_W,
  appName,
  TASKBAR_APPS,
  deckReact,
  desktopReact,
  initDeck,
  initDesktop,
  initMeeting,
  matchAction,
  meetingReact,
  moveCursor,
  otherAppsUsing,
  type Cursor,
  type DesktopState,
  type MeetingWindowState,
  type SlideDeckState,
  type SlideView,
} from './pcLogic';
import { buildSlides, slideHTML, type Slide } from './slides';
import './pc.css';

const VIEW_LABEL: Record<SlideView, string> = { edit: '편집 보기', show: '쇼 진행 중', black: '쇼 · 화면 암전' };
const TOAST_MS = 1600;
const KEYCAP_FLASH_MS = 1200;
const MEET_FLASH_MS = 400;
/** 쇼 화면에서 커서가 움직이지 않으면 숨기는 시간(실제 발표 프로그램처럼) */
const SHOW_CURSOR_HIDE_MS = 3000;

const PEOPLE = [
  { me: true, avatar: '나', name: '나 (손목 컨트롤러)', speaking: false, muted: false },
  { me: false, avatar: '지원', name: '김지원', speaking: true, muted: false },
  { me: false, avatar: '서준', name: '박서준', speaking: false, muted: true },
  { me: false, avatar: '하늘', name: '이하늘', speaking: false, muted: false },
];

const icon = (id: string, cls = 'pc-ic') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const reduceMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function mountPC(root: HTMLElement, app: App): void {
  root.classList.add('pc-root');
  root.innerHTML = `
    <section class="pc-panel" aria-label="가상 PC 화면" data-conn="on">
      <header class="pc-head">
        <h2 class="pc-head__title">가상 PC</h2>
        <span class="pc-head__app"></span>
        <span class="pc-spacer"></span>
        <button type="button" class="pc-conn" title="눌러서 BLE 끊김·연결 흉내"><i aria-hidden="true"></i><span></span></button>
      </header>
      <div class="pc-screen" data-app="present">
        <div class="pc-app pc-ppt" data-view="edit">
          <div class="pc-ppt__ribbon"><span>파일</span><span>홈</span><span>삽입</span><span>디자인</span><b>슬라이드 쇼</b></div>
          <div class="pc-ppt__main">
            <div class="pc-ppt__rail"></div>
            <div class="pc-ppt__stage"></div>
          </div>
          <div class="pc-ppt__status"><span class="pc-ppt__no"></span><span>한국어</span><span class="pc-spacer"></span><span class="pc-ppt__hint"></span></div>
          <div class="pc-ppt__show" data-pc-hit="show"></div>
        </div>
        <div class="pc-app pc-desk" data-locked="false" data-display="false">
          <div class="pc-desk__wall"><span class="pc-desk__hint">실행 모드 — Ctrl+Alt+1~6 바로 가기 키(Claude·카카오톡·크롬·파워포인트·엑셀·한글)를 설치 페이지 스크립트로 만들었다고 가정</span></div>
          <div class="pc-desk__wins"></div>
          <div class="pc-desk__display" role="dialog" aria-label="화면 출력 메뉴"><b>투사</b><span>PC 화면만</span><span class="is-sel">복제</span><span>확장</span><span>두 번째 화면만</span></div>
          <div class="pc-desk__lock">${'잠김'} — 실제 PC 라면 암호를 넣어 풉니다 (다시 열려면 아무 키)</div>
          <div class="pc-desk__bar"><span class="pc-desk__start">⊞</span><span class="pc-desk__apps"></span><span class="pc-spacer"></span><span class="pc-desk__vol"></span><span class="pc-desk__msg"></span></div>
        </div>
        <div class="pc-app pc-meet" data-cam="false" data-hand="false" data-mic="true">
          <div class="pc-meet__top"><b class="pc-meet__app"></b><span class="pc-meet__clock"></span><span class="pc-spacer"></span><span>참가자 ${PEOPLE.length}</span></div>
          <div class="pc-meet__grid">
            ${PEOPLE.map(
              (p) => `<div class="pc-person${p.me ? ' pc-person--me' : ''}${p.speaking ? ' is-speaking' : ''}">
                <span class="pc-person__avatar">${p.avatar}</span>
                ${p.me ? '<span class="pc-person__hand">✋ 손 듦</span>' : ''}
                <span class="pc-person__nm">${p.me ? icon('i-mic-off', 'pc-ic pc-person__mute') : p.muted ? icon('i-mic-off', 'pc-ic') : ''}${p.name}</span>
              </div>`,
            ).join('')}
          </div>
          <div class="pc-meet__bar"></div>
        </div>
        <svg class="pc-cursor" viewBox="0 0 20 20" aria-hidden="true"><path d="M2 1.5v15l4.2-4 2.7 6.2 2.6-1.1-2.7-6.1h5.9z"/></svg>
        <div class="pc-toast" role="status" aria-live="polite"></div>
        <div class="pc-dc" role="status">BLE 연결 끊김 — 시계 입력이 PC에 도착하지 않습니다 (로그에 "버림"으로 표시)</div>
      </div>
      <footer class="pc-foot">
        <span>마지막 입력</span><span class="pc-kbd">—</span>
        <span class="pc-mono pc-foot__pos"></span>
        <span class="pc-spacer"></span>
        <span class="pc-foot__os"></span>
      </footer>
    </section>`;

  const $ = <T extends Element = HTMLElement>(sel: string) => {
    const el = root.querySelector<T>(sel);
    if (!el) throw new Error(`[pc] ${sel} 없음`);
    return el;
  };
  const panel = $('.pc-panel');
  const screen = $('.pc-screen');
  const headApp = $('.pc-head__app');
  const conn = $<HTMLButtonElement>('.pc-conn');
  const connText = $('.pc-conn span');
  const ppt = $('.pc-ppt');
  const rail = $('.pc-ppt__rail');
  const stage = $('.pc-ppt__stage');
  const show = $('.pc-ppt__show');
  const slideNo = $('.pc-ppt__no');
  const pptHint = $('.pc-ppt__hint');
  const desk = $('.pc-desk');
  const deskWins = $('.pc-desk__wins');
  const deskApps = $('.pc-desk__apps');
  const deskMsg = $('.pc-desk__msg');
  const deskVol = $('.pc-desk__vol');
  const meet = $('.pc-meet');
  const meetApp = $('.pc-meet__app');
  const meetClock = $('.pc-meet__clock');
  const meetBar = $('.pc-meet__bar');
  const cursorEl = $<SVGSVGElement>('.pc-cursor');
  const toast = $('.pc-toast');
  const kbd = $('.pc-kbd');
  const footPos = $('.pc-foot__pos');
  const footOs = $('.pc-foot__os');

  // ---------------------------------------------------------------- PC 쪽 상태
  let deck: SlideDeckState = initDeck(10);
  let slides: Slide[] = [];
  let desktop: DesktopState = initDesktop();
  const meetings: Record<MeetingAppId, MeetingWindowState> = initMeeting();
  let cursor: Cursor = { x: PC_W / 2, y: PC_H / 2 };
  let lastMoveAt = 0;
  const meetStartedAt = performance.now() - (18 * 60 + 42) * 1000; // "주간 회의 · 00:18:42" 부터 흐르게

  const s = () => app.state;
  const currentApp = () => s().apps[s().mode];
  const ctx = (): LogContext => ({ keymap: app.keymap as LogContext['keymap'], gesture: app.gesture as LogContext['gesture'], os: s().os, mode: s().mode, apps: s().apps });

  // ---------------------------------------------------------------- 그리기
  function renderSlides(): void {
    const n = slides.length;
    rail.innerHTML = slides
      .map((sl, i) => `<div class="pc-ppt__thumb${i === deck.index ? ' is-cur' : ''}" data-pc-hit="thumb" data-i="${i}"><span>${i + 1}</span>${slideHTML(sl, i, n)}</div>`)
      .join('');
    renderDeck(true);
  }

  function renderDeck(force = false): void {
    const n = slides.length;
    const cur = slides[deck.index];
    if (!cur) return;
    const html = slideHTML(cur, deck.index, n);
    if (force || stage.dataset.i !== String(deck.index)) {
      stage.innerHTML = html;
      show.innerHTML = html;
      stage.dataset.i = String(deck.index);
      rail.querySelectorAll<HTMLElement>('.pc-ppt__thumb').forEach((t) => t.classList.toggle('is-cur', Number(t.dataset.i) === deck.index));
      const curThumb = rail.querySelector<HTMLElement>('.pc-ppt__thumb.is-cur');
      if (curThumb) rail.scrollTop = curThumb.offsetTop - rail.clientHeight / 2 + curThumb.clientHeight / 2;
    }
    ppt.dataset.view = deck.view;
    slideNo.textContent = `슬라이드 ${deck.index + 1} / ${n}`;
    const start = listActions(app.keymap, 'present', s().apps.present).find((a) => a.id === 'showStart');
    const startKey = start ? formatBinding(start[s().os], s().os) : '';
    pptHint.textContent = startKey ? `${startKey} = 쇼 시작` : '';
    updateCursorVisibility();
  }

  /** 실행 모드 바탕화면: 작업표시줄 6칸(열림·맨 앞 표시) + 열린 창 */
  function renderDesktop(): void {
    const acts = listActions(app.keymap, 'launch', s().apps.launch);
    const label = (id: string) => acts.find((a) => a.id === id)?.label ?? id;
    deskApps.innerHTML = TASKBAR_APPS.map(
      (id, i) =>
        `<span class="pc-desk__app${desktop.open.includes(id) ? ' is-open' : ''}${desktop.front === id ? ' is-front' : ''}" title="Win+${i + 1}"><b>${i + 1}</b>${esc(label(id))}</span>`,
    ).join('');
    deskWins.innerHTML = desktop.open
      .map((id, i) => {
        const front = desktop.front === id;
        const body = id === 'chrome' && desktop.url ? `주소: ${esc(desktop.url)}` : `${esc(label(id))} 창`;
        return `<div class="pc-desk__win${front ? ' is-front' : ''}" style="--i:${i}"><div class="pc-desk__wt">${esc(label(id))}</div><div class="pc-desk__wb">${body}</div></div>`;
      })
      .join('');
    desk.dataset.locked = String(desktop.locked);
    desk.dataset.display = String(desktop.displayMenu);
    deskVol.textContent = desktop.muted ? '🔇 음소거' : '🔊';
    deskMsg.textContent = desktop.status;
  }

  function renderMeeting(flash?: ActionId): void {
    const mApp = s().apps.meeting;
    const m = meetings[mApp];
    meetApp.textContent = appName(app.keymap, 'meeting', mApp);
    meet.dataset.mic = String(m.mic);
    meet.dataset.cam = String(m.camera);
    meet.dataset.hand = String(m.hand);
    const acts = listActions(app.keymap, 'meeting', mApp);
    const iconFor = (id: ActionId) => (id === 'mic' ? (m.mic ? 'i-mic' : 'i-mic-off') : id === 'camera' ? (m.camera ? 'i-camera' : 'i-camera-off') : 'i-hand');
    const onFor = (id: ActionId) => (id === 'mic' ? m.mic : id === 'camera' ? m.camera : id === 'hand' ? m.hand : false);
    meetBar.innerHTML = acts
      .map((a) => {
        const on = onFor(a.id);
        const cls = a.id === 'hand' ? (on ? 'is-on' : '') : on ? 'is-on' : 'is-off';
        const key = formatBinding(a[s().os], s().os);
        return `<div class="pc-mbtn ${cls}${flash === a.id && !reduceMotion() ? ' is-flash' : ''}" data-pc-hit="${a.id}">
          <span class="pc-mbtn__ic">${icon(iconFor(a.id))}</span><span>${esc(a.label)}</span><small>${esc(key || '없음')}</small></div>`;
      })
      .join('');
    if (flash) setTimeout(() => meetBar.querySelectorAll('.is-flash').forEach((el) => el.classList.remove('is-flash')), MEET_FLASH_MS);
  }

  function renderHead(): void {
    const mode = s().mode;
    screen.dataset.app = mode;
    const name = appName(app.keymap, mode, currentApp());
    let sub = '';
    if (mode === 'present') sub = VIEW_LABEL[deck.view];
    else if (mode === 'clock') sub = '시계 모드 — 키 안 보냄';
    else if (mode === 'launch') {
      const front = desktop.front ? listActions(app.keymap, 'launch', s().apps.launch).find((a) => a.id === desktop.front)?.label ?? desktop.front : null;
      sub = desktop.locked ? '화면 잠김' : front ? `맨 앞 창: ${front}` : '바탕화면';
    }
    else {
      const m = meetings[s().apps.meeting];
      sub = `마이크 ${m.mic ? '켜짐' : '꺼짐'} · 카메라 ${m.camera ? '켜짐' : '꺼짐'}${m.hand ? ' · 손 듦' : ''}`;
    }
    headApp.textContent = `${name} · ${sub}`;
    const on = s().connected;
    panel.dataset.conn = on ? 'on' : 'off';
    conn.dataset.conn = on ? 'on' : 'off';
    conn.setAttribute('aria-pressed', String(on));
    connText.textContent = on ? `연결됨 · ${app.deviceName}` : '연결 끊김';
    footOs.textContent = `${s().os === 'mac' ? 'macOS' : 'Windows'} · ${PC_W}×${PC_H}`;
  }

  function renderAll(): void {
    renderHead();
    renderDeck(true);
    renderDesktop();
    renderMeeting();
  }

  // ---------------------------------------------------------------- 커서
  let cursorRaf = 0;
  function drawCursor(): void {
    cursorRaf = 0;
    cursorEl.style.left = `${(cursor.x / PC_W) * 100}%`;
    cursorEl.style.top = `${(cursor.y / PC_H) * 100}%`;
    footPos.textContent = `커서 ${Math.round(cursor.x)}, ${Math.round(cursor.y)}`;
    updateCursorVisibility();
  }
  function scheduleCursor(): void {
    if (!cursorRaf) cursorRaf = requestAnimationFrame(drawCursor);
  }
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  function updateCursorVisibility(): void {
    const inShow = s().mode === 'present' && deck.view !== 'edit';
    const recent = performance.now() - lastMoveAt < SHOW_CURSOR_HIDE_MS;
    cursorEl.classList.toggle('is-hidden', inShow && !recent);
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = inShow && recent ? setTimeout(updateCursorVisibility, SHOW_CURSOR_HIDE_MS) : null;
  }

  function ripple(): void {
    if (reduceMotion()) return;
    const r = document.createElement('span');
    r.className = 'pc-ripple';
    r.style.left = `${(cursor.x / PC_W) * 100}%`;
    r.style.top = `${(cursor.y / PC_H) * 100}%`;
    screen.append(r);
    r.addEventListener('animationend', () => r.remove());
    setTimeout(() => r.remove(), 600);
  }

  /** 가상 커서 위치에 있는 클릭 대상(data-pc-hit). 보이는 요소만, 화면 밖으로 스크롤돼도 동작하도록 사각형으로 판정 */
  function hitAtCursor(): HTMLElement | null {
    const sr = screen.getBoundingClientRect();
    if (sr.width === 0) return null;
    const px = sr.left + (cursor.x / PC_W) * sr.width;
    const py = sr.top + (cursor.y / PC_H) * sr.height;
    const cands = [...screen.querySelectorAll<HTMLElement>('.pc-app[data-hit-root] [data-pc-hit]')];
    // 나중에 그려진 것(위에 겹친 것)을 먼저 본다
    for (const el of cands.reverse()) {
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) return el;
    }
    return null;
  }

  function onClick(): void {
    const el = hitAtCursor();
    if (!el) return;
    const hit = el.dataset.pcHit;
    const mode = s().mode;
    if (mode === 'present') {
      if (hit === 'thumb' && deck.view === 'edit') {
        deck = { ...deck, index: Number(el.dataset.i) || 0 };
        renderDeck();
      } else if (hit === 'show' && deck.view !== 'edit') {
        applyPresent('next');
      }
    } else if (mode === 'meeting' && (hit === 'mic' || hit === 'camera' || hit === 'hand')) {
      applyMeeting(hit);
    }
  }

  // ---------------------------------------------------------------- 알림
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  function note(text: string): void {
    toast.textContent = text;
    toast.classList.add('is-shown');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-shown'), TOAST_MS);
  }

  let kbdTimer: ReturnType<typeof setTimeout> | null = null;
  function lastInput(text: string): void {
    kbd.textContent = text;
    kbd.classList.add('is-new');
    kbd.dataset.mode = s().mode;
    if (kbdTimer) clearTimeout(kbdTimer);
    kbdTimer = setTimeout(() => kbd.classList.remove('is-new'), KEYCAP_FLASH_MS);
  }

  // ---------------------------------------------------------------- 키 반응
  function applyPresent(action: ActionId): void {
    const r = deckReact(deck, action);
    deck = r.state;
    if (r.note) note(r.note);
    renderDeck();
    renderHead();
  }
  function applyLaunch(action: ActionId, via: 'key' | 'macro' = 'key', url = ''): void {
    const acts = listActions(app.keymap, 'launch', s().apps.launch);
    const label = acts.find((a) => a.id === action)?.label ?? action;
    if (desktop.locked) {
      // 잠긴 PC: 시계 키로는 풀 수 없다(실제 PC 는 암호) — 시뮬레이션에서는 다음 키로 풀어 준다
      desktop = { ...desktop, locked: false, status: '잠금 풀림(시뮬레이션)' };
    } else {
      const r = desktopReact(desktop, action, via, label, url);
      desktop = r.state;
      if (r.note) note(r.note);
    }
    renderDesktop();
    renderHead();
  }
  function applyClock(): void {
    note('시계 모드 — 키 안 보냄');
  }
  function applyMeeting(action: ActionId): void {
    const mApp = s().apps.meeting;
    const r = meetingReact(meetings[mApp], action);
    meetings[mApp] = r.state;
    if (r.note) note(r.note);
    renderMeeting(action);
    renderHead();
  }

  function onKey(ev: Extract<HidEvent, { t: 'key' }>): void {
    const chord: Chord = { mods: ev.mods, key: ev.key };
    const { mode, os } = s();
    const cur = currentApp();
    lastInput(formatChord(chord, os));
    const action = matchAction(app.keymap, mode, cur, os, chord);
    if (!action) {
      const others = otherAppsUsing(app.keymap, mode, cur, os, chord).map((id) => appName(app.keymap, mode, id));
      note(others.length ? `이 앱에선 반응 없음 — ${formatChord(chord, os)}: ${others.join('·')} 단축키` : `이 앱에선 반응 없음 — ${formatChord(chord, os)}`);
      return;
    }
    const apply: Record<ModeId, (a: ActionId) => void> = { clock: applyClock, present: applyPresent, launch: (a) => applyLaunch(a, 'key'), meeting: applyMeeting };
    apply[mode](action);
  }

  /** 매크로: 키 표기를 보여 주고, 실행 모드 동작이면 바탕화면이 반응한다(실제 PC 의 Win+R 실행 창·Spotlight 흉내) */
  function onMacro(ev: Extract<HidEvent, { t: 'macro' }>, rec: Rec): void {
    const text = formatSteps(ev.steps, s().os);
    lastInput(text);
    const url = ev.steps.map((st) => ('text' in st ? st.text : '')).find((t) => /^https?:|\./.test(t)) ?? '';
    if (rec.action && s().mode === 'launch') applyLaunch(rec.action, 'macro', url);
    else note(`매크로 — ${text}`);
  }

  function onHid(rec: HidRecord): void {
    const ev = rec.ev;
    switch (ev.t) {
      case 'key':
        onKey(ev);
        break;
      case 'mouseMove':
        cursor = moveCursor(cursor, ev.dx, ev.dy);
        lastMoveAt = performance.now();
        scheduleCursor();
        break;
      case 'mouseButton':
        if (ev.down) {
          lastInput(describeHid(ev, null, ctx()).main.replace('버튼 누름', '클릭'));
          ripple();
          if (ev.button === 'left') onClick();
        }
        break;
      case 'consumer':
        lastInput(describeHid(ev, null, ctx()).main);
        note(`미디어 키 — ${describeHid(ev, null, ctx()).main}`);
        break;
      case 'macro':
        onMacro(ev, rec);
        break;
    }
  }

  // ---------------------------------------------------------------- 연결
  app.hid.subscribe(onHid);
  conn.addEventListener('click', () => app.toggleConnected());

  // 설정·모드·앱·OS·연결이 바뀔 때만 다시 그린다(IMU 샘플마다 오는 알림은 건너뜀)
  let lastSig = '';
  let lastSlidesSig = '';
  app.subscribe((change) => {
    const st = change.state;
    if (change.reason === 'config' || change.reason === 'prefs') lastSig = '';
    const sig = [st.mode, st.os, st.apps.present, st.apps.launch, st.apps.meeting, st.connected, app.deviceName].join('|');
    if (sig === lastSig) return;
    lastSig = sig;
    // 슬라이드 내용(5·7·8장 키 표기)은 OS·발표 앱·keymap 에 따라 달라진다
    const slidesSig = [st.os, st.apps.present].join('|');
    if (slidesSig !== lastSlidesSig || change.reason === 'config') {
      lastSlidesSig = slidesSig;
      slides = buildSlides(app.keymap, st.os, st.apps.present);
      deck = { ...deck, count: slides.length, index: Math.min(deck.index, slides.length - 1) };
      renderSlides();
    }
    renderAll();
  });

  // 회의 시계(회의 창이 보일 때만 갱신)
  const tickClock = () => {
    if (s().mode !== 'meeting') return;
    const t = Math.floor((performance.now() - meetStartedAt) / 1000);
    const hh = String(Math.floor(t / 3600)).padStart(2, '0');
    const mm = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
    const ss = String(t % 60).padStart(2, '0');
    meetClock.textContent = `주간 회의 · ${hh}:${mm}:${ss}`;
  };
  setInterval(tickClock, 1000);

  // 클릭 대상 판정 루트 표시(모든 앱 — 보이지 않는 앱은 offsetParent 가 null 이라 걸러진다)
  root.querySelectorAll('.pc-app').forEach((el) => el.setAttribute('data-hit-root', ''));

  // 첫 그리기
  slides = buildSlides(app.keymap, s().os, s().apps.present);
  lastSlidesSig = [s().os, s().apps.present].join('|');
  renderSlides();
  renderAll();
  drawCursor();
  tickClock();
  meetClock.textContent ||= '주간 회의 · 00:18:42';
}
