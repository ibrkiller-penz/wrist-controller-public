// 키맵 해석 구현 — sim/src/core/keymap.ts 의 resolveChord / formatChord / keyLabel 과 같은 결과.
// 여기 있는 표는 '표시 문자열'뿐이다. 어떤 동작에 어떤 키를 보낼지는 언제나 Keymap(설정)에서 읽는다.
#include "wc/keymap.h"

#include <algorithm>

#include <cstring>

namespace wc {

namespace {

struct KeyLabelEntry {
  const char* key;
  const char* label;
};

// TS KEY_LABEL 과 같은 표(UTF-8)
const KeyLabelEntry kKeyLabels[] = {
    {"RIGHT", "\xE2\x86\x92"},  // →
    {"LEFT", "\xE2\x86\x90"},   // ←
    {"UP", "\xE2\x86\x91"},     // ↑
    {"DOWN", "\xE2\x86\x93"},   // ↓
    {"ESCAPE", "Esc"},
    {"ENTER", "Enter"},
    {"SPACE", "Space"},
    {"TAB", "Tab"},
    {"BACKSPACE", "Backspace"},
    {"DELETE", "Del"},
    {"PAGEUP", "PgUp"},
    {"PAGEDOWN", "PgDn"},
    {"HOME", "Home"},
    {"END", "End"},
    {"INSERT", "Ins"},
    {"GRAVE", "`"},
    {"SLASH", "/"},
    {"PERIOD", "."},
    {"COMMA", ","},
    {"MINUS", "-"},
    {"EQUAL", "="},
    {"BACKSLASH", "\\"},
    {"SEMICOLON", ";"},
    {"QUOTE", "'"},
    {"LEFTBRACKET", "["},
    {"RIGHTBRACKET", "]"},
    {"LANG1", "\xED\x95\x9C/\xEC\x98\x81"},  // 한/영
    {"LANG2", "\xED\x95\x9C\xEC\x9E\x90"},   // 한자
    {"CAPSLOCK", "CapsLock"},
    {"PRINTSCREEN", "PrtSc"},
    {"SCROLLLOCK", "ScrLk"},
    {"PAUSE", "Pause"},
};

struct ModLabel {
  uint8_t bit;
  const char* label;
};

// 수정자 표기 순서: win = Ctrl, Alt, Shift, Win / mac = Ctrl, Cmd, Option, Shift
const ModLabel kWinMods[] = {{MOD_CTRL, "Ctrl"}, {MOD_ALT, "Alt"}, {MOD_SHIFT, "Shift"}, {MOD_GUI, "Win"}};
const ModLabel kMacMods[] = {{MOD_CTRL, "Ctrl"}, {MOD_GUI, "Cmd"}, {MOD_ALT, "Option"}, {MOD_SHIFT, "Shift"}};

}  // namespace

const KeymapApp* findApp(const Keymap& km, ModeId mode, AppId app) {
  const KeymapMode& m = km.modes[idx(mode)];
  for (const auto& a : m.apps) {
    if (a.id == app) return &a;
  }
  return nullptr;
}

const KeymapAction* findAction(const Keymap& km, ModeId mode, AppId app, ActionId action) {
  const KeymapApp* a = findApp(km, mode, app);
  if (!a) return nullptr;
  for (const auto& act : a->actions) {
    if (act.id == action) return &act;
  }
  return nullptr;
}

std::optional<Binding> bindingOf(const KeymapAction& a, OsId os, bool alt) {
  const std::optional<Binding>& src = alt ? (os == OsId::Mac ? a.macAlt : a.winAlt) : (os == OsId::Mac ? a.mac : a.win);
  if (!src) return std::nullopt;
  if (!src->macro) return src;
  Binding b = *src;
  const std::string tag = "{url}";
  for (auto& st : b.steps) {
    if (st.kind != MacroStepKind::Text) continue;
    size_t pos = st.text.find(tag);
    if (pos == std::string::npos) continue;
    if (a.url.empty()) return std::nullopt;  // 주소 없음 = 비활성
    while (pos != std::string::npos) {
      st.text.replace(pos, tag.size(), a.url);
      pos = st.text.find(tag, pos + a.url.size());
    }
  }
  return b;
}

std::optional<Binding> resolveBinding(const Keymap& km, ModeId mode, AppId app, ActionId action, OsId os, bool alt) {
  const KeymapAction* a = findAction(km, mode, app, action);
  if (!a) return std::nullopt;
  return bindingOf(*a, os, alt);
}

std::optional<Chord> resolveChord(const Keymap& km, ModeId mode, AppId app, ActionId action, OsId os) {
  const auto b = resolveBinding(km, mode, app, action, os);
  if (!b || b->macro) return std::nullopt;
  return b->chord;
}

// ---------------------------------------------------------------------------
// 매크로
// ---------------------------------------------------------------------------

namespace {
struct CharKey {
  char c;
  bool shift;
  const char* key;
  uint8_t usage;
};
// US 배열(HID Usage Tables 키보드 페이지). 영문·숫자는 charToChord 에서 계산한다
const CharKey kCharKeys[] = {
    {' ', false, "SPACE", 0x2C},       {'-', false, "MINUS", 0x2D},        {'=', false, "EQUAL", 0x2E},
    {'[', false, "LEFTBRACKET", 0x2F}, {']', false, "RIGHTBRACKET", 0x30}, {'\\', false, "BACKSLASH", 0x31},
    {';', false, "SEMICOLON", 0x33},   {'\'', false, "QUOTE", 0x34},       {'`', false, "GRAVE", 0x35},
    {',', false, "COMMA", 0x36},       {'.', false, "PERIOD", 0x37},       {'/', false, "SLASH", 0x38},
    {'!', true, "1", 0x1E},            {'@', true, "2", 0x1F},             {'#', true, "3", 0x20},
    {'$', true, "4", 0x21},            {'%', true, "5", 0x22},             {'^', true, "6", 0x23},
    {'&', true, "7", 0x24},            {'*', true, "8", 0x25},             {'(', true, "9", 0x26},
    {')', true, "0", 0x27},            {'_', true, "MINUS", 0x2D},         {'+', true, "EQUAL", 0x2E},
    {'{', true, "LEFTBRACKET", 0x2F},  {'}', true, "RIGHTBRACKET", 0x30},  {'|', true, "BACKSLASH", 0x31},
    {':', true, "SEMICOLON", 0x33},    {'"', true, "QUOTE", 0x34},         {'~', true, "GRAVE", 0x35},
    {'<', true, "COMMA", 0x36},        {'>', true, "PERIOD", 0x37},        {'?', true, "SLASH", 0x38},
};

const char* consumerLabel(const std::string& n) {
  if (n == "MUTE") return "Mute";
  if (n == "VOLUME_UP") return "Vol+";
  if (n == "VOLUME_DOWN") return "Vol-";
  if (n == "PLAY_PAUSE") return "Play/Pause";
  if (n == "NEXT_TRACK") return "Next track";
  if (n == "PREV_TRACK") return "Prev track";
  return nullptr;
}
}  // namespace

bool charToChord(char c, Chord& out) {
  out = Chord{};
  if (c >= 'a' && c <= 'z') {
    out.key = std::string(1, static_cast<char>(c - 'a' + 'A'));
    out.usage = static_cast<uint8_t>(0x04 + (c - 'a'));
    return true;
  }
  if (c >= 'A' && c <= 'Z') {
    out.mods = MOD_SHIFT;
    out.key = std::string(1, c);
    out.usage = static_cast<uint8_t>(0x04 + (c - 'A'));
    return true;
  }
  if (c >= '1' && c <= '9') {
    out.key = std::string(1, c);
    out.usage = static_cast<uint8_t>(0x1E + (c - '1'));
    return true;
  }
  if (c == '0') {
    out.key = "0";
    out.usage = 0x27;
    return true;
  }
  for (const auto& k : kCharKeys) {
    if (k.c == c) {
      out.mods = k.shift ? MOD_SHIFT : 0;
      out.key = k.key;
      out.usage = k.usage;
      return true;
    }
  }
  return false;
}

std::vector<MacroReport> expandMacro(const std::vector<MacroStep>& steps) {
  std::vector<MacroReport> out;
  auto kbd = [&](uint8_t mod, uint16_t usage) {
    MacroReport r;
    r.kind = MacroReportKind::Kbd;
    r.mod = mod;
    r.usage = usage;
    out.push_back(r);
  };
  auto wait = [&](int ms) {
    MacroReport r;
    r.kind = MacroReportKind::Wait;
    r.ms = ms;
    out.push_back(r);
  };
  const size_t n = std::min(steps.size(), static_cast<size_t>(kMacroMaxSteps));
  for (size_t i = 0; i < n; ++i) {
    const MacroStep& st = steps[i];
    switch (st.kind) {
      case MacroStepKind::Chord:
        if (st.chord.usage == 0) break;  // 모르는 키
        kbd(st.chord.mods, st.chord.usage);
        kbd(0, 0);
        break;
      case MacroStepKind::Wait:
        wait(std::min(std::max(st.waitMs, 0), 3000));
        break;
      case MacroStepKind::Consumer: {
        if (st.consumerUsage == 0) break;
        MacroReport r;
        r.kind = MacroReportKind::Consumer;
        r.usage = st.consumerUsage;
        out.push_back(r);
        r.usage = 0;
        out.push_back(r);
        break;
      }
      case MacroStepKind::Text: {
        bool first = true;
        for (char ch : st.text) {
          Chord c;
          if (!charToChord(ch, c)) continue;
          if (!first) wait(kMacroTextGapMs);
          kbd(c.mods, c.usage);
          kbd(0, 0);
          first = false;
        }
        break;
      }
    }
  }
  return out;
}

std::string formatSteps(const std::vector<MacroStep>& steps, OsId os) {
  std::string out;
  for (const auto& st : steps) {
    std::string part;
    switch (st.kind) {
      case MacroStepKind::Chord: part = formatChord(st.chord, os); break;
      case MacroStepKind::Text: part = st.text; break;
      case MacroStepKind::Consumer: {
        const char* l = consumerLabel(st.consumerName);
        part = l ? l : st.consumerName;
        break;
      }
      case MacroStepKind::Wait: break;
    }
    if (part.empty()) continue;
    if (!out.empty()) out += " \xE2\x86\x92 ";  // →
    out += part;
  }
  return out;
}

std::string formatBinding(const std::optional<Binding>& b, OsId os) {
  if (!b) return "";
  return b->macro ? formatSteps(b->steps, os) : formatChord(b->chord, os);
}

std::string keyLabel(const std::string& key, OsId os) {
  if (key == "ENTER" && os == OsId::Mac) return "Return";
  for (const auto& e : kKeyLabels) {
    if (key == e.key) return e.label;
  }
  return key;
}

std::string formatChord(const std::optional<Chord>& chord, OsId os) {
  if (!chord.has_value()) return "";
  std::string out;
  const ModLabel* order = os == OsId::Mac ? kMacMods : kWinMods;
  for (int i = 0; i < 4; ++i) {
    if (chord->mods & order[i].bit) {
      out += order[i].label;
      out += '+';
    }
  }
  out += keyLabel(chord->key, os);
  return out;
}

}  // namespace wc
