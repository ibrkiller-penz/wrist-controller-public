#!/usr/bin/env python3
"""시계 화면 문구·글자 범위 공용 모듈 — gen_strings_header.py · gen_fonts.py · check_strings.py 가 같이 쓴다.

글자 범위(charset)는 design/v2/README.md 1.2 를 따른다.
  - shared/strings.ko.json 의 모든 문구 + 이름 후보(nameCandidates)
  - shared/keymap.json 의 모드 이름·앱 이름·동작 라벨·기본 장치 이름
  - shared/gesture.json 의 에어마우스 감도 이름
  - ASCII 0x20~0x7E(95자) — 키 표기(Win+1, F5), 제품명(Zoom·PC·BLE), 숫자
네 텍스트 글꼴(kr_20/24/28/32)과 시뮬레이터 woff2 는 모두 같은 범위를 쓴다(도구를 하나로 유지).
큰 숫자 글꼴 num_128 은 NUM_CHARS 만 넣는다.

표준 라이브러리만 쓴다.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHARED = ROOT / "shared"
STRINGS_JSON = SHARED / "strings.ko.json"
FONT_DIR = ROOT / "firmware" / "main" / "fonts"
CHARSET_TXT = FONT_DIR / "charset.txt"
SIM_FONT_DIR = ROOT / "sim" / "src" / "watch" / "fonts"

ASCII = "".join(chr(c) for c in range(0x20, 0x7F))
# 시계 HH:MM · 발표 MM:SS · 동기화 전 '--:--'
NUM_CHARS = "0123456789:-"

# 텍스트 글꼴 4종 + 숫자 1종(design/v2/README.md 1.2 표). weight 는 Pretendard 굵기 파일 이름
TEXT_FONTS = [
    ("kr_20", 20, "Medium"),
    ("kr_24", 24, "SemiBold"),
    ("kr_28", 28, "Bold"),
    ("kr_32", 32, "Bold"),
]
NUM_FONT = ("num_128", 128, "SemiBold")
# 시뮬레이터 woff2(굵기 = CSS font-weight)
SIM_WEIGHTS = [("Medium", 500), ("SemiBold", 600), ("Bold", 700)]

_KEY_RE = re.compile(r"^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$")


def load_strings(path: Path = STRINGS_JSON) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    strings = data.get("strings")
    if not isinstance(strings, dict) or not strings:
        raise ValueError(f"{path}: 'strings' 객체가 없습니다")
    for k, v in strings.items():
        if not _KEY_RE.match(k):
            raise ValueError(f"{path}: 키 이름 '{k}' 는 'group.name' 꼴(영문 소문자로 시작)이어야 합니다")
        if not isinstance(v, str) or not v:
            raise ValueError(f"{path}: '{k}' 값은 빈 문자열이 아니어야 합니다")
        if "\n" in v:
            raise ValueError(f"{path}: '{k}' 에 줄바꿈이 있습니다(한 줄 문구만)")
        for m in re.finditer(r"%(.)", v):
            if m.group(1) not in "ds%":
                raise ValueError(f"{path}: '{k}' 의 자리 표시 '%{m.group(1)}' — %d, %s 만 씁니다")
    return data


def keymap_texts(shared: Path = SHARED) -> list[str]:
    km = json.loads((shared / "keymap.json").read_text(encoding="utf-8"))
    out = [km["settings"]["deviceName"]]
    for mode in km["modes"].values():
        out.append(mode.get("name", ""))
        for app in mode.get("apps", {}).values():
            out.append(app.get("name", ""))
            for a in app.get("actions", []):
                out.append(a.get("label", ""))
    g = json.loads((shared / "gesture.json").read_text(encoding="utf-8"))
    for lv in g["airMouse"]["sensitivity"]:
        out.append(lv.get("name", ""))
    return out


def all_texts(shared: Path = SHARED) -> list[str]:
    data = load_strings(shared / "strings.ko.json")
    texts = list(data["strings"].values()) + list(data.get("nameCandidates", []))
    return texts + keymap_texts(shared)


def charset(shared: Path = SHARED) -> str:
    """텍스트 글꼴에 넣을 글자(정렬, 중복 없음)"""
    chars = set(ASCII)
    for t in all_texts(shared):
        for ch in t:
            if ch == "\t" or ord(ch) < 0x20:
                raise ValueError(f"제어 문자가 섞인 문구: {t!r}")
            chars.add(ch)
    return "".join(sorted(chars))


def codepoint_ranges(chars: str) -> str:
    """lv_font_conv -r 인자: 연속 구간은 a-b 로 묶은 16진 목록"""
    cps = sorted({ord(c) for c in chars})
    parts = []
    i = 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        parts.append(f"0x{cps[i]:X}" if i == j else f"0x{cps[i]:X}-0x{cps[j]:X}")
        i = j + 1
    return ",".join(parts)


def c_ident(key: str) -> str:
    """'present.hintPrev' → 'PRESENT_HINT_PREV'"""
    out = []
    for part in key.split("."):
        out.append(re.sub(r"(?<!^)(?=[A-Z])", "_", part).upper())
    return "_".join(out)


_GLYPH_RE = re.compile(r"/\*\s*U\+([0-9A-Fa-f]{4,6})\s")


def font_c_codepoints(path: Path) -> set[int]:
    """lv_font_conv 가 만든 .c 의 글리프 주석(/* U+AC00 "가" */)에서 글자 목록을 읽는다"""
    text = path.read_text(encoding="utf-8")
    return {int(m.group(1), 16) for m in _GLYPH_RE.finditer(text)}
