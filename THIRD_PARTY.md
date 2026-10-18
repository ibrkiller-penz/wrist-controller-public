# 서드파티 고지

이 저장소의 코드·문서는 [MIT](LICENSE) 다. 아래 구성 요소는 각자의 라이선스를 따른다.
'포함' = 이 저장소나 빌드 결과물(시계 펌웨어 .bin, 웹앱 dist)에 들어간다. '빌드 때만' = 결과물에 들어가지 않는다.

## 글꼴

| 구성 요소 | 버전 | 라이선스 | 어디에 | 비고 |
| --- | --- | --- | --- | --- |
| [Pretendard](https://github.com/orioncactus/pretendard) (Kil Hyung-jin) | 1.3.9 | SIL Open Font License 1.1, 예약 글꼴 이름 "Pretendard" | 포함: 원본 `tools/fonts/pretendard/*.otf`, 서브셋 `sim/src/watch/fonts/*.woff2`, LVGL 비트맵 `firmware/main/fonts/kr_*.c`·`num_128.c` | 라이선스 전문: `tools/fonts/pretendard/LICENSE.txt`. 서브셋은 OFL 의 '수정본'이다(아래 주의) |

> 주의(OFL 예약 이름): 서브셋·변환본은 예약 글꼴 이름 "Pretendard" 를 글꼴 이름으로 쓰면 안 된다. 웹 CSS 이름이 `WC Pretendard` 이므로 공개 전 `WC Sans` 처럼 바꾸거나 woff2 내부 이름을 확인하는 것을 권한다.

## 시계 펌웨어(ESP32-C6)

| 구성 요소 | 버전 | 라이선스 | 어디에 |
| --- | --- | --- | --- |
| [ESP-IDF](https://github.com/espressif/esp-idf) (NimBLE·esp_hid·FreeRTOS 포함) | 5.5.5 | Apache-2.0 (구성 요소별 고지는 ESP-IDF 저장소) | 포함(.bin) |
| [LVGL](https://github.com/lvgl/lvgl) | 9.5.0 | MIT | 포함 |
| [Waveshare BSP `waveshare/esp32_c6_touch_amoled_2_06`](https://components.espressif.com/components/waveshare/esp32_c6_touch_amoled_2_06) | 2.0.0 | Apache-2.0 (컴포넌트 레지스트리 라이선스 페이지 확인) | 포함 |
| BSP 가 끌어오는 `waveshare/esp_lcd_sh8601`, `espressif/esp_lvgl_port`, `espressif/esp_lcd_touch`, `espressif/esp_lcd_touch_ft5x06`, `espressif/esp_codec_dev`, `esp_lcd_panel_io_additions` | 빌드 때 생기는 `dependencies.lock` | Apache-2.0 (레지스트리 표기 — 릴리스 전 `managed_components/*/LICENSE` 로 최종 확인) | 포함 |
| [Waveshare ESP32-C6-Touch-AMOLED-2.06 예제](https://github.com/waveshareteam/ESP32-C6-Touch-AMOLED-2.06) | — | Apache-2.0 | 참고만(핀 표·버전 근거). 코드를 복사하지 않음 |
| [xiaozhi-esp32 보드 정의](https://github.com/78/xiaozhi-esp32) | — | MIT | 참고만(버튼·전원 동작 근거) |

## 웹앱(sim)

| 구성 요소 | 버전 | 라이선스 | 어디에 |
| --- | --- | --- | --- |
| [Ajv](https://github.com/ajv-validator/ajv) + fast-deep-equal, json-schema-traverse, require-from-string | 8.20.0 | MIT | 포함(설정 화면 JSON 검사) |
| [fast-uri](https://github.com/fastify/fast-uri) (Ajv 의존성) | 3.1.8 | BSD-3-Clause | 포함 |
| [workbox-window](https://github.com/GoogleChrome/workbox) / Workbox 서비스워커 | 7.4.1 | MIT | 포함(오프라인 캐시) |
| [vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa) | 1.3.0 | MIT | 빌드 때만 |
| [Vite](https://vitejs.dev/) · [Vitest](https://vitest.dev/) | 6.4 · 3.2 | MIT | 빌드·테스트 때만 |
| [TypeScript](https://www.typescriptlang.org/) | 5.9 | Apache-2.0 | 빌드 때만 |
| [ESP Web Tools](https://github.com/esphome/esp-web-tools) | 10.1.1 | Apache-2.0 | 설치 페이지가 실행 중 unpkg 에서 불러옴(저장소에 없음) |

## 도구·테스트

| 구성 요소 | 버전 | 라이선스 | 어디에 |
| --- | --- | --- | --- |
| [lv_font_conv](https://github.com/lvgl/lv_font_conv) | 1.5.3 | MIT | 빌드 때만(`tools/fonts`) |
| [nlohmann/json](https://github.com/nlohmann/json) | 3.11.3 | MIT | 호스트 테스트 때만(CMake FetchContent) |
| [esptool](https://github.com/espressif/esptool) | 5.x | GPL-2.0-or-later | 사용자가 따로 설치해 실행(저장소에 없음) |
| [espressif/esp-idf-ci-action](https://github.com/espressif/esp-idf-ci-action) | — | MIT | CI 때만 |

## 참고 자료

단축키 표·하드웨어 정보는 각 제조사 공식 도움말에서 사실만 옮겼고 출처는 `docs/research/*.md` 에 있다. USB HID Usage Tables 1.5(usb.org)의 사용 코드 값을 `shared/hid-usage.json` 에 썼다.

## 에스코어 드림(S-Core Dream) — 따라 하기 안내서 글꼴

- 굵기 3 Light·4 Regular·5 Medium 만 사용. 글꼴 파일은 이 저장소에 포함하지 않고 jsDelivr 의 눈누(projectnoonnu/noonfonts_six@1.2) 사본을 웹에서 읽는다.
- 라이선스: 에스코어 제공 무료 글꼴(상업 이용 가능). 재배포·판매 조건은 에스코어 공식 안내를 따른다(https://s-core.co.kr/company/font/ — 공개 전 최신 조건 확인).
