"""Mock Medidata Rave EDC — port 5051."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from flask import Flask, redirect, render_template, request, session, url_for

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from shared.constants import (
    ALL_SUBJECTS,
    RAVE_PORT,
    SITE_NAME,
    STUDY_ID,
    SUBJECT_LEVEL_FORMS,
    TARGET_CRFS_BY_VISIT,
)
from shared.edc_store import get_form_fields, get_subject_summary, list_synced_subjects

app = Flask(__name__, template_folder="templates")
app.secret_key = "nexa-source-flow-demo-local"


def load_form_schema(form_name: str) -> dict | None:
    idx_path = ROOT / "demo_data" / "form_schemas" / "_index.json"
    schema_dir = ROOT / "demo_data" / "form_schemas"
    if not idx_path.exists():
        return None
    index = json.loads(idx_path.read_text(encoding="utf-8"))
    key = index.get(form_name)
    if not key:
        return None
    path = schema_dir / f"{key}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return None


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
    if token:
        session["demo_token"] = token
    if subject:
        session["focus_subject"] = subject
    if visit:
        session["focus_visit"] = visit

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
    visits = []
    for visit, forms in TARGET_CRFS_BY_VISIT.items():
        visit_forms = []
        for form in forms:
            vals = get_form_fields(subject_id, visit, form)
            visit_forms.append({"name": form, "populated": len(vals) > 0, "count": len(vals)})
        visits.append({"name": visit, "forms": visit_forms})
    subject_forms = []
    for form in SUBJECT_LEVEL_FORMS:
        vals = get_form_fields(subject_id, "Subject", form)
        subject_forms.append({"name": form, "populated": len(vals) > 0, "count": len(vals)})
    return render_template(
        "subject.html",
        subject_id=subject_id,
        visits=visits,
        subject_forms=subject_forms,
        study_id=STUDY_ID,
        site_name=SITE_NAME,
        user=session.get("user", "Demo User"),
    )


@app.route("/crf")
def crf():
    if not session.get("logged_in"):
        return redirect(url_for("login"))
    subject = request.args.get("subject", "0103")
    visit = request.args.get("visit", "Day 3")
    form = request.args.get("form", "Vital Signs")
    values = get_form_fields(subject, visit, form)
    schema = load_form_schema(form)
    fields = []
    if schema:
        for f in schema.get("fields", []):
            label = f.get("label", "")
            if f.get("type") == "field_id":
                continue
            fields.append({"label": label, "value": values.get(label, "")})
    if not fields and values:
        fields = [{"label": k, "value": v} for k, v in sorted(values.items())]
    visit_forms = TARGET_CRFS_BY_VISIT.get(visit, [])
    return render_template(
        "crf.html",
        subject=subject,
        visit=visit,
        form=form,
        fields=fields,
        values=values,
        visit_forms=visit_forms,
        study_id=STUDY_ID,
        site_name=SITE_NAME,
        user=session.get("user", "Demo User"),
    )


if __name__ == "__main__":
    print("Mock Medidata Rave")
    print(f"  http://127.0.0.1:{RAVE_PORT}/")
    app.run(host="127.0.0.1", port=RAVE_PORT, debug=False, use_reloader=False)
