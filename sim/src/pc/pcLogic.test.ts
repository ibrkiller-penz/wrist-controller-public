/** 가상 PC 순수 로직 테스트 — 키 해석은 keymap 에서 읽은 조합으로만 한다(키 값을 테스트에도 하드코딩하지 않음). */
import { describe, expect, it } from 'vitest';
import { defaultKeymap } from '../core/config';
import { isMacro, resolveChord } from '../core/keymap';
import type { ActionId, AppId, Chord, ModeId, OsId } from '../core/types';
import {
  PC_H,
  PC_W,
  chordEquals,
  deckReact,
  desktopReact,
  initDeck,
  initDesktop,
  initMeeting,
  matchAction,
  meetingReact,
  moveCursor,
  otherAppsUsing,
} from './pcLogic';
import { buildSlides } from './slides';

const km = defaultKeymap();
const chord = (mode: ModeId, app: AppId, action: ActionId, os: OsId): Chord => {
  const c = resolveChord(km, mode, app, action, os);
  if (!c) throw new Error(`keymap 에 ${mode}/${app}/${action}/${os} 없음`);
  return c;
};

describe('키 해석', () => {
  it('수정자 순서가 달라도 같은 조합', () => {
    expect(chordEquals({ mods: ['ctrl', 'shift'], key: 'P' }, { mods: ['shift', 'ctrl'], key: 'P' })).toBe(true);
    expect(chordEquals({ mods: ['ctrl'], key: 'P' }, { mods: ['ctrl', 'shift'], key: 'P' })).toBe(false);
  });

  it('모든 모드·앱·OS 동작이 자기 키로 되찾아진다', () => {
    for (const mode of km.modeOrder)
      for (const app of Object.keys(km.modes[mode].apps) as AppId[])
        for (const a of km.modes[mode].apps[app].actions)
          for (const os of ['win', 'mac'] as OsId[]) {
            const c = a[os];
            if (!c || isMacro(c)) continue;
            expect(matchAction(km, mode, app, os, c), `${mode}/${app}/${a.id}/${os}`).toBe(a.id);
          }
  });

  it('회의: 다른 앱 단축키는 이 앱에서 반응 없음 + 어느 앱 키인지 알려 준다', () => {
    const teamsMic = chord('meeting', 'teams', 'mic', 'win');
    expect(matchAction(km, 'meeting', 'zoom', 'win', teamsMic)).toBeNull();
    expect(otherAppsUsing(km, 'meeting', 'zoom', 'win', teamsMic)).toContain('teams');
  });

  it('keymap 을 바꾸면 해석도 바뀐다(하드코딩 없음)', () => {
    const k2 = defaultKeymap();
    const next = k2.modes.present.apps.powerpoint.actions.find((a) => a.id === 'next')!;
    next.win = { mods: [], key: 'PAGEDOWN' };
    expect(matchAction(k2, 'present', 'powerpoint', 'win', { mods: [], key: 'PAGEDOWN' })).toBe('next');
  });
});

describe('커서', () => {
  it('화면 경계에서 멈춘다', () => {
    expect(moveCursor({ x: 10, y: 10 }, -500, -500)).toEqual({ x: 0, y: 0 });
    expect(moveCursor({ x: 10, y: 10 }, 99999, 99999)).toEqual({ x: PC_W - 1, y: PC_H - 1 });
    expect(moveCursor({ x: 100, y: 100 }, 5, -3)).toEqual({ x: 105, y: 97 });
  });
});

describe('슬라이드', () => {
  it('넘기기는 1~10장 안에서, 암전은 쇼 중에만, 쇼 시작은 1장부터', () => {
    let d = initDeck(10);
    d = deckReact(d, 'prev').state;
    expect(d.index).toBe(0);
    expect(deckReact(d, 'blackout').note).not.toBeNull();
    for (let i = 0; i < 12; i++) d = deckReact(d, 'next').state;
    expect(d.index).toBe(9);
    d = deckReact(d, 'showStart').state;
    expect(d).toMatchObject({ index: 0, view: 'show' });
    d = deckReact(d, 'blackout').state;
    expect(d.view).toBe('black');
    d = deckReact(d, 'blackout').state;
    expect(d.view).toBe('show');
    d = deckReact(d, 'showEnd').state;
    expect(d.view).toBe('edit');
  });

  it('슬라이드 10장, 키 표기는 keymap 에서', () => {
    const slides = buildSlides(km, 'win', 'powerpoint');
    expect(slides).toHaveLength(10);
    expect(slides[6].tiles).toHaveLength(6);
  });
});

describe('바탕화면(실행 모드)', () => {
  it('Win+숫자 = 작업표시줄 앱 창 열림·맨 앞, 매크로도 같은 앱', () => {
    let d = initDesktop();
    d = desktopReact(d, 'claude', 'key', 'Claude').state;
    d = desktopReact(d, 'excel', 'macro', 'Excel').state;
    expect(d.open).toEqual(['claude', 'excel']);
    expect(d.front).toBe('excel');
    d = desktopReact(d, 'claude', 'key', 'Claude').state;
    expect(d.front).toBe('claude');
  });
  it('업무포털 = 크롬 + 주소, 음소거 토글, 잠금 중에는 반응 없음', () => {
    let d = desktopReact(initDesktop(), 'portal', 'macro', 'Portal', 'https://example.org').state;
    expect(d).toMatchObject({ front: 'chrome', url: 'https://example.org' });
    d = desktopReact(d, 'mute', 'macro', 'Mute').state;
    expect(d.muted).toBe(true);
    d = desktopReact(d, 'lock', 'key', 'Lock').state;
    expect(desktopReact(d, 'chrome', 'key', 'Chrome').note).not.toBeNull();
  });
});

describe('회의 창', () => {
  it('마이크·카메라·손들기 토글', () => {
    let m = initMeeting().zoom;
    m = meetingReact(m, 'mic').state;
    m = meetingReact(m, 'camera').state;
    m = meetingReact(m, 'hand').state;
    expect(m).toEqual({ mic: false, camera: true, hand: true });
  });
});
