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

FlickResult flickStep(const FlickState& prev, const ImuSample& s, const GestureConfig& cfg) {
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
