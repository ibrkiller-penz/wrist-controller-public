// IMU 전처리 구현 — /shared/test-vectors/README.md 5.1 과 같은 수식.
#include "wc/imu.h"

#include <cmath>

namespace wc {

BiasState initBias() { return BiasState{}; }

double emaAlpha(double dtMs, double tauMs) {
  if (dtMs <= 0 || tauMs <= 0) return 1.0;
  return 1.0 - std::exp(-dtMs / tauMs);
}

BiasResult biasStep(const BiasState& st, const ImuSample& s, const GestureConfig::Imu::BiasCalib& cfg) {
  const std::array<double, 3> raw{{s.gx, s.gy, s.gz}};
  if (!cfg.enabled) {
    BiasState next = st;
    next.lastT = s.t;
    return {next, s};
  }
  const double dt = st.lastT.has_value() ? s.t - *st.lastT : 0.0;
  std::array<double, 3> bias = st.bias;
  bool still = true;
  for (int i = 0; i < 3; ++i) {
    if (!(std::fabs(raw[i] - bias[i]) < cfg.stillThresholdDps)) still = false;
  }
  std::optional<double> stillSince = st.stillSince;
  if (still) {
    if (!stillSince.has_value()) stillSince = s.t;
    if (s.t - *stillSince >= cfg.stillMs) {
      const double a = emaAlpha(dt, cfg.trackTauMs);
      for (int i = 0; i < 3; ++i) bias[i] += a * (raw[i] - bias[i]);
    }
  } else {
    stillSince.reset();
  }
  BiasResult r;
  r.state.bias = bias;
  r.state.stillSince = stillSince;
  r.state.lastT = s.t;
  r.out = ImuSample{s.t, raw[0] - bias[0], raw[1] - bias[1], raw[2] - bias[2]};
  return r;
}

double logicalAxis(const std::array<double, 3>& v, LogicalAxis axis, const GestureConfig::Imu& imu) {
  const int a = idx(axis);
  return v[imu.axisMap[a]] * imu.axisSign[a];
}

int axisIndex(LogicalAxis axis, const GestureConfig::Imu& imu) { return imu.axisMap[idx(axis)]; }

}  // namespace wc
