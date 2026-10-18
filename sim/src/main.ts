/**
 * 시뮬레이터 진입점 — 담당: 개발 리드.
 * App 하나를 만들고 각 모듈에 자리(root)를 나눠 준다. 모듈끼리는 서로 import 하지 않고 App 으로만 이야기한다.
 */
import './styles/tokens.css';
import './styles/base.css';
import './shell/shell.css';
import iconSprite from '@design/icons.svg?raw';
import { App } from './app';
import { mountToolbar } from './shell/toolbar';
import { mountWatch } from './watch/watch';
import { mountPC } from './pc/pc';
import { mountHidLog } from './pc/hidLog';
import { mountInputPanel } from './input/inputPanel';
import { mountSettings } from './settings/settingsPanel';
import { setupPWA } from './pwa';

// 아이콘 스프라이트를 본문 맨 앞에 인라인 → 어디서나 <svg><use href="#i-save"/></svg>
document.body.insertAdjacentHTML('afterbegin', iconSprite);

const $ = (id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 가 index.html 에 없습니다`);
  return el;
};

const app = new App();

const settings = mountSettings($('settings-root'), app);
const toolbar = mountToolbar($('toolbar'), app, { openSettings: () => settings.open() });
mountWatch($('watch-root'), app);
mountInputPanel({ panel: $('input-root'), toolbar: toolbar.inputSlot, notice: $('notice-root') }, app);
mountPC($('pc-root'), app);
mountHidLog($('log-root'), app);

app.start();

// 설치형 웹앱: 서비스워커 등록(오프라인 캐시·새 버전 안내) — 배포 빌드에서만
setupPWA();

// 개발 편의: 브라우저 콘솔에서 window.app 으로 상태 확인 (?debug=1 일 때만)
if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { app: App }).app = app;
}
