/**
 * 입력 패널 — 담당: input 모듈.
 * 명세: design/simulator-layout.md 3장(툴바 손목 입력 세그먼트), 4.4(손목 움직임 패널).
 *       음성 입력은 2026-10 에 제품에서 뺐다(docs/research/gemini-later.md).
 *
 * 계약
 *  - export function mountInputPanel(slots: InputSlots, app: App): void
 *    slots.panel   : 시계 아래 '손목 움직임' 패널
 *    slots.toolbar : 툴바 안 자리(입력 방식 세그먼트)
 *    slots.notice  : 툴바 바로 아래 안내 띠(지금은 비워 둔다 — 비면 셸 CSS 가 숨김)
 *  - 키 이름·단축키는 쓰지 않는다.
 */
import type { App } from '../app';
import type { CoreEvent, FlickReject, ImuSample } from '../core/types';
import {
  concatSamples,
  createDragSource,
  createPhoneSource,
  createReplaySource,
  parseImuCsv,
  phoneSensorAvailable,
  synthBigSlowTurn,
  synthFlick,
  synthRest,
  synthSlowRotate,
  synthWalk,
  type DragHorizontalAxis,
  type ImuSourceKind,
  type PhoneStatus,
  type ReplaySource,
} from './imuSources';
import './input.css';

export interface InputSlots {
  panel: HTMLElement;
  toolbar: HTMLElement;
  notice: HTMLElement;
}

const PREF_KEY = 'wrist-sim.input.v1';
interface InputPrefs {
  source?: ImuSourceKind;
  horizontal?: DragHorizontalAxis;
}
function loadPrefs(): InputPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    return raw ? (JSON.parse(raw) as InputPrefs) : {};
  } catch {
    return {};
  }
}
function savePrefs(p: InputPrefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    /* 무시 */
  }
}

const SOURCE_LABEL: Record<ImuSourceKind, string> = { drag: '마우스 드래그', phone: '폰 센서', replay: '녹화 재생' };
const SOURCE_DESC: Record<ImuSourceKind, string> = {
  drag: '끌어서 손목 각속도를 만듭니다',
  phone: '스마트폰 자이로를 손목 대신 씁니다',
  replay: '시계에서 녹화한 CSV 를 재생합니다',
};

const REJECT_TEXT: Record<FlickReject, string> = {
  tooShort: '너무 짧음',
  tooLong: '너무 김(천천히 돌리기)',
  noRebound: '되돌림 없음',
  notDominant: '다른 축 움직임이 큼(걷기·손짓)',
  notQuiet: '직전 움직임이 많음',
};

const SAMPLES = [
  { file: 'imu_flick.csv', label: '샘플: 튕김 포함' },
  { file: 'imu_real_flick_2026-10-18.csv', label: '실기 녹화: 손목 튕김 9회(1호기, 2026-10-18)' },
  { file: 'imu_slow_rotate.csv', label: '샘플: 천천히 회전' },
];

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function mountInputPanel(slots: InputSlots, app: App): void {
  const prefs = loadPrefs();
  const phoneOk = phoneSensorAvailable();

  // ------------------------------------------------------------------ 툴바
  slots.toolbar.insertAdjacentHTML(
    'beforeend',
    `<div class="in-tb">
      <div class="in-seg" role="group" aria-label="손목 입력 방식">
        ${(['drag', 'phone', 'replay'] as const)
          .map(
            (k) =>
              `<button type="button" class="in-seg__btn" data-src="${k}" aria-pressed="false"${
                k === 'phone' && !phoneOk ? ' disabled title="이 브라우저에는 기기 움직임 센서가 없습니다"' : ''
              }>${SOURCE_LABEL[k]}</button>`,
          )
          .join('')}
      </div>
    </div>`,
  );
  const tb = slots.toolbar.querySelector<HTMLElement>('.in-tb')!;
  const segBtns = [...tb.querySelectorAll<HTMLButtonElement>('.in-seg__btn')];

  // ------------------------------------------------------------------ 패널
  slots.panel.classList.add('in-root');
  slots.panel.innerHTML = `
    <section class="in-panel" aria-label="손목 움직임">
      <header class="in-panel__head">
        <span class="in-panel__title">손목 움직임</span>
        <span class="in-panel__sub" data-ref="desc"></span>
      </header>
      <div class="in-panel__body">
        <div class="in-view" data-view="drag">
          <div class="in-pad" data-ref="pad" role="application" aria-label="드래그 패드: 끌면 손목 각속도가 만들어집니다">
            <span class="in-pad__cross" aria-hidden="true"></span>
            <span class="in-pad__knob" aria-hidden="true"></span>
          </div>
          <div class="in-row">
            <label class="in-field">가로 드래그
              <select data-ref="haxis">
                <option value="auto">자동 (버튼 누르면 포인터, 아니면 튕김)</option>
                <option value="roll">튕김 축(roll) 고정</option>
                <option value="yaw">포인터 좌우(yaw) 고정</option>
              </select>
            </label>
          </div>
          <p class="in-hint">짧게 휙 끌면(방향 무관) 손목 튕김 = 다음 페이지 — 기본 가속도 방식은 끄는 속도가 빨리 변할 때 가속도 펄스를 만들어 판정하고, 천천히 끌면 무시합니다. (각속도 방식이면 오른쪽 = 바깥, 왼쪽 = 안쪽, gesture.json flick.inAction.) 측면 버튼(Space)을 누른 채 끌면 에어마우스. Shift+드래그 = 가로 축 바꾸기. 놓으면 값이 0 으로 돌아갑니다.</p>
        </div>
        <div class="in-view" data-view="phone" hidden>
          <div class="in-row">
            <button type="button" class="in-btn in-btn--primary" data-ref="phoneStart">센서 권한 요청 · 켜기</button>
            <button type="button" class="in-btn" data-ref="phoneStop">끄기</button>
          </div>
          <p class="in-status" data-ref="phoneStatus">폰을 손목처럼 잡고 버튼을 누르세요.</p>
          <p class="in-mono" data-ref="phoneVals"></p>
          <p class="in-hint">회전 속도(DeviceMotion rotationRate, °/s)와 중력 포함 가속도(accelerationIncludingGravity, m/s² → g)를 그대로 IMU 로 넣습니다: β→gx, γ→gy, α→gz, x/y/z→ax/ay/az. 폰을 짧게 휙 스냅하면 가속도 방식 튕김(다음). 센서는 HTTPS(또는 localhost)에서만 켜지고, iPhone 은 버튼을 눌러 권한을 허용해야 합니다. 축이 손목과 다르면 설정 → gesture.json 의 imu.axisMap 으로 맞춥니다.</p>
        </div>
        <div class="in-view" data-view="replay" hidden>
          <div class="in-row">
            <label class="in-btn in-file">CSV 파일 열기<input type="file" accept=".csv,text/csv,text/plain" data-ref="file" /></label>
            ${SAMPLES.map((s) => `<button type="button" class="in-btn" data-sample="${s.file}">${s.label}</button>`).join('')}
          </div>
          <p class="in-mono" data-ref="fileName">파일 없음</p>
          <div class="in-row in-player">
            <button type="button" class="in-icobtn" data-ref="play" aria-label="재생" disabled><svg class="in-ico" aria-hidden="true"><use href="#i-play"/></svg></button>
            <button type="button" class="in-icobtn" data-ref="stop" aria-label="정지(처음으로)" disabled><svg class="in-ico" aria-hidden="true"><use href="#i-stop"/></svg></button>
            <input type="range" class="in-range" data-ref="seek" min="0" max="1000" value="0" step="1" aria-label="재생 위치" disabled />
            <span class="in-mono in-time" data-ref="time">00:00 / 00:00</span>
          </div>
          <div class="in-row">
            <label class="in-field">속도
              <select data-ref="speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select>
            </label>
            <label class="in-check"><input type="checkbox" data-ref="loop" /> 반복</label>
          </div>
          <p class="in-hint">형식: <code>t_ms,gx,gy,gz,ax,ay,az</code> (펌웨어 시리얼 녹화와 같음, °/s · g). 1× 가 아니면 시간축이 바뀌어 판정이 달라질 수 있습니다 — 임계값 조정은 1× 또는 설정 → gesture.json → '녹화 재판정'으로 하세요.</p>
        </div>

        <div class="in-synth" role="group" aria-label="합성 동작">
          <span class="in-synth__label">합성 동작</span>
          <button type="button" class="in-chip" data-synth="out">바깥 튕김</button>
          <button type="button" class="in-chip" data-synth="in">안쪽 튕김</button>
          <button type="button" class="in-chip" data-synth="slow">천천히 돌리기</button>
          <button type="button" class="in-chip" data-synth="big">크게 천천히</button>
          <button type="button" class="in-chip" data-synth="walk">걷기</button>
        </div>

        <div class="in-meters" aria-label="현재 각속도">
          ${(['gx', 'gy', 'gz'] as const)
            .map(
              (a) =>
                `<span class="in-meter__name">${a}</span><span class="in-meter__bar"><span class="in-meter__fill" data-meter="${a}"></span></span><span class="in-meter__val" data-val="${a}">0</span>`,
            )
            .join('')}
        </div>
        <p class="in-verdict" data-ref="verdict" aria-live="polite">튕김 판정은 발표 모드에서만 합니다.</p>
      </div>
    </section>`;

  const $ = <T extends HTMLElement = HTMLElement>(ref: string) => slots.panel.querySelector<T>(`[data-ref="${ref}"]`)!;
  const pad = $('pad');
  const desc = $('desc');
  const views = [...slots.panel.querySelectorAll<HTMLElement>('.in-view')];

  // ------------------------------------------------------------------ 입력원
  const drag = createDragSource(app, pad, { horizontal: prefs.horizontal ?? 'auto' });
  const phone = createPhoneSource(app);
  let replay: ReplaySource | null = null;
  let current: ImuSourceKind = prefs.source && (prefs.source !== 'phone' || phoneOk) ? prefs.source : 'drag';

  const haxis = $<HTMLSelectElement>('haxis');
  haxis.value = drag.horizontal;
  haxis.addEventListener('change', () => {
    drag.horizontal = haxis.value as DragHorizontalAxis;
    savePrefs({ source: current, horizontal: drag.horizontal });
  });

  const select = (k: ImuSourceKind, fromClick: boolean) => {
    if (k !== current) {
      if (current === 'drag') drag.stop();
      if (current === 'phone') phone.stop();
      if (current === 'replay') replay?.pause();
    }
    current = k;
    for (const b of segBtns) b.setAttribute('aria-pressed', String(b.dataset.src === k));
    for (const v of views) v.hidden = v.dataset.view !== k;
    desc.textContent = SOURCE_DESC[k];
    if (k === 'drag') drag.start();
    // 폰: 세그먼트 클릭(사용자 동작) 안에서 바로 권한 요청 — iOS 규칙
    if (k === 'phone' && fromClick) void phone.start();
    savePrefs({ source: k, horizontal: drag.horizontal });
  };
  for (const b of segBtns) b.addEventListener('click', () => select(b.dataset.src as ImuSourceKind, true));

  // 폰
  const phoneStatus = $('phoneStatus');
  const phoneVals = $('phoneVals');
  $('phoneStart').addEventListener('click', () => {
    void phone.start(); // 클릭 안에서 동기 호출
  });
  $('phoneStop').addEventListener('click', () => phone.stop());
  const renderPhone = (s: PhoneStatus) => {
    phoneStatus.textContent = s.message || (s.state === 'idle' ? '폰을 손목처럼 잡고 버튼을 누르세요.' : '');
    phoneStatus.dataset.state = s.state;
    const f = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(0)}`);
    phoneVals.textContent =
      s.state === 'on'
        ? `β ${f(s.beta)}° γ ${f(s.gamma)}° · 회전 gx ${f(s.last?.gx)} gy ${f(s.last?.gy)} gz ${f(s.last?.gz)} °/s${s.intervalMs ? ` · ${Math.round(1000 / s.intervalMs)}Hz` : ''}`
        : '';
  };
  phone.onChange(renderPhone);
  renderPhone(phone.status);

  // 녹화 재생
  const fileName = $('fileName');
  const playBtn = $<HTMLButtonElement>('play');
  const stopBtn = $<HTMLButtonElement>('stop');
  const seek = $<HTMLInputElement>('seek');
  const time = $('time');
  const speedSel = $<HTMLSelectElement>('speed');
  const loopChk = $<HTMLInputElement>('loop');
  let unsubProgress: (() => void) | null = null;
  let seeking = false;

  const renderReplay = () => {
    const r = replay;
    const has = !!r && r.sampleCount > 0;
    playBtn.disabled = !has;
    stopBtn.disabled = !has;
    seek.disabled = !has;
    const playing = !!r?.running;
    playBtn.setAttribute('aria-label', playing ? '일시정지' : '재생');
    playBtn.innerHTML = playing
      ? '<span class="in-pause" aria-hidden="true"></span>'
      : '<svg class="in-ico" aria-hidden="true"><use href="#i-play"/></svg>';
    if (r) {
      if (!seeking) seek.value = String(r.durationMs > 0 ? Math.round((r.positionMs / r.durationMs) * 1000) : 0);
      time.textContent = `${fmtTime(r.positionMs)} / ${fmtTime(r.durationMs)} · ${r.speed}×`;
    }
  };

  const loadSamples = (samples: ImuSample[], name: string) => {
    replay?.stop();
    unsubProgress?.();
    if (samples.length < 2) {
      fileName.textContent = `${name} — 읽을 수 있는 샘플이 없습니다(머리글 t_ms,gx,gy,gz 확인)`;
      replay = null;
      renderReplay();
      return;
    }
    replay = createReplaySource(app, samples, { speed: Number(speedSel.value), loop: loopChk.checked });
    const dur = samples[samples.length - 1].t - samples[0].t;
    const hz = dur > 0 ? Math.round(((samples.length - 1) * 1000) / dur) : 0;
    fileName.textContent = `${name} · 샘플 ${samples.length}개 · 약 ${hz}Hz`;
    unsubProgress = replay.onProgress(renderReplay);
    renderReplay();
  };

  $<HTMLInputElement>('file').addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    try {
      loadSamples(parseImuCsv(await f.text()), f.name);
    } catch (err) {
      fileName.textContent = `파일을 읽지 못했습니다: ${err instanceof Error ? err.message : String(err)}`;
    }
    input.value = '';
  });
  for (const b of slots.panel.querySelectorAll<HTMLButtonElement>('[data-sample]')) {
    b.addEventListener('click', async () => {
      const file = b.dataset.sample!;
      try {
        const res = await fetch(`samples/${file}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        loadSamples(parseImuCsv(await res.text()), file);
      } catch (err) {
        fileName.textContent = `샘플을 불러오지 못했습니다(${file}): ${err instanceof Error ? err.message : String(err)}`;
      }
    });
  }
  playBtn.addEventListener('click', () => {
    if (!replay) return;
    if (replay.running) replay.pause();
    else replay.start();
    renderReplay();
  });
  stopBtn.addEventListener('click', () => {
    replay?.stop();
    renderReplay();
  });
  seek.addEventListener('input', () => {
    seeking = true;
    if (replay) time.textContent = `${fmtTime((Number(seek.value) / 1000) * replay.durationMs)} / ${fmtTime(replay.durationMs)} · ${replay.speed}×`;
  });
  seek.addEventListener('change', () => {
    seeking = false;
    replay?.seek((Number(seek.value) / 1000) * (replay?.durationMs ?? 0));
    renderReplay();
  });
  speedSel.addEventListener('change', () => {
    if (replay) replay.speed = Number(speedSel.value);
    renderReplay();
  });
  loopChk.addEventListener('change', () => {
    if (replay) replay.loop = loopChk.checked;
  });

  // ------------------------------------------------------------------ 합성 동작
  const synthBtns = [...slots.panel.querySelectorAll<HTMLButtonElement>('[data-synth]')];
  let synth: ReplaySource | null = null;
  const makeSynth = (k: string): ImuSample[] => {
    switch (k) {
      case 'out':
        return synthFlick('out');
      case 'in':
        return synthFlick('in');
      case 'slow':
        return concatSamples(synthRest(200), synthSlowRotate(3200), synthRest(200));
      case 'big':
        return synthBigSlowTurn();
      default:
        return concatSamples(synthRest(200), synthWalk(3300), synthRest(200));
    }
  };
  for (const b of synthBtns) {
    b.addEventListener('click', () => {
      synth?.stop();
      synth = createReplaySource(app, makeSynth(b.dataset.synth!));
      for (const x of synthBtns) x.setAttribute('aria-busy', String(x === b));
      const off = synth.onProgress((_p, running) => {
        if (!running) {
          for (const x of synthBtns) x.removeAttribute('aria-busy');
          off();
        }
      });
      synth.start();
    });
  }

  // ------------------------------------------------------------------ 각속도 막대 + 판정 표시
  const fills = Object.fromEntries((['gx', 'gy', 'gz'] as const).map((a) => [a, slots.panel.querySelector<HTMLElement>(`[data-meter="${a}"]`)!]));
  const vals = Object.fromEntries((['gx', 'gy', 'gz'] as const).map((a) => [a, slots.panel.querySelector<HTMLElement>(`[data-val="${a}"]`)!]));
  let lastSample: ImuSample | null = null;
  let rafPending = false;
  const drawMeters = () => {
    rafPending = false;
    const s = lastSample;
    for (const a of ['gx', 'gy', 'gz'] as const) {
      const v = s ? s[a] : 0;
      const frac = Math.min(1, Math.abs(v) / 600) * 50;
      const el = fills[a];
      el.style.width = `${frac}%`;
      el.style.left = v >= 0 ? '50%' : `${50 - frac}%`;
      vals[a].textContent = `${v >= 0 ? '' : '−'}${Math.abs(v).toFixed(0)}`;
    }
  };
  const verdictEl = $('verdict');
  /** 마지막 튕김 인식 시각 — 직후 이 시간 안의 '재인식 금지' 무시는 판정 글자를 덮지 않는다 */
  let lastFlickAt = -Infinity;
  const COOLDOWN_QUIET_MS = 400;
  let verdictTimer: ReturnType<typeof setTimeout> | null = null;
  const showVerdict = (text: string, kind: 'ok' | 'ignored') => {
    verdictEl.textContent = text;
    verdictEl.dataset.kind = kind;
    if (verdictTimer) clearTimeout(verdictTimer);
    verdictTimer = setTimeout(() => {
      delete verdictEl.dataset.kind;
    }, 1600);
  };
  const gestureVerdict = (events: readonly CoreEvent[]) => {
    for (const e of events) {
      if (e.t === 'flick') {
        lastFlickAt = app.now();
        if (e.peakG !== undefined || (app.gesture.flick.detector ?? 'accel') === 'accel') {
          // accel 방식: 방향 없음, 항상 다음
          showVerdict(`튕김 인식${e.peakG !== undefined ? `(가속도 ${e.peakG.toFixed(1)}g)` : ''} → 다음`, 'ok');
        } else {
          const ia = app.gesture.flick.inAction;
          showVerdict(`튕김 인식: ${e.dir === 'out' ? '바깥 → 다음' : ia === 'prev' ? '안쪽 → 이전' : ia === 'none' ? '안쪽 → 무시(키 안 보냄)' : '안쪽 → 다음'}`, 'ok');
        }
      }
      else if (e.t === 'flickRejected')
        showVerdict(`튕김 아님: ${REJECT_TEXT[e.reason]}${e.peakG !== undefined ? ` (가속도 ${e.peakG.toFixed(1)}g)` : ''}`, 'ignored');
      else if (e.t === 'ignored' && e.source === 'gesture') {
        // 인식 직후 같은 동작의 되돌림(감속) 봉우리가 재인식 금지에 걸리는 것은 정상 — 방금 띄운 '튕김 인식'을 덮지 않는다
        if (e.reason === 'cooldown' && app.now() - lastFlickAt < COOLDOWN_QUIET_MS) continue;
        showVerdict(e.reason === 'cooldown' ? '무시: 재인식 금지(0.8초) 중' : e.reason === 'locked' ? '무시: 제스처 잠금 중' : `무시: ${e.reason}`, 'ignored');
      }
      else if (e.t === 'air') showVerdict(e.active ? '에어마우스 시작' : '에어마우스 정지 — 커서 멈춤', 'ok');
    }
  };

  app.subscribe((c) => {
    if (c.input?.t === 'imu') {
      lastSample = c.input.sample;
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(drawMeters);
      }
    }
    if (c.result && c.result.events.length > 0) gestureVerdict(c.result.events);
  });

  // ------------------------------------------------------------------ 시작
  select(current, false);
  if (current === 'phone') renderPhone({ ...phone.status, message: '‘센서 권한 요청 · 켜기’ 버튼을 눌러 시작하세요.' });
}
