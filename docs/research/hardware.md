# 하드웨어 조사: Waveshare ESP32-C6-Touch-AMOLED-2.06

> **2026-10-16 C6 기준으로 재작성, 이전 S3 조사는 하단 부록으로 축약.**
> 이전판은 ESP32-S3-Touch-AMOLED-2.06 보드를 기준으로 잘못 작성됐다. 실물을 esptool로 읽은 결과 칩이 ESP32-C6이므로 전면 교체한다.

조사일: 2026-10-16 · 작성: 자료조사팀

표기 규칙: 출처 두 곳 이상이 일치하면 **확인**, 한 곳에서만 나오면 **부분 확인**, 근거를 찾지 못했거나 서로 어긋나면 **미확인**.

## 0. 실물 판독값 (사용자 esptool, 사실로 취급)

| 항목 | 값 |
| --- | --- |
| 칩 | ESP32-C6 (QFN40), rev v0.2, 싱글코어 RISC-V 160MHz, USB-Serial/JTAG |
| 플래시 | 16MB, 제조사 0x20 / 장치 0x4018 |
| MAC | 98:a3:16:a6:2d:38 |
| 기존 펌웨어 | 샤오즈(xiaozhi), 16MB 전체 `backup/` 에 백업 완료 |

플래시 판독값은 회로도의 플래시 칩 **XM25QH128DHIQT**(XMC, 128Mbit = 16MB)와 맞는다. 제조사 ID 0x20은 XMC. [SCH] → **확인**

## 출처 목록

| 기호 | 출처 | URL |
| --- | --- | --- |
| [W] | Waveshare 공식 문서(위키) | https://docs.waveshare.com/ESP32-C6-Touch-AMOLED-2.06 |
| [P] | Waveshare 제품 페이지 | https://www.waveshare.com/esp32-c6-touch-amoled-2.06.htm |
| [R] | 공식 예제 저장소 README (조사 시점 커밋 `2a3608d`, 2026-08-11) | https://github.com/waveshareteam/ESP32-C6-Touch-AMOLED-2.06 |
| [HW] | 공식 저장소 핀 감사 문서 | https://github.com/waveshareteam/ESP32-C6-Touch-AMOLED-2.06/blob/main/docs/hardware.md |
| [SCH] | 공식 회로도 V1.0 (PDF, 이번에 GPIO 할당표·KEYS·RTC·IMU 영역을 이미지로 확대해 직접 판독) | https://github.com/waveshareteam/ESP32-C6-Touch-AMOLED-2.06/blob/main/Schematic/ESP32-C6-Touch-AMOLED-2.06-Schematic-V1.0.pdf |
| [BSP] | 공식 BSP 컴포넌트 `waveshare/esp32_c6_touch_amoled_2_06` v2.0.0 (2026-06-18 게시) | https://components.espressif.com/components/waveshare/esp32_c6_touch_amoled_2_06 |
| [PIN] | Arduino 핀 설정 | https://github.com/waveshareteam/ESP32-C6-Touch-AMOLED-2.06/blob/main/examples/arduino/libraries/Mylibrary/pin_config.h |
| [TC] | 툴체인 정의 | https://github.com/waveshareteam/ESP32-C6-Touch-AMOLED-2.06/blob/main/config/toolchains.json |
| [CMP] | 관리 컴포넌트 목록 | https://github.com/waveshareteam/ESP32-C6-Touch-AMOLED-2.06/blob/main/docs/components.md |
| [LV9] | IDF LVGL 예제 설정 | https://github.com/waveshareteam/ESP32-C6-Touch-AMOLED-2.06/tree/main/examples/esp-idf/02_lvgl_demo_v9 |
| [ARD6] | Arduino LVGL 예제 | https://github.com/waveshareteam/ESP32-C6-Touch-AMOLED-2.06/blob/main/examples/arduino/06_LVGL_Arduino_v9/06_LVGL_Arduino_v9.ino |
| [ARD4] | Arduino IMU 예제 | https://github.com/waveshareteam/ESP32-C6-Touch-AMOLED-2.06/blob/main/examples/arduino/04_LVGL_QMI8658_ui/04_LVGL_QMI8658_ui.ino |
| [FW] | 공장 펌웨어(샤오즈) 이미지·설명 | https://github.com/waveshareteam/ESP32-C6-Touch-AMOLED-2.06/tree/main/firmware |
| [XZ] | xiaozhi-esp32 보드 정의 (폴더 최종 커밋 `dec42c4`, 2026-10-14) | https://github.com/78/xiaozhi-esp32/tree/main/main/boards/waveshare/esp32-c6-touch-amoled-2.06 |
| [XZD] | xiaozhi-esp32 공용 LCD 디스플레이 코드 | https://github.com/78/xiaozhi-esp32/blob/main/main/display/lcd_display.cc |
| [CODEC] | esp_codec_dev 기본 주소 상수 | https://github.com/espressif/esp-adf/tree/master/components/esp_codec_dev/device/include |
| [DS] | Espressif ESP32-C6 데이터시트 | https://www.espressif.com/sites/default/files/documentation/esp32-c6_datasheet_en.pdf |

## 1. S3 가정 대비 달라지는 점 (요약)

| 항목 | 이전 S3 문서 | C6 보드 확인값 | 영향 | 출처 |
| --- | --- | --- | --- | --- |
| 제품명 | ESP32-S3-Touch-AMOLED-2.06 | **ESP32-C6-Touch-AMOLED-2.06** (SKU 32769 무배터리 / 32770 `-EN` 배터리 포함) | 문서·예제·BSP 모두 C6판을 써야 함 | [W][P][R] |
| CPU | LX7 듀얼코어 240MHz | **RISC-V 싱글코어 160MHz** (+ 저전력 코어 LP) | 렌더링·오디오·무선을 한 코어가 처리. 성능 여유 크게 줄어듦 | [W][DS] |
| PSRAM | 8MB | **없음** (C6는 PSRAM 미지원) | LVGL 버퍼·오디오 버퍼 전부 내부 SRAM 512KB 안에서 해결 | [W][HW][DS] |
| Flash | 16MB(위키는 32MB) | **16MB 확정** (XM25QH128) | 백업 크기 문제 해소 | 실물, [SCH][TC] |
| 무선 | Wi-Fi 4 + BLE 5 | **Wi-Fi 6 + BLE 5 + 802.15.4(Zigbee/Thread)** | Thread/Zigbee 선택지 생김 | [W][R] |
| USB | 네이티브 USB OTG(GPIO19/20) | **USB-Serial/JTAG 전용(GPIO12/13), OTG 없음** | **USB HID 장치로 동작 불가.** 컨트롤러 출력은 BLE HID 또는 무선 프로토콜로 | [SCH][DS] |
| 화면 | CO5300 410×502 QSPI | 동일 | 핀만 다름 | [W][BSP] |
| 터치 | FT3168 0x38 | 동일 | 핀만 다름 | [W][PIN] |
| IMU | QMI8658C, INT1→GPIO21 | QMI8658C, **INT1→GPIO16, INT2→GPIO17 (UART0 TX/RX와 공유)** | UART0 콘솔과 충돌 → 콘솔은 USB-Serial/JTAG로 | [SCH][HW] |
| 오디오 | ES8311 + ES7210 + 마이크 2 | 동일 구성(ES8311 + ES7210 + 마이크 2 + NS4150B) | 핀만 다름 | [SCH][BSP] |
| RTC | PCF85063A, INT→GPIO39 | PCF85063A, **INT는 테스트 패드만, MCU 미연결** | RTC 알람으로 MCU 깨우기 불가 | [SCH] |
| 진동 모터 | GPIO18 | **없음** (회로도에 모터 부품 없음) | **햅틱 피드백 불가.** 소리·화면으로 대체 | [SCH] |
| SD 카드 | TF 슬롯 | **없음** | 저장은 내부 플래시(SPIFFS 등)만 | [SCH][BSP] |
| BOOT 버튼 | GPIO0 | **GPIO9** (누르면 LOW) | | [SCH][XZ] |
| PWR 버튼 | GPIO10 (`SYS_OUT`) | **GPIO18 (`SYS_OUT`)**, 누르면 HIGH | | [SCH] |
| LCD TE | GPIO13 | **MCU 미연결** | 티어링 동기화 불가 | [SCH] |
| 공식 예제 | IDF 6 + Arduino 8 | **IDF 5개 + Arduino 6개** | | [R] |
| LVGL | 9.5.0 / 9.3.0 | 동일 (IDF 9.5.0, Arduino 동봉 9.3.0) | | [CMP][ARD6] |

## 2. 부품별 상세

### 2.1 MCU·메모리

- ESP32-C6: 32비트 RISC-V 최대 160MHz, **HP SRAM 512KB**, LP SRAM 16KB, ROM 320KB, 외장 플래시 16MB. [W]
- 무선: 2.4GHz Wi-Fi 6, Bluetooth 5(LE), IEEE 802.15.4(Zigbee 3.0, Thread), 온보드 안테나. [W][R]
- **PSRAM 없음**. 위키 사양표에 PSRAM 항목 자체가 없고 [W], 공식 저장소가 "이 보드에는 외장 PSRAM이 없다"고 명시하며 S3의 PSRAM·240MHz 설정을 제거했다고 적었다 [HW]. C6 칩 자체에 PSRAM 인터페이스가 없다 [DS]. → **확인**
- 회로도 MCU 심볼 `U2 esp32-c6`, 플래시 `U3 XM25QH128DHIQT`, 40MHz 수정 발진자. [SCH]
- 공식 예제 sdkconfig: `CONFIG_IDF_TARGET="esp32c6"`, `FLASHMODE_QIO`, `FLASHSIZE_16MB`. [LV9]
- 공장 펌웨어: `ESP32-C6-Touch-AMOLED-2.06-xiaozhi-251028.bin` (16,732,160바이트 단일 이미지). 사용자 백업과 별개의 공식 복원 수단. [FW]

### 2.2 디스플레이

- 2.06인치 AMOLED, 410×502, 16.7M색, 컨트롤러 **CO5300**, QSPI. [W][R]
- 드라이버: IDF BSP와 샤오즈 모두 `esp_lcd_sh8601` 드라이버를 CO5300 초기화 명령으로 사용. Arduino는 `Arduino_CO5300`. [BSP][XZ][ARD6]
- **열(column) 오프셋 22픽셀(0x16)** 필요: `esp_lcd_panel_set_gap(panel, 0x16, 0)` / `Arduino_CO5300(..., 22, 0, 0, 0)`. [BSP][XZ][ARD6]
- **갱신 영역 좌표를 짝수로 맞추는 rounder 콜백 필수** (시작 좌표 짝수, 끝 좌표 홀수). 세 곳 모두 동일 코드를 쓴다. LVGL 9에서는 `LV_EVENT_INVALIDATE_AREA` 이벤트로 처리. [BSP][XZ][ARD6]
- 밝기: 백라이트 핀 없음. CO5300 명령 `0x51`(0~255)로 조절. [XZ]
- SPI 호스트 `SPI2_HOST`. 샤오즈의 픽셀 클록은 40MHz. [BSP][XZ]
- TE(티어링) 신호: 화면 커넥터에 `LCD_TE` 라벨은 있으나 회로도 GPIO 할당표에 없음 → **MCU 미연결**. [SCH]

### 2.3 터치

- FT3168 자기정전용량 방식, I2C(공용 버스 SCL=GPIO7, SDA=GPIO8), INT = GPIO15, RESET = GPIO10. [W][HW][PIN][BSP]
- I2C 주소 0x38 (`FT3168_DEVICE_ADDRESS`). [ARD6] 동봉 Arduino_DriveBus 헤더 https://github.com/waveshareteam/ESP32-C6-Touch-AMOLED-2.06/blob/main/examples/arduino/libraries/Arduino_DriveBus/src/touch_chip/Arduino_FT3x68.h
- IDF BSP는 `esp_lcd_touch_ft5x06` 드라이버로 구동. [BSP]
- 참고: **샤오즈 보드 정의는 터치를 초기화하지 않는다**(BOOT 버튼만 사용). 기존 펌웨어에서 터치가 안 됐다면 펌웨어 탓이지 하드웨어 문제가 아니다. [XZ]

### 2.4 IMU

- QMI8658C 6축(가속도 + 자이로). [W][SCH]
- 인터럽트: INT1 → GPIO16, INT2 → GPIO17 (각각 0Ω 저항 R3/R4 경유). [SCH][HW]
- **주의: GPIO16/17은 C6의 UART0 TX/RX이기도 하다.** 회로도 할당표에 `QMI_INT1/U0TXD`, `QMI_INT2/U0RXD`가 같은 줄에 있다. [SCH] → 로그 콘솔은 반드시 USB-Serial/JTAG(GPIO12/13)로 두고 UART0을 쓰지 말 것. (설계 의견)
- I2C 주소: 공식 Arduino 예제는 **0x6B** (`QMI8658_BOARD_ADDRESS = 0x6B`) [ARD4], 회로도 라벨도 `0X6B` [SCH]. 그러나 회로도상 SDO/SA0 핀이 GND에 연결된 것으로 보이며, 데이터시트 기준으로는 이 경우 0x6A가 된다. → **미확인. 첫 부팅 때 I2C 스캔으로 0x6A/0x6B를 확인하고 둘 다 시도하는 코드로 작성.**
- IDF BSP는 `BSP_CAPS_IMU 0` → IMU는 직접 드라이버(`waveshare/qmi8658 ^2.0.0`)를 붙여야 한다. [BSP][CMP]

### 2.5 오디오·마이크

- 재생: **ES8311** 코덱 → **NS4150B** 앰프 → 스피커. 앰프 enable(`PA_CTRL`) = GPIO6. [SCH][BSP]
- 녹음: **ES7210** 4채널 ADC, **마이크 2개**(회로도 MIC1, MIC2 → ES7210 MIC1/MIC2 입력). [SCH][W]
- 에코 제거 기준 신호: ES8311 출력(OUTP/OUTN)이 ES7210 MIC3 입력으로 되돌아가는 `AEC ADC` 경로가 회로도에 있다. [SCH] (텍스트·도면 판독, 부분 확인)
  - 그러나 샤오즈 C6판은 `AUDIO_INPUT_REFERENCE false`로 이 기준 신호를 쓰지 않는다. [XZ]
- I2S 핀: MCLK = GPIO19, BCLK(SCLK) = GPIO20, ADC 데이터 입력(ASDOUT, ES7210→MCU) = GPIO21, LRCK(WS) = GPIO22, DAC 데이터 출력(DSDIN, MCU→ES8311) = GPIO23. ES8311·ES7210이 클록 공유. [HW][BSP][XZ][SCH]
- I2C 주소(7비트): ES8311 = **0x18**, ES7210 = **0x40**. 코드 상수는 8비트 표기 `ES8311_CODEC_DEFAULT_ADDR 0x30`, `ES7210_CODEC_DEFAULT_ADDR 0x80`. [CODEC][XZ][SCH 라벨 0x40] → 확인
- 샤오즈 C6판 샘플레이트: 입력·출력 24kHz. [XZ]
- C6에서 ESP-SR(웨이크워드·AFE) 지원 범위는 이번 조사에서 확인하지 않음 → **미확인** (음성 기능 쓰려면 별도 조사).

### 2.6 전원 (PMU·배터리)

- **AXP2101**, I2C 0x34. [W][XZ]
- 배터리: 3.7V 리튬, MX1.25 커넥터. `-EN` 판에 배터리 포함. [W]
- 회로도 레일: DCDC1 = VCC3V3, ALDO1 VL1_3.3V, ALDO2 VL2_3.3V, ALDO3 VCC3V, ALDO4 1.8V, BLDO2 2.8V, CPUSLDO 1.2V. [SCH] (텍스트 추출, 부분 확인)
- 샤오즈의 PMU 초기화(참고값): DC1 3.3V만 켜고 나머지 DC 끔, ALDO1(마이크용) 3.3V 켬, 충전 전압 4.1V, 충전 전류 400mA, **PWR 4초 길게 누르면 전원 차단**(레지스터 0x27=0x10). [XZ]
- `AXP_IRQ`: 회로도 GPIO 할당표에 없음 → **MCU 미연결**. 공식 AXP2101 예제도 IRQ를 `-1`(미연결)로 둔다. [SCH][HW]

### 2.7 RTC

- **PCF85063A**(ATL), 32.768kHz 수정, 공용 I2C, VCC-RTC 전원(AXP2101 백업). [SCH][W]
- I2C 주소 0x51 (PCF85063A 고정 주소, SensorLib `PCF85063_SLAVE_ADDRESS` 상수 사용) — 저장소 안에서 숫자 값은 직접 보지 못함 → 부분 확인.
- `RTC_INT`는 테스트 패드로만 나가고 **MCU GPIO에 연결되지 않음**. [SCH]

### 2.8 버튼

회로도 KEYS 영역을 확대 판독한 결과. [SCH]

| 버튼 | GPIO | 논리 | 비고 | 출처 |
| --- | --- | --- | --- | --- |
| BOOT (Key1) | **GPIO9** | 누르면 LOW (10kΩ 풀업) | C6 부트 스트래핑 핀. 전원 켤 때 누르고 있으면 다운로드 모드 | [SCH][XZ] |
| PWR (Key3) | **GPIO18** (`SYS_OUT`) | 누르면 HIGH | PWR 키가 AXP2101 PWRON을 GND로 당기고, BSS138 트랜지스터가 반전해 SYS_OUT(10kΩ 풀업)이 HIGH가 됨. 내부 풀업 불필요 | [SCH] |

- IDF BSP는 `BSP_CAPS_BUTTONS 0` → 버튼은 직접 GPIO로 읽어야 한다. [BSP]
- **설계 주의**: PWR 버튼은 AXP2101 PWRON과 같은 키라 길게 누르면 PMU가 전원을 끈다. 샤오즈는 이 시간을 4초로 설정했고, 기본값은 PMU 설정에 따른다(이번 조사에서 공장 기본값은 **미확인**). "2초 길게 누름 = 잠금" 같은 기능은 PMU 차단 시간보다 충분히 짧게 판정하거나 BOOT 버튼에 배정할 것. (설계 의견)

### 2.9 기타

- 진동 모터: **없음** (회로도·위키·BSP 어디에도 없음). [SCH][W][BSP]
- SD 카드: **없음** (`BSP_CAPS_SDCARD 0`, 회로도에 슬롯 없음). [BSP][SCH]
- USB: Type-C, C6 내장 **USB-Serial/JTAG** (D− = GPIO12, D+ = GPIO13). 플래싱·로그용. USB OTG 기능 없음. [SCH][DS]
- 확장 패드: I2C 1, UART 1, USB 1. [W]

## 3. 핀 배치 총정리 (ESP32-C6 QFN40)

출처는 회로도 V1.0의 GPIO 할당표 [SCH]를 기준으로, 공식 핀 감사 문서 [HW], BSP 헤더 [BSP], 샤오즈 `config.h` [XZ]와 대조했다. 네 곳이 모두 일치한다.

| GPIO | 용도 | 비고 |
| --- | --- | --- |
| 0 | LCD QSPI SCLK | |
| 1 / 2 / 3 / 4 | LCD QSPI SIO0 / SIO1 / SIO2 / SIO3 | GPIO4·5는 C6 JTAG 스트래핑(MTMS/MTDI) 겸용 [DS] |
| 5 | LCD CS | |
| 6 | 스피커 앰프 enable (PA_CTRL) | |
| 7 | 공용 I2C SCL | 터치·PMU·IMU·RTC·ES8311·ES7210 |
| 8 | 공용 I2C SDA | 부트 스트래핑 핀 [DS] |
| 9 | BOOT 버튼 (누르면 LOW) | 부트 스트래핑 핀 |
| 10 | 터치 RESET | |
| 11 | LCD RESET | |
| 12 / 13 | USB D− / D+ (USB-Serial/JTAG) | |
| 14 | (없음) | QFN40 패키지에 GPIO14 없음, 할당표 빈 줄 |
| 15 | 터치 INT | 부트 스트래핑 핀 [DS] |
| 16 | IMU INT1 / UART0 TX | 공유 |
| 17 | IMU INT2 / UART0 RX | 공유 |
| 18 | PWR 버튼 상태 (SYS_OUT, 누르면 HIGH) | |
| 19 | I2S MCLK | |
| 20 | I2S BCLK | |
| 21 | I2S 데이터 입력 ← ES7210 (ASDOUT) | |
| 22 | I2S LRCK(WS) | |
| 23 | I2S 데이터 출력 → ES8311 (DSDIN) | |

**MCU에 연결 안 된 신호**: LCD_TE, AXP_IRQ, RTC_INT. [SCH]
**남는 GPIO**: 사실상 없음(UART0으로 쓰던 16/17도 IMU가 점유).

I2C 주소(7비트): FT3168 0x38, AXP2101 0x34, ES8311 0x18, ES7210 0x40, PCF85063A 0x51, QMI8658 0x6B(공식 코드) 또는 0x6A(회로도 SA0=GND 해석) — **실물 스캔으로 확정 필요**.

## 4. 내부 SRAM 512KB와 410×502 LVGL 버퍼

### 4.1 크기 계산 (RGB565 = 픽셀당 2바이트)

| 버퍼 | 바이트 | 판단 |
| --- | ---: | --- |
| 전체 프레임 410×502 | 411,640 | **불가능** (SRAM 전체의 80%) |
| 100줄 (IDF BSP 기본값 `BSP_DISPLAY_LVGL_BUF_HEIGHT=100`) | 82,000 | 단일 버퍼로 가능하나 Wi-Fi/BLE와 같이 쓰면 빠듯 |
| 50줄 | 41,000 | |
| 40줄 | 32,800 | |
| 20줄 (샤오즈·Arduino 예제 값) | 16,400 | 공식·샤오즈가 실제로 쓰는 값 |

- 샤오즈 `SpiLcdDisplay`: `width × 20`, 단일 버퍼, DMA 가능 내부 RAM (`buff_dma=1`, `buff_spiram=0`). [XZD]
- Arduino 공식 예제: `LVGL_BUFFER_LINES = 20`, `MALLOC_CAP_INTERNAL`로 할당, PARTIAL 모드. Arduino `lv_conf.h`의 LVGL 자체 힙 `LV_MEM_SIZE` = 64KB. [ARD6] https://github.com/waveshareteam/ESP32-C6-Touch-AMOLED-2.06/blob/main/examples/arduino/libraries/lv_conf.h
- IDF BSP 2.0.0 관찰: `bsp_display_start()`에 넘기는 `buffer_size`(410×20)와 `buff_spiram=true`는 실제 LCD 초기화 함수에서 쓰이지 않고, Kconfig `BSP_DISPLAY_LVGL_BUF_HEIGHT`(기본 100줄) 값으로 단일 버퍼를 잡는다. [BSP 소스 `esp32_c6_touch_amoled_2_06.c`] → BSP를 쓸 때는 **Kconfig에서 줄 수를 직접 줄여야** 한다.

### 4.2 권장 (설계 의견, 실측 전 추정)

- 512KB 중 IDF 런타임, 내부 RAM에 올라가는 코드, Wi-Fi 또는 BLE 스택, 오디오 버퍼, LVGL 객체 힙이 함께 쓴다. 정확한 여유량은 **실측 필요**(`heap_caps_get_free_size(MALLOC_CAP_INTERNAL)`).
- 기본안: **410×40줄 × 2개(이중 버퍼) = 65,600바이트**, DMA 가능 내부 RAM. 렌더링과 전송이 겹쳐 체감 속도가 좋다.
- 메모리 부족 시: **410×20줄 × 2개 = 32,800바이트** 또는 샤오즈처럼 20줄 단일(16,400바이트).
- 줄 수는 **짝수**로 (CO5300 rounder 조건).
- 무선(BLE/Wi-Fi)과 음성 기능을 동시에 넣을수록 버퍼를 줄이는 쪽으로 조정.
- 전송 대역: QSPI 40MHz × 4비트 ≈ 20MB/s → 전체 화면 1회 전송 약 21ms. 전체 화면이 자주 바뀌는 애니메이션은 피하고 부분 갱신 위주 UI로 설계. (계산값)
- 큰 이미지·폰트는 RAM이 아니라 플래시(const 배열/파티션)에 두고 직접 읽는다.

## 5. 공식 예제·툴체인

- 공식 저장소 예제: [R]
  - ESP-IDF 5개: 01_AXP2101, 02_lvgl_demo_v9, 03_esp-brookesia, 04_qmi8658, 05_Spec_Analyzer(마이크 스펙트럼)
  - Arduino 6개: 01_HelloWorld, 02_GFX_AsciiTable, 03_LVGL_PCF85063_simpleTime, 04_LVGL_QMI8658_ui, 05_LVGL_AXP2101_ADC_Data, 06_LVGL_Arduino_v9
- 검증 툴체인: **ESP-IDF v5.5.5, v6.0.2**, **Arduino-ESP32 3.3.11**. [R][TC]
  - Arduino FQBN: `esp32:esp32:esp32c6:CDCOnBoot=cdc,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB` [TC]
- BSP: `waveshare/esp32_c6_touch_amoled_2_06` v2.0.0 (의존: `esp_lvgl_port ^2`, `esp_lcd_sh8601`, `esp_lcd_touch_ft5x06`, `esp_codec_dev ~1.5`, LVGL `>=8,<10`, IDF `>=5.3`). [BSP]
- 기타 관리 컴포넌트: `waveshare/qmi8658 ^2.0.0`, `cube32esp/xpowerslib ^0.3.3`(AXP2101), `espressif/esp-dsp`. [CMP]
- LVGL: IDF 예제 **9.5.0** 고정, Arduino 동봉 **9.3.0**. [CMP][LV9][ARD6]
- Arduino 동봉 라이브러리: Arduino_GFX 1.6.0(화면), Arduino_DriveBus(터치), SensorLib(QMI8658·PCF85063), XPowersLib(AXP2101). [CMP][R]
- 샤오즈 보드 정의 `config.json`: `target: esp32c6`, 추가 sdkconfig 없음. [XZ]

## 6. 작업지시서 반영 제안

1. **하드웨어 표 전면 교체**: 보드명 ESP32-C6-Touch-AMOLED-2.06, 싱글코어 160MHz, PSRAM 없음, 16MB 플래시, 진동 모터·SD 없음, 3장 핀표 사용.
2. **햅틱 피드백 요구사항 삭제 또는 대체**(소리·화면 반짝임).
3. **연결 방식 재검토**: USB HID 불가 → BLE HID(또는 Wi-Fi/ESP-NOW 등) 기준으로 설계.
4. 툴체인: ESP-IDF 5.5.x + LVGL 9.5 + 공식 BSP를 기본으로 하되, BSP의 LVGL 버퍼 줄 수(Kconfig)를 반드시 줄일 것.
5. 콘솔은 USB-Serial/JTAG 고정(UART0은 IMU 인터럽트와 충돌).
6. 첫 펌웨어에 I2C 스캔·남은 내부 힙 출력 기능을 넣어 QMI8658 주소와 메모리 여유를 실측.
7. 복원 수단 두 가지 기록: 사용자 백업(`backup/`), 공식 공장 이미지 `ESP32-C6-Touch-AMOLED-2.06-xiaozhi-251028.bin`.

## 7. 미확인 항목

- QMI8658 I2C 주소 0x6A / 0x6B (공식 코드와 회로도 해석이 다름) → 실물 스캔.
- AXP2101 PWR 길게 누름 전원 차단 시간의 공장 기본값.
- ESP32-C6에서 ESP-SR(웨이크워드·AFE) 지원 범위.
- 실제 가용 내부 힙(무선·오디오 켠 상태) → 실측.
- 회로도 레일 전압·AEC 경로 등은 텍스트·부분 이미지 판독이므로 세부 값은 PDF로 재확인.
- 위키의 핀 배치는 이미지로만 제공돼 텍스트 대조 못 함(회로도·BSP·공식 핀 문서·샤오즈로 대체 확인).

---

## 부록: 이전 S3 조사 요약 (참고용, 이 보드에는 해당 없음)

이전판은 **ESP32-S3-Touch-AMOLED-2.06** (https://github.com/waveshareteam/ESP32-S3-Touch-AMOLED-2.06, 위키 https://docs.waveshare.com/ESP32-S3-Touch-AMOLED-2.06) 기준이었다. 실물이 C6로 확인돼 폐기한다. 주요 차이만 남긴다.

- MCU ESP32-S3R8(듀얼코어 240MHz, PSRAM 8MB Octal), 플래시 16MB(위키 표기 32MB).
- 같은 부품: CO5300 화면, FT3168 터치, QMI8658, ES8311 + ES7210 + 마이크 2, AXP2101, PCF85063A.
- S3에만 있던 것: 진동 모터(GPIO18), TF 카드, 네이티브 USB OTG(GPIO19/20), LCD TE(GPIO13), RTC INT(GPIO39).
- S3 핀(사용 금지): LCD SIO0~3=4/5/6/7, SCLK=11, CS=12, RST=8 / I2C SDA=15, SCL=14 / 터치 INT=38, RST=9 / I2S MCLK=16, BCLK=41, WS=45, DOUT=40, DIN=42 / 앰프=46 / BOOT=0, PWR=10.
- S3 공식 예제: IDF 6개 + Arduino 8개, 공장 펌웨어 샤오즈(ESP-SR `MMR` AFE + WakeNet9).
