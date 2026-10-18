// 키맵 해석 — sim/src/core/keymap.ts 대응. (모드, 앱, 동작, OS) → 키 조합, 표시 문자열, HID 보고서 값.
// 키 배치 자체는 코드에 없다: 펌웨어는 tools/gen_keymap_header.py 가 만든 generated/keymap_gen.h,
// 호스트 테스트는 /shared/keymap.json 을 읽어 Keymap 을 채운다.
#pragma once

#include <string>
#include <vector>

#include "wc/types.h"

namespace wc {

const KeymapApp* findApp(const Keymap& km, ModeId mode, AppId app);
const KeymapAction* findAction(const Keymap& km, ModeId mode, AppId app, ActionId action);

// 동작의 바인딩(키 조합 또는 매크로). alt = 길게 누르기(winAlt/macAlt). {url} 은 action.url 로 바꾸고,
// url 이 비었는데 {url} 을 쓰면 nullopt(비활성). sim keymap.ts bindingOf/resolveBinding 과 같은 규칙.
std::optional<Binding> bindingOf(const KeymapAction& a, OsId os, bool alt = false);
std::optional<Binding> resolveBinding(const Keymap& km, ModeId mode, AppId app, ActionId action, OsId os, bool alt = false);

// 정의가 없거나 null 이면 nullopt(= 타일 비활성, 전송 안 함). 매크로 동작이면 nullopt(→ resolveBinding)
std::optional<Chord> resolveChord(const Keymap& km, ModeId mode, AppId app, ActionId action, OsId os);

// ---- 매크로 → HID 보고서 열(sim keymap.ts expandMacro, 테스트 벡터 macro.json)
constexpr int kMacroTextGapMs = 15;  // 글자 사이 간격(launcher.md 2.3 시작값)
constexpr int kMacroMaxSteps = 24;

enum class MacroReportKind : uint8_t { Kbd, Consumer, Wait };
struct MacroReport {
  MacroReportKind kind = MacroReportKind::Kbd;
  uint8_t mod = 0;     // Kbd: 수정자 바이트
  uint16_t usage = 0;  // Kbd: 키 사용 코드(0 = 모두 뗌) / Consumer: 사용 코드(0 = 뗌)
  int ms = 0;          // Wait
};

// ASCII 한 글자 → US 배열 키(수정자 비트, 키 이름, 사용 코드). 출력 불가 글자는 false
bool charToChord(char c, Chord& out);

// chord = 누름 → 뗌[0,0] / text = 글자마다 누름 → 뗌, 글자 사이 kMacroTextGapMs / consumer = [코드] → [0] / wait(0~3000)
std::vector<MacroReport> expandMacro(const std::vector<MacroStep>& steps);

// 단계 표기(대기 생략, " → " 로 잇기). 예) "Win+R → powerpnt → Enter"
std::string formatSteps(const std::vector<MacroStep>& steps, OsId os);
std::string formatBinding(const std::optional<Binding>& b, OsId os);

// 키 이름 표시(UTF-8). 예) RIGHT → "→", ENTER(mac) → "Return"
std::string keyLabel(const std::string& key, OsId os);

// 사람이 읽는 표기. win "Ctrl+Shift+P", mac "Cmd+Shift+P". nullopt 면 ""
std::string formatChord(const std::optional<Chord>& chord, OsId os);

struct KeyReport {
  uint8_t modifier = 0;
  uint8_t usage = 0;
};
inline KeyReport chordToReport(const Chord& c) { return KeyReport{c.mods, c.usage}; }

}  // namespace wc
