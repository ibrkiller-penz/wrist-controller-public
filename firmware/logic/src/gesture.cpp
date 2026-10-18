// 손목 튕김 검출기 구현 — sim/src/core/gesture.ts 를 같은 순서·같은 수식으로 옮겼다.
//
// 샘플마다: ① 세 축 EMA 전처리 ② 판정 축 값 r 과 나머지 두 축 합성 크기 off
// ③ 재인식 금지 중이면 판정하지 않음 ④ idle/above/rebound/blocked 단계별 판정
// ⑤ 히스토리(세 축 제곱합) 갱신 — 재인식 금지 중에는 쌓지 않는다.
#include "wc/gesture.h"

#include <algorithm>
#include <cmath>

#include "wc/imu.h"

namespace wc {

namespace {

// hist 중 [from, to) 구간 RMS. 표본이 없으면 0
double rms(const std::vector<std::pair<double, double>>& hist, double from, double to) {
  double sum = 0;
  int n = 0;
  for (const auto& h : hist) {
    if (h.first >= from && h.first < to) {
      sum += h.second;
      ++n;
    }
  }
  return n == 0 ? 0.0 : std::sqrt(sum / n);
}

}  // namespace

FlickState initFlick(double cooldownUntil) {
  FlickState s;
  s.cooldownUntil = cooldownUntil;
  return s;
}

// accel 방식(기본, 실기 피드백 9) — sim gesture.ts accelFlickStep 과 같은 순서·같은 수식
FlickResult accelFlickStep(const FlickState& st, const ImuSample& s, const GestureConfig& cfg) {
  const auto& f = cfg.flick;
  const auto& c = f.accel;
  FlickResult out;
  out.state = st;
  AccelFlickState& acc = out.state.acc;
  if (!s.hasAccel) return out;
  const double t = s.t;
  const std::array<double, 3> a{{s.ax, s.ay, s.az}};
  const double dt = acc.lastT.has_value() ? t - *acc.lastT : 0.0;
  const double al = emaAlpha(dt, c.lpfTauMs);
  std::array<double, 3> lpf = a;
  if (acc.lpf.has_value()) {
    lpf = *acc.lpf;
    for (int i = 0; i < 3; ++i) lpf[i] += al * (a[i] - lpf[i]);
  }
  acc.lpf = lpf;
  acc.lastT = t;
  const double hp = std::sqrt((a[0] - lpf[0]) * (a[0] - lpf[0]) + (a[1] - lpf[1]) * (a[1] - lpf[1]) +
                              (a[2] - lpf[2]) * (a[2] - lpf[2]));
  const double thr = c.peakG;
  auto reject = [&](FlickReject why) {
    out.rejected = why;
    out.peakG = acc.peak;
    acc.phase = hp >= thr ? AccelPhase::Blocked : AccelPhase::Idle;
  };
  if (t < st.cooldownUntil) {
    if (acc.phase != AccelPhase::Blocked) {
      if (hp >= thr) {
        out.cooldownHit = true;
        acc.phase = AccelPhase::Blocked;
      } else {
        acc.phase = AccelPhase::Idle;
      }
    } else if (hp < thr) {
      acc.phase = AccelPhase::Idle;
    }
  } else {
    switch (acc.phase) {
      case AccelPhase::Idle:
        if (hp >= thr) {
          acc.peak = hp;
          if (rms(acc.hist, t - c.quietGuardMs - c.quietWindowMs, t - c.quietGuardMs) > c.quietMaxRmsG) {
            reject(FlickReject::NotQuiet);
          } else {
            acc.phase = AccelPhase::Above;
            acc.aboveStart = t;
          }
        }
        break;
      case AccelPhase::Above:
        if (hp >= thr) {
          if (hp > acc.peak) acc.peak = hp;
          if (t - acc.aboveStart > c.maxAboveMs) reject(FlickReject::TooLong);
        } else {
          out.fired = FlickDir::Out;  // 방향 없음 = 항상 다음
          out.peakG = acc.peak;
          out.state.cooldownUntil = t + f.cooldownMs;
          acc.phase = AccelPhase::Idle;
          acc.hist.clear();
        }
        break;
      case AccelPhase::Blocked:
        if (hp < thr) acc.phase = AccelPhase::Idle;
        break;
    }
  }
  if (t >= out.state.cooldownUntil) acc.hist.emplace_back(t, hp * hp);
  size_t cut = 0;
  while (cut < acc.hist.size() && acc.hist[cut].first < t - c.quietWindowMs - c.quietGuardMs) ++cut;
  if (cut > 0) acc.hist.erase(acc.hist.begin(), acc.hist.begin() + static_cast<std::ptrdiff_t>(cut));
  return out;
}

FlickResult flickStep(const FlickState& prev, const ImuSample& s, const GestureConfig& cfg) {
  if (cfg.flick.detector == GestureConfig::Flick::Detector::Accel) return accelFlickStep(prev, s, cfg);
  const auto& f = cfg.flick;
  FlickResult res;
  FlickState& st = res.state;
  st = prev;
  const double t = s.t;
  const std::array<double, 3> raw{{s.gx, s.gy, s.gz}};

  // 1. 전처리
  const double dt = st.lastT.has_value() ? t - *st.lastT : 0.0;
  const double a = emaAlpha(dt, f.prefilterTauMs);
  std::array<double, 3> filt;
  if (!st.filt.has_value()) {
    filt = raw;
  } else {
    const auto& p = *st.filt;
    for (int i = 0; i < 3; ++i) filt[i] = p[i] + a * (raw[i] - p[i]);
  }
  st.filt = filt;
  st.lastT = t;

  // 2. 판정 축
  const int ax = axisIndex(f.axis, cfg.imu);
  const double r = filt[ax] * cfg.imu.axisSign[idx(f.axis)];
  const int o1 = ax == 0 ? 1 : 0;
  const int o2 = ax == 2 ? 1 : 2;
  const double off = std::sqrt(filt[o1] * filt[o1] + filt[o2] * filt[o2]);
  const double absr = std::fabs(r);
  const int sgn = r >= 0 ? 1 : -1;

  auto fire = [&]() {
    res.fired = (st.sign * f.outwardSign > 0) ? FlickDir::Out : FlickDir::In;
    st.cooldownUntil = t + f.cooldownMs;
    st.phase = FlickPhase::Idle;
    st.hist.clear();  // 인식된 튕김 자체는 배경 움직임으로 치지 않는다
  };
  auto reject = [&](FlickReject why) {
    res.rejected = why;
    st.phase = absr >= st.threshold ? FlickPhase::Blocked : FlickPhase::Idle;
  };

  if (t < st.cooldownUntil) {
    // 3. 재인식 금지 중
    if (st.phase != FlickPhase::Blocked) {
      if (absr >= f.peakThresholdDps) {
        res.cooldownHit = true;
        st.phase = FlickPhase::Blocked;
        st.threshold = f.peakThresholdDps;
      } else {
        st.phase = FlickPhase::Idle;
      }
    } else if (absr < st.threshold) {
      st.phase = FlickPhase::Idle;
    }
  } else {
    switch (st.phase) {
      case FlickPhase::Idle: {
        double thr = f.peakThresholdDps;
        if (f.adaptive.enabled) {
          thr = std::max(thr, rms(st.hist, t - f.adaptive.windowMs, t) * f.adaptive.rmsMultiplier);
        }
        if (absr >= thr) {
          st.threshold = thr;
          if (absr < f.axisDominanceRatio * off) {
            reject(FlickReject::NotDominant);
          } else if (rms(st.hist, t - f.quietBefore.guardMs - f.quietBefore.windowMs, t - f.quietBefore.guardMs) >=
                     f.quietBefore.maxRmsDps) {
            reject(FlickReject::NotQuiet);
          } else {
            st.phase = FlickPhase::Above;
            st.sign = sgn;
            st.aboveStart = t;
            st.peak = absr;
            st.peakT = t;
          }
        }
        break;
      }
      case FlickPhase::Above: {
        if (sgn == st.sign && absr >= st.threshold) {
          if (absr > st.peak) {
            st.peak = absr;
            st.peakT = t;
          }
          if (t - st.aboveStart > f.maxAboveMs) reject(FlickReject::TooLong);
        } else {
          const double dur = t - st.aboveStart;
          if (dur < f.minAboveMs) {
            reject(FlickReject::TooShort);
          } else if (!f.rebound.required) {
            fire();
          } else {
            st.phase = FlickPhase::Rebound;
            st.reboundNeed = std::max(f.rebound.minRatio * st.peak, f.rebound.minDps);
            if (-st.sign * r >= st.reboundNeed) fire();
          }
        }
        break;
      }
      case FlickPhase::Rebound: {
        if (-st.sign * r >= st.reboundNeed) {
          fire();
        } else if (t - st.peakT > f.rebound.windowMs) {
          reject(FlickReject::NoRebound);
        }
        break;
      }
      case FlickPhase::Blocked: {
        if (absr < st.threshold) st.phase = FlickPhase::Idle;
        break;
      }
    }
  }

  // 히스토리 갱신(현재 샘플은 판정 뒤에 넣는다 = 판정 구간은 [t-window, t)).
  // 재인식 금지 중(인식 직후 포함)에는 쌓지 않는다.
  if (t >= st.cooldownUntil) {
    st.hist.emplace_back(t, filt[0] * filt[0] + filt[1] * filt[1] + filt[2] * filt[2]);
  }
  const double keep = std::max(f.adaptive.windowMs, f.quietBefore.windowMs);
  size_t cut = 0;
  while (cut < st.hist.size() && st.hist[cut].first < t - keep) ++cut;
  if (cut > 0) st.hist.erase(st.hist.begin(), st.hist.begin() + static_cast<std::ptrdiff_t>(cut));

  return res;
}

}  // namespace wc
