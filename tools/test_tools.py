#!/usr/bin/env python3
"""tools/ 스크립트 단위 테스트 — python -m unittest discover -s tools -p "test_*.py"

- gen_keymap_header: 저장소 헤더가 최신인지, 출력이 매번 같은지, 잘못된 키 이름을 거부하는지, 음성 설정이 남아 있지 않은지
- firmware_site: 매니페스트 형식(offset 10진수 0), versions.json 정렬
"""
from __future__ import annotations

import io
import json
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import check_strings  # noqa: E402
import firmware_site  # noqa: E402
import gen_keymap_header as gen  # noqa: E402
import gen_strings_header  # noqa: E402
import ui_text  # noqa: E402

ROOT = HERE.parent
SHARED = ROOT / "shared"


def quiet(fn, *a, **kw):
    with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
        return fn(*a, **kw)


class GenKeymapHeaderTest(unittest.TestCase):
    def test_repo_header_is_current(self):
        self.assertEqual(quiet(gen.main, ["--check"]), 0, "firmware/main/generated/keymap_gen.h 를 다시 만드세요")

    def test_deterministic(self):
        self.assertEqual(gen.generate(SHARED), gen.generate(SHARED))

    def test_contains_every_binding(self):
        km = json.loads((SHARED / "keymap.json").read_text(encoding="utf-8"))
        text = gen.generate(SHARED)
        n = sum(1 for m in km["modes"].values() for a in m["apps"].values() for x in a["actions"]
                for os_ in ("win", "mac") if x.get(os_) and "steps" not in x[os_])
        self.assertIn(f"constexpr int kKeyBindingCount = {n};", text)

    def test_rejects_unknown_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            t = Path(tmp)
            for f in ("gesture.json", "hid-usage.json"):
                shutil.copy(SHARED / f, t / f)
            km = json.loads((SHARED / "keymap.json").read_text(encoding="utf-8"))
            km["modes"]["launch"]["apps"]["launcher"]["actions"][0]["win"]["key"] = "CTRLL"
            (t / "keymap.json").write_text(json.dumps(km, ensure_ascii=False), encoding="utf-8")
            with self.assertRaises(gen.GenError):
                gen.generate(t)
            self.assertEqual(quiet(gen.main, ["--shared", str(t), "--out", str(t / "x.h")]), 2)

    def test_no_voice_left(self):
        # 음성 기능은 2026-10-17 에 뺐다(docs/research/gemini-later.md). 생성 헤더에 음성 설정이 남으면 안 된다
        text = gen.generate(SHARED)
        self.assertNotIn("voice", text.lower())
        self.assertNotIn("pushToTalk", text)

    def test_c_string_escapes_utf8(self):
        self.assertEqual(gen.c_str("키"), '"\\355\\202\\244"')
        self.assertEqual(gen.c_str('a"\\'), '"a\\"\\\\"')


class FirmwareSiteTest(unittest.TestCase):
    def test_manifest(self):
        m = firmware_site.make_manifest("v0.1.0", "fw.bin")
        self.assertEqual(m["version"], "0.1.0")
        self.assertEqual(m["builds"][0]["chipFamily"], "ESP32-C6")
        self.assertEqual(m["builds"][0]["parts"], [{"path": "fw.bin", "offset": 0}])
        self.assertTrue(m["new_install_prompt_erase"])
        with self.assertRaises(ValueError):
            firmware_site.make_manifest("0.1", "fw.bin")

    def test_manifest_parts_keep_nvs(self):
        parts = [firmware_site.parse_part(s) for s in ("bl.bin@0x0", "pt.bin@0x8000", "app.bin@0x10000")]
        m = firmware_site.make_manifest("v0.1.0", parts=parts)
        self.assertEqual([p["offset"] for p in m["builds"][0]["parts"]], [0, 32768, 65536])
        with self.assertRaises(ValueError):
            firmware_site.make_manifest("v0.1.0", parts=list(reversed(parts)))

    def test_versions_sorted_newest_first(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "firmware"
            for v in ("v0.1.0", "v0.10.0", "v0.2.0"):
                d = root / v
                d.mkdir(parents=True)
                (d / "fw.bin").write_bytes(v.encode())
                quiet(firmware_site.main, ["manifest", "--version", v, "--bin", "fw.bin", "--out", str(d / "manifest.json"),
                                           "--date", "2026-10-16"])
            self.assertEqual(quiet(firmware_site.main, ["versions", "--dir", str(root), "--repo", "o/r"]), 0)
            data = json.loads((root / "versions.json").read_text(encoding="utf-8"))
            self.assertEqual([e["version"] for e in data["versions"]], ["v0.10.0", "v0.2.0", "v0.1.0"])
            self.assertEqual(data["latest"], "v0.10.0")
            self.assertEqual(data["versions"][0]["manifest"], "firmware/v0.10.0/manifest.json")
            self.assertEqual(len(data["versions"][0]["sha256"]), 64)


if __name__ == "__main__":
    unittest.main()


class UiTextTest(unittest.TestCase):
    """화면 문구(shared/strings.ko.json) → strings_gen.h · 글자 범위 · 커버리지(design/v2/README.md 1.2)"""

    def test_strings_header_is_current(self):
        self.assertEqual(quiet(gen_strings_header.main, ["--check"]), 0, "python tools/gen_strings_header.py 로 다시 만드세요")

    def test_c_ident(self):
        self.assertEqual(ui_text.c_ident("present.hintPrev"), "PRESENT_HINT_PREV")
        self.assertEqual(ui_text.c_ident("clock.dow0"), "CLOCK_DOW0")

    def test_charset_has_ascii_and_keymap_labels(self):
        cs = set(ui_text.charset())
        self.assertTrue(set(ui_text.ASCII) <= cs)
        for label in ui_text.keymap_texts():
            self.assertTrue(set(label) <= cs, label)

    def test_codepoint_ranges(self):
        self.assertEqual(ui_text.codepoint_ranges("abcx"), "0x61-0x63,0x78")

    def test_strip_c_comments_keeps_strings(self):
        src = 'a = "// 아님"; // 주석 한글' + chr(10) + '/* 블록 */ b = 1;'
        out = check_strings.strip_c_comments(src)
        self.assertIn('"// 아님"', out)
        self.assertNotIn("주석", out)
        self.assertNotIn("블록", out)

    def test_coverage(self):
        errs = quiet(check_strings.check)
        self.assertEqual(errs, [], "python tools/gen_fonts.py 로 글꼴을 다시 만드세요")
