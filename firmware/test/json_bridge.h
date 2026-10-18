// 호스트 테스트 전용: JSON(nlohmann/json) ↔ firmware/logic 구조체 변환.
// 시계 펌웨어 본체는 JSON 을 읽지 않는다(tools/gen_keymap_header.py 가 만든 헤더를 쓴다).
#pragma once

#include <stdexcept>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "wc/types.h"

namespace wct {

using json = nlohmann::json;

// 변환 실패(모르는 id, 빠진 필드 등)
struct BridgeError : std::runtime_error {
  using std::runtime_error::runtime_error;
};

// /shared/hid-usage.json 의 keys(이름 → 사용 코드)
struct HidUsage {
  json keys;
  json consumer;
  int usage(const std::string& name) const;          // 모르면 -1
  int consumerUsage(const std::string& name) const;  // 모르면 -1
};

// 매크로 단계 목록 ↔ JSON(TS MacroStep 형식). 매크로 suite 실행기가 쓴다
std::vector<wc::MacroStep> stepsFromJson(const json& j, const HidUsage& hu, const std::string& where);
json stepsToJson(const std::vector<wc::MacroStep>& steps);

HidUsage loadHidUsage(const json& j);
wc::Keymap keymapFromJson(const json& j, const HidUsage& hu);
wc::GestureConfig gestureFromJson(const json& j);

// 설정 → JSON(생성 헤더와 JSON 원본이 같은지 비교할 때 쓴다). 표시용 필드(label, name 등)도 포함
json toJson(const wc::Keymap& km);
json toJson(const wc::GestureConfig& g);

// 상태·알림·HID → JSON(필드 이름은 sim/src/core/types.ts 와 같다)
json toJson(const wc::CoreState& s);
json toJson(const wc::CoreEvent& e);
json toJson(const wc::HidEvent& e);

wc::InputEvent inputFromJson(const json& j);

// 테스트 벡터 init: initState 위에 최상위 필드를 덮어쓴다
void applyInit(wc::CoreState& s, const json& init);

// TS vectors.ts deepMerge 와 같은 규칙
json deepMerge(const json& base, const json& patch);

// TS vectors.ts partialMatch: expected 에 적힌 필드만 비교. 실패 메시지를 errs 에 더한다
void partialMatch(const json& actual, const json& expected, const std::string& path, std::vector<std::string>& errs);

// TS hidEqual: key 는 이름과 수정자 집합, mouseMove 는 dx/dy, mouseButton 은 button/down, consumer 는 usage
bool hidEqual(const wc::HidEvent& actual, const json& expected);

}  // namespace wct
