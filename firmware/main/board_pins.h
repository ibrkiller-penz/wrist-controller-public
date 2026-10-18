// Waveshare ESP32-C6-Touch-AMOLED-2.06 핀·주소 — 근거: docs/research/hardware.md (2026-10-16 C6 기준 재작성)
// 실물 확인: esptool 판독 ESP32-C6 QFN40 rev v0.2, 플래시 16MB(0x20/0x4018), PSRAM 없음.
// 출처: 회로도 V1.0 GPIO 할당표, 공식 핀 문서, 공식 BSP v2.0.0, 샤오즈 boards/waveshare/esp32-c6-touch-amoled-2.06/config.h (네 곳 일치)
// 확인되지 않은 값은 TODO(미확인) 으로 둔다. 실물·회로도로 확인한 뒤에만 값을 바꾼다.
#pragma once

namespace board {

// ---- 버튼
constexpr int PIN_BTN_BOOT = 9;    // 누르면 LOW, 내부 풀업 (스트래핑 핀: 전원 켤 때 누르면 다운로드 모드)
constexpr int PIN_BTN_PWR = 18;    // SYS_OUT, 누르면 HIGH. PMU 전원키와 같은 키 — 길게(샤오즈 설정 4초) 누르면 전원 차단
constexpr bool BTN_BOOT_ACTIVE_LOW = true;
constexpr bool BTN_PWR_ACTIVE_LOW = false;

// ---- 공용 I2C
constexpr int PIN_I2C_SDA = 8;
constexpr int PIN_I2C_SCL = 7;
constexpr int I2C_ADDR_TOUCH_FT3168 = 0x38;
constexpr int I2C_ADDR_IMU_QMI8658 = 0x6B;   // TODO(미확인): 회로도상 SA0=GND 로 보여 0x6A 일 수 있음 — 실물 I2C 스캔으로 확정
constexpr int I2C_ADDR_PMU_AXP2101 = 0x34;
// TODO(미확인): ES8311·ES7210·PCF85063A 주소는 실물 I2C 스캔으로 확정

// ---- 화면 CO5300 QSPI (열 오프셋 22px, 갱신 영역 좌표를 짝수로 맞추는 rounder 필수)
constexpr int PIN_LCD_SCLK = 0;
constexpr int PIN_LCD_SIO0 = 1;
constexpr int PIN_LCD_SIO1 = 2;
constexpr int PIN_LCD_SIO2 = 3;
constexpr int PIN_LCD_SIO3 = 4;
constexpr int PIN_LCD_CS = 5;
constexpr int PIN_LCD_RESET = 11;
// LCD TE 는 MCU 에 연결돼 있지 않다
constexpr int LCD_W = 410;
constexpr int LCD_H = 502;
constexpr int LCD_COL_OFFSET = 22;
// PSRAM 없음: 전체 버퍼(411,640B) 불가. 40줄 이중 버퍼(65.6KB, 내부 DMA RAM) 기본, 부족하면 20줄. 줄 수는 짝수.
constexpr int LVGL_BUF_LINES = 40;

// ---- 터치 FT3168
constexpr int PIN_TOUCH_INT = 15;
constexpr int PIN_TOUCH_RESET = 10;

// ---- IMU QMI8658C — INT1/INT2 는 UART0 TX/RX 와 겹친다. 로그 콘솔은 USB-Serial/JTAG 로 고정
constexpr int PIN_IMU_INT1 = 16;
constexpr int PIN_IMU_INT2 = 17;

// ---- 오디오 ES8311(재생) + ES7210(녹음, 마이크 2개)
constexpr int PIN_I2S_MCLK = 19;
constexpr int PIN_I2S_BCLK = 20;
constexpr int PIN_I2S_DIN = 21;   // ← ES7210
constexpr int PIN_I2S_LRCK = 22;
constexpr int PIN_I2S_DOUT = 23;  // → ES8311
constexpr int PIN_SPK_AMP_EN = 6;

// ---- 없는 것: 진동 모터, SD 슬롯, USB OTG(USB-Serial/JTAG 만 GPIO12/13), PMU IRQ·RTC INT 의 MCU 연결

}  // namespace board
