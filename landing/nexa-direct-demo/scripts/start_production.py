#!/usr/bin/env python3
"""Run NexaDirect console + mock EDC behind nginx for production hosting."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROCS: list[tuple[str, subprocess.Popen]] = []


def _shutdown(*_args) -> None:
    for _name, proc in PROCS:
        try:
            proc.terminate()
        except OSError:
            pass
    sys.exit(0)


def _spawn(name: str, cmd: list[str], **env_extra: str) -> subprocess.Popen:
    env = os.environ.copy()
    env.update(env_extra)
    env.setdefault("BIND_HOST", "127.0.0.1")
    env.setdefault("EDC_PUBLIC_BASE", "/edc")
    env.setdefault("SCRIPT_ROOT", "/edc")
    env.setdefault("CONSOLE_PORT", "5070")
    env.setdefault("RAVE_PORT", "5071")
    proc = subprocess.Popen(cmd, cwd=ROOT, env=env)
    PROCS.append((name, proc))
    return proc


def _restart_dead() -> None:
    py = sys.executable
    for idx, (name, proc) in enumerate(list(PROCS)):
        if proc.poll() is None:
            continue
        print(f"{name} exited with code {proc.returncode}; restarting...", file=sys.stderr)
        if name == "mock-edc":
            PROCS[idx] = (name, _spawn(name, [py, "mock_rave/app.py"]))
        elif name == "console":
            PROCS[idx] = (name, _spawn(name, [py, "console/app.py"]))


def main() -> int:
    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    port = os.environ.get("PORT", "8080")
    nginx_template = ROOT / "deploy" / "nginx.conf.template"
    nginx_out = Path("/tmp/nexadirect-nginx.conf")
    if not nginx_template.exists():
        print(f"Missing {nginx_template}", file=sys.stderr)
        return 1

    nginx_conf = nginx_template.read_text(encoding="utf-8").replace("__PORT__", port)
    nginx_out.write_text(nginx_conf, encoding="utf-8")

    py = sys.executable
    _spawn("mock-edc", [py, "mock_rave/app.py"])
    time.sleep(0.5)
    _spawn("console", [py, "console/app.py"])
    time.sleep(0.5)

    for name, proc in PROCS:
        if proc.poll() is not None:
            print(f"{name} failed to start.", file=sys.stderr)
            _shutdown()
            return 1

    nginx = subprocess.Popen(["nginx", "-c", str(nginx_out), "-g", "daemon off;"])
    try:
        while True:
            code = nginx.poll()
            if code is not None:
                return code
            _restart_dead()
            time.sleep(5)
    finally:
        _shutdown()


if __name__ == "__main__":
    raise SystemExit(main())
