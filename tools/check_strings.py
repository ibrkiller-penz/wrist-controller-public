#!/usr/bin/env python3
"""문구 커버리지 검사 — 화면에 쓰는 글자가 글꼴에 모두 있는지(CI)

검사
  1. strings_gen.h 가 shared/strings.ko.json 과 같은지(gen_strings_header --check)
  2. firmware/main/fonts/charset.txt 가 지금 문구로 뽑은 글자 범위와 같은지(문구를 바꾸고 글꼴을 안 만들었는지)
  3. kr_20/24/28/32.c 에 글자 범위가 전부 들어 있는지, num_128.c 에 '0-9 : -' 가 있는지(생성 파일 글리프 주석)
  4. 시뮬레이터 woff2 3종의 cmap 에 글자 범위가 전부 있는지(fontTools·brotli 가 있을 때. CI 는 설치한다)
  5. firmware/main/ui.cpp 에 한글 문자열 리터럴이 없는지(문구는 wc::str 상수로만 — 주석·ESP_LOG 직렬 로그는 제외)

사용법: python tools/check_strings.py     (실패하면 종료 코드 1)
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_strings_header  # noqa: E402
import ui_text  # noqa: E402

ROOT = ui_text.ROOT
UI_SOURCES = [ROOT / "firmware" / "main" / "ui.cpp"]


def strip_c_comments(src: str) -> str:
    """문자열 리터럴은 그대로 두고 //·/* */ 주석만 지운다"""
    out = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c == '"' or c == "'":
            j = i + 1
            while j < n and src[j] != c:
                j += 2 if src[j] == "\\" else 1
            out.append(src[i:j + 1])
            i = j + 1
        elif src.startswith("//", i):
            j = src.find("\n", i)
            i = n if j < 0 else j
        elif src.startswith("/*", i):
            j = src.find("*/", i + 2)
            i = n if j < 0 else j + 2
        else:
            out.append(c)
            i += 1
    return "".join(out)


def check() -> list[str]:
    errs: list[str] = []
    if gen_strings_header.main(["--check"]) != 0:
        errs.append("strings_gen.h 가 낡았습니다 → python tools/gen_strings_header.py")
    want = ui_text.charset()
    have = ui_text.CHARSET_TXT.read_text(encoding="utf-8").rstrip("\n") if ui_text.CHARSET_TXT.exists() else ""
    if have != want:
        extra = sorted(set(want) - set(have))
        errs.append("firmware/main/fonts/charset.txt 가 지금 문구와 다릅니다 → python tools/gen_fonts.py"
                    + (f" (새 글자: {''.join(extra)})" if extra else ""))
    need = {ord(c) for c in want}
    for name, _, _ in ui_text.TEXT_FONTS:
        p = ui_text.FONT_DIR / f"{name}.c"
        if not p.exists():
            errs.append(f"{p.relative_to(ROOT)} 없음 → python tools/gen_fonts.py")
            continue
        miss = need - ui_text.font_c_codepoints(p)
        if miss:
            errs.append(f"{name}.c 에 없는 글자: {''.join(chr(c) for c in sorted(miss))}")
    p = ui_text.FONT_DIR / f"{ui_text.NUM_FONT[0]}.c"
    miss = {ord(c) for c in ui_text.NUM_CHARS} - (ui_text.font_c_codepoints(p) if p.exists() else set())
    if miss:
        errs.append(f"num_128.c 에 없는 글자: {''.join(chr(c) for c in sorted(miss))}")
    try:
        from fontTools.ttLib import TTFont
        import brotli  # noqa: F401  (woff2 읽기에 필요)
    except ImportError:
        print("[check_strings] fontTools/brotli 없음 — woff2 검사 건너뜀 (pip install fonttools brotli)")
    else:
        for _, css in ui_text.SIM_WEIGHTS:
            p = ui_text.SIM_FONT_DIR / f"wc-pretendard-{css}.woff2"
            if not p.exists():
                errs.append(f"{p.relative_to(ROOT)} 없음 → python tools/gen_fonts.py")
                continue
            miss = need - set(TTFont(p).getBestCmap())
            if miss:
                errs.append(f"{p.name} 에 없는 글자: {''.join(chr(c) for c in sorted(miss))}")
    hangul = re.compile(r"[가-힣ㄱ-ㆎ]")
    for src in UI_SOURCES:
        code = strip_c_comments(src.read_text(encoding="utf-8"))
        for ln, line in enumerate(code.splitlines(), 1):
            if hangul.search(line) and "ESP_LOG" not in line:  # 직렬 로그는 화면 글자가 아니다
                errs.append(f"{src.relative_to(ROOT)}: 한글 리터럴(문구는 shared/strings.ko.json → wc::str): {line.strip()[:80]}")
    return errs


def main() -> int:
    errs = check()
    if errs:
        for e in errs:
            print(f"[check_strings] 실패: {e}", file=sys.stderr)
        return 1
    print(f"[check_strings] 통과 — 글자 {len(ui_text.charset())}개가 kr_20/24/28/32·woff2 에 모두 있음")
    return 0


if __name__ == "__main__":
    sys.exit(main())
