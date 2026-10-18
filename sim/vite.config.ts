/// <reference types="vitest" />
// Vite 설정 — ../shared(keymap·gesture·테스트 벡터)와 ../design(아이콘) 을 import 할 수 있게 연다.
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));

// base: 기본은 상대 경로('./') — 어느 주소(https://watchpeter.web.app/ 루트 등)에서도, dist 를 그대로 열어도 동작.
// 하위 경로에 올릴 때만 SIM_BASE=/경로/ 로 지정한다. 코드의 fetch 는 모두 상대 경로라 base 를 따라간다.
const base = process.env.SIM_BASE ?? './';

export default defineConfig({
  base,
  plugins: [
    // 설치형 웹앱(PWA): manifest(<link rel=manifest> 는 플러그인이 html 에 자동 삽입) + 서비스워커(빌드 자산 프리캐시 → 오프라인 동작).
    // 새 버전은 자동으로 바꾸지 않고 화면에 안내(src/pwa.ts) → 사용자가 [새로고침] 을 누르면 적용.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false, // 등록은 src/pwa.ts 에서 직접
      includeManifestIcons: false, // 아이콘은 아래 globPatterns 로 이미 프리캐시(중복 방지)
      manifest: {
        name: '손목 컨트롤러',
        short_name: '손목컨트롤러',
        description: '손목 컨트롤러(ESP32 AMOLED 시계) 웹 시뮬레이터와 시계 설치 페이지',
        lang: 'ko',
        start_url: base,
        scope: base,
        display: 'standalone',
        theme_color: '#000000',
        background_color: '#000000',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,csv,webmanifest,woff2}'],
        // 펌웨어 버전 목록·설치 파일은 늘 최신을 받아야 하므로 프리캐시하지 않는다(네트워크 우선, 오프라인이면 마지막 사본).
        globIgnores: ['firmware/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/firmware/') && url.pathname.endsWith('.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'firmware-json', networkTimeoutSeconds: 5 },
          },
        ],
        // 멀티 페이지: 없는 주소를 index.html 로 돌리지 않는다(install.html·guide.html 은 프리캐시된 실제 파일로 응답).
        navigateFallback: null,
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@shared': resolve(here, '../shared'),
      '@design': resolve(here, '../design'),
      '@': resolve(here, 'src'),
    },
  },
  server: {
    host: true,
    fs: {
      // 저장소 루트(../shared, ../design)까지 dev 서버가 읽을 수 있게 허용
      allow: [resolve(here, '..')],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(here, 'index.html'),
        install: resolve(here, 'install.html'),
        guide: resolve(here, 'guide.html'), // 따라 하기 안내서
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
