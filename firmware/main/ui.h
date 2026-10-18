// 시계 화면 v2(design/v2/README.md P0) — 상태줄·시계·발표·실행·회의·시트·연결 대기(페어링)·끊김 배너·설정 (LVGL 9)
// 좌표는 firmware/logic/include/wc/layout.h(= sim/src/core/layout.ts) 와 design/v2/README.md 를 따른다.
// 터치 판정은 화면 위젯이 아니라 wc::TouchGesture + 코어 hitTest 가 한다(시뮬레이터와 같은 판정). 화면은 그리기만.
// 글자: 한글 Pretendard 서브셋 kr_20/24/28/32 + 숫자 num_128(tools/gen_fonts.py), 문구는 wc::str(shared/strings.ko.json).
#pragma once

#include <cstdint>
#include <string>

#include "wc/logic.h"
#include "wc/touch_gesture.h"

namespace ui {

// 화면 하나를 그리는 데 필요한 값(코어 상태 복사본 + 펌웨어 쪽 상태). tick 마다 만든다.
struct Model {
  wc::CoreState s;                 // 코어 상태(복사)
  double now = 0;                  // ms(esp_timer 기준, 코어 now 와 같음)
  double showElapsedMs = 0;
  int ble = 0;                     // wc_ble_status_t
  int batteryPct = -1;             // -1 = 모름('--%')
  bool charging = false;
  wc::TouchGesture::Press press;   // 눌린 대상(누르는 즉시 강조 — 전송은 뗄 때)
  // 마지막 동작 이벤트(넘김 플래시·타일 확인 테두리·끊김 중 '보내지 못함'). seq 가 바뀌면 새 동작
  uint32_t actSeq = 0;
  wc::ActionId actAction = wc::ActionId::Next;
  bool actSent = false;
  double actAt = 0;
  // 설정 화면
  bool settingsOpen = false;
  int settingsRow = -1;            // 누르고 있는 줄(-1 = 없음)
  bool imuRecording = false;
  std::string deviceName;
  std::string sensName;            // 지금 감도 이름(gesture.json airMouse.sensitivity[].name)
  const char* fwVersion = "";
  bool raiseClock = false;         // 손목 들면 시계 화면 먼저
  bool airMouse = false;           // 에어마우스 켬(기본 끔 — 실기 피드백 6)
  bool flick = false;              // 손목 튕김 켬(기본 끔 — 실기 피드백 10)
  // 시각(RTC → 시스템 시각, 시간대 NVS). valid=false 면 '--:--'
  bool timeValid = false;
  int hour = 0, minute = 0, second = 0;
  int wday = 0, mday = 1, month = 0;  // month 0..11
};

// LVGL 객체를 만든다(wc_ui_init 성공 뒤 한 번). keymap 은 타일 라벨·힌트, 회의 앱 이름에 쓴다.
void build(const wc::Keymap& km);
// 바뀐 것만 다시 그린다. LVGL 잠금은 안에서 잡는다.
void render(const Model& m, const wc::Keymap& km);
bool built();

// 설정 화면 줄(터치 hit 판정용, ui.cpp 의 배치와 같은 값). 구조 변경(88px 스크롤 목록)은 P1-3.
constexpr int SETTINGS_ROW_Y0 = 64;
constexpr int SETTINGS_ROW_H = 40;
// 손목 튕김, 에어마우스, 감도, 컴퓨터(OS), 손목 들면 시계, IMU 녹화, 블루투스 이름, 버전
constexpr int SETTINGS_ROWS = 8;
// 맨 아래 '닫기' 탭 영역(터치 높이 88 — README 1.3 터치 최소)
constexpr int SETTINGS_CLOSE_Y0 = 392;
constexpr int SETTINGS_CLOSE_H = 88;
enum SettingsRow { kRowFlick = 0, kRowAir, kRowSens, kRowOs, kRowRaiseClock, kRowImu, kRowName, kRowFw, kRowClose };
int settingsRowAt(int y);         // -1 = 줄 밖, kRowClose = 닫기

}  // namespace ui
