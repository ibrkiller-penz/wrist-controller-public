#!/usr/bin/env python3
"""작은 A8(알파 8비트) 아이콘 비트맵 → firmware/main/fonts/img_*.c (LVGL 9 lv_image_dsc_t)

LVGL 기호 글꼴에 자물쇠가 없어서(design/v2/README.md 2.1) 상태줄·발표 잠금 배지용 자물쇠를 만든다.
A8 이미지는 style image_recolor 색으로 칠해진다(색은 ui.cpp 가 C_LOCK 으로 정한다). 28×28 = 784 B.
모양은 4×4 슈퍼샘플링으로 가장자리를 부드럽게 한다. 표준 라이브러리만 쓴다.

사용법: python tools/gen_icons.py
"""
from __future__ import annotations

import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "firmware" / "main" / "fonts"
SS = 4  # 슈퍼샘플


def lock_cov(x: float, y: float) -> bool:
    """28×28 좌표계에서 (x, y) 가 자물쇠 안인가"""
    # 몸통: x 5..23, y 12..25, 모서리 반경 3, 열쇠 구멍(원 r 2.2 + 아래 홈)은 비운다
    bx0, by0, bx1, by1, r = 5.0, 12.0, 23.0, 25.5, 3.0
    if bx0 <= x <= bx1 and by0 <= y <= by1:
        cx = min(max(x, bx0 + r), bx1 - r)
        cy = min(max(y, by0 + r), by1 - r)
        if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
            if (x - 14) ** 2 + (y - 17.6) ** 2 <= 2.2 ** 2:
                return False
            if 13.0 <= x <= 15.0 and 17.6 <= y <= 21.6:
                return False
            return True
    # 고리: 중심 (14, 11), 바깥 반경 7, 두께 3, 위쪽 반원 + 몸통까지 내려오는 다리
    d = math.hypot(x - 14, y - 11)
    if y <= 11 and 4.0 <= d <= 7.0:
        return True
    if 11 < y <= 13 and (7.0 <= x <= 10.0 or 18.0 <= x <= 21.0):
        return True
    return False


def render(fn, w: int, h: int) -> bytes:
    out = bytearray()
    for py in range(h):
        for px in range(w):
            n = sum(fn(px + (i + 0.5) / SS, py + (j + 0.5) / SS) for i in range(SS) for j in range(SS))
            out.append(round(255 * n / (SS * SS)))
    return bytes(out)


def write_c(name: str, w: int, h: int, data: bytes, what: str) -> None:
    rows = []
    for y in range(h):
        rows.append("    " + ", ".join(f"0x{b:02X}" for b in data[y * w:(y + 1) * w]) + ",")
    text = "\n".join([
        f"// 자동 생성 파일 — 고치지 마세요. 만든 도구: tools/gen_icons.py ({what})",
        f"// A8 {w}×{h} = {len(data)} B. style image_recolor 색으로 그린다.",
        '#include "lvgl.h"',
        "",
        f"static const LV_ATTRIBUTE_MEM_ALIGN uint8_t {name}_map[] = {{",
        *rows,
        "};",
        "",
        f"const lv_image_dsc_t {name} = {{",
        "    .header = {",
        "        .magic = LV_IMAGE_HEADER_MAGIC,",
        "        .cf = LV_COLOR_FORMAT_A8,",
        "        .flags = 0,",
        f"        .w = {w},",
        f"        .h = {h},",
        f"        .stride = {w},",
        "    },",
        f"    .data_size = sizeof({name}_map),",
        f"    .data = {name}_map,",
        "};",
        "",
    ])
    p = OUT_DIR / f"{name}.c"
    p.write_text(text, encoding="utf-8", newline="\n")
    print(f"[gen_icons] {p.relative_to(ROOT)} ({len(data)} B)")


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    write_c("img_lock_28", 28, 28, render(lock_cov, 28, 28), "자물쇠 28px")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
