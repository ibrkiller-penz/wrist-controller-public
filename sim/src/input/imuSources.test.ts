// 입력 모듈 테스트 — CSV 파싱, 샘플 녹화 파일·합성 파형이 코어 판정(App → modeMachine → gesture)에서 기대대로 나오는지.
// 1단계 체크리스트 '튕김은 인식, 천천히 돌리기는 무시'를 녹화 재생 경로로도 확인한다.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { App } from '../app';
import type { CoreEvent, ImuSample } from '../core/types';
import { concatSamples, formatImuCsv, parseImuCsv, synthBigSlowTurn, synthFlick, synthRest, synthSlowRotate, synthWalk } from './imuSources';

const here = fileURLToPath(new URL('.', import.meta.url));
const sample = (name: string) => readFileSync(resolve(here, '../../public/samples', name), 'utf8');

/** 샘플을 App 에 그대로(원래 시각으로) 넣고 코어 알림을 모은다 */
function run(samples: ImuSample[]) {
  let now = 0;
  const app = new App({ persist: false, tickMs: 0, clock: () => now });
  app.dispatch({ t: 'setMode', mode: 'present' }); // 기본 시작 모드는 시계 — 튕김은 발표 모드에서만
  const events: CoreEvent[] = [];
  const keys: string[] = [];
  app.hid.subscribe((r) => {
    if (r.ev.t === 'key' && r.source === 'gesture') keys.push(r.action ?? '');
  });
  const t0 = 1000;
  for (const s of samples) {
    now = t0 + s.t;
    const r = app.imu({ ...s, t: now });
    events.push(...r.events);
  }
  const flicks = events.filter((e): e is Extract<CoreEvent, { t: 'flick' }> => e.t === 'flick').map((e) => e.dir);
  const cooldown = events.filter((e) => e.t === 'ignored' && e.source === 'gesture' && e.reason === 'cooldown').length;
  return { flicks, keys, cooldown, events };
}

describe('parseImuCsv', () => {
  it('머리글·주석·가속도 열을 처리한다', () => {
    const s = parseImuCsv('# 주석\nt_ms,gx,gy,gz,ax,ay,az\n0,1,2,3,0,0,1\n10,4,5,6,0,0,1\n\n');
    expect(s).toEqual([
      { t: 0, gx: 1, gy: 2, gz: 3 },
      { t: 10, gx: 4, gy: 5, gz: 6 },
    ]);
  });
  it('열 순서가 달라도 이름으로 찾는다', () => {
    expect(parseImuCsv('gz,gy,gx,t_ms\n3,2,1,5\n')).toEqual([{ t: 5, gx: 1, gy: 2, gz: 3 }]);
  });
  it('머리글이 없으면 앞 네 열 = t,gx,gy,gz', () => {
    expect(parseImuCsv('0,1,2,3\n10,1,2,3')).toHaveLength(2);
  });
  it('시각이 줄지 않으면(중복·역순) 건너뛴다, 숫자 아닌 줄도', () => {
    expect(parseImuCsv('t_ms,gx,gy,gz\n0,0,0,0\n0,1,1,1\n-5,1,1,1\nabc,1,2,3\n10,1,1,1').map((s) => s.t)).toEqual([0, 10]);
  });
  it('formatImuCsv ↔ parseImuCsv 왕복', () => {
    const src = synthFlick('out');
    const back = parseImuCsv(formatImuCsv(src, '시험'));
    expect(back).toHaveLength(src.length);
    expect(back[40].gy).toBeCloseTo(src[40].gy, 2);
  });
});

describe('합성 파형 → 코어 판정', () => {
  it('바깥·안쪽 튕김 모두 다음(기본 flick.inAction next)', () => {
    expect(run(synthFlick('out')).keys).toEqual(['next']);
    expect(run(synthFlick('in')).keys).toEqual(['next']);
    expect(run(synthFlick('in')).flicks).toEqual(['in']);
  });
  it('천천히 돌리기·크게 천천히·걷기는 무시', () => {
    expect(run(concatSamples(synthRest(300), synthSlowRotate(3200))).flicks).toEqual([]);
    expect(run(synthBigSlowTurn()).flicks).toEqual([]);
    expect(run(concatSamples(synthRest(300), synthWalk(3300))).flicks).toEqual([]);
  });
});

describe('public/samples 녹화 파일', () => {
  it('imu_flick.csv: 바깥·안쪽·바깥 3회 인식(기본은 모두 다음), 4번째는 재인식 금지로 무시', () => {
    const r = run(parseImuCsv(sample('imu_flick.csv')));
    expect(r.flicks).toEqual(['out', 'in', 'out']);
    expect(r.keys).toEqual(['next', 'next', 'next']);
    expect(r.cooldown).toBeGreaterThanOrEqual(1);
  });
  it('imu_slow_rotate.csv: 튕김 0회', () => {
    const r = run(parseImuCsv(sample('imu_slow_rotate.csv')));
    expect(r.flicks).toEqual([]);
    expect(r.keys).toEqual([]);
  });
});
