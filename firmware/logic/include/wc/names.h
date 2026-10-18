// enum ↔ 문자열(JSON·TS 와 같은 id) 변환. 테스트 실행기와 로그 출력이 쓴다.
#pragma once

#include <optional>
#include <string_view>

#include "wc/types.h"

namespace wc {

const char* name(ModeId v);
const char* name(OsId v);
const char* name(AppId v);
const char* name(ActionId v);
const char* name(ButtonId v);
const char* name(InputSource v);
const char* name(EventType v);
const char* name(FlickReject v);
const char* name(FlickDir v);
const char* name(FlickPhase v);
const char* name(IgnoreReason v);
const char* name(Estimate v);
const char* name(Hand v);
const char* name(EstimateValue v);
const char* name(MeetingActionId v);
const char* name(MouseButton v);
const char* name(LogicalAxis v);
const char* name(HidType v);

std::optional<ModeId> parseMode(std::string_view s);
std::optional<OsId> parseOs(std::string_view s);
std::optional<AppId> parseApp(std::string_view s);
std::optional<ActionId> parseAction(std::string_view s);
std::optional<ButtonId> parseButton(std::string_view s);
std::optional<ButtonAction> parseButtonAction(std::string_view s);
std::optional<SwipeDir> parseSwipe(std::string_view s);
std::optional<LogicalAxis> parseLogicalAxis(std::string_view s);
std::optional<MouseButton> parseMouseButton(std::string_view s);
std::optional<Estimate> parseEstimate(std::string_view s);
std::optional<Hand> parseHand(std::string_view s);
// 수정자 이름 → 비트(ctrl/shift/alt/gui). 모르면 0
uint8_t parseModBit(std::string_view s);
// 센서 축 이름(gx/gy/gz) → 0..2, 모르면 -1
int parseSensorAxis(std::string_view s);

}  // namespace wc
