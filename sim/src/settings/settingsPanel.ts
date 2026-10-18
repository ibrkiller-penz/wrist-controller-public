/**
 * 설정 패널(keymap.json·gesture.json 편집) — 담당: settings 모듈 (src/settings/*, install.html, src/install/*).
 * 명세: design/settings-install.md 2장.
 *
 * 계약
 *  - export function mountSettings(root: HTMLElement, app: App): SettingsHandle
 *    툴바의 설정 버튼이 handle.open() 을 부른다. 패널(오른쪽 서랍)은 root 안에 그린다.
 *  - 검증: validate.ts (JSON 문법 → /shared/schema ajv Ajv2020 → 의미 검사). 오류 0개일 때만 app.setConfig({ keymap | gesture }).
 *    오류가 있으면 마지막으로 유효했던 설정을 계속 쓴다(반쯤 깨진 설정은 반영하지 않음).
 *  - 기본값으로: app.resetConfig(kind). 내보내기: JSON.stringify(cfg, null, 2) + '\n' (키 순서 유지 → 커밋 diff 최소).
 *  - 단축키 입력칸 파싱·표기: core/keymap.ts parseChord / formatChord. 키 이름을 코드에 쓰지 않는다(브라우저 KeyboardEvent.code → hid 키 이름 변환표만 둔다).
 *  - localStorage 편집본 보관(키 wrist-sim.settings.<kind>.v1)은 try/catch — 실패해도 동작한다. 원본은 언제나 /shared/*.json.
 */
import type { App } from '../app';
import { defaultGesture, defaultKeymap } from '../core/config';
import { bindingSource, formatChord, isKnownKey, isMacro, parseBinding, parseChord } from '../core/keymap';
import type { Binding, Chord, GestureConfig, Keymap, ModeId, OsId } from '../core/types';
import { createGestureGraph } from './gestureGraph';
import { checkText, countChanges, schemaAt, toJsonText, type CheckResult, type ConfigKind, type Issue } from './validate';
import './settings.css';

export interface SettingsHandle {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
}

type View = 'form' | 'json';
type Cfg = Keymap | GestureConfig;

interface Doc {
  kind: ConfigKind;
  text: string;
  check: CheckResult<Cfg>;
  /** 폼 칸 자체 오류(단축키 파싱 실패 등) — path → 메시지. 있으면 적용 막음 */
  fieldErrors: Map<string, string>;
  appliedAt: Date | null;
  /** 마지막 내보내기 원문 */
  exported: string | null;
}

const DRAFT_KEY = (k: ConfigKind) => `wrist-sim.settings.${k}.v1`;
const EXPORT_KEY = (k: ConfigKind) => `wrist-sim.settings.${k}.exported.v1`;
const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, v: string | null) {
    try {
      if (v === null) localStorage.removeItem(key);
      else localStorage.setItem(key, v);
    } catch {
      /* 사생활 보호 모드 등 — 무시 */
    }
  },
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const hhmmss = (d: Date) => d.toTimeString().slice(0, 8);

/** KeyboardEvent.code → hid-usage 키 이름 (설정 화면 키 잡기용 변환표 — 단축키 값이 아니라 키보드 배치 정보) */
function codeToKey(code: string): string | null {
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^Digit(\d)$/.exec(code);
  if (m) return m[1];
  m = /^(F\d{1,2})$/.exec(code);
  if (m) return m[1];
  const map: Record<string, string> = {
    ArrowRight: 'RIGHT', ArrowLeft: 'LEFT', ArrowUp: 'UP', ArrowDown: 'DOWN',
    Enter: 'ENTER', NumpadEnter: 'ENTER', Escape: 'ESCAPE', Backspace: 'BACKSPACE', Tab: 'TAB', Space: 'SPACE',
    Minus: 'MINUS', Equal: 'EQUAL', BracketLeft: 'LEFTBRACKET', BracketRight: 'RIGHTBRACKET', Backslash: 'BACKSLASH',
    Semicolon: 'SEMICOLON', Quote: 'QUOTE', Backquote: 'GRAVE', Comma: 'COMMA', Period: 'PERIOD', Slash: 'SLASH',
    Delete: 'DELETE', Insert: 'INSERT', Home: 'HOME', End: 'END', PageUp: 'PAGEUP', PageDown: 'PAGEDOWN',
  };
  const k = map[code];
  return k && isKnownKey(k) ? k : k ?? null;
}

const MODIFIER_CODES = /^(Control|Shift|Alt|Meta|OS)(Left|Right)?$/;

/** 경로 값 읽기/쓰기 */
function getAt(obj: unknown, path: string): unknown {
  let o = obj as Record<string, unknown> | undefined;
  for (const seg of path.split('/').filter(Boolean)) {
    if (o === null || typeof o !== 'object') return undefined;
    o = o[seg] as Record<string, unknown> | undefined;
  }
  return o;
}
function setAt(obj: unknown, path: string, v: unknown) {
  const segs = path.split('/').filter(Boolean);
  let o = obj as Record<string, unknown>;
  for (const seg of segs.slice(0, -1)) o = o[seg] as Record<string, unknown>;
  o[segs[segs.length - 1]] = v;
}

// ---------------------------------------------------------------------------
// gesture.json 폼 항목 (키 이름은 /shared/schema/gesture.schema.json 기준)
// ---------------------------------------------------------------------------
type GField =
  | { path: string; label: string; unit?: string; desc?: string; type: 'slider'; step?: number }
  | { path: string; label: string; unit?: string; desc?: string; type: 'number'; step?: number }
  | { path: string; label: string; desc?: string; type: 'select'; options: [string | number, string][] }
  | { path: string; label: string; desc?: string; type: 'check' };

const GESTURE_GROUPS: { title: string; fields: GField[] }[] = [
  {
    title: '손목 튕김',
    fields: [
      {
        path: '/flick/detector',
        label: '판정 방식',
        type: 'select',
        options: [['accel', '가속도 (기본 · 방향 무관 다음)'], ['gyro', '각속도 (옛 방식)']],
        desc: '가속도: 짧고 빠른 손목 스냅의 중력 제거 가속도로 판정 — 걷기·천천히 돌리기는 무시. 그래프도 이 방식에 맞춰 바뀐다',
      },
      { path: '/flick/cooldownMs', label: '재인식 금지', unit: 'ms', type: 'number', step: 50, desc: '작업지시서 기준 800ms — 바꾸면 경고' },
      { path: '/flick/accel/peakG', label: '가속도 임계값', unit: 'g', type: 'number', step: 0.05, desc: '(가속도 방식) 그래프 점선과 연동. 실기: 세게 2.8–4.6 g, 약하게 1.35–1.84 g, 가만히 0.01 g' },
      { path: '/flick/accel/maxAboveMs', label: '가속도 최대 지속', unit: 'ms', type: 'number', step: 10, desc: '(가속도 방식) 임계값 위에 이보다 오래 있으면 긴 흔들기로 보고 무시(느림)' },
      { path: '/flick/accel/quietMaxRmsG', label: '직전 정숙 한도', unit: 'g', type: 'number', step: 0.05, desc: '(가속도 방식) 튕김 직전 구간 hp RMS 가 이보다 크면 무시(손짓 중)' },
      { path: '/flick/accel/quietWindowMs', label: '정숙 확인 구간', unit: 'ms', type: 'number', step: 10 },
      { path: '/flick/accel/quietGuardMs', label: '정숙 제외 구간', unit: 'ms', type: 'number', step: 10, desc: '튕김 상승부를 정숙 확인에서 뺀다' },
      { path: '/flick/accel/lpfTauMs', label: '중력 추정 시정수', unit: 'ms', type: 'number', step: 10, desc: '(가속도 방식) hp = |a − LPF(a)| 의 LPF 시정수' },
      { path: '/flick/peakThresholdDps', label: '각속도 임계값', unit: '°/s', type: 'slider', step: 10, desc: '(각속도 방식) 그래프 점선과 연동. 낮추면 약한 튕김도 잡고, 높이면 손짓을 덜 잡는다' },
      { path: '/flick/minAboveMs', label: '최소 지속', unit: 'ms', type: 'number', desc: '(각속도 방식) 임계값 위에 이보다 짧게 있으면 잡음(짧음)' },
      { path: '/flick/maxAboveMs', label: '최대 지속', unit: 'ms', type: 'slider', step: 10, desc: '(각속도 방식) 이보다 길면 천천히 돌리기로 보고 무시(느림)' },
      { path: '/flick/axis', label: '판정 축', type: 'select', options: [['roll', 'roll (전완 회전)'], ['pitch', 'pitch'], ['yaw', 'yaw']] },
      { path: '/flick/outwardSign', label: '바깥 방향 부호', type: 'select', options: [[1, '+ = 바깥(다음)'], [-1, '− = 바깥(다음)']], desc: '왼손 착용 등으로 방향이 반대면 바꾼다' },
      { path: '/flick/axisDominanceRatio', label: '축 우세 비율', type: 'number', step: 0.1, desc: '판정 축이 나머지 두 축 합성보다 이 배수 이상 커야 함(걷기 배제)' },
      { path: '/flick/rebound/required', label: '되돌림 필요', type: 'check', desc: '튕긴 뒤 반대 방향으로 되돌아와야 인식' },
      { path: '/flick/rebound/minRatio', label: '되돌림 비율', type: 'number', step: 0.05 },
      { path: '/flick/rebound/minDps', label: '되돌림 최소', unit: '°/s', type: 'number', step: 10 },
      { path: '/flick/rebound/windowMs', label: '되돌림 대기', unit: 'ms', type: 'number', step: 10 },
      { path: '/flick/quietBefore/maxRmsDps', label: '직전 정숙 한도', unit: '°/s', type: 'number', step: 5, desc: '튕김 직전 구간 RMS 가 이보다 크면 무시(손짓 중)' },
      { path: '/flick/adaptive/enabled', label: '적응 임계값', type: 'check', desc: '최근 움직임 RMS×배수가 더 크면 그 값을 임계값으로' },
      { path: '/flick/adaptive/rmsMultiplier', label: '적응 배수', type: 'number', step: 0.5 },
    ],
  },
  {
    title: '에어마우스',
    fields: [
      { path: '/airMouse/sensitivity/0/gain', label: '감도 1단계', type: 'number', step: 0.1, desc: 'px/s = gain × |°/s|^지수. 시계 설정 3단계와 1:1' },
      { path: '/airMouse/sensitivity/1/gain', label: '감도 2단계', type: 'number', step: 0.1 },
      { path: '/airMouse/sensitivity/2/gain', label: '감도 3단계', type: 'number', step: 0.1 },
      { path: '/airMouse/deadzoneDps/enter', label: '데드존 진입', unit: '°/s', type: 'number', step: 0.1, desc: '손떨림 무시: 이 값 이상이면 움직이기 시작' },
      { path: '/airMouse/deadzoneDps/exit', label: '데드존 해제', unit: '°/s', type: 'number', step: 0.1, desc: '이 값 아래로 내려가면 정지(진입 이하)' },
      { path: '/airMouse/lowpassTauMs', label: '저역 필터 시정수', unit: 'ms', type: 'number', step: 5 },
      { path: '/airMouse/curve/exponent', label: '가속 지수', type: 'number', step: 0.1 },
      { path: '/airMouse/holdToStartMs', label: '시작 대기', unit: 'ms', type: 'number', step: 10, desc: '주 버튼을 이만큼 누르고 있으면 에어마우스(전에 떼면 다음 슬라이드)' },
      { path: '/airMouse/invertY', label: '세로 뒤집기', type: 'check' },
    ],
  },
  {
    title: 'IMU 축·버튼',
    fields: [
      { path: '/imu/axisMap/yaw', label: 'yaw ← 센서 축', type: 'select', options: [['gx', 'gx'], ['gy', 'gy'], ['gz', 'gz']] },
      { path: '/imu/axisMap/pitch', label: 'pitch ← 센서 축', type: 'select', options: [['gx', 'gx'], ['gy', 'gy'], ['gz', 'gz']] },
      { path: '/imu/axisMap/roll', label: 'roll ← 센서 축', type: 'select', options: [['gx', 'gx'], ['gy', 'gy'], ['gz', 'gz']] },
      { path: '/imu/axisSign/yaw', label: 'yaw 부호', type: 'select', options: [[1, '+'], [-1, '−']] },
      { path: '/imu/axisSign/pitch', label: 'pitch 부호', type: 'select', options: [[1, '+'], [-1, '−']] },
      { path: '/imu/axisSign/roll', label: 'roll 부호', type: 'select', options: [[1, '+'], [-1, '−']] },
      { path: '/button/longPressMs', label: '길게 누름(잠금)', unit: 'ms', type: 'number', step: 100 },
    ],
  },
];

// ---------------------------------------------------------------------------

export function mountSettings(root: HTMLElement, app: App): SettingsHandle {
  root.classList.add('set-root');
  root.hidden = true;
  root.innerHTML = `
    <div class="set-panel" role="dialog" aria-modal="false" aria-labelledby="set-title">
      <header class="set-panel__head">
        <span id="set-title">설정</span>
        <button type="button" class="set-close" aria-label="설정 닫기">✕</button>
      </header>
      <div class="set-tabs" role="tablist" aria-label="설정 파일">
        <button type="button" role="tab" class="set-tab" data-kind="keymap" aria-selected="true">keymap.json</button>
        <button type="button" role="tab" class="set-tab" data-kind="gesture" aria-selected="false">gesture.json</button>
      </div>
      <div class="set-tools">
        <div class="set-seg" role="group" aria-label="보기">
          <button type="button" class="set-seg__btn" data-view="form" aria-pressed="true">폼</button>
          <button type="button" class="set-seg__btn" data-view="json" aria-pressed="false">JSON 원문</button>
        </div>
        <span class="set-tools__sp"></span>
        <label class="set-btn set-file">가져오기<input type="file" accept=".json,application/json" data-ref="import" /></label>
        <button type="button" class="set-btn" data-ref="export">내보내기</button>
        <button type="button" class="set-btn" data-ref="reset">기본값으로</button>
      </div>
      <div class="set-status" role="status" aria-live="polite" data-ref="status"></div>
      <div class="set-body" data-ref="body"></div>
      <div class="set-toast" role="status" aria-live="polite" data-ref="toast" hidden></div>
      <dialog class="set-dialog" data-ref="dialog">
        <form method="dialog">
          <p data-ref="dlgText"></p>
          <div class="set-dialog__actions">
            <button value="cancel" class="set-btn">취소</button>
            <button value="ok" class="set-btn set-btn--primary" data-ref="dlgOk">확인</button>
          </div>
        </form>
      </dialog>
    </div>`;

  const panel = root.querySelector<HTMLElement>('.set-panel')!;
  const $ = <T extends HTMLElement = HTMLElement>(ref: string) => root.querySelector<T>(`[data-ref="${ref}"]`)!;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('.set-tab')];
  const viewBtns = [...root.querySelectorAll<HTMLButtonElement>('.set-seg__btn')];
  const statusEl = $('status');
  const body = $('body');
  const toastEl = $('toast');
  const exportBtn = $<HTMLButtonElement>('export');
  const importIn = $<HTMLInputElement>('import');
  const dialog = $<HTMLDialogElement>('dialog');

  let kind: ConfigKind = 'keymap';
  let view: View = 'form';
  let kmMode: ModeId = app.state.mode;
  let kmApp: string = app.state.apps[kmMode];
  /** 우리가 setConfig 하는 중(구독 알림을 무시) */
  let applying = false;
  let debounce: ReturnType<typeof setTimeout> | null = null;

  // ---------------------------------------------------------------- 문서 상태
  const defaultsText = { keymap: toJsonText(defaultKeymap()), gesture: toJsonText(defaultGesture()) };
  const makeDoc = (k: ConfigKind): Doc => {
    const draft = store.get(DRAFT_KEY(k));
    const text = draft ?? toJsonText(app.config[k]);
    return { kind: k, text, check: checkText<Cfg>(k, text), fieldErrors: new Map(), appliedAt: null, exported: store.get(EXPORT_KEY(k)) };
  };
  const docs: Record<ConfigKind, Doc> = { keymap: makeDoc('keymap'), gesture: makeDoc('gesture') };

  const errorCount = (d: Doc) => d.check.errors + d.fieldErrors.size;

  /** 검증 통과한 값을 앱에 반영 */
  const apply = (d: Doc) => {
    if (errorCount(d) > 0 || !d.check.value) return;
    const cur = toJsonText(app.config[d.kind]);
    if (cur !== toJsonText(d.check.value)) {
      applying = true;
      try {
        app.setConfig(d.kind === 'keymap' ? { keymap: d.check.value as Keymap } : { gesture: d.check.value as GestureConfig });
      } finally {
        applying = false;
      }
    }
    d.appliedAt = new Date();
  };

  // 저장해 둔 편집본이 정상이면 시작할 때 반영
  for (const k of ['keymap', 'gesture'] as const) {
    const d = docs[k];
    if (store.get(DRAFT_KEY(k)) !== null && d.check.errors === 0) apply(d);
  }

  const revalidate = (d: Doc) => {
    d.check = checkText<Cfg>(d.kind, d.text);
    apply(d);
    renderStatus();
    renderIssues();
    if (d.kind === 'gesture') graph.refresh();
  };

  /** 원문 교체(폼·원문·가져오기 공통). immediate=false 면 300ms 뒤 검증 */
  const setText = (d: Doc, text: string, immediate: boolean) => {
    d.text = text;
    store.set(DRAFT_KEY(d.kind), text === defaultsText[d.kind] ? null : text);
    if (debounce) clearTimeout(debounce);
    debounce = null;
    if (immediate) revalidate(d);
    else {
      renderStatus(true);
      debounce = setTimeout(() => {
        debounce = null;
        revalidate(d);
      }, 300);
    }
  };

  /** 폼에서 값 하나 바꾸기: 현재 원문을 파싱해 경로에 쓰고 다시 직렬화 */
  const editValue = (d: Doc, path: string, v: unknown, immediate = true) => {
    const obj = d.check.value ? structuredClone(d.check.value) : null;
    if (!obj) return;
    setAt(obj, path, v);
    d.check = { ...d.check, value: obj };
    setText(d, toJsonText(obj), immediate);
  };

  // 다른 곳(기본값 되돌리기 등)에서 설정이 바뀌면 원문을 맞춘다
  app.subscribe((c) => {
    if (c.reason !== 'config' || applying) return;
    for (const k of ['keymap', 'gesture'] as const) {
      const d = docs[k];
      const now = toJsonText(app.config[k]);
      if (d.check.value && toJsonText(d.check.value) === now) continue;
      if (errorCount(d) > 0) continue; // 사용자가 고치는 중인 오류 원문은 덮어쓰지 않는다
      d.text = now;
      d.check = checkText<Cfg>(k, now);
    }
    if (handle.isOpen) render();
  });

  // ---------------------------------------------------------------- 상태줄
  const renderStatus = (pending = false) => {
    const d = docs[kind];
    const errs = errorCount(d);
    const warns = d.check.warnings;
    const applied = d.check.value ? toJsonText(d.check.value) : d.text;
    const unexported = errs === 0 && applied !== (d.exported ?? defaultsText[kind]);
    let html: string;
    let cls: string;
    if (pending) {
      cls = 'pending';
      html = '… 검사 중';
    } else if (errs > 0) {
      cls = 'err';
      html = `<button type="button" class="set-status__jump">● 오류 ${errs}개 — 마지막 정상 설정 사용 중</button>`;
    } else if (warns > 0) {
      cls = 'warn';
      html = `▲ 경고 ${warns}개 · 적용됨${d.appliedAt ? ` · ${hhmmss(d.appliedAt)}` : ''}`;
    } else {
      cls = 'ok';
      html = `✓ 적용됨${d.appliedAt ? ` · ${hhmmss(d.appliedAt)}` : ' (저장소 값)'}`;
    }
    statusEl.className = `set-status set-status--${cls}`;
    statusEl.innerHTML = `<span class="set-status__text">${html}</span>${unexported ? '<span class="set-badge" title="펌웨어에 반영하려면 내보내서 저장소에 커밋하세요">내보내기 전</span>' : ''}`;
    exportBtn.disabled = errs > 0;
    exportBtn.title = errs > 0 ? '오류를 고친 뒤 내보낼 수 있습니다' : `${kind}.json 내려받기`;
    statusEl.querySelector('.set-status__jump')?.addEventListener('click', jumpToFirstError);
    // 원문 문법 오류면 폼 보기 막기
    const formBtn = viewBtns.find((b) => b.dataset.view === 'form')!;
    formBtn.disabled = d.check.value === null;
    formBtn.title = d.check.value === null ? 'JSON 오류를 먼저 고치세요' : '';
  };

  const jumpToFirstError = () => {
    const d = docs[kind];
    const first = d.check.issues.find((i) => i.level === 'error');
    if (d.fieldErrors.size > 0 && view === 'form') {
      body.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setView('json');
    if (first) focusLine(first);
  };

  // ---------------------------------------------------------------- 토스트·대화상자
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  const toast = (msg: string) => {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), 3000);
  };
  const confirmDlg = (text: string, okLabel: string): Promise<boolean> =>
    new Promise((resolve) => {
      $('dlgText').textContent = text;
      $('dlgOk').textContent = okLabel;
      if (typeof dialog.showModal !== 'function') {
        resolve(window.confirm(text));
        return;
      }
      dialog.returnValue = '';
      // 'close' 이벤트는 비동기라 환경에 따라 늦거나 안 올 수 있어, 버튼 클릭·Esc(cancel)에서 바로 결론낸다
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        dialog.removeEventListener('click', onClick);
        dialog.removeEventListener('cancel', onCancel);
        dialog.removeEventListener('close', onClose);
        if (dialog.open) dialog.close(ok ? 'ok' : 'cancel');
        resolve(ok);
      };
      const onClick = (e: MouseEvent) => {
        const b = (e.target as HTMLElement).closest('button');
        if (!b) return;
        e.preventDefault();
        finish(b.value === 'ok');
      };
      const onCancel = () => finish(false);
      const onClose = () => finish(dialog.returnValue === 'ok');
      dialog.addEventListener('click', onClick);
      dialog.addEventListener('cancel', onCancel);
      dialog.addEventListener('close', onClose);
      dialog.showModal();
    });

  // ---------------------------------------------------------------- 본문 그리기
  const graph = createGestureGraph(app, {
    onThreshold: (v) => editValue(docs.gesture, '/flick/peakThresholdDps', v),
    minThr: Number(schemaAt('gesture', '/flick/peakThresholdDps')?.minimum ?? 100),
    maxThr: Number(schemaAt('gesture', '/flick/peakThresholdDps')?.maximum ?? 2000),
    onAccelThreshold: (v) => editValue(docs.gesture, '/flick/accel/peakG', v),
    minG: Number(schemaAt('gesture', '/flick/accel/peakG')?.minimum ?? 0.05),
    maxG: Number(schemaAt('gesture', '/flick/accel/peakG')?.maximum ?? 16),
  });

  /** 폼 칸 갱신 함수(포커스 없는 칸만 값 동기화) */
  let formSync: (() => void)[] = [];
  /** 경로별 문제 표시 함수 */
  type Slot =
    | { t: 'row'; prefix: string; el: HTMLElement; mark: HTMLElement } // 키맵 행: 메시지 칸 + ●/▲
    | { t: 'input'; prefix: string; input: HTMLElement } // 키맵 단축키 칸: 테두리만
    | { t: 'field'; path: string; exact: boolean; el: HTMLElement; input: HTMLElement }; // 일반 칸
  let issueSlots: Slot[] = [];

  const render = () => {
    for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.kind === kind));
    const d = docs[kind];
    if (d.check.value === null && view === 'form') view = 'json';
    for (const b of viewBtns) b.setAttribute('aria-pressed', String(b.dataset.view === view));
    formSync = [];
    issueSlots = [];
    body.innerHTML = '';
    body.dataset.kind = kind;
    if (kind === 'gesture') body.append(graph.el);
    graph.setActive(handle.isOpen && kind === 'gesture');
    if (view === 'json') renderJson(d);
    else if (kind === 'keymap') renderKeymapForm(d);
    else renderGestureForm(d);
    renderStatus();
    renderIssues();
  };

  const setView = (v: View) => {
    if (v === 'form' && docs[kind].check.value === null) {
      toast('JSON 오류를 먼저 고치세요');
      return;
    }
    view = v;
    render();
  };

  // ---- keymap 폼
  const renderKeymapForm = (d: Doc) => {
    const km = d.check.value as Keymap;
    const wrap = document.createElement('div');
    wrap.className = 'set-form';
    const modes = (km.modeOrder?.length ? km.modeOrder : (Object.keys(km.modes) as ModeId[])).filter((m) => km.modes[m]);
    if (!km.modes[kmMode]) kmMode = modes[0];
    const mode = km.modes[kmMode];
    const appIds = mode.appOrder?.length ? mode.appOrder.filter((a) => mode.apps[a]) : Object.keys(mode.apps);
    if (!mode.apps[kmApp]) kmApp = appIds.includes(app.state.apps[kmMode]) ? app.state.apps[kmMode] : mode.defaultApp;
    const appDef = mode.apps[kmApp];
    const isLaunch = kmMode === 'launch';
    const ncol = isLaunch ? 6 : 4;

    wrap.innerHTML = `
      <div class="set-seg set-seg--modes" role="group" aria-label="모드">
        ${modes
          .map(
            (m) =>
              `<button type="button" class="set-seg__btn" data-mode="${m}" aria-pressed="${m === kmMode}"><span class="set-mdot" data-mode="${m}"></span>${esc(km.modes[m].name)}</button>`,
          )
          .join('')}
      </div>
      ${
        appIds.length > 1
          ? `<div class="set-seg" role="group" aria-label="앱">${appIds
              .map((a) => `<button type="button" class="set-seg__btn" data-app="${a}" aria-pressed="${a === kmApp}">${esc(mode.apps[a].name)}</button>`)
              .join('')}</div>`
          : ''
      }
      <table class="set-km${isLaunch ? ' set-km--launch' : ''}">
        <thead><tr><th scope="col">기능(라벨)</th><th scope="col">Windows</th>${isLaunch ? '<th scope="col">Windows 길게</th>' : ''}<th scope="col">macOS</th>${isLaunch ? '<th scope="col">macOS 길게</th>' : ''}<th scope="col"><span class="sim-visually-hidden">상태</span></th></tr></thead>
        <tbody></tbody>
      </table>
      <p class="set-hint">단축키 칸을 누르고 키 조합을 누르면 입력됩니다(직접 타이핑도 됨, 예: Ctrl+Shift+P). 칸을 비우면 그 OS 에서 시계 타일이 비활성으로 그려집니다. Esc = 취소. Tab = 다음 칸.</p>
      ${
        isLaunch
          ? `<p class="set-hint">실행 모드: 1~6 = 1쪽(앱), 7~12 = 2쪽(업무 단축). 칸에 <b>매크로</b>를 쓸 수 있습니다 — 단계를 <code>;</code> 로 나눕니다. 예) <code>Win+R; wait 300; text powerpnt; wait 50; Enter</code> · <code>consumer MUTE</code>. text 는 영문·숫자·기호만(한글 불가, US 배열로 입력). <code>{url}</code> 은 아래 주소 칸 값으로 바뀝니다(비어 있으면 타일 비활성). '길게' 칸 = 타일 길게 누르기(대안 실행).</p>`
          : ''
      }
      <fieldset class="set-group">
        <legend>기본 설정 (펌웨어 첫 부팅 값)</legend>
        <div class="set-grid" data-ref="kmSettings"></div>
        <p class="set-hint">시뮬레이터의 현재 모드·OS·감도는 시계 화면에서 바꿉니다. 여기 값은 keymap.json 의 기본값입니다.</p>
      </fieldset>`;
    body.append(wrap);

    wrap.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        if (!b.dataset.mode || b.tagName !== 'BUTTON') return;
        kmMode = b.dataset.mode as ModeId;
        kmApp = app.state.apps[kmMode];
        render();
      }),
    );
    wrap.querySelectorAll<HTMLButtonElement>('[data-app]').forEach((b) =>
      b.addEventListener('click', () => {
        kmApp = b.dataset.app!;
        render();
      }),
    );

    const tbody = wrap.querySelector('tbody')!;
    appDef.actions.forEach((a, i) => {
      const base = `/modes/${kmMode}/apps/${kmApp}/actions/${i}`;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input class="set-input" type="text" data-k="label" aria-label="${esc(a.id)} 라벨" /></td>
        <td><input class="set-input set-chord" type="text" data-os="win" aria-label="${esc(a.label)} Windows 단축키" autocomplete="off" spellcheck="false" /></td>
        ${isLaunch ? `<td><input class="set-input set-chord" type="text" data-os="winAlt" aria-label="${esc(a.label)} Windows 길게" autocomplete="off" spellcheck="false" /></td>` : ''}
        <td><input class="set-input set-chord" type="text" data-os="mac" aria-label="${esc(a.label)} macOS 단축키" autocomplete="off" spellcheck="false" /></td>
        ${isLaunch ? `<td><input class="set-input set-chord" type="text" data-os="macAlt" aria-label="${esc(a.label)} macOS 길게" autocomplete="off" spellcheck="false" /></td>` : ''}
        <td class="set-km__mark" aria-live="polite"></td>`;
      const msg = document.createElement('tr');
      msg.className = 'set-km__msg';
      msg.innerHTML = `<td colspan="${ncol}"></td>`;
      tbody.append(tr, msg);
      if (isLaunch && a.url !== undefined) {
        // 업무포털 등: 매크로의 {url} 자리
        const urow = document.createElement('tr');
        urow.className = 'set-km__url';
        urow.innerHTML = `<td colspan="${ncol}"><label>주소(URL) <input class="set-input" type="url" data-k="url" placeholder="https://… (교육청 업무포털 주소)" spellcheck="false" aria-label="${esc(a.label)} 주소" /></label></td>`;
        tbody.append(urow);
        const u = urow.querySelector<HTMLInputElement>('[data-k="url"]')!;
        u.value = a.url ?? '';
        u.addEventListener('input', () => {
          if (/^[\x20-\x7E]{0,96}$/.test(u.value)) editValue(d, `${base}/url`, u.value, false);
        });
      }
      const mark = tr.querySelector<HTMLElement>('.set-km__mark')!;
      const msgCell = msg.querySelector('td')!;
      issueSlots.push({ t: 'row', prefix: base, el: msgCell, mark });

      const label = tr.querySelector<HTMLInputElement>('[data-k="label"]')!;
      label.value = a.label;
      label.addEventListener('input', () => editValue(d, `${base}/label`, label.value, false));
      formSync.push(() => {
        const v = getAt(d.check.value, `${base}/label`);
        if (document.activeElement !== label && typeof v === 'string') label.value = v;
      });

      for (const slot of isLaunch ? (['win', 'winAlt', 'mac', 'macAlt'] as const) : (['win', 'mac'] as const)) {
        const inp = tr.querySelector<HTMLInputElement>(`[data-os="${slot}"]`)!;
        const os: OsId = slot.startsWith('mac') ? 'mac' : 'win';
        bindChordInput(d, inp, `${base}/${slot}`, os);
        issueSlots.push({ t: 'input', prefix: `${base}/${slot}`, input: inp });
      }
    });

    // 기본 설정
    const st = wrap.querySelector<HTMLElement>('[data-ref="kmSettings"]')!;
    const modeOpts = modes.map((m) => [m, km.modes[m].name] as [string, string]);
    addField(d, st, { path: '/settings/deviceName', label: 'BLE 장치 이름', type: 'text', desc: 'UTF-8 최대 29바이트(한글 9자)' });
    addField(d, st, { path: '/settings/os', label: 'OS', type: 'select', options: [['win', 'Windows'], ['mac', 'macOS']] });
    addField(d, st, { path: '/settings/mode', label: '시작 모드', type: 'select', options: modeOpts });
    addField(d, st, {
      path: '/settings/sensitivity',
      label: '에어마우스 감도',
      type: 'select',
      options: (app.gesture.airMouse.sensitivity ?? []).map((s, i) => [i, `${i + 1} · ${s.name}`] as [number, string]),
    });
    addField(d, st, { path: '/settings/primaryButton', label: '주 측면 버튼', type: 'select', options: [['boot', 'BOOT'], ['pwr', 'PWR']] });

  };

  /** 단축키 입력칸: 포커스 → 키 조합 잡기 / 직접 타이핑 → parseChord */
  const bindChordInput = (d: Doc, inp: HTMLInputElement, path: string, os: OsId) => {
    const show = () => {
      const c = getAt(d.check.value, path) as Binding | null | undefined;
      return !c ? '' : isMacro(c) ? bindingSource(c) : formatChord(c, os);
    };
    /** 매크로 표기인가(단계 구분 ';' 또는 wait/text/consumer 단계) */
    const isMacroText = (t: string) => t.includes(';') || /^\s*(wait|text|consumer)\b/i.test(t);
    inp.value = show();
    let before = inp.value;
    const commit = (text: string, immediate: boolean) => {
      const t = text.trim();
      let err: string | null = null;
      if (os === 'mac' && /(^|\+|;)\s*win\s*(\+|$)/i.test(t)) err = 'macOS 칸에 Win 키는 쓸 수 없습니다(Cmd 를 쓰세요)';
      const pr = isMacroText(t) ? parseBinding(t) : parseChord(t);
      const r: { ok: true; value: Binding | null } | { ok: false; error: string } = pr.ok
        ? { ok: true, value: 'binding' in pr ? pr.binding : pr.chord }
        : pr;
      if (!err && !r.ok) err = r.error;
      if (err) {
        d.fieldErrors.set(path, err);
        inp.setAttribute('aria-invalid', 'true');
        renderStatus();
        renderIssues();
        return;
      }
      d.fieldErrors.delete(path);
      inp.removeAttribute('aria-invalid');
      if (r.ok) editValue(d, path, r.value, immediate);
    };
    inp.addEventListener('focus', () => {
      before = inp.value;
      inp.placeholder = '키를 누르세요…';
      inp.select();
    });
    inp.addEventListener('blur', () => {
      inp.placeholder = '';
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' || e.isComposing) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        inp.value = before;
        commit(before, true);
        inp.blur();
        return;
      }
      if (MODIFIER_CODES.test(e.code)) return; // 수정자만 누른 상태 — 다음 키를 기다림
      if (isMacroText(inp.value) && !e.ctrlKey && !e.altKey && !e.metaKey) return; // 매크로는 직접 타이핑
      const hasMod = e.ctrlKey || e.altKey || e.metaKey;
      const printable = e.key.length === 1 && !hasMod;
      // 글자 키(Shift 포함)와 Backspace/Delete 는 직접 타이핑으로 둔다
      if (printable || ((e.key === 'Backspace' || e.key === 'Delete') && !hasMod && !e.shiftKey)) return;
      const key = codeToKey(e.code);
      if (!key) return;
      e.preventDefault();
      e.stopPropagation();
      const mods: Chord['mods'] = [];
      if (e.ctrlKey) mods.push('ctrl');
      if (e.shiftKey) mods.push('shift');
      if (e.altKey) mods.push('alt');
      if (e.metaKey) mods.push('gui');
      const chord: Chord = { mods, key };
      inp.value = formatChord(chord, os);
      commit(inp.value, true);
      inp.select();
    });
    inp.addEventListener('input', () => commit(inp.value, false));
    formSync.push(() => {
      if (document.activeElement !== inp && !d.fieldErrors.has(path)) inp.value = show();
    });
  };

  type AnyField =
    | GField
    | { path: string; label: string; desc?: string; type: 'text' }
    | { path: string; label: string; desc?: string; type: 'list' };

  /** 일반 폼 칸 하나(라벨 · 입력 · 단위/설명 · 문제 표시) */
  const addField = (d: Doc, host: HTMLElement, f: AnyField) => {
    const id = `set-f-${d.kind}-${f.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const row = document.createElement('div');
    row.className = 'set-field';
    const sch = schemaAt(d.kind, f.path) ?? {};
    const min = typeof sch.minimum === 'number' ? sch.minimum : undefined;
    const max = typeof sch.maximum === 'number' ? sch.maximum : undefined;
    const unit = 'unit' in f && f.unit ? `<span class="set-unit">${esc(f.unit)}</span>` : '';
    const range = min !== undefined && max !== undefined ? `<span class="set-range-note">${min}~${max}</span>` : '';
    let control = '';
    switch (f.type) {
      case 'slider':
        control = `<input type="range" class="set-slider" ${min !== undefined ? `min="${min}"` : ''} ${max !== undefined ? `max="${max}"` : ''} step="${f.step ?? 1}" aria-label="${esc(f.label)} 슬라이더" />
          <input type="number" class="set-input set-num" id="${id}" ${min !== undefined ? `min="${min}"` : ''} ${max !== undefined ? `max="${max}"` : ''} step="${f.step ?? 1}" />${unit}`;
        break;
      case 'number':
        control = `<input type="number" class="set-input set-num" id="${id}" ${min !== undefined ? `min="${min}"` : ''} ${max !== undefined ? `max="${max}"` : ''} step="${f.step ?? 1}" />${unit}${range}`;
        break;
      case 'select':
        control = `<select class="set-input" id="${id}">${f.options.map(([v, l]) => `<option value="${esc(String(v))}">${esc(l)}</option>`).join('')}</select>`;
        break;
      case 'check':
        control = `<input type="checkbox" class="set-checkbox" id="${id}" />`;
        break;
      case 'text':
      case 'list':
        control = `<input type="text" class="set-input set-text" id="${id}" />`;
        break;
    }
    row.innerHTML = `<label class="set-field__label" for="${id}">${esc(f.label)}</label><div class="set-field__ctl">${control}</div>${
      f.desc ? `<p class="set-field__desc">${esc(f.desc)}</p>` : ''
    }<p class="set-field__msg"></p>`;
    host.append(row);
    const msg = row.querySelector<HTMLElement>('.set-field__msg')!;
    const main = row.querySelector<HTMLInputElement | HTMLSelectElement>(`#${CSS.escape(id)}`)!;
    issueSlots.push({ t: 'field', path: f.path, exact: f.type !== 'list', el: msg, input: main });
    const slider = row.querySelector<HTMLInputElement>('.set-slider');

    const read = () => getAt(d.check.value, f.path);
    const sync = () => {
      const v = read();
      if (f.type === 'check') (main as HTMLInputElement).checked = v === true;
      else if (f.type === 'list') {
        if (document.activeElement !== main) main.value = Array.isArray(v) ? v.join(', ') : '';
      } else if (document.activeElement !== main) main.value = v === undefined || v === null ? '' : String(v);
      if (slider && document.activeElement !== slider && typeof v === 'number') slider.value = String(v);
    };
    sync();
    formSync.push(sync);

    const numErr = (on: string | null) => {
      if (on) {
        d.fieldErrors.set(f.path, on);
        main.setAttribute('aria-invalid', 'true');
      } else {
        d.fieldErrors.delete(f.path);
        main.removeAttribute('aria-invalid');
      }
    };
    const fromNumber = (raw: string, immediate: boolean) => {
      if (raw.trim() === '' || !Number.isFinite(Number(raw))) {
        numErr('숫자를 입력하세요');
        renderStatus();
        renderIssues();
        return;
      }
      numErr(null);
      editValue(d, f.path, Number(raw), immediate);
    };
    switch (f.type) {
      case 'slider':
      case 'number':
        main.addEventListener('input', () => {
          if (slider && Number.isFinite(Number(main.value))) slider.value = main.value;
          fromNumber(main.value, false);
        });
        slider?.addEventListener('input', () => {
          main.value = slider.value;
          fromNumber(slider.value, true);
        });
        break;
      case 'select':
        main.addEventListener('change', () => {
          const opt = f.options.find(([v]) => String(v) === main.value);
          if (opt) editValue(d, f.path, opt[0], true);
        });
        break;
      case 'check':
        main.addEventListener('change', () => editValue(d, f.path, (main as HTMLInputElement).checked, true));
        break;
      case 'text':
        main.addEventListener('input', () => editValue(d, f.path, main.value, false));
        break;
      case 'list':
        main.addEventListener('input', () =>
          editValue(
            d,
            f.path,
            main.value
              .split(/[,，]/)
              .map((s) => s.trim())
              .filter((s, i, arr) => s.length > 0 || arr.length === 1),
            false,
          ),
        );
        break;
    }
  };

  // ---- gesture 폼
  const renderGestureForm = (d: Doc) => {
    const wrap = document.createElement('div');
    wrap.className = 'set-form';
    const g = d.check.value as GestureConfig;
    for (const grp of GESTURE_GROUPS) {
      const fs = document.createElement('fieldset');
      fs.className = 'set-group';
      fs.innerHTML = `<legend>${esc(grp.title)}</legend><div class="set-grid"></div>`;
      const grid = fs.querySelector<HTMLElement>('.set-grid')!;
      for (const f of grp.fields) {
        // 감도 단계 라벨은 설정 값의 이름을 쓴다
        const m = /^\/airMouse\/sensitivity\/(\d)\/gain$/.exec(f.path);
        const name = m ? g.airMouse?.sensitivity?.[Number(m[1])]?.name : null;
        addField(d, grid, name ? { ...f, label: `감도 ${Number(m![1]) + 1} · ${name}` } : f);
      }
      wrap.append(fs);
    }
    const note = document.createElement('p');
    note.className = 'set-hint';
    note.textContent = '터치·시트·타이밍 값(touch, timing)과 바이어스 보정(imu.biasCalib)은 JSON 원문 탭에서 고칩니다.';
    wrap.append(note);
    body.append(wrap);
  };

  // ---- JSON 원문
  let jsonRefs: { ta: HTMLTextAreaElement; gutter: HTMLElement; list: HTMLElement } | null = null;
  const renderJson = (d: Doc) => {
    const wrap = document.createElement('div');
    wrap.className = 'set-json';
    wrap.innerHTML = `
      <div class="set-editor">
        <div class="set-gutter" aria-hidden="true"></div>
        <textarea class="set-ta" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="${kind}.json 원문"></textarea>
      </div>
      <div class="set-errlist" role="list" aria-label="오류·경고 목록"></div>`;
    body.append(wrap);
    const ta = wrap.querySelector<HTMLTextAreaElement>('textarea')!;
    const gutter = wrap.querySelector<HTMLElement>('.set-gutter')!;
    const list = wrap.querySelector<HTMLElement>('.set-errlist')!;
    jsonRefs = { ta, gutter, list };
    ta.value = d.text;
    ta.addEventListener('input', () => {
      setText(d, ta.value, false);
      renderGutter();
    });
    ta.addEventListener('scroll', () => {
      gutter.scrollTop = ta.scrollTop;
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        const s = ta.selectionStart;
        ta.setRangeText('  ', s, ta.selectionEnd, 'end');
        ta.dispatchEvent(new Event('input'));
      }
    });
    renderGutter();
  };
  const renderGutter = () => {
    if (!jsonRefs || !jsonRefs.ta.isConnected) return;
    const d = docs[kind];
    const lines = jsonRefs.ta.value.split('\n').length;
    const bad = new Set(d.check.issues.filter((i) => i.level === 'error' && i.line).map((i) => i.line!));
    let html = '';
    for (let i = 1; i <= lines; i++) html += `<div class="set-gutter__ln${bad.has(i) ? ' is-err' : ''}">${bad.has(i) ? '● ' : ''}${i}</div>`;
    jsonRefs.gutter.innerHTML = html;
    jsonRefs.gutter.scrollTop = jsonRefs.ta.scrollTop;
  };
  const focusLine = (is: Issue) => {
    if (!jsonRefs || !jsonRefs.ta.isConnected || !is.line) return;
    const ta = jsonRefs.ta;
    const lines = ta.value.split('\n');
    let off = 0;
    for (let i = 0; i < is.line - 1 && i < lines.length; i++) off += lines[i].length + 1;
    off += Math.max(0, (is.col ?? 1) - 1);
    ta.focus();
    ta.setSelectionRange(off, off);
    const lh = 20;
    ta.scrollTop = Math.max(0, (is.line - 3) * lh);
  };

  // ---------------------------------------------------------------- 문제 표시
  const renderIssues = () => {
    const d = docs[kind];
    const all: Issue[] = [
      ...[...d.fieldErrors].map(([path, message]) => ({ level: 'error' as const, path, message })),
      ...d.check.issues,
    ];
    // 폼
    const under = (prefix: string, exact: boolean) =>
      all.filter((i) => (exact ? i.path === prefix : i.path === prefix || i.path.startsWith(`${prefix}/`)));
    const msgs = (list: Issue[]) =>
      list.map((i) => `<span class="set-msg set-msg--${i.level}">${i.level === 'error' ? '●' : '▲'} ${esc(i.message)}</span>`).join('');
    const markInput = (input: HTMLElement, list: Issue[]) => {
      const e = list.some((i) => i.level === 'error');
      if (e) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
      input.classList.toggle('is-warn', !e && list.length > 0);
    };
    for (const s of issueSlots) {
      if (s.t === 'row') {
        const mine = under(s.prefix, false);
        s.el.innerHTML = msgs(mine);
        const e = mine.some((i) => i.level === 'error');
        s.mark.textContent = e ? '●' : mine.length ? '▲' : '';
        s.mark.className = `set-km__mark${e ? ' is-err' : mine.length ? ' is-warn' : ''}`;
        s.mark.title = mine.map((i) => i.message).join(' / ');
      } else if (s.t === 'input') {
        markInput(s.input, under(s.prefix, false));
      } else {
        const mine = under(s.path, s.exact);
        s.el.innerHTML = msgs(mine);
        markInput(s.input, mine);
      }
    }
    for (const fn of formSync) fn();
    // 원문 오류 목록
    if (jsonRefs && jsonRefs.list.isConnected) {
      const list = d.check.issues;
      jsonRefs.list.innerHTML = list.length
        ? list
            .map(
              (i, n) =>
                `<button type="button" role="listitem" class="set-err set-err--${i.level}" data-n="${n}">${i.level === 'error' ? '●' : '▲'} ${
                  i.line ? `줄 ${i.line}:${i.col ?? 1} · ` : ''
                }${esc(i.message)}${i.path ? ` <span class="set-err__path">${esc(i.path)}</span>` : ''}</button>`,
            )
            .join('')
        : '<p class="set-hint">문제 없음</p>';
      jsonRefs.list.querySelectorAll<HTMLButtonElement>('[data-n]').forEach((b) => b.addEventListener('click', () => focusLine(list[Number(b.dataset.n)])));
      renderGutter();
    }
  };

  // ---------------------------------------------------------------- 도구 버튼
  tabs.forEach((t) =>
    t.addEventListener('click', () => {
      kind = t.dataset.kind as ConfigKind;
      render();
    }),
  );
  viewBtns.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view as View)));

  exportBtn.addEventListener('click', () => {
    const d = docs[kind];
    if (errorCount(d) > 0 || !d.check.value) return;
    const text = toJsonText(d.check.value);
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${kind}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    d.exported = text;
    store.set(EXPORT_KEY(kind), text);
    renderStatus();
    toast(`저장소 /shared/${kind}.json 에 덮어쓰고 커밋하면 펌웨어 빌드에 반영됩니다.`);
  });

  const importText = async (text: string, name: string) => {
    const guess: ConfigKind | null = /"modes"\s*:/.test(text) ? 'keymap' : /"flick"\s*:/.test(text) ? 'gesture' : null;
    const k = guess ?? kind;
    const d = docs[k];
    const chk = checkText<Cfg>(k, text);
    kind = k;
    if (chk.errors > 0) {
      // 오류가 있는 파일은 원문 탭에 열어 주되 반영하지 않는다
      view = 'json';
      d.fieldErrors.clear();
      setText(d, text, true);
      render();
      toast(`${name}: 오류 ${chk.errors}개 — 반영하지 않았습니다. 원문에서 고치세요.`);
      return;
    }
    const n = countChanges(d.check.value ?? app.config[k], chk.value);
    const ok = await confirmDlg(`${name} → ${k}.json · 변경 ${n}곳 · 오류 0개${chk.warnings ? ` · 경고 ${chk.warnings}개` : ''} — 가져올까요?`, '가져오기');
    if (!ok) {
      render();
      return;
    }
    d.fieldErrors.clear();
    setText(d, text, true);
    render();
    toast(`${name} 을(를) 가져와 적용했습니다.`);
  };
  importIn.addEventListener('change', async () => {
    const f = importIn.files?.[0];
    importIn.value = '';
    if (!f) return;
    try {
      await importText(await f.text(), f.name);
    } catch (err) {
      toast(`파일을 읽지 못했습니다: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  // 끌어다 놓기
  panel.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    panel.classList.add('is-drop');
  });
  panel.addEventListener('dragleave', (e) => {
    if (e.target === panel || !panel.contains(e.relatedTarget as Node)) panel.classList.remove('is-drop');
  });
  panel.addEventListener('drop', async (e) => {
    panel.classList.remove('is-drop');
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    e.preventDefault();
    try {
      await importText(await f.text(), f.name);
    } catch (err) {
      toast(`파일을 읽지 못했습니다: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  $('reset').addEventListener('click', async () => {
    const ok = await confirmDlg(`${kind}.json 을(를) 저장소 기본값(/shared/${kind}.json)으로 되돌릴까요? 지금 편집한 내용은 사라집니다.`, '되돌리기');
    if (!ok) return;
    const d = docs[kind];
    d.fieldErrors.clear();
    applying = true;
    try {
      app.resetConfig(kind);
    } finally {
      applying = false;
    }
    setText(d, defaultsText[kind], true);
    render();
    toast('기본값으로 되돌렸습니다.');
  });

  // ---------------------------------------------------------------- 열기·닫기
  let lastFocus: Element | null = null;
  const handle: SettingsHandle = {
    open() {
      if (!root.hidden) return;
      lastFocus = document.activeElement;
      root.hidden = false;
      // 닫힌 위치를 한 번 계산시킨 뒤 열림 클래스 → 미끄러져 들어옴(rAF 에 기대지 않음)
      void panel.offsetWidth;
      root.classList.add('is-open');
      render();
      root.querySelector<HTMLElement>('.set-close')?.focus();
    },
    close() {
      if (root.hidden) return;
      root.classList.remove('is-open');
      graph.setActive(false);
      root.hidden = true;
      if (lastFocus instanceof HTMLElement) lastFocus.focus();
    },
    get isOpen() {
      return !root.hidden;
    },
  };
  root.querySelector('.set-close')!.addEventListener('click', () => handle.close());
  // 바깥(어두운 면) 클릭 = 닫기 (좁은 화면 전체 덮개일 때만 면이 있다)
  root.addEventListener('click', (e) => {
    if (e.target === root) handle.close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !handle.isOpen || dialog.open) return;
    const a = document.activeElement;
    if (a instanceof HTMLTextAreaElement || (a instanceof HTMLElement && a.classList.contains('set-chord'))) return; // JSON 편집기·키 잡기 중
    handle.close();
  });

  return handle;
}
