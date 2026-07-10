"""NexaFlow demo console — port 5050."""

from __future__ import annotations

import json
import os
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
from shared.edc_store import reset as reset_edc, write_field
from shared import audit_store
from shared.job_state import JOB
from shared.lab_auth import check_lab_auth
from shared.runtime_urls import console_bind_host, edc_public_base, listen_port
from shared.sync_simulator import launch_sync

app = Flask(__name__, template_folder="templates")


@app.after_request
def no_cache(resp):
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return resp


@app.before_request
def require_lab_auth():
    denied = check_lab_auth(request)
    if denied is not None:
        return denied


@app.route("/health")
@app.route("/healthz")
def health():
    return jsonify(ok=True, build=BUILD_VERSION, service="nexasource-console")


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
        edc_port=RAVE_PORT,
        edc_base=edc_public_base(),
    )


@app.route("/api/upload/subjects", methods=["POST"])
def api_upload_subjects():
    body = request.get_json(force=True) or {}
    study = body.get("study") or STUDY_ID
    time.sleep(0.6)
    return jsonify(
        ok=True,
        study=study,
        count=len(ALL_SUBJECTS),
        subjects=ALL_SUBJECTS,
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
    JOB.reset_demo()
    return jsonify(ok=True)


@app.route("/api/resolve", methods=["POST"])
def api_resolve():
    """Write resolved conflict values to the EDC store."""
    body = request.get_json(force=True) or {}
    updates = body.get("updates") or []
    visit = body.get("visit") or ""
    from datetime import datetime
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    count = 0
    for u in updates:
        subj = u.get("subject", "")
        form = u.get("form", "")
        field = u.get("field", "")
        value = u.get("value", "")
        if subj and form and field and value:
            write_field(
                subj, visit, form, field, value, ts,
                actor="Demo Coordinator", action="conflict_resolve",
            )
            for q in audit_store.list_queries(status="open"):
                if (
                    q["subject"] == subj
                    and q["visit"] == visit
                    and q["form"] == form
                    and q["field"] == field
                ):
                    audit_store.resolve_query(q["id"], value)
                    break
            count += 1
    return jsonify(ok=True, count=count)


@app.route("/api/audit")
def api_audit():
    limit = min(int(request.args.get("limit", 200)), 500)
    return jsonify(ok=True, events=audit_store.list_audit(limit), stats=audit_store.stats())


@app.route("/api/queries")
def api_queries():
    status = request.args.get("status")
    return jsonify(ok=True, queries=audit_store.list_queries(status=status or None))


@app.route("/api/export/report")
def api_export_report():
    fmt = request.args.get("format", "csv")
    section = request.args.get("section", "summary")
    if section not in audit_store.EXPORT_SECTIONS:
        return jsonify(ok=False, error="Invalid export section"), 400
    with JOB.lock:
        summary = dict(JOB.summary) if JOB.summary else None
    if fmt == "json":
        body = audit_store.export_section_json("NexaFlow", section, summary)
        mimetype = "application/json"
    else:
        body = audit_store.export_section_csv("NexaFlow", section, summary)
        mimetype = "text/csv; charset=utf-8"
    filename = audit_store.export_filename("nexaflow", section, fmt)
    return Response(
        body,
        mimetype=mimetype,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
    print("NexaSource demo console")
    print(f"  http://{console_bind_host()}:{listen_port(CONSOLE_PORT)}/")
    if os.environ.get("LAB_AUTH_USER"):
        threading.Thread(target=open_browser, daemon=True).start()
    app.run(
        host=console_bind_host(),
        port=listen_port(CONSOLE_PORT),
        debug=False,
        use_reloader=False,
    )
