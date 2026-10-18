#!/usr/bin/env python3
"""펌웨어 웹 설치용 파일 만들기 — ESP Web Tools 매니페스트와 버전 목록(versions.json).

근거: docs/research/firmware-stack.md 6장
  - GitHub Release 자산 URL 은 CORS 헤더가 없어 브라우저(ESP Web Tools)가 직접 받지 못한다.
    → Release 에는 보관용으로 올리고, 설치 페이지용 사본은 시뮬레이션 사이트와 같은 출처
      (sim/dist/firmware/vX.Y.Z/) 에 함께 배포한다.
  - 매니페스트 offset 은 10진수. 파일 3개를 나눠 쓴다(2026-10-18 실기 피드백 4):
      부트로더 0(0x0) · 파티션 표 32768(0x8000) · 앱 65536(0x10000).
    합친 이미지(merge-bin) 하나를 0 에 쓰면 merge-bin 이 0x8C00~0x10000 빈칸을 0xFF 로 채워
    NVS(0x9000~0xF000, 페어링 본드·설정)와 phy_init 을 덮어쓴다 → 쓸 때마다 본드가 지워져 Windows 의 옛 키로
    암호화가 실패한다. 합친 이미지는 '처음 설치·완전 초기화용' 보관 파일로만 남긴다.
  - new_install_prompt_erase=true: 지울지 사용자가 고른다(페어링·설정이 든 NVS 를 지키려고).
  - new_install_improv_wait_time=0: Improv Serial 을 쓰지 않으므로 대기하지 않는다.

사용법
  # 1) 매니페스트 하나
  python tools/firmware_site.py manifest --version v0.1.0 \
      --part wrist-controller-v0.1.0-bootloader.bin@0x0 --part wrist-controller-v0.1.0-partition-table.bin@0x8000 \
      --part wrist-controller-v0.1.0-app.bin@0x10000 --out out/v0.1.0/manifest.json
  (--bin X 하나만 주면 예전처럼 X 를 offset 0 에 — 시험용)
  # 2) 사이트 폴더(dist/firmware) 안의 vX.Y.Z/manifest.json 들을 훑어 versions.json 생성
  python tools/firmware_site.py versions --dir sim/dist/firmware --repo owner/name

versions.json 형식(설치 페이지 sim/src/install 이 읽는다 — 경로는 사이트 루트 기준 상대 경로)
  {
    "latest": "v0.2.0",
    "versions": [
      {"version": "v0.2.0", "date": "2026-11-01", "manifest": "firmware/v0.2.0/manifest.json",
       "bin": "firmware/v0.2.0/wrist-controller-v0.2.0-merged.bin", "sha256": "…",
       "notes": "https://github.com/owner/name/releases/tag/v0.2.0"},
      …                                    (새 버전이 앞)
    ]
  }

표준 라이브러리만 쓴다.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import re
import sys
from pathlib import Path

PRODUCT_NAME = "손목 컨트롤러"
CHIP_FAMILY = "ESP32-C6"  # 실물 칩 ESP32-C6 (firmware-stack.md 0장)
VERSION_RE = re.compile(r"^v(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.]+)?$")  # 수동 빌드 개발판 v0.0.0-dev.<커밋> 허용


def parse_version(v: str):
    m = VERSION_RE.match(v)
    if not m:
        raise ValueError(f"버전 형식은 vX.Y.Z(또는 vX.Y.Z-dev.xxx) 여야 합니다: {v!r}")
    return tuple(int(x) for x in m.groups())


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_part(spec: str) -> dict:
    """'파일@0x8000' → {"path": 파일, "offset": 32768}"""
    path, sep, off = spec.rpartition("@")
    if not sep or not path:
        raise ValueError(f"--part 형식은 파일@오프셋 입니다: {spec!r}")
    return {"path": path, "offset": int(off, 0)}


def make_manifest(version: str, bin_name: str | None = None, parts: list[dict] | None = None) -> dict:
    parse_version(version)
    if not parts:
        if not bin_name:
            raise ValueError("--bin 또는 --part 가 필요합니다")
        parts = [{"path": bin_name, "offset": 0}]
    offsets = [p["offset"] for p in parts]
    if offsets != sorted(offsets) or len(set(offsets)) != len(offsets):
        raise ValueError(f"parts 오프셋은 겹치지 않고 오름차순이어야 합니다: {offsets}")
    return {
        "name": PRODUCT_NAME,
        "version": version.lstrip("v"),
        "new_install_prompt_erase": True,
        "new_install_improv_wait_time": 0,
        "builds": [
            {
                "chipFamily": CHIP_FAMILY,
                "parts": parts,
            }
        ],
    }


def cmd_manifest(args) -> int:
    man = make_manifest(args.version, args.bin, [parse_part(p) for p in (args.part or [])])
    if args.date:
        man["x_build_date"] = args.date
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(man, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[firmware_site] 매니페스트: {args.out}")
    return 0


def cmd_versions(args) -> int:
    root: Path = args.dir
    entries = []
    for d in sorted(root.iterdir()) if root.exists() else []:
        if not d.is_dir() or not VERSION_RE.match(d.name):
            continue
        man_path = d / "manifest.json"
        if not man_path.exists():
            print(f"[firmware_site] 경고: {man_path} 없음 — 건너뜀", file=sys.stderr)
            continue
        man = json.loads(man_path.read_text(encoding="utf-8"))
        parts = man["builds"][0]["parts"]
        # 'bin' = 앱(가장 큰 오프셋) — 설치 페이지 표시·해시용. parts 는 전부 기록
        bin_rel = parts[-1]["path"]
        bin_path = d / bin_rel
        entry = {
            "version": d.name,
            "date": man.get("x_build_date") or _dt.date.fromtimestamp(man_path.stat().st_mtime).isoformat(),
            "manifest": f"{args.prefix}/{d.name}/manifest.json",
            "bin": f"{args.prefix}/{d.name}/{bin_rel}",
            "parts": [{"path": f"{args.prefix}/{d.name}/{p['path']}", "offset": p["offset"]} for p in parts],
        }
        if bin_path.exists():
            entry["sha256"] = sha256_of(bin_path)
        if args.repo:
            entry["notes"] = f"https://github.com/{args.repo}/releases/tag/{d.name}"
        entries.append(entry)
    entries.sort(key=lambda e: parse_version(e["version"]), reverse=True)
    out = {"latest": entries[0]["version"] if entries else None, "versions": entries}
    target = root / "versions.json"
    root.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[firmware_site] {target}: {len(entries)}개 버전")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="ESP Web Tools 매니페스트·versions.json 생성")
    sub = ap.add_subparsers(dest="cmd", required=True)

    m = sub.add_parser("manifest", help="매니페스트 하나 만들기")
    m.add_argument("--version", required=True, help="태그(vX.Y.Z)")
    m.add_argument("--bin", help="파일 하나를 offset 0 에(시험용). 보통은 --part 3개")
    m.add_argument("--part", action="append", help="파일@오프셋(예 app.bin@0x10000). 여러 번")
    m.add_argument("--out", required=True, type=Path)
    m.add_argument("--date", help="빌드 날짜 YYYY-MM-DD (설치 페이지 표시용)")
    m.set_defaults(func=cmd_manifest)

    v = sub.add_parser("versions", help="firmware 폴더를 훑어 versions.json 만들기")
    v.add_argument("--dir", required=True, type=Path, help="사이트의 firmware 폴더(예 sim/dist/firmware)")
    v.add_argument("--prefix", default="firmware", help="사이트 루트에서 본 firmware 폴더 경로")
    v.add_argument("--repo", help="owner/name — 변경 내역 링크용")
    v.set_defaults(func=cmd_versions)

    args = ap.parse_args(argv)
    try:
        return args.func(args)
    except (ValueError, KeyError, OSError) as e:
        print(f"[firmware_site] 오류: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
