"""SQLite store for mock CDASH EDC field values."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "demo_data" / "edc_state.sqlite"


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS field_values (
            subject TEXT NOT NULL,
            visit TEXT NOT NULL,
            form TEXT NOT NULL,
            field TEXT NOT NULL,
            value TEXT NOT NULL,
            synced_at TEXT NOT NULL,
            PRIMARY KEY (subject, visit, form, field)
        )
        """
    )
    conn.commit()
    return conn


def reset() -> None:
    conn = _connect()
    conn.execute("DELETE FROM field_values")
    conn.commit()
    conn.close()


def write_field(subject: str, visit: str, form: str, field: str, value: str, synced_at: str) -> None:
    conn = _connect()
    conn.execute(
        """
        INSERT INTO field_values (subject, visit, form, field, value, synced_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(subject, visit, form, field) DO UPDATE SET
            value = excluded.value,
            synced_at = excluded.synced_at
        """,
        (subject, visit, form, field, str(value), synced_at),
    )
    conn.commit()
    conn.close()


def write_fields(subject: str, visit: str, form: str, fields: dict[str, str], synced_at: str) -> int:
    count = 0
    for field, value in fields.items():
        if value is None or str(value).strip() == "":
            continue
        write_field(subject, visit, form, field, str(value), synced_at)
        count += 1
    return count


def get_form_fields(subject: str, visit: str, form: str) -> dict[str, str]:
    conn = _connect()
    rows = conn.execute(
        """
        SELECT field, value FROM field_values
        WHERE subject = ? AND visit = ? AND form = ?
        ORDER BY field
        """,
        (subject, visit, form),
    ).fetchall()
    conn.close()
    return {r["field"]: r["value"] for r in rows}


def get_subject_summary(subject: str) -> dict[str, Any]:
    conn = _connect()
    rows = conn.execute(
        """
        SELECT visit, form, COUNT(*) AS field_count
        FROM field_values WHERE subject = ?
        GROUP BY visit, form ORDER BY visit, form
        """,
        (subject,),
    ).fetchall()
    conn.close()
    return {
        "subject": subject,
        "forms": [{"visit": r["visit"], "form": r["form"], "fields": r["field_count"]} for r in rows],
        "total_fields": sum(r["field_count"] for r in rows),
    }


def list_synced_subjects() -> list[str]:
    conn = _connect()
    rows = conn.execute("SELECT DISTINCT subject FROM field_values ORDER BY subject").fetchall()
    conn.close()
    return [r["subject"] for r in rows]


def count_all() -> int:
    conn = _connect()
    row = conn.execute("SELECT COUNT(*) AS c FROM field_values").fetchone()
    conn.close()
    return int(row["c"])
