// 펌웨어 로직 호스트 테스트 — /shared/test-vectors/*.json 을 C++ 코어(firmware/logic)에 돌린다.
// 규칙은 /shared/test-vectors/README.md, TS 실행기 sim/src/core/vectors.ts 와 같다.
//
// 두 가지 설정으로 돌린다.
//   [json] /shared/keymap.json · gesture.json 을 직접 읽은 설정
//   [gen]  tools/gen_keymap_header.py 가 만든 firmware/main/generated/keymap_gen.h 의 설정(펌웨어가 실제로 쓰는 값)
// 두 설정이 같은지도 검사한다(헤더가 낡으면 실패).
//
// 실행: wc_vector_tests [shared 폴더 경로]   (기본값은 빌드할 때 넣은 WC_SHARED_DIR)
#include <cstdio>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "json_bridge.h"
#include "keymap_gen.h"
#include "wc/logic.h"
#include "wc/touch_gesture.h"

#ifndef WC_SHARED_DIR
#define WC_SHARED_DIR "../../shared"
#endif

using wct::json;

namespace {

int g_pass = 0;
int g_fail = 0;

json readJson(const std::string& path) {
  std::ifstream f(path, std::ios::binary);
  if (!f) throw std::runtime_error("파일을 열 수 없습니다: " + path);
  std::stringstream ss;
  ss << f.rdbuf();
  return json::parse(ss.str());
}

void report(const std::string& tag, const std::vector<std::string>& failures) {
  if (failures.empty()) {
    ++g_pass;
    return;
  }
  ++g_fail;
  std::cout << "[실패] " << tag << "\n";
  for (const auto& f : failures) std::cout << "    - " << f << "\n";
}

std::string dumpList(const std::vector<wc::HidEvent>& list) {
  json a = json::array();
  for (size_t i = 0; i < list.size() && i < 12; ++i) a.push_back(wct::toJson(list[i]));
  std::string s = a.dump();
  if (list.size() > 12) s += " …(" + std::to_string(list.size()) + "개)";
  return s;
}

void listEqual(const std::vector<wc::HidEvent>& actual, const json& expected, const std::string& label,
               std::vector<std::string>& errs) {
  bool ok = actual.size() == expected.size();
  for (size_t i = 0; ok && i < actual.size(); ++i) ok = wct::hidEqual(actual[i], expected[i]);
  if (!ok) errs.push_back(label + ": 기대 " + expected.dump() + ", 실제 " + dumpList(actual));
}

// 객체 o 의 필드 k(없으면 null)
const json& field(const json& o, const char* k) {
  static const json kNull;
  return o.contains(k) ? o.at(k) : kNull;
}

bool inRange(double v, const json& r) {
  if (r.is_null()) return true;
  return v >= r.at(0).get<double>() && v <= r.at(1).get<double>();
}

// touch suite: TouchGesture 가 낸 코어 입력 → JSON(비교용, vectors.ts 의 InputEvent 모양)
json inputToJson(const wc::InputEvent& e) {
  switch (e.t) {
    case wc::InputType::Tap: return {{"t", "tap"}, {"x", e.x}, {"y", e.y}};
    case wc::InputType::LongPress: return {{"t", "longPress"}, {"x", e.x}, {"y", e.y}};
    case wc::InputType::Swipe: {
      const char* d = e.dir == wc::SwipeDir::Left ? "left" : e.dir == wc::SwipeDir::Right ? "right" : e.dir == wc::SwipeDir::Up ? "up" : "down";
      return {{"t", "swipe"}, {"dir", d}};
    }
    default: return {{"t", "other"}};
  }
}

// 상태 기계 suite 한 케이스(vectors.ts runMachineCase 와 같은 규칙)
std::vector<std::string> runMachineCase(const json& c, const wc::Keymap& km, const wc::GestureConfig& g) {
  std::vector<std::string> failures;
  wc::CoreState state = wc::initState(km);
  if (c.contains("init")) wct::applyInit(state, c.at("init"));

  wc::TouchGesture touch;  // touch suite 의 원시 터치 단계용
  const json& steps = c.at("steps");
  for (size_t si = 0; si < steps.size(); ++si) {
    const json& st = steps[si];
    std::vector<wc::HidEvent> hid, dropped;
    std::vector<wc::CoreEvent> events;
    auto run = [&](const wc::InputEvent& input, double now) {
      wc::StepContext ctx;
      ctx.now = now;
      ctx.keymap = &km;
      ctx.gesture = &g;
      wc::StepResult r = wc::step(state, input, ctx);
      state = std::move(r.state);
      for (const auto& e : r.hid) hid.push_back(e.ev);
      for (const auto& e : r.dropped) dropped.push_back(e.ev);
      for (const auto& e : r.events) events.push_back(e);
    };
    std::vector<wc::InputEvent> made;
    if (st.contains("touch")) {
      const double at = st.at("at").get<double>();
      made = touch.sample(st.at("touch").get<std::string>() != "up", st.at("x").get<double>(), st.at("y").get<double>(), at,
                          state, km, g);
      for (const auto& in : made) run(in, at);
    } else if (st.contains("poll")) {
      const double at = st.at("at").get<double>();
      made = touch.poll(at, g);
      for (const auto& in : made) run(in, at);
    } else if (st.contains("imu")) {
      const json& imu = st.at("imu");
      const double start = imu.at("start").get<double>();
      const double dt = imu.at("dt").get<double>();
      const json& samples = imu.at("samples");
      for (size_t i = 0; i < samples.size(); ++i) {
        const double t = start + static_cast<double>(i) * dt;
        wc::ImuSample s{t, samples[i].at(0).get<double>(), samples[i].at(1).get<double>(), samples[i].at(2).get<double>()};
        run(wc::InputEvent::imu(s), t);
      }
    } else {
      run(wct::inputFromJson(st.at("input")), st.at("at").get<double>());
    }
    const bool settingsRequest = touch.takeSettingsRequest();
    if (!st.contains("expect")) continue;
    const json& ex = st.at("expect");
    const std::string tag = "단계 " + std::to_string(si);
    if (ex.contains("inputs")) {
      json got = json::array();
      for (const auto& in : made) got.push_back(inputToJson(in));
      std::vector<std::string> errs;
      wct::partialMatch(got, ex.at("inputs"), "inputs", errs);
      for (const auto& e : errs) failures.push_back(tag + " " + e + " (실제 " + got.dump() + ")");
    }
    if (ex.contains("settingsRequest") && ex.at("settingsRequest").get<bool>() != settingsRequest) {
      failures.push_back(tag + " settingsRequest 기대 " + ex.at("settingsRequest").dump() + ", 실제 " +
                         (settingsRequest ? "true" : "false"));
    }
    auto notMove = [](const std::vector<wc::HidEvent>& v) {
      std::vector<wc::HidEvent> out;
      for (const auto& e : v)
        if (e.t != wc::HidType::MouseMove) out.push_back(e);
      return out;
    };
    if (ex.contains("hid")) listEqual(hid, ex.at("hid"), tag + " hid", failures);
    if (ex.contains("keys")) listEqual(notMove(hid), ex.at("keys"), tag + " keys", failures);
    if (ex.contains("dropped")) listEqual(notMove(dropped), ex.at("dropped"), tag + " dropped", failures);
    if (ex.contains("mouse")) {
      const json& m = ex.at("mouse");
      int dx = 0, dy = 0, n = 0;
      for (const auto& e : hid) {
        if (e.t != wc::HidType::MouseMove) continue;
        dx += e.dx;
        dy += e.dy;
        ++n;
      }
      if (!inRange(dx, field(m, "dx"))) failures.push_back(tag + " mouse.dx 합 " + std::to_string(dx) + " 가 범위 " + m.at("dx").dump() + " 밖");
      if (!inRange(dy, field(m, "dy"))) failures.push_back(tag + " mouse.dy 합 " + std::to_string(dy) + " 가 범위 " + m.at("dy").dump() + " 밖");
      if (!inRange(n, field(m, "count"))) failures.push_back(tag + " mouse 보고 수 " + std::to_string(n) + " 가 범위 " + m.at("count").dump() + " 밖");
    }
    if (ex.contains("droppedMouse")) {
      int n = 0;
      for (const auto& e : dropped)
        if (e.t == wc::HidType::MouseMove) ++n;
      const json& dm = ex.at("droppedMouse");
      if (!inRange(n, field(dm, "count"))) failures.push_back(tag + " 버린 mouse 수 " + std::to_string(n) + " 가 범위 " + dm.at("count").dump() + " 밖");
    }
    if (ex.contains("state")) {
      std::vector<std::string> errs;
      wct::partialMatch(wct::toJson(state), ex.at("state"), "state", errs);
      for (const auto& e : errs) failures.push_back(tag + " " + e);
    }
    if (ex.contains("events")) {
      // 순서 있는 부분열로 포함되어야 한다
      size_t from = 0;
      for (const auto& want : ex.at("events")) {
        bool found = false;
        for (size_t i = from; i < events.size(); ++i) {
          std::vector<std::string> errs;
          wct::partialMatch(wct::toJson(events[i]), want, "", errs);
          if (errs.empty()) {
            from = i + 1;
            found = true;
            break;
          }
        }
        if (!found) {
          json actual = json::array();
          for (size_t i = 0; i < events.size() && i < 10; ++i) actual.push_back(wct::toJson(events[i]));
          failures.push_back(tag + " events: " + want.dump() + " 없음 (실제 " + actual.dump() + ")");
          break;
        }
      }
    }
    if (ex.contains("noEvents")) {
      for (const auto& t : ex.at("noEvents")) {
        for (const auto& e : events) {
          if (t.get<std::string>() == wc::name(e.t)) {
            failures.push_back(tag + " noEvents: '" + t.get<std::string>() + "' 이벤트가 나옴");
            break;
          }
        }
      }
    }
  }
  return failures;
}

std::string hex2(int n) {
  char buf[8];
  std::snprintf(buf, sizeof(buf), "0x%02X", n & 0xFF);
  return buf;
}

// 키맵 suite 한 케이스(vectors.ts runKeymapCase 와 같은 규칙)
std::vector<std::string> runKeymapCase(const json& c, const wc::Keymap& km) {
  std::vector<std::string> failures;
  auto need = [&](auto opt, const char* what) {
    if (!opt) throw wct::BridgeError(std::string("알 수 없는 ") + what + ": " + c.dump());
    return *opt;
  };
  const wc::ModeId mode = need(wc::parseMode(c.at("mode").get<std::string>()), "모드");
  const wc::AppId app = need(wc::parseApp(c.at("app").get<std::string>()), "앱");
  const wc::OsId os = need(wc::parseOs(c.at("os").get<std::string>()), "OS");
  const wc::ActionId action = need(wc::parseAction(c.at("action").get<std::string>()), "동작");
  const json& ex = c.at("expect");
  const auto chord = wc::resolveChord(km, mode, app, action, os);
  const std::string label = wc::formatChord(chord, os);
  const std::string tag = c.at("mode").get<std::string>() + "/" + c.at("app").get<std::string>() + "/" +
                          c.at("os").get<std::string>() + "/" + c.at("action").get<std::string>();
  const json& exChord = ex.at("chord");
  if (exChord.is_null()) {
    if (chord) failures.push_back(tag + ": 기대 null, 실제 " + chord->key);
  } else {
    json want = exChord;
    want["t"] = "key";
    if (!chord || !wct::hidEqual(wc::HidEvent::keyPress(*chord), want)) {
      failures.push_back(tag + ": 키 기대 " + exChord.dump() + ", 실제 " +
                         (chord ? wct::toJson(wc::HidEvent::keyPress(*chord)).dump() : std::string("null")));
    }
  }
  if (label != ex.at("label").get<std::string>()) {
    failures.push_back(tag + ": 표기 기대 \"" + ex.at("label").get<std::string>() + "\", 실제 \"" + label + "\"");
  }
  if (chord && ex.contains("modifier")) {
    const wc::KeyReport rep = wc::chordToReport(*chord);
    if (hex2(rep.modifier) != ex.at("modifier").get<std::string>()) {
      failures.push_back(tag + ": 수정자 바이트 기대 " + ex.at("modifier").get<std::string>() + ", 실제 " + hex2(rep.modifier));
    }
    if (ex.contains("usage") && hex2(rep.usage) != ex.at("usage").get<std::string>()) {
      failures.push_back(tag + ": 사용 코드 기대 " + ex.at("usage").get<std::string>() + ", 실제 " + hex2(rep.usage));
    }
  }
  return failures;
}

// 매크로 suite 한 케이스(vectors.ts runMacroCase 와 같은 규칙)
std::vector<std::string> runMacroCase(const json& c, const wct::HidUsage& hu) {
  std::vector<std::string> failures;
  const std::string id = c.at("id").get<std::string>();
  const auto steps = wct::stepsFromJson(c.at("steps"), hu, id);
  json got = json::array();
  for (const auto& r : wc::expandMacro(steps)) {
    switch (r.kind) {
      case wc::MacroReportKind::Kbd: got.push_back({{"r", "kbd"}, {"mod", r.mod}, {"usage", r.usage}}); break;
      case wc::MacroReportKind::Consumer: got.push_back({{"r", "consumer"}, {"usage", r.usage}}); break;
      case wc::MacroReportKind::Wait: got.push_back({{"r", "wait"}, {"ms", r.ms}}); break;
    }
  }
  const json& ex = c.at("expect");
  if (got != ex.at("reports")) failures.push_back(id + ": 보고서 기대 " + ex.at("reports").dump() + ", 실제 " + got.dump());
  if (ex.contains("label")) {
    const wc::OsId os = c.contains("os") && c.at("os") == "mac" ? wc::OsId::Mac : wc::OsId::Win;
    const std::string label = wc::formatSteps(steps, os);
    if (label != ex.at("label").get<std::string>())
      failures.push_back(id + ": 표기 기대 \"" + ex.at("label").get<std::string>() + "\", 실제 \"" + label + "\"");
  }
  return failures;
}

void runSuite(const std::string& file, const json& suite, const json& keymapJson, const json& gestureJson,
              const wct::HidUsage& hu, const wc::Keymap& genKm, const wc::GestureConfig& genG) {
  const std::string name = suite.at("suite").get<std::string>();
  const wc::Keymap jsonKm = wct::keymapFromJson(keymapJson, hu);
  const wc::GestureConfig jsonG = wct::gestureFromJson(gestureJson);
  for (const auto& c : suite.at("cases")) {
    if (name == "macro") {
      report("[macro] " + file + " " + c.at("id").get<std::string>(), runMacroCase(c, hu));
      continue;
    }
    if (name == "keymap") {
      const std::string id = c.at("mode").get<std::string>() + "/" + c.at("app").get<std::string>() + "/" +
                             c.at("os").get<std::string>() + "/" + c.at("action").get<std::string>();
      report("[json] " + file + " " + id, runKeymapCase(c, jsonKm));
      report("[gen]  " + file + " " + id, runKeymapCase(c, genKm));
      continue;
    }
    const std::string id = c.at("id").get<std::string>();
    try {
      if (c.contains("configPatch")) {
        // 설정 일부를 덮는 케이스는 JSON 설정으로만 돌린다(생성 헤더는 기본값 하나뿐)
        const json& p = c.at("configPatch");
        const json km = p.contains("keymap") ? wct::deepMerge(keymapJson, p.at("keymap")) : keymapJson;
        const json g = p.contains("gesture") ? wct::deepMerge(gestureJson, p.at("gesture")) : gestureJson;
        report("[json] " + file + " " + id, runMachineCase(c, wct::keymapFromJson(km, hu), wct::gestureFromJson(g)));
      } else {
        report("[json] " + file + " " + id, runMachineCase(c, jsonKm, jsonG));
        report("[gen]  " + file + " " + id, runMachineCase(c, genKm, genG));
      }
    } catch (const std::exception& e) {
      report(file + " " + id, {std::string("예외: ") + e.what()});
    }
  }
}

// 단위 검사(벡터 밖의 작은 확인)
void unitChecks() {
  std::vector<std::string> f;
  if (wc::emaAlpha(0, 30) != 1.0 || wc::emaAlpha(10, 0) != 1.0) f.push_back("emaAlpha 경계값");
  wc::CoreState s;
  s.show.running = true;
  s.show.startedAt = 1000;
  if (wc::showElapsed(s, 4000) != 3000) f.push_back("showElapsed");
  report("단위 검사", f);
}

}  // namespace

int main(int argc, char** argv) {
  const std::string shared = argc > 1 ? argv[1] : WC_SHARED_DIR;
  try {
    const json keymapJson = readJson(shared + "/keymap.json");
    const json gestureJson = readJson(shared + "/gesture.json");
    const wct::HidUsage hu = wct::loadHidUsage(readJson(shared + "/hid-usage.json"));

    const wc::Keymap genKm = wc::gen::makeKeymap();
    const wc::GestureConfig genG = wc::gen::makeGesture();

    // 생성 헤더 = JSON 원본 인지 확인
    {
      std::vector<std::string> f;
      wct::partialMatch(wct::toJson(genKm), wct::toJson(wct::keymapFromJson(keymapJson, hu)), "keymap", f);
      wct::partialMatch(wct::toJson(genG), wct::toJson(wct::gestureFromJson(gestureJson)), "gesture", f);
      if (!f.empty()) f.insert(f.begin(), "keymap_gen.h 가 shared/*.json 과 다릅니다. python tools/gen_keymap_header.py 로 다시 만드세요.");
      report("생성 헤더 일치", f);
    }

    unitChecks();

    for (const char* file : {"mode.json", "keymap.json", "gesture.json", "airmouse.json", "macro.json", "touch.json", "imu-real.json"}) {
      const json suite = readJson(shared + "/test-vectors/" + file);
      runSuite(file, suite, keymapJson, gestureJson, hu, genKm, genG);
    }
  } catch (const std::exception& e) {
    std::cout << "[오류] " << e.what() << "\n";
    return 2;
  }

  std::cout << "\n공유 테스트 벡터(C++): 통과 " << g_pass << ", 실패 " << g_fail << "\n";
  return g_fail == 0 ? 0 : 1;
}
