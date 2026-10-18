# 시뮬레이션 사이트 웹 기술·알고리즘 조사

2026-10-16 · 자료조사팀 5번

기준 문서: `손목컨트롤러_작업지시서.md` (1단계 시뮬레이션, 에어마우스·손목 제스처 요구사항, 빌드·배포 파이프라인)

표기 규칙
- 각 사실 뒤에 출처 URL을 단다.
- **미확인**: 공식 문서로 확인하지 못했거나 출처끼리 엇갈리는 내용이다.
- **설계 제안**: 출처에서 그대로 가져온 값이 아니라 출처를 근거로 이 프로젝트에 맞춰 정한 값이다. 2단계에서 녹화한 IMU 데이터로 다시 조정해야 한다.

---

## 작업지시서와 달라지는 점 (먼저 읽을 것)

| # | 작업지시서 | 조사 결과 | 권고 |
| --- | --- | --- | --- |
| 1 | 스마트폰에서 "기울기 센서(DeviceOrientation)"를 IMU 대신 사용 | DeviceOrientation은 **각도(도)**, DeviceMotion의 `rotationRate`는 **각속도(deg/s)**를 준다. 시계 IMU 자이로가 주는 값은 각속도다 | 폰 입력은 **DeviceMotionEvent.rotationRate**를 주 입력으로 쓴다. 그래야 녹화 데이터 재생·테스트 벡터와 단위가 같다 |
| 2 | Web Speech API(한국어)로 "키트, 다음" 흉내 | Chrome 기본 동작은 **서버 인식(온라인 필수)**. Firefox는 기본 비활성. iOS Safari의 `continuous`는 불안정 보고가 많다 | PC Chrome/Edge를 기준 환경으로 정하고, 연속 인식 대신 **끝나면 다시 시작(onend 재시작)** 방식으로 구현. 미지원 브라우저는 "음성 버튼 누르고 말하기" 대체 UI |
| 3 | Cloudflare Pages 또는 Firebase Hosting | Cloudflare는 **새 프로젝트는 Pages 대신 Workers(정적 자산)** 로 시작하라고 권고한다 | Cloudflare를 고르면 Workers 정적 자산 방식, 아니면 Firebase Hosting. 둘 다 무료 범위로 충분 |
| 4 | 튕김 임계값·시간창은 gesture.json | 손목 튕김 임계값(deg/s)에 대한 공개 표준 수치는 **찾지 못했다** | 아래 권장 기본값은 **설계 제안**이다. 축 선택(전완 축 회전)과 반동(되돌림) 확인을 함께 써야 걷기를 배제할 수 있다 |
| 5 | (명시 없음) | iOS 13+는 센서 권한을 **사용자 탭 안에서** 요청해야 하고, HTTPS가 아니면 자동 거부된다 | 시뮬레이션 사이트에 "센서 켜기" 버튼을 두고 그 클릭 핸들러에서 바로 `requestPermission()` 호출 |

---

## 1. Web Speech API — 한국어(ko-KR) 연속 인식

### 1.1 브라우저별 지원

| 브라우저 | 지원 상태 | 출처 |
| --- | --- | --- |
| Chrome (데스크톱·Android) | 25 이상 지원, `webkitSpeechRecognition` 접두사. caniuse는 "부분 지원"으로 분류 | https://developer.chrome.com/blog/voice-driven-web-apps-introduction-to-the-web-speech-api?hl=en , https://caniuse.com/speech-recognition |
| Edge | caniuse는 79 이후 "미지원"으로 표시. 반면 Microsoft 문서는 Edge Canary/Dev 150.0.4076+에서 플래그를 켜면 **온디바이스 인식(ko-KR 포함)** 을 지원한다고 함 | https://caniuse.com/speech-recognition , https://learn.microsoft.com/en-us/microsoft-edge/web-platform/speech-recognition-api |
| Safari (macOS) | 14.1부터 부분 지원 | https://caniuse.com/speech-recognition , https://developer.apple.com/forums/thread/699881 |
| iOS Safari | 14.5부터 부분 지원 | https://caniuse.com/speech-recognition |
| Firefox | 22~161 "기본 비활성(Disabled by default)" | https://caniuse.com/speech-recognition |
| Samsung Internet | 부분 지원 | https://caniuse.com/speech-recognition |

- 정식 Edge(안정판)에서 기존 클라우드 방식 `webkitSpeechRecognition`이 실제로 동작하는지는 caniuse 표기와 체감이 다를 수 있다 → **미확인**. 구현 시 실제 기기로 확인한다.
- 사양 상태는 W3C 정식 권고가 아님(caniuse "UNOFF"). https://caniuse.com/speech-recognition

### 1.2 제약

- **온라인 의존(Chrome)**: Chrome 등 일부 브라우저는 서버 기반 엔진을 써서 오디오를 웹 서비스로 보내므로 오프라인에서 동작하지 않는다. https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- **온디바이스 옵션**: `processLocally = true`(기본 false)로 로컬 처리를 요구할 수 있고, `SpeechRecognition.available()`/`install()`로 언어 팩을 확인·설치한다. 언어 팩 없이 시작하면 `language-not-supported` 오류. 실험 기능. https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API , https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally
  - Chrome의 온디바이스 출시 버전: Intent to Ship은 데스크톱 135 예정으로 적었고, 제3자(Brave 이슈)는 139(2025-08)로 언급 → 정확한 정식 버전과 **ko-KR 온디바이스 지원 여부는 미확인**. https://groups.google.com/a/chromium.org/g/blink-dev/c/VNOok2dbmHM/m/TQpe9shjCgAJ , https://github.com/brave/brave-browser/issues/55414
  - Edge 온디바이스: ko-KR 명시 지원(Canary/Dev + 플래그). https://learn.microsoft.com/en-us/microsoft-edge/web-platform/speech-recognition-api
- **HTTPS(보안 컨텍스트)**: 마이크 접근은 HTTPS 또는 localhost에서만 허용되므로, 같은 Wi-Fi의 폰에서 `http://192.168.x.x` 개발 서버로 접속하면 음성·센서가 막힌다. https://docs.openwebui.com/troubleshooting/microphone-error , https://scrapbox.io/0b5vr/Secure_Context
  - Chrome 블로그: HTTPS 페이지는 권한을 반복해서 묻지 않고, HTTP 페이지는 다시 묻는다. https://developer.chrome.com/blog/voice-driven-web-apps-introduction-to-the-web-speech-api?hl=en
- **연속 인식(`continuous`)**: 기본값 false(한 번 결과 후 종료). https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
  - iOS에서는 continuous 결과가 계속 길어지는 하나의 문자열이 되거나, 마이크가 멈추지 않는 등 불안정하다는 개발자 보고가 많다(공식 문서 아님). 푸시투토크나 `onend` 재시작을 권장. https://webreflection.medium.com/taming-the-web-speech-api-ef64f5a245e1 , https://developer.apple.com/forums/thread/104752 , https://lilting.ch/en/articles/ios-webspeech-api-tips
  - Chrome도 장시간 침묵 시 자동 종료되므로 `onend`에서 재시작하는 패턴이 일반적 → 종료 시간 수치는 **미확인**.
  - 오프라인 등에서 Chrome이 `network` 오류를 내는 동작은 일반 지식 수준 → **미확인**.

### 1.3 시뮬레이션 구현 권고

1. `const SR = window.SpeechRecognition || window.webkitSpeechRecognition;` 로 감지, 없으면 음성 패널에 "이 브라우저는 미지원" + 텍스트 입력으로 대체.
2. `lang = 'ko-KR'`, `continuous = true`, `interimResults = true`, `onend`에서 사용자가 끄지 않았으면 재시작.
3. 판정은 **최종 결과(isFinal)** 문자열에서 호출어+명령("키트 다음", 띄어쓰기·쉼표 무시)을 찾는다. "다음" 단독은 무시. 오인식 대비 호출어 변형("키트", "킷", "키 트")을 설정에 둔다(설계 제안).
4. 화면에 "브라우저 음성 인식은 흐름 검증용이며 실제 시계 음성 엔진 정확도와 무관"을 표시(작업지시서 요구).

---

## 2. DeviceOrientation / DeviceMotion API

### 2.1 단위와 값

- `DeviceMotionEvent.rotationRate`: 각 축의 회전 속도, **도/초(deg/s)**. 하드웨어가 지원하지 않으면 `null`. https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/rotationRate , https://w3c.github.io/deviceorientation/
- `DeviceMotionEvent.interval`: 샘플 간격, **밀리초(ms)**. https://w3c.github.io/deviceorientation/
- `DeviceOrientationEvent` alpha/beta/gamma: **도(deg)** 단위의 각도. alpha [0,360) Z축, beta [-180,180) X′축, gamma [-90,90) Y″축. https://w3c.github.io/deviceorientation/
- 역사적 주의: Chrome Android m66 무렵 rotationRate 단위가 바뀌었다(WebVR polyfill은 "라디안→도로 사양에 맞춤"이라 기록). 현행 브라우저는 사양대로 deg/s로 간주한다. https://github.com/immersive-web/webvr-polyfill/releases/tag/v0.10.3 , https://forum.playcanvas.com/t/vr-mode-apps-super-sensitive-to-motion/7055
- rotationRate의 alpha/beta/gamma가 어느 축인지 MDN 설명과 사양 설명이 엇갈린다는 지적이 있다 → **미확인**. 시뮬레이션에 "축 확인" 화면(폰을 각 방향으로 돌려 어느 값이 커지는지 표시)을 두고 매핑을 `gesture.json`에서 바꿀 수 있게 한다(설계 제안).
- 이벤트 주기: 기기·브라우저마다 다르며 Chrome m65/m66에서 5~10Hz로 떨어진 회귀가 있었다. 현재 일반 주기는 **미확인** → `event.interval`을 읽어 시간 기반으로 필터를 계산한다(샘플 수 기반 금지). https://github.com/immersive-web/webvr-polyfill/releases/tag/v0.10.3

### 2.2 권한(iOS 13+)과 HTTPS

- 사양: `DeviceMotionEvent.requestPermission()` / `DeviceOrientationEvent.requestPermission()`은 **일시적 사용자 활성화(transient activation)** 가 없으면 `NotAllowedError`로 거부. 결과는 `"granted"` 또는 `"denied"`. 인터페이스 전체가 `[SecureContext]`. https://w3c.github.io/deviceorientation/ , https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/requestPermission_static
- iOS 13부터 이 권한 호출이 필요하며 HTTPS가 아니면 자동 거부된다는 개발자 보고. https://yal.cc/js-device-motion/ , https://forum.ionicframework.com/t/deviceorientationevent-in-ios-13-needs-user-permission/175892
- Safari는 `touchstart`를 사용자 제스처로 보지 않는다는 보고(`touchend`/`click`은 됨). https://yal.cc/js-device-motion/
- 클릭 후 Worker 왕복 등 비동기 단계를 거친 뒤 호출하면 거부되는 WebKit 버그. → 클릭 핸들러 안에서 **동기적으로 바로** 호출. https://bugs.webkit.org/show_bug.cgi?id=269706
- 한 번 거부하면 다시 묻지 않는 경우가 있어 Safari 재시작·사이트 데이터 삭제가 필요하다는 커뮤니티 보고 → 공식 확인은 **미확인**. https://forum.defold.com/t/how-to-force-safari-browser-to-allow-deviceorientation-permission-solved/75641
- Android Chrome은 `requestPermission`이 없으므로 기능 감지(`typeof DeviceMotionEvent.requestPermission === 'function'`) 후 분기. https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/requestPermission_static

### 2.3 구현 권고

```ts
// "센서 켜기" 버튼 click 핸들러 안에서 await 이전에 다른 비동기 작업을 넣지 않는다.
btn.addEventListener('click', async () => {
  const DM = DeviceMotionEvent as any;
  if (typeof DM.requestPermission === 'function') {
    const r = await DM.requestPermission();
    if (r !== 'granted') return showDenied();
  }
  window.addEventListener('devicemotion', (e) => {
    const rr = e.rotationRate; // deg/s, null 가능
    if (!rr) return;
    feedImu({ t: e.timeStamp, gx: rr.beta ?? 0, gy: rr.gamma ?? 0, gz: rr.alpha ?? 0, dtMs: e.interval });
  });
});
```

축 이름 매핑(gx/gy/gz ↔ alpha/beta/gamma)은 위 2.1의 **미확인** 사항이므로 설정값으로 둔다.

---

## 3. 자이로 기반 에어마우스 알고리즘

### 3.1 처리 순서 (출처 종합)

1. 정지 상태에서 자이로 **영점(bias) 보정** — 시작 시 오프셋 측정. https://tscircuit.com/hrithik18k/air-mouse/blob/airMouse_with_drag.ino
2. **데드존** — 각속도가 미리 정한 범위 안이면 정지로 보고 0 처리, 누적 드리프트 제거. https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/6164808
3. **저역통과 필터(EMA)** — `y = y + α(x − y)`.
4. **감도/가속 곡선** — 각속도 → 픽셀 이동량.
5. 이동량이 0이면 HID 보고를 생략, 소수점 잔여분은 누적(설계 제안).

### 3.2 수치 근거

| 항목 | 출처 값 | 출처 |
| --- | --- | --- |
| 데드존 | ±2.0 deg/s (ESP32 에어마우스 예제) | https://tscircuit.com/hrithik18k/air-mouse/blob/airMouse_with_drag.ino |
| 데드존 | ±1.5 deg/s, 정지 시 떨림 제거 보고 | https://esp32-s3-lcd.ximg.app/ble-air-mouse.html |
| EMA 계수 | α = 0.2 (샘플 단위) | https://tscircuit.com/hrithik18k/air-mouse/blob/airMouse_with_drag.ino |
| 감도 | 선형 0.25 배 (예제) | 동일 |
| 대안 필터 | 1€ 필터: 속도에 따라 차단주파수가 변해 정지 시 떨림↓, 빠를 때 지연↓. 시작값 mincutoff ≈ 1 Hz, beta는 0에서 시작해 10배씩 조정 | https://gery.casiez.net/1euro/ , https://github.com/casiez/OneEuroFilter |
| 가속 곡선 | Windows "포인터 정확도 향상"은 느린 이동은 더 느리게, 빠른 이동은 더 멀리 가는 속도 의존 이득 곡선. 정확한 수식은 공개 자료에서 확인 못 함 → **미확인** | https://www.howtogeek.com/321763/what-is-enhance-pointer-precision-in-windows/ |
| 드리프트 원인 | 가속도 적분으로 속도를 구하면 멈춘 뒤에도 커서가 흐름 → 각속도(자이로) 직접 사용이 유리 | https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/8933875 |

- 주의: Windows 자체 포인터 가속이 PC 쪽에서 한 번 더 적용될 수 있다. 우리 곡선과 겹치면 체감이 달라지므로 2단계 시험 시 "포인터 정확도 향상" 켬/끔 둘 다 확인한다(설계 제안, 근거: 위 howtogeek).

### 3.3 권장 알고리즘 (설계 제안)

- **EMA는 시간 기반**으로 계산: `α = 1 − exp(−dt / τ)`, τ ≈ 30 ms. 100 Hz(dt=10ms)에서 α≈0.28로 위 예제의 0.2와 비슷한 수준. 브라우저(이벤트 주기 들쭉날쭉)와 펌웨어(고정 주기)가 같은 결과를 내려면 샘플 수가 아니라 dt를 써야 한다.
- **데드존은 소프트(연속)형 + 히스테리시스**: `|ω| < dz`면 0, 넘으면 `sign(ω)(|ω| − dz)`로 빼서 경계에서 튀지 않게. 진입 2.0 / 해제 1.5 deg/s.
- **가속 곡선(거듭제곱형)**: `v = gain × sign(ω′) × |ω′|^p`, p = 1.3 내외, 상한 클램프. 감도 3단계는 gain만 바꾼다.
- **드리프트 방지**
  1. 버튼을 놓는 순간 필터 상태·잔여 소수·속도 모두 0으로 리셋하고 보고 중지(작업지시서 "즉시 정지").
  2. 버튼을 누른 직후 첫 50ms 동안은 출력 0(누르는 동작 자체의 흔들림 제거).
  3. 정지 판정(모든 축 |ω| < 3 deg/s가 1초 지속) 동안 bias를 아주 느리게 갱신(EMA, τ ≈ 5 s).
- 축: 커서 X ← 손목 좌우 회전(요), 커서 Y ← 위아래 기울임(피치). 롤(전완 축 회전)은 커서에 쓰지 않는다 — 튕김 제스처 축과 겹치지 않게(설계 제안).

---

## 4. 손목 튕김(flick) 제스처 검출

### 4.1 조사된 근거

- LG 스마트워치 특허: 한 축으로 **제1 임계 속도 이상** 회전하면 스냅, 시간창 안에 **반대 방향** 회전이 오면 두 번째 스냅으로 판정. 구체 수치는 없음. https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11389084
- 웨어러블 제스처 특허: z축 자이로 피크로 후보를 넓게 잡고(오검출 허용), 2단계 분류로 걸러냄. 샘플링 200 Hz/50 Hz 사례. https://patents.justia.com/patent/12204694 , https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10684694
- 사용자별 보정: 훈련 동작에서 관측한 최소 피크의 85~95%를 임계값으로. https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9978095
- 배경 움직임 대비 **상대 임계값**(현재 배경 변동 수준 기준)도 가능 → 걷는 중 자동으로 임계값이 올라가게. https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10303239
- DoubleFlip(Ruiz & Li, 2011): 99명 2,100시간 일상 데이터에서 "뒤집었다 되돌리기" 왕복 동작이 오검출에 매우 강함 → **왕복(반동) 조건**이 걷기 배제의 핵심 근거. https://research.google.com/pubs/archive/37155.pdf , https://informalscience.org/research/double-flip-motion-gesture-delimiter-mobile-interaction/
- 손목 회내/회외(전완 축 회전) 속도 규모:
  - 산업 작업자 평균 최대 약 2,200 deg/s(빠른 반복 작업). https://stacks.cdc.gov/view/cdc/204524
  - 식사·음료 등 일상 동작 최대 약 400 deg/s(2차 인용) → 원 논문 확인은 **미확인**. https://atna-mam.utcluj.ro/index.php/Acta/article/download/2711/2122
- 걷기 중 팔 흔들림: 주로 어깨 중심 앞뒤 회전 축이며, 손목 자이로 연구는 이 축(전완 길이 방향 z축 제외)으로 분석. 걷기 피크 각속도 수치 자체는 확보 못 함 → **미확인**. https://www.mdpi.com/1424-8220/20/20/5963
- Apple Watch 손목 튕기기는 머신러닝 모델을 쓴다는 2차 보도 — 단순 임계값만으로는 한계가 있음을 시사. https://canaltech.com.br/smartwatch/apple-watch-ganha-funcao-magica-veja-se-o-seu-modelo-sera-compativel/
- 시계 IMU(QMI8658)의 자이로 범위: ±16 ~ ±2048 dps 선택. 튕김 피크가 수백~천 deg/s대일 수 있으므로 **±1024 이상** 설정 권장(포화 방지). ODR 목록은 출처끼리 엇갈림 → **미확인**. https://files.waveshare.com/upload/5/5f/QMI8658A_Datasheet_Rev_A.pdf , https://esphome.io/components/motion/qmi8658/

> 손목 튕김의 표준 임계값(deg/s)을 제시한 공개 논문·공식 문서는 **찾지 못했다.** 아래 수치는 전부 설계 제안이다.

### 4.2 권장 판정 로직 (설계 제안)

1. **축 선택**: 전완 길이 방향 회전(회내/회외, 시계 기준 롤 축)만 본다. 걷기 팔 흔들림은 다른 축이 주성분이다.
2. **축 우세 비율**: 판정 축 |ω|가 나머지 두 축 합성 크기의 1.5배 이상일 때만 후보.
3. **피크 임계값**: 판정 축 |ω| ≥ 300 deg/s (일상 동작 최대 ~400과 겹치므로 단독 사용 금지, 아래 조건과 함께).
4. **짧음 조건**: 임계값을 넘은 구간이 30~200 ms. 더 길면 "천천히 크게 돌리기"로 보고 무시.
5. **반동 조건**: 피크 후 250 ms 안에 반대 방향으로 ≥ 피크의 30% (또는 120 deg/s) 되돌림. 손목을 튕기면 자연스럽게 되돌아오는 것을 이용 — 방향은 **첫 피크의 부호**로 정한다(바깥=다음, 안=이전).
6. **사전 정숙 조건**: 피크 직전 300 ms 동안 전 축 RMS < 80 deg/s(걷기·손짓 중에는 이 조건이 깨져 배제됨).
7. **적응형 임계값(선택)**: 최근 2초 RMS × 4와 300 중 큰 값을 임계값으로.
8. **불응기**: 인식 후 800 ms 재인식 금지(작업지시서 확정값).
9. **에어마우스 버튼을 누르고 있는 동안·제스처 잠금 중에는 판정 중지**.
10. 입력 전 1차 저역통과(τ ≈ 10 ms)만 가볍게 — 강한 필터는 피크를 깎는다.

검증 방법: 시뮬레이션 재생 기능으로 (a) 의도적 튕김 각 방향 30회, (b) 걷기 5분, (c) 발표 손짓 5분, (d) 천천히 돌리기 30회를 녹화해 재현율·오검출을 표로 비교하며 값을 조정한다.

---

## 5. Vite 정적 사이트 배포 — Cloudflare vs Firebase Hosting

### 5.1 비교

| 항목 | Cloudflare (Workers 정적 자산 / Pages) | Firebase Hosting |
| --- | --- | --- |
| 현재 권장 | 새 프로젝트는 Pages보다 **Workers로 시작**하라고 공식 안내 | 그대로 사용 |
| 무료 한도 | Workers 정적 자산 요청은 **무료·무제한**, 저장 비용 없음. Pages 무료: 월 500빌드, 사이트당 2만 파일, 파일당 25 MiB | Spark: 저장 10 GB, 전송 **월 10 GB**(초과 시 다음 달까지 사이트 비활성) |
| GitHub 연동 | `cloudflare/wrangler-action` + API 토큰 | `firebase init hosting:github`가 서비스계정·시크릿·워크플로를 자동 생성. PR마다 미리보기 채널 URL을 댓글로 |
| HTTPS | 기본 제공(센서·음성 필수 조건 충족) — 세부 **미확인** | 기본 제공 — 세부 **미확인** |

출처
- https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/ (Workers 권장 문구)
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- https://developers.cloudflare.com/pages/platform/limits/
- https://firebase.google.com/docs/hosting/usage-quotas-pricing
- https://firebase.google.com/docs/hosting/github-integration

**권고**: 전송량 상한이 없는 **Cloudflare Workers 정적 자산**을 1순위. 펌웨어 `.bin`은 GitHub Release에 두므로 사이트 용량은 작다. PR 미리보기가 중요하면 Firebase.

### 5.2 Cloudflare Workers 정적 자산 설정 예

`/sim/wrangler.toml`
```toml
name = "wrist-sim"
compatibility_date = "2026-10-01"

[assets]
directory = "./dist"
not_found_handling = "single-page-application"
```
`[assets] directory`, `not_found_handling = "single-page-application"` 근거: https://developers.cloudflare.com/workers/static-assets/
(compatibility_date 값과 Worker 스크립트 없이 자산만 배포하는 최소 구성은 **미확인** — 배포팀이 `wrangler deploy --dry-run`으로 확인)

### 5.3 GitHub Actions 예 — Cloudflare

공식 예(Pages Direct Upload)를 Vite 빌드에 맞춘 것. https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/

```yaml
name: 시뮬레이션 사이트 배포
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
        working-directory: sim
      - run: npm test && npm run build
        working-directory: sim
      - uses: cloudflare/wrangler-action@v4
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: sim
          # Pages 사용 시:
          command: pages deploy ./dist --project-name=wrist-sim
          # Workers 정적 자산 사용 시: command: deploy
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}
```
- 토큰 권한: Account → Cloudflare Pages → Edit. 시크릿 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. (출처 동일)
- `actions/setup-node@v4`, `workingDirectory` 입력 이름은 공식 예제에 없음 → **미확인**(배포팀 확인).

### 5.4 GitHub Actions 예 — Firebase Hosting

공식 액션 `FirebaseExtended/action-hosting-deploy`. https://github.com/FirebaseExtended/action-hosting-deploy

```yaml
name: 시뮬레이션 사이트 배포 (Firebase)
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - run: npm ci && npm test && npm run build
        working-directory: sim
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          projectId: 프로젝트-ID
          channelId: live
          entryPoint: sim
```
- PR 미리보기는 같은 액션에서 `channelId`를 생략하고 `pull_request` 트리거로 실행. (출처 동일)
- `@v0` 태그와 `entryPoint` 입력은 저장소 README로 재확인 필요 → **미확인**. `firebase init hosting:github`로 생성하면 이 파일이 자동으로 만들어진다. https://firebase.google.com/docs/hosting/github-integration
- `firebase.json`의 `"public": "dist"`, SPA 재작성 설정 필요.

---

## 6. 결론 — `/shared/gesture.json` 권장 기본값 (설계 제안)

단위: 각속도 deg/s, 시간 ms. 시뮬레이션(TS)과 펌웨어(C++)가 같은 값·같은 수식을 쓴다. 모든 필터는 샘플 수가 아니라 dt(ms) 기반.

```json
{
  "version": 1,
  "imu": {
    "sampleRateHz": 100,
    "gyroRangeDps": 1024,
    "axisMap": { "yaw": "gz", "pitch": "gx", "roll": "gy" },
    "axisSign": { "yaw": 1, "pitch": 1, "roll": 1 },
    "biasCalib": { "stillThresholdDps": 3.0, "stillMs": 1000, "trackTauMs": 5000 }
  },
  "airMouse": {
    "deadzoneDps": { "enter": 2.0, "exit": 1.5 },
    "lowpassTauMs": 30,
    "curve": { "type": "power", "exponent": 1.3, "maxPxPerReport": 40 },
    "sensitivity": [
      { "name": "낮음", "gain": 0.15 },
      { "name": "보통", "gain": 0.25 },
      { "name": "높음", "gain": 0.40 }
    ],
    "defaultSensitivity": 1,
    "startSuppressMs": 50,
    "resetOnRelease": true
  },
  "flick": {
    "axis": "roll",
    "prefilterTauMs": 10,
    "peakThresholdDps": 300,
    "adaptive": { "enabled": true, "windowMs": 2000, "rmsMultiplier": 4.0 },
    "axisDominanceRatio": 1.5,
    "minAboveMs": 30,
    "maxAboveMs": 200,
    "rebound": { "required": true, "windowMs": 250, "minRatio": 0.3, "minDps": 120 },
    "quietBefore": { "windowMs": 300, "maxRmsDps": 80 },
    "refractoryMs": 800,
    "outwardSign": 1,
    "disableWhileAirMouse": true
  }
}
```

조정 우선순위: ① `axisMap`/`outwardSign`(실기기·폰 축 확인) → ② `peakThresholdDps`·`rebound` → ③ `quietBefore`·`adaptive` → ④ 에어마우스 `gain`.
`refractoryMs: 800`만 작업지시서 확정값이고, 나머지는 2단계 녹화 데이터로 다시 정한다.
