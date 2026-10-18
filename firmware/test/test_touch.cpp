// 터치 제스처 판정(wc::TouchGesture) 호스트 테스트 — 시계 펌웨어가 쓰는 생성 헤더 값(keymap_gen.h)으로
// '원시 터치 샘플 → 코어 입력 → HID' 끝까지 확인한다. 규칙 근거: sim/src/watch/watch.ts onDown/onMove/onUp.
#include <cstdio>
#include <string>
#include <vector>

#include "keymap_gen.h"
#include "wc/logic.h"
#include "wc/touch_gesture.h"

namespace {

int g_fail = 0;

void check(bool ok, const char* what) {
  std::printf("%s %s\n", ok ? "[ok]  " : "[FAIL]", what);
  if (!ok) ++g_fail;
}

struct Rig {
  wc::Keymap km = wc::gen::makeKeymap();
  wc::GestureConfig g = wc::gen::makeGesture();
  wc::CoreState s;
  wc::TouchGesture tg;
  std::vector<std::string> keys;  // 보낸 키 이름
  int macros = 0;                 // 보낸 매크로 수
  std::vector<wc::InputEvent> inputs;

  Rig() {
    s = wc::initState(km);
    s.mode = wc::ModeId::Present;
    s.connected = true;
    s.everConnected = true;
  }
  void feed(bool touching, double x, double y, double t) {
    for (const auto& in : tg.sample(touching, x, y, t, s, km, g)) apply(in, t);
  }
  void poll(double t) {
    for (const auto& in : tg.poll(t, g)) apply(in, t);
  }
  void apply(const wc::InputEvent& in, double t) {
    inputs.push_back(in);
    wc::StepContext ctx;
    ctx.now = t;
    ctx.keymap = &km;
    ctx.gesture = &g;
    wc::StepResult r = wc::step(s, in, ctx);
    s = std::move(r.state);
    for (const auto& e : r.hid)
      if (e.ev.t == wc::HidType::Key) keys.push_back(e.ev.key);
      else if (e.ev.t == wc::HidType::Macro) ++macros;
  }
  // 한 점을 눌렀다 dt 뒤에 뗀다
  void tap(double x, double y, double t0, double dt) {
    feed(true, x, y, t0);
    poll(t0 + dt / 2);
    feed(true, x, y, t0 + dt);
    feed(false, x, y, t0 + dt);
  }
};

}  // namespace

int main() {
  {
    Rig r;
    r.tap(350, 260, 1000, 120);  // 오른쪽 영역(x ≥ 290)
    check(r.keys.size() == 1 && r.keys[0] == "RIGHT", "발표: 오른쪽 탭 = RIGHT(다음)");
  }
  {
    Rig r;
    r.tap(60, 260, 1000, 120);  // 왼쪽 영역(x < 120)
    check(r.keys.size() == 1 && r.keys[0] == "LEFT", "발표: 왼쪽 탭 = LEFT(이전)");
  }
  {
    Rig r;
    r.feed(true, 350, 260, 1000);
    check(r.keys.empty(), "발표: 누르는 순간에는 보내지 않음(손 뗄 때 전송)");
    r.feed(false, 350, 260, 1100);
    check(r.keys.size() == 1, "발표: 뗄 때 한 번 전송");
  }
  {
    Rig r;
    r.tap(350, 260, 1000, 800);  // holdMs(600) 이상 눌렀다 뗌
    check(r.keys.empty(), "발표: 오래 누른 오른쪽 탭은 보내지 않음(시뮬레이터 isTap 규칙)");
  }
  {
    Rig r;
    r.feed(true, 300, 260, 1000);
    r.feed(true, 240, 262, 1050);
    r.feed(true, 180, 265, 1100);
    r.feed(false, 180, 265, 1120);
    check(r.keys.empty() && r.s.mode == wc::ModeId::Launch, "가로 스와이프(왼쪽) = 다음 모드(실행), 키 없음");
  }
  {
    Rig r;
    r.feed(true, 100, 260, 1000);
    r.feed(true, 160, 260, 1050);
    r.feed(true, 220, 260, 1100);
    r.feed(false, 220, 260, 1120);
    check(r.keys.empty() && r.s.mode == wc::ModeId::Clock, "가로 스와이프(오른쪽) = 이전 모드(시계), 영역 키 없음");
  }
  {
    Rig r;
    r.feed(true, 205, 260, 1000);
    r.poll(1359);
    const size_t before = r.inputs.size();
    r.poll(1360);
    check(r.inputs.size() == before + 1 && r.inputs.back().t == wc::InputType::LongPress,
          "발표 가운데(암전) 360ms = longPress(blackoutHoldMs)");
    r.feed(false, 205, 260, 1700);
    check(r.inputs.size() == before + 1, "길게 누른 뒤 떼도 tap 없음");
  }
  {
    Rig r;
    r.feed(true, 205, 20, 1000);  // 위쪽 가장자리(y < 56)
    r.feed(true, 205, 60, 1060);
    r.feed(true, 205, 110, 1120);
    r.feed(false, 205, 110, 1140);
    check(r.inputs.size() == 1 && r.inputs[0].t == wc::InputType::Swipe && r.inputs[0].dir == wc::SwipeDir::Down,
          "위 가장자리에서 아래로 당김 = swipe down(시트)");
    check(r.s.sheet.open, "시트 열림");
  }
  {
    Rig r;
    r.s.mode = wc::ModeId::Launch;
    r.feed(true, 205, 20, 1000);
    r.feed(true, 205, 110, 1100);
    r.feed(false, 205, 110, 1120);
    check(r.inputs.empty() && r.tg.takeSettingsRequest() && !r.tg.takeSettingsRequest(),
          "실행 모드 위 당김 = 설정 화면 요청(코어 입력 없음, 한 번만)");
  }
  {
    Rig r;
    r.s.mode = wc::ModeId::Launch;
    r.tap(100, 126, 1000, 120);
    check(r.keys.size() == 1 && r.keys[0] == "1", "실행 타일 탭 = Win+1(손 뗄 때)");
  }
  {
    Rig r;
    r.s.mode = wc::ModeId::Launch;
    r.feed(true, 300, 262, 1000);  // 4번째 타일(PPT)
    r.poll(1700);                   // 600ms 넘김 → longPress = Win+R 매크로
    r.feed(false, 300, 262, 1800);
    check(r.keys.empty() && r.macros == 1, "실행 타일 길게 = 대안 매크로 1회, 뗄 때 탭 없음");
  }
  {
    Rig r;
    r.s.mode = wc::ModeId::Launch;
    r.feed(true, 200, 300, 1000);
    r.feed(true, 202, 230, 1050);
    r.feed(true, 204, 160, 1100);
    r.feed(false, 204, 160, 1120);
    check(r.keys.empty() && r.s.launchPage == 1, "실행 모드 위로 스와이프 = 2쪽");
    r.tap(205, 480, 2000, 100);
    check(r.s.launchPage == 0, "쪽 점 탭 = 다음 쪽(돌아감)");
  }
  {
    Rig r;
    r.s.connected = false;
    r.s.everConnected = false;
    r.tap(350, 260, 1000, 100);
    check(r.inputs.empty(), "첫 연결 전(연결 대기 화면): 영역 터치 무시");
  }
  std::printf("%s (%d 실패)\n", g_fail ? "실패" : "통과", g_fail);
  return g_fail ? 1 : 0;
}
