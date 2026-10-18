// 공유 테스트 벡터 /shared/test-vectors/imu-real.json — 실기 IMU 녹화(1호기 2026-10-18) 재생: 튕김 9회 = 다음 9회.
import { describe, expect, it } from 'vitest';
import suite from '@shared/test-vectors/imu-real.json';
import { DEFAULT_GESTURE, DEFAULT_KEYMAP } from './config';
import { runMachineCase, type MachineSuite } from './vectors';

const s = suite as unknown as MachineSuite;

describe(`벡터: 실기 녹화(${s.suite})`, () => {
  for (const c of s.cases) {
    it(c.id, () => {
      expect(runMachineCase(c, DEFAULT_KEYMAP, DEFAULT_GESTURE).failures).toEqual([]);
    });
  }
});
