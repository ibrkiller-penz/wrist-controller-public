/// <reference types="vite-plugin-pwa/client" />
/**
 * 설치형 웹앱(PWA) 서비스워커 등록 — index.html(main.ts)·install.html(install.ts) 에서 부른다.
 * - 빌드 자산은 서비스워커가 미리 받아 두어 인터넷 없이도 열린다(vite.config.ts 의 VitePWA 설정).
 * - 새 버전이 올라오면 바로 바꾸지 않고 화면 아래에 안내 → [새로고침] 을 누르면 적용.
 * - 개발 서버(npm run dev)에서는 서비스워커를 쓰지 않는다.
 * - ESP Web Tools 는 여전히 인터넷이 필요하다(각 화면의 기존 안내 그대로).
 */
import { registerSW } from 'virtual:pwa-register';

export function setupPWA(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  const updateSW = registerSW({
    onNeedRefresh() {
      showBar('새 버전이 있습니다.', '새로고침', () => void updateSW(true));
    },
    onOfflineReady() {
      showBar('이제 인터넷 없이도 열 수 있습니다.', null, null, 5000);
    },
  });
}

function showBar(text: string, actionLabel: string | null, onAction: (() => void) | null, autoHideMs = 0): void {
  document.getElementById('pwa-bar')?.remove();
  const bar = document.createElement('div');
  bar.id = 'pwa-bar';
  bar.setAttribute('role', 'status');
  bar.style.cssText =
    'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999;display:flex;gap:12px;align-items:center;' +
    'max-width:calc(100% - 32px);padding:10px 14px;border-radius:10px;background:#1c1c1e;color:#fff;' +
    'border:1px solid #3a3a3c;font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4)';
  const msg = document.createElement('span');
  msg.textContent = text;
  bar.append(msg);
  const btnStyle = 'border:0;border-radius:6px;padding:6px 10px;font:inherit;cursor:pointer';
  if (actionLabel && onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = actionLabel;
    btn.style.cssText = btnStyle + ';background:#FF8A1F;color:#000;font-weight:600';
    btn.addEventListener('click', onAction);
    bar.append(btn);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '닫기';
  close.setAttribute('aria-label', '안내 닫기');
  close.style.cssText = btnStyle + ';background:transparent;color:#aaa';
  close.addEventListener('click', () => bar.remove());
  bar.append(close);
  document.body.append(bar);
  if (autoHideMs > 0) setTimeout(() => bar.remove(), autoHideMs);
}
