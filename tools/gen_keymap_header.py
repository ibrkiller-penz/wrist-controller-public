#!/usr/bin/env python3
"""keymap.json · gesture.json · hid-usage.json → firmware/main/generated/keymap_gen.h

작업지시서 규칙 "키 배치는 코드에 직접 쓰지 말고 keymap.json 에서만 바꾼다" 를 펌웨어에서 지키기 위한 생성기.
시뮬레이션(sim)과 펌웨어가 같은 /shared 설정을 쓰게 한다.

만드는 것
  1. HID 사용 코드 표(키 이름 → 키보드 페이지 사용 코드, 수정자 비트, 컨슈머 코드, 마우스 버튼 비트)
  2. 평평한 키 바인딩 표 kKeyBindings[] (모드, 앱, 동작, OS → 수정자 바이트, 사용 코드) — C 에서도 읽기 쉬운 형태
  3. wc::gen::makeKeymap() / makeGesture() — firmware/logic 의 wc::Keymap, wc::GestureConfig 를 채우는 인라인 함수

사용법
  python tools/gen_keymap_header.py            # 헤더를 (다시) 만든다
  python tools/gen_keymap_header.py --check    # 헤더가 최신인지만 검사(CI). 다르면 종료 코드 1
  python tools/gen_keymap_header.py --shared DIR --out FILE

표준 라이브러리만 쓴다(Python 3.8 이상).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SHARED = ROOT / "shared"
DEFAULT_OUT = ROOT / "firmware" / "main" / "generated" / "keymap_gen.h"

# firmware/logic/include/wc/types.h 의 enum 순서와 같아야 한다.
# ModeId 값 = 이 목록의 인덱스(NVS 호환: 옛 coding 자리 = launch, clock 은 맨 뒤). 화면 순서는 keymap.modeOrder
MODES = ["present", "launch", "meeting", "clock"]
OSES = ["win", "mac"]
APPS = ["powerpoint", "slides", "launcher", "zoom", "teams", "meet", "clock"]
ACTIONS = ["next", "prev", "blackout", "showStart", "showEnd",
           "claude", "kakao", "chrome", "ppt", "excel", "hwp",
           "capture", "lock", "desktop", "display", "mute", "portal",
           "mic", "camera", "hand"]
BUTTONS = ["boot", "pwr"]
AXES = ["yaw", "pitch", "roll"]
SENSOR_AXES = ["gx", "gy", "gz"]
MOD_NAMES = ["ctrl", "shift", "alt", "gui"]
ENUM_MODE = ["ModeId::Present", "ModeId::Launch", "ModeId::Meeting", "ModeId::Clock"]
ENUM_OS = ["OsId::Win", "OsId::Mac"]
ENUM_APP = ["AppId::PowerPoint", "AppId::Slides", "AppId::Launcher", "AppId::Zoom", "AppId::Teams", "AppId::Meet",
            "AppId::Clock"]
ENUM_ACTION = ["ActionId::Next", "ActionId::Prev", "ActionId::Blackout", "ActionId::ShowStart", "ActionId::ShowEnd",
               "ActionId::Claude", "ActionId::Kakao", "ActionId::Chrome", "ActionId::Ppt", "ActionId::Excel",
               "ActionId::Hwp", "ActionId::Capture", "ActionId::Lock", "ActionId::Desktop", "ActionId::Display",
               "ActionId::Mute", "ActionId::Portal", "ActionId::Mic", "ActionId::Camera", "ActionId::Hand"]
MACRO_MAX_STEPS = 24
ENUM_BUTTON = ["ButtonId::Boot", "ButtonId::Pwr"]
ENUM_AXIS = ["LogicalAxis::Yaw", "LogicalAxis::Pitch", "LogicalAxis::Roll"]


class GenError(Exception):
    pass


def load(path: Path):
    try:
        with path.open(encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError as e:
        raise GenError(f"파일이 없습니다: {path}") from e
    except json.JSONDecodeError as e:
        raise GenError(f"JSON 형식 오류: {path}: {e}") from e


def hexint(s: str) -> int:
    return int(s, 16)


def c_str(text: str) -> str:
    """C 문자열 리터럴. ASCII 밖의 바이트는 8진 이스케이프(뒤 글자와 섞이지 않게)."""
    out = ['"']
    for b in text.encode("utf-8"):
        ch = chr(b)
        if ch == '"':
            out.append('\\"')
        elif ch == "\\":
            out.append("\\\\")
        elif 0x20 <= b < 0x7F:
            out.append(ch)
        else:
            out.append("\\%03o" % b)
    out.append('"')
    return "".join(out)


def c_num(v) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(float(v))
    raise GenError(f"숫자가 아닙니다: {v!r}")


def c_bool(v) -> str:
    if not isinstance(v, bool):
        raise GenError(f"참/거짓이 아닙니다: {v!r}")
    return "true" if v else "false"


def index_of(table, value, what):
    if value not in table:
        raise GenError(f"알 수 없는 {what}: {value!r} (허용: {', '.join(table)})")
    return table.index(value)


def chord_info(chord, keys, where):
    """keymap 의 chord → (수정자 바이트, 사용 코드, 키 이름, 수정자 목록) 또는 None"""
    if chord is None:
        return None
    key = chord.get("key")
    if key not in keys:
        raise GenError(f"{where}: hid-usage.json 에 없는 키 이름 {key!r}")
    mods = chord.get("mods", [])
    bits = 0
    for m in mods:
        if m not in MOD_NAMES:
            raise GenError(f"{where}: 알 수 없는 수정자 {m!r}")
        bits |= {"ctrl": 0x01, "shift": 0x02, "alt": 0x04, "gui": 0x08}[m]
    return bits, keys[key], key, mods


def is_macro(b):
    return isinstance(b, dict) and "steps" in b


def macro_lines(binding, keys, consumer, where, target):
    """매크로 바인딩 → C++ 문장들(Binding b 를 만들어 target 에 넣는다)"""
    steps = binding["steps"]
    if not 1 <= len(steps) <= MACRO_MAX_STEPS:
        raise GenError(f"{where}: 매크로 단계는 1~{MACRO_MAX_STEPS}개")
    out = ["        {", "          Binding b;", "          b.macro = true;"]
    for i, st in enumerate(steps):
        w_ = f"{where}/steps/{i}"
        if "chord" in st:
            bits, usage, keyname, mods = chord_info(st["chord"], keys, w_)
            out.append(f"          b.steps.push_back(stepChord(0x{bits:02X}, {c_str(keyname)}, 0x{usage:02X}));  // {'+'.join(mods + [keyname])}")
        elif "wait" in st:
            ms = int(st["wait"])
            if not 0 <= ms <= 3000:
                raise GenError(f"{w_}: wait 는 0~3000ms")
            out.append(f"          b.steps.push_back(stepWait({ms}));")
        elif "text" in st:
            t = st["text"]
            if not t or len(t) > 96 or any(not (0x20 <= ord(ch) <= 0x7E) for ch in t):
                raise GenError(f"{w_}: text 는 출력 가능한 ASCII 1~96자만(한글 불가)")
            out.append(f"          b.steps.push_back(stepText({c_str(t)}));")
        elif "consumer" in st:
            n = st["consumer"]
            if n not in consumer:
                raise GenError(f"{w_}: hid-usage.json 에 없는 소비자 키 {n!r}")
            out.append(f"          b.steps.push_back(stepConsumer({c_str(n)}, 0x{consumer[n]:04X}));")
        else:
            raise GenError(f"{w_}: 알 수 없는 매크로 단계 {st!r}")
    out.append(f"          {target} = b;")
    out.append("        }")
    return out


def generate(shared: Path) -> str:
    keymap_path = shared / "keymap.json"
    gesture_path = shared / "gesture.json"
    usage_path = shared / "hid-usage.json"
    km = load(keymap_path)
    g = load(gesture_path)
    hu = load(usage_path)

    keys = {name: hexint(v) for name, v in hu["keys"].items()}
    modbits = {name: hexint(v) for name, v in hu["modifiers"].items()}
    expected_bits = {"ctrl": 0x01, "shift": 0x02, "alt": 0x04, "gui": 0x08}
    if modbits != expected_bits:
        raise GenError(f"hid-usage.json modifiers 가 firmware 의 ModBits 와 다릅니다: {modbits}")
    consumer = {name: hexint(v) for name, v in hu.get("consumer", {}).items()}
    mouse_buttons = {name: hexint(v) for name, v in hu.get("mouseButtons", {}).items()}

    digest = hashlib.sha256()
    for p in (keymap_path, gesture_path, usage_path):
        digest.update(p.read_bytes().replace(b"\r\n", b"\n"))
    src_hash = digest.hexdigest()[:16]

    L: list[str] = []
    w = L.append
    w("// 자동 생성 파일 — 손으로 고치지 마세요.")
    w("// 생성: python tools/gen_keymap_header.py")
    w("// 원본: shared/keymap.json, shared/gesture.json, shared/hid-usage.json")
    w(f"// 원본 해시(sha256 앞 16자, 줄바꿈 LF 기준): {src_hash}")
    w("// 키 배치를 바꾸려면 shared/keymap.json 을 고치고 이 스크립트를 다시 실행한다.")
    w("#pragma once")
    w("")
    w("#include <cstdint>")
    w("")
    w('#include "wc/types.h"')
    w("")
    w(f'#define WC_KEYMAP_GEN_HASH "{src_hash}"')
    w(f"#define WC_KEYMAP_VERSION {int(km['version'])}")
    w(f"#define WC_GESTURE_VERSION {int(g['version'])}")
    w("")
    w("namespace wc {")
    w("namespace gen {")
    w("")

    # ---------------------------------------------------------------- HID 표
    w("// ---------------------------------------------------------------------------")
    w("// HID 사용 코드 (USB HID Usage Tables 1.5 — shared/hid-usage.json)")
    w("// ---------------------------------------------------------------------------")
    w("")
    w(f"constexpr uint8_t kKeyboardPage = 0x{hexint(hu['keyboardPage']):02X};")
    w(f"constexpr uint8_t kConsumerPage = 0x{hexint(hu['consumerPage']):02X};")
    w("")
    w("struct KeyUsage {")
    w("  const char* name;")
    w("  uint8_t usage;")
    w("};")
    w(f"constexpr KeyUsage kKeyUsages[] = {{")
    for name, code in keys.items():
        w(f"    {{{c_str(name)}, 0x{code:02X}}},")
    w("};")
    w(f"constexpr int kKeyUsageCount = {len(keys)};")
    w("")
    w("// 키 이름 → 사용 코드. 모르면 -1")
    w("inline int keyUsage(const char* name) {")
    w("  for (const auto& k : kKeyUsages) {")
    w("    const char* a = k.name;")
    w("    const char* b = name;")
    w("    while (*a && *a == *b) {")
    w("      ++a;")
    w("      ++b;")
    w("    }")
    w("    if (*a == *b) return k.usage;")
    w("  }")
    w("  return -1;")
    w("}")
    w("")
    w("struct ConsumerUsage {")
    w("  const char* name;")
    w("  uint16_t usage;")
    w("};")
    if consumer:
        w("constexpr ConsumerUsage kConsumerUsages[] = {")
        for name, code in consumer.items():
            w(f"    {{{c_str(name)}, 0x{code:04X}}},")
        w("};")
    for name, code in mouse_buttons.items():
        w(f"constexpr uint8_t kMouseButton_{name} = 0x{code:02X};")
    w("")

    # ---------------------------------------------------------------- 평평한 바인딩 표
    w("// ---------------------------------------------------------------------------")
    w("// 키 바인딩 표 (모드, 앱, 동작, OS → 보고서 값). null(그 OS 에 없음)은 싣지 않는다.")
    w("// 화면 배치 순서는 makeKeymap() 의 actions 배열 순서를 따른다.")
    w("// ---------------------------------------------------------------------------")
    w("")
    w("struct KeyBinding {")
    w("  ModeId mode;")
    w("  AppId app;")
    w("  ActionId action;")
    w("  OsId os;")
    w("  uint8_t modifier;")
    w("  uint8_t usage;")
    w("};")
    bindings = []
    modes = km["modes"]
    for mode in MODES:
        if mode not in modes:
            raise GenError(f"keymap.json modes 에 {mode!r} 가 없습니다")
        for app, adef in modes[mode]["apps"].items():
            index_of(APPS, app, "앱 id")
            for act in adef["actions"]:
                index_of(ACTIONS, act["id"], "동작 id")
                for os_ in OSES:
                    b = act.get(os_)
                    if is_macro(b):
                        continue  # 매크로는 makeKeymap() 에만(평평한 표는 키 조합 한 번 누름만)
                    info = chord_info(b, keys, f"{mode}/{app}/{act['id']}/{os_}")
                    if info:
                        bits, usage, keyname, mods = info
                        label = "+".join(mods + [keyname])
                        bindings.append((mode, app, act["id"], os_, bits, usage, label))
    w("constexpr KeyBinding kKeyBindings[] = {")
    for mode, app, act, os_, bits, usage, label in bindings:
        w(f"    {{{ENUM_MODE[MODES.index(mode)]}, {ENUM_APP[APPS.index(app)]}, {ENUM_ACTION[ACTIONS.index(act)]}, "
          f"{ENUM_OS[OSES.index(os_)]}, 0x{bits:02X}, 0x{usage:02X}}},  // {label}")
    w("};")
    w(f"constexpr int kKeyBindingCount = {len(bindings)};  // 키 조합만(매크로 제외)")
    w("")

    # ---------------------------------------------------------------- makeKeymap
    st = km["settings"]
    w("// ---------------------------------------------------------------------------")
    w("// wc::Keymap 채우기 (shared/keymap.json)")
    w("// ---------------------------------------------------------------------------")
    w("")
    w("inline Chord makeChord(uint8_t mods, const char* key, uint8_t usage) {")
    w("  Chord c;")
    w("  c.mods = mods;")
    w("  c.key = key;")
    w("  c.usage = usage;")
    w("  return c;")
    w("}")
    w("")
    w("inline Binding chordBinding(uint8_t mods, const char* key, uint8_t usage) {")
    w("  Binding b;")
    w("  b.chord = makeChord(mods, key, usage);")
    w("  return b;")
    w("}")
    w("inline MacroStep stepChord(uint8_t mods, const char* key, uint8_t usage) {")
    w("  MacroStep s;")
    w("  s.kind = MacroStepKind::Chord;")
    w("  s.chord = makeChord(mods, key, usage);")
    w("  return s;")
    w("}")
    w("inline MacroStep stepWait(int ms) {")
    w("  MacroStep s;")
    w("  s.kind = MacroStepKind::Wait;")
    w("  s.waitMs = ms;")
    w("  return s;")
    w("}")
    w("inline MacroStep stepText(const char* t) {")
    w("  MacroStep s;")
    w("  s.kind = MacroStepKind::Text;")
    w("  s.text = t;")
    w("  return s;")
    w("}")
    w("inline MacroStep stepConsumer(const char* name, uint16_t usage) {")
    w("  MacroStep s;")
    w("  s.kind = MacroStepKind::Consumer;")
    w("  s.consumerName = name;")
    w("  s.consumerUsage = usage;")
    w("  return s;")
    w("}")
    w("")
    w("inline Keymap makeKeymap() {")
    w("  Keymap km;")
    w(f"  km.version = {int(km['version'])};")
    w(f"  km.settings.deviceName = {c_str(st['deviceName'])};  // {st['deviceName']}")
    w(f"  km.settings.deviceNameMaxBytes = {int(st.get('deviceNameMaxBytes', 29))};")
    w(f"  km.settings.os = {ENUM_OS[index_of(OSES, st['os'], 'OS')]};")
    w(f"  km.settings.mode = {ENUM_MODE[index_of(MODES, st['mode'], '모드')]};")
    w(f"  km.settings.sensitivity = {int(st['sensitivity'])};")
    w(f"  km.settings.primaryButton = {ENUM_BUTTON[index_of(BUTTONS, st['primaryButton'], '버튼')]};")
    order = ", ".join(ENUM_MODE[index_of(MODES, m, '모드')] for m in km["modeOrder"])
    w(f"  km.modeOrder = {{{order}}};")
    for mode in MODES:
        mdef = modes[mode]
        mi = MODES.index(mode)
        w("  {")
        w(f"    KeymapMode& m = km.modes[{mi}];  // {mode}")
        w(f"    m.name = {c_str(mdef['name'])};  // {mdef['name']}")
        w(f"    m.defaultApp = {ENUM_APP[index_of(APPS, mdef['defaultApp'], '앱 id')]};")
        apps_order = ", ".join(ENUM_APP[index_of(APPS, a, '앱 id')] for a in mdef["appOrder"])
        w(f"    m.appOrder = {{{apps_order}}};")
        for app, adef in mdef["apps"].items():
            w("    {")
            w("      KeymapApp a;")
            w(f"      a.id = {ENUM_APP[APPS.index(app)]};")
            w(f"      a.name = {c_str(adef['name'])};")
            for act in adef["actions"]:
                w("      {")
                w("        KeymapAction x;")
                w(f"        x.id = {ENUM_ACTION[ACTIONS.index(act['id'])]};")
                w(f"        x.label = {c_str(act.get('label', ''))};  // {act.get('label', '')}")
                for slot in ("win", "mac", "winAlt", "macAlt"):
                    b = act.get(slot)
                    where = f"{mode}/{app}/{act['id']}/{slot}"
                    if b is None:
                        continue
                    if is_macro(b):
                        for line in macro_lines(b, keys, consumer, where, f"x.{slot}"):
                            w(line)
                        continue
                    bits, usage, keyname, mods = chord_info(b, keys, where)
                    w(f"        x.{slot} = chordBinding(0x{bits:02X}, {c_str(keyname)}, 0x{usage:02X});"
                      f"  // {'+'.join(mods + [keyname])}")
                if "url" in act:
                    u = act["url"]
                    if len(u) > 96 or any(not (0x20 <= ord(ch) <= 0x7E) for ch in u):
                        raise GenError(f"{mode}/{app}/{act['id']}/url: ASCII 96자 이하")
                    w("        x.hasUrl = true;")
                    w(f"        x.url = {c_str(u)};")
                w("        a.actions.push_back(x);")
                w("      }")
            w("      m.apps.push_back(a);")
            w("    }")
        w("  }")
    w("  return km;")
    w("}")
    w("")

    # ---------------------------------------------------------------- makeGesture
    im = g["imu"]
    am = g["airMouse"]
    fl = g["flick"]
    tc = g["touch"]
    tm = g["timing"]
    w("// ---------------------------------------------------------------------------")
    w("// wc::GestureConfig 채우기 (shared/gesture.json)")
    w("// ---------------------------------------------------------------------------")
    w("")
    w("inline GestureConfig makeGesture() {")
    w("  GestureConfig g;")
    w(f"  g.version = {int(g['version'])};")
    w(f"  g.imu.sampleRateHz = {c_num(im['sampleRateHz'])};")
    w(f"  g.imu.gyroRangeDps = {c_num(im['gyroRangeDps'])};")
    for i, ax in enumerate(AXES):
        w(f"  g.imu.axisMap[{i}] = {index_of(SENSOR_AXES, im['axisMap'][ax], '센서 축')};  // {ax} = {im['axisMap'][ax]}")
        sign = int(im["axisSign"][ax])
        if sign not in (1, -1):
            raise GenError(f"axisSign.{ax} 는 1 또는 -1 이어야 합니다")
        w(f"  g.imu.axisSign[{i}] = {sign};")
    bc = im["biasCalib"]
    w(f"  g.imu.biasCalib.enabled = {c_bool(bc['enabled'])};")
    w(f"  g.imu.biasCalib.stillThresholdDps = {c_num(bc['stillThresholdDps'])};")
    w(f"  g.imu.biasCalib.stillMs = {c_num(bc['stillMs'])};")
    w(f"  g.imu.biasCalib.trackTauMs = {c_num(bc['trackTauMs'])};")
    w(f"  g.airMouse.enabled = {c_bool(am['enabled'])};")
    w(f"  g.airMouse.holdToStartMs = {c_num(am['holdToStartMs'])};")
    w(f"  g.airMouse.startSuppressMs = {c_num(am['startSuppressMs'])};")
    w(f"  g.airMouse.deadzoneDps.enter = {c_num(am['deadzoneDps']['enter'])};")
    w(f"  g.airMouse.deadzoneDps.exit = {c_num(am['deadzoneDps']['exit'])};")
    w(f"  g.airMouse.lowpassTauMs = {c_num(am['lowpassTauMs'])};")
    w(f"  g.airMouse.curve.exponent = {c_num(am['curve']['exponent'])};")
    w(f"  g.airMouse.curve.maxPxPerReport = {c_num(am['curve']['maxPxPerReport'])};")
    w("  g.airMouse.sensitivity.clear();")
    for lvl in am["sensitivity"]:
        w(f"  g.airMouse.sensitivity.push_back(SensitivityLevel{{{c_str(lvl['name'])}, {c_num(lvl['gain'])}}});"
          f"  // {lvl['name']}")
    w(f"  g.airMouse.invertY = {c_bool(am['invertY'])};")
    w(f"  g.flick.enabled = {c_bool(fl['enabled'])};")
    if fl["detector"] not in ("accel", "gyro"):
        raise GenError("flick.detector 는 accel 또는 gyro 여야 합니다")
    w(f"  g.flick.detector = GestureConfig::Flick::Detector::{'Accel' if fl['detector'] == 'accel' else 'Gyro'};")
    for k in ['lpfTauMs', 'peakG', 'maxAboveMs', 'quietWindowMs', 'quietGuardMs', 'quietMaxRmsG']:
        w(f"  g.flick.accel.{k} = {c_num(fl['accel'][k])};")
    w(f"  g.flick.axis = {ENUM_AXIS[index_of(AXES, fl['axis'], '논리 축')]};")
    w(f"  g.flick.prefilterTauMs = {c_num(fl['prefilterTauMs'])};")
    w(f"  g.flick.peakThresholdDps = {c_num(fl['peakThresholdDps'])};")
    w(f"  g.flick.adaptive.enabled = {c_bool(fl['adaptive']['enabled'])};")
    w(f"  g.flick.adaptive.windowMs = {c_num(fl['adaptive']['windowMs'])};")
    w(f"  g.flick.adaptive.rmsMultiplier = {c_num(fl['adaptive']['rmsMultiplier'])};")
    w(f"  g.flick.axisDominanceRatio = {c_num(fl['axisDominanceRatio'])};")
    w(f"  g.flick.minAboveMs = {c_num(fl['minAboveMs'])};")
    w(f"  g.flick.maxAboveMs = {c_num(fl['maxAboveMs'])};")
    w(f"  g.flick.rebound.required = {c_bool(fl['rebound']['required'])};")
    w(f"  g.flick.rebound.windowMs = {c_num(fl['rebound']['windowMs'])};")
    w(f"  g.flick.rebound.minRatio = {c_num(fl['rebound']['minRatio'])};")
    w(f"  g.flick.rebound.minDps = {c_num(fl['rebound']['minDps'])};")
    w(f"  g.flick.quietBefore.windowMs = {c_num(fl['quietBefore']['windowMs'])};")
    w(f"  g.flick.quietBefore.guardMs = {c_num(fl['quietBefore']['guardMs'])};")
    w(f"  g.flick.quietBefore.maxRmsDps = {c_num(fl['quietBefore']['maxRmsDps'])};")
    w(f"  g.flick.cooldownMs = {c_num(fl['cooldownMs'])};")
    osign = int(fl["outwardSign"])
    if osign not in (1, -1):
        raise GenError("flick.outwardSign 은 1 또는 -1 이어야 합니다")
    w(f"  g.flick.outwardSign = {osign};")
    in_map = {"none": "None", "prev": "Prev", "next": "Next"}
    if fl["inAction"] not in in_map:
        raise GenError("flick.inAction 은 none, prev, next 중 하나여야 합니다")
    w(f"  g.flick.inAction = GestureConfig::Flick::InAction::{in_map[fl['inAction']]};")
    for k in ("tapMaxMovePx", "holdMs", "blackoutHoldMs", "swipeMinPx", "swipeMaxOffAxisPx", "swipeAxisRatio", "swipeMaxMs",
              "showSwipeMinPx", "showSwipeMaxOffAxisPx", "sheetPullMinPx", "pullMaxOffAxisPx", "pullMaxMs",
              "topEdgePx", "settingsCloseMinPx", "settingsCloseAxisRatio"):
        w(f"  g.touch.{k} = {c_num(tc[k])};")
    w(f"  g.button.longPressMs = {c_num(g['button']['longPressMs'])};")
    w(f"  g.button.powerOffHoldMs = {c_num(g['button']['powerOffHoldMs'])};")
    w(f"  g.button.powerConfirmTimeoutMs = {c_num(g['button']['powerConfirmTimeoutMs'])};")
    for k in ("sheetAutoCloseMs", "meetingEstimateResetMs", "settingsIdleCloseMs"):
        w(f"  g.timing.{k} = {c_num(tm[k])};")
    pw = g.get("power")  # 선택 항목(펌웨어 전용). 없으면 C++ 기본값
    if pw is not None:
        for k in ("screenOffMs", "brightnessPercent", "batteryPollMs"):
            w(f"  g.power.{k} = {c_num(pw[k])};")
        wr = pw["wristRaise"]
        w(f"  g.power.wristRaise.enabled = {'true' if wr['enabled'] else 'false'};")
        if int(wr["faceAxis"]) not in (0, 1, 2) or int(wr["faceSign"]) not in (1, -1):
            raise GenError("power.wristRaise.faceAxis 는 0..2, faceSign 은 ±1 이어야 합니다")
        w(f"  g.power.wristRaise.faceAxis = {int(wr['faceAxis'])};")
        w(f"  g.power.wristRaise.faceSign = {int(wr['faceSign'])};")
        for k in ("faceUpMinG", "minDeltaG", "windowMs"):
            w(f"  g.power.wristRaise.{k} = {c_num(wr[k])};")
    w("  return g;")
    w("}")
    w("")
    w("}  // namespace gen")
    w("}  // namespace wc")
    w("")
    return "\n".join(L)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="shared/*.json → firmware/main/generated/keymap_gen.h")
    ap.add_argument("--shared", type=Path, default=DEFAULT_SHARED, help="shared 폴더 (기본: 저장소 shared/)")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="출력 헤더 경로")
    ap.add_argument("--check", action="store_true", help="파일을 쓰지 않고 최신인지 검사만 한다(다르면 1)")
    args = ap.parse_args(argv)

    try:
        text = generate(args.shared)
    except (GenError, KeyError, TypeError, ValueError) as e:
        print(f"[gen_keymap_header] 오류: {e}", file=sys.stderr)
        return 2

    data = text.encode("utf-8")
    if args.check:
        old = args.out.read_bytes().replace(b"\r\n", b"\n") if args.out.exists() else None
        if old != data:
            print(f"[gen_keymap_header] {args.out} 가 shared/*.json 과 맞지 않습니다. "
                  "python tools/gen_keymap_header.py 로 다시 만드세요.", file=sys.stderr)
            return 1
        print(f"[gen_keymap_header] 최신입니다: {args.out}")
        return 0

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(data)
    print(f"[gen_keymap_header] 만들었습니다: {args.out} ({len(data)} 바이트)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
