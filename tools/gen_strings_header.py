#!/usr/bin/env python3
"""shared/strings.ko.json → firmware/main/generated/strings_gen.h (시계 화면 문구 한 곳)

펌웨어 ui.cpp 는 문구를 코드에 쓰지 않고 wc::str::KEY 상수를 쓴다. 시뮬레이터는 같은 JSON 을 직접 읽는다.
키 'present.hintPrev' → 상수 PRESENT_HINT_PREV. 값은 UTF-8 문자열 그대로(%d·%s 는 snprintf 자리 표시).

사용법
  python tools/gen_strings_header.py            # 헤더를 (다시) 만든다
  python tools/gen_strings_header.py --check    # 최신인지만 검사(CI). 다르면 종료 코드 1

표준 라이브러리만 쓴다.
"""
from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ui_text  # noqa: E402

OUT = ui_text.ROOT / "firmware" / "main" / "generated" / "strings_gen.h"


def c_str(s: str) -> str:
    out = []
    for ch in s:
        if ch == "\\":
            out.append("\\\\")
        elif ch == '"':
            out.append('\\"')
        else:
            out.append(ch)
    return '"' + "".join(out) + '"'


def generate(path: Path = ui_text.STRINGS_JSON) -> str:
    data = ui_text.load_strings(path)
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()[:12]
    lines = [
        "// 자동 생성 파일 — 고치지 마세요. 원본: shared/strings.ko.json",
        "// 다시 만들기: python tools/gen_strings_header.py   (CI 는 --check 로 최신인지 확인)",
        f"// 원본 해시(sha256 앞 12자리): {digest}",
        "#pragma once",
        "",
        f'#define WC_STRINGS_GEN_HASH "{digest}"',
        "",
        "namespace wc::str {",
        "",
    ]
    seen = set()
    for key, val in data["strings"].items():
        ident = ui_text.c_ident(key)
        if ident in seen:
            raise ValueError(f"상수 이름이 겹칩니다: {ident}")
        seen.add(ident)
        lines.append(f"inline constexpr const char* {ident} = {c_str(val)};")
    names = data.get("nameCandidates", [])
    lines += [
        "",
        "// 블루투스 이름 후보(설정 '블루투스 이름' — 뒤에 공백 + MAC 끝 4자리를 붙인다)",
        f"inline constexpr int NAME_CANDIDATE_COUNT = {len(names)};",
        "inline constexpr const char* NAME_CANDIDATES[] = {" + ", ".join(c_str(n) for n in names) + "};",
        "",
        "}  // namespace wc::str",
        "",
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="헤더가 최신인지만 검사")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args(argv)
    text = generate()
    if args.check:
        cur = args.out.read_text(encoding="utf-8") if args.out.exists() else ""
        if cur != text:
            print(f"[gen_strings_header] {args.out} 가 shared/strings.ko.json 과 다릅니다. "
                  "python tools/gen_strings_header.py 로 다시 만드세요.", file=sys.stderr)
            return 1
        print("[gen_strings_header] 최신")
        return 0
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(text, encoding="utf-8", newline="\n")
    print(f"[gen_strings_header] 만들었습니다: {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
