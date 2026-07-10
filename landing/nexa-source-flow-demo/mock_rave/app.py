"""Mock Exxel EDC — port 5051."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from flask import Flask, jsonify, redirect, render_template, request, session, url_for

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from shared.constants import (
    ALL_SUBJECTS,
    RAVE_PORT,
    SITE_NAME,
    STUDY_ID,
    SUBJECT_LEVEL_FORMS,
    TARGET_CRFS_BY_VISIT,
    VISITS,
)
from shared.crf_render import build_crf_fields
from shared.edc_store import get_form_fields, get_subject_summary, list_synced_subjects
from shared.lab_auth import check_lab_auth, lab_auth_enabled_for_edc
from shared.runtime_urls import listen_port, rave_bind_host


class _ScriptRootMiddleware:
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


def _script_root() -> str:
    base = os.environ.get("EDC_PUBLIC_BASE", "").strip()
    if base.startswith("/"):
        return os.environ.get("SCRIPT_ROOT", "/edc").rstrip("/")
    return ""


app = Flask(__name__, template_folder="templates")
app.secret_key = "nexa-source-flow-demo-local"
app.wsgi_app = _ScriptRootMiddleware(app.wsgi_app, _script_root())


@app.context_processor
def inject_nav_context():
    subj = request.args.get("subject") or session.get("focus_subject") or ALL_SUBJECTS[0]
    visit = request.args.get("visit") or session.get("focus_visit") or "Screening"
    form = request.args.get("form", "")
    if visit not in TARGET_CRFS_BY_VISIT:
        visit = "Screening"
    if not form and visit in TARGET_CRFS_BY_VISIT:
        form = TARGET_CRFS_BY_VISIT[visit][0]
    return {
        "all_subjects": ALL_SUBJECTS,
        "all_visits": VISITS,
        "nav_subject": subj,
        "nav_visit": visit,
        "nav_form": form,
    }


@app.before_request
def require_lab_auth():
    if not lab_auth_enabled_for_edc():
        return None
    denied = check_lab_auth(request)
    if denied is not None:
        return denied


@app.route("/health")
@app.route("/healthz")
def health():
    return jsonify(ok=True, service="mock-edc-source")


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
    if token:
        session["demo_token"] = token
    if subject:
        session["focus_subject"] = subject
    if visit:
        session["focus_visit"] = visit

    # Launched from NexaSource — skip the Rave sign-in screen during demos.
    if request.method == "GET" and token:
        session["logged_in"] = True
        session["user"] = "admin"
        subj = session.get("focus_subject") or ALL_SUBJECTS[0]
        vis = session.get("focus_visit") or "Day 3"
        forms = TARGET_CRFS_BY_VISIT.get(vis, ["Vital Signs"])
        target_form = form or (forms[0] if forms else "Vital Signs")
        return redirect(
            url_for("crf", subject=subj, visit=vis, form=target_form)
        )

    if request.method == "POST":
        session["logged_in"] = True
        session["user"] = request.form.get("username") or "Demo User"
        if session.get("focus_subject"):
            subj = session["focus_subject"]
            vis = session.get("focus_visit") or "Day 3"
            forms = TARGET_CRFS_BY_VISIT.get(vis, ["Vital Signs"])
            return redirect(
                url_for("crf", subject=subj, visit=vis, form=forms[0] if forms else "Vital Signs")
            )
        return redirect(url_for("subjects"))

    return render_template(
        "login.html",
        study_id=STUDY_ID,
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
        study_id=STUDY_ID,
        site_name=SITE_NAME,
        user=session.get("user", "Demo User"),
    )


@app.route("/subject/<subject_id>")
def subject_detail(subject_id: str):
    if not session.get("logged_in"):
        return redirect(url_for("login"))
    visit = session.get("focus_visit") or "Screening"
    if visit not in TARGET_CRFS_BY_VISIT:
        visit = "Screening"
    visit_forms = []
    for form_name in TARGET_CRFS_BY_VISIT.get(visit, []):
        vals = get_form_fields(subject_id, visit, form_name)
        visit_forms.append({"name": form_name, "populated": len(vals) > 0, "count": len(vals)})
    session["focus_subject"] = subject_id
    session["focus_visit"] = visit
    return render_template(
        "subject.html",
        subject_id=subject_id,
        visits=[{"name": visit, "forms": visit_forms}],
        subject_forms=SUBJECT_LEVEL_FORMS,
        study_id=STUDY_ID,
        site_name=SITE_NAME,
        user=session.get("user", "Demo User"),
    )


@app.route("/crf")
def crf():
    if not session.get("logged_in"):
        return redirect(url_for("login"))
    subject = request.args.get("subject") or session.get("focus_subject") or ALL_SUBJECTS[0]
    visit = request.args.get("visit") or session.get("focus_visit") or "Day 3"
    form = request.args.get("form") or ""
    if visit not in TARGET_CRFS_BY_VISIT:
        visit = "Day 3"
    if not form:
        forms = TARGET_CRFS_BY_VISIT.get(visit, ["Vital Signs"])
        form = forms[0] if forms else "Vital Signs"
    values = get_form_fields(subject, visit, form)
    fields = build_crf_fields(form, values)
    session["focus_subject"] = subject
    session["focus_visit"] = visit
    visit_forms = TARGET_CRFS_BY_VISIT.get(visit, [])
    return render_template(
        "crf.html",
        subject=subject,
        visit=visit,
        form=form,
        visit_forms=visit_forms,
        fields=fields,
        values=values,
        study_id=STUDY_ID,
        site_name=SITE_NAME,
        user=session.get("user", "Demo User"),
    )


if __name__ == "__main__":
    port = listen_port(RAVE_PORT)
    host = rave_bind_host()
    print("Mock Exxel EDC")
    print(f"  http://{host}:{port}/")
    app.run(host=host, port=port, debug=False, use_reloader=False)
