// 손목 컨트롤러 코어 공용 타입 — sim/src/core/types.ts 와 1:1 대응하는 C++17 구현.
//
// 규칙
//  - 하드웨어(ESP-IDF, LVGL, NimBLE)에 의존하지 않는다. 호스트(PC)와 시계에서 똑같이 컴파일된다.
//  - 이름·필드는 TS 쪽과 같게 둔다(테스트 벡터의 state/events 부분 일치 비교가 같은 이름을 쓴다).
//  - 시각은 모두 ms 단위 double(JS number 와 같은 계산 결과를 내기 위해).
//  - TS 의 `null` 은 std::optional 로, 문자열 유니온은 enum class 로 옮겼다.
//    이름 ↔ 문자열 변환은 wc/names.h.
#pragma once

#include <array>
#include <cstdint>
#include <limits>
#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace wc {

// ---------------------------------------------------------------------------
// 식별자
// ---------------------------------------------------------------------------

// 값은 NVS(마지막 모드) 호환을 위해 예전 순서를 지킨다: 옛 Coding(1) 자리가 Launch, Clock 은 맨 뒤.
// 화면 순환 순서는 keymap.modeOrder(clock → present → launch → meeting)가 정한다.
enum class ModeId : uint8_t { Present = 0, Launch = 1, Meeting = 2, Clock = 3 };
constexpr int kModeCount = 4;

enum class OsId : uint8_t { Win = 0, Mac = 1 };

// 앱 id. TS 의 ClockAppId | PresentAppId | LaunchAppId | MeetingAppId 를 하나로 묶었다(names.cpp kApps 와 같은 순서).
enum class AppId : uint8_t { PowerPoint = 0, Slides, Launcher, Zoom, Teams, Meet, Clock };
constexpr int kAppCount = 7;

// 회의 앱 3개(회의 추정 상태 배열 인덱스). AppId 와 순서가 같다(Zoom=0, Teams=1, Meet=2).
enum class MeetingAppId : uint8_t { Zoom = 0, Teams = 1, Meet = 2 };
constexpr int kMeetingAppCount = 3;

enum class ActionId : uint8_t {
  // 발표
  Next = 0, Prev, Blackout, ShowStart, ShowEnd,
  // 실행(launcher.md) 1쪽 앱 / 2쪽 업무 단축
  Claude, Kakao, Chrome, Ppt, Excel, Hwp,
  Capture, Lock, Desktop, Display, Mute, Portal,
  // 회의
  Mic, Camera, Hand,
};
constexpr int kActionCount = 20;

// 회의 동작(회의 타일). ActionId::Mic.. 과 순서가 같다.
enum class MeetingActionId : uint8_t { Mic = 0, Camera = 1, Hand = 2 };

// 수정자 비트 = HID 보고서 수정자 바이트(/shared/hid-usage.json modifiers). mac Cmd = GUI, Option = ALT.
enum ModBits : uint8_t { MOD_CTRL = 0x01, MOD_SHIFT = 0x02, MOD_ALT = 0x04, MOD_GUI = 0x08 };

enum class ButtonId : uint8_t { Boot = 0, Pwr = 1 };
enum class ButtonAction : uint8_t { Down, Up, Short, Long };
enum class SwipeDir : uint8_t { Left, Right, Up, Down };

enum class LogicalAxis : uint8_t { Yaw = 0, Pitch = 1, Roll = 2 };

// ---------------------------------------------------------------------------
// 설정 (/shared/keymap.json, /shared/gesture.json)
// ---------------------------------------------------------------------------

// 키 조합. key = hid-usage.json 키 이름(예 "RIGHT"), usage = 키보드 페이지 사용 코드(설정을 읽을 때 채운다).
struct Chord {
  uint8_t mods = 0;     // ModBits OR
  std::string key;      // 키 이름
  uint8_t usage = 0;    // HID 사용 코드
};

// 매크로 한 단계(docs/research/launcher.md 3장). text 는 출력 가능한 ASCII 만, US 배열 키로 입력
enum class MacroStepKind : uint8_t { Chord, Wait, Text, Consumer };
struct MacroStep {
  MacroStepKind kind = MacroStepKind::Chord;
  Chord chord;               // Chord
  int waitMs = 0;            // Wait (0~3000)
  std::string text;          // Text ({url} 은 resolveBinding 이 바꾼다)
  std::string consumerName;  // Consumer (hid-usage.json consumer 이름, 예 MUTE)
  uint16_t consumerUsage = 0;
};

// 동작 하나: 키 조합(한 번 누름) 또는 매크로
struct Binding {
  bool macro = false;
  Chord chord;                   // macro=false
  std::vector<MacroStep> steps;  // macro=true
};

struct KeymapAction {
  ActionId id = ActionId::Next;
  std::string label;
  std::optional<Binding> win;
  std::optional<Binding> mac;
  std::optional<Binding> winAlt;  // 타일 길게 누르기(없으면 길게 누르기 없음)
  std::optional<Binding> macAlt;
  bool hasUrl = false;            // keymap 에 url 칸이 있나(설정 화면 표시용)
  std::string url;                // 매크로 text 의 {url} 자리. 비어 있으면 {url} 쓰는 동작은 비활성
};

struct KeymapApp {
  AppId id = AppId::PowerPoint;
  std::string name;
  std::vector<KeymapAction> actions;  // 배열 순서 = 화면 배치 순서(코딩 타일 0..5)
};

struct KeymapMode {
  std::string name;
  AppId defaultApp = AppId::PowerPoint;
  std::vector<AppId> appOrder;
  std::vector<KeymapApp> apps;
};

struct KeymapSettings {
  std::string deviceName;
  int deviceNameMaxBytes = 29;
  OsId os = OsId::Win;
  ModeId mode = ModeId::Present;
  int sensitivity = 1;
  ButtonId primaryButton = ButtonId::Boot;
};

struct Keymap {
  int version = 1;
  KeymapSettings settings;
  std::vector<ModeId> modeOrder;
  std::array<KeymapMode, kModeCount> modes;  // ModeId 인덱스
};

struct SensitivityLevel {
  std::string name;
  double gain = 1.0;
};

struct GestureConfig {
  int version = 1;
  struct Imu {
    double sampleRateHz = 100;
    double gyroRangeDps = 1024;
    std::array<int, 3> axisMap{{2, 0, 1}};   // 논리 축(yaw,pitch,roll) → 센서 축 인덱스(gx=0, gy=1, gz=2)
    std::array<int, 3> axisSign{{1, 1, 1}};  // 논리 축 부호 ±1
    struct BiasCalib {
      bool enabled = true;
      double stillThresholdDps = 3.0;
      double stillMs = 1000;
      double trackTauMs = 5000;
    } biasCalib;
  } imu;
  struct AirMouse {
    bool enabled = false;  // 기본 끔(실기 피드백 6). 시계 설정 '에어마우스'로 켠다(NVS)
    double holdToStartMs = 250;
    double startSuppressMs = 50;
    struct { double enter = 2.0; double exit = 1.5; } deadzoneDps;
    double lowpassTauMs = 30;
    struct { double exponent = 1.3; double maxPxPerReport = 40; } curve;
    std::vector<SensitivityLevel> sensitivity;
    bool invertY = false;
  } airMouse;
  struct Flick {
    LogicalAxis axis = LogicalAxis::Roll;
    double prefilterTauMs = 10;
    double peakThresholdDps = 300;
    struct { bool enabled = true; double windowMs = 2000; double rmsMultiplier = 4.0; } adaptive;
    double axisDominanceRatio = 1.5;
    double minAboveMs = 30;
    double maxAboveMs = 200;
    struct { bool required = true; double windowMs = 250; double minRatio = 0.3; double minDps = 120; } rebound;
    struct { double windowMs = 300; double guardMs = 50; double maxRmsDps = 80; } quietBefore;
    double cooldownMs = 800;
    int outwardSign = 1;
    // gesture.json flick.inAction: 안쪽 튕김 동작. "next"(기본 — 실기 피드백 8: 안쪽·바깥 모두 다음) / "none"(무시) / "prev"(이전)
    enum class InAction : uint8_t { None, Prev, Next } inAction = InAction::Next;
  } flick;
  struct Touch {
    double tapMaxMovePx = 12;
    double holdMs = 600;
    double blackoutHoldMs = 360;      // 발표 가운데 길게 = 암전만 더 짧게(실기 피드백 5, 600의 60%)
    double swipeMinPx = 80;           // 가로·세로 스와이프 최소 이동
    double swipeMaxOffAxisPx = 60;    // 다른 축 최대 이동
    double swipeAxisRatio = 1.5;      // 주 축 > 비율 × 다른 축
    double swipeMaxMs = 800;          // 누른 뒤 이 시간 안에 떼야 스와이프
    double showSwipeMinPx = 140;      // 쇼 진행 중 발표 모드의 모드 전환 스와이프(오발송 방지)
    double showSwipeMaxOffAxisPx = 50;
    double sheetPullMinPx = 48;       // 위에서 당기기(아래로)·시트 닫기(위로) 최소 이동
    double pullMaxOffAxisPx = 40;
    double pullMaxMs = 600;
    double topEdgePx = 72;            // 이 y 위에서 시작하면 당기기 후보
    double settingsCloseMinPx = 40;   // 설정 화면: 위로 이만큼 + 아래 비율이면 닫기(움직이는 도중에도)
    double settingsCloseAxisRatio = 1.2;  // 위로 이동 > 비율 × 가로 이동
  } touch;
  struct Button {
    double longPressMs = 2000;
  } button;
  struct Timing {
    double sheetAutoCloseMs = 3000;
    double meetingEstimateResetMs = 30000;
    double settingsIdleCloseMs = 30000;  // 설정 화면 무입력 자동 닫힘
  } timing;
  // 전원 관리(펌웨어 전용 — 코어 판정에는 쓰지 않는다. gesture.json power, 2단계 9번)
  struct Power {
    double screenOffMs = 20000;   // 0 = 끄지 않음
    double brightnessPercent = 80;
    double batteryPollMs = 5000;
    struct WristRaise {
      bool enabled = true;
      int faceAxis = 2;           // 화면 법선 = 가속도 센서 축(ax=0, ay=1, az=2)
      int faceSign = 1;
      double faceUpMinG = 0.6;
      double minDeltaG = 0.35;
      double windowMs = 600;
    } wristRaise;
  } power;
};

// ---------------------------------------------------------------------------
// HID 출력
// ---------------------------------------------------------------------------

enum class HidType : uint8_t { Key, MouseMove, MouseButton, Consumer, Macro };
enum class MouseButton : uint8_t { Left, Right, Middle };

// 시계가 PC 로 보내는 HID 이벤트(TS HidEvent). 쓰이는 필드는 t 에 따라 다르다.
//  Key: mods, key, usage — 한 번 누르고 떼기(펌웨어는 [수정자+키] → [모두 0] 두 보고서)
//  MouseMove: dx, dy(정수 px, 아래가 +dy) / MouseButton: button, down / Consumer: consumer(사용 코드)
struct HidEvent {
  HidType t = HidType::Key;
  uint8_t mods = 0;
  std::string key;
  uint8_t usage = 0;
  int dx = 0;
  int dy = 0;
  MouseButton button = MouseButton::Left;
  bool down = false;
  uint16_t consumer = 0;
  std::vector<MacroStep> steps;  // Macro({url} 이 이미 바뀐 단계. 보고서 열은 keymap.h expandMacro)

  static HidEvent keyPress(const Chord& c) {
    HidEvent e;
    e.t = HidType::Key;
    e.mods = c.mods;
    e.key = c.key;
    e.usage = c.usage;
    return e;
  }
  static HidEvent macroOf(const std::vector<MacroStep>& s) {
    HidEvent e;
    e.t = HidType::Macro;
    e.steps = s;
    return e;
  }
  static HidEvent mouseMove(int dx, int dy) {
    HidEvent e;
    e.t = HidType::MouseMove;
    e.dx = dx;
    e.dy = dy;
    return e;
  }
  static HidEvent mouseButton(MouseButton b, bool down) {
    HidEvent e;
    e.t = HidType::MouseButton;
    e.button = b;
    e.down = down;
    return e;
  }
};

enum class InputSource : uint8_t { Touch, Hold, Swipe, Sheet, Button, Gesture, Air, System };

struct Emitted {
  HidEvent ev;
  InputSource source = InputSource::System;
  std::optional<ActionId> action;  // 에어마우스 이동·클릭은 없음
};

// ---------------------------------------------------------------------------
// 입력
// ---------------------------------------------------------------------------

// IMU 한 샘플. t = 측정 시각(ms), g* = 각속도 deg/s(센서 축)
struct ImuSample {
  double t = 0;
  double gx = 0;
  double gy = 0;
  double gz = 0;
};

enum class InputType : uint8_t {
  Tap, LongPress, Swipe, Button, Imu, Tick, Connection,
  SetMode, SetApp, SetOs, SetSensitivity, SetLocked,
};

// 코어가 받는 입력(TS InputEvent). 좌표는 시계 화면 410×502 기준.
struct InputEvent {
  InputType t = InputType::Tick;
  double x = 0, y = 0;                       // Tap, LongPress
  SwipeDir dir = SwipeDir::Left;             // Swipe
  ButtonId id = ButtonId::Boot;              // Button
  ButtonAction action = ButtonAction::Down;  // Button
  ImuSample sample;                          // Imu
  bool flag = false;                         // Connection.connected, SetLocked.locked
  ModeId mode = ModeId::Present;             // SetMode, SetApp
  AppId app = AppId::PowerPoint;             // SetApp
  OsId os = OsId::Win;                       // SetOs
  double level = 0;                          // SetSensitivity

  static InputEvent tap(double x, double y) { InputEvent e; e.t = InputType::Tap; e.x = x; e.y = y; return e; }
  static InputEvent longPress(double x, double y) { InputEvent e; e.t = InputType::LongPress; e.x = x; e.y = y; return e; }
  static InputEvent swipe(SwipeDir d) { InputEvent e; e.t = InputType::Swipe; e.dir = d; return e; }
  static InputEvent button(ButtonId id, ButtonAction a) { InputEvent e; e.t = InputType::Button; e.id = id; e.action = a; return e; }
  static InputEvent imu(const ImuSample& s) { InputEvent e; e.t = InputType::Imu; e.sample = s; return e; }
  static InputEvent tick() { InputEvent e; e.t = InputType::Tick; return e; }
  static InputEvent connection(bool connected) { InputEvent e; e.t = InputType::Connection; e.flag = connected; return e; }
};

struct StepContext {
  double now = 0;  // imu 입력이면 sample.t 를 쓴다
  const Keymap* keymap = nullptr;
  const GestureConfig* gesture = nullptr;
};

// ---------------------------------------------------------------------------
// 코어 상태
// ---------------------------------------------------------------------------

enum class Estimate : uint8_t { Unknown, On, Off };
enum class Hand : uint8_t { Down, Up };

struct MeetingEstimate {
  Estimate mic = Estimate::Unknown;
  Estimate camera = Estimate::Unknown;
  Hand hand = Hand::Down;
};

struct ButtonHold {
  ButtonId id = ButtonId::Boot;
  double downAt = 0;
  bool air = false;        // 에어마우스가 시작됐나
  bool moved = false;      // 에어마우스가 데드존을 넘은 출력을 냈나(잠금 판정 취소)
  bool longFired = false;  // 길게 누름(잠금 토글)이 이미 발동했나
};

struct BiasState {
  std::array<double, 3> bias{{0, 0, 0}};
  std::optional<double> stillSince;
  std::optional<double> lastT;
};

struct AirAxisState {
  bool moving = false;
  double ema = 0;
  double resid = 0;
};

struct AirMouseState {
  bool active = false;
  double since = 0;
  std::optional<double> lastT;
  AirAxisState x;
  AirAxisState y;
};

enum class FlickPhase : uint8_t { Idle, Above, Rebound, Blocked };
enum class FlickReject : uint8_t { TooShort, TooLong, NoRebound, NotDominant, NotQuiet };
enum class FlickDir : uint8_t { Out, In };

constexpr double kNegInf = -std::numeric_limits<double>::infinity();

struct FlickState {
  std::optional<std::array<double, 3>> filt;
  std::optional<double> lastT;
  std::vector<std::pair<double, double>> hist;  // (시각, 세 축 제곱합)
  FlickPhase phase = FlickPhase::Idle;
  int sign = 1;
  double threshold = 0;
  double aboveStart = 0;
  double peak = 0;
  double peakT = 0;
  double reboundNeed = 0;
  double cooldownUntil = kNegInf;
};

struct CoreState {
  ModeId mode = ModeId::Present;
  ModeId prevMode = ModeId::Present;  // 시계로 들어오기 직전 모드(BOOT 짧게: 시계 ↔ 이 모드)
  OsId os = OsId::Win;
  struct Apps {
    AppId clock = AppId::Clock;
    AppId present = AppId::PowerPoint;
    AppId launch = AppId::Launcher;
    AppId meeting = AppId::Zoom;
  } apps;
  int launchPage = 0;  // 실행 모드 쪽(0 = 앱, 1 = 업무 단축)
  int sensitivity = 1;
  bool connected = true;
  bool everConnected = true;
  std::optional<double> disconnectedAt;
  bool locked = false;
  bool screenOn = true;
  struct Sheet {
    bool open = false;
    double lastActivity = 0;
  } sheet;
  struct Show {
    bool running = false;
    std::optional<double> startedAt;
    bool blackout = false;
  } show;
  std::array<MeetingEstimate, kMeetingAppCount> meeting{};  // MeetingAppId 인덱스
  std::optional<ButtonHold> button;
  BiasState bias;
  AirMouseState air;
  FlickState flick;
};

// ---------------------------------------------------------------------------
// 시스템 알림 (TS CoreEvent)
// ---------------------------------------------------------------------------

enum class EventType : uint8_t {
  Mode, App, Os, Lock, Connection, Sheet, Air, Show, Blackout, Screen, Sensitivity,
  Action, Flick, FlickRejected, Ignored, Estimate,
  LaunchPage,  // 실행 모드 쪽이 바뀜(level = 쪽 번호)
};

enum class IgnoreReason : uint8_t { Locked, Cooldown };

// 회의 추정값 알림의 value('unknown'|'on'|'off'|'down'|'up')
enum class EstimateValue : uint8_t { Unknown, On, Off, Down, Up };

// 쓰이는 필드는 t 에 따라 다르다(TS 필드 이름 → 이 구조체 필드):
//  Mode{mode} App{mode,app} Os{os} Sensitivity{level}
//  Lock{locked→value} Connection{connected→value} Sheet{open→value} Air{active→value}
//  Show{running→value} Blackout{on→value} Screen{on→value}
//  LaunchPage{page→level}
//  Action{action, source, sent→value} Flick{dir} FlickRejected{reason→reject}
//  Ignored{source, reason→ignore}
//  Estimate{app(회의 앱), target(MeetingActionId), value→estimate, synced→value}
struct CoreEvent {
  EventType t = EventType::Mode;
  ModeId mode = ModeId::Present;
  AppId app = AppId::PowerPoint;
  OsId os = OsId::Win;
  bool value = false;
  int level = 0;
  ActionId action = ActionId::Next;
  InputSource source = InputSource::System;
  FlickDir dir = FlickDir::Out;
  FlickReject reject = FlickReject::TooShort;
  IgnoreReason ignore = IgnoreReason::Locked;
  MeetingActionId target = MeetingActionId::Mic;
  EstimateValue estimate = EstimateValue::Unknown;
};

struct StepResult {
  CoreState state;
  std::vector<Emitted> hid;      // 실제로 PC 로 보낼 HID
  std::vector<Emitted> dropped;  // 연결 끊김으로 버린 HID(재연결 후에도 보내지 않음)
  std::vector<CoreEvent> events;
};

// ---------------------------------------------------------------------------
// 작은 도우미
// ---------------------------------------------------------------------------

inline int idx(ModeId m) { return static_cast<int>(m); }
inline int idx(AppId a) { return static_cast<int>(a); }
inline int idx(MeetingAppId a) { return static_cast<int>(a); }
inline int idx(LogicalAxis a) { return static_cast<int>(a); }

// 회의 앱이면 MeetingAppId 로, 아니면 nullopt
inline std::optional<MeetingAppId> toMeetingApp(AppId a) {
  switch (a) {
    case AppId::Zoom: return MeetingAppId::Zoom;
    case AppId::Teams: return MeetingAppId::Teams;
    case AppId::Meet: return MeetingAppId::Meet;
    default: return std::nullopt;
  }
}
inline AppId fromMeetingApp(MeetingAppId a) {
  switch (a) {
    case MeetingAppId::Zoom: return AppId::Zoom;
    case MeetingAppId::Teams: return AppId::Teams;
    default: return AppId::Meet;
  }
}
inline ActionId toAction(MeetingActionId a) {
  switch (a) {
    case MeetingActionId::Mic: return ActionId::Mic;
    case MeetingActionId::Camera: return ActionId::Camera;
    default: return ActionId::Hand;
  }
}

}  // namespace wc
