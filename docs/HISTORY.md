# 작업 기록

README 에서 옮긴 개발 과정 기록이다(단계 현황, 실기 확인, 빌드 크기). 레퍼런스로 따라 할 내용은 [README](../README.md)와 [따라 하기 안내서](../sim/guide.html)에 있다.
MAC 주소는 넷째 바이트를 가렸다(앞 3바이트는 제조사 Espressif 공통, 끝 2바이트는 BLE 이름에 이미 보인다). 원본 부팅 로그는 `docs/bootlog_*.txt`.

## 시계에 올라가 있는 펌웨어(개발용 두 대)

| 시계 | MAC | BLE 이름 | 펌웨어 | 비고 |
| --- | --- | --- | --- | --- |
| 1호기(COM7) | 98:a3:16:xx:2d:38 | 손목 컨트롤러 2D3A | **0.0.0-dev.35ef794** (CI run 39079577855, 1,563,088 B) | 2026-10-18 기록·부팅 정상, BLE 연결됨, 시각 맞춤. 배터리 있음(0xA4=25%, 충전 중). 로그: docs/bootlog_dev1_v0.0.0-dev.35ef794.txt |
| 2호기(COM8) | 98:a3:16:xx:d7:c0 | 손목 컨트롤러 D7C2 | **0.0.0-dev.75008c8** (CI run 39003763068, 2,430,672 B) | 2026-10-17 기록·부팅 정상. 터치 초기화 OK, 직렬 명령 OK, 시각 맞춤 후 재부팅에도 RTC 유지. 배터리: AXP2101 이 '배터리 없음'(0x00 bit3=0, 0xA4=0) — 배터리 미장착으로 보임, BLE 배터리 값은 50 |

- 메모리 여유(2호기, 모두 켠 뒤): 내부 RAM 117,456 B, 최대 블록 100,352 B. 로그: docs/bootlog_dev2_v0.0.0-dev.75008c8.txt
- 시각 맞추기: 웹앱 설치 페이지 '시계 시간 맞추기' 또는 직렬 `t <유닉스초> 540`
- 웹앱(PWA) 최신: **https://ibrkiller-penz.github.io/watchpeter/** (공개 저장소 ibrkiller-penz/watchpeter 에 빌드 파일만, 2026-10-17). watchpeter.web.app 은 그보다 이전 버전(Firebase 재배포 전)

- 2026-10-18 실기 확인(1호기, dev.d408fac): PowerPoint 2024 슬라이드 쇼에서 한글 입력 상태로도 암전(마침표 '.') 동작 — 키보드 './B' 와 시계 가운데 길게 누르기 모두 SlideShowWindow.View.State=3(검은 화면) 확인. 키를 가로채는 프로그램 없음.

## 빌드 크기 기록

마지막 성공 수동 빌드: run 39024944316 — main 커밋 019ad85(UI v2 P0), 앱 1,497,840B(0x16DAF0, 앱 파티션 4MB 의 36%), 합친 이미지 1,563,376B, 정적 DIRAM 124,434B(27.5%). 음성 제거 직후 run 39020856106(e339ce1) 대비 앱·합친 이미지 +59,312B(한글 글꼴 4종 + 숫자 128px + 자물쇠, Montserrat 14·28·40 삭제 반영), 정적 DIRAM +280B.
(그 전 기록) 마지막 성공 수동 빌드: run 39020856106 — 커밋 e339ce1(음성 전체 제거), 앱 1,438,528B(0x15F340, 앱 파티션 4MB 의 34%), 합친 이미지 1,504,064B, 정적 DIRAM 124,154B(27.5%). 음성이 있던 run 39003763068(75008c8) 대비 합친 이미지 −926,608B, 앱 −402,320B, 정적 DIRAM −31,460B.

## 웹앱 배포 메모

- 주소: **https://watchpeter.web.app/** (시뮬레이터) · **https://watchpeter.web.app/install.html** (시계에 설치)
- Firebase 프로젝트 `firsttest-5db1f` 의 Hosting 사이트 `watchpeter`(penedu 와 따로). 설정은 `sim/firebase.json`·`sim/.firebaserc`.
- 배포: `cd sim && npm run deploy` (빌드 → `npx firebase-tools deploy --only hosting:watchpeter`)

## 손목 튕김 1호기 녹화 결과 (2026-10-18)

4. 1호기 녹화(`docs/imu_real_flick_2026-10-18_raw.txt` → `sim/public/samples/imu_real_flick_2026-10-18.csv`, 벡터 `shared/test-vectors/imu-real.json`): 축(roll = gy)은 맞았고 세게 튕긴 9번(바깥 6·안쪽 3)은 모두 잡혔다. 약한 안쪽 튕김(피크 150dps 미만)은 놓친다. 이 데이터로 `flick.peakThresholdDps` 300 → 220, `flick.rebound.minDps` 120 → 80 으로 낮췄다(150·50 까지 낮춰도 천천히 움직인 구간 오검출 0 — 여유를 두고 220·80).

## 단계 현황 (2026-10-17)

| 단계 | 내용 | 상태 |
| --- | --- | --- |
| 진행 1 | 저장소 구조, `/shared` 설정·스키마·테스트 벡터 | 완료 |
| 진행 2 | 시뮬레이션 사이트 구현 | 완료 — 테스트 141개 통과, 브라우저 확인 |
| 진행 2 | 사이트 배포(Cloudflare Pages) | 대기 — CI 배포 단계는 주석으로 꺼 둠(시크릿·사용자 확인 필요) |
| 2단계 0 | 펌웨어 로직 C++ 포팅 + 호스트 테스트 | 완료 — GitHub Actions 에서 공유 테스트 벡터 통과(2026-10-16). 저장소: github.com/ibrkiller-penz/wrist-controller (비공개) |
| 2단계 5 | keymap.json → C 헤더 생성 | 완료(`tools/gen_keymap_header.py`) |
| 2단계 1 | 기존 펌웨어 백업, Waveshare 예제로 화면·터치 확인 | 백업 완료(`backup/`, 16MB, SHA256 기록). 예제 확인은 대기(사용자 확인) |
| 2단계 2 | 화면: Waveshare C6 BSP 2.0.0 + LVGL 9.5.0, 상태 화면(모드·BLE 상태·"BOOT = NEXT"·마지막 키) | 2026-10-16 시계에 기록(플래시 전체 지움 후 0x0), 부팅 정상. 메모리: 부팅 395KB → 화면 후 305KB → BLE 후 263KB 여유(최대 블록 246KB). 로그: docs/bootlog_v0.0.0-dev.8366a04.txt. 화면 표시 정상(사용자 확인). |
| 2단계 3 | BLE HID 키보드(NimBLE + esp_hidd, 복합 맵의 키보드 ID 1), Just Works 본딩 NVS 저장, 끊기면 재광고, BOOT 짧게 = → | 시계에서 광고 시작 확인("손목 컨트롤러", BT MAC 98:a3:16:xx:2d:3a). 2026-10-16 실기 확인: Windows 페어링 성공, BOOT 짧게 → 슬라이드 넘어감(사용자 확인). **남음**: 전원 껐다 켠 뒤 자동 재연결, macOS |
| 2단계 4 | 복합 HID: 마우스 이동(ID 2, ±127 로 나눠 전송)·버튼, 미디어(컨슈머 ID 3) 실제 전송 | 구현·빌드 성공(run 38873038213). **실기 확인 필요**: Windows·macOS 가 한 장치(키보드+마우스+미디어)로 인식하는지 |
| 2단계 5 | 터치(FT3168 원시 좌표 20ms) + 시뮬레이터와 같은 제스처 판정(`wc::TouchGesture`, 호스트 테스트) → 코어 hitTest. 세 모드 화면·상태줄·시트·연결 대기·끊김 배너·시계 설정 화면(LVGL, 영문 글꼴) | 발표 터치 넘기기 먼저 빌드 성공(run 38870632769), 전체 화면 빌드 성공(run 38873038213). **실기 확인 필요**: 터치 좌표 방향(로그 '터치 누름 (x, y)'), 오른쪽 탭 = →·왼쪽 탭 = ←(손 뗄 때), 가로 스와이프 = 모드 전환 |
| 2단계 6 | IMU QMI8658(주소 0x6B/0x6A 자동 탐지, ±1024dps·±4g·약 125Hz) 100Hz 읽기 → 코어, 직렬 CSV 녹화(`t_ms,gx,gy,gz,ax,ay,az`) | 구현·빌드 성공(run 38874267710). **실기 확인 필요**: 주소·WHO_AM_I, 축 방향, 녹화 파일을 시뮬레이션에서 재생 |
| 2단계 7 | 에어마우스(BOOT 누른 채)·손목 튕김(발표 모드 다음/이전) — 판정은 코어(영점 추적 포함), 펌웨어는 센서 배선 | 구현·빌드 성공(run 38874267710). **실기 튜닝 필요**: gesture.json imu.axisMap/axisSign(보드 기준 초기값), 감도 |
| 2단계 8 | 음성 "Hi ESP" = 다음(ESP-SR WakeNet9s, ES7210 마이크) | **제거(2026-10-17)** — C6 메모리 부족(PSRAM 없음). 구현·빌드는 run 38875515951 까지 있었다. 나중 계획: docs/research/gemini-later.md |
| 2단계 9 | 전원: 무입력 20초 뒤 화면 꺼짐(밝기 0 + 패널 끔), 터치(버림)·BOOT·손목 들기로 켜짐, AXP2101 배터리 %·충전 표시(읽기만). 값은 `shared/gesture.json` power | 구현·빌드 성공(run 38876590739). **실기 확인 필요**: 배터리 % 레지스터 값, 손목 들기 축·임계값, 꺼짐 중 전력 |
| 추가 1 | BLE 배터리 서비스 값(AXP2101 잔량, 읽기 실패 시 마지막 값/50, notify) + 기본 이름에 MAC 끝 4자리 | 구현·빌드 성공(run 38999287709). **실기 확인 필요**: Windows '배터리 없음' 경고가 사라지는지, 잔량 표시 |
| 추가 2 | 시계 모드(기본 시작, 키 안 보냄): 시:분·초 점·날짜/요일, RTC PCF85063A(UTC)·시간대 NVS(기본 +540), 직렬 t·설치 페이지 시간 맞추기 | 구현·빌드 성공(run 39001759096). **실기 확인 필요**: RTC 주소 0x51·전원 껐다 켠 뒤 시각 유지, Web Serial 로 포트 열 때 재부팅 여부 |
| 추가 3 | 실행 모드(코딩 모드 대체, docs/research/launcher.md) + 매크로 동작(steps: chord/wait/text/consumer, 최대 24단계) — TS·C++ 코어·스키마·생성기·벡터(macro.json)·시뮬레이터(가상 PC 작업표시줄, 설정 화면 편집) | 구현·빌드 성공(run 39001759096). **실기 확인 필요**: launcher.md 4장 목록(작업표시줄 고정 순서, 한글 상태에서 Win+R, 글자 간격 15ms, `:` `/`) |
| 추가 4 | PWR 누르고 말하기 중 본인 목소리 "next"(MFCC+DTW) | **제거(2026-10-17)** — 음성 전체와 함께 뺐다(PTT·폰 녹음·vnext 포함) |
| 진행 4 | 음성 방식 결정 | **최종 결정(2026-10-17)**: 음성은 만들지 않는다(메모리 빠듯 — Gemini 도 보류). 다음 슬라이드는 BOOT·터치·손목 튕김만 |
| UI v2 P0 | design/v2/README.md P0-1~7: 색 토큰(565 스냅, 시계 #D6CEB5), 글꼴 파이프라인(shared/strings.ko.json → strings_gen.h, `tools/gen_fonts.py` = lv_font_conv 1.5.3 → kr_20/24/28/32 압축·num_128 비압축 + 시뮬레이터 woff2, `tools/check_strings.py` CI, Pretendard 1.3.9 OFL), 상태줄(한글 모드명·레일 4칸·자물쇠·시계 모드 시각 숨김), 시계(5칸 128px·한글 날짜·요일 칩·8점 궤도), 발표(5칸 경과·레일·암전 칩·3단 플래시·시트 H344+설정 행), 실행·회의·설정·페어링·배너 한글화, 오발송 방지(모든 키 뗄 때·12px·600ms·스와이프 80/60/1.5/800·쇼 중 140, 공유 벡터 touch.json 을 TS·C++ 가 실행). 시뮬레이터도 같은 문구·글꼴·좌표 | 구현·빌드 성공(run 39024944316). **실기 확인 필요**: 아래 'UI v2 실기 확인' |
| 실기 피드백 1 | BOOT 짧게 = 시계 ↔ 직전 모드(모든 모드, 키 안 보냄 — 코어 prevMode, TS·C++·벡터), 암전 B → 마침표(.)(한글 입력 상태 'ㅠ' 문제), 실행 1쪽 Ctrl+Alt+1~6(설치 페이지 7 'PC 바로 가기 키 설정' + `sim/public/pc-setup/wrist-shortcuts.ps1`, Claude·카카오톡·한글 길게 대안 없음), 시뮬레이터 측면 버튼 위 BOOT·아래 PWR | 구현·빌드 성공(run 39079577855, 35ef794, 합친 이미지 1,563,088B). **실기 확인 필요**: 한글 입력 상태에서 '.' 암전, Ctrl+Alt+N 이 PC 에서 앱을 여는지 |
| 실기 피드백 2 | 설정 화면 닫기: 위로 쓸기 조건을 축 비율(40px·1.2)로, 움직이는 도중 바로 닫힘, BOOT 짧게 = 닫고 시계, PWR 짧게 = 닫기만, 맨 아래 '닫기' 탭(88px), 30초 무입력 자동 닫힘(gesture.json touch.settingsClose*·timing.settingsIdleCloseMs). 시뮬레이터도 같은 규칙(목록 맨 아래일 때 위로 쓸기 닫기) | 구현·빌드 성공(run 39080910963, 13762df, 합친 이미지 1,563,696B). **실기 확인 필요**: 1호기에서 위로 쓸어 닫기 |
| 실기 피드백 3 | 끊김 배너: 시계 모드에서는 띄우지 않음(상태줄 빨간 BLE 점멸만), 다른 모드는 48px 한 줄(16,438) '연결 끊김 · 12초' → 60초 뒤 '연결 끊김 · PC 블루투스 확인', 버린 입력 흔들림·'보내지 못함' 유지. 시뮬레이터 같게 | 구현·빌드 성공(run 39083594288, 3919ec9, 합친 이미지 1,563,776B). **실기 확인 필요**: 2호기 |
| 실기 피드백 4 | 펌웨어를 세 파일로 나눠 쓰기(NVS 보존): CI 아티팩트 bootloader/partition-table/app .bin + flash_args + FLASH.txt, 웹 설치 매니페스트 parts 3개(0·32768·65536), merged 는 완전 초기화용. BLE: 광고 실패 500ms 재시도(멈춤 방지), 암호화 실패 = 그 PC 본드 삭제 + 'PC에서 이 장치를 제거하고 다시 추가하세요'(상태줄 노랑·대기 화면·배너), 연결 중/다시 켜는 중 표시, 보안 요청 rc=2 로그 낮춤 | 구현·빌드 성공(run 39086005284, d408fac: bootloader 23,232B·partition-table 3,072B·app 1,502,816B, merged 1,568,352B). **실기 확인 필요**: 나눠 쓴 뒤 재부팅해도 페어링 유지, Windows 에서 장치 제거 후 다시 추가 |
| 실기 피드백 5 | 암전(발표 가운데 길게)만 600 → 360ms(gesture.json touch.blackoutHoldMs, 스키마·TS·C++·생성기, touch.json 359/360·회의 타일 600 유지 케이스). 가운데 탭 상한도 360, 시뮬레이터 게이지 360ms | 구현·빌드 성공(run 39092412210, f649122: bootloader 23,232B·partition-table 3,072B·app 1,503,120B) |
| 실기 피드백 6·7 | 에어마우스 기본 끔(gesture.json airMouse.enabled, 설정 화면 '에어마우스' 줄·NVS, 꺼지면 감도 흐리게, 에어마우스 벡터는 configPatch 로 켬 + 기본 끔 케이스), 손목 튕김은 다음만(flick.inAction none 기본/prev, 벡터 flick-in-ignored·flick-in-prev, 시뮬레이터 합성 결과 표시) | 구현·빌드 성공(run 39092412210, f649122: bootloader 23,232B·partition-table 3,072B·app 1,503,120B) |
| 실기 피드백 8 | 손목 튕김 안쪽·바깥 모두 다음(flick.inAction next 기본, 허용 none/prev/next), peakThresholdDps 300→220·rebound.minDps 120→80, 실기 녹화 CSV(sim 재생 목록) + 공유 벡터 imu-real.json(다음 9회·천천히 구간 0회, TS·C++) | 구현·빌드 성공(run 39094014337, cd19130: bootloader 23,232B·partition-table 3,072B·app 1,503,152B) |
| 실기 피드백 9 | 손목 튕김 판정을 가속도 기준으로(flick.detector accel 기본/gyro, flick.accel lpfTauMs 200·peakG 0.8·maxAboveMs 250·quietWindowMs 300·quietMaxRmsG 0.25, 방향 무관 다음, 이벤트·직렬 로그에 hp 피크). ImuSample 에 가속도(TS·C++), 펌웨어 imuTask → 코어, 벡터 accel.json·imu-real.json(accel)·gesture.json(gyro patch). 시뮬레이터 입력(CSV·폰·합성·드래그) 가속도·설정 그래프·안내서 | 구현·빌드 성공(run 39097922443, 7de3226: bootloader 23,232B·partition-table 3,072B·app 1,512,064B) |
| 실기 피드백 10 | 손목 튕김 기본 끔(gesture.json flick.enabled false — 꺼지면 판정 자체 없음, IMU 는 손목 들기·녹화용). 시계 설정 맨 위 '손목 튕김' 줄(NVS flick, 설정 줄 46→40px). 튕김 벡터는 configPatch enabled:true, 기본 끔 케이스 flick-off-by-default. 시뮬레이터 설정 화면·입력 패널·그래프 '꺼짐' 표시, README·guide.html, 소스(GitHub) 링크 | 구현·빌드 성공(run 39110297146, 0f2a767: bootloader 23,232B·partition-table 3,072B·app 1,512,960B) |
| 실기 피드백 11 | PWR 3초 = '전원을 끌까요?' 확인([끄기]·[취소] 183×112, PWR 짧게 = 끄기, BOOT 짧게·10초 = 취소, 확인 중 키·스와이프·튕김 없음). 코어(TS·C++)는 powerConfirm 상태와 powerOff 요청 이벤트만, 펌웨어가 NVS 저장 → '전원을 끕니다' 0.5초 → AXP2101 REG 0x10 bit0. PMU 강제 종료(0x27 bit3:2) 4초 이하면 10초로(원래·바꾼 값 로그), 켜기 시간(0x27 bit1:0)을 확인 화면에 표시. 잠금은 BOOT 2초만. 벡터 6+1, 시뮬레이터 확인·꺼짐 화면, 문구·글꼴(296자), README·guide.html | 구현·빌드 성공(run 39112798706, c3a9213: bootloader 23,232B·partition-table 3,072B·app 1,529,680B) |
| 진행 5 | 파이프라인 완성, v1.0.0 | CI 작성 완료, 태그 빌드는 아직 실행 전 |

### UI v2 실기 확인 (P0-8, 시계에 올린 뒤)

- 글꼴 실제 크기: 빌드 맵(`idf.py size-files`)에서 kr_20/24/28/32·num_128 의 .rodata 크기(생성 C 기준 비트맵 kr_20 20.7KB·kr_24 27.8KB·kr_28 33.8KB·kr_32 38.3KB·num_128 31.2KB, 앱 증가 실측 +59KB)
- 글자 모양: 20px 한글 가독성, 128px 숫자 가장자리, 줄높이(lv_font_conv 가 kr_20 21px·num_128 94px 로 잡음 — 겹치거나 잘리는 글자가 없는지)
- 전체 화면 1프레임 시간: 모드 전환·시트 열기(410×344 이동 3단계)·발표 넘김 플래시(120×422) 때 LVGL 렌더 시간(목표 평균 33ms 이하, 60ms 넘으면 시트 단계 축소)
- 내부 RAM 여유: 부팅 로그 `[메모리 BLE 후]` 목표 ≥ 110KB(이전 217,704B — 위젯 약 +130개)
- 압축 글꼴 그리기: 한글 많은 화면(설정·페어링)에서 힙 최저 여유(`최저 여유`)가 떨어지지 않는지
- 패널 밝기: CO5300 0x51 레지스터로 80%·40% 단계가 실제로 바뀌는지, 시계 모래색 #D6CEB5 가 패널에서 어떻게 보이는지
- 터치 판정: 12px 취소·600ms 길게·쇼 중 140px 스와이프·위 가장자리 72px 당기기가 손목에서 자연스러운지(로그 '터치 누름')
- 한글 BLE 이름이 Windows·macOS 목록에 깨지지 않는지(깨지면 `WristCtrl`)

## 공개 저장소

- 공개판: https://github.com/ibrkiller-penz/wrist-controller-public (2026-10-18, 이 저장소 main 의 파일을 커밋 1개로 옮김, 작성자 noreply 주소, docs/PUBLIC_CHECK.md 제외)
- 이 저장소(wrist-controller)는 비공개 작업 기록용으로 유지. 공개판 갱신은 같은 방식(git archive → 커밋)으로.
