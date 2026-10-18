// 입력 모듈 테스트 — CSV 파싱, 샘플 녹화 파일·합성 파형이 코어 판정(App → modeMachine → gesture)에서 기대대로 나오는지.
// 1단계 체크리스트 '튕김은 인식, 천천히 돌리기는 무시'를 녹화 재생 경로로도 확인한다.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { App } from '../app';
import { defaultGesture } from '../core/config';
import type { CoreEvent, GestureConfig, ImuSample } from '../core/types';
import {
  concatSamples,
  createDragAccel,
  formatImuCsv,
  parseImuCsv,
  synthBigSlowTurn,
  synthFlick,
  synthRest,
  synthSlowRotate,
  synthWalk,
} from './imuSources';

const here = fileURLToPath(new URL('.', import.meta.url));
const sample = (name: string) => readFileSync(resolve(here, '../../public/samples', name), 'utf8');

/** 샘플을 App 에 그대로(원래 시각으로) 넣고 코어 알림을 모은다 */
function run(samples: ImuSample[], gesture?: GestureConfig) {
  let now = 0;
  const app = new App({ persist: false, tickMs: 0, clock: () => now, gesture });
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
  const peaks = events.filter((e): e is Extract<CoreEvent, { t: 'flick' }> => e.t === 'flick').map((e) => e.peakG);
  return { flicks, keys, cooldown, events, peaks };
}

/** 옛 각속도(gyro) 방식 설정 */
const gyroCfg = (): GestureConfig => {
  const g = defaultGesture();
  g.flick.detector = 'gyro';
  return g;
};

/** hp = |a − LPF(a)| 최댓값(코어와 같은 시간 기반 EMA, tau 200ms) */
function maxHp(samples: readonly ImuSample[], tauMs = 200): number {
  let l: number[] | null = null;
  let lt = 0;
  let max = 0;
  for (const s of samples) {
    const a = [s.ax!, s.ay!, s.az!];
    if (l === null) l = a.slice();
    else {
      const al = 1 - Math.exp(-(s.t - lt) / tauMs);
      l = l.map((v, i) => v + al * (a[i] - v));
    }
    lt = s.t;
    max = Math.max(max, Math.hypot(a[0] - l[0], a[1] - l[1], a[2] - l[2]));
  }
  return max;
}

describe('parseImuCsv', () => {
  it('머리글·주석·가속도 열을 처리한다', () => {
    const s = parseImuCsv('# 주석\nt_ms,gx,gy,gz,ax,ay,az\n0,1,2,3,0,0,1\n10,4,5,6,0,0,1\n\n');
    expect(s).toEqual([
      { t: 0, gx: 1, gy: 2, gz: 3, ax: 0, ay: 0, az: 1 },
      { t: 10, gx: 4, gy: 5, gz: 6, ax: 0, ay: 0, az: 1 },
    ]);
  });
  it('가속도 열이 없거나 비면 가속도 없이 넣는다', () => {
    expect(parseImuCsv('t_ms,gx,gy,gz\n0,1,2,3\n')).toEqual([{ t: 0, gx: 1, gy: 2, gz: 3 }]);
    expect(parseImuCsv('t_ms,gx,gy,gz,ax,ay,az\n0,1,2,3,,,\n')).toEqual([{ t: 0, gx: 1, gy: 2, gz: 3 }]);
    expect(parseImuCsv('0,1,2,3,0.5,-0.25,0.75')).toEqual([{ t: 0, gx: 1, gy: 2, gz: 3, ax: 0.5, ay: -0.25, az: 0.75 }]);
  });
  it('열 순서가 달라도 이름으로 찾는다', () => {
    expect(parseImuCsv('gz,gy,gx,t_ms\n3,2,1,5\n')).toEqual([{ t: 5, gx: 1, gy: 2, gz: 3 }]);
    expect(parseImuCsv('az,t_ms,gx,ay,gy,ax,gz\n1,5,1,0.2,2,0.1,3\n')).toEqual([{ t: 5, gx: 1, gy: 2, gz: 3, ax: 0.1, ay: 0.2, az: 1 }]);
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
    expect(back[40].ax).toBeCloseTo(src[40].ax!, 3);
    expect(back[40].az).toBeCloseTo(src[40].az!, 3);
  });
});

describe('합성 파형 → 코어 판정', () => {
  it('모든 합성 파형에 가속도(중력 포함 g)가 있다', () => {
    for (const p of [synthRest(100), synthFlick('out'), synthSlowRotate(400), synthBigSlowTurn(), synthWalk(400)])
      for (const s of p) {
        expect(Number.isFinite(s.ax) && Number.isFinite(s.ay) && Number.isFinite(s.az)).toBe(true);
        expect(Math.hypot(s.ax!, s.ay!, s.az!)).toBeLessThan(5);
      }
    expect(synthRest(100)[5].az).toBeCloseTo(1, 1);
  });
  it('hp 크기: 튕김 ≥ 1.5 g, 천천히 돌리기·걷기는 0.8 g 보다 한참 아래', () => {
    expect(maxHp(synthFlick('out'))).toBeGreaterThan(2);
    expect(maxHp(synthFlick('in', { peakDps: 450 }))).toBeGreaterThan(1.5);
    expect(maxHp(concatSamples(synthRest(300), synthSlowRotate(3200)))).toBeLessThan(0.6);
    expect(maxHp(concatSamples(synthRest(300), synthWalk(3300)))).toBeLessThan(0.6);
  });
  it('바깥·안쪽 튕김 모두 다음 — 기본 accel 방식은 방향 무관(항상 out), hp 피크 기록', () => {
    expect(run(synthFlick('out')).keys).toEqual(['next']);
    expect(run(synthFlick('in')).keys).toEqual(['next']);
    expect(run(synthFlick('in')).flicks).toEqual(['out']);
    expect(run(synthFlick('out')).peaks[0]).toBeGreaterThan(2);
  });
  it('gyro 방식: 바깥·안쪽 구분, 기본 inAction next 라 둘 다 다음', () => {
    expect(run(synthFlick('out'), gyroCfg()).keys).toEqual(['next']);
    expect(run(synthFlick('in'), gyroCfg()).keys).toEqual(['next']);
    expect(run(synthFlick('in'), gyroCfg()).flicks).toEqual(['in']);
  });
  it('천천히 돌리기·크게 천천히·걷기는 무시(accel·gyro 모두)', () => {
    for (const g of [undefined, gyroCfg()]) {
      expect(run(concatSamples(synthRest(300), synthSlowRotate(3200)), g).flicks).toEqual([]);
      expect(run(synthBigSlowTurn(), g).flicks).toEqual([]);
      expect(run(concatSamples(synthRest(300), synthWalk(3300)), g).flicks).toEqual([]);
    }
  });
});

describe('드래그 패드 가속도 합성(createDragAccel)', () => {
  /** 각속도 꼴(ms → deg/s)을 10ms 간격 드래그 샘플로 만든다(가로 = roll = gy) */
  const drag = (ms: number, w: (t: number) => number): ImuSample[] => {
    const acc = createDragAccel();
    const out: ImuSample[] = [];
    for (let t = 0; t < ms; t += 10) {
      const h = w(t);
      out.push({ t, gx: 0, gy: h, gz: 0, ...acc.step(t, h, 0) });
    }
    return out;
  };
  // 휙: 300ms 정지 → 50ms 에 500°/s 까지 → 40ms 유지 → 놓음(0)
  const fast = drag(1200, (t) => (t < 300 ? 0 : t < 350 ? ((t - 300) / 50) * 500 : t < 390 ? 500 : 0));
  // 천천히: 0.3초에 걸쳐 100°/s 까지 → 1초 유지 → 0.3초에 걸쳐 0
  const slow = drag(2400, (t) => (t < 300 ? 0 : t < 600 ? ((t - 300) / 300) * 100 : t < 1600 ? 100 : t < 1900 ? ((1900 - t) / 300) * 100 : 0));
  it('빠른 드래그 → hp ≥ 1.5 g → accel 방식 튕김(다음)', () => {
    expect(maxHp(fast)).toBeGreaterThan(1.5);
    expect(run(fast).keys).toEqual(['next']);
  });
  it('천천히 끌기 → hp 0.8 g 한참 아래 → 무시', () => {
    expect(maxHp(slow)).toBeLessThan(0.3);
    expect(run(slow).flicks).toEqual([]);
  });
});

describe('public/samples 녹화 파일', () => {
  it('imu_flick.csv: 3회 인식(accel 은 방향 무관 모두 다음), 4번째는 재인식 금지로 무시, 걷기는 무시', () => {
    const r = run(parseImuCsv(sample('imu_flick.csv')));
    expect(r.flicks).toEqual(['out', 'out', 'out']);
    expect(r.keys).toEqual(['next', 'next', 'next']);
    expect(r.cooldown).toBeGreaterThanOrEqual(1);
  });
  it('imu_flick.csv (gyro 방식): 바깥·안쪽·바깥 3회, 모두 다음', () => {
    const r = run(parseImuCsv(sample('imu_flick.csv')), gyroCfg());
    expect(r.flicks).toEqual(['out', 'in', 'out']);
    expect(r.keys).toEqual(['next', 'next', 'next']);
    expect(r.cooldown).toBeGreaterThanOrEqual(1);
  });
  it('imu_slow_rotate.csv: 튕김 0회(accel·gyro 모두)', () => {
    for (const g of [undefined, gyroCfg()]) {
      const r = run(parseImuCsv(sample('imu_slow_rotate.csv')), g);
      expect(r.flicks).toEqual([]);
      expect(r.keys).toEqual([]);
    }
  });
});
