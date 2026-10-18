#!/usr/bin/env python3
"""글꼴 파이프라인 — 화면 문구(shared/strings.ko.json 등) → LVGL 글꼴 C 파일 + 시뮬레이터 woff2 서브셋

design/v2/README.md 1.2 확정 목록:
  kr_20 (Pretendard Medium 20, 4bpp 압축)   kr_24 (SemiBold 24, 압축)
  kr_28 (Bold 28, 압축)                    kr_32 (Bold 32, 압축)
  num_128 (SemiBold 128, 4bpp **비압축**, '0-9 : -' 12자 — 그릴 때 힙 임시 버퍼·해제 CPU 를 없앤다)
  kr_* 의 fallback = lv_font_montserrat_20(LV_SYMBOL_BLUETOOTH·BATTERY·WARNING 등 기호)

만드는 것
  firmware/main/fonts/kr_20.c … kr_32.c, num_128.c   (커밋한다 — IDF 빌드는 생성 도구 없이 된다)
  firmware/main/fonts/charset.txt                   (글자 범위 기록, check_strings.py 가 비교)
  sim/src/watch/fonts/wc-pretendard-{500,600,700}.woff2  (같은 글자 범위 서브셋)

원본 글꼴: tools/fonts/pretendard/Pretendard-{Medium,SemiBold,Bold}.otf (Pretendard 1.3.9, SIL OFL 1.1 — 같은 폴더 LICENSE.txt)

필요한 것
  - Node.js + tools/fonts 에서 `npm ci`(lv_font_conv 1.5.3 고정, package-lock.json)
  - Python fontTools + brotli(woff2):  pip install fonttools==4.65.0 brotli==1.2.0

사용법
  python tools/gen_fonts.py            # 모두 다시 만든다
  python tools/gen_fonts.py --no-web   # LVGL C 파일만
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ui_text  # noqa: E402

ROOT = ui_text.ROOT
SRC_DIR = ROOT / "tools" / "fonts" / "pretendard"
CONV = ROOT / "tools" / "fonts" / "node_modules" / "lv_font_conv" / "lv_font_conv.js"
FALLBACK = "lv_font_montserrat_20"


def otf(weight: str) -> Path:
    p = SRC_DIR / f"Pretendard-{weight}.otf"
    if not p.exists():
        raise SystemExit(f"원본 글꼴이 없습니다: {p}")
    return p


def check_source_coverage(chars: str) -> None:
    """원본 글꼴에 없는 글자는 만들어도 빈칸이 된다 → 먼저 멈춘다"""
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        print("[gen_fonts] fontTools 없음 — 원본 글꼴 글자 확인을 건너뜀", file=sys.stderr)
        return
    for weight in {w for _, _, w in ui_text.TEXT_FONTS} | {ui_text.NUM_FONT[2]}:
        cmap = TTFont(otf(weight)).getBestCmap()
        missing = [c for c in chars if ord(c) not in cmap]
        if missing:
            raise SystemExit(f"Pretendard-{weight} 에 없는 글자: {' '.join(missing)} — 문구를 바꾸세요")


def lv_font(name: str, size: int, weight: str, chars: str, compress: bool, fallback: str | None) -> None:
    if not CONV.exists():
        raise SystemExit(f"lv_font_conv 가 없습니다: {CONV}\n  cd tools/fonts && npm ci")
    out = ui_text.FONT_DIR / f"{name}.c"
    cmd = [
        "node", str(CONV),
        "--font", str(otf(weight)), "-r", ui_text.codepoint_ranges(chars),
        "--size", str(size), "--bpp", "4", "--format", "lvgl",
        "--lv-include", "lvgl.h", "--lv-font-name", name,
        "-o", str(out),
    ]
    if not compress:
        cmd.append("--no-compress")
    if fallback:
        cmd += ["--lv-fallback", fallback]
    subprocess.run(cmd, check=True, cwd=ROOT)
    # 생성 파일 머리의 'Opts:' 줄에 이 PC 의 절대 경로가 들어간다 → 저장소 상대 경로로 바꿔 결과를 PC 와 무관하게
    text = out.read_text(encoding="utf-8")
    text = text.replace(str(otf(weight)), f"tools/fonts/pretendard/Pretendard-{weight}.otf")
    text = text.replace(str(out), f"firmware/main/fonts/{name}.c")
    out.write_text(text, encoding="utf-8", newline="\n")
    print(f"[gen_fonts] {out.relative_to(ROOT)}  {out.stat().st_size:,} B (C 소스)")


def web_fonts(chars: str) -> None:
    from fontTools import subset

    ui_text.SIM_FONT_DIR.mkdir(parents=True, exist_ok=True)
    for weight, css in ui_text.SIM_WEIGHTS:
        out = ui_text.SIM_FONT_DIR / f"wc-pretendard-{css}.woff2"
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["kern", "liga", "tnum"]
        opts.name_IDs = ["*"]  # 저작권·라이선스 이름 기록 유지(OFL)
        opts.notdef_outline = True  # 범위 밖 글자는 두부(▯) 대신 .notdef 로 — 누락을 눈으로 찾기
        font = subset.load_font(str(otf(weight)), opts)
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=[ord(c) for c in chars])
        sub.subset(font)
        subset.save_font(font, str(out), opts)
        print(f"[gen_fonts] {out.relative_to(ROOT)}  {out.stat().st_size:,} B")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--no-web", action="store_true", help="시뮬레이터 woff2 는 만들지 않음")
    args = ap.parse_args(argv)

    chars = ui_text.charset()
    check_source_coverage(chars)
    ui_text.FONT_DIR.mkdir(parents=True, exist_ok=True)
    ui_text.CHARSET_TXT.write_text(chars + "\n", encoding="utf-8", newline="\n")
    hangul = sum(1 for c in chars if 0xAC00 <= ord(c) <= 0xD7A3)
    print(f"[gen_fonts] 글자 {len(chars)}개(한글 {hangul}, ASCII {len(ui_text.ASCII)}, 기타 {len(chars) - hangul - len(ui_text.ASCII)})")
    for name, size, weight in ui_text.TEXT_FONTS:
        lv_font(name, size, weight, chars, compress=True, fallback=FALLBACK)
    name, size, weight = ui_text.NUM_FONT
    lv_font(name, size, weight, ui_text.NUM_CHARS, compress=False, fallback=None)
    if not args.no_web:
        web_fonts(chars)
    return 0


if __name__ == "__main__":
    sys.exit(main())
