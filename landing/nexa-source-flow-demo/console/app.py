"""Nexa Source Flow demo console — port 5050."""

from __future__ import annotations

import json
import queue
import sys
import threading
import time
import webbrowser
from pathlib import Path

from flask import Flask, Response, jsonify, render_template, request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from shared.constants import (
    ALL_SUBJECTS,
    BUILD_VERSION,
    CONSOLE_PORT,
    DEMO_STUDIES,
    GROUP_1,
    GROUP_2,
    RAVE_PORT,
    STUDY_ID,
    VISITS,
)
from shared.edc_store import reset as reset_edc
from shared.job_state import JOB
from shared.sync_simulator import launch_sync

app = Flask(__name__, template_folder="templates")


@app.after_request
def no_cache(resp):
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return resp


@app.route("/")
def index():
    return render_template(
        "index.html",
        subjects=ALL_SUBJECTS,
        group1=GROUP_1,
        group2=GROUP_2,
        visits=VISITS,
        studies=DEMO_STUDIES,
        study_id=STUDY_ID,
        build=BUILD_VERSION,
        port=CONSOLE_PORT,
        rave_port=RAVE_PORT,
    )


@app.route("/api/run/sync", methods=["POST"])
def api_run_sync():
    body = request.get_json(force=True) or {}
    visit = body.get("visit")
    subjects = body.get("subjects") or []
    study = body.get("study") or STUDY_ID
    ok, err = launch_sync(visit, subjects, study)
    return jsonify(ok=ok, error=err)


@app.route("/api/reset", methods=["POST"])
def api_reset():
    reset_edc()
    return jsonify(ok=True)


@app.route("/api/build")
def api_build():
    return jsonify(build=BUILD_VERSION)


@app.route("/api/status")
def api_status():
    with JOB.lock:
        return jsonify(
            running=JOB.running,
            summary=JOB.summary,
            token=JOB.last_session_token,
            visit=JOB.last_visit,
            subjects=JOB.last_subjects,
        )


@app.route("/api/stream")
def api_stream():
    def event_gen():
        q = queue.Queue(maxsize=2000)
        with JOB.lock:
            for ln in list(JOB.log_lines):
                try:
                    q.put_nowait(ln)
                except queue.Full:
                    break
            JOB.subscribers.append(q)
        last_progress = None
        last_status = None
        try:
            while True:
                try:
                    line = q.get(timeout=0.5)
                    payload = line.replace("\n", " ").replace("\r", "")
                    yield f"event: line\ndata: {payload}\n\n"
                except queue.Empty:
                    pass
                with JOB.lock:
                    prog = dict(JOB.progress)
                    if JOB.running:
                        st = {"state": "running"}
                    elif JOB.finished_at:
                        st = {"state": "done", "exit_code": JOB.exit_code}
                    else:
                        st = {"state": "idle"}
                if prog != last_progress:
                    yield f"event: progress\ndata: {json.dumps(prog)}\n\n"
                    last_progress = prog
                if st != last_status:
                    yield f"event: status\ndata: {json.dumps(st)}\n\n"
                    last_status = st
        except GeneratorExit:
            with JOB.lock:
                if q in JOB.subscribers:
                    JOB.subscribers.remove(q)

    return Response(
        event_gen(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def open_browser():
    time.sleep(0.7)
    webbrowser.open(f"http://127.0.0.1:{CONSOLE_PORT}/")


if __name__ == "__main__":
    print("Nexa Source Flow demo console")
    print(f"  http://127.0.0.1:{CONSOLE_PORT}/")
    threading.Thread(target=open_browser, daemon=True).start()
    app.run(host="127.0.0.1", port=CONSOLE_PORT, debug=False, use_reloader=False)
