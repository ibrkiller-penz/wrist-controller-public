> **제거 (2026-10-17, 최종 결정)**: 음성 기능 전체(WakeNet·마이크·누르고 말하기·본인 목소리 next)를 펌웨어·시뮬레이터·공유 설정에서 뺐다. C6(PSRAM 없음) 메모리가 빠듯하기 때문이다. 이 문서는 조사 기록으로만 남긴다. 나중 계획: [gemini-later.md](gemini-later.md)

# "Hi ESP" 대신 영어 한 단어 "NEXT"로 넘길 수 있나 (조사, 2026-10-17)

> 대상: ESP32-C6 시계, esp-sr 2.6.0, WakeNet9s `wn9s_hiesp`, ES7210 마이크 16kHz (근거: `docs/research/voice.md`, `firmware/main/voice_wake.c`).
> 현재 내부 RAM: 음성 켠 뒤 여유 175KB, 최대 블록 155KB. 오늘은 토요일, 마감은 월요일(2026-10-19).

## 0. 결론 요약

1. **esp-sr에는 "next"(또는 "next slide") WakeNet 모델이 없다.** C6에서 고를 수 있는 것은 5개뿐이고 모두 "Hi ~ / 你好 ~" 형태.
2. **Espressif 무료 TTS 학습(이슈 #88)으로 "next"를 받기는 어렵다.** 담당자가 1~2음절 단어는 오작동을 줄이기 어렵다며 3~5음절을 권장했고, 처리 기간도 정해져 있지 않다. 유료 맞춤 제작은 영업 상담이 필요하고, 학습에만 2~3주가 걸린다.
3. **Google Speech Commands v2(35단어)에 "next"는 없다.** "go", "forward", "up", "right" 등은 있다.
4. **월요일까지 현실적인 것**: (1) 지금 방식("Hi ESP") 그대로 두기, (2) **PWR 누르고 말하기 + 본인 목소리 "next" 몇 번 등록(MFCC+DTW)**, (3) 누르고 말하기 + 소리 크기만 보기.
5. **시간이 더 걸리는 것**: 직접 학습한 "next" 신경망(TFLite Micro), Speech Commands "go/forward" 모델 학습·이식, Espressif 무료/유료 학습.

---

## 1. esp-sr 2.6.0에서 C6가 쓸 수 있는 WakeNet 모델

로컬에 받아 둔 esp-sr 2.6.0 컴포넌트(`managed_components/espressif__esp-sr`, `idf_component.yml`의 version 2.6.0)를 직접 확인했다.

### 1.1 Kconfig에서 C6가 고를 수 있는 것 (`Kconfig.projbuild`)

C6는 `menu "Load Multiple Wake Words (WakeNet9s)"`만 보인다. 그 아래 메뉴("WakeNet9 or WakeNet10")는 `depends on IDF_TARGET_ESP32S3 || IDF_TARGET_ESP32P4 || IDF_TARGET_ESP32S31`이라 C6에서는 안 보인다.

| Kconfig 이름 | 모델 폴더 | 호출어 |
|---|---|---|
| `SR_WN_WN9S_HILEXIN` | `wn9s_hilexin` | Hi,乐鑫 |
| `SR_WN_WN10S_HILEXIN` | `wn10s_hilexin` | Hi,乐鑫 |
| `SR_WN_WN9S_HIESP` | `wn9s_hiesp` (현재 사용, 약 129KB) | Hi,ESP |
| `SR_WN_WN9S_NIHAOXIAOZHI` | `wn9s_nihaoxiaozhi` | 你好小智 |
| `SR_WN_WN9S_HIJASON` | `wn9s_hijason` | Hi,Jason |

- 그 밖에 폴더에는 `wn9s_alexa`(약 289KB)도 있지만 **C6용 Kconfig 항목은 없다**. 수동으로 넣어 C6에서 돌아가는지는 **미확인**.
- `wn9s_hiesp/_MODEL_INFO_` 내용: `wakenet9_tts2h12_Hi,ESP_3_0.630_0.635` (TTS V2로 학습한 모델).

### 1.2 전체 `model/wakenet_model` 폴더에 "next"가 있나

폴더 약 100개 중 이름에 `next`나 `slide`가 들어간 것은 **없다**(grep 확인). 영어 단어형은 `wn9_computer_tts`, `wn9_jarvis_tts`, `wn9_alexa`, `wn9_mycroft_tts`, `wn9_sophia_tts` 등이 있지만 모두 **wn9/wn10용(S3·P4·S31 전용)**이고 C6에서는 쓸 수 없다.

출처: https://github.com/espressif/esp-sr/tree/master/model/wakenet_model , https://github.com/espressif/esp-sr/blob/master/Kconfig.projbuild , https://components.espressif.com/components/espressif/esp-sr/versions/2.6.0

---

## 2. Espressif 맞춤 호출어 정책

### 2.1 무료: TTS로 학습 (GitHub 이슈 #88)

| 항목 | 내용 | 출처 |
|---|---|---|
| 신청 방법 | 이슈 #88에 원하는 호출어를 댓글로 남긴다 | https://github.com/espressif/esp-sr/issues/88 |
| 비용·라이선스 | 무료, esp-sr과 같은 라이선스(상업 사용 가능). 대신 결과 모델은 **누구나 쓰는 공개 모델**이 된다 | 위와 같음 |
| 신청 자격 (2024-08-01부터) | 진행 중인 프로젝트 링크와 간단한 소개, **또는** 그 호출어에 좋아요가 5개 넘게 붙어야 함. 제출하면 Wake Word Submission Agreement에 동의한 것으로 봄 | 위와 같음 |
| 언어 | TTS Pipeline V3: 중국어·영어·일본어·프랑스어 (2026-04-23 소식) | https://github.com/espressif/esp-sr |
| 음절 수 | 담당자(sun-xiangyu, 2024-01-03): 1~2음절은 오작동을 줄이기 어렵다며 **3~5음절**을 권장. 2음절 "Homai"도 승인하지 않음 | https://github.com/espressif/esp-sr/issues/88 |
| 처리 기간 | **공식 기간 없음.** 2026-10-11에도 "내 신청이 빠졌냐"는 문의가 있었지만 답이 없었다. 최근 납품 예: 2026-10-09 `wn10_heypamet` | 위와 같음 |
| C6(wn9s/wn10s)용 제작 | 이슈에서 wn9s 요청이 있었지만 답이 없음 → **미확인**. 공개된 9s/10s 모델은 위 5개뿐 | 위와 같음 |

→ **"next"(1음절)는 권장 기준(3~5음절)에 맞지 않는다.** 받아들여질지 알 수 없고, 받더라도 월요일까지는 불가능하다. 굳이 신청한다면 "next slide please"(4음절)처럼 길게 하는 편이 통과 가능성이 높지만, 이것도 **C6용 9s 모델로 나올지는 미확인**.

### 2.2 유료: 맞춤 제작

| 항목 | 내용 |
|---|---|
| 방식 | ① TTS 샘플만 사용 ② 약 500명 녹음 + TTS ③ 고객이 낸 녹음 2만 개 이상 |
| 기간 | ②·③은 자료가 준비된 뒤 학습·조정에 보통 **2~3주** |
| 비용 | 한 번만 내는 제작비. 기기 대수·기간에 따른 라이선스비 없음. 금액은 sales@espressif.com 과 상담 |
| 호출어 형태 | 보통 3~6 음소 단위(예: "Hi Lexin"), 모델 하나에 최대 5개 |
| 고객 녹음 조건 | 16kHz·16비트·모노 WAV, 500명 이상(어린이 100명 이상), 40dB 미만 조용한 방, 1인당 1m 15회 + 3m 15회 |

출처: https://docs.espressif.com/projects/esp-sr/en/latest/esp32s3/wake_word_engine/ESP_Wake_Words_Customization.html

→ 개인 학교 과제에는 맞지 않는다.

---

## 3. 대안 A: 펌웨어에서 직접 작은 "next" 신경망 (TFLite Micro)

### 3.1 공개 데이터에 "next"가 있나

Google Speech Commands v2: 35단어, 105,829개 발화, 2,618명. 단어 목록은 Backward, Bed, Bird, Cat, Dog, Down, Eight, Five, Follow, Forward, Four, Go, Happy, House, Learn, Left, Marvin, Nine, No, Off, On, One, Right, Seven, Sheila, Six, Stop, Three, Tree, Two, Up, Visual, Wow, Yes, Zero. **"next"는 없다.**

출처: https://arxiv.org/html/1804.03209v1 (Table 1), https://www.tensorflow.org/datasets/catalog/speech_commands

### 3.2 "next"를 학습하려면 필요한 자료

- 직접 녹음만으로 학습: Speech Commands 수준(단어당 1,500~4,000개, 수천 명)이 기준점이다. 본인 목소리만 쓰더라도 **최소 수백 개** 녹음과, "기타 단어/잡음"용 반대 예시(Speech Commands 35단어 + 배경 잡음을 그대로 쓸 수 있음)가 필요하다. 본인 목소리만으로 학습하면 다른 사람 목소리에서는 잘 안 된다(일반론).
- 합성 음성으로 학습: ESPHome microWakeWord는 Piper TTS로 샘플을 만들어 TFLite Micro 모델을 학습한다. 다만 저장소 스스로 "초기 공개판"이고 좋은 모델을 만들려면 실험이 필요하다고 경고한다. 예시 텐서 메모리는 22,860바이트.
  출처: https://github.com/kahrendt/microWakeWord , https://esphome.io/components/micro_wake_word/

### 3.3 C6에서 돌릴 수 있나 (메모리·속도)

| 항목 | 내용 | 출처 |
|---|---|---|
| esp-tflite-micro | 1.4.1, "Supports all targets". 성능표에 C6는 없음. micro_speech 예제 포함 | https://components.espressif.com/components/espressif/esp-tflite-micro |
| micro_speech 모델 | "20kB 미만", 입력은 49프레임 x 40채널(30ms 창, 20ms 간격, 16kHz) | https://github.com/tensorflow/tflite-micro/blob/main/tensorflow/lite/micro/examples/micro_speech/README.md |
| ESP-DL | C6 지원 언급 없음, 음성 예제 없음 → 이 용도로는 쓰지 않음 | https://github.com/espressif/esp-dl |
| 메모리 추정 | 모델(플래시) 20~60KB + 텐서 메모리 20~40KB + 특징 추출·버퍼 10~20KB → **내부 RAM 50~80KB 정도**. 최대 블록 155KB 안에 들어간다(추정, 빌드로 확인 필요) | 위 수치에서 계산 |
| 같이 돌리기 | WakeNet9s와 동시에 돌리면 175KB 여유가 빠듯해진다. "next" 모델을 쓰면 WakeNet은 끄는 것이 안전 | 추정 |

→ **기술적으로는 가능하지만 월요일까지는 무리.** 녹음·학습·양자화·C6 이식·오작동 측정이 모두 필요하다.

---

## 4. 대안 B: PWR 누르고 말하기 + 본인 "next" 등록 (MFCC + DTW)

### 4.1 원리

1. 등록: PWR를 누른 채 "next"를 3~5번 말한다 → 각각 MFCC(13개 계수, 10ms 간격, 약 50~80프레임)로 바꿔 플래시(NVS)에 저장. 1회당 13 x 80 x 2바이트 ≈ 2KB.
2. 사용: PWR를 누르는 동안 녹음 → 소리 크기로 말한 부분만 잘라 MFCC → 저장된 등록본들과 DTW 거리 비교 → 기준 이하이면 "다음".
3. 버튼을 누른 동안만 들으므로 평소 대화로 넘어갈 일이 거의 없다. 판정해야 할 것은 "next인가, 다른 말/잡음인가"뿐.

### 4.2 정확도 (일반론)

- MFCC+DTW 템플릿 비교는 **화자 종속(본인 목소리)·단어 하나씩 끊어 말하기·작은 어휘**에서 쓰던 고전 방식이다. 임베디드 DSP에서 이 구성으로 구현한 사례가 있다.
  출처: https://krishi.icar.gov.in/ohs-2.3.1/index.php/record/view/123172 (MFCC + DTW, 화자 종속 소어휘 임베디드 시스템)
- 저가 마이크로컨트롤러(dsPIC)에서 DTW·신경망·PCA를 비교한 연구에서는 DTW보다 PCA+신경망이 더 나았다. 즉 DTW는 "간단하지만 최고는 아님".
  출처: https://sol.sbc.org.br/index.php/sbesc/article/view/39754
- 몇 개 등록본만 쓰는 마이크로컨트롤러 DTW의 정확도 수치를 직접 보고한 자료는 찾지 못했다 → **수치 미확인.** 일반적으로 본인·조용한 곳·같은 마이크에서는 잘 맞고, 다른 사람 목소리·소음·말투 변화에는 약하다.
- 이 용도에서는 "next를 다른 말로 착각"보다 "next인데 거부"가 더 흔할 것이다. 거부되면 다시 말하면 되고, 버튼 누름이 이미 의도 표시라 위험이 낮다.

### 4.3 구현 난이도·자원

| 항목 | 내용 |
|---|---|
| 코드량 | MFCC(FFT 512점 + 멜 필터 26개 + DCT) + DTW + 등록 화면, C로 약 300~500줄. FFT는 esp-dsp(ANSI C 경로로 모든 칩 지원) 또는 직접 구현 |
| 계산량 | 1초 녹음 MFCC는 수 ms~수십 ms, DTW 80x80 x 등록 5개 = 3만 칸 정도 → C6 160MHz에서 **수십 ms 이내**(추정) |
| RAM | 녹음 버퍼 1.5초 = 48KB(16비트) 또는 프레임 단위 처리 시 수 KB + DTW 표 수십 KB → 50KB 안쪽. WakeNet을 내려놓으면 여유 충분 |
| 학습 | 없음(기기에서 바로 등록) |
| 기간 | **하루~이틀**. 월요일까지 가능하지만, 등록 UI와 기준값 조정 시간이 빠듯하다 |

esp-dsp 출처: https://github.com/espressif/esp-dsp

### 4.4 더 단순한 변형: 소리 크기만 보기

PWR를 누르는 동안 일정 크기 이상의 말소리가 0.15초 넘게 나면 "다음"으로 처리한다. 단어는 구분하지 못한다("아무 말이나 = 다음"). 몇 시간이면 만들 수 있고 실패할 일이 거의 없다. 다만 사실상 "버튼 + 말"이라 버튼만 눌러도 되는 상황과 차이가 작다.

---

## 5. 대안 C: Speech Commands에 있는 단어 쓰기 ("go", "forward", "right" 등)

| 항목 | 내용 |
|---|---|
| 장점 | 공개 데이터가 단어당 1,500~3,900개라 녹음 없이 학습 가능. "go" 3,880개, "forward" 1,557개, "right" 3,778개, "up" 3,723개 (https://arxiv.org/html/1804.03209v1) |
| 단점 | 그래도 **학습·양자화·C6 이식**은 해야 한다(대안 A와 같은 작업, 녹음만 빠짐). 화자 독립이라 누가 말해도 반응 |
| 단어 선택 | "go"는 1음절이라 항상 듣기에서는 오작동이 잦을 것(일반 대화에 흔함). "forward"(2음절)가 나음. "right"는 "다음 = 오른쪽" 의미가 맞지만 대화에 흔하다 |
| 기간 | 학습 스크립트(TFLM micro_speech train) 기반으로 2~4일 + C6 메모리·속도 측정. **월요일은 빠듯하거나 넘김** |

출처: https://github.com/tensorflow/tflite-micro/blob/main/tensorflow/lite/micro/examples/micro_speech/README.md , https://components.espressif.com/components/espressif/esp-tflite-micro

---

## 6. 판단

### 6.1 월요일까지 현실적으로 가능한 것

| 순위 | 안 | 이유 |
|---|---|---|
| 1 | **지금 "Hi ESP" 유지(항상 듣기 또는 누르고 말하기)** | 이미 동작함. 바꿀 위험 없음 |
| 2 | **누르고 말하기 + 본인 "next" 등록(MFCC+DTW)** | 학습 불필요, 본인 목소리 기준, 하루~이틀. 단 PWR를 누를 때만 동작 |
| 3 | 누르고 말하기 + 소리 크기만 | 몇 시간, 가장 확실. 단어는 구분 안 함 |

### 6.2 시간이 더 필요한 것

| 안 | 예상 기간 | 비고 |
|---|---|---|
| Speech Commands "forward"/"go" 신경망 | 2~4일 + 측정 | 항상 듣기 가능, 오작동 측정 필요 |
| 직접 학습 "next" 신경망(TTS 합성 또는 녹음 수백 개) | 1~2주 | 1음절이라 항상 듣기에서 오작동 위험 큼 |
| Espressif 무료 TTS 학습(이슈 #88) | 기간 미정 | 1음절 "next"는 권장 기준(3~5음절) 밖. C6(9s)용 제작 여부 미확인 |
| Espressif 유료 제작 | 상담 + 2~3주 이상 | 개인 과제에는 비현실적 |

### 6.3 권장안

1. **월요일 발표는 "Hi ESP" 그대로**(이미 검증됨).
2. "next"를 꼭 말하고 싶으면 **누르고 말하기 전용으로 MFCC+DTW 본인 등록**을 추가한다. 항상 듣기는 계속 "Hi ESP"가 담당.
3. 월요일 이후에 항상 듣기로 "next"류가 필요하면 Speech Commands "forward"(2음절) 모델을 먼저 시험하고, 그 다음에 직접 학습을 검토한다.

### 6.4 사용자가 정해야 할 것

1. "next"가 **항상 듣기**에서 필요한가, **PWR 누르고 말할 때만**이면 되는가. (항상 듣기라면 월요일까지는 불가능)
2. 누르고 말하기라면 **단어 구분이 필요한가**(DTW 등록), 아니면 "아무 말이나 = 다음"(소리 크기)이어도 되는가.
3. 본인만 쓸 것인가(DTW 등록 가능), 다른 사람도 쓸 것인가(신경망 필요).
4. "next" 대신 "forward"/"go"/"right"처럼 공개 데이터가 있는 단어로 바꿔도 되는가.
