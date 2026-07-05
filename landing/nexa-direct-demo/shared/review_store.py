"""Human review queue for flagged extraction fields."""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ReviewItem:
    id: str
    filename: str
    subject_id: str
    form_code: str
    field_name: str
    field_label: str
    extracted_value: str
    confidence: float
    issue: str
    status: str = "pending"  # pending | approved


@dataclass
class ReviewStore:
    lock: threading.Lock = field(default_factory=threading.Lock)
    items: dict[str, ReviewItem] = field(default_factory=dict)

    def clear(self) -> None:
        with self.lock:
            self.items.clear()

    def add(
        self,
        filename: str,
        subject_id: str,
        form_code: str,
        field_name: str,
        field_label: str,
        extracted_value: str,
        confidence: float,
        issue: str,
    ) -> ReviewItem:
        item = ReviewItem(
            id=uuid.uuid4().hex[:12],
            filename=filename,
            subject_id=subject_id,
            form_code=form_code,
            field_name=field_name,
            field_label=field_label,
            extracted_value=extracted_value,
            confidence=confidence,
            issue=issue,
        )
        with self.lock:
            self.items[item.id] = item
        return item

    def approve(self, item_id: str, corrected_value: str | None = None) -> ReviewItem | None:
        with self.lock:
            item = self.items.get(item_id)
            if not item or item.status != "pending":
                return None
            if corrected_value is not None:
                item.extracted_value = corrected_value
            item.status = "approved"
            return item

    def list_pending(self) -> list[dict[str, Any]]:
        with self.lock:
            return [
                {
                    "id": i.id,
                    "filename": i.filename,
                    "subject_id": i.subject_id,
                    "form_code": i.form_code,
                    "field_name": i.field_name,
                    "field_label": i.field_label,
                    "extracted_value": i.extracted_value,
                    "confidence": round(i.confidence, 2),
                    "issue": i.issue,
                    "status": i.status,
                }
                for i in self.items.values()
                if i.status == "pending"
            ]

    def list_all(self) -> list[dict[str, Any]]:
        with self.lock:
            return [
                {
                    "id": i.id,
                    "filename": i.filename,
                    "subject_id": i.subject_id,
                    "form_code": i.form_code,
                    "field_name": i.field_name,
                    "field_label": i.field_label,
                    "extracted_value": i.extracted_value,
                    "confidence": round(i.confidence, 2),
                    "issue": i.issue,
                    "status": i.status,
                }
                for i in self.items.values()
            ]


REVIEW = ReviewStore()
