// 호스트 테스트 전용 JSON 변환 구현.
#include "json_bridge.h"

#include <cmath>
#include <sstream>
#include <vector>

#include "wc/names.h"

namespace wct {

using namespace wc;

namespace {

template <typename T>
T need(std::optional<T> v, const std::string& what, const json& src) {
  if (!v) throw BridgeError("알 수 없는 " + what + ": " + src.dump());
  return *v;
}

ModeId modeOf(const json& j) { return need(parseMode(j.get<std::string>()), "모드", j); }
OsId osOf(const json& j) { return need(parseOs(j.get<std::string>()), "OS", j); }
AppId appOf(const json& j) { return need(parseApp(j.get<std::string>()), "앱", j); }
ActionId actionOf(const json& j) { return need(parseAction(j.get<std::string>()), "동작", j); }

json optNum(const std::optional<double>& v) { return v.has_value() ? json(*v) : json(nullptr); }

std::optional<double> numOrNull(const json& j) {
  if (j.is_null()) return std::nullopt;
  return j.get<double>();
}

std::optional<Chord> chordFromJson(const json& j, const HidUsage& hu, const std::string& where) {
  if (j.is_null()) return std::nullopt;
  Chord c;
  c.key = j.at("key").get<std::string>();
  const int u = hu.usage(c.key);
  if (u < 0) throw BridgeError(where + ": hid-usage.json 에 없는 키 이름 " + c.key);
  c.usage = static_cast<uint8_t>(u);
  for (const auto& m : j.at("mods")) {
    const uint8_t bit = parseModBit(m.get<std::string>());
    if (!bit) throw BridgeError(where + ": 알 수 없는 수정자 " + m.dump());
    c.mods |= bit;
  }
  return c;
}

std::optional<Binding> bindingFromJson(const json& j, const HidUsage& hu, const std::string& where) {
  if (j.is_null()) return std::nullopt;
  Binding b;
  if (j.contains("steps")) {
    b.macro = true;
    b.steps = stepsFromJson(j.at("steps"), hu, where);
  } else {
    b.chord = *chordFromJson(j, hu, where);
  }
  return b;
}

json modsToJson(uint8_t mods) {
  json a = json::array();
  if (mods & MOD_CTRL) a.push_back("ctrl");
  if (mods & MOD_SHIFT) a.push_back("shift");
  if (mods & MOD_ALT) a.push_back("alt");
  if (mods & MOD_GUI) a.push_back("gui");
  return a;
}

json chordToJson(const std::optional<Chord>& c) {
  if (!c) return nullptr;
  return json{{"mods", modsToJson(c->mods)}, {"key", c->key}, {"usage", c->usage}};
}

json bindingToJson(const std::optional<Binding>& b) {
  if (!b) return nullptr;
  if (!b->macro) return chordToJson(b->chord);
  return json{{"steps", stepsToJson(b->steps)}};
}

const char* const kAxisKeys[3] = {"yaw", "pitch", "roll"};
const char* const kSensorAxes[3] = {"gx", "gy", "gz"};
const char* const kMeetingKeys[3] = {"zoom", "teams", "meet"};

json meetingToJson(const MeetingEstimate& m) {
  return json{{"mic", name(m.mic)}, {"camera", name(m.camera)}, {"hand", name(m.hand)}};
}

MeetingEstimate meetingFromJson(const json& j) {
  MeetingEstimate m;
  m.mic = need(parseEstimate(j.at("mic").get<std::string>()), "추정값", j);
  m.camera = need(parseEstimate(j.at("camera").get<std::string>()), "추정값", j);
  m.hand = need(parseHand(j.at("hand").get<std::string>()), "손 상태", j);
  return m;
}

json airAxisToJson(const AirAxisState& a) { return json{{"moving", a.moving}, {"ema", a.ema}, {"resid", a.resid}}; }

}  // namespace

int HidUsage::usage(const std::string& n) const {
  if (!keys.contains(n)) return -1;
  return static_cast<int>(std::stoul(keys.at(n).get<std::string>(), nullptr, 16));
}

int HidUsage::consumerUsage(const std::string& n) const {
  if (!consumer.contains(n)) return -1;
  return static_cast<int>(std::stoul(consumer.at(n).get<std::string>(), nullptr, 16));
}

HidUsage loadHidUsage(const json& j) {
  HidUsage h;
  h.keys = j.at("keys");
  h.consumer = j.at("consumer");
  return h;
}

std::vector<MacroStep> stepsFromJson(const json& j, const HidUsage& hu, const std::string& where) {
  std::vector<MacroStep> out;
  for (const auto& st : j) {
    MacroStep m;
    if (st.contains("chord")) {
      m.kind = MacroStepKind::Chord;
      m.chord = *chordFromJson(st.at("chord"), hu, where + "/chord");
    } else if (st.contains("wait")) {
      m.kind = MacroStepKind::Wait;
      m.waitMs = st.at("wait").get<int>();
    } else if (st.contains("text")) {
      m.kind = MacroStepKind::Text;
      m.text = st.at("text").get<std::string>();
    } else if (st.contains("consumer")) {
      m.kind = MacroStepKind::Consumer;
      m.consumerName = st.at("consumer").get<std::string>();
      const int u = hu.consumerUsage(m.consumerName);
      if (u < 0) throw BridgeError(where + ": hid-usage.json 에 없는 소비자 키 " + m.consumerName);
      m.consumerUsage = static_cast<uint16_t>(u);
    } else {
      throw BridgeError(where + ": 알 수 없는 매크로 단계 " + st.dump());
    }
    out.push_back(m);
  }
  return out;
}

json stepsToJson(const std::vector<MacroStep>& steps) {
  json a = json::array();
  for (const auto& st : steps) {
    switch (st.kind) {
      case MacroStepKind::Chord: a.push_back({{"chord", {{"mods", modsToJson(st.chord.mods)}, {"key", st.chord.key}}}}); break;
      case MacroStepKind::Wait: a.push_back({{"wait", st.waitMs}}); break;
      case MacroStepKind::Text: a.push_back({{"text", st.text}}); break;
      case MacroStepKind::Consumer: a.push_back({{"consumer", st.consumerName}}); break;
    }
  }
  return a;
}

// ---------------------------------------------------------------------------
// 설정 읽기
// ---------------------------------------------------------------------------

Keymap keymapFromJson(const json& j, const HidUsage& hu) {
  Keymap km;
  km.version = j.at("version").get<int>();
  const json& st = j.at("settings");
  km.settings.deviceName = st.at("deviceName").get<std::string>();
  km.settings.deviceNameMaxBytes = st.value("deviceNameMaxBytes", 29);
  km.settings.os = osOf(st.at("os"));
  km.settings.mode = modeOf(st.at("mode"));
  km.settings.sensitivity = st.at("sensitivity").get<int>();
  km.settings.primaryButton = need(parseButton(st.at("primaryButton").get<std::string>()), "버튼", st);
  for (const auto& m : j.at("modeOrder")) km.modeOrder.push_back(modeOf(m));
  for (const auto& [modeName, mdef] : j.at("modes").items()) {
    const ModeId mode = need(parseMode(modeName), "모드", json(modeName));
    KeymapMode& m = km.modes[idx(mode)];
    m.name = mdef.at("name").get<std::string>();
    m.defaultApp = appOf(mdef.at("defaultApp"));
    for (const auto& a : mdef.at("appOrder")) m.appOrder.push_back(appOf(a));
    for (const auto& [appName, adef] : mdef.at("apps").items()) {
      KeymapApp app;
      app.id = need(parseApp(appName), "앱", json(appName));
      app.name = adef.at("name").get<std::string>();
      for (const auto& ad : adef.at("actions")) {
        KeymapAction a;
        a.id = actionOf(ad.at("id"));
        a.label = ad.value("label", std::string());
        const std::string where = modeName + "/" + appName + "/" + ad.at("id").get<std::string>();
        a.win = bindingFromJson(ad.at("win"), hu, where + "/win");
        a.mac = bindingFromJson(ad.at("mac"), hu, where + "/mac");
        if (ad.contains("winAlt")) a.winAlt = bindingFromJson(ad.at("winAlt"), hu, where + "/winAlt");
        if (ad.contains("macAlt")) a.macAlt = bindingFromJson(ad.at("macAlt"), hu, where + "/macAlt");
        if (ad.contains("url")) {
          a.hasUrl = true;
          a.url = ad.at("url").get<std::string>();
        }
        app.actions.push_back(a);
      }
      m.apps.push_back(app);
    }
  }
  return km;
}

GestureConfig gestureFromJson(const json& j) {
  GestureConfig g;
  g.version = j.at("version").get<int>();
  const json& im = j.at("imu");
  g.imu.sampleRateHz = im.at("sampleRateHz").get<double>();
  g.imu.gyroRangeDps = im.at("gyroRangeDps").get<double>();
  for (int i = 0; i < 3; ++i) {
    const int sa = parseSensorAxis(im.at("axisMap").at(kAxisKeys[i]).get<std::string>());
    if (sa < 0) throw BridgeError("알 수 없는 센서 축: " + im.at("axisMap").dump());
    g.imu.axisMap[static_cast<size_t>(i)] = sa;
    g.imu.axisSign[static_cast<size_t>(i)] = im.at("axisSign").at(kAxisKeys[i]).get<int>();
  }
  const json& bc = im.at("biasCalib");
  g.imu.biasCalib.enabled = bc.at("enabled").get<bool>();
  g.imu.biasCalib.stillThresholdDps = bc.at("stillThresholdDps").get<double>();
  g.imu.biasCalib.stillMs = bc.at("stillMs").get<double>();
  g.imu.biasCalib.trackTauMs = bc.at("trackTauMs").get<double>();

  const json& am = j.at("airMouse");
  g.airMouse.enabled = am.at("enabled").get<bool>();
  g.airMouse.holdToStartMs = am.at("holdToStartMs").get<double>();
  g.airMouse.startSuppressMs = am.at("startSuppressMs").get<double>();
  g.airMouse.deadzoneDps.enter = am.at("deadzoneDps").at("enter").get<double>();
  g.airMouse.deadzoneDps.exit = am.at("deadzoneDps").at("exit").get<double>();
  g.airMouse.lowpassTauMs = am.at("lowpassTauMs").get<double>();
  g.airMouse.curve.exponent = am.at("curve").at("exponent").get<double>();
  g.airMouse.curve.maxPxPerReport = am.at("curve").at("maxPxPerReport").get<double>();
  g.airMouse.sensitivity.clear();
  for (const auto& s : am.at("sensitivity")) {
    g.airMouse.sensitivity.push_back(SensitivityLevel{s.at("name").get<std::string>(), s.at("gain").get<double>()});
  }
  g.airMouse.invertY = am.at("invertY").get<bool>();

  const json& f = j.at("flick");
  g.flick.enabled = f.at("enabled").get<bool>();
  g.flick.detector = f.at("detector").get<std::string>() == "gyro" ? GestureConfig::Flick::Detector::Gyro
                                                                    : GestureConfig::Flick::Detector::Accel;
  g.flick.accel.lpfTauMs = f.at("accel").at("lpfTauMs").get<double>();
  g.flick.accel.peakG = f.at("accel").at("peakG").get<double>();
  g.flick.accel.maxAboveMs = f.at("accel").at("maxAboveMs").get<double>();
  g.flick.accel.quietWindowMs = f.at("accel").at("quietWindowMs").get<double>();
  g.flick.accel.quietGuardMs = f.at("accel").at("quietGuardMs").get<double>();
  g.flick.accel.quietMaxRmsG = f.at("accel").at("quietMaxRmsG").get<double>();
  g.flick.axis = need(parseLogicalAxis(f.at("axis").get<std::string>()), "논리 축", f);
  g.flick.prefilterTauMs = f.at("prefilterTauMs").get<double>();
  g.flick.peakThresholdDps = f.at("peakThresholdDps").get<double>();
  g.flick.adaptive.enabled = f.at("adaptive").at("enabled").get<bool>();
  g.flick.adaptive.windowMs = f.at("adaptive").at("windowMs").get<double>();
  g.flick.adaptive.rmsMultiplier = f.at("adaptive").at("rmsMultiplier").get<double>();
  g.flick.axisDominanceRatio = f.at("axisDominanceRatio").get<double>();
  g.flick.minAboveMs = f.at("minAboveMs").get<double>();
  g.flick.maxAboveMs = f.at("maxAboveMs").get<double>();
  g.flick.rebound.required = f.at("rebound").at("required").get<bool>();
  g.flick.rebound.windowMs = f.at("rebound").at("windowMs").get<double>();
  g.flick.rebound.minRatio = f.at("rebound").at("minRatio").get<double>();
  g.flick.rebound.minDps = f.at("rebound").at("minDps").get<double>();
  g.flick.quietBefore.windowMs = f.at("quietBefore").at("windowMs").get<double>();
  g.flick.quietBefore.guardMs = f.at("quietBefore").at("guardMs").get<double>();
  g.flick.quietBefore.maxRmsDps = f.at("quietBefore").at("maxRmsDps").get<double>();
  g.flick.cooldownMs = f.at("cooldownMs").get<double>();
  g.flick.outwardSign = f.at("outwardSign").get<int>();
  {
    const std::string ia = f.at("inAction").get<std::string>();
    using IA = GestureConfig::Flick::InAction;
    g.flick.inAction = ia == "prev" ? IA::Prev : ia == "none" ? IA::None : IA::Next;
  }

  const json& t = j.at("touch");
  g.touch.tapMaxMovePx = t.at("tapMaxMovePx").get<double>();
  g.touch.holdMs = t.at("holdMs").get<double>();
  g.touch.blackoutHoldMs = t.at("blackoutHoldMs").get<double>();
  g.touch.swipeMinPx = t.at("swipeMinPx").get<double>();
  g.touch.swipeMaxOffAxisPx = t.at("swipeMaxOffAxisPx").get<double>();
  g.touch.swipeAxisRatio = t.at("swipeAxisRatio").get<double>();
  g.touch.swipeMaxMs = t.at("swipeMaxMs").get<double>();
  g.touch.showSwipeMinPx = t.at("showSwipeMinPx").get<double>();
  g.touch.showSwipeMaxOffAxisPx = t.at("showSwipeMaxOffAxisPx").get<double>();
  g.touch.sheetPullMinPx = t.at("sheetPullMinPx").get<double>();
  g.touch.pullMaxOffAxisPx = t.at("pullMaxOffAxisPx").get<double>();
  g.touch.pullMaxMs = t.at("pullMaxMs").get<double>();
  g.touch.topEdgePx = t.at("topEdgePx").get<double>();
  g.touch.settingsCloseMinPx = t.at("settingsCloseMinPx").get<double>();
  g.touch.settingsCloseAxisRatio = t.at("settingsCloseAxisRatio").get<double>();
  g.button.longPressMs = j.at("button").at("longPressMs").get<double>();
  g.button.powerOffHoldMs = j.at("button").at("powerOffHoldMs").get<double>();
  g.button.powerConfirmTimeoutMs = j.at("button").at("powerConfirmTimeoutMs").get<double>();
  const json& tm = j.at("timing");
  g.timing.sheetAutoCloseMs = tm.at("sheetAutoCloseMs").get<double>();
  g.timing.meetingEstimateResetMs = tm.at("meetingEstimateResetMs").get<double>();
  g.timing.settingsIdleCloseMs = tm.at("settingsIdleCloseMs").get<double>();
  return g;
}

// ---------------------------------------------------------------------------
// 설정 → JSON (비교용)
// ---------------------------------------------------------------------------

json toJson(const Keymap& km) {
  json j;
  j["version"] = km.version;
  j["settings"] = {{"deviceName", km.settings.deviceName},
                   {"deviceNameMaxBytes", km.settings.deviceNameMaxBytes},
                   {"os", name(km.settings.os)},
                   {"mode", name(km.settings.mode)},
                   {"sensitivity", km.settings.sensitivity},
                   {"primaryButton", name(km.settings.primaryButton)}};
  json order = json::array();
  for (auto m : km.modeOrder) order.push_back(name(m));
  j["modeOrder"] = order;
  json modes = json::object();
  for (int i = 0; i < kModeCount; ++i) {
    const KeymapMode& m = km.modes[static_cast<size_t>(i)];
    json mj;
    mj["name"] = m.name;
    mj["defaultApp"] = name(m.defaultApp);
    json ao = json::array();
    for (auto a : m.appOrder) ao.push_back(name(a));
    mj["appOrder"] = ao;
    json apps = json::object();
    for (const auto& a : m.apps) {
      json acts = json::array();
      for (const auto& x : a.actions) {
        acts.push_back({{"id", name(x.id)},
                        {"label", x.label},
                        {"win", bindingToJson(x.win)},
                        {"mac", bindingToJson(x.mac)},
                        {"winAlt", bindingToJson(x.winAlt)},
                        {"macAlt", bindingToJson(x.macAlt)},
                        {"url", x.url}});
      }
      apps[name(a.id)] = {{"name", a.name}, {"actions", acts}};
    }
    mj["apps"] = apps;
    modes[name(static_cast<ModeId>(i))] = mj;
  }
  j["modes"] = modes;
  return j;
}

json toJson(const GestureConfig& g) {
  json j;
  j["version"] = g.version;
  json axisMap, axisSign;
  for (int i = 0; i < 3; ++i) {
    axisMap[kAxisKeys[i]] = kSensorAxes[g.imu.axisMap[static_cast<size_t>(i)]];
    axisSign[kAxisKeys[i]] = g.imu.axisSign[static_cast<size_t>(i)];
  }
  j["imu"] = {{"sampleRateHz", g.imu.sampleRateHz},
              {"gyroRangeDps", g.imu.gyroRangeDps},
              {"axisMap", axisMap},
              {"axisSign", axisSign},
              {"biasCalib",
               {{"enabled", g.imu.biasCalib.enabled},
                {"stillThresholdDps", g.imu.biasCalib.stillThresholdDps},
                {"stillMs", g.imu.biasCalib.stillMs},
                {"trackTauMs", g.imu.biasCalib.trackTauMs}}}};
  json sens = json::array();
  for (const auto& s : g.airMouse.sensitivity) sens.push_back({{"name", s.name}, {"gain", s.gain}});
  j["airMouse"] = {{"enabled", g.airMouse.enabled},
                   {"holdToStartMs", g.airMouse.holdToStartMs},
                   {"startSuppressMs", g.airMouse.startSuppressMs},
                   {"deadzoneDps", {{"enter", g.airMouse.deadzoneDps.enter}, {"exit", g.airMouse.deadzoneDps.exit}}},
                   {"lowpassTauMs", g.airMouse.lowpassTauMs},
                   {"curve", {{"exponent", g.airMouse.curve.exponent}, {"maxPxPerReport", g.airMouse.curve.maxPxPerReport}}},
                   {"sensitivity", sens},
                   {"invertY", g.airMouse.invertY}};
  const auto& f = g.flick;
  j["flick"] = {{"enabled", f.enabled},
                {"detector", f.detector == GestureConfig::Flick::Detector::Gyro ? "gyro" : "accel"},
                {"accel", {{"lpfTauMs", f.accel.lpfTauMs}, {"peakG", f.accel.peakG}, {"maxAboveMs", f.accel.maxAboveMs}, {"quietWindowMs", f.accel.quietWindowMs}, {"quietGuardMs", f.accel.quietGuardMs}, {"quietMaxRmsG", f.accel.quietMaxRmsG}}},
                {"axis", name(f.axis)},
                {"prefilterTauMs", f.prefilterTauMs},
                {"peakThresholdDps", f.peakThresholdDps},
                {"adaptive", {{"enabled", f.adaptive.enabled}, {"windowMs", f.adaptive.windowMs}, {"rmsMultiplier", f.adaptive.rmsMultiplier}}},
                {"axisDominanceRatio", f.axisDominanceRatio},
                {"minAboveMs", f.minAboveMs},
                {"maxAboveMs", f.maxAboveMs},
                {"rebound", {{"required", f.rebound.required}, {"windowMs", f.rebound.windowMs}, {"minRatio", f.rebound.minRatio}, {"minDps", f.rebound.minDps}}},
                {"quietBefore", {{"windowMs", f.quietBefore.windowMs}, {"guardMs", f.quietBefore.guardMs}, {"maxRmsDps", f.quietBefore.maxRmsDps}}},
                {"cooldownMs", f.cooldownMs},
                {"outwardSign", f.outwardSign},
                {"inAction", f.inAction == GestureConfig::Flick::InAction::Prev   ? "prev"
                             : f.inAction == GestureConfig::Flick::InAction::None ? "none"
                                                                                  : "next"}};
  j["touch"] = {{"tapMaxMovePx", g.touch.tapMaxMovePx},
                {"holdMs", g.touch.holdMs},
                {"blackoutHoldMs", g.touch.blackoutHoldMs},
                {"swipeMinPx", g.touch.swipeMinPx},
                {"swipeMaxOffAxisPx", g.touch.swipeMaxOffAxisPx},
                {"swipeAxisRatio", g.touch.swipeAxisRatio},
                {"swipeMaxMs", g.touch.swipeMaxMs},
                {"showSwipeMinPx", g.touch.showSwipeMinPx},
                {"showSwipeMaxOffAxisPx", g.touch.showSwipeMaxOffAxisPx},
                {"sheetPullMinPx", g.touch.sheetPullMinPx},
                {"pullMaxOffAxisPx", g.touch.pullMaxOffAxisPx},
                {"pullMaxMs", g.touch.pullMaxMs},
                {"topEdgePx", g.touch.topEdgePx},
                {"settingsCloseMinPx", g.touch.settingsCloseMinPx},
                {"settingsCloseAxisRatio", g.touch.settingsCloseAxisRatio}};
  j["button"] = {{"longPressMs", g.button.longPressMs},
                 {"powerOffHoldMs", g.button.powerOffHoldMs},
                 {"powerConfirmTimeoutMs", g.button.powerConfirmTimeoutMs}};
  j["timing"] = {{"sheetAutoCloseMs", g.timing.sheetAutoCloseMs},
                 {"meetingEstimateResetMs", g.timing.meetingEstimateResetMs},
                 {"settingsIdleCloseMs", g.timing.settingsIdleCloseMs}};
  return j;
}

// ---------------------------------------------------------------------------
// 상태·알림·HID → JSON
// ---------------------------------------------------------------------------

json toJson(const CoreState& s) {
  json j;
  j["mode"] = name(s.mode);
  j["prevMode"] = name(s.prevMode);
  j["os"] = name(s.os);
  j["apps"] = {{"clock", name(s.apps.clock)},
               {"present", name(s.apps.present)},
               {"launch", name(s.apps.launch)},
               {"meeting", name(s.apps.meeting)}};
  j["launchPage"] = s.launchPage;
  j["sensitivity"] = s.sensitivity;
  j["connected"] = s.connected;
  j["everConnected"] = s.everConnected;
  j["disconnectedAt"] = optNum(s.disconnectedAt);
  j["locked"] = s.locked;
  j["screenOn"] = s.screenOn;
  if (s.powerConfirmSince) j["powerConfirm"] = {{"since", *s.powerConfirmSince}};
  else j["powerConfirm"] = nullptr;
  j["sheet"] = {{"open", s.sheet.open}, {"lastActivity", s.sheet.lastActivity}};
  j["show"] = {{"running", s.show.running}, {"startedAt", optNum(s.show.startedAt)}, {"blackout", s.show.blackout}};
  json meeting = json::object();
  for (int i = 0; i < kMeetingAppCount; ++i) meeting[kMeetingKeys[i]] = meetingToJson(s.meeting[static_cast<size_t>(i)]);
  j["meeting"] = meeting;
  if (s.button) {
    j["button"] = {{"id", name(s.button->id)},
                   {"downAt", s.button->downAt},
                   {"air", s.button->air},
                   {"moved", s.button->moved},
                   {"longFired", s.button->longFired}};
  } else {
    j["button"] = nullptr;
  }
  j["bias"] = {{"bias", s.bias.bias}, {"stillSince", optNum(s.bias.stillSince)}, {"lastT", optNum(s.bias.lastT)}};
  j["air"] = {{"active", s.air.active},
              {"since", s.air.since},
              {"lastT", optNum(s.air.lastT)},
              {"x", airAxisToJson(s.air.x)},
              {"y", airAxisToJson(s.air.y)}};
  json hist = json::array();
  for (const auto& h : s.flick.hist) hist.push_back(json::array({h.first, h.second}));
  j["flick"] = {{"filt", s.flick.filt ? json(*s.flick.filt) : json(nullptr)},
                {"lastT", optNum(s.flick.lastT)},
                {"hist", hist},
                {"phase", name(s.flick.phase)},
                {"sign", s.flick.sign},
                {"threshold", s.flick.threshold},
                {"aboveStart", s.flick.aboveStart},
                {"peak", s.flick.peak},
                {"peakT", s.flick.peakT},
                {"reboundNeed", s.flick.reboundNeed},
                {"cooldownUntil", s.flick.cooldownUntil}};
  return j;
}

json toJson(const CoreEvent& e) {
  json j;
  j["t"] = name(e.t);
  switch (e.t) {
    case EventType::Mode: j["mode"] = name(e.mode); break;
    case EventType::App: j["mode"] = name(e.mode); j["app"] = name(e.app); break;
    case EventType::Os: j["os"] = name(e.os); break;
    case EventType::Lock: j["locked"] = e.value; break;
    case EventType::Connection: j["connected"] = e.value; break;
    case EventType::Sheet: j["open"] = e.value; break;
    case EventType::Air: j["active"] = e.value; break;
    case EventType::Show: j["running"] = e.value; break;
    case EventType::Blackout: j["on"] = e.value; break;
    case EventType::Screen: j["on"] = e.value; break;
    case EventType::Sensitivity: j["level"] = e.level; break;
    case EventType::LaunchPage: j["page"] = e.level; break;
    case EventType::Action:
      j["action"] = name(e.action);
      j["source"] = name(e.source);
      j["sent"] = e.value;
      break;
    case EventType::PowerConfirm: j["open"] = e.value; break;
    case EventType::PowerOff: break;
    case EventType::Flick:
      j["dir"] = name(e.dir);
      if (e.peakG >= 0) j["peakG"] = e.peakG;
      break;
    case EventType::FlickRejected:
      j["reason"] = name(e.reject);
      if (e.peakG >= 0) j["peakG"] = e.peakG;
      break;
    case EventType::Ignored:
      j["source"] = name(e.source);
      j["reason"] = name(e.ignore);
      break;
    case EventType::Estimate:
      j["app"] = name(e.app);
      j["target"] = name(e.target);
      j["value"] = name(e.estimate);
      j["synced"] = e.value;
      break;
  }
  return j;
}

json toJson(const HidEvent& e) {
  switch (e.t) {
    case HidType::Key: return json{{"t", "key"}, {"mods", modsToJson(e.mods)}, {"key", e.key}};
    case HidType::MouseMove: return json{{"t", "mouseMove"}, {"dx", e.dx}, {"dy", e.dy}};
    case HidType::MouseButton: return json{{"t", "mouseButton"}, {"button", name(e.button)}, {"down", e.down}};
    case HidType::Consumer: return json{{"t", "consumer"}, {"usage", e.consumer}};
    case HidType::Macro: return json{{"t", "macro"}, {"steps", stepsToJson(e.steps)}};
  }
  return json();
}

// ---------------------------------------------------------------------------
// 입력
// ---------------------------------------------------------------------------

InputEvent inputFromJson(const json& j) {
  const std::string t = j.at("t").get<std::string>();
  InputEvent e;
  if (t == "tap" || t == "longPress") {
    e = t == "tap" ? InputEvent::tap(j.at("x").get<double>(), j.at("y").get<double>())
                   : InputEvent::longPress(j.at("x").get<double>(), j.at("y").get<double>());
  } else if (t == "swipe") {
    e = InputEvent::swipe(need(parseSwipe(j.at("dir").get<std::string>()), "스와이프 방향", j));
  } else if (t == "button") {
    e = InputEvent::button(need(parseButton(j.at("id").get<std::string>()), "버튼", j),
                           need(parseButtonAction(j.at("action").get<std::string>()), "버튼 동작", j));
  } else if (t == "imu") {
    const json& s = j.at("sample");
    e = InputEvent::imu(ImuSample{s.at("t").get<double>(), s.at("gx").get<double>(), s.at("gy").get<double>(),
                                  s.at("gz").get<double>()});
  } else if (t == "tick") {
    e = InputEvent::tick();
  } else if (t == "connection") {
    e = InputEvent::connection(j.at("connected").get<bool>());
  } else if (t == "setMode") {
    e.t = InputType::SetMode;
    e.mode = modeOf(j.at("mode"));
  } else if (t == "setApp") {
    e.t = InputType::SetApp;
    e.mode = modeOf(j.at("mode"));
    e.app = appOf(j.at("app"));
  } else if (t == "setOs") {
    e.t = InputType::SetOs;
    e.os = osOf(j.at("os"));
  } else if (t == "setSensitivity") {
    e.t = InputType::SetSensitivity;
    e.level = j.at("level").get<double>();
  } else if (t == "setLocked") {
    e.t = InputType::SetLocked;
    e.flag = j.at("locked").get<bool>();
  } else {
    throw BridgeError("알 수 없는 입력: " + j.dump());
  }
  return e;
}

// ---------------------------------------------------------------------------
// init 덮어쓰기
// ---------------------------------------------------------------------------

void applyInit(CoreState& s, const json& init) {
  for (const auto& [k, v] : init.items()) {
    if (k == "mode") {
      s.mode = modeOf(v);
    } else if (k == "prevMode") {
      s.prevMode = modeOf(v);
    } else if (k == "os") {
      s.os = osOf(v);
    } else if (k == "apps") {
      if (v.contains("present")) s.apps.present = appOf(v.at("present"));
      if (v.contains("launch")) s.apps.launch = appOf(v.at("launch"));
      if (v.contains("meeting")) s.apps.meeting = appOf(v.at("meeting"));
    } else if (k == "launchPage") {
      s.launchPage = v.get<int>();
    } else if (k == "sensitivity") {
      s.sensitivity = v.get<int>();
    } else if (k == "connected") {
      s.connected = v.get<bool>();
    } else if (k == "everConnected") {
      s.everConnected = v.get<bool>();
    } else if (k == "disconnectedAt") {
      s.disconnectedAt = numOrNull(v);
    } else if (k == "locked") {
      s.locked = v.get<bool>();
    } else if (k == "powerConfirm") {
      s.powerConfirmSince = v.is_null() ? std::nullopt : std::optional<double>(v.at("since").get<double>());
    } else if (k == "screenOn") {
      s.screenOn = v.get<bool>();
    } else if (k == "sheet") {
      s.sheet.open = v.at("open").get<bool>();
      s.sheet.lastActivity = v.value("lastActivity", 0.0);
    } else if (k == "show") {
      s.show.running = v.at("running").get<bool>();
      s.show.startedAt = v.contains("startedAt") ? numOrNull(v.at("startedAt")) : std::nullopt;
      s.show.blackout = v.value("blackout", false);
    } else if (k == "meeting") {
      for (int i = 0; i < kMeetingAppCount; ++i) {
        s.meeting[static_cast<size_t>(i)] =
            v.contains(kMeetingKeys[i]) ? meetingFromJson(v.at(kMeetingKeys[i])) : MeetingEstimate{};
      }
    } else if (k == "button") {
      if (v.is_null()) {
        s.button.reset();
      } else {
        ButtonHold b;
        b.id = need(parseButton(v.at("id").get<std::string>()), "버튼", v);
        b.downAt = v.at("downAt").get<double>();
        b.air = v.value("air", false);
        b.moved = v.value("moved", false);
        b.longFired = v.value("longFired", false);
        s.button = b;
      }
    } else {
      throw BridgeError("C++ 실행기가 아직 지원하지 않는 init 필드: " + k);
    }
  }
}

// ---------------------------------------------------------------------------
// 비교 도우미
// ---------------------------------------------------------------------------

json deepMerge(const json& base, const json& patch) {
  if (patch.is_null() || !patch.is_object()) return patch;
  json out = base.is_object() ? base : json::object();
  for (const auto& [k, v] : patch.items()) {
    if (out.contains(k) && out[k].is_object()) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

void partialMatch(const json& actual, const json& expected, const std::string& path, std::vector<std::string>& errs) {
  const std::string where = path.empty() ? "(값)" : path;
  if (expected.is_object()) {
    if (!actual.is_object()) {
      errs.push_back(where + ": 객체가 아님 (" + actual.dump() + ")");
      return;
    }
    for (const auto& [k, v] : expected.items()) {
      const std::string sub = path.empty() ? k : path + "." + k;
      if (!actual.contains(k)) {
        errs.push_back(sub + ": 필드 없음(기대 " + v.dump() + ")");
        continue;
      }
      partialMatch(actual.at(k), v, sub, errs);
    }
    return;
  }
  if (expected.is_array()) {
    if (!actual.is_array()) {
      errs.push_back(where + ": 배열이 아님 (" + actual.dump() + ")");
      return;
    }
    if (actual.size() != expected.size()) {
      errs.push_back(where + ": 길이 기대 " + std::to_string(expected.size()) + ", 실제 " + std::to_string(actual.size()));
      return;
    }
    for (size_t i = 0; i < expected.size(); ++i) {
      partialMatch(actual[i], expected[i], path + "[" + std::to_string(i) + "]", errs);
    }
    return;
  }
  bool ok;
  if (expected.is_number()) {
    ok = actual.is_number() && actual.get<double>() == expected.get<double>();
  } else if (expected.is_null()) {
    ok = actual.is_null();
  } else {
    ok = actual == expected;
  }
  if (!ok) errs.push_back(where + ": 기대 " + expected.dump() + ", 실제 " + actual.dump());
}

bool hidEqual(const HidEvent& a, const json& e) {
  const std::string t = e.at("t").get<std::string>();
  if (t != name(a.t)) return false;
  switch (a.t) {
    case HidType::Key: {
      uint8_t mods = 0;
      for (const auto& m : e.at("mods")) mods |= parseModBit(m.get<std::string>());
      size_t bits = 0;
      for (uint8_t m = a.mods; m; m &= static_cast<uint8_t>(m - 1)) ++bits;
      return a.key == e.at("key").get<std::string>() && a.mods == mods && bits == e.at("mods").size();
    }
    case HidType::MouseMove:
      return a.dx == e.at("dx").get<int>() && a.dy == e.at("dy").get<int>();
    case HidType::MouseButton:
      return name(a.button) == e.at("button").get<std::string>() && a.down == e.at("down").get<bool>();
    case HidType::Consumer:
      return a.consumer == e.at("usage").get<int>();
    case HidType::Macro: {
      // 단계별 비교. chord 의 수정자는 집합으로(순서 무관)
      const json& es = e.at("steps");
      if (es.size() != a.steps.size()) return false;
      for (size_t i = 0; i < a.steps.size(); ++i) {
        const MacroStep& st = a.steps[i];
        const json& x = es.at(i);
        switch (st.kind) {
          case MacroStepKind::Chord: {
            if (!x.contains("chord")) return false;
            uint8_t mods = 0;
            for (const auto& m : x.at("chord").at("mods")) mods |= parseModBit(m.get<std::string>());
            if (mods != st.chord.mods || x.at("chord").at("key").get<std::string>() != st.chord.key) return false;
            break;
          }
          case MacroStepKind::Wait:
            if (!x.contains("wait") || x.at("wait").get<int>() != st.waitMs) return false;
            break;
          case MacroStepKind::Text:
            if (!x.contains("text") || x.at("text").get<std::string>() != st.text) return false;
            break;
          case MacroStepKind::Consumer:
            if (!x.contains("consumer") || x.at("consumer").get<std::string>() != st.consumerName) return false;
            break;
        }
      }
      return true;
    }
  }
  return false;
}

}  // namespace wct
