// 샘플 CSV(public/samples/*.csv) 다시 만들기 — 실행: cd sim && npx vite-node src/input/tools/genSamples.ts public/samples
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { concatSamples, formatImuCsv, synthFlick, synthRest, synthSlowRotate, synthBigSlowTurn, synthWalk } from '../imuSources';
const out = process.argv[2];
const flick = concatSamples(
  synthRest(1200, { seed: 1 }),
  synthFlick('out', { seed: 2 }),
  synthRest(700, { seed: 3 }),
  synthFlick('in', { seed: 4, peakDps: 480 }),
  synthRest(500, { seed: 5 }),
  synthFlick('out', { seed: 6, peakDps: 560, tailMs: 0 }),
  synthFlick('out', { seed: 7, leadMs: 0, peakDps: 500 }),
  synthRest(500, { seed: 8 }),
  synthWalk(3300, { seed: 9 }),
  synthRest(800, { seed: 10 }),
);
writeFileSync(resolve(out, 'imu_flick.csv'), formatImuCsv(flick,
 '손목 컨트롤러 IMU 녹화 샘플 — 튕김 포함 (합성 데이터, 실제 시계 녹화 아님)\n100Hz · gx,gy,gz = 각속도 deg/s · ax,ay,az = 가속도 g (판정에 쓰지 않음)\n기본 gesture.json 기대 결과: 바깥(다음) → 안쪽(이전) → 바깥(다음) 인식 3회, 바로 이은 4번째 튕김은 재인식 금지(0.8초)로 무시, 뒤의 걷기 구간은 무시'));
const slow = concatSamples(
  synthRest(800, { seed: 21 }),
  synthSlowRotate(4800, { seed: 22 }),
  synthRest(500, { seed: 23 }),
  synthBigSlowTurn({ seed: 24 }),
  synthRest(800, { seed: 25 }),
);
writeFileSync(resolve(out, 'imu_slow_rotate.csv'), formatImuCsv(slow,
 '손목 컨트롤러 IMU 녹화 샘플 — 천천히 회전 (합성 데이터, 실제 시계 녹화 아님)\n100Hz · gx,gy,gz = 각속도 deg/s · ax,ay,az = 가속도 g (판정에 쓰지 않음)\n기본 gesture.json 기대 결과: 튕김 인식 0회 (진폭 150°/s 사인 회전 + 380°/s 로 크게 천천히 한 번 왕복 = tooLong)'));
console.log(flick.length, slow.length);
