/**
 * 기본 설정 — 저장소의 /shared/keymap.json, /shared/gesture.json 을 그대로 읽는다.
 * 설정 화면에서 바꾼 값은 App.setConfig() 로 교체하고, 원본은 언제나 이 두 파일이다.
 */
import keymapJson from '@shared/keymap.json';
import gestureJson from '@shared/gesture.json';
import type { GestureConfig, Keymap } from './types';

export const DEFAULT_KEYMAP: Keymap = keymapJson as unknown as Keymap;
export const DEFAULT_GESTURE: GestureConfig = gestureJson as unknown as GestureConfig;

/** 깊은 복사본(수정해도 원본 기본값이 바뀌지 않게) */
export function defaultKeymap(): Keymap {
  return structuredClone(DEFAULT_KEYMAP);
}
export function defaultGesture(): GestureConfig {
  return structuredClone(DEFAULT_GESTURE);
}
