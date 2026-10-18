// enum ↔ 문자열 변환 구현. 문자열 값은 sim/src/core/types.ts 의 유니온 값과 같다.
#include "wc/names.h"

namespace wc {

namespace {
template <typename E, size_t N>
std::optional<E> lookup(std::string_view s, const char* const (&names)[N]) {
  for (size_t i = 0; i < N; ++i) {
    if (s == names[i]) return static_cast<E>(i);
  }
  return std::nullopt;
}

const char* const kModes[] = {"present", "launch", "meeting", "clock"};  // ModeId 값 순서
const char* const kOs[] = {"win", "mac"};
const char* const kApps[] = {"powerpoint", "slides", "launcher", "zoom", "teams", "meet", "clock"};
const char* const kActions[] = {"next",    "prev",  "blackout", "showStart", "showEnd", "claude",  "kakao",
                                "chrome",  "ppt",   "excel",    "hwp",       "capture", "lock",    "desktop",
                                "display", "mute",  "portal",   "mic",       "camera",  "hand"};
const char* const kButtons[] = {"boot", "pwr"};
const char* const kButtonActions[] = {"down", "up", "short", "long"};
const char* const kSwipes[] = {"left", "right", "up", "down"};
const char* const kSources[] = {"touch", "hold", "swipe", "sheet", "button", "gesture", "air", "system"};
const char* const kEvents[] = {"mode",   "app",    "os",           "lock",          "connection", "sheet",
                               "air",    "show",   "blackout",     "screen",        "sensitivity", "action",
                               "flick",  "flickRejected", "ignored", "estimate", "launchPage",
                               "powerConfirm", "powerOff"};
const char* const kRejects[] = {"tooShort", "tooLong", "noRebound", "notDominant", "notQuiet"};
const char* const kDirs[] = {"out", "in"};
const char* const kPhases[] = {"idle", "above", "rebound", "blocked"};
const char* const kIgnores[] = {"locked", "cooldown"};
const char* const kEstimates[] = {"unknown", "on", "off"};
const char* const kHands[] = {"down", "up"};
const char* const kEstValues[] = {"unknown", "on", "off", "down", "up"};
const char* const kMeetingActions[] = {"mic", "camera", "hand"};
const char* const kMouseButtons[] = {"left", "right", "middle"};
const char* const kAxes[] = {"yaw", "pitch", "roll"};
const char* const kHidTypes[] = {"key", "mouseMove", "mouseButton", "consumer", "macro"};
}  // namespace

const char* name(ModeId v) { return kModes[static_cast<int>(v)]; }
const char* name(OsId v) { return kOs[static_cast<int>(v)]; }
const char* name(AppId v) { return kApps[static_cast<int>(v)]; }
const char* name(ActionId v) { return kActions[static_cast<int>(v)]; }
const char* name(ButtonId v) { return kButtons[static_cast<int>(v)]; }
const char* name(InputSource v) { return kSources[static_cast<int>(v)]; }
const char* name(EventType v) { return kEvents[static_cast<int>(v)]; }
const char* name(FlickReject v) { return kRejects[static_cast<int>(v)]; }
const char* name(FlickDir v) { return kDirs[static_cast<int>(v)]; }
const char* name(FlickPhase v) { return kPhases[static_cast<int>(v)]; }
const char* name(IgnoreReason v) { return kIgnores[static_cast<int>(v)]; }
const char* name(Estimate v) { return kEstimates[static_cast<int>(v)]; }
const char* name(Hand v) { return kHands[static_cast<int>(v)]; }
const char* name(EstimateValue v) { return kEstValues[static_cast<int>(v)]; }
const char* name(MeetingActionId v) { return kMeetingActions[static_cast<int>(v)]; }
const char* name(MouseButton v) { return kMouseButtons[static_cast<int>(v)]; }
const char* name(LogicalAxis v) { return kAxes[static_cast<int>(v)]; }
const char* name(HidType v) { return kHidTypes[static_cast<int>(v)]; }

std::optional<ModeId> parseMode(std::string_view s) { return lookup<ModeId>(s, kModes); }
std::optional<OsId> parseOs(std::string_view s) { return lookup<OsId>(s, kOs); }
std::optional<AppId> parseApp(std::string_view s) { return lookup<AppId>(s, kApps); }
std::optional<ActionId> parseAction(std::string_view s) { return lookup<ActionId>(s, kActions); }
std::optional<ButtonId> parseButton(std::string_view s) { return lookup<ButtonId>(s, kButtons); }
std::optional<ButtonAction> parseButtonAction(std::string_view s) { return lookup<ButtonAction>(s, kButtonActions); }
std::optional<SwipeDir> parseSwipe(std::string_view s) { return lookup<SwipeDir>(s, kSwipes); }
std::optional<LogicalAxis> parseLogicalAxis(std::string_view s) { return lookup<LogicalAxis>(s, kAxes); }
std::optional<MouseButton> parseMouseButton(std::string_view s) { return lookup<MouseButton>(s, kMouseButtons); }
std::optional<Estimate> parseEstimate(std::string_view s) { return lookup<Estimate>(s, kEstimates); }
std::optional<Hand> parseHand(std::string_view s) { return lookup<Hand>(s, kHands); }

uint8_t parseModBit(std::string_view s) {
  if (s == "ctrl") return MOD_CTRL;
  if (s == "shift") return MOD_SHIFT;
  if (s == "alt") return MOD_ALT;
  if (s == "gui") return MOD_GUI;
  return 0;
}

int parseSensorAxis(std::string_view s) {
  if (s == "gx") return 0;
  if (s == "gy") return 1;
  if (s == "gz") return 2;
  return -1;
}

}  // namespace wc
