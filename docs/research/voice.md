> **제거 (2026-10-17, 최종 결정)**: 음성 기능 전체(WakeNet·마이크·누르고 말하기·본인 목소리 next)를 펌웨어·시뮬레이터·공유 설정에서 뺐다. C6(PSRAM 없음) 메모리가 빠듯하기 때문이다. 이 문서는 조사 기록으로만 남긴다. 나중 계획: [gemini-later.md](gemini-later.md)

> **사용자 결정 (2026-10-16)**: 방식 A-C6(공개 영어 호출어 "Hi ESP" = 다음 슬라이드)로 먼저 진행하고, 방식 C(버튼 누르는 동안만 듣기)를 함께 둔다. 설정: `shared/keymap.json` voice.engine="wakeWord", voice.listen="always"|"pushToTalk", voice.pushToTalkButton="pwr"; 시간값은 `shared/gesture.json` timing.pushToTalk*(300ms 누르면 듣기, 뗀 뒤 1.5초까지 결과 수용, 3.5초에 끊음 — PWR 전원 차단 약 4초 전). 한국어 "키트, 다음"(방식 B)은 engine="wakePlusCommand" 로 남겨 두되 사용자 승인 전에는 쓰지 않는다.

# 음성 "다음" 조사 보고서 — ESP32-C6 기준 재작성

> **재작성 표기 (2026-10-16)**: 이 문서는 처음에 ESP32-S3 보드(ESP32-S3-Touch-AMOLED-2.06, 8MB PSRAM) 기준으로 쓰였다. 원래 펌웨어 백업(`backup/original_xiaozhi_esp32c6_16MB.bin`)으로 **실제 칩이 ESP32-C6**임이 확인되어 전체를 C6 기준으로 다시 썼다. S3 기준 조사 중 칩과 무관하게 유효한 사실(ESP-SR 언어 지원, 커스텀 호출어 정책, Edge Impulse 데이터량)은 7장에 요약해 남겼다.

- 조사일: 2026-10-16
- 기준 문서: `손목컨트롤러_작업지시서.md`의 「음성 "다음" 구현 전략」
- 표기 규칙: 공식 문서·코드·백업 파일로 확인한 사실에는 출처를 달았다. 확인하지 못한 내용은 **미확인**, 계산·추론한 값은 **추정**으로 표시했다.

---

## 0. 핵심 결론

1. **ESP32-C6에서는 ESP-SR의 명령어 인식(MultiNet)과 음성 전처리(AFE)를 쓸 수 없다.** MultiNet은 ESP32-S3·P4·S31 전용, AFE는 ESP32·S3·P4·S31 전용이다. C6에서 쓸 수 있는 것은 **호출어 엔진(WakeNet9s / WakeNet10s)뿐**이다.
2. 따라서 작업지시서의 방식 A("Hi ESP" 호출어 → MultiNet "next slide")는 **C6에서 그대로는 불가능**하다. C6용으로 바꾼 방식 A는 **"호출어 하나 = 다음 슬라이드" 한 단계 구조**가 된다(예: "Hi ESP"라고 말하면 넘김).
3. 원래 펌웨어(샤오즈 1.8.5)도 이 시계에서 **로컬에서는 호출어 "你好小智"(WakeNet9s)만 듣고**, 실제 말 인식은 Wi-Fi로 서버(MQTT/WebSocket + Opus 압축)에 보낸다. AFE 없이(`NoAudioProcessor`) 마이크 원음을 WakeNet에 바로 넣는다. → **C6 + 이 보드 마이크로 WakeNet9s가 실제로 동작함은 확인됨.**
4. 한국어: WakeNet10 공개 언어는 중·영·일·불·독·서·포·러 8개로 **한국어 없음**. 한국어 "키트, 다음"을 쓰려면 **방식 B(직접 학습한 키워드 모델, TFLite Micro)** 밖에 없다.
5. 방식 B는 C6에서 **계산량·메모리 면에서는 가능하다고 추정**한다(DS-CNN 소형 모델 38.6KB, 추론당 5.4M 연산). 단, C6용 ESP-NN 가속 최적화는 공식 목록에 없고, Edge Impulse는 C6를 공식 지원하지 않으며, AFE가 없어 잡음 억제를 직접 해결해야 한다. 작업량과 불확실성이 S3보다 크다.
6. 마이크 경로는 **ES7210 ADC → I2S(STD/TDM)** 이며 PDM 마이크 직결이 아니다. C6에는 PDM→PCM 하드웨어 변환기가 없지만 이 보드에는 영향이 없다. 다만 C6는 **I2S가 1개**뿐이라 ES8311(재생)과 ES7210(녹음)이 한 채널을 공유한다.
7. PC 쪽 인식은 작업지시서가 **PC에 프로그램 설치를 금지**하므로 제외한다. 브라우저 음성 인식은 웹 페이지가 PowerPoint에 키 입력을 보낼 수 없어 쓸 수 없다. 휴대폰 쪽 인식은 이론상 가능하지만 인터넷과 연결 구조가 복잡해져 권장하지 않는다.
8. **권장안**: (1) 방식 A-C6(공개 영어 호출어 하나로 "다음"만 넘김)으로 음성 흐름을 먼저 완성하고 판정 기준으로 시험, (2) 방식 C(버튼 누르는 동안만 듣기)는 항상 함께 둠, (3) 한국어가 꼭 필요하면 사용자 승인 후 방식 B.
9. **사용자에게 물어야 할 결정**은 6장에 정리했다(영어 호출어 수용 여부, 한국어 필수 여부와 B 승인, 음성으로는 "다음"만 할지 등).

---

## 1. ESP-SR의 ESP32-C6 지원 범위

### 1.1 공식 지원 칩 목록 (esp-sr 2.6.0)

| 엔진 | 지원 칩 | C6 | 출처 |
| --- | --- | --- | --- |
| WakeNet (호출어) | ESP32, S2, S3, S31, P4, C3, C5, **C6** | **가능** | https://github.com/espressif/esp-sr , https://components.espressif.com/components/espressif/esp-sr/versions/2.6.0/readme |
| MultiNet (명령어) | ESP32-S3, P4, S31 | **불가** | 위와 같음 |
| AFE (잡음 억제·에코 제거·빔포밍) | ESP32, S3, P4, S31 | **불가** | 위와 같음 |

- ESP-SR 공식 문서 사이트에는 C6용 페이지가 없다(`.../esp-sr/en/latest/esp32c6/...` 주소가 404). 문서는 S3·P4 기준으로만 제공된다.
  출처: https://docs.espressif.com/projects/esp-sr/en/latest/esp32s3/wake_word_engine/README.html (S3 문서는 있음), C6 경로는 404 확인

### 1.2 C6에서 쓸 수 있는 WakeNet 모델

| 모델 | 내용 | 출처 |
| --- | --- | --- |
| WakeNet9s | README는 "PSRAM이 없고 SIMD가 없는 칩(ESP32-C3, C5 등)"용이라고 설명. C6는 문구에 직접 없음 | https://github.com/espressif/esp-sr |
| WakeNet9s **실사용 증거** | 이 시계의 원래 펌웨어(샤오즈 1.8.5, ESP32-C6)에 `wakenet9s_quantized.c`와 모델 `wn9s_nihaoxiaozhi`가 들어 있고, 로그 문자열 `Quantized wakenet9s: ...`가 있다 → **C6에서 동작 확인** | `backup/original_xiaozhi_esp32c6_16MB.bin` (아래 2장) |
| WakeNet10s | 2026-10-09 뉴스: "SIMD(PIE)가 없는 칩(ESP32, C3, C5, **C6**)에서 동작". ESP-SR v2.6.0부터 | https://github.com/espressif/esp-sr |
| WakeNet10 언어 | 중국어, 영어, 일본어, 프랑스어, 독일어, 스페인어, 포르투갈어, 러시아어. **한국어 없음** | https://github.com/espressif/esp-sr |
| 공개 호출어(예) | "Hi ESP"(`wn9_hiesp`, `wn10_hiesp`), "Alexa", "你好小智" 등. 9s/10s용 변형이 어느 호출어에 있는지는 `model/` 폴더 확인 필요(**미확인**) | https://github.com/espressif/esp-sr |
| 메모리·CPU | C6 수치는 공식 문서에 없음(**미확인**). 백업 기준 `wn9s_nihaoxiaozhi` 모델 데이터는 플래시에 약 **125KB**(model 파티션 사용량 125,946바이트, mmap으로 읽음) | 백업 파일 분석 |

### 1.3 WakeNet/MultiNet을 못 쓸 때의 대안

| 대안 | C6 가능성 | 비고 |
| --- | --- | --- |
| WakeNet만 사용, **호출어 자체를 명령으로** | 가능(검증된 경로) | 명령 1개("다음")만 현실적. 한 모델에 호출어 여러 개(최대 5개)를 담는 다중 호출어 모델은 S3 문서 기준 기능이며, 9s/10s 다중 모델 여부는 **미확인** |
| Espressif 무료 TTS 호출어 학습 요청(GitHub 이슈 #88) | 모델 형식이 9s/10s로 나오는지 **미확인** | 한국어는 "예정" 목록에만 있음. 영어 문구(예: "Hey Kit next")는 요청 대상. 공개 이슈에 글을 올려야 하므로 사용자 승인 필요 |
| TFLite Micro로 직접 학습한 키워드 모델(방식 B) | 가능(추정, 3장) | 한국어 가능. 데이터 수집·학습·통합 모두 직접 |
| ESP-DL | C6 지원 명시 없음(**미확인**). S3·P4만 언급 | https://github.com/espressif/esp-dl |

---

## 2. 샤오즈(xiaozhi-esp32) 펌웨어가 C6에서 호출어를 처리하는 방식

### 2.1 공개 소스 기준

- `main/audio/audio_service.cc`: `CONFIG_IDF_TARGET_ESP32S3 || ESP32P4 || ESP32S31`일 때만 `AfeAudioEngine`(AFE + 커스텀 호출어)을 쓴다. 그 외 칩(C3/C5/C6)은 AFE 없이 동작.
- `main/CMakeLists.txt`: S3/P4/S31에서만 `afe_audio_engine.cc`, `custom_wake_word.cc`(MultiNet을 호출어로 쓰는 기능)를 빌드하고, 나머지 칩은 `esp_wake_word.cc`(WakeNet 단독)를 빌드.
- `main/audio/wake_words/esp_wake_word.cc`: `esp_srmodel_init("model")`로 model 파티션에서 WakeNet 모델을 읽고 `DET_MODE_95`로 생성, 마이크 데이터를 바로 `detect()`에 넣는다.
- 결론: **C6 샤오즈는 "로컬 WakeNet 호출어 → 서버 음성 인식(ASR)·대화"** 구조. 호출어 이후 말은 전부 서버가 알아듣는다. 오프라인 명령 인식은 없다.

출처: https://github.com/78/xiaozhi-esp32/blob/main/main/audio/audio_service.cc , https://github.com/78/xiaozhi-esp32/blob/main/main/CMakeLists.txt , https://github.com/78/xiaozhi-esp32/blob/main/main/audio/wake_words/esp_wake_word.cc

### 2.2 이 보드용 샤오즈 설정 (공개 소스)

`main/boards/waveshare/esp32-c6-touch-amoled-2.06/config.h` (target `esp32c6`):

| 항목 | 값 |
| --- | --- |
| 샘플레이트 | 입력·출력 24000Hz (WakeNet은 16kHz라 내부 리샘플링) |
| 재생 참조 채널 | `AUDIO_INPUT_REFERENCE false` → 에코 제거용 기준 신호 안 씀, 입력 1채널 |
| I2S | MCLK=GPIO19, WS=GPIO22, BCLK=GPIO20, DIN=GPIO21, DOUT=GPIO23 |
| 코덱 | `BoxAudioCodec` (ES8311 재생 + ES7210 녹음), PA=GPIO6, 코덱 I2C SDA=GPIO8 / SCL=GPIO7 |
| 버튼 | BOOT=GPIO9 |
| 화면 | 410×502, QSPI(CS=5, PCLK=0, D0~D3=1~4, RST=11) |

출처: https://github.com/78/xiaozhi-esp32/tree/main/main/boards/waveshare/esp32-c6-touch-amoled-2.06 (핀 번호는 샤오즈 코드 기준이므로 펌웨어 작업 전 Waveshare 회로도와 대조할 것)

### 2.3 백업 펌웨어 분석 (이 시계의 실물 증거)

`backup/original_xiaozhi_esp32c6_16MB.bin`의 파티션 표와 앱 헤더를 읽고 문자열을 추출했다(실행 없이 읽기만 함).

| 파티션 | 위치·크기 | 내용 |
| --- | --- | --- |
| model | 0x12000, 952KB | ESP-SR 모델: **`wn9s_nihaoxiaozhi`** 하나뿐(약 125KB 사용). MultiNet 모델 없음 |
| factory | 0x100000, 4.6MB | 칩 ID 13(=ESP32-C6). 프로젝트 `phone_s3_box_3` v0.4.2(esp-brookesia 데모, 소스 경로에 `ESP32-C6-Touch-AMOLED-1.8`), ESP-IDF v5.5.1 |
| ota_0 | 0x5A0000, 6MB | 칩 ID 13. 프로젝트 **`xiaozhi` 1.8.5**, ESP-IDF v5.5.1, 2025-10-28 빌드 |
| storage | 0xBA0000 | 데이터 |

- 샤오즈 앱 문자열: `EspWakeWord`, `NoAudioProcessor`, `Quantized wakenet9s`, `BoxAudioCodec`, `i2s_channel_init_tdm_mode`, `Enable ES7210_INPUT_MIC1~4`, MQTT·WebSocket·Opus 관련 문자열, OTA 주소 `api.tenclass.net`.
- → **AFE 없이 WakeNet9s 단독 + ES7210 TDM 입력 + 서버 ASR** 구성이 이 시계에서 실제로 돌던 것.
- 참고(정리 필요): 샤오즈 앱 안의 보드 이름 문자열이 `waveshare-s3-touch-amoled-2.06`, `waveshare_c6_amoled_1_43` 등으로 섞여 있다. Waveshare가 다른 보드 코드를 고쳐 빌드한 것으로 보인다. otadata가 비어 있어 부팅 시 factory 앱이 먼저 뜨는 구조로 보이나 샤오즈로 넘어가는 경로는 **미확인**.

---

## 3. C6에서 가능한 온디바이스 키워드 인식 (방식 B의 실현성)

### 3.1 칩 자원

| 항목 | 값 | 출처 |
| --- | --- | --- |
| CPU | RISC-V 32비트 싱글코어, 최대 160MHz | https://www.waveshare.com/esp32-c6-touch-amoled-2.06.htm |
| SRAM | HP SRAM 512KB + LP SRAM 16KB | 위와 같음, https://docs.waveshare.com/ESP32-C6-Touch-AMOLED-2.06 |
| PSRAM | **없음** (제품 표에 "-") | https://www.waveshare.com/esp32-c6-touch-amoled-2.06.htm |
| 플래시 | 16MB (백업 크기와 일치) | 위와 같음, `backup/README.md` |
| SIMD(PIE) 명령 | 없음 (WakeNet10s 설명에 "PIE 없는 칩"으로 C6 포함) | https://github.com/espressif/esp-sr |

### 3.2 TFLite Micro / ESP-NN

| 항목 | 내용 | 출처 |
| --- | --- | --- |
| esp-tflite-micro | 컴포넌트 1.4.1, "Supports all targets". 성능표는 P4·S3·ESP32·C3만, **C6 수치 없음**. 예제에 micro_speech 포함 | https://components.espressif.com/components/espressif/esp-tflite-micro , https://github.com/espressif/esp-tflite-micro |
| ESP-NN 최적화 | S3·P4·S31은 SIMD 어셈블리, ESP32·C3는 "Generic optimisations". **C6는 목록에 없음**(**미확인**: C3처럼 일반 최적화가 적용되는지 빌드로 확인 필요) | https://github.com/espressif/esp-nn |
| 참고 성능(사람 감지 모델 invoke) | C3(160MHz) ESP-NN 없이 3355ms → 있으면 426ms. ESP32 4084ms → 380ms | https://github.com/espressif/esp-tflite-micro |

### 3.3 Edge Impulse의 C6 지원

- Edge Impulse 공식 ESP32 문서는 원래 ESP32(ESP-EYE 등)만 다룬다. **C6 공식 지원 없음.** 배포 방식 중 "C++ 라이브러리(ESP-IDF용)"를 받아 C6 프로젝트에 직접 넣는 것은 가능하다고 추정(직접 통합 작업).
  출처: https://docs.edgeimpulse.com/hardware/boards/espressif-esp32.md
- 데이터 수집은 휴대폰·PC 브라우저로 할 수 있어 보드 지원과 무관(학습 도구는 웹 서비스라 PC 설치 금지 조항과 충돌하지 않음. 단 녹음 데이터를 외부 서비스에 올리는 것이므로 사용자 확인 필요).
- 무료 요금제 한도·커스텀 하드웨어 기능의 요금제 제한은 **미확인**(커뮤니티 글에 "커스텀 하드웨어는 엔터프라이즈 기능"이라는 오래된 언급이 있으나 현재 기준 확인 안 됨).

### 3.4 작은 KWS 모델의 메모리·지연 추정

Arm "Hello Edge" 논문(Speech Commands 12클래스, 8비트 가중치·활성값 기준):

| 모델 | 정확도 | 메모리 | 추론당 연산 |
| --- | --- | --- | --- |
| DS-CNN 소형(S) | 94.4% | **38.6KB** | **5.4M** |
| DS-CNN 중형(M) | 94.9% | 189.2KB | 19.8M |
| DS-CNN 대형(L) | 95.4% | 497.6KB | 56.9M |

- 입력 특징: 40ms 프레임, 20ms 간격, 1초당 49프레임 × MFCC 10개(소형 모델 기준).
  출처: https://arxiv.org/abs/1711.07128 (Table 5, Table 7)
- TFLite Micro micro_speech 예제: 모델 20KB 미만, 30ms 창·20ms 간격, 49프레임 × 40채널, 4클래스(무음/모름/yes/no).
  출처: https://github.com/tensorflow/tflite-micro/blob/main/tensorflow/lite/micro/examples/micro_speech/README.md

**이 프로젝트 대입(추정, 실측 아님):**
- 메모리: DS-CNN 소형 약 40KB + 특징 추출·오디오 버퍼 수십 KB → **100KB 안팎**. 512KB SRAM에서 NimBLE(BLE HID), LVGL 부분 버퍼, 앱과 함께 들어갈 여지는 있다. 샤오즈가 같은 512KB에서 Wi-Fi + WakeNet + LVGL + Opus를 함께 돌린 것이 참고 근거다. 이 프로젝트는 Wi-Fi를 쓰지 않아 오히려 여유가 생긴다.
- 화면: 410×502 RGB565 전체 프레임버퍼는 약 412KB라 PSRAM 없는 C6에는 **올릴 수 없다**. LVGL 부분 버퍼(예: 1/10 화면 ≈ 41KB)로 그려야 한다. 음성 기능과 메모리를 다투는 주된 상대.
- 지연: 소형 DS-CNN 5.4M 연산을 C6 160MHz(SIMD 없음)에서 돌리면 추론 1회 **수십~수백 ms**로 추정. 0.25~0.5초마다 1회 판단하면 실시간 처리는 가능한 수준으로 본다. 정확한 값은 시제품 측정 필요(**미확인**).
- 단일 코어라 음성 추론 중 BLE·화면 작업이 밀리지 않도록 작업 우선순위 조정이 필요하다(BLE 키 입력 목표 100ms 이하와 충돌 가능, 실측 필요).

---

## 4. 이 보드의 마이크·코덱 구성이 키워드 인식에 주는 영향

| 항목 | 내용 | 출처 |
| --- | --- | --- |
| 코덱 | "ES8311 오디오 코덱 + ES7210 에코 제거 회로" | https://www.waveshare.com/esp32-c6-touch-amoled-2.06.htm |
| 마이크 개수·종류 | 제품 페이지·문서에 개수 표기 없음 → **미확인**(회로도 확인 필요). ES7210 경로이므로 아날로그(또는 ES7210 입력형) 마이크로 추정 | https://files.waveshare.com/wiki/ESP32-C6-Touch-AMOLED-2.06/ESP32-C6-Touch-AMOLED-2.06-Schematic-V1.0.pdf |
| 연결 방식 | ES7210 → I2S **TDM**(샤오즈 로그 `Enable TDM mode`), PDM 직결 아님 | 백업 분석, 샤오즈 `box_audio_codec.cc` |
| C6 I2S | I2S 1개. STD·PDM(TX/RX)·TDM 지원. **PDM→PCM 하드웨어 변환기 없음**(PDM RX는 원시 PDM만) | https://docs.espressif.com/projects/esp-idf/en/stable/esp32c6/api-reference/peripherals/i2s.html |

**영향 정리:**
1. **PDM 변환기 부재는 이 보드에 영향 없음** — 마이크가 ES7210(PCM 출력)을 거치기 때문.
2. **I2S 1개 공유** — ES8311 재생과 ES7210 녹음이 같은 I2S를 TDM 이중(duplex)으로 쓴다. 샘플레이트를 하나로 맞춰야 한다(샤오즈는 24kHz 공통). KWS는 16kHz가 표준이므로 **16kHz로 통일하거나 리샘플링**한다. 이 프로젝트는 소리 재생이 거의 없으므로 16kHz 통일이 단순하다.
3. **AFE(잡음 억제·에코 제거) 없음** — C6에서는 ESP-SR AFE를 못 쓴다. 강당 소음·박수·마이크 스피커 소리는 그대로 모델에 들어간다. 대응: 모델 학습 데이터에 잡음을 섞기(방식 B), ES7210 마이크 게인 조정, 간단한 에너지 기반 음성 구간 검출(VAD)로 추론 빈도 줄이기.
4. **에코 기준 채널** — ES7210에 재생 신호 되먹임 회로가 있더라도 C6에서는 AEC 알고리즘(AFE)이 없어 활용이 어렵다. 샤오즈 C6 설정도 `AUDIO_INPUT_REFERENCE false`. 이 프로젝트는 스피커를 쓰지 않으므로 문제 적음.
5. **손목 위치** — 발표 중 팔을 내리면 입과 마이크 거리가 30~60cm로 변하고 옷 스침 소리가 들어간다(일반론, 추정). 판정 시험은 실제 착용 자세로 해야 한다.

---

## 5. 방식 A/B/C 재평가 (C6 기준)

### 5.1 방식 정의 변경

| 방식 | S3 기준(이전) | **C6 기준(변경)** |
| --- | --- | --- |
| A | WakeNet "Hi ESP" → MultiNet "next slide" | **A-C6: WakeNet 공개 영어 호출어 하나를 "다음" 명령으로 사용** (예: "Hi ESP" = 다음 슬라이드). 2단계 구조 없음 |
| B | 한국어 커스텀 KWS (Edge Impulse/TFLite Micro) | 동일하나 C6 전용 최적화·공식 지원 없음, AFE 없음 |
| C | 버튼 누르고 말하기 | 버튼을 누르는 동안만 A-C6 또는 B 엔진이 듣는다 |

### 5.2 비교

| 기준 | A-C6 (WakeNet 단독) | B (한국어 TFLite Micro) | C (버튼 + 음성) |
| --- | --- | --- | --- |
| 한국어 | 불가 | 가능 | 엔진에 따름 |
| 사용 문구 | "Hi ESP" 등 공개 호출어 1개 → "다음"만 | "키트 다음" 등 원하는 문구 | 엔진에 따름 |
| "다음" 단독 오작동 | 일상 대화에 잘 안 나오는 호출어라 오작동 낮음(추정) | unknown 클래스 품질에 좌우 | 매우 낮음 |
| C6 동작 근거 | **있음**(샤오즈 실사용, WakeNet10s 공식) | 계산상 가능(추정), 실측 없음 | 있음 |
| 잡음 대응 | WakeNet 자체 강건성만(AFE 없음) | 학습 데이터로 직접 | 듣는 시간이 짧아 유리 |
| 데이터 수집 | 없음 | 필요(7.3절, 최소 키워드 10분 + 한국어 일상 발화 다량) | 엔진에 따름 |
| 개발 시간 | 짧음 | 김(녹음·학습·C6 통합·튜닝 반복) | 짧음 |
| 메모리 | 모델 약 125KB 플래시(mmap), RAM 사용량 **미확인** | 약 100KB RAM 추정 | 엔진에 따름 |
| 판정 기준 달성 가능성 | 중간~높음(1마이크·AFE 없음 조건의 공식 수치 없음) | 불확실 | 매우 높음 |
| 버튼과의 차이 | 손을 안 써도 됨 | 손을 안 써도 됨 | 작음(작업지시서 지적대로) |

### 5.3 다른 대안 검토

| 대안 | 판단 | 이유 |
| --- | --- | --- |
| PC에서 인식 | **제외** | 작업지시서가 PC에 프로그램 설치를 금지함. 브라우저 Web Speech API 페이지를 띄우는 방식은 설치는 아니지만, 웹 페이지는 PowerPoint 등 다른 프로그램에 키 입력을 보낼 수 없고 발표 PC에 항상 탭을 열어 둬야 해 현실성이 없다. Chrome의 Web Speech API는 서버 인식이라 인터넷이 필요함(일반론) |
| 휴대폰에서 인식 | 권장 안 함 | 폰 브라우저/앱이 음성을 인식해 BLE로 시계에 전달 → 시계가 PC로 키 전송. 시계가 BLE 중앙(PC)·주변(폰) 연결을 동시에 다뤄야 하고, 인식은 대부분 인터넷 필요. 오프라인 목표와 맞지 않음 |
| 샤오즈식 서버 인식 | 제외 | Wi-Fi·인터넷·외부 서버 필요. 오프라인 목표 위반, 발표장 Wi-Fi 의존, BLE와 Wi-Fi 동시 사용 부담 |
| Espressif에 영어 커스텀 호출어 요청(이슈 #88) | 선택 사항 | 무료지만 공개 GitHub 글 필요, 일정 불확실, 9s/10s(C6용) 모델로 제공되는지 **미확인**. 한국어 불가 |

### 5.4 권장안

1. **1순위: A-C6로 음성 흐름 완성**
   - WakeNet10s(또는 9s)의 공개 영어 호출어 하나를 "다음 슬라이드"에 연결. 후보는 "Hi ESP". 상표 호출어("Alexa")는 개인 시험용으로만.
   - 입력은 ES7210 1채널, 16kHz로 통일, AFE 없이 WakeNet에 직접 공급(샤오즈 C6 구조와 동일).
   - "이전 슬라이드" 등 나머지는 버튼·제스처로. 음성은 "다음" 하나만.
   - 판정 기준(조용한 강당 10회 중 9회, 20분 일반 발화 중 오작동 0회)으로 시험. 감도는 `DET_MODE_90/95` 등으로 조정.
2. **방식 C는 항상 함께**: 설정에서 "항상 듣기 / 버튼 누르는 동안만 듣기 / 끄기" 선택. 측면 버튼 길게 누름 잠금 토글은 작업지시서대로 유지.
3. **한국어가 꼭 필요하면 방식 B**(사용자 승인 필수). 먼저 소형 시험으로 C6 위 추론 시간·메모리를 측정한 뒤 녹음 작업을 시작한다.
4. 시뮬레이션 사이트의 "키트, 다음" 흐름은 A-C6를 택하면 실제 문구("Hi ESP")와 다르다는 점을 화면에 표시하거나 문구를 바꾼다(시뮬팀과 협의).

---

## 6. 사용자에게 물어야 할 결정 사항

1. **영어 고정 호출어를 "다음" 명령으로 써도 되는가?** (예: "Hi ESP"라고 말하면 넘김. "키트, 다음" 같은 한국어는 불가)
2. **한국어 "키트, 다음"이 꼭 필요한가?** 필요하면 방식 B 전환을 승인하는지. B는 본인 녹음(여러 날, 키워드 최소 10분 분량)과 "다음"이 들어간 한국어 일상 발화 녹음이 필요하고, Edge Impulse 같은 외부 서비스에 녹음을 올릴 수 있다.
3. **음성으로는 "다음" 하나만 해도 되는가?** (C6에서는 명령어 여러 개 인식이 어렵다. 이전·암전은 버튼/제스처)
4. **Espressif에 영어 커스텀 호출어(예: "Hey Kit")를 공개 GitHub 이슈로 요청할지** — 공개 글 작성이라 사용자 허락이 필요하고 일정은 보장되지 않는다.
5. **기본 듣기 모드**: 항상 듣기 / 버튼 누르는 동안만 듣기(방식 C) 중 어느 쪽을 기본으로 할지.

---

## 7. S3 기준 조사에서 칩과 무관하게 유효한 사실 (요약 유지)

### 7.1 ESP-SR 언어 지원

- MultiNet(명령어)은 **중국어·영어만** 지원(C6에서는 어차피 사용 불가).
  출처: https://docs.espressif.com/projects/esp-sr/en/latest/esp32s3/speech_command_recognition/README.html
- WakeNet10: 중·영·일·불·독·서·포·러 8개 언어, **한국어 없음**.
  출처: https://github.com/espressif/esp-sr
- WakeNet 입력 형식: 16kHz, 모노, 16비트.
  출처: https://docs.espressif.com/projects/esp-sr/en/latest/esp32s3/wake_word_engine/README.html
- 상표 호출어는 권리자 허락 없이 상업 사용 불가(README).
  출처: https://github.com/espressif/esp-sr

### 7.2 커스텀 호출어 정책

| 경로 | 조건 | 한국어 | 출처 |
| --- | --- | --- | --- |
| 공개 호출어 | 무료, 바로 사용 | 없음 | https://github.com/espressif/esp-sr |
| TTS 학습 요청(이슈 #88) | 무료·상업 가능. 진행 중 프로젝트 링크 또는 추천 5개 이상. 3~5음절 권장 | **예정만**(TTS 파이프라인 V3 예정 목록) | https://github.com/espressif/esp-sr/issues/88 |
| 유료 맞춤 학습 | 녹음 2만 개 이상, 화자 500명 이상 | 언어 제한 명시 없음 | https://docs.espressif.com/projects/esp-sr/en/latest/esp32s3/wake_word_engine/ESP_Wake_Words_Customization.html |

- 이슈 #88의 TTS 학습 모델 예시 성능: 오경보 8시간당 1회, 정인식 88%.
  출처: https://github.com/espressif/esp-sr/issues/88

### 7.3 방식 B 데이터량 (Edge Impulse·공개 데이터셋 기준)

| 항목 | 수치 | 출처 |
| --- | --- | --- |
| Edge Impulse 권장 | 클래스마다 **최소 10분**(1초 샘플로 약 600개, 계산값). 키워드 / noise / unknown 3클래스 | https://docs.edgeimpulse.com/docs/tutorials/end-to-end-tutorials/audio/responding-to-your-voice |
| 공개 noise·unknown 데이터 | 클래스당 25분, 1초, 16kHz (영어) | https://docs.edgeimpulse.com/docs/pre-built-datasets/keyword-spotting |
| 합성 데이터 | Google TTS로 키워드 데이터 생성 튜토리얼(Google Cloud 계정 필요) | https://docs.edgeimpulse.com/docs/tutorials/data/generate-synthetic-datasets/generate-keyword-spotting-dataset |
| Speech Commands 규모(참고) | 105,829개 발화, 화자 2,618명 | https://arxiv.org/abs/1804.03209 |

- 본인 1명 전용이면 "키트 다음" 300~400회 발화(여러 날·장소·말투)로 시작 가능(추정). 핵심은 "다음 장에서", "그 다음에" 같은 **한국어 일상 발화를 unknown에 충분히** 넣는 것. 필요량은 **미확인**.
- "20분 일반 발화 중 오작동 0회"는 소규모 데이터 KWS로는 어려운 기준이므로 B를 택하면 방식 C 병행을 강하게 권장.

### 7.4 더 이상 유효하지 않은 S3 기준 내용 (참고)

- MultiNet7 영어 명령 인식률(3m 조용한 환경 97.2%), AFE 1마이크 "MR" 구성, PSRAM 약 4MB 예산, 32MB 플래시, ES7210 2마이크 + AEC("MMR"), 샤오즈 MultiNet 커스텀 호출어 → **모두 S3 보드 기준이라 이 시계(C6)에는 해당하지 않는다.**
- 같은 이유로 `docs/research/hardware.md`, `docs/research/firmware-stack.md`의 S3 기준 기술 내용도 C6 기준으로 다시 확인해야 한다.

---

## 8. 출처 목록

**ESP-SR**
- 저장소 README(지원 칩, WakeNet9s/10s, 언어): https://github.com/espressif/esp-sr
- 컴포넌트 2.6.0: https://components.espressif.com/components/espressif/esp-sr/versions/2.6.0/readme
- WakeNet 문서(S3): https://docs.espressif.com/projects/esp-sr/en/latest/esp32s3/wake_word_engine/README.html
- MultiNet 문서: https://docs.espressif.com/projects/esp-sr/en/latest/esp32s3/speech_command_recognition/README.html
- 호출어 맞춤 제작: https://docs.espressif.com/projects/esp-sr/en/latest/esp32s3/wake_word_engine/ESP_Wake_Words_Customization.html
- TTS 호출어 학습 이슈 #88: https://github.com/espressif/esp-sr/issues/88

**샤오즈**
- 오디오 서비스(칩별 엔진 선택): https://github.com/78/xiaozhi-esp32/blob/main/main/audio/audio_service.cc
- 빌드 구성: https://github.com/78/xiaozhi-esp32/blob/main/main/CMakeLists.txt
- WakeNet 단독 호출어: https://github.com/78/xiaozhi-esp32/blob/main/main/audio/wake_words/esp_wake_word.cc
- C6 AMOLED 2.06 보드 설정: https://github.com/78/xiaozhi-esp32/tree/main/main/boards/waveshare/esp32-c6-touch-amoled-2.06
- 원래 펌웨어 백업: `backup/original_xiaozhi_esp32c6_16MB.bin` (로컬, 파티션 표·앱 헤더·문자열 분석)

**보드·칩**
- Waveshare 제품 페이지: https://www.waveshare.com/esp32-c6-touch-amoled-2.06.htm
- Waveshare 문서: https://docs.waveshare.com/ESP32-C6-Touch-AMOLED-2.06
- 회로도 PDF: https://files.waveshare.com/wiki/ESP32-C6-Touch-AMOLED-2.06/ESP32-C6-Touch-AMOLED-2.06-Schematic-V1.0.pdf
- ESP-IDF I2S(C6): https://docs.espressif.com/projects/esp-idf/en/stable/esp32c6/api-reference/peripherals/i2s.html

**온디바이스 KWS**
- esp-tflite-micro: https://github.com/espressif/esp-tflite-micro , https://components.espressif.com/components/espressif/esp-tflite-micro
- ESP-NN: https://github.com/espressif/esp-nn
- ESP-DL: https://github.com/espressif/esp-dl
- TFLite Micro micro_speech: https://github.com/tensorflow/tflite-micro/blob/main/tensorflow/lite/micro/examples/micro_speech/README.md
- Hello Edge(DS-CNN): https://arxiv.org/abs/1711.07128
- Edge Impulse ESP32: https://docs.edgeimpulse.com/hardware/boards/espressif-esp32.md
- Edge Impulse 음성 튜토리얼: https://docs.edgeimpulse.com/docs/tutorials/end-to-end-tutorials/audio/responding-to-your-voice
- Edge Impulse 키워드 데이터셋: https://docs.edgeimpulse.com/docs/pre-built-datasets/keyword-spotting
- Edge Impulse 합성 데이터: https://docs.edgeimpulse.com/docs/tutorials/data/generate-synthetic-datasets/generate-keyword-spotting-dataset
- Speech Commands: https://arxiv.org/abs/1804.03209
