"""Write approved fields to mock EDC."""

from __future__ import annotations

from datetime import datetime, timezone

from shared.edc_store import write_fields
from shared.study_config import default_visit


def sync_fields(
    subject_id: str,
    form_code: str,
    fields: dict[str, str],
    *,
    study_id: str | None = None,
    actor: str = "NexaDirect",
    action: str = "auto_write",
) -> int:
    synced_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    visit = default_visit(study_id)
    return write_fields(
        subject_id, visit, form_code, fields, synced_at, actor=actor, action=action
    )
