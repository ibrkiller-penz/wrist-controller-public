/**
 * 가짜 슬라이드 10장 — "손목 컨트롤러 소개" 발표 (design/simulator-layout.md 5.3).
 * 장마다 형태가 달라 넘길 때 눈으로 바로 구분된다.
 * 키 표기가 들어가는 장(5·7·8)은 keymap 에서 읽어 만든다(키를 코드에 쓰지 않음 — 설정을 바꾸면 슬라이드도 바뀐다).
 */
import { formatBinding, formatChord, listActions, resolveChord } from '../core/keymap';
import type { AppId, Keymap, OsId } from '../core/types';

export type SlideKind = 'title' | 'bullets' | 'split' | 'tiles' | 'flow' | 'end';

export interface Slide {
  kind: SlideKind;
  kicker: string;
  title: string;
  text?: string;
  items?: string[];
  big?: string;
  bigSub?: string;
  tiles?: [string, string][];
  flow?: string[];
}

/** 현재 keymap·OS 로 슬라이드 10장을 만든다 */
export function buildSlides(keymap: Keymap, os: OsId, presentApp: AppId): Slide[] {
  const key = (action: 'next' | 'prev' | 'blackout') => formatChord(resolveChord(keymap, 'present', presentApp, action, os), os) || '—';
  const launchApp = keymap.modes.launch?.defaultApp ?? 'launcher';
  const launchTiles = listActions(keymap, 'launch', launchApp)
    .slice(0, 6)
    .map((a) => [a.label, formatBinding(a[os], os) || '없음'] as [string, string]);
  const meetingApps = keymap.modes.meeting ? keymap.modes.meeting.appOrder.map((id) => keymap.modes.meeting.apps[id]?.name ?? id) : [];

  return [
    { kind: 'title', kicker: '데모 발표 · 2026', title: '손목 컨트롤러', text: '시계 하나로 발표·앱 실행·회의를 조작합니다' },
    {
      kind: 'bullets',
      kicker: '문제',
      title: '발표 중 노트북으로 돌아가는 순간들',
      items: ['슬라이드 넘기려고 연단으로 걸어감', '리모컨·레이저 포인터를 따로 챙김', '회의 중 음소거 버튼을 찾느라 허둥댐'],
    },
    {
      kind: 'split',
      kicker: '해결',
      title: '손목 위의 키보드·마우스',
      items: ['블루투스 HID — PC에 설치할 것 없음', '키보드 + 마우스 + 미디어키 복합 장치', 'Windows 우선, macOS 지원'],
      big: '0',
      bigSub: '설치할 프로그램',
    },
    {
      kind: 'bullets',
      kicker: '하드웨어',
      title: 'ESP32-C6 2.06" AMOLED 시계',
      items: ['410×502 AMOLED · 정전식 터치', '6축 IMU · 마이크 · 측면 버튼 2개', '검정 배경 = 픽셀 꺼짐 = 배터리 절약'],
    },
    {
      kind: 'split',
      kicker: '발표 모드',
      title: '보지 않고 넘긴다',
      items: ['오른쪽 탭·버튼 → 다음', '왼쪽 탭 → 이전', '중앙 길게 → 화면 암전', '손목 튕김 → 넘기기'],
      big: `${key('next')} ${key('prev')} ${key('blackout')}`,
      bigSub: '보내는 키',
    },
    {
      kind: 'bullets',
      kicker: '에어마우스',
      title: '버튼 누른 채 손목으로 포인터',
      items: ['자이로 각속도 → 커서 이동', '데드존 + 저역 필터로 손떨림 제거', '버튼을 놓으면 즉시 정지, 흐르지 않음'],
    },
    { kind: 'tiles', kicker: '실행 모드', title: `앱 실행 타일 ${launchTiles.length}개 (2쪽 = 업무 단축)`, tiles: launchTiles },
    {
      kind: 'split',
      kicker: '회의 모드',
      title: '음소거를 손목에서',
      items: [`${meetingApps.join(' · ')} 선택`, '마이크 타일을 가장 크게', '카메라 · 손 들기'],
      big: String(meetingApps.length),
      bigSub: '지원 회의 앱',
    },
    { kind: 'flow', kicker: '만드는 순서', title: '시뮬레이션부터 시작한다', flow: ['시뮬레이션', '검증', '빌드', '배포'] },
    { kind: 'end', kicker: 'Q&A', title: '감사합니다', text: '"Hi ESP" 라고 말해 보세요' },
  ];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** 슬라이드 한 장의 HTML (16:9 상자, 내부 글자는 슬라이드 폭 기준 cqw) */
export function slideHTML(s: Slide, i: number, total: number): string {
  const list = (items: string[] = []) => `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  let body = '';
  if (s.kind === 'bullets') body = list(s.items);
  if (s.kind === 'split')
    body = `<div class="pc-s-split">${list(s.items)}<div class="pc-s-big">${esc(s.big ?? '')}<small>${esc(s.bigSub ?? '')}</small></div></div>`;
  if (s.kind === 'tiles')
    body = `<div class="pc-s-tiles">${(s.tiles ?? []).map(([a, b]) => `<div>${esc(a)}<small>${esc(b)}</small></div>`).join('')}</div>`;
  if (s.kind === 'flow') body = `<div class="pc-s-flow">${(s.flow ?? []).map((t) => `<div>${esc(t)}</div>`).join('<span>→</span>')}</div>`;
  if (s.text) body += `<p>${esc(s.text)}</p>`;
  return `<div class="pc-slide pc-slide--${s.kind}"><span class="pc-s-bar"></span><div class="pc-s-in"><span class="pc-s-kicker">${esc(s.kicker)}</span><h3>${esc(s.title)}</h3>${body}</div><span class="pc-s-no">${i + 1} / ${total}</span></div>`;
}
