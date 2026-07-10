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

from shared.constants import AD_DEMO_FILE, ALL_SUBJECTS, BUILD_VERSION, CONSOLE_PORT, FORMS, RAVE_PORT, SITE_NAME, STUDY_ID, VISITS
from shared.ad_mode import AD, ad_requested, filter_inbox_files
from shared import audit_store
from shared.edc_store import reset as reset_edc
from shared.lab_auth import check_lab_auth
from shared.runtime_urls import console_bind_host, edc_public_base, listen_port
from shared.inbox_watcher import INBOX, inbox_display_path, list_inbox, parse_filename, probe_inbox_folder, scan_inbox
from shared.job_state import JOB
from shared.process_worker import approve_review, launch_process
from shared.review_store import REVIEW
from shared.study_config import (
    active_study_id,
    bootstrap_if_needed,
    enabled_forms,
    get_config,
    import_form_excel,
    list_form_definitions,
    list_studies,
    load_study_schema,
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
    ad_mode = request.args.get("ad") in ("1", "true", "yes")
    return render_template(
        "index.html",
        subjects=ALL_SUBJECTS,
        studies=list_studies(),
        study_id=sid,
        study_name=summary["name"],
        default_visit=summary["default_visit"],
        visits=VISITS,
        build=BUILD_VERSION,
        port=CONSOLE_PORT,
        edc_port=RAVE_PORT,
        edc_base=edc_public_base(),
        inbox_path=summary["display_inbox_path"],
        demo_site_name=SITE_NAME,
        ad_mode=ad_mode,
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
        ok, msg = validate_inbox_path(cfg.get("inbox_path", ""), study_id)
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


@app.route("/api/settings/<study_id>/inbox/test", methods=["POST"])
def api_test_inbox(study_id: str):
    body = request.get_json(force=True) or {}
    path = (body.get("inbox_path") or "").strip()
    try:
        result = probe_inbox_folder(Path(path), study_id)
        return jsonify(ok=True, **result)
    except KeyError:
        return jsonify(ok=False, error=f"Unknown study: {study_id}"), 404


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
    ad = ad_requested()
    files = filter_inbox_files(list_inbox(sid), ad)
    return jsonify(files=files, study=sid, inbox_path=inbox_display_path(sid), ad=ad, pre_upload=AD.is_pre_upload() if ad else False)


def _form_title(form_code: str, study_id: str | None = None) -> str:
    sid = study_id or active_study_id()
    cfg = enabled_forms(sid).get(form_code) or {}
    return cfg.get("title") or FORMS.get(form_code, {}).get("title", form_code)


def _field_label(form_code: str, field_name: str, study_id: str | None = None) -> str:
    sid = study_id or active_study_id()
    schema = load_study_schema(sid, form_code) or {"fields": []}
    for field in schema.get("fields", []):
        if field.get("name") == field_name:
            return field.get("label", field_name)
    return field_name


def _flagged_issue_text(issue: str, confidence: float) -> str:
    return f"Flagged item — extraction review required ({issue}) — confidence {confidence:.0%}"


def _query_rank_map(study_id: str | None = None) -> dict[tuple[str, str, str], int]:
    sid = study_id or active_study_id()
    rank: dict[tuple[str, str, str], int] = {}
    for query in audit_store.list_queries(limit=1000):
        key = (query.get("subject") or "", query.get("form") or "", query.get("field") or "")
        rank[key] = int(query.get("id") or 0)
    return rank


def _enrich_queries(queries: list[dict], study_id: str | None = None) -> list[dict]:
    sid = study_id or active_study_id()
    enriched: list[dict] = []
    for query in queries:
        form_code = query.get("form") or ""
        field_name = query.get("field") or ""
        row = dict(query)
        row["form_title"] = _form_title(form_code, sid)
        row["field_label"] = _field_label(form_code, field_name, sid)
        enriched.append(row)
    return sorted(enriched, key=lambda q: int(q.get("id") or 0))


def _align_flagged_items(items: list[dict], study_id: str | None = None) -> list[dict]:
    rank = _query_rank_map(study_id)
    return sorted(
        items,
        key=lambda item: (
            rank.get(
                (item.get("subject_id") or item.get("subject") or "",
                 item.get("form_code") or item.get("form") or "",
                 item.get("field_name") or item.get("field") or ""),
                10**9,
            ),
            item.get("subject_id") or item.get("subject") or "",
            item.get("form_code") or item.get("form") or "",
            item.get("field_name") or item.get("field") or "",
        ),
    )


def _enrich_review_items(items: list[dict]) -> list[dict]:
    sid = active_study_id()
    for item in items:
        code = item.get("form_code", "")
        field_name = item.get("field_name", "")
        item["form_title"] = _form_title(code, sid)
        if not item.get("field_label"):
            item["field_label"] = _field_label(code, field_name, sid)
        conf = float(item.get("confidence") or 0)
        item["issue_text"] = _flagged_issue_text(item.get("issue") or "review", conf)
    return _align_flagged_items(items, sid)


@app.route("/api/review")
def api_review():
    items = _enrich_review_items(REVIEW.list_all())
    pending = sum(1 for i in items if i.get("status") == "pending")
    return jsonify(items=items, pending_count=pending, saved_count=len(items) - pending)


@app.route("/api/process", methods=["POST"])
def api_process():
    body = request.get_json(force=True) or {}
    study = body.get("study") or active_study_id()
    ad = bool(body.get("ad")) or ad_requested()
    set_active_study(study)
    ok, err = launch_process(study, ad=ad)
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
    body = request.get_json(silent=True) or {}
    ad = bool(body.get("ad")) or ad_requested()
    reset_edc()
    REVIEW.clear()
    JOB.reset_demo()
    with INBOX.lock:
        INBOX.reset_statuses()
    if ad:
        AD.reset()
    return jsonify(ok=True, ad=ad)


@app.route("/api/ad/simulate-upload", methods=["POST"])
def api_ad_simulate_upload():
    AD.simulate_upload()
    sid = active_study_id()
    scan_inbox(study_id=sid)
    files = filter_inbox_files(list_inbox(sid), True)
    return jsonify(ok=True, files=files)


@app.route("/api/ad/overlays/<path:filename>")
def api_ad_overlays(filename: str):
    safe = Path(filename).name
    candidates = [
        ROOT / "demo_data" / "ad_overlays" / f"{Path(safe).stem}.json",
        ROOT / "demo_data" / "ad_overlays" / "0102_DM.json",
    ]
    for path in candidates:
        if path.is_file():
            return jsonify(ok=True, overlay=json.loads(path.read_text(encoding="utf-8")))
    return jsonify(ok=False, error="Overlay not found"), 404


@app.route("/api/ad/status")
def api_ad_status():
    return jsonify(
        ok=True,
        pre_upload=AD.is_pre_upload(),
        auto_count=AD.get_auto_count(),
        demo_file=AD_DEMO_FILE,
    )


@app.route("/api/audit")
def api_audit():
    limit = min(int(request.args.get("limit", 200)), 500)
    return jsonify(ok=True, events=audit_store.list_audit(limit), stats=audit_store.stats())


@app.route("/api/queries")
def api_queries():
    status = request.args.get("status")
    sid = active_study_id()
    queries = _enrich_queries(audit_store.list_queries(status=status or None), sid)
    return jsonify(ok=True, queries=queries)


@app.route("/api/export/report")
def api_export_report():
    fmt = request.args.get("format", "csv")
    section = request.args.get("section", "summary")
    if section not in audit_store.EXPORT_SECTIONS:
        return jsonify(ok=False, error="Invalid export section"), 400
    with JOB.lock:
        summary = dict(JOB.summary) if JOB.summary else None
    if fmt == "json":
        body = audit_store.export_section_json("NexaDirect", section, summary)
        mimetype = "application/json"
    else:
        body = audit_store.export_section_csv("NexaDirect", section, summary)
        mimetype = "text/csv; charset=utf-8"
    filename = audit_store.export_filename("nexadirect", section, fmt)
    return Response(
        body,
        mimetype=mimetype,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
                yield f"event: inbox\ndata: {json.dumps(filter_inbox_files(list_inbox(sid), request.args.get('ad') in ('1', 'true', 'yes')))}\n\n"
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
