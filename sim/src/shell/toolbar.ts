/**
 * 상단 툴바 — 담당: 개발 리드. 명세: design/simulator-layout.md 3장.
 * 브랜드(모드색 점) · [입력 모듈 자리] · 테마 순환 · BLE 연결 토글(시뮬레이션 전용) · 설정 · 시계에 설치 링크.
 */
import type { App } from '../app';

export interface ToolbarSlots {
  /** 입력 모듈(세그먼트)이 채울 자리 */
  inputSlot: HTMLElement;
}

export interface ToolbarHandlers {
  openSettings(): void;
}

const THEMES = ['auto', 'light', 'dark'] as const;
type Theme = (typeof THEMES)[number];
const THEME_LABEL: Record<Theme, string> = { auto: '자동', light: '라이트', dark: '다크' };
const THEME_KEY = 'wrist-sim.theme';

function applyTheme(t: Theme) {
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

export function mountToolbar(root: HTMLElement, app: App, handlers: ToolbarHandlers): ToolbarSlots {
  root.classList.add('sim-toolbar');
  root.setAttribute('role', 'toolbar');
  root.setAttribute('aria-label', '시뮬레이터 도구');
  root.innerHTML = `
    <div class="sim-brand" data-mode="${app.state.mode}">
      <span class="sim-brand__dot" aria-hidden="true"></span>
      <span>손목 컨트롤러</span><span class="sim-brand__sub">시뮬레이터</span>
    </div>
    <div class="sim-toolbar__slot" data-slot="input"></div>
    <div class="sim-toolbar__spacer"></div>
    <button type="button" class="sim-btn sim-conn" data-connected="true" aria-pressed="true" title="BLE 연결 상태 흉내(누르면 끊김/연결)">BLE 연결됨</button>
    <button type="button" class="sim-btn sim-theme" title="테마: 자동 → 라이트 → 다크">테마: 자동</button>
    <button type="button" class="sim-btn sim-settings" aria-label="설정"><svg aria-hidden="true"><use href="#i-gear"/></svg></button>
    <a class="sim-link" href="./guide.html">따라 하기</a>
    <a class="sim-link" href="https://github.com/ibrkiller-penz/wrist-controller-public" target="_blank" rel="noopener">소스(GitHub)</a>
    <a class="sim-link" href="./install.html">시계에 설치 →</a>`;

  const brand = root.querySelector<HTMLElement>('.sim-brand')!;
  const conn = root.querySelector<HTMLButtonElement>('.sim-conn')!;
  const themeBtn = root.querySelector<HTMLButtonElement>('.sim-theme')!;

  let theme: Theme = 'auto';
  try {
    const saved = localStorage.getItem(THEME_KEY) as Theme | null;
    if (saved && THEMES.includes(saved)) theme = saved;
  } catch {
    /* 무시 */
  }
  const renderTheme = () => {
    applyTheme(theme);
    themeBtn.textContent = `테마: ${THEME_LABEL[theme]}`;
  };
  renderTheme();
  themeBtn.addEventListener('click', () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* 무시 */
    }
    renderTheme();
  });

  conn.addEventListener('click', () => app.toggleConnected());
  root.querySelector('.sim-settings')!.addEventListener('click', () => handlers.openSettings());

  const render = () => {
    const s = app.state;
    brand.dataset.mode = s.mode;
    conn.dataset.connected = String(s.connected);
    conn.setAttribute('aria-pressed', String(s.connected));
    conn.textContent = s.connected ? 'BLE 연결됨' : 'BLE 끊김';
  };
  render();
  app.subscribe(render);

  return { inputSlot: root.querySelector<HTMLElement>('[data-slot="input"]')! };
}
