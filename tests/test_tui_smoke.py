#!/usr/bin/env python3
import fcntl
import os
from pathlib import Path
import pty
import re
import select
import shutil
import signal
import struct
import subprocess
import tempfile
import termios
import time

ROOT = Path(__file__).resolve().parents[1]
ANSI = re.compile(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\)|_[^\x1b]*(?:\x1b\\))")


def run_tui(columns: int, toggle_hacking: bool = True) -> str:
    home = Path(tempfile.mkdtemp(prefix="yorha-tui-"))
    try:
        env = {**os.environ, "HOME": str(home), "TERM": "xterm-kitty", "COLUMNS": str(columns), "LINES": "35"}
        subprocess.run(["bash", str(ROOT / "install.sh")], env=env, check=True, stdout=subprocess.DEVNULL)
        master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 35, columns, 0, 0))
        process = subprocess.Popen(
            ["pi", "--no-session"],
            stdin=slave, stdout=slave, stderr=slave, close_fds=True, start_new_session=True, env=env, cwd=home,
        )
        os.close(slave)
        os.set_blocking(master, False)
        output = bytearray()
        start = time.time()
        sent_mode = sent_panel = sent_exit = False
        while time.time() - start < 8:
            try:
                chunk = os.read(master, 65536)
                if chunk:
                    output.extend(chunk)
            except (BlockingIOError, OSError):
                pass
            elapsed = time.time() - start
            if toggle_hacking and elapsed > 2.0 and not sent_mode:
                os.write(master, b"\x1b[Z")  # Shift+Tab
                sent_mode = True
            if toggle_hacking and elapsed > 3.0 and not sent_panel:
                os.write(master, b"\x1b[104;6u")  # Ctrl+Shift+H (Kitty protocol)
                sent_panel = True
            if elapsed > 5.0 and not sent_exit:
                os.write(master, b"\x04")
                sent_exit = True
            if process.poll() is not None:
                break
            time.sleep(0.04)
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
        for _ in range(10):
            try:
                chunk = os.read(master, 65536)
                if chunk:
                    output.extend(chunk)
            except (BlockingIOError, OSError):
                break
        os.close(master)
        return ANSI.sub("", output.decode("utf-8", "replace"))
    finally:
        shutil.rmtree(home, ignore_errors=True)


wide = run_tui(120)
Path("/tmp/yorha-tui-wide.txt").write_text(wide)
assert "Y o R H a" in wide, wide[-3000:]
assert "[Context]" not in wide and "[Skills]" not in wide and "[Extensions]" not in wide and "[Themes]" not in wide
assert "OPERATOR INPUT CHANNEL" in wide
assert "HACKING UNIT ARMED · TRIAGE" in wide
assert "◇ OFFLINE" in wide
assert re.search(r"HACKING UNIT ARMED · TRIAGE\s+unknown\s+OFF\s+CTX", wide)
wide_lines = wide.splitlines()
pod_line = next(line for line in reversed(wide_lines) if line.startswith("POD 042"))
analysis_line = next(line for line in reversed(wide_lines) if line.startswith("Proposal: begin"))
editor_line = next(line for line in reversed(wide_lines) if "OPERATOR INPUT CHANNEL" in line and "LINK · HACKING · INSERT" in line)
assert pod_line.index("POD 042") == analysis_line.index("Proposal: begin") == 0
assert "LOCAL" not in pod_line and "LINK" not in pod_line
status_start = editor_line.index("LINK · HACKING · INSERT")
title_center = editor_line.index("OPERATOR INPUT CHANNEL") + len("OPERATOR INPUT CHANNEL") / 2
assert abs(title_center - status_start / 2) <= 2
assert editor_line.rstrip().endswith("LINK · HACKING · INSERT")
assert "BRANCH NO BRANCH" not in wide
assert " CTF " not in wide
assert "HACKING MODE" in wide, wide[-3000:]
assert "HACKING UNIT" in wide, wide[-3000:]
assert "conflicts with built-in shortcut" not in wide
assert "TypeError" not in wide and "Extension error" not in wide

build = run_tui(120, toggle_hacking=False)
Path("/tmp/yorha-tui-build.txt").write_text(build)
assert "BUILD UNIT READY" in build, build[-3000:]
build_lines = build.splitlines()
build_pod = next(line for line in reversed(build_lines) if line.startswith("POD 042"))
build_analysis = next(line for line in reversed(build_lines) if line.startswith("Analysis: Build Unit ready"))
build_editor = next(line for line in reversed(build_lines) if "OPERATOR INPUT CHANNEL" in line and "LOCAL · BUILD · INSERT" in line)
assert build_pod.index("POD 042") == build_analysis.index("Analysis: Build Unit ready") == 0
assert "LOCAL" not in build_pod and "LINK" not in build_pod
assert build_editor.rstrip().endswith("LOCAL · BUILD · INSERT")

narrow = run_tui(109)
Path("/tmp/yorha-tui-narrow.txt").write_text(narrow)
assert "HACKING MODE" in narrow, narrow[-3000:]
assert "requires at least 110 columns" in narrow
assert "TypeError" not in narrow and "Extension error" not in narrow
print("TUI smoke contract OK at 120 and 109 columns")
