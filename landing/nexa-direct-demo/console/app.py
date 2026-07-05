"""NexaDirect console — port 5070."""

from __future__ import annotations

import json
import os
import queue
import subprocess
import sys
import threading
import time
import uuid
import webbrowser
from pathlib import Path

from flask import Flask, Response, jsonify, render_template, request, send_from_directory

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from shared.constants import ALL_SUBJECTS, BUILD_VERSION, CONSOLE_PORT, RAVE_PORT, SITE_NAME, STUDY_ID
from shared.edc_store import reset as reset_edc
from shared.lab_auth import check_lab_auth
from shared.runtime_urls import console_bind_host, edc_public_base, listen_port
from shared.inbox_watcher import INBOX, inbox_display_path, list_inbox, parse_filename, scan_inbox
from shared.job_state import JOB
from shared.process_worker import approve_review, launch_process
from shared.review_store import REVIEW
from shared.study_config import (
    active_study_id,
    bootstrap_if_needed,
    get_config,
    import_form_excel,
    list_form_definitions,
    list_studies,
    public_summary,
    save_form_settings,
    save_site_settings,
    set_active_study,
    uploads_dir,
    validate_inbox_path,
)

app = Flask(__name__, template_folder="templates")

bootstrap_if_needed()
set_active_study(STUDY_ID)


@app.after_request
def no_cache(resp):
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return resp


@app.before_request
def require_lab_auth():
    denied = check_lab_auth(request)
    if denied is not None:
        return denied


def _study_from_request() -> str:
    body = request.get_json(silent=True) or {}
    return (
        request.args.get("study")
        or body.get("study")
        or request.headers.get("X-Study-Id")
        or active_study_id()
    )


@app.route("/")
def index():
    sid = active_study_id()
    summary = public_summary(sid)
    return render_template(
        "index.html",
        subjects=ALL_SUBJECTS,
        studies=list_studies(),
        study_id=sid,
        study_name=summary["name"],
        default_visit=summary["default_visit"],
        build=BUILD_VERSION,
        port=CONSOLE_PORT,
        edc_port=RAVE_PORT,
        edc_base=edc_public_base(),
        inbox_path=summary["display_inbox_path"],
        demo_site_name=SITE_NAME,
    )


@app.route("/api/studies")
def api_studies():
    return jsonify(studies=list_studies())


@app.route("/api/study/select", methods=["POST"])
def api_study_select():
    body = request.get_json(force=True) or {}
    study_id = body.get("study") or body.get("study_id")
    if not study_id:
        return jsonify(ok=False, error="study required"), 400
    try:
        get_config(study_id)
    except KeyError:
        return jsonify(ok=False, error=f"Unknown study: {study_id}"), 404
    set_active_study(study_id)
    scan_inbox(study_id=study_id)
    return jsonify(ok=True, study=public_summary(study_id))


@app.route("/api/settings/<study_id>")
def api_settings_get(study_id: str):
    try:
        return jsonify(
            ok=True,
            study=public_summary(study_id),
            forms=list_form_definitions(study_id),
        )
    except KeyError:
        return jsonify(ok=False, error=f"Unknown study: {study_id}"), 404


@app.route("/api/settings/<study_id>/site", methods=["PUT"])
def api_settings_site(study_id: str):
    body = request.get_json(force=True) or {}
    try:
        cfg = save_site_settings(study_id, body)
        ok, msg = validate_inbox_path(cfg.get("inbox_path", ""))
        return jsonify(
            ok=True,
            study=public_summary(study_id),
            inbox_valid=ok,
            inbox_message=msg,
        )
    except KeyError:
        return jsonify(ok=False, error=f"Unknown study: {study_id}"), 404
    except ValueError as e:
        return jsonify(ok=False, error=str(e)), 400


@app.route("/api/settings/<study_id>/forms/<form_code>", methods=["PUT"])
def api_settings_form(study_id: str, form_code: str):
    body = request.get_json(force=True) or {}
    try:
        save_form_settings(
            study_id,
            form_code.upper(),
            enabled=body.get("enabled"),
            title=body.get("title"),
            file_code=body.get("file_code"),
            field_labels=body.get("field_labels"),
        )
        return jsonify(ok=True, forms=list_form_definitions(study_id))
    except KeyError:
        return jsonify(ok=False, error=f"Unknown study: {study_id}"), 404


@app.route("/api/settings/<study_id>/forms/import", methods=["POST"])
def api_settings_import_form(study_id: str):
    if "file" not in request.files:
        return jsonify(ok=False, error="Excel file required (.xlsx or .xls)"), 400
    upload = request.files["file"]
    if not upload.filename:
        return jsonify(ok=False, error="Empty filename"), 400
    ext = Path(upload.filename).suffix.lower()
    if ext not in (".xlsx", ".xls"):
        return jsonify(ok=False, error="Upload an OpenClinica CDASH Excel file (.xlsx or .xls)"), 400

    form_code = (request.form.get("form_code") or "").strip().upper()
    title = (request.form.get("title") or "").strip() or None
    file_code = (request.form.get("file_code") or "").strip().upper() or None

    dest = uploads_dir() / f"{uuid.uuid4().hex}{ext}"
    upload.save(dest)
    try:
        result = import_form_excel(study_id, form_code, dest, title=title, file_code=file_code)
        return jsonify(ok=True, imported=result, forms=list_form_definitions(study_id))
    except Exception as e:
        return jsonify(ok=False, error=str(e)), 400
    finally:
        dest.unlink(missing_ok=True)


@app.route("/api/inbox")
def api_inbox():
    sid = _study_from_request()
    return jsonify(files=list_inbox(sid), study=sid, inbox_path=inbox_display_path(sid))


@app.route("/api/review")
def api_review():
    items = REVIEW.list_all()
    pending = sum(1 for i in items if i.get("status") == "pending")
    return jsonify(items=items, pending_count=pending, saved_count=len(items) - pending)


@app.route("/api/process", methods=["POST"])
def api_process():
    body = request.get_json(force=True) or {}
    study = body.get("study") or active_study_id()
    set_active_study(study)
    ok, err = launch_process(study)
    return jsonify(ok=ok, error=err)


@app.route("/api/review/<item_id>/approve", methods=["POST"])
def api_approve(item_id: str):
    body = request.get_json(force=True) or {}
    ok, err = approve_review(item_id, body.get("value"))
    return jsonify(ok=ok, error=err)


@app.route("/api/scan/<path:filename>")
def api_scan_pdf(filename: str):
    """Serve a scanned PDF from the inbox for CRC review."""
    sid = _study_from_request()
    safe_name = Path(filename).name
    if not parse_filename(safe_name, sid):
        return jsonify(ok=False, error="Invalid scan filename"), 404
    from shared.study_config import inbox_path

    folder = inbox_path(sid)
    pdf_path = folder / safe_name
    if not pdf_path.is_file():
        return jsonify(ok=False, error="Scan file not found"), 404
    return send_from_directory(
        folder,
        safe_name,
        mimetype="application/pdf",
        as_attachment=False,
        download_name=safe_name,
    )


@app.route("/api/reset", methods=["POST"])
def api_reset():
    reset_edc()
    REVIEW.clear()
    JOB.cancel_all()
    with INBOX.lock:
        INBOX.reset_statuses()
    return jsonify(ok=True)


def _open_folder_in_explorer(folder: Path) -> bool:
    """Open the exact Scanner Inbox folder in Explorer."""
    if not folder.is_dir():
        return False
    target = str(folder.resolve())
    try:
        subprocess.Popen(["explorer.exe", target], close_fds=True)
        return True
    except OSError:
        pass
    try:
        escaped = target.replace("'", "''")
        subprocess.Popen(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                f"Invoke-Item -LiteralPath '{escaped}'",
            ],
            close_fds=True,
        )
        return True
    except OSError:
        pass
    try:
        os.startfile(target)  # noqa: S606
        return True
    except OSError:
        return False


@app.route("/api/reveal-inbox", methods=["POST"])
def api_reveal_inbox():
    sid = _study_from_request()
    from shared.study_config import inbox_path

    folder = inbox_path(sid)
    path = inbox_display_path(sid)
    if not folder.is_dir():
        return jsonify(ok=False, error=f"Inbox folder not found: {path}"), 404
    opened = _open_folder_in_explorer(folder) if os.name == "nt" else False
    return jsonify(
        ok=True,
        path=path,
        opened=opened,
        pdf_count=len(list(folder.glob("*.pdf"))),
    )


@app.route("/health")
@app.route("/healthz")
def health():
    return jsonify(ok=True, build=BUILD_VERSION, service="nexadirect-console")


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
            study=JOB.last_study or active_study_id(),
        )


@app.route("/api/stream")
def api_stream():
    sid = request.args.get("study") or active_study_id()

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
                scan_inbox(study_id=sid)
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
                yield f"event: inbox\ndata: {json.dumps(list_inbox(sid))}\n\n"
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
    scan_inbox(study_id=active_study_id())
    host = console_bind_host()
    port = listen_port(CONSOLE_PORT)
    print("NexaDirect console")
    print(f"  http://{host}:{port}/")
    if host == "127.0.0.1":
        threading.Thread(target=open_browser, daemon=True).start()
    app.run(host=host, port=port, debug=False, use_reloader=False)
