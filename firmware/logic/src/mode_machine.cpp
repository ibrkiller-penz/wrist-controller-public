// 모드 상태 기계 구현 — sim/src/core/modeMachine.ts 의 Work 클래스를 같은 순서로 옮겼다.
// 타이머: 시트 자동 닫힘, 측면 버튼 누름 유지(에어마우스·잠금).
// 모든 키 전송은 sendAction() 한 곳을 지난다: 연결 끊김이면 dropped 로 가고 상태 부수효과도 적용하지 않는다.
#include "wc/mode_machine.h"

#include <algorithm>
#include <cmath>

#include "wc/airmouse.h"
#include "wc/gesture.h"
#include "wc/imu.h"
#include "wc/keymap.h"
#include "wc/layout.h"

namespace wc {

namespace {

MeetingEstimate freshMeeting() { return MeetingEstimate{}; }

double jsRound(double v) { return std::floor(v + 0.5); }

class Work {
 public:
  Work(const CoreState& s, double now, const Keymap& km, const GestureConfig& g) : km_(km), g_(g), now_(now) {
    r.state = s;
  }

  StepResult r;

  void timers() {
    CoreState& s = r.state;
    if (s.sheet.open && now_ - s.sheet.lastActivity >= g_.timing.sheetAutoCloseMs) setSheet(false);
    if (s.button.has_value()) {
      ButtonHold& b = *s.button;
      const double held = now_ - b.downAt;
      if (g_.airMouse.enabled && s.mode == ModeId::Present && b.id == km_.settings.primaryButton && !b.air &&
          !b.longFired && held >= g_.airMouse.holdToStartMs) {
        b.air = true;
        startAir();
      }
      // startAir 는 s.button 을 건드리지 않으므로 b 참조는 그대로 유효하다
      if (!b.longFired && !b.moved && held >= g_.button.longPressMs) {
        b.longFired = true;
        setLocked(!s.locked);
        stopAir();
      }
    }
  }

  void input(const InputEvent& inp) {
    CoreState& s = r.state;
    switch (inp.t) {
      case InputType::Tap:
        touch(false, inp.x, inp.y);
        return;
      case InputType::LongPress:
        touch(true, inp.x, inp.y);
        return;
      case InputType::Swipe:
        swipe(inp.dir);
        return;
      case InputType::Button:
        button(inp.id, inp.action);
        return;
      case InputType::Imu:
        imu(inp.sample);
        return;
      case InputType::Tick:
        return;
      case InputType::Connection:
        connection(inp.flag);
        return;
      case InputType::SetMode:
        setMode(inp.mode);
        return;
      case InputType::SetApp:
        setApp(inp.mode, inp.app);
        return;
      case InputType::SetOs:
        if (s.os != inp.os) {
          s.os = inp.os;
          CoreEvent e;
          e.t = EventType::Os;
          e.os = inp.os;
          push(e);
        }
        return;
      case InputType::SetSensitivity: {
        const double maxLvl = static_cast<double>(g_.airMouse.sensitivity.size()) - 1.0;
        const int lvl = static_cast<int>(std::min(std::max(jsRound(inp.level), 0.0), maxLvl));
        if (s.sensitivity != lvl) {
          s.sensitivity = lvl;
          CoreEvent e;
          e.t = EventType::Sensitivity;
          e.level = lvl;
          push(e);
        }
        return;
      }
      case InputType::SetLocked:
        setLocked(inp.flag);
        return;
    }
  }

 private:
  const Keymap& km_;
  const GestureConfig& g_;
  double now_;

  void push(const CoreEvent& e) { r.events.push_back(e); }

  void pushFlag(EventType t, bool v) {
    CoreEvent e;
    e.t = t;
    e.value = v;
    push(e);
  }

  bool emit(const HidEvent& ev, InputSource source, std::optional<ActionId> action) {
    Emitted e{ev, source, action};
    if (r.state.connected) {
      r.hid.push_back(e);
      return true;
    }
    r.dropped.push_back(e);
    return false;
  }

  AppId currentApp(ModeId mode) const {
    switch (mode) {
      case ModeId::Clock: return r.state.apps.clock;
      case ModeId::Present: return r.state.apps.present;
      case ModeId::Launch: return r.state.apps.launch;
      default: return r.state.apps.meeting;
    }
  }

  // keymap 동작 전송. 키가 정의돼 있지 않으면 아무것도 안 하고 false. 끊김이면 버리고 false.
  // alt = 길게 누르기 바인딩(winAlt/macAlt). 매크로 바인딩은 Macro HID 이벤트 하나로 낸다.
  bool sendAction(ActionId action, InputSource source, bool alt = false) {
    const ModeId mode = r.state.mode;
    const auto b = resolveBinding(km_, mode, currentApp(mode), action, r.state.os, alt);
    if (!b) return false;
    const bool sent = emit(b->macro ? HidEvent::macroOf(b->steps) : HidEvent::keyPress(b->chord), source, action);
    CoreEvent e;
    e.t = EventType::Action;
    e.action = action;
    e.source = source;
    e.value = sent;
    push(e);
    if (sent && mode == ModeId::Present) presentSideEffects(action);
    return sent;
  }

  void clearBlackout() {
    auto& show = r.state.show;
    if (show.blackout) {
      show.blackout = false;
      pushFlag(EventType::Blackout, false);
    }
  }

  void presentSideEffects(ActionId action) {
    auto& show = r.state.show;
    switch (action) {
      case ActionId::Next:
      case ActionId::Prev:
        clearBlackout();
        break;
      case ActionId::Blackout:
        show.blackout = !show.blackout;
        pushFlag(EventType::Blackout, show.blackout);
        break;
      case ActionId::ShowStart:
        clearBlackout();
        show.running = true;
        show.startedAt = now_;
        pushFlag(EventType::Show, true);
        break;
      case ActionId::ShowEnd:
        clearBlackout();
        if (show.running) {
          show.running = false;
          pushFlag(EventType::Show, false);
        }
        show.startedAt.reset();
        break;
      default:
        break;
    }
  }

  void setLocked(bool locked) {
    if (r.state.locked == locked) return;
    r.state.locked = locked;
    pushFlag(EventType::Lock, locked);
  }

  void setSheet(bool open) {
    if (r.state.sheet.open == open) return;
    r.state.sheet.open = open;
    r.state.sheet.lastActivity = now_;
    pushFlag(EventType::Sheet, open);
  }

  void startAir() {
    r.state.air = airStart(now_);
    r.state.flick = initFlick(r.state.flick.cooldownUntil);
    pushFlag(EventType::Air, true);
  }

  void stopAir() {
    if (!r.state.air.active) return;
    r.state.air = airStop();
    pushFlag(EventType::Air, false);
  }

  void setMode(ModeId mode) {
    if (r.state.mode == mode) return;
    stopAir();
    setSheet(false);
    if (mode == ModeId::Clock) r.state.prevMode = r.state.mode;
    r.state.mode = mode;
    r.state.flick = initFlick(r.state.flick.cooldownUntil);
    CoreEvent e;
    e.t = EventType::Mode;
    e.mode = mode;
    push(e);
  }

  void setApp(ModeId mode, AppId app) {
    if (!findApp(km_, mode, app)) return;
    AppId* slot = nullptr;
    switch (mode) {
      case ModeId::Clock: slot = &r.state.apps.clock; break;
      case ModeId::Present: slot = &r.state.apps.present; break;
      case ModeId::Launch: slot = &r.state.apps.launch; break;
      case ModeId::Meeting: slot = &r.state.apps.meeting; break;
    }
    if (*slot == app) return;
    *slot = app;
    CoreEvent e;
    e.t = EventType::App;
    e.mode = mode;
    e.app = app;
    push(e);
  }

  // 실행 모드 쪽 수(동작 6개당 1쪽, 최소 1)
  int launchPages() const {
    const KeymapApp* app = findApp(km_, ModeId::Launch, r.state.apps.launch);
    const int n = app ? static_cast<int>(app->actions.size()) : 0;
    return std::max(1, (n + LAUNCH_TILES_PER_PAGE - 1) / LAUNCH_TILES_PER_PAGE);
  }

  void setLaunchPage(int page) {
    const int n = launchPages();
    const int p = ((page % n) + n) % n;
    if (p == r.state.launchPage) return;
    r.state.launchPage = p;
    CoreEvent e;
    e.t = EventType::LaunchPage;
    e.level = p;
    push(e);
  }

  // ---------------- 입력 ----------------
  void shortPress(ButtonId id) {
    if (id == km_.settings.primaryButton) {
      // BOOT 짧게 = 시계 모드로(모든 모드). 이미 시계면 직전 모드로. 키는 보내지 않는다(다음 = 오른쪽 탭·손목 튕김)
      if (r.state.mode == ModeId::Clock) {
        setMode(r.state.prevMode != ModeId::Clock ? r.state.prevMode : ModeId::Present);
      } else {
        setMode(ModeId::Clock);
      }
    } else {
      r.state.screenOn = !r.state.screenOn;
      pushFlag(EventType::Screen, r.state.screenOn);
    }
  }

  void button(ButtonId id, ButtonAction action) {
    CoreState& s = r.state;
    switch (action) {
      case ButtonAction::Short:
        shortPress(id);
        return;
      case ButtonAction::Long:
        setLocked(!s.locked);
        return;
      case ButtonAction::Down:
        if (s.button.has_value()) return;  // 다른 버튼이 눌려 있으면 무시
        s.button = ButtonHold{id, now_, false, false, false};
        return;
      case ButtonAction::Up: {
        if (!s.button.has_value() || s.button->id != id) return;
        const ButtonHold b = *s.button;
        s.button.reset();
        if (b.air) {
          stopAir();
        } else if (!b.longFired) {
          shortPress(id);
        }
        return;
      }
    }
  }

  void pushEstimate(MeetingAppId app, MeetingActionId target, EstimateValue value, bool synced) {
    CoreEvent e;
    e.t = EventType::Estimate;
    e.app = fromMeetingApp(app);
    e.target = target;
    e.estimate = value;
    e.value = synced;
    push(e);
  }

  static EstimateValue toValue(Estimate v) {
    switch (v) {
      case Estimate::On: return EstimateValue::On;
      case Estimate::Off: return EstimateValue::Off;
      default: return EstimateValue::Unknown;
    }
  }

  void meetingToggle(MeetingActionId action, InputSource source) {
    const auto app = toMeetingApp(r.state.apps.meeting);
    if (!sendAction(toAction(action), source)) return;
    if (!app) return;
    MeetingEstimate& est = r.state.meeting[idx(*app)];
    if (action == MeetingActionId::Hand) {
      est.hand = est.hand == Hand::Up ? Hand::Down : Hand::Up;
      pushEstimate(*app, action, est.hand == Hand::Up ? EstimateValue::Up : EstimateValue::Down, false);
    } else {
      Estimate& v = action == MeetingActionId::Mic ? est.mic : est.camera;
      if (v != Estimate::Unknown) v = v == Estimate::On ? Estimate::Off : Estimate::On;
      pushEstimate(*app, action, toValue(v), false);
    }
  }

  void meetingSync(MeetingActionId action) {
    const auto app = toMeetingApp(r.state.apps.meeting);
    if (!app) return;
    MeetingEstimate& est = r.state.meeting[idx(*app)];
    if (action == MeetingActionId::Hand) {
      est.hand = est.hand == Hand::Up ? Hand::Down : Hand::Up;
      pushEstimate(*app, action, est.hand == Hand::Up ? EstimateValue::Up : EstimateValue::Down, true);
    } else {
      Estimate& v = action == MeetingActionId::Mic ? est.mic : est.camera;
      v = v == Estimate::Off ? Estimate::On : Estimate::Off;
      pushEstimate(*app, action, toValue(v), true);
    }
  }

  void touch(bool longPress, double x, double y) {
    CoreState& s = r.state;
    if (s.air.active) {
      // 에어마우스 중: 탭 = 왼쪽 클릭, 길게 누름은 무시
      if (!longPress) {
        emit(HidEvent::mouseButton(MouseButton::Left, true), InputSource::Air, std::nullopt);
        emit(HidEvent::mouseButton(MouseButton::Left, false), InputSource::Air, std::nullopt);
      }
      return;
    }
    const HitTarget hit = hitTest(s.mode, s.sheet.open, x, y, km_, s.apps.launch, s.launchPage);
    if (s.sheet.open) {
      if (longPress) return;
      if (hit.kind == HitKind::SheetButton && hit.action) {
        sendAction(*hit.action, InputSource::Sheet);
        setSheet(false);
      } else if (hit.kind == HitKind::SheetScrim) {
        setSheet(false);
      } else {
        s.sheet.lastActivity = now_;
      }
      return;
    }
    const InputSource src = longPress ? InputSource::Hold : InputSource::Touch;
    switch (hit.kind) {
      case HitKind::PresentZone:
        if (hit.zone == PresentZone::Center) {
          if (longPress) sendAction(ActionId::Blackout, InputSource::Hold);
        } else {
          sendAction(hit.zone == PresentZone::Prev ? ActionId::Prev : ActionId::Next, src);
        }
        return;
      case HitKind::LaunchTile:
        // 탭 = 기본 바인딩, 길게 = 대안(winAlt/macAlt — 없으면 아무것도 안 함)
        if (hit.action) sendAction(*hit.action, src, longPress);
        return;
      case HitKind::LaunchDots:
        if (!longPress) setLaunchPage(s.launchPage + 1);
        return;
      case HitKind::MeetingChip:
        setApp(ModeId::Meeting, hit.app);
        return;
      case HitKind::MeetingTile:
        if (!longPress) {
          meetingToggle(hit.meetingAction, InputSource::Touch);
        } else {
          meetingSync(hit.meetingAction);
        }
        return;
      default:
        return;
    }
  }

  void swipe(SwipeDir dir) {
    CoreState& s = r.state;
    if (s.air.active) return;
    if (dir == SwipeDir::Left || dir == SwipeDir::Right) {
      if (s.sheet.open) return;
      const auto& order = km_.modeOrder;
      if (order.empty()) return;
      int i = 0;
      for (size_t k = 0; k < order.size(); ++k) {
        if (order[k] == s.mode) {
          i = static_cast<int>(k);
          break;
        }
      }
      const int n = static_cast<int>(order.size());
      const ModeId next = order[static_cast<size_t>((i + (dir == SwipeDir::Left ? 1 : n - 1)) % n)];
      setMode(next);
    } else if (s.mode == ModeId::Launch && !s.sheet.open) {
      // 실행 모드: 타일 영역 세로 스와이프 = 쪽 넘기기(위로 = 다음 쪽, 아래로 = 앞 쪽, 돌아감)
      setLaunchPage(s.launchPage + (dir == SwipeDir::Up ? 1 : -1));
    } else if (dir == SwipeDir::Down) {
      if (s.mode == ModeId::Present && !s.sheet.open) setSheet(true);
    } else if (s.sheet.open) {
      setSheet(false);
    }
  }

  void imu(const ImuSample& sample) {
    CoreState& s = r.state;
    const BiasResult bs = biasStep(s.bias, sample, g_.imu.biasCalib);
    s.bias = bs.state;
    const ImuSample& v = bs.out;
    if (s.air.active) {
      const AirResult ar = airStep(s.air, v, g_, s.sensitivity);
      s.air = ar.state;
      if (ar.moving && s.button.has_value()) s.button->moved = true;
      if (ar.dx != 0 || ar.dy != 0) emit(HidEvent::mouseMove(ar.dx, ar.dy), InputSource::Air, std::nullopt);
      return;
    }
    if (s.mode != ModeId::Present || s.button.has_value()) return;
    const FlickResult fr = flickStep(s.flick, v, g_);
    s.flick = fr.state;
    if (fr.rejected) {
      CoreEvent e;
      e.t = EventType::FlickRejected;
      e.reject = *fr.rejected;
      e.peakG = fr.peakG;
      push(e);
    }
    if (fr.cooldownHit) pushIgnored(InputSource::Gesture, IgnoreReason::Cooldown);
    if (fr.fired) {
      if (s.locked) {
        pushIgnored(InputSource::Gesture, IgnoreReason::Locked);
      } else {
        CoreEvent e;
        e.t = EventType::Flick;
        e.dir = *fr.fired;
        e.peakG = fr.peakG;
        push(e);
        // accel 방식은 방향이 없어 항상 다음. gyro 방식: 바깥 = 다음, 안쪽은 flick.inAction(next 기본 / prev / none)
        using IA = GestureConfig::Flick::InAction;
        const bool accel = g_.flick.detector == GestureConfig::Flick::Detector::Accel;
        if (accel || *fr.fired == FlickDir::Out || g_.flick.inAction == IA::Next) sendAction(ActionId::Next, InputSource::Gesture);
        else if (g_.flick.inAction == IA::Prev) sendAction(ActionId::Prev, InputSource::Gesture);
      }
    }
  }

  void pushIgnored(InputSource source, IgnoreReason reason) {
    CoreEvent e;
    e.t = EventType::Ignored;
    e.source = source;
    e.ignore = reason;
    push(e);
  }

  void connection(bool connected) {
    CoreState& s = r.state;
    if (s.connected == connected) return;
    s.connected = connected;
    if (!connected) {
      s.disconnectedAt = now_;
    } else {
      if (s.disconnectedAt.has_value() && now_ - *s.disconnectedAt > g_.timing.meetingEstimateResetMs) {
        for (auto& m : s.meeting) m = freshMeeting();
      }
      s.disconnectedAt.reset();
      s.everConnected = true;
    }
    pushFlag(EventType::Connection, connected);
  }
};

}  // namespace

CoreState initState(const Keymap& km) {
  CoreState s;
  s.mode = km.settings.mode;
  s.os = km.settings.os;
  s.apps.clock = AppId::Clock;
  s.apps.present = km.modes[idx(ModeId::Present)].defaultApp;
  s.apps.launch = km.modes[idx(ModeId::Launch)].defaultApp;
  s.apps.meeting = km.modes[idx(ModeId::Meeting)].defaultApp;
  s.launchPage = 0;
  s.sensitivity = km.settings.sensitivity;
  s.connected = true;
  s.everConnected = true;
  s.locked = false;
  s.screenOn = true;
  for (auto& m : s.meeting) m = freshMeeting();
  s.bias = initBias();
  s.air = initAirMouse();
  s.flick = initFlick();
  return s;
}

StepResult step(const CoreState& state, const InputEvent& input, const StepContext& ctx) {
  const double now = input.t == InputType::Imu ? input.sample.t : ctx.now;
  Work w(state, now, *ctx.keymap, *ctx.gesture);
  w.timers();
  w.input(input);
  w.timers();
  return std::move(w.r);
}

double showElapsed(const CoreState& state, double now) {
  if (state.show.running && state.show.startedAt.has_value()) return std::max(0.0, now - *state.show.startedAt);
  return 0.0;
}

}  // namespace wc
