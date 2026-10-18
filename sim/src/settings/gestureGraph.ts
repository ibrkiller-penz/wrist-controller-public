/**
 * 제스처 튜닝 실시간 그래프 — 담당: settings 모듈. 명세: design/settings-install.md 2.8.
 *
 *  - 판정은 다시 구현하지 않는다: 실시간 마커는 코어가 낸 알림(change.result.events 의 flick / flickRejected / ignored)을 그대로 찍고,
 *    '녹화 재판정'은 코어 flickStep(@/core/gesture)을 녹화 전체에 돌린다 — 테스트 벡터와 어긋나지 않게.
 *  - 판정 방식(flick.detector)에 따라 그리는 파형이 다르다.
 *    accel(기본): 중력 제거 가속도 크기 hp = |a − LPF(a)| (g, 코어 accelFlickStep 과 같은 시간 기반 EMA·시정수 accel.lpfTauMs).
 *      임계값선 = accel.peakG 하나(끌거나 ↑↓ ±0.05) → onAccelThreshold. 가속도가 없는 샘플은 끊어 그린다.
 *    gyro: 판정 축(flick.axis → imu.axisMap/axisSign) 원시 각속도(바이어스 보정·전처리 전). 다른 두 축은 범례에서 켠다.
 *      임계값 ±선(flick.peakThresholdDps)을 끌거나 ↑↓(±10) → onThreshold.
 */
import type { App } from '../app';
import { flickStep, initFlick } from '../core/gesture';
import { emaAlpha, logicalAxis } from '../core/imu';
import type { FlickReject, GestureConfig, ImuSample, LogicalAxis } from '../core/types';
import { parseImuCsv } from '../input/imuSources';

const WINDOW_MS = 5000;
const H = 240;
const PLOT = { left: 48, top: 16, bottom: 208 };

type Marker =
  | { t: number; kind: 'fire'; dir: 'out' | 'in'; aboveStart: number; peakG?: number }
  | { t: number; kind: 'reject'; label: string };

type Detector = 'accel' | 'gyro';
const detectorOf = (g: Readonly<GestureConfig>): Detector => g.flick.detector ?? 'accel';

const REJECT_LABEL: Record<FlickReject, string> = {
  tooShort: '짧음',
  tooLong: '느림',
  noRebound: '반동 없음',
  notDominant: '다른 축',
  notQuiet: '정숙 아님',
};

export interface GestureGraph {
  readonly el: HTMLElement;
  /** 패널이 보일 때만 그린다 */
  setActive(on: boolean): void;
  /** 설정이 바뀌었을 때(임계값 등) — 재판정 다시 계산 */
  refresh(): void;
}

export interface ReplayVerdict {
  /** peakG = accel 방식 hp 피크(g) */
  fired: { t: number; dir: 'out' | 'in'; peakG?: number }[];
  rejected: { t: number; reason: FlickReject; peakG?: number }[];
  cooldown: number;
}

/**
 * 중력 제거 가속도 크기 hp = |a − LPF(a)| 를 한 샘플씩 구한다 — 코어 accelFlickStep 과 같은 식(시간 기반 EMA, 첫 샘플로 LPF 초기화).
 * 가속도가 없는 샘플은 null(LPF 상태는 그대로).
 */
export function createHpFilter(): { step(s: ImuSample, tauMs: number): number | null; reset(): void } {
  let lpf: [number, number, number] | null = null;
  let lastT: number | null = null;
  return {
    step(s, tauMs) {
      if (s.ax === undefined || s.ay === undefined || s.az === undefined) return null;
      const a: [number, number, number] = [s.ax, s.ay, s.az];
      const al = emaAlpha(lastT === null ? 0 : s.t - lastT, tauMs);
      lpf = lpf === null ? [a[0], a[1], a[2]] : [lpf[0] + al * (a[0] - lpf[0]), lpf[1] + al * (a[1] - lpf[1]), lpf[2] + al * (a[2] - lpf[2])];
      lastT = s.t;
      return Math.hypot(a[0] - lpf[0], a[1] - lpf[1], a[2] - lpf[2]);
    },
    reset() {
      lpf = null;
      lastT = null;
    },
  };
}

/** 녹화 전체의 hp(g) — 샘플마다 하나, 가속도 없는 샘플은 null */
export function accelTrace(samples: readonly ImuSample[], lpfTauMs: number): (number | null)[] {
  const f = createHpFilter();
  return samples.map((s) => f.step(s, lpfTauMs));
}

/** 녹화 전체를 현재 gesture 설정으로 다시 판정(코어 flickStep 그대로) */
export function rejudge(samples: readonly ImuSample[], cfg: GestureConfig): ReplayVerdict {
  let st = initFlick();
  const out: ReplayVerdict = { fired: [], rejected: [], cooldown: 0 };
  const t0 = samples.length ? samples[0].t : 0;
  for (const s of samples) {
    const r = flickStep(st, s, cfg);
    st = r.state;
    if (r.fired) out.fired.push(r.peakG !== undefined ? { t: s.t - t0, dir: r.fired, peakG: r.peakG } : { t: s.t - t0, dir: r.fired });
    if (r.rejected)
      out.rejected.push(r.peakG !== undefined ? { t: s.t - t0, reason: r.rejected, peakG: r.peakG } : { t: s.t - t0, reason: r.rejected });
    if (r.cooldownHit) out.cooldown++;
  }
  return out;
}

export function createGestureGraph(
  app: App,
  opts: {
    onThreshold(v: number): void;
    minThr?: number;
    maxThr?: number;
    /** accel 방식 임계값(accel.peakG) 변경 */
    onAccelThreshold?(v: number): void;
    minG?: number;
    maxG?: number;
  },
): GestureGraph {
  const el = document.createElement('section');
  el.className = 'set-graph';
  el.innerHTML = `
    <div class="set-graph__head">
      <button type="button" class="set-graph__toggle" aria-expanded="true">제스처 튜닝 그래프</button>
      <span class="set-graph__read" data-ref="read">현재 0°/s</span>
    </div>
    <div class="set-graph__body">
      <canvas class="set-graph__canvas" tabindex="0" role="img" aria-label="판정 축 각속도 그래프"></canvas>
      <div class="set-graph__tools">
        <button type="button" class="set-btn set-btn--sm" data-ref="pause" aria-pressed="false">일시정지</button>
        <label class="set-check" data-ref="othersWrap"><input type="checkbox" data-ref="others" /> 다른 두 축</label>
        <label class="set-btn set-btn--sm set-file">녹화 재판정(CSV)<input type="file" accept=".csv,text/csv,text/plain" data-ref="file" /></label>
        <span class="set-graph__hint">점선을 끌거나 ↑↓ 로 임계값 조절</span>
      </div>
      <p class="set-graph__rejudge" data-ref="rejudge" hidden></p>
    </div>`;
  const canvas = el.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = canvas.getContext('2d');
  const read = el.querySelector<HTMLElement>('[data-ref="read"]')!;
  const pauseBtn = el.querySelector<HTMLButtonElement>('[data-ref="pause"]')!;
  const othersChk = el.querySelector<HTMLInputElement>('[data-ref="others"]')!;
  const othersWrap = el.querySelector<HTMLElement>('[data-ref="othersWrap"]')!;
  const fileIn = el.querySelector<HTMLInputElement>('[data-ref="file"]')!;
  const rejudgeEl = el.querySelector<HTMLElement>('[data-ref="rejudge"]')!;
  const toggle = el.querySelector<HTMLButtonElement>('.set-graph__toggle')!;
  const body = el.querySelector<HTMLElement>('.set-graph__body')!;

  // 링 버퍼: (t, yaw, pitch, roll, hp g — 가속도 없으면 null)
  const cap = 2000;
  const buf: { t: number; v: Record<LogicalAxis, number>; hp: number | null }[] = [];
  const hpFilter = createHpFilter();
  const markers: Marker[] = [];
  const cooldowns: [number, number][] = [];
  let fired = 0;
  let ignored = 0;
  let lastFireAt: number | null = null;
  let paused = false;
  let frozenNow = 0;
  let active = false;
  let collapsed = false;
  let raf = 0;
  let lastDraw = 0;
  let recording: { name: string; samples: ImuSample[] } | null = null;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const minThr = opts.minThr ?? 100;
  const maxThr = opts.maxThr ?? 2000;
  const minG = opts.minG ?? 0.05;
  const maxG = opts.maxG ?? 16;

  app.subscribe((c) => {
    if (c.input?.t !== 'imu') return;
    const s = c.input.sample;
    const g = app.gesture;
    const tuple: [number, number, number] = [s.gx, s.gy, s.gz];
    buf.push({
      t: s.t,
      v: { yaw: logicalAxis(tuple, 'yaw', g.imu), pitch: logicalAxis(tuple, 'pitch', g.imu), roll: logicalAxis(tuple, 'roll', g.imu) },
      hp: hpFilter.step(s, g.flick.accel.lpfTauMs),
    });
    if (buf.length > cap) buf.splice(0, buf.length - cap);
    for (const e of c.result?.events ?? []) {
      if (e.t === 'flick') {
        const accelMode = detectorOf(g) === 'accel';
        markers.push({
          t: s.t,
          kind: 'fire',
          dir: e.dir,
          aboveStart: accelMode ? app.state.flick.acc.aboveStart : app.state.flick.aboveStart,
          peakG: e.peakG,
        });
        cooldowns.push([s.t, s.t + g.flick.cooldownMs]);
        fired++;
        lastFireAt = s.t;
      } else if (e.t === 'flickRejected') {
        markers.push({ t: s.t, kind: 'reject', label: REJECT_LABEL[e.reason] + (e.peakG !== undefined ? ` ${e.peakG.toFixed(1)}g` : '') });
        ignored++;
      } else if (e.t === 'ignored' && e.source === 'gesture') {
        markers.push({ t: s.t, kind: 'reject', label: e.reason === 'cooldown' ? '쿨다운' : e.reason === 'locked' ? '잠금' : e.reason });
        ignored++;
      }
    }
    const old = s.t - WINDOW_MS - 1000;
    while (markers.length && markers[0].t < old) markers.shift();
    while (cooldowns.length && cooldowns[0][1] < old) cooldowns.shift();
  });

  // ---------------------------------------------------------------- 그리기
  const css = (name: string, fb: string) => getComputedStyle(el).getPropertyValue(name).trim() || fb;
  let colors = { text1: '#222', text2: '#555', text3: '#999', border: '#ddd', surf2: '#f2f2f2', key: '#1f6fe5', sys: '#888' };
  let colorsAt = -1;

  /**
   * accel: 0 ~ range g 단방향(아래가 0), range = max(peakG × 2.5, 3 g). gyro: −range ~ +range °/s.
   * inv(py) = 화면 y → 값(임계값 끌기용, accel 은 0 이상, gyro 는 절댓값)
   */
  const geom = () => {
    const w = canvas.clientWidth || 528;
    const accel = detectorOf(app.gesture) === 'accel';
    const thr = accel ? app.gesture.flick.accel.peakG : app.gesture.flick.peakThresholdDps;
    const range = accel ? Math.max(thr * 2.5, 3) : Math.max(thr * 1.5, 600);
    const right = w - 8;
    const mid = (PLOT.top + PLOT.bottom) / 2;
    const y = accel
      ? (v: number) => PLOT.bottom - (v / range) * (PLOT.bottom - PLOT.top)
      : (v: number) => mid - (v / range) * ((PLOT.bottom - PLOT.top) / 2);
    const inv = accel
      ? (py: number) => Math.max(0, ((PLOT.bottom - py) / (PLOT.bottom - PLOT.top)) * range)
      : (py: number) => (Math.abs(mid - py) / ((PLOT.bottom - PLOT.top) / 2)) * range;
    return { w, right, range, thr, y, inv, accel };
  };

  const draw = () => {
    if (!ctx) return;
    const now = paused ? frozenNow : app.now();
    if (performance.now() - colorsAt > 500) {
      colorsAt = performance.now();
      colors = {
        text1: css('--sim-text-1', colors.text1),
        text2: css('--sim-text-2', colors.text2),
        text3: css('--sim-text-3', colors.text3),
        border: css('--sim-border', colors.border),
        surf2: css('--sim-surface-2', colors.surf2),
        key: css('--sim-log-key', colors.key),
        sys: css('--sim-log-system', colors.sys),
      };
    }
    const dpr = Math.max(1, Math.min(3, globalThis.devicePixelRatio || 1));
    const { w, right, range, thr, y, accel } = geom();
    othersWrap.style.display = accel ? 'none' : '';
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, H);
    const x = (t: number) => right - ((now - t) / WINDOW_MS) * (right - PLOT.left);
    ctx.font = '12px system-ui, sans-serif';

    // 쿨다운 띠
    ctx.fillStyle = colors.surf2;
    for (const [a, b] of cooldowns) {
      const xa = Math.max(PLOT.left, x(a));
      const xb = Math.min(right, x(b));
      if (xb > xa) ctx.fillRect(xa, PLOT.top, xb - xa, PLOT.bottom - PLOT.top);
    }
    // 0선·축 글자
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(PLOT.left, Math.round(y(0)) + 0.5);
    ctx.lineTo(right, Math.round(y(0)) + 0.5);
    ctx.stroke();
    ctx.fillStyle = colors.text3;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of accel ? [range, range / 2, 0] : [range, 0, -range])
      ctx.fillText(accel ? `${+v.toFixed(1)}g` : `${Math.round(v)}`, PLOT.left - 6, y(v));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let s = 0; s <= 5; s++) ctx.fillText(s === 0 ? '지금' : `−${s}s`, right - (s / 5) * (right - PLOT.left), PLOT.bottom + 8);

    // 파형
    const axis = app.gesture.flick.axis;
    const series = (ax: LogicalAxis, color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      let started = false;
      for (const p of buf) {
        if (p.t < now - WINDOW_MS - 50 || p.t > now + 50) continue;
        const px = x(p.t);
        const py = Math.max(PLOT.top, Math.min(PLOT.bottom, y(p.v[ax])));
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    };
    /** accel hp 파형(가속도 없는 샘플에서 끊는다) */
    const hpSeries = () => {
      ctx.strokeStyle = colors.text1;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      for (const p of buf) {
        if (p.t < now - WINDOW_MS - 50 || p.t > now + 50) continue;
        if (p.hp === null) {
          started = false;
          continue;
        }
        const px = x(p.t);
        const py = Math.max(PLOT.top, Math.min(PLOT.bottom, y(p.hp)));
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(PLOT.left, PLOT.top - 1, right - PLOT.left, PLOT.bottom - PLOT.top + 2);
    ctx.clip();
    if (accel) hpSeries();
    else {
      if (othersChk.checked) for (const ax of (['yaw', 'pitch', 'roll'] as const).filter((a) => a !== axis)) series(ax, colors.text3, 1);
      series(axis, colors.text1, 2);
    }
    ctx.restore();

    // 임계값선(accel: peakG 하나, gyro: ±peakThresholdDps)
    ctx.strokeStyle = colors.key;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    for (const v of accel ? [thr] : [thr, -thr]) {
      ctx.beginPath();
      ctx.moveTo(PLOT.left, y(v));
      ctx.lineTo(right, y(v));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = colors.key;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(accel ? `${thr.toFixed(2)} g` : `${Math.round(thr)}°/s`, right - 2, y(thr) - 2);

    // 마커
    for (const m of markers) {
      const mx = x(m.t);
      if (mx < PLOT.left - 10 || mx > right + 10) continue;
      if (m.kind === 'fire') {
        // 지속시간 창(최대 maxAboveMs) 괄호
        const xa = x(m.aboveStart);
        const xb = x(m.aboveStart + (accel ? app.gesture.flick.accel.maxAboveMs : app.gesture.flick.maxAboveMs));
        const yb = m.dir === 'out' || accel ? y(thr) - 14 : y(-thr) + 14;
        ctx.strokeStyle = colors.text2;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xa, yb + (m.dir === 'out' ? 4 : -4));
        ctx.lineTo(xa, yb);
        ctx.lineTo(xb, yb);
        ctx.lineTo(xb, yb + (m.dir === 'out' ? 4 : -4));
        ctx.stroke();
        // 삼각형 + 라벨
        ctx.fillStyle = colors.key;
        const up = m.dir === 'out' || accel;
        const ty = up ? PLOT.top + 4 : PLOT.bottom - 4;
        ctx.beginPath();
        if (up) {
          ctx.moveTo(mx, ty);
          ctx.lineTo(mx - 5, ty + 9);
          ctx.lineTo(mx + 5, ty + 9);
        } else {
          ctx.moveTo(mx, ty);
          ctx.lineTo(mx - 5, ty - 9);
          ctx.lineTo(mx + 5, ty - 9);
        }
        ctx.closePath();
        ctx.fill();
        ctx.textAlign = 'left';
        ctx.textBaseline = up ? 'top' : 'bottom';
        const label = accel ? `다음 →${m.peakG !== undefined ? ` ${m.peakG.toFixed(1)}g` : ''}` : up ? '다음 →' : '← 이전';
        ctx.fillText(label, mx + 7, ty);
      } else {
        ctx.strokeStyle = colors.sys;
        ctx.lineWidth = 1.5;
        const my = PLOT.top + 22;
        ctx.beginPath();
        ctx.arc(mx, my, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = colors.sys;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(m.label, mx + 8, my);
      }
    }

    // 읽기값
    const since = lastFireAt === null ? '—' : `${((now - lastFireAt) / 1000).toFixed(1)}초 전`;
    if (accel) {
      const last = buf.length ? buf[buf.length - 1].hp : null;
      read.textContent = `가속도 hp ${last === null ? '— (가속도 없음)' : `${last.toFixed(2)} g`} · 마지막 인식 ${since} · 인식 ${fired} / 무시 ${ignored}`;
      canvas.setAttribute(
        'aria-label',
        `중력 제거 가속도 크기 그래프(accel 방식). 임계값 ${thr.toFixed(2)} g. 위아래 화살표로 0.05씩 조절`,
      );
    } else {
      const cur = buf.length ? buf[buf.length - 1].v[axis] : 0;
      read.textContent = `현재 ${Math.round(cur)}°/s · 마지막 인식 ${since} · 인식 ${fired} / 무시 ${ignored}`;
      canvas.setAttribute('aria-label', `판정 축(${axis}) 각속도 그래프. 임계값 ${Math.round(thr)}°/s. 위아래 화살표로 10씩 조절`);
    }
  };

  const loop = (ts: number) => {
    raf = 0;
    if (!active || collapsed) return;
    if (!reduced || ts - lastDraw >= 100) {
      lastDraw = ts;
      draw();
    }
    raf = requestAnimationFrame(loop);
  };
  const kick = () => {
    if (active && !collapsed && raf === 0) raf = requestAnimationFrame(loop);
  };

  // ---------------------------------------------------------------- 임계값 끌기·키보드
  let dragging = false;
  const setThr = (v: number) => {
    if (detectorOf(app.gesture) === 'accel') {
      const nv = Math.max(minG, Math.min(maxG, Math.round(v * 20) / 20));
      if (nv !== app.gesture.flick.accel.peakG) opts.onAccelThreshold?.(nv);
    } else {
      const nv = Math.max(minThr, Math.min(maxThr, Math.round(v / 10) * 10));
      if (nv !== app.gesture.flick.peakThresholdDps) opts.onThreshold(nv);
    }
    if (paused) draw();
  };
  const hitLine = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const py = e.clientY - r.top;
    const { thr, y, accel } = geom();
    return Math.abs(py - y(thr)) <= 6 || (!accel && Math.abs(py - y(-thr)) <= 6);
  };
  canvas.addEventListener('pointermove', (e) => {
    if (dragging) {
      const r = canvas.getBoundingClientRect();
      setThr(geom().inv(e.clientY - r.top));
    } else canvas.style.cursor = hitLine(e) ? 'ns-resize' : '';
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (!hitLine(e)) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  const endDrag = () => {
    dragging = false;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const up = e.key === 'ArrowUp';
      if (detectorOf(app.gesture) === 'accel') setThr(app.gesture.flick.accel.peakG + (up ? 0.05 : -0.05));
      else setThr(app.gesture.flick.peakThresholdDps + (up ? 10 : -10));
    }
  });

  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    frozenNow = app.now();
    pauseBtn.setAttribute('aria-pressed', String(paused));
    pauseBtn.textContent = paused ? '계속' : '일시정지';
    draw();
  });
  othersChk.addEventListener('change', () => draw());
  toggle.addEventListener('click', () => {
    collapsed = !collapsed;
    toggle.setAttribute('aria-expanded', String(!collapsed));
    body.hidden = collapsed;
    kick();
  });

  // ---------------------------------------------------------------- 녹화 재판정
  const renderRejudge = () => {
    if (!recording) {
      rejudgeEl.hidden = true;
      return;
    }
    const r = rejudge(recording.samples, app.gesture as GestureConfig);
    const out = r.fired.filter((f) => f.dir === 'out').length;
    const by = new Map<string, number>();
    for (const x of r.rejected) by.set(REJECT_LABEL[x.reason], (by.get(REJECT_LABEL[x.reason]) ?? 0) + 1);
    const why = [...by].map(([k, v]) => `${k} ${v}`).join(', ');
    const accel = detectorOf(app.gesture) === 'accel';
    const times = r.fired
      .map((f) => `${(f.t / 1000).toFixed(2)}s ${accel ? '다음' : f.dir === 'out' ? '다음' : '이전'}${f.peakG !== undefined ? `(${f.peakG.toFixed(1)}g)` : ''}`)
      .join(' · ');
    const noAcc = accel && !recording.samples.some((x) => x.ax !== undefined);
    rejudgeEl.hidden = false;
    rejudgeEl.textContent = `녹화 재판정(${accel ? `가속도 · 임계 ${app.gesture.flick.accel.peakG.toFixed(2)} g` : `각속도 · 임계 ${Math.round(app.gesture.flick.peakThresholdDps)}°/s`}) — ${recording.name} (${recording.samples.length}샘플${noAcc ? ', 가속도 열 없음 — accel 방식은 판정 불가' : ''}): 인식 ${r.fired.length}${accel ? '' : ` (다음 ${out} / 이전 ${r.fired.length - out})`} · 무시 ${r.rejected.length + r.cooldown}${why || r.cooldown ? ` (${[why, r.cooldown ? `쿨다운 ${r.cooldown}` : ''].filter(Boolean).join(', ')})` : ''}${
      times ? ` · ${times}` : ''
    }`;
  };
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0];
    if (!f) return;
    try {
      const samples = parseImuCsv(await f.text());
      recording = samples.length ? { name: f.name, samples } : null;
      if (!recording) {
        rejudgeEl.hidden = false;
        rejudgeEl.textContent = `${f.name}: 읽을 수 있는 샘플이 없습니다(머리글 t_ms,gx,gy,gz 확인)`;
      } else renderRejudge();
    } catch (err) {
      rejudgeEl.hidden = false;
      rejudgeEl.textContent = `파일을 읽지 못했습니다: ${err instanceof Error ? err.message : String(err)}`;
    }
    fileIn.value = '';
  });

  return {
    el,
    setActive(on: boolean) {
      active = on;
      if (on) kick();
    },
    refresh() {
      renderRejudge();
      if (paused) draw();
    },
  };
}
