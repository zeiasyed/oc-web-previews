"""Audit trail, EDC queries, and field history for lab demos."""

from __future__ import annotations

import csv
import io
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "demo_data" / "edc_state.sqlite"


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            actor TEXT NOT NULL,
            action TEXT NOT NULL,
            subject TEXT,
            visit TEXT,
            form TEXT,
            field TEXT,
            old_value TEXT,
            new_value TEXT,
            detail TEXT
        );
        CREATE TABLE IF NOT EXISTS edc_queries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            subject TEXT NOT NULL,
            visit TEXT NOT NULL,
            form TEXT NOT NULL,
            field TEXT NOT NULL,
            query_text TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            source_value TEXT,
            edc_value TEXT,
            resolved_at TEXT,
            resolved_value TEXT
        );
        CREATE TABLE IF NOT EXISTS field_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            actor TEXT NOT NULL,
            action TEXT NOT NULL,
            subject TEXT NOT NULL,
            visit TEXT NOT NULL,
            form TEXT NOT NULL,
            field TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT NOT NULL
        );
        """
    )
    conn.commit()
    return conn


def reset() -> None:
    conn = _connect()
    conn.execute("DELETE FROM audit_log")
    conn.execute("DELETE FROM edc_queries")
    conn.execute("DELETE FROM field_history")
    conn.commit()
    conn.close()


def log_event(
    actor: str,
    action: str,
    *,
    subject: str | None = None,
    visit: str | None = None,
    form: str | None = None,
    field: str | None = None,
    old_value: str | None = None,
    new_value: str | None = None,
    detail: str | None = None,
) -> None:
    conn = _connect()
    conn.execute(
        """
        INSERT INTO audit_log (ts, actor, action, subject, visit, form, field, old_value, new_value, detail)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (_now(), actor, action, subject, visit, form, field, old_value, new_value, detail),
    )
    conn.commit()
    conn.close()


def record_field_change(
    actor: str,
    action: str,
    subject: str,
    visit: str,
    form: str,
    field: str,
    old_value: str | None,
    new_value: str,
) -> None:
    log_event(
        actor,
        action,
        subject=subject,
        visit=visit,
        form=form,
        field=field,
        old_value=old_value,
        new_value=new_value,
    )
    conn = _connect()
    conn.execute(
        """
        INSERT INTO field_history (ts, actor, action, subject, visit, form, field, old_value, new_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (_now(), actor, action, subject, visit, form, field, old_value, new_value),
    )
    conn.commit()
    conn.close()


def open_query(
    subject: str,
    visit: str,
    form: str,
    field: str,
    query_text: str,
    *,
    source_value: str | None = None,
    edc_value: str | None = None,
) -> int:
    conn = _connect()
    cur = conn.execute(
        """
        INSERT INTO edc_queries (ts, subject, visit, form, field, query_text, status, source_value, edc_value)
        VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)
        """,
        (_now(), subject, visit, form, field, query_text, source_value, edc_value),
    )
    qid = int(cur.lastrowid)
    conn.commit()
    conn.close()
    log_event(
        "System",
        "flagged_opened",
        subject=subject,
        visit=visit,
        form=form,
        field=field,
        old_value=edc_value,
        new_value=source_value,
        detail=query_text,
    )
    return qid


def resolve_query(query_id: int, resolved_value: str, *, actor: str = "Demo Coordinator") -> bool:
    conn = _connect()
    row = conn.execute("SELECT * FROM edc_queries WHERE id = ?", (query_id,)).fetchone()
    if not row or row["status"] != "open":
        conn.close()
        return False
    ts = _now()
    conn.execute(
        """
        UPDATE edc_queries
        SET status = 'resolved', resolved_at = ?, resolved_value = ?
        WHERE id = ?
        """,
        (ts, resolved_value, query_id),
    )
    conn.commit()
    conn.close()
    log_event(
        actor,
        "flagged_resolved",
        subject=row["subject"],
        visit=row["visit"],
        form=row["form"],
        field=row["field"],
        old_value=row["edc_value"],
        new_value=resolved_value,
        detail=f"Flagged item #{query_id} resolved",
    )
    return True


def list_audit(limit: int = 300) -> list[dict[str, Any]]:
    conn = _connect()
    rows = conn.execute(
        "SELECT * FROM audit_log ORDER BY id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def list_queries(*, status: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
    conn = _connect()
    if status:
        rows = conn.execute(
            "SELECT * FROM edc_queries WHERE status = ? ORDER BY id DESC LIMIT ?",
            (status, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM edc_queries ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def list_field_history(
    subject: str,
    visit: str,
    form: str,
    field: str,
    *,
    limit: int = 50,
) -> list[dict[str, Any]]:
    conn = _connect()
    rows = conn.execute(
        """
        SELECT * FROM field_history
        WHERE subject = ? AND visit = ? AND form = ? AND field = ?
        ORDER BY id DESC LIMIT ?
        """,
        (subject, visit, form, field, limit),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def count_open_queries() -> int:
    conn = _connect()
    row = conn.execute("SELECT COUNT(*) AS c FROM edc_queries WHERE status = 'open'").fetchone()
    conn.close()
    return int(row["c"])


def stats() -> dict[str, Any]:
    conn = _connect()
    audit_count = conn.execute("SELECT COUNT(*) AS c FROM audit_log").fetchone()["c"]
    open_q = conn.execute("SELECT COUNT(*) AS c FROM edc_queries WHERE status = 'open'").fetchone()["c"]
    resolved_q = conn.execute("SELECT COUNT(*) AS c FROM edc_queries WHERE status = 'resolved'").fetchone()["c"]
    history_count = conn.execute("SELECT COUNT(*) AS c FROM field_history").fetchone()["c"]
    conn.close()
    return {
        "audit_events": int(audit_count),
        "open_queries": int(open_q),
        "resolved_queries": int(resolved_q),
        "field_history_entries": int(history_count),
    }


SUMMARY_FIELD_LABELS: dict[str, str] = {
    "study": "Study",
    "files_processed": "Forms processed",
    "auto_fields": "Written fields",
    "flagged_fields": "Flagged fields",
    "pending_review": "Pending review",
    "entered": "Fields entered",
    "matched": "Fields matched",
    "skipped": "Fields skipped",
    "conflicts": "Flagged fields",
    "subjects": "Subjects",
    "visit": "Visit",
}

AUDIT_ACTION_LABELS: dict[str, str] = {
    "flagged_opened": "Flagged opened",
    "flagged_resolved": "Flagged resolved",
    "query_opened": "Flagged opened",
    "query_resolved": "Flagged resolved",
    "discrepancy_opened": "Flagged opened",
    "discrepancy_resolved": "Flagged resolved",
    "batch_start": "Batch started",
    "batch_complete": "Batch complete",
    "sync_complete": "Sync complete",
    "auto_write": "Auto-written",
    "approve": "Approved",
    "sync_enter": "Entered",
}

EXPORT_SECTIONS = frozenset({"summary", "audit", "queries"})


def _new_csv_writer() -> tuple[io.StringIO, csv.writer]:
    buf = io.StringIO()
    buf.write("\ufeff")
    writer = csv.writer(buf, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
    return buf, writer


def _format_action(action: str | None) -> str:
    if not action:
        return ""
    return AUDIT_ACTION_LABELS.get(action, action.replace("_", " ").title())


def _summary_rows(sync_summary: dict[str, Any] | None) -> list[tuple[str, Any]]:
    rows: list[tuple[str, Any]] = []
    if sync_summary:
        for key, value in sync_summary.items():
            if key in ("review_details", "conflict_details", "token"):
                continue
            label = SUMMARY_FIELD_LABELS.get(key, key.replace("_", " ").title())
            rows.append((label, value))
    else:
        rows.append(("Status", "No sync run in this session"))
    st = stats()
    if st["audit_events"]:
        rows.append(("Audit events (total)", st["audit_events"]))
    if st["open_queries"]:
        rows.append(("Open flagged items", st["open_queries"]))
    return rows


def export_section_csv(app_name: str, section: str, sync_summary: dict[str, Any] | None = None) -> str:
    if section not in EXPORT_SECTIONS:
        raise ValueError(f"Unknown export section: {section}")

    buf, w = _new_csv_writer()
    generated = _now()

    if section == "summary":
        w.writerow([f"{app_name} — Sync Summary"])
        w.writerow(["Generated", generated])
        w.writerow([])
        w.writerow(["Metric", "Value"])
        for label, value in _summary_rows(sync_summary):
            w.writerow([label, value])

    elif section == "audit":
        w.writerow([f"{app_name} — Audit Trail"])
        w.writerow(["Generated", generated])
        w.writerow([])
        w.writerow([
            "Timestamp",
            "Actor",
            "Action",
            "Subject",
            "Visit",
            "Form",
            "Field",
            "Previous value",
            "New value",
            "Detail",
        ])
        events = list_audit(500)
        if not events:
            w.writerow(["", "", "No audit events recorded", "", "", "", "", "", "", ""])
        for ev in events:
            w.writerow([
                ev.get("ts") or "",
                ev.get("actor") or "",
                _format_action(ev.get("action")),
                ev.get("subject") or "",
                ev.get("visit") or "",
                ev.get("form") or "",
                ev.get("field") or "",
                ev.get("old_value") or "",
                ev.get("new_value") or "",
                ev.get("detail") or "",
            ])

    else:
        w.writerow([f"{app_name} — Flagged Items"])
        w.writerow(["Generated", generated])
        w.writerow([])
        w.writerow([
            "ID",
            "Status",
            "Opened",
            "Subject",
            "Visit",
            "Form",
            "Field",
            "Issue",
            "Source value",
            "EDC value",
            "Resolved value",
            "Resolved at",
        ])
        queries = list_queries(limit=500)
        if not queries:
            w.writerow(["", "", "", "", "", "", "", "No flagged items recorded", "", "", "", ""])
        for q in queries:
            w.writerow([
                q.get("id"),
                (q.get("status") or "").title(),
                q.get("ts") or "",
                q.get("subject") or "",
                q.get("visit") or "",
                q.get("form") or "",
                q.get("field") or "",
                q.get("query_text") or "",
                q.get("source_value") or "",
                q.get("edc_value") or "",
                q.get("resolved_value") or "",
                q.get("resolved_at") or "",
            ])

    return buf.getvalue()


def export_section_json(app_name: str, section: str, sync_summary: dict[str, Any] | None = None) -> str:
    if section not in EXPORT_SECTIONS:
        raise ValueError(f"Unknown export section: {section}")

    payload: dict[str, Any] = {
        "app": app_name,
        "section": section,
        "generated_at": _now(),
    }
    if section == "summary":
        payload["sync_summary"] = sync_summary or {}
        payload["metrics"] = [{"metric": k, "value": v} for k, v in _summary_rows(sync_summary)]
    elif section == "audit":
        payload["audit"] = [
            {**ev, "action_label": _format_action(ev.get("action"))} for ev in list_audit(500)
        ]
    else:
        payload["queries"] = list_queries(limit=500)
    return json.dumps(payload, indent=2)


def export_filename(app_slug: str, section: str, fmt: str) -> str:
    names = {
        "summary": "sync-summary",
        "audit": "audit-trail",
        "queries": "flagged-items",
    }
    ext = "json" if fmt == "json" else "csv"
    return f"{app_slug}-{names.get(section, section)}.{ext}"


def export_report_csv(app_name: str, sync_summary: dict[str, Any] | None = None) -> str:
    """Legacy full report — prefer export_section_csv."""
    buf, w = _new_csv_writer()
    w.writerow([f"{app_name} — Sync & Audit Report", _now()])
    w.writerow([])
    w.writerow(["Metric", "Value"])
    for label, value in _summary_rows(sync_summary):
        w.writerow([label, value])
    w.writerow([])
    w.writerow([
        "Timestamp", "Actor", "Action", "Subject", "Visit", "Form", "Field",
        "Previous value", "New value", "Detail",
    ])
    for ev in list_audit(100):
        w.writerow([
            ev.get("ts") or "",
            ev.get("actor") or "",
            _format_action(ev.get("action")),
            ev.get("subject") or "",
            ev.get("visit") or "",
            ev.get("form") or "",
            ev.get("field") or "",
            ev.get("old_value") or "",
            ev.get("new_value") or "",
            ev.get("detail") or "",
        ])
    w.writerow([])
    w.writerow([
        "ID", "Status", "Opened", "Subject", "Visit", "Form", "Field", "Issue",
        "Source value", "EDC value", "Resolved value", "Resolved at",
    ])
    for q in list_queries(limit=100):
        w.writerow([
            q.get("id"),
            (q.get("status") or "").title(),
            q.get("ts") or "",
            q.get("subject") or "",
            q.get("visit") or "",
            q.get("form") or "",
            q.get("field") or "",
            q.get("query_text") or "",
            q.get("source_value") or "",
            q.get("edc_value") or "",
            q.get("resolved_value") or "",
            q.get("resolved_at") or "",
        ])
    return buf.getvalue()


def export_report_json(app_name: str, sync_summary: dict[str, Any] | None = None) -> str:
    payload = {
        "app": app_name,
        "generated_at": _now(),
        "sync_summary": sync_summary or {},
        "metrics": [{"metric": k, "value": v} for k, v in _summary_rows(sync_summary)],
        "stats": stats(),
        "audit": list_audit(200),
        "queries": list_queries(limit=200),
    }
    return json.dumps(payload, indent=2)
