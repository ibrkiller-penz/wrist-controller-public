// 손목 컨트롤러 펌웨어 진입점 — ESP-IDF 5.5.x (골격)
//
// 판정 로직(모드·키맵·튕김·에어마우스)은 전부 firmware/logic(wc::step) 에 있고, 시뮬레이션(sim/src/core)과
// 같은 테스트 벡터를 통과한다. 이 파일은 하드웨어 ↔ wc::step 을 잇는 배선만 맡는다.
// 키 배치는 main/generated/keymap_gen.h(= shared/keymap.json) 에서만 온다 — 여기서 키 이름을 쓰지 않는다.
//
// 작업지시서 2단계 순서(각 단계는 실제 시계에서 확인한 뒤 다음으로, 업로드 전 사용자 확인):
//   1. 원래 펌웨어 백업(README.md), Waveshare 예제로 화면·터치 확인
//   2. 툴체인 결정(IDF 권장, firmware-stack.md 8장), 빈 LVGL 화면              → 구현됨(STEP2) display_ui.c — 실기 확인 필요
//   3. BLE HID 키보드 단일: → 키 하나. Windows 페어링·재연결                    → 구현됨(STEP3) ble_hid.c — 실기 확인 필요
//   4. 복합 HID(키보드+마우스+미디어), 맥 연결                                  → 구현됨(STEP4) hidSend — 실기 확인 필요(맥)
//   5. keymap.json → C 헤더(tools/gen_keymap_header.py, 완료), 세 모드 UI·전환  → 구현됨(STEP5) ui.cpp·TouchGesture — 실기 확인 필요
//   6. IMU 읽기, 녹화(직렬 CSV) → 시뮬레이션 재생                               → 구현됨(STEP6) imu_qmi8658.c — 실기 확인 필요
//   7. 에어마우스·손목 제스처(로직 완료, 벡터 통과) — 센서 배선만               → 구현됨(STEP7) imuTask → 코어 — 실기 튜닝 필요
//   8. 음성 — 2026-10-17 제거(메모리 부족, 나중에 Gemini 로: docs/research/gemini-later.md)
//   9. 전원 관리: 화면 자동 꺼짐, 손목 들면 켜짐, 배터리 표시                   → 구현됨(STEP9) powerTick·pmu_axp2101.c — 실기 확인 필요
#include <cinttypes>
#include <cmath>
#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <ctime>
#include <sys/time.h>
#include <fcntl.h>
#include <unistd.h>
#include <string>
#include <vector>

#include "ble_hid.h"
#include "board_pins.h"
#include "display_ui.h"
#include "imu_qmi8658.h"
#include "pmu_axp2101.h"
#include "rtc_pcf85063.h"
#include "ui.h"
#include "driver/gpio.h"
#include "driver/usb_serial_jtag.h"
#include "driver/usb_serial_jtag_vfs.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "hid_report_map.h"
#include "keymap_gen.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "sdkconfig.h"
#include "wc/logic.h"
#include "wc/touch_gesture.h"

// LVGL 그리기 버퍼 줄 수는 BSP Kconfig(sdkconfig.defaults)가 정한다. board_pins.h 의 설계값과 어긋나면 빌드를 멈춘다.
static_assert(CONFIG_BSP_DISPLAY_LVGL_BUF_HEIGHT == board::LVGL_BUF_LINES,
              "sdkconfig.defaults CONFIG_BSP_DISPLAY_LVGL_BUF_HEIGHT 와 board::LVGL_BUF_LINES 를 맞추세요");
static_assert(board::LVGL_BUF_LINES % 2 == 0, "CO5300 rounder 때문에 버퍼 줄 수는 짝수");

namespace {

const char* TAG = "wc";

// 펌웨어 버전 — CI 가 태그(v*.*.*)로 빌드할 때 -DWC_FW_VERSION 으로 넘긴다. 설정 화면에 표시(작업지시서).
#ifndef WC_FW_VERSION
#define WC_FW_VERSION "0.0.0-dev"
#endif

// ---------------------------------------------------------------------------
// 코어 상태 — 모든 입력은 dispatch() 한 곳으로(여러 태스크에서 부르므로 뮤텍스)
// ---------------------------------------------------------------------------

wc::Keymap g_keymap;
wc::GestureConfig g_gesture;
wc::CoreState g_state;
SemaphoreHandle_t g_lock = nullptr;
std::string g_deviceName;

constexpr uint32_t kTickMs = 50;  // sim App 과 같은 50ms tick

double nowMs() { return static_cast<double>(esp_timer_get_time()) / 1000.0; }

// 내부 RAM 여유(PSRAM 없음 — firmware-stack.md 4장 예산을 실측으로 갱신하기 위한 로그)
void logHeap(const char* when) {
  ESP_LOGI(TAG, "[메모리 %s] 내부 RAM 여유 %u B, 최대 블록 %u B, 최저 여유 %u B, DMA 여유 %u B", when,
           static_cast<unsigned>(heap_caps_get_free_size(MALLOC_CAP_INTERNAL)),
           static_cast<unsigned>(heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL)),
           static_cast<unsigned>(heap_caps_get_minimum_free_size(MALLOC_CAP_INTERNAL)),
           static_cast<unsigned>(heap_caps_get_free_size(MALLOC_CAP_DMA)));
}

// 마지막으로 보낸 키(g_lock 안에서 쓴다) — 직렬 's' 상태 로그용. 화면 피드백은 g_act*(ui.cpp)가 한다.
std::string g_lastSent = "sent: -";
// 화면 피드백용 마지막 동작 이벤트(넘김 플래시·타일 확인 테두리·끊김 중 '보내지 못함'). g_lock 안에서 쓴다
uint32_t g_actSeq = 0;
wc::ActionId g_actAction = wc::ActionId::Next;
bool g_actSent = false;
double g_actAt = 0;
uint8_t g_mouseButtons = 0;  // 마우스 보고서 버튼 비트(누른 채 이동할 때 유지)

std::string asciiChord(uint8_t mods, const std::string& key) {
  std::string out;
  if (mods & wc::MOD_CTRL) out += "CTRL+";
  if (mods & wc::MOD_ALT) out += "ALT+";
  if (mods & wc::MOD_SHIFT) out += "SHIFT+";
  if (mods & wc::MOD_GUI) out += "GUI+";
  out += key;
  return out;
}

// BLE 연결 상태 → tick 태스크(NimBLE 호스트 태스크에서 바로 dispatch 하지 않는다: 잠금 순서 단순화)
QueueHandle_t g_connQueue = nullptr;

void onBleConn(bool ready) {
  if (g_connQueue) xQueueSend(g_connQueue, &ready, 0);
}

// ---------------------------------------------------------------------------
// HID 출력 — 키보드(STEP3)·마우스·컨슈머(STEP4) 실제 전송(ble_hid.c, 복합 맵 하나)
// ---------------------------------------------------------------------------

// 매크로(실행 모드 Win+R … 등)는 단계 사이 대기가 있어 dispatch(g_lock) 안에서 보내지 않고 전용 태스크로 넘긴다.
// 실행 중에 새 매크로가 오면 버린다(launcher.md 3장: 실행 중 다른 타일 입력은 무시). 끝나면 모든 키 뗌을 보장.
struct MacroJob {
  std::vector<wc::MacroReport>* reports;
  wc::ActionId action;
};
QueueHandle_t g_macroQueue = nullptr;
volatile bool g_macroBusy = false;

void macroTask(void*) {
  MacroJob job;
  for (;;) {
    if (xQueueReceive(g_macroQueue, &job, portMAX_DELAY) != pdTRUE) continue;
    const int64_t t0 = esp_timer_get_time();
    esp_err_t err = ESP_OK;
    int sent = 0;
    for (const auto& r : *job.reports) {
      if (r.kind == wc::MacroReportKind::Wait) {
        if (r.ms > 0) vTaskDelay(pdMS_TO_TICKS(r.ms));
        continue;
      }
      if (r.kind == wc::MacroReportKind::Kbd) {
        uint8_t rep[hidmap::KEYBOARD_REPORT_LEN] = {r.mod, 0, static_cast<uint8_t>(r.usage), 0, 0, 0, 0, 0};
        err = wc_ble_hid_send(hidmap::REPORT_ID_KEYBOARD, rep, sizeof(rep));
      } else {
        uint8_t rep[hidmap::CONSUMER_REPORT_LEN] = {static_cast<uint8_t>(r.usage & 0xFF), static_cast<uint8_t>(r.usage >> 8)};
        err = wc_ble_hid_send(hidmap::REPORT_ID_CONSUMER, rep, sizeof(rep));
      }
      if (err != ESP_OK) break;  // 연결 끊김 등 — 남은 단계는 버린다
      ++sent;
    }
    // 끝(또는 중단): 모든 키 뗌
    uint8_t up[hidmap::KEYBOARD_REPORT_LEN] = {0};
    uint8_t cup[hidmap::CONSUMER_REPORT_LEN] = {0, 0};
    (void)wc_ble_hid_send(hidmap::REPORT_ID_KEYBOARD, up, sizeof(up));
    (void)wc_ble_hid_send(hidmap::REPORT_ID_CONSUMER, cup, sizeof(cup));
    ESP_LOGI(TAG, "매크로 %s: 보고서 %d/%u, %lld ms -> %s", wc::name(job.action), sent, static_cast<unsigned>(job.reports->size()),
             static_cast<long long>((esp_timer_get_time() - t0) / 1000), esp_err_to_name(err));
    delete job.reports;
    g_macroBusy = false;
  }
}

void hidSend(const wc::Emitted& e) {
  const wc::HidEvent& ev = e.ev;
  switch (ev.t) {
    case wc::HidType::Macro: {
      const std::string label = wc::formatSteps(ev.steps, g_state.os);
      if (g_macroBusy || !g_macroQueue) {
        ESP_LOGW(TAG, "매크로 실행 중 — 새 매크로 버림(%s)", label.c_str());
        g_lastSent = "busy: macro running";
        break;
      }
      g_macroBusy = true;
      MacroJob job{new std::vector<wc::MacroReport>(wc::expandMacro(ev.steps)), e.action.value_or(wc::ActionId::Next)};
      if (xQueueSend(g_macroQueue, &job, 0) != pdTRUE) {
        delete job.reports;
        g_macroBusy = false;
        break;
      }
      ESP_LOGI(TAG, "HID macro %s src=%s", label.c_str(), wc::name(e.source));
      // 화면 하단: 글꼴에 화살표가 없어 '>' 로 잇는다
      std::string ascii;
      for (const auto& st : ev.steps) {
        if (st.kind == wc::MacroStepKind::Wait) continue;
        if (!ascii.empty()) ascii += " > ";
        ascii += st.kind == wc::MacroStepKind::Chord  ? asciiChord(st.chord.mods, st.chord.key)
                 : st.kind == wc::MacroStepKind::Text ? st.text
                                                       : st.consumerName;
      }
      g_lastSent = "sent: " + ascii;
      break;
    }
    case wc::HidType::Key: {
      // 키보드 보고서(ID 1): 누름 [mods, 0, usage, 0,0,0,0,0] → 뗌 [0 × 8]
      uint8_t down[hidmap::KEYBOARD_REPORT_LEN] = {ev.mods, 0, ev.usage, 0, 0, 0, 0, 0};
      uint8_t up[hidmap::KEYBOARD_REPORT_LEN] = {0};
      esp_err_t err = wc_ble_hid_send(hidmap::REPORT_ID_KEYBOARD, down, sizeof(down));
      if (err == ESP_OK) err = wc_ble_hid_send(hidmap::REPORT_ID_KEYBOARD, up, sizeof(up));
      // 누름은 갔는데 뗌이 실패하면 키가 눌린 채로 남을 수 있다 → 한 번 더 뗌을 시도
      if (err != ESP_OK) (void)wc_ble_hid_send(hidmap::REPORT_ID_KEYBOARD, up, sizeof(up));
      ESP_LOGI(TAG, "HID key %s (mod 0x%02X usage 0x%02X) src=%s -> %s",
               wc::formatChord(wc::Chord{ev.mods, ev.key, ev.usage}, g_state.os).c_str(), ev.mods, ev.usage,
               wc::name(e.source), esp_err_to_name(err));
      g_lastSent = (err == ESP_OK ? "sent: " : "fail: ") + asciiChord(ev.mods, ev.key);
      break;
    }
    case wc::HidType::MouseMove: {
      // 마우스 보고서(ID 2) [버튼, dx, dy, 휠]. 한 보고서는 -127..127 이라 큰 이동은 여러 보고서로 나눈다
      int dx = ev.dx;
      int dy = ev.dy;
      esp_err_t err = ESP_OK;
      for (int guard = 0; (dx != 0 || dy != 0) && guard < 16 && err == ESP_OK; ++guard) {
        const int sx = dx > 127 ? 127 : (dx < -127 ? -127 : dx);
        const int sy = dy > 127 ? 127 : (dy < -127 ? -127 : dy);
        uint8_t rep[hidmap::MOUSE_REPORT_LEN] = {g_mouseButtons, static_cast<uint8_t>(static_cast<int8_t>(sx)),
                                                 static_cast<uint8_t>(static_cast<int8_t>(sy)), 0};
        err = wc_ble_hid_send(hidmap::REPORT_ID_MOUSE, rep, sizeof(rep));
        dx -= sx;
        dy -= sy;
      }
      ESP_LOGD(TAG, "HID move %d,%d -> %s", ev.dx, ev.dy, esp_err_to_name(err));
      break;
    }
    case wc::HidType::MouseButton: {
      // 버튼 비트: 왼쪽 0x01, 오른쪽 0x02, 가운데 0x04(리포트 맵 버튼 1~3). 누름/뗌을 따로 보낸다
      const uint8_t bit = ev.button == wc::MouseButton::Left ? 0x01 : ev.button == wc::MouseButton::Right ? 0x02 : 0x04;
      g_mouseButtons = ev.down ? static_cast<uint8_t>(g_mouseButtons | bit) : static_cast<uint8_t>(g_mouseButtons & ~bit);
      uint8_t rep[hidmap::MOUSE_REPORT_LEN] = {g_mouseButtons, 0, 0, 0};
      const esp_err_t err = wc_ble_hid_send(hidmap::REPORT_ID_MOUSE, rep, sizeof(rep));
      ESP_LOGI(TAG, "HID mouse %s %s -> %s", wc::name(ev.button), ev.down ? "down" : "up", esp_err_to_name(err));
      if (ev.down) g_lastSent = std::string(err == ESP_OK ? "sent: " : "fail: ") + "CLICK";
      break;
    }
    case wc::HidType::Consumer: {
      // 컨슈머 보고서(ID 3) [사용 코드 하위, 상위] → 뗌 [0, 0]
      uint8_t down[hidmap::CONSUMER_REPORT_LEN] = {static_cast<uint8_t>(ev.consumer & 0xFF),
                                                   static_cast<uint8_t>(ev.consumer >> 8)};
      uint8_t up[hidmap::CONSUMER_REPORT_LEN] = {0, 0};
      esp_err_t err = wc_ble_hid_send(hidmap::REPORT_ID_CONSUMER, down, sizeof(down));
      if (err == ESP_OK) err = wc_ble_hid_send(hidmap::REPORT_ID_CONSUMER, up, sizeof(up));
      if (err != ESP_OK) (void)wc_ble_hid_send(hidmap::REPORT_ID_CONSUMER, up, sizeof(up));
      ESP_LOGI(TAG, "HID consumer 0x%04X -> %s", ev.consumer, esp_err_to_name(err));
      char buf[24];
      std::snprintf(buf, sizeof(buf), "MEDIA 0x%04X", ev.consumer);
      g_lastSent = std::string(err == ESP_OK ? "sent: " : "fail: ") + buf;
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// NVS — 마지막 모드·장치 이름 보관(작업지시서: 마지막 모드는 재부팅 후에도 유지, BLE 이름은 사용자가 변경)
// 페어링 본드는 NimBLE 가 CONFIG_BT_NIMBLE_NVS_PERSIST 로 따로 저장한다.
// ---------------------------------------------------------------------------

constexpr const char* NVS_NS = "wc";
constexpr const char* NVS_KEY_MODE = "mode";
constexpr const char* NVS_KEY_NAME = "devname";
bool g_nameFromNvs = false;  // 장치 이름을 사용자가 정했나(직렬 'n')
constexpr const char* NVS_KEY_OS = "os";
constexpr const char* NVS_KEY_SENS = "sens";
constexpr const char* NVS_KEY_TZ = "tzmin";        // 시간대(분, UTC 기준). 기본 KST +540
constexpr const char* NVS_KEY_RAISE = "raiseclk";  // 손목 들면 시계 화면 먼저(기본 끔 = 마지막 모드 유지)
constexpr const char* NVS_KEY_AIR = "airmouse";     // 에어마우스 켬(기본 = gesture.json airMouse.enabled = 끔)
int g_tzMin = 540;
bool g_raiseClock = false;
bool g_timeValid = false;

// 시간대 → POSIX TZ(부호가 반대: UTC+9 = "<+09>-9"). 분 단위까지
void applyTz() {
  const int m = g_tzMin;
  const int a = m < 0 ? -m : m;
  char tz[32];
  std::snprintf(tz, sizeof(tz), "UTC%c%02d:%02d", m >= 0 ? '-' : '+', a / 60, a % 60);
  setenv("TZ", tz, 1);
  tzset();
}
int64_t g_saveDueUs = 0;  // 0 이 아니면 이 시각에 저장(1초 지연 저장 — 잦은 플래시 쓰기 방지)

void nvsInit() {
  esp_err_t err = nvs_flash_init();
  if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    // 파티션 표가 바뀌었거나 꽉 찬 경우에만 지운다(본드도 사라진다 — README 주의 참고)
    ESP_ERROR_CHECK(nvs_flash_erase());
    err = nvs_flash_init();
  }
  ESP_ERROR_CHECK(err);
}

void nvsLoadPrefs(wc::CoreState& s) {
  nvs_handle_t h;
  if (nvs_open(NVS_NS, NVS_READONLY, &h) != ESP_OK) return;
  uint8_t v = 0;
  if (nvs_get_u8(h, NVS_KEY_MODE, &v) == ESP_OK && v < wc::kModeCount) s.mode = static_cast<wc::ModeId>(v);
  if (nvs_get_u8(h, NVS_KEY_OS, &v) == ESP_OK && v <= 1) s.os = static_cast<wc::OsId>(v);
  if (nvs_get_u8(h, NVS_KEY_SENS, &v) == ESP_OK && v < g_gesture.airMouse.sensitivity.size()) s.sensitivity = v;
  int16_t tz = 0;
  if (nvs_get_i16(h, NVS_KEY_TZ, &tz) == ESP_OK && tz >= -720 && tz <= 840) g_tzMin = tz;
  if (nvs_get_u8(h, NVS_KEY_RAISE, &v) == ESP_OK) g_raiseClock = v != 0;
  if (nvs_get_u8(h, NVS_KEY_AIR, &v) == ESP_OK) g_gesture.airMouse.enabled = v != 0;
  char name[64] = {0};
  size_t len = sizeof(name);
  // 사용자가 직렬 'n' 으로 정한 이름만 쓴다. 예전 펌웨어가 자동으로 저장한 기본 이름(MAC 꼬리 없음)은 무시한다.
  if (nvs_get_str(h, NVS_KEY_NAME, name, &len) == ESP_OK && name[0] != 0 && g_keymap.settings.deviceName != name) {
    g_deviceName = name;
    g_nameFromNvs = true;
  }
  nvs_close(h);
}

void nvsSavePrefs() {
  nvs_handle_t h;
  if (nvs_open(NVS_NS, NVS_READWRITE, &h) != ESP_OK) return;
  nvs_set_u8(h, NVS_KEY_MODE, static_cast<uint8_t>(g_state.mode));
  nvs_set_u8(h, NVS_KEY_OS, static_cast<uint8_t>(g_state.os));
  nvs_set_u8(h, NVS_KEY_SENS, static_cast<uint8_t>(g_state.sensitivity));
  nvs_set_i16(h, NVS_KEY_TZ, static_cast<int16_t>(g_tzMin));
  nvs_set_u8(h, NVS_KEY_RAISE, g_raiseClock ? 1 : 0);
  nvs_set_u8(h, NVS_KEY_AIR, g_gesture.airMouse.enabled ? 1 : 0);
  if (g_nameFromNvs) nvs_set_str(h, NVS_KEY_NAME, g_deviceName.c_str());  // 사용자 이름일 때만
  nvs_commit(h);
  nvs_close(h);
  ESP_LOGI(TAG, "설정 저장(mode=%s)", wc::name(g_state.mode));
}

// ---------------------------------------------------------------------------
// 입력 하나 → 코어 → HID·화면 피드백
// ---------------------------------------------------------------------------

void dispatch(const wc::InputEvent& input) {
  xSemaphoreTake(g_lock, portMAX_DELAY);
  wc::StepContext ctx;
  ctx.now = nowMs();
  ctx.keymap = &g_keymap;
  ctx.gesture = &g_gesture;
  wc::StepResult r = wc::step(g_state, input, ctx);
  g_state = std::move(r.state);
  for (const auto& e : r.hid) hidSend(e);
  // r.dropped: 연결 끊김으로 버린 HID — 쌓지 않고, 재연결 후에도 보내지 않는다(화면에만 알림)
  for (const auto& e : r.dropped) {
    if (e.ev.t == wc::HidType::Key) g_lastSent = "dropped: " + asciiChord(e.ev.mods, e.ev.key);
    else if (e.ev.t == wc::HidType::Macro) g_lastSent = "dropped: macro";
  }
  for (const auto& ev : r.events) {
    switch (ev.t) {
      case wc::EventType::Mode:
      case wc::EventType::Os:
      case wc::EventType::Sensitivity:
        g_saveDueUs = esp_timer_get_time() + 1000 * 1000;
        break;
      case wc::EventType::Action:
        // 화면 피드백(ui.cpp): 발표 넘김 플래시 3단계, 타일 확인 테두리, 끊김 중이면 배너 '보내지 못함'·흔들림
        ++g_actSeq;
        g_actAction = ev.action;
        g_actSent = ev.value;
        g_actAt = ctx.now;
        break;
      default:
        break;
    }
  }
  xSemaphoreGive(g_lock);
}

// ---------------------------------------------------------------------------
// 측면 버튼 — 원시 down/up 만 넘기면 코어가 시간으로 짧게/길게/에어마우스를 판정한다
// ---------------------------------------------------------------------------

void buttonsInit() {
  gpio_config_t io = {};
  io.pin_bit_mask = (1ULL << board::PIN_BTN_BOOT);
  io.mode = GPIO_MODE_INPUT;
  io.pull_up_en = GPIO_PULLUP_ENABLE;
  io.pull_down_en = GPIO_PULLDOWN_DISABLE;
  io.intr_type = GPIO_INTR_DISABLE;
  gpio_config(&io);
  // PWR(GPIO18, SYS_OUT): 누르면 HIGH. 외부 회로가 레벨을 정하므로 내부 풀업을 끈다(hardware.md 2.8).
  // 주의: PWR 를 약 6초 누르면 AXP2101 가 전원을 끊는다 — 2초 잠금은 그 전에 판정이 끝난다.
  io.pin_bit_mask = (1ULL << board::PIN_BTN_PWR);
  io.pull_up_en = GPIO_PULLUP_DISABLE;
  gpio_config(&io);
}

bool buttonPressed(int pin, bool activeLow) {
  const int level = gpio_get_level(static_cast<gpio_num_t>(pin));
  return activeLow ? level == 0 : level == 1;
}

// ---------------------------------------------------------------------------
// IMU 녹화(2단계 6번) — 직렬로 CSV 를 내보내면 시뮬레이션 '녹화 재생'에서 그대로 연다.
// 형식: 머리글 t_ms,gx,gy,gz,ax,ay,az / 각속도 deg/s(센서 축), 가속도 g. '#' 로 시작하는 줄은 주석.
// (sim/src/input/imuSources.ts parseImuCsv 와 같은 형식)
// ---------------------------------------------------------------------------

bool g_imuRecording = false;
double g_imuRecordT0 = 0;

void imuRecordBegin() {
  // 녹화 중에는 로그를 경고 이상만 남긴다(CSV 줄 사이에 로그가 섞이면 시뮬레이션 parseImuCsv 가 읽기 어렵다)
  esp_log_level_set("*", ESP_LOG_WARN);
  g_imuRecording = true;
  g_imuRecordT0 = nowMs();
  std::printf("# wrist-controller imu record v1, fw %s, rate %.0fHz\n", WC_FW_VERSION, g_gesture.imu.sampleRateHz);
  std::printf("t_ms,gx,gy,gz,ax,ay,az\n");
}

void imuRecordLine(double tMs, const float g[3], const float a[3]) {
  if (!g_imuRecording) return;
  std::printf("%.0f,%.2f,%.2f,%.2f,%.3f,%.3f,%.3f\n", tMs - g_imuRecordT0, g[0], g[1], g[2], a[0], a[1], a[2]);
}

void imuRecordEnd() {
  g_imuRecording = false;
  std::printf("# end\n");
  esp_log_level_set("*", ESP_LOG_INFO);
}

// ---------------------------------------------------------------------------
// IMU(STEP6·7) — QMI8658 을 gesture.imu.sampleRateHz(100Hz) 로 읽어 코어에 넘긴다.
//   코어가 하는 것: 영점(바이어스) 추적 biasStep, 에어마우스(주 버튼 누른 채 → mouseMove), 손목 튕김(flick → 다음/이전).
//   센서 축 → 논리 축(yaw/pitch/roll) 매핑은 gesture.json imu.axisMap/axisSign(보드 기준 초기값) — 실기 튜닝 필요.
//   가속도는 녹화(CSV)와 손목 들기 화면 켜기(STEP9)에만 쓴다.
// ---------------------------------------------------------------------------

uint8_t g_imuAddr = 0;      // 찾은 I2C 주소(0 = 없음)
float g_lastAccel[3] = {0, 0, 1};
volatile bool g_accelFresh = false;
void onAccelSample(double tMs, const float a[3]);  // STEP9 손목 들기(아래 전원 절)

void onImuSample(double tMs, const float g[3], const float a[3]) {
  imuRecordLine(tMs, g, a);
  std::memcpy(g_lastAccel, a, sizeof(g_lastAccel));
  onAccelSample(tMs, a);
  dispatch(wc::InputEvent::imu(wc::ImuSample{tMs, g[0], g[1], g[2]}));
}

void imuTask(void*) {
  const double hz = g_gesture.imu.sampleRateHz > 0 ? g_gesture.imu.sampleRateHz : 100.0;
  const TickType_t period = pdMS_TO_TICKS(static_cast<uint32_t>(1000.0 / hz + 0.5));
  TickType_t last = xTaskGetTickCount();
  int fails = 0;
  for (;;) {
    float g[3], a[3];
    if (wc_imu_read(g, a) == ESP_OK) {
      fails = 0;
      onImuSample(nowMs(), g, a);
    } else if (++fails % 100 == 1) {
      ESP_LOGW(TAG, "IMU 읽기 실패(%d회)", fails);
    }
    vTaskDelayUntil(&last, period > 0 ? period : 1);
  }
}

// ---------------------------------------------------------------------------
// 직렬 명령(USB-Serial/JTAG 콘솔) — 한 줄 명령, Enter 로 끝
//   r          IMU 녹화 시작/정지(CSV: t_ms,gx,gy,gz,ax,ay,az)
//   s          상태(메모리·모드·BLE·IMU 주소)
//   n <이름>   BLE 장치 이름 저장(UTF-8 ≤ 29바이트, 다시 켜면 적용)
//   t <유닉스초> <시간대분>   시각 맞추기(RTC 에 UTC 로 기록, 시간대는 NVS). 설치 페이지 '시계 시간 맞추기'가 보낸다
//   h          도움말
// ---------------------------------------------------------------------------

void nvsSavePrefs();
void logHeap(const char* when);

void serialCommand(const std::string& line) {
  if (line.empty()) return;
  const char c = line[0];
  if (c == 'r') {
    if (g_imuRecording) imuRecordEnd();
    else imuRecordBegin();
  } else if (c == 's') {
    logHeap("상태");
    ESP_LOGW(TAG, "모드 %s, BLE %d, IMU 0x%02X, 이름 '%s', 마지막 전송 '%s'", wc::name(g_state.mode),
             static_cast<int>(wc_ble_hid_status()), g_imuAddr, g_deviceName.c_str(), g_lastSent.c_str());
  } else if (c == 't' && line.size() > 2) {
    long long unix = 0;
    int tz = g_tzMin;
    const int n = std::sscanf(line.c_str() + 2, "%lld %d", &unix, &tz);
    if (n < 1 || unix < 1700000000LL) {
      ESP_LOGW(TAG, "시각 명령 형식: t <유닉스초> <시간대분>");
      return;
    }
    timeval tv{static_cast<time_t>(unix), 0};
    settimeofday(&tv, nullptr);
    if (tz >= -720 && tz <= 840) g_tzMin = tz;
    applyTz();
    g_timeValid = true;
    const esp_err_t er = wc_rtc_write(static_cast<time_t>(unix));
    nvsSavePrefs();
    ESP_LOGW(TAG, "시각 맞춤: %lld (UTC%+d분), RTC 기록 %s", unix, g_tzMin, esp_err_to_name(er));
  } else if (c == 'n' && line.size() > 2) {
    std::string name = line.substr(2);
    if (name.size() > static_cast<size_t>(g_keymap.settings.deviceNameMaxBytes)) {
      ESP_LOGW(TAG, "이름이 %d바이트를 넘습니다", g_keymap.settings.deviceNameMaxBytes);
      return;
    }
    xSemaphoreTake(g_lock, portMAX_DELAY);
    g_deviceName = name;
    g_nameFromNvs = true;
    xSemaphoreGive(g_lock);
    nvsSavePrefs();
    ESP_LOGW(TAG, "장치 이름 저장: '%s' — 다시 켜면 적용(PC 에서 장치를 지우고 다시 페어링)", name.c_str());
  } else {
    std::printf("# 명령: r = IMU 녹화 시작/정지, s = 상태, n <이름> = 장치 이름, t <유닉스초> <시간대분> = 시각, h = 도움말\n");
  }
}

void serialTask(void*) {
  // USB-Serial/JTAG 콘솔은 드라이버 없이는 PC → 시계 입력을 받지 못한다(실기: pyserial 쓰기가 막힘).
  // 드라이버를 깔고 VFS 를 드라이버 경로로 바꾼다. 쓰기는 IDF 가 50ms 타임아웃 뒤 버리므로(호스트가 포트를
  // 안 열었을 때) 로그가 막히지 않는다(usb_serial_jtag_vfs.c usbjtag_tx_char_via_driver).
  usb_serial_jtag_driver_config_t cfg = USB_SERIAL_JTAG_DRIVER_CONFIG_DEFAULT();
  cfg.rx_buffer_size = 512;
  cfg.tx_buffer_size = 1024;
  esp_err_t err = usb_serial_jtag_driver_install(&cfg);
  if (err == ESP_OK) {
    usb_serial_jtag_vfs_use_driver();
    ESP_LOGI(TAG, "직렬 명령 받기 준비(USB-Serial/JTAG 드라이버)");
  } else {
    ESP_LOGE(TAG, "USB-Serial/JTAG 드라이버 설치 실패 %s — 직렬 명령 없음", esp_err_to_name(err));
    vTaskDelete(nullptr);
    return;
  }
  std::string line;
  for (;;) {
    uint8_t buf[64];
    const int n = usb_serial_jtag_read_bytes(buf, sizeof(buf), pdMS_TO_TICKS(50));
    for (int i = 0; i < n; ++i) {
      const char ch = static_cast<char>(buf[i]);
      if (ch == '\r' || ch == '\n') {
        serialCommand(line);
        line.clear();
      } else if (line.size() < 64) {
        line += ch;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 전원·음성·배터리 상태(STEP8·9)
// ---------------------------------------------------------------------------

wc::TouchGesture g_touch;     // 터치 판정 상태(g_lock 안에서 쓴다)
bool g_settingsOpen = false;  // 시계 설정 화면(발표 외 모드에서 위 가장자리 아래로 당김)

// ---------------------------------------------------------------------------
// 전원(STEP9) — 값은 gesture.json power(생성 헤더 g_gesture.power)
//   - 마지막 입력(터치·버튼·음성·손목 들기) 뒤 screenOffMs 가 지나면 화면 끔(밝기 0 + 패널 표시 끔).
//     코어 screenOn 을 false 로 둬 꺼진 화면의 터치가 판정에 들어가지 않게 한다(PWR 짧게 = 코어가 켜기/끄기 토글).
//   - 켜기: 터치(그 터치는 버림), BOOT 버튼(누른 동작은 그대로 보냄 — 화면 안 보고도 넘김), 손목 들기(가속도).
//   - 배터리: AXP2101 잔량 %·충전 여부를 batteryPollMs 마다 읽어 상태줄에 표시.
// ---------------------------------------------------------------------------

int64_t g_lastActivityUs = 0;
bool g_panelOn = true;  // 실제 패널 상태(코어 screenOn 을 따라간다)
volatile int g_batteryPct = -1;
volatile bool g_charging = false;
bool g_swallowTouch = false;

void noteActivity() { g_lastActivityUs = esp_timer_get_time(); }

// 코어 screenOn 을 켠다(g_lock 안에서 부르지 않는다)
void screenWake(const char* why) {
  noteActivity();
  xSemaphoreTake(g_lock, portMAX_DELAY);
  const bool was = g_state.screenOn;
  g_state.screenOn = true;
  xSemaphoreGive(g_lock);
  if (!was) ESP_LOGI(TAG, "화면 켬(%s)", why);
}

// 꺼진 화면을 터치하면 켜고, 손을 뗄 때까지 그 터치는 버린다
bool screenWakeSwallow(bool down) {
  if (down && !g_swallowTouch) {
    xSemaphoreTake(g_lock, portMAX_DELAY);
    const bool off = !g_state.screenOn && !g_touch.active();
    xSemaphoreGive(g_lock);
    if (off) {
      screenWake("터치");
      g_swallowTouch = true;
    }
  }
  if (g_swallowTouch) {
    if (!down) g_swallowTouch = false;
    return true;
  }
  return false;
}

// tick 마다: 자동 꺼짐 판정 + 패널을 코어 screenOn 에 맞춤
void powerTick() {
  const auto& pw = g_gesture.power;
  xSemaphoreTake(g_lock, portMAX_DELAY);
  if (g_state.screenOn && pw.screenOffMs > 0 && !g_state.air.active && !g_touch.active() &&
      esp_timer_get_time() - g_lastActivityUs > static_cast<int64_t>(pw.screenOffMs * 1000.0)) {
    g_state.screenOn = false;
    g_settingsOpen = false;
    ESP_LOGI(TAG, "화면 자동 꺼짐(%.0fs 무입력)", pw.screenOffMs / 1000.0);
  }
  const bool want = g_state.screenOn;
  xSemaphoreGive(g_lock);
  if (want != g_panelOn) {
    g_panelOn = want;
    if (want) {
      wc_ui_panel_on(true);
      wc_ui_set_brightness(static_cast<int>(pw.brightnessPercent));
      noteActivity();
    } else {
      wc_ui_panel_on(false);
    }
  }
}

// 손목 들기: 화면 법선 축 가속도가 windowMs 안에서 minDeltaG 이상 올라 faceUpMinG 를 넘으면 켠다(실기 튜닝 필요)
struct AccelPt {
  double t;
  float v;
};
AccelPt g_raiseHist[64];
int g_raiseN = 0;

void onAccelSample(double tMs, const float a[3]) {
  const auto& wr = g_gesture.power.wristRaise;
  if (!wr.enabled) return;
  const float v = a[wr.faceAxis] * static_cast<float>(wr.faceSign);
  // 창 안의 표본만 남긴다(100Hz × 600ms ≈ 60개, 넘치면 오래된 것부터 버림)
  int keep = 0;
  for (int i = 0; i < g_raiseN; ++i)
    if (tMs - g_raiseHist[i].t <= wr.windowMs) g_raiseHist[keep++] = g_raiseHist[i];
  g_raiseN = keep;
  if (g_raiseN == 64) {
    for (int i = 1; i < 64; ++i) g_raiseHist[i - 1] = g_raiseHist[i];
    g_raiseN = 63;
  }
  g_raiseHist[g_raiseN++] = {tMs, v};
  if (g_state.screenOn) return;  // 읽기만(잠금 없이 bool 하나 — 늦어도 다음 표본에서 맞춰진다)
  float vmin = v;
  for (int i = 0; i < g_raiseN; ++i) vmin = g_raiseHist[i].v < vmin ? g_raiseHist[i].v : vmin;
  if (v >= wr.faceUpMinG && v - vmin >= wr.minDeltaG) {
    g_raiseN = 0;
    screenWake("손목 들기");
    if (g_raiseClock) {
      // 설정 'Raise->clock' 켜짐: 손목을 들면 시계 화면부터(기본은 마지막 모드 유지)
      wc::InputEvent e;
      e.t = wc::InputType::SetMode;
      e.mode = wc::ModeId::Clock;
      dispatch(e);
    }
  }
}
int batteryPercent() { return g_batteryPct; }
bool batteryCharging() { return g_charging; }

// ---------------------------------------------------------------------------
// 화면(STEP5) — ui.cpp 가 세 모드 화면을 그린다. 여기서는 모델만 만든다.
// ---------------------------------------------------------------------------

int g_settingsRow = -1;

void uiRefresh() {
  if (!ui::built()) return;
  ui::Model m;
  xSemaphoreTake(g_lock, portMAX_DELAY);
  m.s = g_state;
  m.now = nowMs();
  m.showElapsedMs = wc::showElapsed(g_state, m.now);
  m.press = g_touch.press();
  m.actSeq = g_actSeq;
  m.actAction = g_actAction;
  m.actSent = g_actSent;
  m.actAt = g_actAt;
  {
    const auto& lv = g_gesture.airMouse.sensitivity;
    const size_t si = static_cast<size_t>(g_state.sensitivity < 0 ? 0 : g_state.sensitivity);
    m.sensName = si < lv.size() ? lv[si].name : std::string();
  }
  m.deviceName = g_deviceName;
  m.settingsOpen = g_settingsOpen;
  m.settingsRow = g_settingsRow;
  xSemaphoreGive(g_lock);
  m.ble = static_cast<int>(wc_ble_hid_status());
  m.fwVersion = WC_FW_VERSION;
  m.imuRecording = g_imuRecording;
  m.batteryPct = batteryPercent();
  m.charging = batteryCharging();
  m.raiseClock = g_raiseClock;
  m.airMouse = g_gesture.airMouse.enabled;
  if (g_timeValid) {
    const time_t now = time(nullptr);
    tm lt;
    localtime_r(&now, &lt);
    m.timeValid = true;
    m.hour = lt.tm_hour;
    m.minute = lt.tm_min;
    m.second = lt.tm_sec;
    m.wday = lt.tm_wday;
    m.mday = lt.tm_mday;
    m.month = lt.tm_mon;
  }
  ui::render(m, g_keymap);
}

// ---------------------------------------------------------------------------
// 시계 설정 화면(STEP5) — 줄 탭 = 값 바꾸기, 위로 쓸기·오른쪽 쓸기 = 닫기.
// 줄: 감도 3단계, OS, 손목 들면 시계, IMU 녹화(직렬 CSV), 장치 이름(표시), 펌웨어 버전(표시)
// ---------------------------------------------------------------------------

int64_t g_settingsLastUs = 0;  // 설정 화면 마지막 입력(30초 무입력 자동 닫힘)

void settingsClose(const char* why) {
  if (!g_settingsOpen) return;
  g_settingsOpen = false;
  g_settingsRow = -1;
  ESP_LOGI(TAG, "설정 화면 닫음(%s)", why);
}

void settingsApply(int row) {
  switch (row) {
    case ui::kRowAir:  // 에어마우스 켜기/끄기(NVS). 코어는 g_gesture 를 가리키므로 바로 적용
      xSemaphoreTake(g_lock, portMAX_DELAY);
      g_gesture.airMouse.enabled = !g_gesture.airMouse.enabled;
      xSemaphoreGive(g_lock);
      g_saveDueUs = esp_timer_get_time() + 1000 * 1000;
      ESP_LOGI(TAG, "에어마우스 %s", g_gesture.airMouse.enabled ? "켬" : "끔");
      break;
    case ui::kRowSens: {  // 감도 0→1→2→0
      wc::InputEvent e;
      e.t = wc::InputType::SetSensitivity;
      xSemaphoreTake(g_lock, portMAX_DELAY);
      const int n = static_cast<int>(g_gesture.airMouse.sensitivity.size());
      e.level = n > 0 ? (g_state.sensitivity + 1) % n : 0;
      xSemaphoreGive(g_lock);
      dispatch(e);
      break;
    }
    case ui::kRowOs: {  // OS 전환
      wc::InputEvent e;
      e.t = wc::InputType::SetOs;
      xSemaphoreTake(g_lock, portMAX_DELAY);
      e.os = g_state.os == wc::OsId::Win ? wc::OsId::Mac : wc::OsId::Win;
      xSemaphoreGive(g_lock);
      dispatch(e);
      break;
    }
    case ui::kRowImu:  // IMU 녹화 시작/정지(직렬 CSV)
      if (g_imuRecording) imuRecordEnd();
      else imuRecordBegin();
      break;
    case ui::kRowRaiseClock:  // 손목 들면 시계 화면 먼저(켜기/끄기, NVS)
      g_raiseClock = !g_raiseClock;
      g_saveDueUs = esp_timer_get_time() + 1000 * 1000;
      break;
    case ui::kRowClose:
      settingsClose("닫기 탭");
      break;
    default:  // 이름·버전은 표시만(이름 바꾸기는 직렬 명령 — README)
      break;
  }
}

// 설정 화면이 열려 있을 때의 터치(코어로 보내지 않는다)
struct SettingsTouch {
  bool active = false;
  bool closed = false;  // 움직이는 도중 닫았다 — 손을 뗄 때까지 이 터치는 버린다(코어로 새지 않게)
  int x0 = 0, y0 = 0, x = 0, y = 0;
} g_setTouch;

// 위로 쓸어 닫기: 위로 settingsCloseMinPx(40) 이상, 위로 이동 > settingsCloseAxisRatio(1.2) × 가로 이동.
// 둥근 화면에서 위로 쓸면 대각선이 되기 쉬워 가로 허용을 축 비율로 잡는다(실기 피드백 2)
bool settingsSwipeUp(int dx, int dy) {
  const auto& t = g_gesture.touch;
  return -dy >= t.settingsCloseMinPx && -dy > t.settingsCloseAxisRatio * std::abs(dx);
}

void settingsTouch(bool down, int x, int y) {
  const auto& t = g_gesture.touch;
  g_settingsLastUs = esp_timer_get_time();
  if (down) {
    if (!g_setTouch.active) {
      g_setTouch = {true, false, x, y, x, y};
      g_settingsRow = ui::settingsRowAt(y);  // 누르는 즉시 줄 강조(바꾸기는 뗄 때)
    } else if (!g_setTouch.closed) {
      g_setTouch.x = x;
      g_setTouch.y = y;
      if (std::hypot(x - g_setTouch.x0, y - g_setTouch.y0) >= t.tapMaxMovePx) g_settingsRow = -1;  // 12px 이동 = 취소
      // 움직이는 도중에 조건을 채우면 바로 닫는다(손을 빨리 떼면 마지막 샘플이 덜 움직인 값일 수 있다)
      if (settingsSwipeUp(x - g_setTouch.x0, y - g_setTouch.y0)) {
        g_setTouch.closed = true;
        settingsClose("위로 쓸기");
      }
    }
    return;
  }
  if (!g_setTouch.active) return;
  g_setTouch.active = false;
  g_settingsRow = -1;
  if (g_setTouch.closed) return;
  const int dx = g_setTouch.x - g_setTouch.x0;
  const int dy = g_setTouch.y - g_setTouch.y0;
  // 닫기: 위로 쓸기 또는 오른쪽 스와이프(모드 스와이프와 같은 80px·축 비율)
  const bool right = dx >= t.swipeMinPx && std::abs(dy) < t.swipeMaxOffAxisPx && dx > t.swipeAxisRatio * std::abs(dy);
  if (settingsSwipeUp(dx, dy) || right) {
    settingsClose(right ? "오른쪽 스와이프" : "위로 쓸기");
    return;
  }
  if (std::hypot(dx, dy) < t.tapMaxMovePx) {
    const int row = ui::settingsRowAt(g_setTouch.y0);
    if (row >= 0) {
      ESP_LOGI(TAG, "설정 줄 %d 바꿈", row);
      settingsApply(row);
    }
  }
}

// ---------------------------------------------------------------------------
// 터치(STEP5) — FT3168 을 20ms 마다 읽어 wc::TouchGesture(시뮬레이터 watch.ts 와 같은 규칙)로 판정,
// 결과 tap/longPress/swipe 를 코어에 넘긴다. 영역 판정은 코어 hitTest(wc/layout.h) 그대로.
// ---------------------------------------------------------------------------

constexpr uint32_t kTouchPollMs = 20;

void touchTask(void*) {
  TickType_t last = xTaskGetTickCount();
  bool wasDown = false;
  for (;;) {
    int x = 0, y = 0;
    const bool down = wc_ui_touch_read(&x, &y);
    if (down && !wasDown) ESP_LOGI(TAG, "터치 누름 (%d, %d)", x, y);  // 실기 좌표 확인용
    if (down) noteActivity();  // 화면 자동 꺼짐 타이머(STEP9)
    // 꺼진 화면을 켜는 터치는 그 자체로는 버린다(STEP9)
    if (screenWakeSwallow(down)) {
      wasDown = down;
      vTaskDelayUntil(&last, pdMS_TO_TICKS(kTouchPollMs));
      continue;
    }
    if ((g_settingsOpen || g_setTouch.active) && !g_touch.active()) {
      settingsTouch(down, x, y);  // 설정 화면 터치는 코어로 보내지 않는다(닫은 뒤 손을 뗄 때까지도)
      wasDown = down;
      vTaskDelayUntil(&last, pdMS_TO_TICKS(kTouchPollMs));
      continue;
    }
    std::vector<wc::InputEvent> ins;
    xSemaphoreTake(g_lock, portMAX_DELAY);
    if (down || g_touch.active()) ins = g_touch.sample(down, x, y, nowMs(), g_state, g_keymap, g_gesture);
    if (g_touch.takeSettingsRequest()) {
      g_settingsOpen = true;
      g_settingsRow = -1;
      g_settingsLastUs = esp_timer_get_time();
      g_setTouch.active = false;
      ESP_LOGI(TAG, "설정 화면 엶");
    }
    xSemaphoreGive(g_lock);
    wasDown = down;
    for (const auto& in : ins) {
      ESP_LOGI(TAG, "터치 -> %s", in.t == wc::InputType::Tap ? "tap" : in.t == wc::InputType::LongPress ? "longPress" : "swipe");
      dispatch(in);
    }
    vTaskDelayUntil(&last, pdMS_TO_TICKS(kTouchPollMs));
  }
}

// ---------------------------------------------------------------------------
// 태스크
// ---------------------------------------------------------------------------

void tickTask(void*) {
  bool bootDown = false;
  bool pwrDown = false;
  TickType_t last = xTaskGetTickCount();
  for (;;) {
    // BLE 연결 변화 → 코어(끊김 중 HID 버림 로직이 이 값을 본다)
    bool ready = false;
    while (g_connQueue && xQueueReceive(g_connQueue, &ready, 0) == pdTRUE) {
      ESP_LOGI(TAG, "연결 상태 -> 코어: %s", ready ? "연결" : "끊김");
      if (!ready) g_mouseButtons = 0;  // 끊기면 눌린 마우스 버튼 상태도 버린다
      dispatch(wc::InputEvent::connection(ready));
    }

    // 버튼 폴링(50ms = 디바운스 겸). TODO(STEP5): 인터럽트 + 디바운스로 바꿔 지연을 줄인다
    // 설정 화면이 열려 있을 때 누른 버튼은 코어로 보내지 않고(뗄 때까지) 설정을 닫는다:
    //   BOOT 짧게 = 설정 닫고 시계 모드로(BOOT = 시계 규칙), PWR 짧게 = 닫기만(화면 끄기는 그다음 누름)
    static bool bootSwallow = false, pwrSwallow = false;
    const bool b = buttonPressed(board::PIN_BTN_BOOT, board::BTN_BOOT_ACTIVE_LOW);
    if (b != bootDown) {
      bootDown = b;
      if (b) screenWake("BOOT");  // 화면이 꺼져 있어도 누른 동작은 그대로 보낸다
      if (b && g_settingsOpen) bootSwallow = true;
      if (bootSwallow) {
        if (!b) {
          bootSwallow = false;
          settingsClose("BOOT");
          wc::InputEvent e;
          e.t = wc::InputType::SetMode;
          e.mode = wc::ModeId::Clock;
          dispatch(e);
        }
      } else {
        dispatch(wc::InputEvent::button(wc::ButtonId::Boot, b ? wc::ButtonAction::Down : wc::ButtonAction::Up));
      }
    }
    const bool p = buttonPressed(board::PIN_BTN_PWR, board::BTN_PWR_ACTIVE_LOW);
    if (p != pwrDown) {
      pwrDown = p;
      noteActivity();  // PWR 짧게 = 코어가 화면 켜기/끄기 토글
      if (p && g_settingsOpen) pwrSwallow = true;
      if (pwrSwallow) {
        if (!p) {
          pwrSwallow = false;
          settingsClose("PWR");
        }
      } else {
        dispatch(wc::InputEvent::button(wc::ButtonId::Pwr, p ? wc::ButtonAction::Down : wc::ButtonAction::Up));
      }
    }
    // 설정 화면 30초 무입력 = 자동 닫힘(gesture.json timing.settingsIdleCloseMs, 시뮬레이터와 같음)
    if (g_settingsOpen && !g_setTouch.active && g_gesture.timing.settingsIdleCloseMs > 0 &&
        esp_timer_get_time() - g_settingsLastUs > static_cast<int64_t>(g_gesture.timing.settingsIdleCloseMs * 1000.0)) {
      settingsClose("30초 무입력");
    }

    dispatch(wc::InputEvent::tick());

    if (g_saveDueUs != 0 && esp_timer_get_time() >= g_saveDueUs) {
      g_saveDueUs = 0;
      nvsSavePrefs();
    }
    powerTick();
    {
      static int64_t nextBattUs = 0;
      const int64_t nowUs = esp_timer_get_time();
      if (nowUs >= nextBattUs) {
        nextBattUs = nowUs + static_cast<int64_t>(g_gesture.power.batteryPollMs * 1000.0);
        int pct = -1;
        bool chg = false;
        static int lastGood = -1;
        if (wc_pmu_read(&pct, &chg) == ESP_OK) {
          g_batteryPct = pct;
          g_charging = chg;
        } else {
          pct = -1;
        }
        // BLE 배터리 서비스: 읽기 실패·배터리 없음이면 마지막 값, 그것도 없으면 50(0 은 Windows '배터리 부족' 경고)
        int bas = pct >= 0 ? pct : (lastGood >= 0 ? lastGood : 50);
        if (pct >= 0) lastGood = pct;
        static int lastBas = -2;
        if (bas != lastBas) {
          if (pct < 0) ESP_LOGW(TAG, "배터리 %% 를 읽지 못함 — BLE 배터리 값 %d 로 보냄", bas);
          wc_ble_hid_battery_set(static_cast<uint8_t>(bas));
          lastBas = bas;
        }
      }
    }
    if (g_panelOn) uiRefresh();  // 꺼진 화면은 다시 그리지 않는다(SPI·CPU 절약)
    vTaskDelayUntil(&last, pdMS_TO_TICKS(kTickMs));
  }
}

}  // namespace

extern "C" void app_main(void) {
  ESP_LOGI(TAG, "손목 컨트롤러 펌웨어 %s (키맵 %s)", WC_FW_VERSION, WC_KEYMAP_GEN_HASH);
  logHeap("부팅");

  g_lock = xSemaphoreCreateMutex();
  g_keymap = wc::gen::makeKeymap();
  g_gesture = wc::gen::makeGesture();
  g_deviceName = g_keymap.settings.deviceName;

  nvsInit();
  g_state = wc::initState(g_keymap);
  // 부팅 직후에는 아직 PC 와 연결되지 않았다(화면: '연결 대기' 전체 화면, sim 의 everConnected=false 와 같은 뜻)
  g_state.connected = false;
  g_state.everConnected = false;
  nvsLoadPrefs(g_state);
  if (!g_nameFromNvs) {
    // 두 대 구분: 기본 이름 뒤에 BT MAC 끝 4자리(예 '손목 컨트롤러 D7C0'). 29바이트를 넘으면 붙이지 않는다
    uint8_t mac[6] = {0};
    if (esp_read_mac(mac, ESP_MAC_BT) == ESP_OK) {
      char tail[8];
      std::snprintf(tail, sizeof(tail), " %02X%02X", mac[4], mac[5]);
      const std::string withTail = g_keymap.settings.deviceName + tail;
      if (withTail.size() <= static_cast<size_t>(g_keymap.settings.deviceNameMaxBytes)) g_deviceName = withTail;
    }
  }
  ESP_LOGI(TAG, "모드 %s, OS %s, 장치 이름 '%s'", wc::name(g_state.mode), wc::name(g_state.os), g_deviceName.c_str());

  // STEP2: Waveshare BSP 로 화면(CO5300 QSPI 410×502)·터치(FT3168) 초기화, LVGL 9 시작(display_ui.c).
  //        실패해도 BLE·버튼은 계속 돈다. 밝기 = gesture.json power.brightnessPercent(AMOLED, 실기에서 조정)
  // STEP5: 터치 판정은 wc::TouchGesture(시뮬레이터와 같은 규칙) → 코어 hitTest. 화면은 ui.cpp 가 그리기만 한다.
  if (wc_ui_init(static_cast<int>(g_gesture.power.brightnessPercent)) != ESP_OK) {
    ESP_LOGE(TAG, "화면 초기화 실패 — 화면 없이 계속");
  } else {
    logHeap("화면 후");
    ui::build(g_keymap);  // STEP5: 세 모드 화면·상태줄·시트·설정 화면 객체
  }
  logHeap("UI 후");

  // STEP3·4: NimBLE + esp_hidd 복합 맵(hidmap::kReportMap — 키보드 ID1·마우스 ID2·컨슈머 ID3),
  //        장치 이름 = NVS 저장 이름 우선, 없으면 keymap 기본(≤ settings.deviceNameMaxBytes), 본드 NVS 저장,
  //        연결/끊김 → g_connQueue → tick 태스크에서 dispatch(InputEvent::connection(true/false)).
  // TODO(검토): 페어링 보안 — 지금은 Just Works. 화면이 있으니 DISP_ONLY + 무작위 패스키 표시 검토(firmware-stack.md 2.5).
  g_connQueue = xQueueCreate(8, sizeof(bool));
  g_macroQueue = xQueueCreate(2, sizeof(MacroJob));
  xTaskCreate(macroTask, "wc_macro", 4096, nullptr, 5, nullptr);
  {
    std::string name = g_deviceName;
    if (name.empty()) name = g_keymap.settings.deviceName;
    // 길이 제한(settings.deviceNameMaxBytes = 29 = 스캔 응답 한도)은 ble_hid.c 가 UTF-8 글자 경계에서 자른다
    if (wc_ble_hid_init(name.c_str(), hidmap::kReportMap, sizeof(hidmap::kReportMap), onBleConn) != ESP_OK) {
      ESP_LOGE(TAG, "BLE HID 초기화 실패 — 키를 보낼 수 없음");
    }
  }
  logHeap("BLE 후");
  // STEP6: IMU(QMI8658, 공용 I2C — 주소 0x6B/0x6A 자동 탐지). 녹화는 설정 화면 'IMU record' 또는 직렬 'r'
  if (wc_imu_init(wc_board_i2c(), static_cast<int>(g_gesture.imu.gyroRangeDps), &g_imuAddr) == ESP_OK) {
    xTaskCreate(imuTask, "wc_imu", 6144, nullptr, 6, nullptr);  // HID 보다 위, NimBLE 보다 아래(firmware-stack.md 4장)
  } else {
    g_imuAddr = 0;
    ESP_LOGE(TAG, "IMU 없음 — 에어마우스·손목 튕김·손목 들기 꺼짐");
  }
  xTaskCreate(serialTask, "wc_serial", 4096, nullptr, 3, nullptr);
  // STEP9: AXP2101 배터리(읽기만), 화면 자동 꺼짐·켜짐(powerTick·onAccelSample) — 값은 gesture.json power
  wc_pmu_init(wc_board_i2c());
  // 시계 모드 시각: RTC(UTC) → 시스템 시각, 시간대는 NVS(기본 KST +540)
  applyTz();
  if (wc_rtc_init(wc_board_i2c()) == ESP_OK) {
    time_t utc = 0;
    if (wc_rtc_read(&utc) == ESP_OK) {
      timeval tv{utc, 0};
      settimeofday(&tv, nullptr);
      g_timeValid = true;
      ESP_LOGI(TAG, "RTC 시각 %lld (UTC%+d분)", static_cast<long long>(utc), g_tzMin);
    } else {
      ESP_LOGW(TAG, "RTC 시각 없음 — 설치 페이지 '시계 시간 맞추기' 또는 직렬 t 로 맞추세요");
    }
  }
  noteActivity();

  buttonsInit();
  xTaskCreate(tickTask, "wc_tick", 6144, nullptr, 5, nullptr);
  xTaskCreate(touchTask, "wc_touch", 6144, nullptr, 5, nullptr);
}
