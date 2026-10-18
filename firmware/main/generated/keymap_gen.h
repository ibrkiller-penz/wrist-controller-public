// 자동 생성 파일 — 손으로 고치지 마세요.
// 생성: python tools/gen_keymap_header.py
// 원본: shared/keymap.json, shared/gesture.json, shared/hid-usage.json
// 원본 해시(sha256 앞 16자, 줄바꿈 LF 기준): ee025fa6e019fb46
// 키 배치를 바꾸려면 shared/keymap.json 을 고치고 이 스크립트를 다시 실행한다.
#pragma once

#include <cstdint>

#include "wc/types.h"

#define WC_KEYMAP_GEN_HASH "ee025fa6e019fb46"
#define WC_KEYMAP_VERSION 1
#define WC_GESTURE_VERSION 1

namespace wc {
namespace gen {

// ---------------------------------------------------------------------------
// HID 사용 코드 (USB HID Usage Tables 1.5 — shared/hid-usage.json)
// ---------------------------------------------------------------------------

constexpr uint8_t kKeyboardPage = 0x07;
constexpr uint8_t kConsumerPage = 0x0C;

struct KeyUsage {
  const char* name;
  uint8_t usage;
};
constexpr KeyUsage kKeyUsages[] = {
    {"0", 0x27},
    {"1", 0x1E},
    {"2", 0x1F},
    {"3", 0x20},
    {"4", 0x21},
    {"5", 0x22},
    {"6", 0x23},
    {"7", 0x24},
    {"8", 0x25},
    {"9", 0x26},
    {"A", 0x04},
    {"B", 0x05},
    {"C", 0x06},
    {"D", 0x07},
    {"E", 0x08},
    {"F", 0x09},
    {"G", 0x0A},
    {"H", 0x0B},
    {"I", 0x0C},
    {"J", 0x0D},
    {"K", 0x0E},
    {"L", 0x0F},
    {"M", 0x10},
    {"N", 0x11},
    {"O", 0x12},
    {"P", 0x13},
    {"Q", 0x14},
    {"R", 0x15},
    {"S", 0x16},
    {"T", 0x17},
    {"U", 0x18},
    {"V", 0x19},
    {"W", 0x1A},
    {"X", 0x1B},
    {"Y", 0x1C},
    {"Z", 0x1D},
    {"ENTER", 0x28},
    {"ESCAPE", 0x29},
    {"BACKSPACE", 0x2A},
    {"TAB", 0x2B},
    {"SPACE", 0x2C},
    {"MINUS", 0x2D},
    {"EQUAL", 0x2E},
    {"LEFTBRACKET", 0x2F},
    {"RIGHTBRACKET", 0x30},
    {"BACKSLASH", 0x31},
    {"SEMICOLON", 0x33},
    {"QUOTE", 0x34},
    {"GRAVE", 0x35},
    {"COMMA", 0x36},
    {"PERIOD", 0x37},
    {"SLASH", 0x38},
    {"CAPSLOCK", 0x39},
    {"F1", 0x3A},
    {"F2", 0x3B},
    {"F3", 0x3C},
    {"F4", 0x3D},
    {"F5", 0x3E},
    {"F6", 0x3F},
    {"F7", 0x40},
    {"F8", 0x41},
    {"F9", 0x42},
    {"F10", 0x43},
    {"F11", 0x44},
    {"F12", 0x45},
    {"PRINTSCREEN", 0x46},
    {"SCROLLLOCK", 0x47},
    {"PAUSE", 0x48},
    {"INSERT", 0x49},
    {"HOME", 0x4A},
    {"PAGEUP", 0x4B},
    {"DELETE", 0x4C},
    {"END", 0x4D},
    {"PAGEDOWN", 0x4E},
    {"RIGHT", 0x4F},
    {"LEFT", 0x50},
    {"DOWN", 0x51},
    {"UP", 0x52},
    {"LANG1", 0x90},
    {"LANG2", 0x91},
};
constexpr int kKeyUsageCount = 80;

// 키 이름 → 사용 코드. 모르면 -1
inline int keyUsage(const char* name) {
  for (const auto& k : kKeyUsages) {
    const char* a = k.name;
    const char* b = name;
    while (*a && *a == *b) {
      ++a;
      ++b;
    }
    if (*a == *b) return k.usage;
  }
  return -1;
}

struct ConsumerUsage {
  const char* name;
  uint16_t usage;
};
constexpr ConsumerUsage kConsumerUsages[] = {
    {"MUTE", 0x00E2},
    {"VOLUME_UP", 0x00E9},
    {"VOLUME_DOWN", 0x00EA},
    {"PLAY_PAUSE", 0x00CD},
    {"NEXT_TRACK", 0x00B5},
    {"PREV_TRACK", 0x00B6},
};
constexpr uint8_t kMouseButton_left = 0x01;
constexpr uint8_t kMouseButton_right = 0x02;
constexpr uint8_t kMouseButton_middle = 0x04;

// ---------------------------------------------------------------------------
// 키 바인딩 표 (모드, 앱, 동작, OS → 보고서 값). null(그 OS 에 없음)은 싣지 않는다.
// 화면 배치 순서는 makeKeymap() 의 actions 배열 순서를 따른다.
// ---------------------------------------------------------------------------

struct KeyBinding {
  ModeId mode;
  AppId app;
  ActionId action;
  OsId os;
  uint8_t modifier;
  uint8_t usage;
};
constexpr KeyBinding kKeyBindings[] = {
    {ModeId::Present, AppId::PowerPoint, ActionId::Next, OsId::Win, 0x00, 0x4F},  // RIGHT
    {ModeId::Present, AppId::PowerPoint, ActionId::Next, OsId::Mac, 0x00, 0x4F},  // RIGHT
    {ModeId::Present, AppId::PowerPoint, ActionId::Prev, OsId::Win, 0x00, 0x50},  // LEFT
    {ModeId::Present, AppId::PowerPoint, ActionId::Prev, OsId::Mac, 0x00, 0x50},  // LEFT
    {ModeId::Present, AppId::PowerPoint, ActionId::Blackout, OsId::Win, 0x00, 0x37},  // PERIOD
    {ModeId::Present, AppId::PowerPoint, ActionId::Blackout, OsId::Mac, 0x00, 0x37},  // PERIOD
    {ModeId::Present, AppId::PowerPoint, ActionId::ShowStart, OsId::Win, 0x00, 0x3E},  // F5
    {ModeId::Present, AppId::PowerPoint, ActionId::ShowStart, OsId::Mac, 0x0A, 0x28},  // gui+shift+ENTER
    {ModeId::Present, AppId::PowerPoint, ActionId::ShowEnd, OsId::Win, 0x00, 0x29},  // ESCAPE
    {ModeId::Present, AppId::PowerPoint, ActionId::ShowEnd, OsId::Mac, 0x00, 0x29},  // ESCAPE
    {ModeId::Present, AppId::Slides, ActionId::Next, OsId::Win, 0x00, 0x4F},  // RIGHT
    {ModeId::Present, AppId::Slides, ActionId::Next, OsId::Mac, 0x00, 0x4F},  // RIGHT
    {ModeId::Present, AppId::Slides, ActionId::Prev, OsId::Win, 0x00, 0x50},  // LEFT
    {ModeId::Present, AppId::Slides, ActionId::Prev, OsId::Mac, 0x00, 0x50},  // LEFT
    {ModeId::Present, AppId::Slides, ActionId::Blackout, OsId::Win, 0x00, 0x37},  // PERIOD
    {ModeId::Present, AppId::Slides, ActionId::Blackout, OsId::Mac, 0x00, 0x37},  // PERIOD
    {ModeId::Present, AppId::Slides, ActionId::ShowStart, OsId::Win, 0x01, 0x3E},  // ctrl+F5
    {ModeId::Present, AppId::Slides, ActionId::ShowStart, OsId::Mac, 0x08, 0x28},  // gui+ENTER
    {ModeId::Present, AppId::Slides, ActionId::ShowEnd, OsId::Win, 0x00, 0x29},  // ESCAPE
    {ModeId::Present, AppId::Slides, ActionId::ShowEnd, OsId::Mac, 0x00, 0x29},  // ESCAPE
    {ModeId::Launch, AppId::Launcher, ActionId::Claude, OsId::Win, 0x05, 0x1E},  // ctrl+alt+1
    {ModeId::Launch, AppId::Launcher, ActionId::Kakao, OsId::Win, 0x05, 0x1F},  // ctrl+alt+2
    {ModeId::Launch, AppId::Launcher, ActionId::Chrome, OsId::Win, 0x05, 0x20},  // ctrl+alt+3
    {ModeId::Launch, AppId::Launcher, ActionId::Ppt, OsId::Win, 0x05, 0x21},  // ctrl+alt+4
    {ModeId::Launch, AppId::Launcher, ActionId::Excel, OsId::Win, 0x05, 0x22},  // ctrl+alt+5
    {ModeId::Launch, AppId::Launcher, ActionId::Hwp, OsId::Win, 0x05, 0x23},  // ctrl+alt+6
    {ModeId::Launch, AppId::Launcher, ActionId::Capture, OsId::Win, 0x0A, 0x16},  // gui+shift+S
    {ModeId::Launch, AppId::Launcher, ActionId::Capture, OsId::Mac, 0x0A, 0x22},  // gui+shift+5
    {ModeId::Launch, AppId::Launcher, ActionId::Lock, OsId::Win, 0x08, 0x0F},  // gui+L
    {ModeId::Launch, AppId::Launcher, ActionId::Lock, OsId::Mac, 0x09, 0x14},  // ctrl+gui+Q
    {ModeId::Launch, AppId::Launcher, ActionId::Desktop, OsId::Win, 0x08, 0x07},  // gui+D
    {ModeId::Launch, AppId::Launcher, ActionId::Display, OsId::Win, 0x08, 0x13},  // gui+P
    {ModeId::Meeting, AppId::Zoom, ActionId::Mic, OsId::Win, 0x04, 0x04},  // alt+A
    {ModeId::Meeting, AppId::Zoom, ActionId::Mic, OsId::Mac, 0x0A, 0x04},  // gui+shift+A
    {ModeId::Meeting, AppId::Zoom, ActionId::Camera, OsId::Win, 0x04, 0x19},  // alt+V
    {ModeId::Meeting, AppId::Zoom, ActionId::Camera, OsId::Mac, 0x0A, 0x19},  // gui+shift+V
    {ModeId::Meeting, AppId::Zoom, ActionId::Hand, OsId::Win, 0x04, 0x1C},  // alt+Y
    {ModeId::Meeting, AppId::Zoom, ActionId::Hand, OsId::Mac, 0x04, 0x1C},  // alt+Y
    {ModeId::Meeting, AppId::Teams, ActionId::Mic, OsId::Win, 0x03, 0x10},  // ctrl+shift+M
    {ModeId::Meeting, AppId::Teams, ActionId::Mic, OsId::Mac, 0x0A, 0x10},  // gui+shift+M
    {ModeId::Meeting, AppId::Teams, ActionId::Camera, OsId::Win, 0x03, 0x12},  // ctrl+shift+O
    {ModeId::Meeting, AppId::Teams, ActionId::Camera, OsId::Mac, 0x0A, 0x12},  // gui+shift+O
    {ModeId::Meeting, AppId::Teams, ActionId::Hand, OsId::Win, 0x03, 0x0E},  // ctrl+shift+K
    {ModeId::Meeting, AppId::Teams, ActionId::Hand, OsId::Mac, 0x0A, 0x0E},  // gui+shift+K
    {ModeId::Meeting, AppId::Meet, ActionId::Mic, OsId::Win, 0x01, 0x07},  // ctrl+D
    {ModeId::Meeting, AppId::Meet, ActionId::Mic, OsId::Mac, 0x08, 0x07},  // gui+D
    {ModeId::Meeting, AppId::Meet, ActionId::Camera, OsId::Win, 0x01, 0x08},  // ctrl+E
    {ModeId::Meeting, AppId::Meet, ActionId::Camera, OsId::Mac, 0x08, 0x08},  // gui+E
    {ModeId::Meeting, AppId::Meet, ActionId::Hand, OsId::Win, 0x05, 0x0B},  // ctrl+alt+H
    {ModeId::Meeting, AppId::Meet, ActionId::Hand, OsId::Mac, 0x09, 0x0B},  // ctrl+gui+H
};
constexpr int kKeyBindingCount = 50;  // 키 조합만(매크로 제외)

// ---------------------------------------------------------------------------
// wc::Keymap 채우기 (shared/keymap.json)
// ---------------------------------------------------------------------------

inline Chord makeChord(uint8_t mods, const char* key, uint8_t usage) {
  Chord c;
  c.mods = mods;
  c.key = key;
  c.usage = usage;
  return c;
}

inline Binding chordBinding(uint8_t mods, const char* key, uint8_t usage) {
  Binding b;
  b.chord = makeChord(mods, key, usage);
  return b;
}
inline MacroStep stepChord(uint8_t mods, const char* key, uint8_t usage) {
  MacroStep s;
  s.kind = MacroStepKind::Chord;
  s.chord = makeChord(mods, key, usage);
  return s;
}
inline MacroStep stepWait(int ms) {
  MacroStep s;
  s.kind = MacroStepKind::Wait;
  s.waitMs = ms;
  return s;
}
inline MacroStep stepText(const char* t) {
  MacroStep s;
  s.kind = MacroStepKind::Text;
  s.text = t;
  return s;
}
inline MacroStep stepConsumer(const char* name, uint16_t usage) {
  MacroStep s;
  s.kind = MacroStepKind::Consumer;
  s.consumerName = name;
  s.consumerUsage = usage;
  return s;
}

inline Keymap makeKeymap() {
  Keymap km;
  km.version = 1;
  km.settings.deviceName = "\354\206\220\353\252\251 \354\273\250\355\212\270\353\241\244\353\237\254";  // 손목 컨트롤러
  km.settings.deviceNameMaxBytes = 29;
  km.settings.os = OsId::Win;
  km.settings.mode = ModeId::Clock;
  km.settings.sensitivity = 1;
  km.settings.primaryButton = ButtonId::Boot;
  km.modeOrder = {ModeId::Clock, ModeId::Present, ModeId::Launch, ModeId::Meeting};
  {
    KeymapMode& m = km.modes[0];  // present
    m.name = "\353\260\234\355\221\234";  // 발표
    m.defaultApp = AppId::PowerPoint;
    m.appOrder = {AppId::PowerPoint, AppId::Slides};
    {
      KeymapApp a;
      a.id = AppId::PowerPoint;
      a.name = "PowerPoint";
      {
        KeymapAction x;
        x.id = ActionId::Next;
        x.label = "\353\213\244\354\235\214";  // 다음
        x.win = chordBinding(0x00, "RIGHT", 0x4F);  // RIGHT
        x.mac = chordBinding(0x00, "RIGHT", 0x4F);  // RIGHT
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::Prev;
        x.label = "\354\235\264\354\240\204";  // 이전
        x.win = chordBinding(0x00, "LEFT", 0x50);  // LEFT
        x.mac = chordBinding(0x00, "LEFT", 0x50);  // LEFT
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::Blackout;
        x.label = "\354\225\224\354\240\204";  // 암전
        x.win = chordBinding(0x00, "PERIOD", 0x37);  // PERIOD
        x.mac = chordBinding(0x00, "PERIOD", 0x37);  // PERIOD
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::ShowStart;
        x.label = "\354\207\274 \354\213\234\354\236\221";  // 쇼 시작
        x.win = chordBinding(0x00, "F5", 0x3E);  // F5
        x.mac = chordBinding(0x0A, "ENTER", 0x28);  // gui+shift+ENTER
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::ShowEnd;
        x.label = "\354\207\274 \354\242\205\353\243\214";  // 쇼 종료
        x.win = chordBinding(0x00, "ESCAPE", 0x29);  // ESCAPE
        x.mac = chordBinding(0x00, "ESCAPE", 0x29);  // ESCAPE
        a.actions.push_back(x);
      }
      m.apps.push_back(a);
    }
    {
      KeymapApp a;
      a.id = AppId::Slides;
      a.name = "Google Slides";
      {
        KeymapAction x;
        x.id = ActionId::Next;
        x.label = "\353\213\244\354\235\214";  // 다음
        x.win = chordBinding(0x00, "RIGHT", 0x4F);  // RIGHT
        x.mac = chordBinding(0x00, "RIGHT", 0x4F);  // RIGHT
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::Prev;
        x.label = "\354\235\264\354\240\204";  // 이전
        x.win = chordBinding(0x00, "LEFT", 0x50);  // LEFT
        x.mac = chordBinding(0x00, "LEFT", 0x50);  // LEFT
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::Blackout;
        x.label = "\354\225\224\354\240\204";  // 암전
        x.win = chordBinding(0x00, "PERIOD", 0x37);  // PERIOD
        x.mac = chordBinding(0x00, "PERIOD", 0x37);  // PERIOD
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::ShowStart;
        x.label = "\354\207\274 \354\213\234\354\236\221";  // 쇼 시작
        x.win = chordBinding(0x01, "F5", 0x3E);  // ctrl+F5
        x.mac = chordBinding(0x08, "ENTER", 0x28);  // gui+ENTER
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::ShowEnd;
        x.label = "\354\207\274 \354\242\205\353\243\214";  // 쇼 종료
        x.win = chordBinding(0x00, "ESCAPE", 0x29);  // ESCAPE
        x.mac = chordBinding(0x00, "ESCAPE", 0x29);  // ESCAPE
        a.actions.push_back(x);
      }
      m.apps.push_back(a);
    }
  }
  {
    KeymapMode& m = km.modes[1];  // launch
    m.name = "\354\213\244\355\226\211";  // 실행
    m.defaultApp = AppId::Launcher;
    m.appOrder = {AppId::Launcher};
    {
      KeymapApp a;
      a.id = AppId::Launcher;
      a.name = "Launcher";
      {
        KeymapAction x;
        x.id = ActionId::Claude;
        x.label = "Claude";  // Claude
        x.win = chordBinding(0x05, "1", 0x1E);  // ctrl+alt+1
        {
          Binding b;
          b.macro = true;
          b.steps.push_back(stepChord(0x08, "SPACE", 0x2C));  // gui+SPACE
          b.steps.push_back(stepWait(300));
          b.steps.push_back(stepText("Claude"));
          b.steps.push_back(stepWait(300));
          b.steps.push_back(stepChord(0x00, "ENTER", 0x28));  // ENTER
          x.mac = b;
        }
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::Kakao;
        x.label = "\354\271\264\354\271\264\354\230\244\355\206\241";  // 카카오톡
        x.win = chordBinding(0x05, "2", 0x1F);  // ctrl+alt+2
        {
          Binding b;
          b.macro = true;
          b.steps.push_back(stepChord(0x08, "SPACE", 0x2C));  // gui+SPACE
          b.steps.push_back(stepWait(300));
          b.steps.push_back(stepText("KakaoTalk"));
          b.steps.push_back(stepWait(300));
          b.steps.push_back(stepChord(0x00, "ENTER", 0x28));  // ENTER
          x.mac = b;
        }
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::Chrome;
        x.label = "\355\201\254\353\241\254";  // 크롬
        x.win = chordBinding(0x05, "3", 0x20);  // ctrl+alt+3
        {
          Binding b;
          b.macro = true;
          b.steps.push_back(stepChord(0x08, "SPACE", 0x2C));  // gui+SPACE
          b.steps.push_back(stepWait(300));
          b.steps.push_back(stepText("Google Chrome"));
          b.steps.push_back(stepWait(300));
          b.steps.push_back(stepChord(0x00, "ENTER", 0x28));  // ENTER
          x.mac = b;
        }
        {
          Binding b;
          b.macro = true;
          b.steps.push_back(stepChord(0x08, "R", 0x15));  // gui+R
          b.steps.push_back(stepWait(300));
          b.steps.push_back(stepText("chrome"));
          b.steps.push_back(stepWait(50));
          b.steps.push_back(stepChord(0x00, "ENTER", 0x28));  // ENTER
          x.winAlt = b;
        }
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::Ppt;
        x.label = "\355\214\214\354\233\214\355\217\254\354\235\270\355\212\270";  // 파워포인트
        x.win = chordBinding(0x05, "4", 0x21);  // ctrl+alt+4
        {
          Binding b;
          b.macro = true;
          b.steps.push_back(stepChord(0x08, "SPACE", 0x2C));  // gui+SPACE
          b.steps.push_back(stepWait(300));
          b.steps.push_back(stepText("PowerPoint"));
          b.steps.push_back(stepWait(300));
          b.steps.push_back(stepChord(0x00, "ENTER", 0x28));  // ENTER
          x.mac = b;
        }
        {
          Binding b;
          b.macro = true;
          b.steps.push_back(stepChord(0x08, "R", 0x15));  // gui+R
          b.steps.push_back(stepWait(300));
          b.steps.push_back(stepText("powerpnt"));
          b.steps.push_back(stepWait(50));
          b.steps.push_back(stepChord(0x00, "ENTER", 0x28));  // ENTER
          x.winAlt = b;
        }
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::Excel;
        x.label = "\354\227\221\354\205\200";  // 엑셀
        x.win = chordBinding(0x05, "5", 0x22);  // ctrl+alt+5
        {
          Binding b;
          b.macro = true;
          b.steps.push_back(stepChord(0x08, "SPACE", 0x2C));  // gui+SPACE
          b.steps.push_back(stepWait(300));
          b.steps.push_back(stepText("Excel"));
          b.steps.push_back(stepWait(300));
          b.steps.push_back(stepChord(0x00, "ENTER", 0x28));  // ENTER
          x.mac = b;
        }
        {
          Binding b;
          b.macro = true;
          b.steps.push_back(stepChord(0x08, "R", 0x15));  // gui+R
          b.steps.push_back(stepWait(300));
          b.steps.push_back(stepText("excel"));
          b.steps.push_back(stepWait(50));
          b.steps.push_back(stepChord(0x00, "ENTER", 0x28));  // ENTER
          x.winAlt = b;
        }
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::Hwp;
        x.label = "\355\225\234\352\270\200";  // 한글
        x.win = chordBinding(0x05, "6", 0x23);  // ctrl+alt+6
        {
          Binding b;
          b.macro = true;
          b.steps.push_back(stepChord(0x08, "SPACE", 0x2C));  // gui+SPACE
          b.steps.push_back(stepWait(300));
          b.steps.push_back(stepText("Hancom Office HWP"));
          b.steps.push_back(stepWait(300));
          b.steps.push_back(stepChord(0x00, "ENTER", 0x28));  // ENTER
          x.mac = b;
        }
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::Capture;
        x.label = "\354\272\241\354\262\230";  // 캡처
        x.win = chordBinding(0x0A, "S", 0x16);  // gui+shift+S
        x.mac = chordBinding(0x0A, "5", 0x22);  // gui+shift+5
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::Lock;
        x.label = "\355\231\224\353\251\264 \354\236\240\352\270\210";  // 화면 잠금
        x.win = chordBinding(0x08, "L", 0x0F);  // gui+L
        x.mac = chordBinding(0x09, "Q", 0x14);  // ctrl+gui+Q
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::Desktop;
        x.label = "\353\260\224\355\203\225 \355\231\224\353\251\264";  // 바탕 화면
        x.win = chordBinding(0x08, "D", 0x07);  // gui+D
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::Display;
        x.label = "\355\231\224\353\251\264 \354\227\260\352\262\260";  // 화면 연결
        x.win = chordBinding(0x08, "P", 0x13);  // gui+P
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::Mute;
        x.label = "\354\235\214\354\206\214\352\261\260";  // 음소거
        {
          Binding b;
          b.macro = true;
          b.steps.push_back(stepConsumer("MUTE", 0x00E2));
          x.win = b;
        }
        {
          Binding b;
          b.macro = true;
          b.steps.push_back(stepConsumer("MUTE", 0x00E2));
          x.mac = b;
        }
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::Portal;
        x.label = "\355\217\254\355\204\270";  // 포털
        {
          Binding b;
          b.macro = true;
          b.steps.push_back(stepChord(0x08, "3", 0x20));  // gui+3
          b.steps.push_back(stepWait(800));
          b.steps.push_back(stepChord(0x01, "T", 0x17));  // ctrl+T
          b.steps.push_back(stepWait(150));
          b.steps.push_back(stepText("{url}"));
          b.steps.push_back(stepWait(50));
          b.steps.push_back(stepChord(0x00, "ENTER", 0x28));  // ENTER
          x.win = b;
        }
        {
          Binding b;
          b.macro = true;
          b.steps.push_back(stepChord(0x08, "SPACE", 0x2C));  // gui+SPACE
          b.steps.push_back(stepWait(300));
          b.steps.push_back(stepText("{url}"));
          b.steps.push_back(stepWait(300));
          b.steps.push_back(stepChord(0x00, "ENTER", 0x28));  // ENTER
          x.mac = b;
        }
        {
          Binding b;
          b.macro = true;
          b.steps.push_back(stepChord(0x08, "R", 0x15));  // gui+R
          b.steps.push_back(stepWait(300));
          b.steps.push_back(stepText("{url}"));
          b.steps.push_back(stepWait(50));
          b.steps.push_back(stepChord(0x00, "ENTER", 0x28));  // ENTER
          x.winAlt = b;
        }
        x.hasUrl = true;
        x.url = "";
        a.actions.push_back(x);
      }
      m.apps.push_back(a);
    }
  }
  {
    KeymapMode& m = km.modes[2];  // meeting
    m.name = "\355\232\214\354\235\230";  // 회의
    m.defaultApp = AppId::Zoom;
    m.appOrder = {AppId::Zoom, AppId::Teams, AppId::Meet};
    {
      KeymapApp a;
      a.id = AppId::Zoom;
      a.name = "Zoom";
      {
        KeymapAction x;
        x.id = ActionId::Mic;
        x.label = "\353\247\210\354\235\264\355\201\254";  // 마이크
        x.win = chordBinding(0x04, "A", 0x04);  // alt+A
        x.mac = chordBinding(0x0A, "A", 0x04);  // gui+shift+A
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::Camera;
        x.label = "\354\271\264\353\251\224\353\235\274";  // 카메라
        x.win = chordBinding(0x04, "V", 0x19);  // alt+V
        x.mac = chordBinding(0x0A, "V", 0x19);  // gui+shift+V
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::Hand;
        x.label = "\354\206\220 \353\223\244\352\270\260";  // 손 들기
        x.win = chordBinding(0x04, "Y", 0x1C);  // alt+Y
        x.mac = chordBinding(0x04, "Y", 0x1C);  // alt+Y
        a.actions.push_back(x);
      }
      m.apps.push_back(a);
    }
    {
      KeymapApp a;
      a.id = AppId::Teams;
      a.name = "Teams";
      {
        KeymapAction x;
        x.id = ActionId::Mic;
        x.label = "\353\247\210\354\235\264\355\201\254";  // 마이크
        x.win = chordBinding(0x03, "M", 0x10);  // ctrl+shift+M
        x.mac = chordBinding(0x0A, "M", 0x10);  // gui+shift+M
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::Camera;
        x.label = "\354\271\264\353\251\224\353\235\274";  // 카메라
        x.win = chordBinding(0x03, "O", 0x12);  // ctrl+shift+O
        x.mac = chordBinding(0x0A, "O", 0x12);  // gui+shift+O
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::Hand;
        x.label = "\354\206\220 \353\223\244\352\270\260";  // 손 들기
        x.win = chordBinding(0x03, "K", 0x0E);  // ctrl+shift+K
        x.mac = chordBinding(0x0A, "K", 0x0E);  // gui+shift+K
        a.actions.push_back(x);
      }
      m.apps.push_back(a);
    }
    {
      KeymapApp a;
      a.id = AppId::Meet;
      a.name = "Meet";
      {
        KeymapAction x;
        x.id = ActionId::Mic;
        x.label = "\353\247\210\354\235\264\355\201\254";  // 마이크
        x.win = chordBinding(0x01, "D", 0x07);  // ctrl+D
        x.mac = chordBinding(0x08, "D", 0x07);  // gui+D
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::Camera;
        x.label = "\354\271\264\353\251\224\353\235\274";  // 카메라
        x.win = chordBinding(0x01, "E", 0x08);  // ctrl+E
        x.mac = chordBinding(0x08, "E", 0x08);  // gui+E
        a.actions.push_back(x);
      }
      {
        KeymapAction x;
        x.id = ActionId::Hand;
        x.label = "\354\206\220 \353\223\244\352\270\260";  // 손 들기
        x.win = chordBinding(0x05, "H", 0x0B);  // ctrl+alt+H
        x.mac = chordBinding(0x09, "H", 0x0B);  // ctrl+gui+H
        a.actions.push_back(x);
      }
      m.apps.push_back(a);
    }
  }
  {
    KeymapMode& m = km.modes[3];  // clock
    m.name = "\354\213\234\352\263\204";  // 시계
    m.defaultApp = AppId::Clock;
    m.appOrder = {AppId::Clock};
    {
      KeymapApp a;
      a.id = AppId::Clock;
      a.name = "Clock";
      m.apps.push_back(a);
    }
  }
  return km;
}

// ---------------------------------------------------------------------------
// wc::GestureConfig 채우기 (shared/gesture.json)
// ---------------------------------------------------------------------------

inline GestureConfig makeGesture() {
  GestureConfig g;
  g.version = 1;
  g.imu.sampleRateHz = 100.0;
  g.imu.gyroRangeDps = 1024.0;
  g.imu.axisMap[0] = 2;  // yaw = gz
  g.imu.axisSign[0] = 1;
  g.imu.axisMap[1] = 0;  // pitch = gx
  g.imu.axisSign[1] = 1;
  g.imu.axisMap[2] = 1;  // roll = gy
  g.imu.axisSign[2] = 1;
  g.imu.biasCalib.enabled = true;
  g.imu.biasCalib.stillThresholdDps = 3.0;
  g.imu.biasCalib.stillMs = 1000.0;
  g.imu.biasCalib.trackTauMs = 5000.0;
  g.airMouse.enabled = false;
  g.airMouse.holdToStartMs = 250.0;
  g.airMouse.startSuppressMs = 50.0;
  g.airMouse.deadzoneDps.enter = 2.0;
  g.airMouse.deadzoneDps.exit = 1.5;
  g.airMouse.lowpassTauMs = 30.0;
  g.airMouse.curve.exponent = 1.3;
  g.airMouse.curve.maxPxPerReport = 40.0;
  g.airMouse.sensitivity.clear();
  g.airMouse.sensitivity.push_back(SensitivityLevel{"\353\202\256\354\235\214", 0.6});  // 낮음
  g.airMouse.sensitivity.push_back(SensitivityLevel{"\353\263\264\355\206\265", 1.0});  // 보통
  g.airMouse.sensitivity.push_back(SensitivityLevel{"\353\206\222\354\235\214", 1.6});  // 높음
  g.airMouse.invertY = false;
  g.flick.enabled = false;
  g.flick.detector = GestureConfig::Flick::Detector::Accel;
  g.flick.accel.lpfTauMs = 200.0;
  g.flick.accel.peakG = 1.0;
  g.flick.accel.maxAboveMs = 250.0;
  g.flick.accel.quietWindowMs = 300.0;
  g.flick.accel.quietGuardMs = 50.0;
  g.flick.accel.quietMaxRmsG = 0.25;
  g.flick.axis = LogicalAxis::Roll;
  g.flick.prefilterTauMs = 10.0;
  g.flick.peakThresholdDps = 220.0;
  g.flick.adaptive.enabled = true;
  g.flick.adaptive.windowMs = 2000.0;
  g.flick.adaptive.rmsMultiplier = 4.0;
  g.flick.axisDominanceRatio = 1.5;
  g.flick.minAboveMs = 30.0;
  g.flick.maxAboveMs = 200.0;
  g.flick.rebound.required = true;
  g.flick.rebound.windowMs = 250.0;
  g.flick.rebound.minRatio = 0.3;
  g.flick.rebound.minDps = 80.0;
  g.flick.quietBefore.windowMs = 300.0;
  g.flick.quietBefore.guardMs = 50.0;
  g.flick.quietBefore.maxRmsDps = 80.0;
  g.flick.cooldownMs = 800.0;
  g.flick.outwardSign = 1;
  g.flick.inAction = GestureConfig::Flick::InAction::Next;
  g.touch.tapMaxMovePx = 12.0;
  g.touch.holdMs = 600.0;
  g.touch.blackoutHoldMs = 360.0;
  g.touch.swipeMinPx = 80.0;
  g.touch.swipeMaxOffAxisPx = 60.0;
  g.touch.swipeAxisRatio = 1.5;
  g.touch.swipeMaxMs = 800.0;
  g.touch.showSwipeMinPx = 140.0;
  g.touch.showSwipeMaxOffAxisPx = 50.0;
  g.touch.sheetPullMinPx = 48.0;
  g.touch.pullMaxOffAxisPx = 40.0;
  g.touch.pullMaxMs = 600.0;
  g.touch.topEdgePx = 72.0;
  g.touch.settingsCloseMinPx = 40.0;
  g.touch.settingsCloseAxisRatio = 1.2;
  g.button.longPressMs = 2000.0;
  g.button.powerOffHoldMs = 3000.0;
  g.button.powerConfirmTimeoutMs = 10000.0;
  g.timing.sheetAutoCloseMs = 3000.0;
  g.timing.meetingEstimateResetMs = 30000.0;
  g.timing.settingsIdleCloseMs = 30000.0;
  g.power.screenOffMs = 20000.0;
  g.power.brightnessPercent = 80.0;
  g.power.batteryPollMs = 5000.0;
  g.power.wristRaise.enabled = true;
  g.power.wristRaise.faceAxis = 2;
  g.power.wristRaise.faceSign = 1;
  g.power.wristRaise.faceUpMinG = 0.6;
  g.power.wristRaise.minDeltaG = 0.35;
  g.power.wristRaise.windowMs = 600.0;
  return g;
}

}  // namespace gen
}  // namespace wc
