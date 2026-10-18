/**
 * "따라 하기" 안내서 페이지(guide.html) — 시계를 산 교사·학생(코딩 초보)용 단계별 안내.
 * 내용은 guide.html 에 정적으로 적혀 있다(자바스크립트가 꺼져도 읽힌다). 여기서는
 *  - 공통 색·글꼴(tokens.css·base.css)과 안내서 스타일을 불러오고
 *  - 시뮬레이터에서 고른 테마(라이트/다크)를 따르고
 *  - 설치형 웹앱(PWA) 서비스워커를 등록하고(오프라인에서도 열림)
 *  - 명령 '복사' 버튼을 붙인다.
 * 판정값(0.36초 등)은 guide.html 의 data-g 표시와 shared/gesture.json 이 같은지 guide.test.ts 가 검사한다.
 */
import '../styles/tokens.css';
import '../styles/base.css';
import './guide.css';
import { setupPWA } from '../pwa';

setupPWA();

try {
  const t = localStorage.getItem('wrist-sim.theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch {
  /* 저장소를 못 쓰면 OS 설정을 따른다 */
}

for (const pre of document.querySelectorAll<HTMLElement>('pre.gd-cmd')) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'gd-copy';
  btn.textContent = '복사';
  btn.setAttribute('aria-label', '명령 복사');
  btn.addEventListener('click', () => {
    const text = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
    navigator.clipboard?.writeText(text.trim()).then(
      () => {
        btn.textContent = '복사됨';
        setTimeout(() => (btn.textContent = '복사'), 1500);
      },
      () => {
        btn.textContent = '직접 선택해 복사하세요';
      },
    );
  });
  const wrap = document.createElement('div');
  wrap.className = 'gd-cmdwrap';
  pre.replaceWith(wrap);
  wrap.append(pre, btn);
}
