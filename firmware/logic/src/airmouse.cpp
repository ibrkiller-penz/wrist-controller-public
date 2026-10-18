// 에어마우스 필터 구현 — sim/src/core/airmouse.ts 를 같은 순서·같은 수식으로 옮겼다.
#include "wc/airmouse.h"

#include <algorithm>
#include <cmath>

#include "wc/imu.h"

namespace wc {

namespace {

double jsSign(double v) { return v > 0 ? 1.0 : (v < 0 ? -1.0 : 0.0); }

// JS Math.round: x.5 는 +∞ 쪽
double jsRound(double v) { return std::floor(v + 0.5); }

struct AxisOut {
  AirAxisState st;
  int out;
};

AxisOut axisStep(const AirAxisState& st, double w, double dt, double gain, const GestureConfig::AirMouse& cfg) {
  bool moving = st.moving;
  const double aw = std::fabs(w);
  if (!moving && aw >= cfg.deadzoneDps.enter) {
    moving = true;
  } else if (moving && aw < cfg.deadzoneDps.exit) {
    moving = false;
  }
  const double wp = moving ? jsSign(w) * (aw - cfg.deadzoneDps.exit) : 0.0;

  const double alpha = (dt <= 0 || cfg.lowpassTauMs <= 0) ? 1.0 : 1.0 - std::exp(-dt / cfg.lowpassTauMs);
  double ema = st.ema + alpha * (wp - st.ema);
  if (std::fabs(ema) < 0.01) ema = 0;

  double d = (gain * jsSign(ema) * std::pow(std::fabs(ema), cfg.curve.exponent) * dt) / 1000.0;
  const double cap = cfg.curve.maxPxPerReport;
  if (d > cap) {
    d = cap;
  } else if (d < -cap) {
    d = -cap;
  }

  double resid = st.resid + d;
  const double outD = std::trunc(resid);
  resid -= outD;
  AxisOut r;
  r.st.moving = moving;
  r.st.ema = ema;
  r.st.resid = resid;
  r.out = static_cast<int>(outD);
  return r;
}

}  // namespace

AirMouseState initAirMouse() { return AirMouseState{}; }

AirMouseState airStart(double now) {
  AirMouseState s;
  s.active = true;
  s.since = now;
  return s;
}

AirMouseState airStop() { return initAirMouse(); }

AirResult airStep(const AirMouseState& prev, const ImuSample& s, const GestureConfig& cfg, double sensitivity) {
  AirResult r;
  r.state = prev;
  if (!prev.active) return r;
  const auto& am = cfg.airMouse;
  if (s.t - prev.since < am.startSuppressMs) {
    // 억제 구간: 상태를 바꾸지 않는다(억제가 끝난 첫 샘플은 dt=0 으로 시작)
    return r;
  }
  const double dt = prev.lastT.has_value() ? s.t - *prev.lastT : 0.0;
  double gain = 1.0;
  if (!am.sensitivity.empty()) {
    const double maxLvl = static_cast<double>(am.sensitivity.size() - 1);
    const double lvl = std::min(std::max(jsRound(sensitivity), 0.0), maxLvl);
    gain = am.sensitivity[static_cast<size_t>(lvl)].gain;
  }
  const std::array<double, 3> v{{s.gx, s.gy, s.gz}};
  const double wx = logicalAxis(v, LogicalAxis::Yaw, cfg.imu);
  const double wy = logicalAxis(v, LogicalAxis::Pitch, cfg.imu) * (am.invertY ? -1.0 : 1.0);
  const AxisOut rx = axisStep(prev.x, wx, dt, gain, am);
  const AxisOut ry = axisStep(prev.y, wy, dt, gain, am);
  r.state.active = true;
  r.state.since = prev.since;
  r.state.lastT = s.t;
  r.state.x = rx.st;
  r.state.y = ry.st;
  r.dx = rx.out;
  r.dy = ry.out;
  r.moving = rx.st.moving || ry.st.moving;
  return r;
}

}  // namespace wc
