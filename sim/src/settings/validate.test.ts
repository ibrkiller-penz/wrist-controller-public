// 설정 화면 검증 테스트 — 오류(적용 막음)/경고(적용함) 분류와 줄:열, 재판정.
import { describe, expect, it } from 'vitest';
import { defaultGesture, defaultKeymap } from '../core/config';
import { synthFlick, synthSlowRotate, concatSamples, synthRest } from '../input/imuSources';
import { rejudge } from './gestureGraph';
import { locateJson } from './jsonLocate';
import { checkText, countChanges, schemaAt, toJsonText } from './validate';

describe('jsonLocate', () => {
  it('문법 오류 줄:열', () => {
    const r = locateJson('{\n  "a": 1,\n  "b": [1, 2,]\n}');
    expect(r.error?.pos.line).toBe(3);
    expect(r.error?.message).toContain('쉼표');
  });
  it('포인터 위치', () => {
    const r = locateJson('{\n  "a": {\n    "b": 5\n  }\n}');
    expect(r.pointers.get('/a/b')).toMatchObject({ line: 3, col: 10 });
  });
});

describe('checkText', () => {
  it('저장소 기본값은 오류 0', () => {
    expect(checkText('keymap', toJsonText(defaultKeymap())).errors).toBe(0);
    expect(checkText('gesture', toJsonText(defaultGesture())).errors).toBe(0);
  });
  it('알 수 없는 키 이름 → 오류 + 줄 번호', () => {
    const km = defaultKeymap();
    (km.modes.launch.apps.launcher.actions[0].win as { key: string }).key = 'CTRLL';
    const r = checkText('keymap', toJsonText(km));
    expect(r.errors).toBeGreaterThan(0);
    const is = r.issues.find((i) => i.path.endsWith('/win/key'));
    expect(is?.message).toContain('알 수 없는 키 이름');
    expect(is?.line).toBeGreaterThan(1);
  });
  it('라벨 5글자 초과·단축키 중복 → 경고(적용됨)', () => {
    const km = defaultKeymap();
    const acts = km.modes.launch.apps.launcher.actions;
    acts[0].label = '여섯글자라벨';
    acts[1].win = acts[0].win;
    const r = checkText('keymap', toJsonText(km));
    expect(r.errors).toBe(0);
    expect(r.warnings).toBeGreaterThanOrEqual(2);
  });
  it('cooldownMs ≠ 800 → 경고, 데드존 exit > enter → 오류, 범위 밖 → 오류', () => {
    const g = defaultGesture();
    g.flick.cooldownMs = 600;
    expect(checkText('gesture', toJsonText(g))).toMatchObject({ errors: 0, warnings: 1 });
    g.airMouse.deadzoneDps.exit = 5;
    expect(checkText('gesture', toJsonText(g)).errors).toBe(1);
    const g2 = defaultGesture();
    g2.flick.peakThresholdDps = 5000;
    expect(checkText('gesture', toJsonText(g2)).issues[0].message).toContain('이하');
  });
  it('장치 이름 바이트 초과', () => {
    const km = defaultKeymap();
    km.settings.deviceName = '아주아주긴블루투스장치이름입니다';
    expect(checkText('keymap', toJsonText(km)).errors).toBeGreaterThan(0);
  });
  it('문법 오류면 value null', () => {
    expect(checkText('gesture', '{ "version": 1, }').value).toBeNull();
  });
  it('schemaAt 범위', () => {
    expect(schemaAt('gesture', '/flick/peakThresholdDps')).toMatchObject({ minimum: 100, maximum: 2000 });
    expect(schemaAt('gesture', '/airMouse/sensitivity/1/gain')).toMatchObject({ minimum: 0.01 });
  });
  it('countChanges', () => {
    const g = defaultGesture();
    const h = defaultGesture();
    h.flick.cooldownMs = 900;
    h.airMouse.invertY = true;
    expect(countChanges(g, h)).toBe(2);
  });
});

describe('녹화 재판정(rejudge)', () => {
  it('임계값을 올리면 약한 튕김이 빠진다', () => {
    const rec = concatSamples(synthRest(500), synthFlick('out', { peakDps: 450 }), synthRest(500), synthSlowRotate(2000));
    const g = defaultGesture();
    expect(rejudge(rec, g).fired.map((f) => f.dir)).toEqual(['out']);
    g.flick.peakThresholdDps = 600;
    expect(rejudge(rec, g).fired).toEqual([]);
  });
});
