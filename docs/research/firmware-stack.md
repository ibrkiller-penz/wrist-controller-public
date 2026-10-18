# 펌웨어 스택 조사 — ESP32-C6 손목 컨트롤러

> **재작성 표기 (2026-10-16)**: 이 문서는 ESP32-S3 기준이던 이전판을 **ESP32-C6 기준으로 다시 쓴 것**이다.
> 실물 확인 결과 시계 칩은 **ESP32-C6 (QFN40, rev v0.2)**, 싱글코어 RISC-V 160MHz, HP SRAM 512KB, **PSRAM 없음**, 외장 플래시 16MB, BLE 5, USB-Serial/JTAG 이다.
> 이전판의 일반 내용(esptool v5 명령 형식, ESP Web Tools 매니페스트 형식, GitHub Release CORS 문제, 본드 유지 주의)은 유지하고 C6 에 맞게 고쳤다.
> 보드는 **Waveshare ESP32-C6-Touch-AMOLED-2.06** 으로 본다(S3 판과 화면·터치·IMU·PMU 구성이 같다). 핀 배치는 `firmware/main/board_pins.h`(다른 담당)와 `docs/research/hardware.md` 를 따른다.

조사일: 2026-10-16 · 자료조사팀 4번
기준 문서: `손목컨트롤러_작업지시서.md`
표기 규칙: 출처로 확인한 사실에는 출처 URL 을 달았다. 확인하지 못한 내용은 **미확인**, 계산·경험치로 어림한 값은 **추정**으로 표시했다.

---

## 0. 작업지시서·이전판과 달라지는 점 (먼저 읽기)

| # | 작업지시서 / 이전판 | C6 조사 결과 | 영향 |
| --- | --- | --- | --- |
| 1 | MCU ESP32-S3, PSRAM 8MB | **ESP32-C6**. 외장 메모리는 플래시만 연결할 수 있고(최대 16MB) **PSRAM 을 지원하지 않는다** | 모든 버퍼를 HP SRAM 512KB 안에서 해결한다. 전체 프레임 버퍼(약 412KB)는 불가. sdkconfig 에서 `CONFIG_SPIRAM*` 삭제 |
| 2 | Flash 16MB(이전판은 32MB 가능성 경고) | 실물·Waveshare 문서 모두 **외장 16MB**. C6 는 16MB 가 상한 | 백업 크기 16MB(0x1000000) 확정. `ALL` 자동 감지도 그대로 쓸 수 있다 |
| 3 | 듀얼코어 240MHz | **싱글코어 RISC-V 160MHz**(CoreMark 496.66) | BLE·LVGL·IMU 가 한 코어를 나눠 쓴다. 태스크 우선순위 설계가 중요하다(4장). LVGL 그리기 유닛 2개 설정은 의미 없음 |
| 4 | Waveshare S3 BSP | C6 전용 BSP `waveshare/esp32_c6_touch_amoled_2_06` v2.0.0 이 있다(IDF ≥ 5.3, 드라이버 `waveshare/esp_lcd_sh8601`) | 화면 초기화는 이 BSP 로 시작한다 |
| 5 | 복합 HID | IDF `esp_hid_device` 예제가 **ESP32-C6 를 공식 지원 대상**으로 명시. 단 예제는 한 역할만 등록(이전판과 같음) | 복합 리포트 맵은 직접 짠다(2.4) |
| 6 | 음성(ESP-SR) | ESP-SR 의 C6 지원은 **WakeNet10s(v2.6.0~)만**. MultiNet(명령어 인식)과 AFE 는 C6 미지원 | 음성 명령 범위를 다시 잡아야 한다(다른 팀 범위, 영향 큼) |
| 7 | esptool, ESP Web Tools, CORS | 칩만 바꾸면 그대로 유효. ESP Web Tools `chipFamily` 는 **`"ESP32-C6"`** | 매니페스트·CI·설치 페이지 명령에서 `esp32s3` → `esp32c6` |

출처
- ESP32-C6 데이터시트(HP SRAM 512KB, LP SRAM 16KB, ROM 320KB, 160MHz, 외장 플래시 최대 16MB, SPI2 QSPI 80MHz): https://documentation.espressif.com/esp32-c6_datasheet_en.pdf
- Waveshare 보드 문서(16MB Flash, CO5300 QSPI, FT3168, QMI8658, AXP2101): https://docs.waveshare.com/ESP32-C6-Touch-AMOLED-2.06
- Waveshare 저장소(예제, IDF v5.5.5/v6.0.2, Arduino 3.3.11): https://github.com/waveshareteam/ESP32-C6-Touch-AMOLED-2.06
- C6 BSP 의존성: https://components.espressif.com/components/waveshare/esp32_c6_touch_amoled_2_06/versions/2.0.0/dependencies
- ESP-SR 지원 칩: https://github.com/espressif/esp-sr

---

## 1. 보드·칩 확인

| 항목 | 작업지시서 예상 | 확인값 |
| --- | --- | --- |
| MCU | ESP32-S3 | **ESP32-C6** (QFN40, rev v0.2), HP RISC-V 160MHz + LP RISC-V 20MHz |
| 내부 RAM | — | HP SRAM 512KB, LP SRAM 16KB, ROM 320KB, 캐시 32KB |
| PSRAM | 8MB | **없음**(C6 는 외장 PSRAM 미지원) |
| Flash | 16MB | 외장 16MB(QSPI) |
| 무선 | BLE | BLE 5(5.3 인증), Wi-Fi 6, 802.15.4. Classic BT 없음 |
| USB | — | USB-Serial/JTAG 내장(네이티브 USB OTG 없음 → USB HID 장치는 불가, BLE HID 만) |
| 화면 | 2.06" AMOLED 410×502, QSPI, CO5300 | 동일 |
| 터치 / IMU / PMU | FT3168 / QMI8658 / AXP2101 | 동일(+ RTC PCF85063) |

- C6 rev v0.2 는 IDF v5.1.5+, v5.2.4+, v5.3.2+, v5.4 이상에서 지원된다. https://github.com/espressif/esp-idf/blob/master/COMPATIBILITY.md
- C6 BLE: "ESP32-C6 supports Bluetooth 5.0 (LE) and is certified for Bluetooth LE 5.3", NimBLE·Bluedroid 둘 다 BLE 전용으로 지원. https://docs.espressif.com/projects/esp-idf/en/stable/esp32c6/api-guides/ble/overview.html

### Waveshare C6 예제
- ESP-IDF: `01_AXP2101`, `02_lvgl_demo_v9`, `03_esp-brookesia`, `04_qmi8658`, `05_Spec_Analyzer`
- Arduino: `01_HelloWorld` ~ `06_LVGL_Arduino_v9`
- 빌드 기준: ESP-IDF v5.5.5 / v6.0.2, Arduino-ESP32 3.3.11. 공장 펌웨어 이미지는 저장소 `firmware/` 폴더에 있다(복원 2순위 수단).
- `02_lvgl_demo_v9` 의 `sdkconfig.defaults`: `CONFIG_IDF_TARGET="esp32c6"`, `FLASHMODE_QIO`, `FLASHSIZE_16MB`, `COMPILER_OPTIMIZATION_PERF`, `LV_DEF_REFR_PERIOD=15`, `LV_DRAW_SW_DRAW_UNIT_CNT=2`, `LV_ATTRIBUTE_FAST_MEM_USE_IRAM=y`, `IDF_EXPERIMENTAL_FEATURES=y`.
  - https://github.com/waveshareteam/ESP32-C6-Touch-AMOLED-2.06/blob/main/examples/esp-idf/02_lvgl_demo_v9/sdkconfig.defaults
- 현재 시계에 실제로 들어 있는 펌웨어(샤오즈 여부)는 **미확인**. 백업부터 한다(5장).

---

## 2. ESP-IDF + NimBLE + esp_hid 복합 BLE HID (C6)

### 2.1 가능 여부
- **가능.** IDF 공식 예제 `examples/bluetooth/esp_hid_device` 의 지원 대상 표에 ESP32-C6 가 있다(ESP32, C2, C3, C5, C6, C61, H2, H21, H4, S3, S31). NimBLE 빌드 설정은 `sdkconfig.ci.nimble`(`CONFIG_BT_ENABLED=y`, `CONFIG_BT_NIMBLE_ENABLED=y`).
  - https://github.com/espressif/esp-idf/tree/master/examples/bluetooth/esp_hid_device
  - https://raw.githubusercontent.com/espressif/esp-idf/master/examples/bluetooth/esp_hid_device/sdkconfig.ci.nimble
- 주의: 예제의 기본 `sdkconfig.defaults` 는 Bluedroid + Classic(ESP32 용)이다. C6 에는 Classic 이 없으므로 **반드시 NimBLE 설정으로 빌드**한다.
- 컴포넌트: IDF 내장 `components/esp_hid`(BLE 장치 쪽 `ble_hidd.c`, `CONFIG_BT_NIMBLE_ENABLED` 일 때 NimBLE 경로).
- IDF 버전: C6 는 v5.1 부터 지원. Waveshare C6 예제와 맞춰 **v5.5.5 고정**을 권한다(1장 출처).

### 2.2 핵심 API (esp_hid 헤더 원문 기준)
```c
typedef struct {
    uint16_t vendor_id;
    uint16_t product_id;
    uint16_t version;
    const char *device_name;
    const char *manufacturer_name;
    const char *serial_number;
    esp_hid_raw_report_map_t *report_maps;  // 리포트 맵 배열
    uint8_t report_maps_len;                // 배열 개수
} esp_hid_device_config_t;

esp_err_t esp_hidd_dev_init(const esp_hid_device_config_t *config, esp_hid_transport_t transport,
                            esp_event_handler_t callback, esp_hidd_dev_t **dev);
esp_err_t esp_hidd_dev_input_set(esp_hidd_dev_t *dev, size_t map_index, size_t report_id,
                                 uint8_t *data, size_t length);
esp_err_t esp_hidd_dev_battery_set(esp_hidd_dev_t *dev, uint8_t level);
```
- `map_index` 와 `report_id` 를 함께 지정해 보낸다. 외형 상수: GENERIC `0x03C0`, KEYBOARD `0x03C1`, MOUSE `0x03C2`.
- 출처: https://raw.githubusercontent.com/espressif/esp-idf/master/components/esp_hid/include/esp_hidd.h , https://raw.githubusercontent.com/espressif/esp-idf/master/components/esp_hid/include/esp_hid_common.h

### 2.3 예제 리포트 맵 구성 (`esp_hid_device_main.c`)
| 배열 | Report ID | 내용 |
| --- | --- | --- |
| `keyboardReportMap` | 1 | 모디파이어, 키코드 0x65까지, LED 출력 |
| `mediaReportMap` | 3 | 컨슈머 비트필드(볼륨 ±, 음소거, 재생 등) |
| `mouseReportMap` | 없음 | 3버튼, X/Y/휠 |

- 예제는 `CONFIG_EXAMPLE_HID_DEVICE_ROLE`(1=미디어, 2=키보드, 3=마우스)로 **한 맵만** 등록한다. 복합 장치 예제는 없다.
- 출처: https://raw.githubusercontent.com/espressif/esp-idf/master/examples/bluetooth/esp_hid_device/main/esp_hid_device_main.c

### 2.4 권장 복합 리포트 맵 (설계안, 실기기 **미확인**)
맵 하나에 Report ID 1/2/3 을 나눠 담아 HID 서비스 하나로 만든다(macOS 가 서비스를 여러 장치로 쪼개는 문제 회피, 2.6).

```c
// 키보드(ID 1) + 마우스(ID 2) + 컨슈머(ID 3)
static const uint8_t kReportMap[] = {
  // 키보드 (ID 1): [mod][reserved][key0..key5] = 8바이트
  0x05,0x01, 0x09,0x06, 0xA1,0x01, 0x85,0x01,
  0x05,0x07, 0x19,0xE0, 0x29,0xE7, 0x15,0x00, 0x25,0x01, 0x75,0x01, 0x95,0x08, 0x81,0x02,
  0x95,0x01, 0x75,0x08, 0x81,0x01,
  0x95,0x05, 0x75,0x01, 0x05,0x08, 0x19,0x01, 0x29,0x05, 0x91,0x02,   // LED 출력
  0x95,0x01, 0x75,0x03, 0x91,0x01,
  0x95,0x06, 0x75,0x08, 0x15,0x00, 0x25,0x65, 0x05,0x07, 0x19,0x00, 0x29,0x65, 0x81,0x00,
  0xC0,
  // 마우스 (ID 2): [buttons][x][y][wheel] = 4바이트
  0x05,0x01, 0x09,0x02, 0xA1,0x01, 0x85,0x02, 0x09,0x01, 0xA1,0x00,
  0x05,0x09, 0x19,0x01, 0x29,0x03, 0x15,0x00, 0x25,0x01, 0x95,0x03, 0x75,0x01, 0x81,0x02,
  0x95,0x01, 0x75,0x05, 0x81,0x01,
  0x05,0x01, 0x09,0x30, 0x09,0x31, 0x09,0x38, 0x15,0x81, 0x25,0x7F, 0x75,0x08, 0x95,0x03, 0x81,0x06,
  0xC0, 0xC0,
  // 컨슈머 (ID 3): 16비트 사용 코드 1개 = 2바이트
  0x05,0x0C, 0x09,0x01, 0xA1,0x01, 0x85,0x03,
  0x15,0x00, 0x26,0xFF,0x03, 0x19,0x00, 0x2A,0xFF,0x03, 0x75,0x10, 0x95,0x01, 0x81,0x00,
  0xC0,
};
// 전송 예: esp_hidd_dev_input_set(dev, 0 /*map_index*/, 1 /*report_id*/, kb, 8);
```
- 컨슈머를 사용 코드 배열(예: 0x00E9 볼륨 업)로 두면 `keymap.json` 에서 코드값을 바로 쓸 수 있다.
- Report Reference 의 ID 가 맵과 어긋나면 호스트가 무시한다: https://forum.micropython.org/viewtopic.php?p=41150
- 맵 합친 뒤 키보드만 안 되는 사례(맵 오류): https://community.nxp.com/t5/Kinetis-Microcontrollers/NXP-BLE-HID-Keyboard-HID-is-not-working-when-used-with-consumer/m-p/942831

### 2.5 본딩·NVS 재연결
- 예제 보안 설정(`esp_hid_gap.c`, NimBLE): `BLE_SM_IO_CAP_DISP_ONLY`, bonding/MITM/SC = 1, 키 분배 `ID|ENC`, 패스키 123456 하드코딩, `BLE_GAP_EVENT_REPEAT_PAIRING` 시 기존 본드 삭제 후 재페어링, 공개 주소로 180초 광고, NimBLE 경로에서 외형은 GENERIC 고정.
  - https://raw.githubusercontent.com/espressif/esp-idf/master/examples/bluetooth/esp_hid_device/main/esp_hid_gap.c
- 시계는 화면이 있으므로 DISP_ONLY + **무작위 패스키 표시**를 권한다(제안, **미확인**).
- NimBLE Kconfig(원문 확인): `BT_NIMBLE_NVS_PERSIST` 기본 `n`("bonding persistent across device reboots"), `BT_NIMBLE_MAX_BONDS` 기본 3, `BT_NIMBLE_SM_LVL` 기본 0, `BT_NIMBLE_MAX_CONNECTIONS` 기본 3, `BT_NIMBLE_ROLE_CENTRAL`·`ROLE_OBSERVER` 기본 `y`, 호스트 태스크 스택 기본 4096.
  - https://github.com/espressif/esp-idf/blob/master/components/bt/host/nimble/Kconfig.in
  - → 이 프로젝트: `NVS_PERSIST=y`, `MAX_BONDS=4`, 센트럴·옵저버 끄기, 연결 1개(`firmware/sdkconfig.defaults` 반영).
- 주변기기가 본드 키를 잃으면 호스트가 "PIN or Key Missing" 으로 끊는다 → PC 에서 장치 삭제 후 재페어링.
  - https://github.com/adafruit/circuitpython/issues/10739 , https://esp32.com/viewtopic.php?p=60534
- **펌웨어 설치 때 NVS 를 지우면 본드도 사라진다**(7장).

### 2.6 Windows / macOS 호환 (칩과 무관, 이전판 유지)
- Windows: HID 서비스 + Battery + Device Information 이 있어야 인식했다는 보고. 재연결 문제는 본드 영구 저장과 고정 주소로 해결.
  - https://learn.microsoft.com/en-us/answers/questions/1388027/esp32-bluetooth-connection-disconnect-and-reconnec
- macOS: 복합 장치를 여러 IOHIDDevice 로 노출한 사례. https://developer.apple.com/forums/content/attachment/eec937c0-29cb-4f0a-9905-7be83b5d0d23
- iOS 볼륨 팝업이 안 뜨면 `CONFIG_BT_NIMBLE_SM_LVL=2`(공식 README). macOS 에도 필요한지는 **미확인**.
  - https://github.com/espressif/esp-idf/blob/master/examples/bluetooth/esp_hid_device/README.md

---

## 3. LVGL 9 + CO5300(QSPI) 메모리 전략 — PSRAM 없이

### 3.1 드라이버·BSP
| 선택지 | 내용 |
| --- | --- |
| **`waveshare/esp32_c6_touch_amoled_2_06` v2.0.0** | 대상 esp32c6. 의존성: IDF ≥ 5.3, `waveshare/esp_lcd_sh8601`, `espressif/esp_lcd_touch_ft5x06`, `espressif/esp_lvgl_port ^2`, `lvgl/lvgl >=8,<10`, `esp_codec_dev ~1.5`, `esp_lcd_panel_io_additions ^1` |
| `espressif/esp_lcd_co5300` | 공식 CO5300 드라이버(QSPI 지원, IDF ≥ 5.4). BSP 대신 직접 구성할 때 |
| `espressif/esp_lvgl_port` v2.9.0 | LVGL 8/9 지원. `buffer_size`, `double_buffer`, `buff_dma`, `buff_spiram`, `trans_size`, `swap_bytes`, `rounder_cb` 설정 |

출처: https://components.espressif.com/components/waveshare/esp32_c6_touch_amoled_2_06 , https://components.espressif.com/components/espressif/esp_lcd_co5300 , https://components.espressif.com/components/espressif/esp_lvgl_port

BSP 소스에서 확인한 값(https://github.com/waveshareteam/Waveshare-ESP32-components/tree/master/bsp/esp32_c6_touch_amoled_2_06):
- `BSP_LCD_DRAW_BUFF_SIZE (BSP_LCD_H_RES * 20)` → 410×20 = 8,200 픽셀 = **16.4KB**(RGB565), `BSP_LCD_DRAW_BUFF_DOUBLE (0)`
- 버스 `SPI2_HOST`, `max_transfer_sz` = 한 프레임 크기, `swap_bytes = true`
- **rounder**: 시작 좌표는 짝수로 내림, 끝 좌표는 홀수로 올림(`(x>>1)<<1`, `((x>>1)<<1)+1`) — AMOLED QSPI 의 짝수 정렬 요구. 우리 코드도 같은 rounder 를 쓴다.
- X 오프셋(gap) `0x16`(=22): 410 픽셀 화면의 열 시작 주소. 드라이버 초기화에 그대로 쓴다.
- 주의: BSP 의 `bsp_display_start` 기본 설정에 `buff_spiram = true` 가 보였다(요약 결과, **미확인**). C6 에는 PSRAM 이 없으므로 직접 구성할 때는 `buff_spiram = false`, `buff_dma = true` 로 둔다.

### 3.2 권장 버퍼 구성
| 항목 | 값 | 근거 |
| --- | --- | --- |
| 색 형식 | RGB565(16비트) | `buff_dma` 는 RGB565 에서만 쓸 수 있다(esp_lvgl_port 문서) |
| 렌더 모드 | **PARTIAL** | 전체 프레임 412KB(410×502×2)는 SRAM 512KB 에 넣을 수 없다 |
| 그리기 버퍼 | 410×40줄 × 2개(더블) = 32.8KB × 2 = **약 66KB**, 내부 DMA 가능 RAM | 한 버퍼를 DMA 로 보내는 동안 다른 버퍼에 그린다. 메모리가 빠듯하면 410×20 × 2(약 33KB)로 줄인다 |
| `buff_spiram` | false | PSRAM 없음 |
| `buff_dma` | true | C6 의 SPI2 는 GDMA 를 쓴다(데이터시트) |
| LVGL 힙 | `LV_USE_CLIB_MALLOC=y`(Waveshare 예제와 같음) → IDF 힙 공유 | 별도 64KB 풀을 잡지 않는다 |
| 그리기 유닛 | `LV_DRAW_SW_DRAW_UNIT_CNT=1` | 싱글코어. 예제의 2 는 이득이 없다(**추정**) |
| 폰트·이미지 | `const`(플래시) | RAM 절약. 큰 이미지는 피하고 단색·선 위주 UI |

### 3.3 프레임레이트 예상 (**추정**)
- 전송 상한: SPI2 마스터 QSPI 최대 80MHz(데이터시트) → 4비트 × 80MHz = 40MB/s. 전체 화면 411,640B 전송에 약 10ms(80MHz), 40MHz 라면 약 21ms. BSP 의 실제 클럭(sh8601 매크로 기본값)은 **미확인**.
- 렌더 상한: 160MHz 싱글코어 소프트웨어 렌더라서 렌더가 병목이다. 전체 화면이 바뀌는 애니메이션은 **10~20fps**, 시계 숫자·작은 위젯만 바뀌는 화면은 **30~60fps** 로 본다.
- 이 프로젝트 UI(검정 배경, 모드 이름·아이콘·상태 표시)는 부분 갱신 위주라 충분하다. 전체 화면 슬라이드 전환·그라데이션·투명도 남용은 피한다. 실측은 Waveshare `02_lvgl_demo_v9` 의 `LV_USE_PERF_MONITOR` 로 한다.

---

## 4. BLE + LVGL + IMU 동시 구동 RAM 예산 (**추정**)

HP SRAM 512KB 는 코드(IRAM)·정적 데이터·힙이 나눠 쓴다. C6 는 ROM 에 NimBLE·libc 일부가 있지만, 아래 값은 경험치 어림이다. 2단계 첫 빌드에서 `idf.py size` 와 `heap_caps_get_free_size(MALLOC_CAP_INTERNAL)`, `heap_caps_get_largest_free_block()` 로 반드시 실측한다.

| 항목 | 어림 |
| --- | --- |
| IDF 코드(IRAM) + 정적 데이터(.data/.bss), PERF 최적화 | 120~170KB |
| BLE 컨트롤러 + NimBLE 호스트(주변기기 전용, 연결 1, 본드 4) | 50~70KB |
| LVGL 그리기 버퍼(410×40 × 2) | 66KB |
| LVGL 객체·스타일·화면 3~5개(CLIB malloc) | 30~60KB |
| 태스크 스택: LVGL 8KB, NimBLE 호스트 4KB, IMU 4KB, 입력·HID 4KB, main/타이머/이벤트 약 10KB | 약 30KB |
| IMU 버퍼(100Hz × 6축 × 2초 링버퍼, float) | 약 5KB |
| **합계** | **약 300~400KB** |
| **여유** | **약 110~210KB** |

- 결론: 부분 렌더 + NimBLE 주변기기 전용이면 **들어간다**. 단 여유가 S3 대비 훨씬 작으므로 Wi-Fi 는 쓰지 않고(초기화하지 않으면 메모리를 잡지 않는다), 음성 기능(ESP-SR WakeNet)을 넣으면 예산을 다시 계산한다.
- 싱글코어 우선순위(제안): NimBLE 호스트 > IMU 샘플링(타이머 구동) > 입력·HID 전송 > LVGL. HID 지연이 화면보다 중요하다.
- RAM 줄이는 공식 지침: 태스크 스택은 `uxTaskGetStackHighWaterMark()`(C6 는 바이트 단위)로 재고 줄인다, 읽기 전용 데이터는 `const`, 태스크 수 줄이기.
  - https://docs.espressif.com/projects/esp-idf/en/stable/esp32c6/api-guides/performance/ram-usage.html

---

## 5. esptool 전체 플래시 백업·복원 (C6, 16MB)

esptool v5 기준. 콘솔 명령 `esptool`(`.py` 없이), 하이픈 형식(`read-flash`, `write-flash`, `merge-bin`). 밑줄 형식은 경고와 함께 아직 동작하지만 다음 메이저에서 제거된다.

```bash
# 0) 설치 (Python 3.12)
pip install "esptool>=5,<6"

# 1) 칩·플래시 확인 — ESP32-C6, 16MB 가 나와야 한다
esptool --chip esp32c6 -p COM5 flash-id

# 2) eFuse 보안 상태 확인(읽기 전용)
espefuse --chip esp32c6 -p COM5 summary

# 3) 전체 백업 (ALL = 자동 감지, 또는 16MB 고정 0x1000000)
esptool --chip esp32c6 -p COM5 -b 460800 read-flash 0 ALL backup_full.bin
# esptool --chip esp32c6 -p COM5 -b 460800 read-flash 0 0x1000000 backup_full.bin

# 4) 무결성 기록 (두 번 받아 해시 비교하면 더 안전)
certutil -hashfile backup_full.bin SHA256

# 5) 복원 (0x0 에 전체 이미지. v5 는 쓰고 나서 자동 검증)
esptool --chip esp32c6 -p COM5 -b 460800 write-flash 0x0 backup_full.bin
```
- 백업 파일 크기는 정확히 16,777,216 바이트여야 한다.
- C6 는 USB-Serial/JTAG 로 연결되므로 COM 포트가 바로 잡힌다. 안 잡히면 BOOT 를 누른 채 전원을 켜 다운로드 모드로 들어간다. 작업 뒤 전원을 다시 켠다.
- 16MB 를 460800bps 로 읽으면 이론상 약 5분(계산값). USB-Serial/JTAG 는 보레이트 설정과 무관하게 더 빠를 수 있다(**미확인**).
- `erase-flash` 는 Secure Boot·Flash Encryption 이 켜져 있으면 기본으로 막힌다. 암호화가 켜져 있으면 백업은 같은 칩에만 복원할 수 있다.
- v5 에서 `write-flash --verify` 폐지(자동 검증), `merge-bin --fill-flash-size` → `--pad-to-size`.
- **C6 부트로더 위치는 0x0** 이다("ESP-IDF second stage bootloader is located at the address 0x0 in the flash"). esptool 문서의 `merge-bin` 예시에 `0x1000` 이 보이지만 일반 예시일 뿐이므로, CI 처럼 IDF 가 만든 `build/flash_args` 로 합치면 오프셋을 직접 쓸 일이 없다.

출처
- https://docs.espressif.com/projects/esptool/en/latest/esp32c6/esptool/basic-commands.html
- https://docs.espressif.com/projects/esptool/en/latest/esp32c6/migration-guide.html
- https://docs.espressif.com/projects/esp-idf/en/stable/esp32c6/api-guides/bootloader.html

---

## 6. ESP Web Tools — C6 지원과 매니페스트

### 6.1 C6 지원
- **지원한다.** esp-web-tools 소스의 `chipFamily` 타입에 `"ESP32-C6"` 가 있다(ESP32, C2, C3, C5, C6, C61, H2, P4, S2, S3, ESP8266).
  - https://github.com/esphome/esp-web-tools/blob/main/src/const.ts
- 매니페스트의 `chipFamily` 값은 정확히 **`"ESP32-C6"`**. 연결된 칩과 다르면 설치 버튼이 "지원하지 않는 칩" 으로 막는다. → `tools/firmware_site.py`, `sim/public/firmware/manifest.example.json` 반영.

### 6.2 매니페스트 형식
```json
{
  "name": "손목 컨트롤러",
  "version": "0.1.0",
  "new_install_prompt_erase": true,
  "new_install_improv_wait_time": 0,
  "builds": [
    {
      "chipFamily": "ESP32-C6",
      "parts": [
        { "path": "wrist-controller-v0.1.0-merged.bin", "offset": 0 }
      ]
    }
  ]
}
```
- `new_install_prompt_erase: true`: 지울지 사용자가 고른다(본드 유지용, 7장).
- `new_install_improv_wait_time: 0`: Improv Serial 을 쓰지 않으므로 대기 없앰.
- `parts[].offset` 은 **10진수**. 합친 이미지(`merge-bin`)를 offset 0 에 둔다.
- 출처: https://esphome.github.io/esp-web-tools/ , https://github.com/esphome/esp-web-tools

### 6.3 설치 페이지
```html
<script type="module" src="https://unpkg.com/esp-web-tools@10/dist/web/install-button.js?module"></script>
<esp-web-install-button manifest="firmware/v0.1.0/manifest.json"></esp-web-install-button>
```
- 실제 페이지에서는 정확한 버전으로 고정한다(최신 버전 번호 **미확인**).
- HTTPS 필수(Web Serial), 데스크톱 Chrome·Edge. 모바일 미지원.
- C6 의 USB-Serial/JTAG 는 Web Serial 로 연결된다(S3 의 USB 포트와 같은 방식). 실기기 확인은 **미확인**.

### 6.4 GitHub Release 연동 (이전판 유지)
- GitHub Release 자산 URL 은 CORS 헤더가 없어 브라우저가 직접 받지 못한다. https://github.com/orgs/community/discussions/45446
- 권장 흐름: 태그 푸시 → Actions 가 IDF 빌드·`merge-bin` → Release 에 보관용 첨부 → 같은 파일을 시뮬레이션 사이트 `firmware/vX.Y.Z/` 에 복사하고 `versions.json` 갱신 → Cloudflare Pages(또는 Firebase)에 같은 출처로 배포. (`.github/workflows/ci.yml` 구현됨)

---

## 7. 본드 유지와 설치 방식 (이전판 유지)
- ESP Web Tools 새 설치는 기본으로 전체 지우기 → NVS 본드·모드·장치 이름이 사라져 재페어링 필요.
- `new_install_prompt_erase: true` 로 두고 "지우지 않음" 을 고르면 NVS 유지. 그래서 **파티션 표는 v0.1.0 에서 확정하고 바꾸지 않는다.**
- 현재 `firmware/partitions.csv`: nvs 0x9000(24KB), phy_init 0xF000, factory 앱 0x10000(4MB), storage 0x410000(1MB) → 끝 0x510000, 16MB 안에 들어간다. OTA 는 1차 범위 밖.
- 원래 펌웨어(샤오즈 또는 공장 펌웨어)를 복원한 뒤 다시 설치할 때는 반드시 지우기를 고른다.

---

## 8. ESP-IDF CI action 에서 esp32c6 빌드
- `espressif/esp-idf-ci-action@v1` 입력: `esp_idf_version`(도커 이미지 태그, 기본 latest), `target`(기본 `esp32`, 소문자화하고 `-`·`_` 를 지운 값을 `IDF_TARGET` 환경변수로 컨테이너에 전달), `path`, `command`(기본 `idf.py build`).
  - https://github.com/espressif/esp-idf-ci-action/blob/master/action.yml
- 따라서 `target: esp32c6` 만 바꾸면 된다. `sdkconfig.defaults` 의 `CONFIG_IDF_TARGET="esp32c6"` 와 일치해야 한다.
- `merge-bin` 도 `--chip esp32c6` 로 바꾼다. (`.github/workflows/ci.yml` 반영 완료, IDF v5.5.5 고정 유지)

---

## 9. Arduino 대안의 C6 지원

| 항목 | 상태 |
| --- | --- |
| arduino-esp32 코어 | C6 는 Stable 지원. 최신 안정판 3.3.12(IDF v5.5.5 기반), 4.0.0-RC1(IDF v6.1) 프리릴리스. Waveshare C6 Arduino 예제는 3.3.11 기준 |
| 내장 BLE 라이브러리 | 3.3.0 부터 NimBLE 선택 지원(PR #11424). 내장 `BLEHIDDevice` 의 NimBLE 모드 복합 HID 동작은 **미확인** |
| NimBLE-Arduino(h2zero) | 과거 arduino-esp32 3.x 의 미리 빌드된 libbt 가 C6/H2 에서 Bluedroid 로 묶여 NimBLE-Arduino 와 충돌했다(토론 #9836, 해결 버전 **미확인**) |
| 화면 | Waveshare FAQ: Arduino LVGL 예제는 GFX 라이브러리 경유라 DMA 가속이 제한되어 IDF 판보다 덜 부드럽다 |

출처
- https://docs.espressif.com/projects/arduino-esp32/en/latest/getting_started.html
- https://github.com/espressif/arduino-esp32/releases , https://github.com/espressif/arduino-esp32/pull/11424
- https://github.com/espressif/arduino-esp32/discussions/9836
- https://docs.waveshare.com/ESP32-C6-Touch-AMOLED-2.06/FAQ

**정리**: C6 에서 Arduino 는 BLE 스택 충돌 이력, DMA 가 약한 화면 경로, 복합 HID 라이브러리 부재 때문에 S3 때보다 더 불리하다. RAM 이 빠듯한 C6 에서는 메모리를 세밀하게 조정할 수 있는 IDF 가 낫다.

---

## 10. 결론: 툴체인 권장안

**권장: ESP-IDF v5.5.5(target esp32c6) + NimBLE(주변기기 전용) + esp_hid 복합 리포트 맵 + Waveshare C6 BSP(`esp_lcd_sh8601`, esp_lvgl_port 2.x, LVGL 9) + 부분 렌더 더블 DMA 버퍼(내부 RAM).** Arduino 는 쓰지 않는다.

근거
1. `esp_hid_device` 예제가 C6 를 공식 지원하고, NimBLE 설정·본드 NVS·보안 레벨을 sdkconfig 로 조정할 수 있다.
2. Waveshare 가 C6 보드용 IDF 예제(v5.5.5/v6.0.2)와 BSP 를 제공한다.
3. PSRAM 이 없어 RAM 예산이 핵심 위험이다. IDF 에서만 버퍼 위치·크기, 태스크 스택, NimBLE 역할을 세밀하게 줄일 수 있다.
4. ESP Web Tools(`chipFamily: "ESP32-C6"`), esptool v5, esp-idf-ci-action(`target: esp32c6`) 모두 C6 를 지원해 배포 파이프라인은 칩 이름만 바꾸면 된다.

### 2단계 첫 작업 체크리스트
- [ ] `esptool --chip esp32c6 flash-id` 로 16MB 확인 → `read-flash 0 ALL` 백업(16,777,216B), SHA256 기록
- [ ] `espefuse --chip esp32c6 summary` 로 Flash Encryption·Secure Boot 확인(읽기 전용)
- [ ] Waveshare C6 `02_lvgl_demo_v9`(IDF 5.5.5) 빌드 → 화면·터치·`LV_USE_PERF_MONITOR` fps 실측. 업로드 전 사용자 확인
- [ ] `esp_hid_device` 를 **NimBLE 설정**으로 C6 빌드 → 키 1개 전송, Windows 재연결(`NVS_PERSIST=y`)
- [ ] 2.4 복합 맵으로 교체 → Windows·macOS 확인
- [ ] BLE + LVGL + IMU 동시 구동 후 `heap_caps_get_free_size(MALLOC_CAP_INTERNAL)`·최대 블록 실측, 4장 예산 갱신
- [ ] 음성 기능 범위 재검토(C6 는 ESP-SR WakeNet10s 만 가능)
- [ ] README·설치 페이지(`sim/src/install/install.ts`)의 `esp32s3` 명령을 `esp32c6` 로 교체(다른 담당 확인)
