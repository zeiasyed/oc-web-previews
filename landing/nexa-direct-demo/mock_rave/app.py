"""Mock Medidata Rave EDC — CDASH forms, port 5071."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from flask import Flask, jsonify, redirect, render_template, request, session, url_for

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from shared.cdash_schemas import load_schema
from shared.constants import (
    ALL_SUBJECTS,
    DEFAULT_VISIT,
    FORM_ORDER,
    FORMS,
    RAVE_PORT,
    SITE_NAME,
    STUDY_ID,
    STUDY_NAME,
    VISITS,
    study_by_id,
)
from shared.edc_store import get_form_fields, get_subject_summary, list_synced_subjects
from shared.lab_auth import check_lab_auth
from shared.runtime_urls import listen_port, rave_bind_host


class _ScriptRootMiddleware:
    """Honor SCRIPT_ROOT when mock EDC is served under /edc."""

    def __init__(self, app, script_root: str):
        self.app = app
        self.script_root = script_root or ""

    def __call__(self, environ, start_response):
        if self.script_root:
            environ["SCRIPT_NAME"] = self.script_root
            path = environ.get("PATH_INFO", "")
            if path.startswith(self.script_root):
                environ["PATH_INFO"] = path[len(self.script_root) :] or "/"
        return self.app(environ, start_response)


app = Flask(__name__, template_folder="templates")
app.secret_key = "nexa-direct-demo-local"
app.wsgi_app = _ScriptRootMiddleware(app.wsgi_app, os.environ.get("SCRIPT_ROOT", "").rstrip("/"))

SCHEMA_DIR = ROOT / "demo_data" / "schemas"


def _active_study_id() -> str:
    return session.get("focus_study") or STUDY_ID


def _active_study_label() -> str:
    meta = study_by_id(_active_study_id())
    return meta["label"] if meta else STUDY_NAME


@app.context_processor
def inject_globals():
    sid = _active_study_id()
    return {
        "study_id": sid,
        "study_name": _active_study_label(),
    }


@app.context_processor
def inject_nav_context():
    subj = request.args.get("subject") or session.get("focus_subject") or ALL_SUBJECTS[0]
    visit = request.args.get("visit") or session.get("focus_visit") or DEFAULT_VISIT
    form = request.args.get("form", "")
    if visit not in VISITS:
        visit = DEFAULT_VISIT
    if not form:
        form = FORM_ORDER[0]
    return {
        "all_subjects": ALL_SUBJECTS,
        "all_visits": VISITS,
        "nav_subject": subj,
        "nav_visit": visit,
        "nav_form": form,
    }


def _form_title(form_code: str) -> str:
    return FORMS.get(form_code, {}).get("title", form_code)


@app.before_request
def require_lab_auth():
    denied = check_lab_auth(request)
    if denied is not None:
        return denied


@app.route("/health")
@app.route("/healthz")
def health():
    return jsonify(ok=True, service="mock-edc")


@app.route("/")
def root():
    if session.get("logged_in"):
        return redirect(url_for("subjects"))
    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    token = request.args.get("token")
    subject = request.args.get("subject")
    visit = request.args.get("visit")
    form = request.args.get("form")
    study = request.args.get("study")
    if token:
        session["demo_token"] = token
    if study:
        session["focus_study"] = study
    if subject:
        session["focus_subject"] = subject
    if visit:
        session["focus_visit"] = visit
    if form:
        session["focus_form"] = form

    if request.method == "POST":
        session["logged_in"] = True
        session["user"] = request.form.get("username") or "Demo User"
        subj = session.get("focus_subject") or ALL_SUBJECTS[0]
        vis = session.get("focus_visit") or DEFAULT_VISIT
        frm = session.get("focus_form") or FORM_ORDER[0]
        return redirect(url_for("crf", subject=subj, visit=vis, form=frm))

    return render_template(
        "login.html",
        site_name=SITE_NAME,
        rave_port=RAVE_PORT,
    )


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/subjects")
def subjects():
    if not session.get("logged_in"):
        return redirect(url_for("login"))
    synced = set(list_synced_subjects())
    rows = []
    for s in ALL_SUBJECTS:
        summary = get_subject_summary(s) if s in synced else {"total_fields": 0, "forms": []}
        rows.append({"id": s, "synced": s in synced, "fields": summary["total_fields"]})
    return render_template(
        "subjects.html",
        subjects=rows,
        site_name=SITE_NAME,
        user=session.get("user", "Demo User"),
    )


@app.route("/subject/<subject_id>")
def subject_detail(subject_id: str):
    if not session.get("logged_in"):
        return redirect(url_for("login"))
    visit = DEFAULT_VISIT
    visit_forms = []
    for form_code in FORM_ORDER:
        vals = get_form_fields(subject_id, visit, form_code)
        visit_forms.append(
            {
                "code": form_code,
                "name": _form_title(form_code),
                "populated": len(vals) > 0,
                "count": len(vals),
            }
        )
    session["focus_subject"] = subject_id
    return render_template(
        "subject.html",
        subject_id=subject_id,
        visits=[{"name": visit, "forms": visit_forms}],
        subject_forms=[],
        site_name=SITE_NAME,
        user=session.get("user", "Demo User"),
    )


@app.route("/crf")
def crf():
    if not session.get("logged_in"):
        return redirect(url_for("login"))
    subject = request.args.get("subject", ALL_SUBJECTS[0])
    visit = request.args.get("visit", DEFAULT_VISIT)
    form = request.args.get("form", FORM_ORDER[0])
    values = get_form_fields(subject, visit, form)
    schema = load_schema(form, SCHEMA_DIR)
    fields = []
    if schema:
        for f in schema.get("fields", []):
            name = f.get("name", "")
            label = f.get("label", name)
            val = values.get(name, "")
            fields.append({"name": name, "label": label, "value": val, "synced": bool(val)})
    if not fields and values:
        fields = [{"name": k, "label": k, "value": v, "synced": True} for k, v in sorted(values.items())]
    session["focus_subject"] = subject
    session["focus_visit"] = visit
    visit_forms = [_form_title(c) for c in FORM_ORDER]
    form_title = _form_title(form)
    return render_template(
        "crf.html",
        subject=subject,
        visit=visit,
        form=form_title,
        form_code=form,
        visit_forms=visit_forms,
        form_codes=FORM_ORDER,
        fields=fields,
        values=values,
        site_name=SITE_NAME,
        user=session.get("user", "Demo User"),
    )


if __name__ == "__main__":
    host = rave_bind_host()
    port = listen_port(RAVE_PORT)
    print("Mock Medidata Rave (CDASH)")
    print(f"  http://{host}:{port}/")
    app.run(host=host, port=port, debug=False, use_reloader=False)
