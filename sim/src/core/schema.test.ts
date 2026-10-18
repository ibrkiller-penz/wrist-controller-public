// /shared/*.json 이 스키마를 만족하는지 검사한다(설정 화면도 같은 스키마로 검증).
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import keymapSchema from '@shared/schema/keymap.schema.json';
import gestureSchema from '@shared/schema/gesture.schema.json';
import vectorSchema from '@shared/schema/test-vector.schema.json';
import keymap from '@shared/keymap.json';
import gesture from '@shared/gesture.json';
import vMode from '@shared/test-vectors/mode.json';
import vGesture from '@shared/test-vectors/gesture.json';
import vAir from '@shared/test-vectors/airmouse.json';
import vKeymap from '@shared/test-vectors/keymap.json';
import vMacro from '@shared/test-vectors/macro.json';

const ajv = new Ajv2020({ allErrors: true, strict: false });

describe('스키마', () => {
  it('keymap.json', () => {
    const v = ajv.compile(keymapSchema);
    expect(v(keymap), JSON.stringify(v.errors)).toBe(true);
  });
  it('gesture.json', () => {
    const v = ajv.compile(gestureSchema);
    expect(v(gesture), JSON.stringify(v.errors)).toBe(true);
  });
  it('test-vectors/*.json', () => {
    const v = ajv.compile(vectorSchema);
    for (const f of [vMode, vGesture, vAir, vKeymap, vMacro]) expect(v(f), JSON.stringify(v.errors)).toBe(true);
  });
  it('잘못된 키 이름은 거부', () => {
    const v = ajv.compile(keymapSchema);
    const bad = structuredClone(keymap) as typeof keymap;
    (bad.modes.launch.apps.launcher.actions[0].win as { key: string }).key = 'CTRLL';
    expect(v(bad)).toBe(false);
  });
});
