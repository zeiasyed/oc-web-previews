"""End-to-end demo verification: inbox -> process -> review -> EDC."""

from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from shared.edc_store import count_all, get_form_fields, reset as reset_edc
from shared.inbox_watcher import list_inbox, scan_inbox
from shared.job_state import JOB
from shared.process_worker import approve_review, launch_process
from shared.review_store import REVIEW
from shared.constants import DEFAULT_VISIT, FORM_ORDER, INBOX_PATH


def wait_for_job(timeout: float = 60.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if not JOB.is_running() and JOB.finished_at:
            return JOB.exit_code == 0
        time.sleep(0.2)
    return False


def main() -> int:
    print("NexaDirect E2E demo test")
    print("=" * 40)

    scan_inbox(INBOX_PATH)
    files = list_inbox()
    if len(files) < 24:
        print(f"FAIL: expected 24 inbox PDFs, found {len(files)}")
        print(f"  Run setup.ps1 to seed {INBOX_PATH}")
        return 1
    print(f"OK: {len(files)} PDFs in Scanner Inbox")

    reset_edc()
    REVIEW.clear()
    JOB.cancel_all()

    ok, err = launch_process()
    if not ok:
        print(f"FAIL: could not start process: {err}")
        return 1

    if not wait_for_job():
        print("FAIL: processing did not complete in time")
        return 1

    summary = JOB.summary
    print(f"OK: processed {summary.get('files_processed', 0)} files")
    print(f"    auto_fields={summary.get('auto_fields', 0)} flagged={summary.get('flagged_fields', 0)}")

    pending = REVIEW.list_pending()
    if not pending:
        print("WARN: no flagged fields (demo expects some for 0102/0103)")
    else:
        print(f"OK: {len(pending)} review item(s) queued")
        for item in pending[:3]:
            approve_review(item["id"], item["extracted_value"])
        print("OK: approved first review items")

    # Re-approve any remaining
    for item in REVIEW.list_pending():
        approve_review(item["id"], item["extracted_value"])

    total = count_all()
    if total < 10:
        print(f"FAIL: EDC has only {total} field values after sync")
        return 1
    print(f"OK: EDC store has {total} synced field values")

    for subj in ("0101", "0102", "0103"):
        populated = sum(
            1 for fc in FORM_ORDER if get_form_fields(subj, DEFAULT_VISIT, fc)
        )
        print(f"    subject {subj}: {populated}/{len(FORM_ORDER)} forms with data")
        if populated == 0:
            print(f"FAIL: subject {subj} has no synced forms")
            return 1

    print("")
    print("E2E demo test PASSED")
    print("Presenter script:")
    print("  1. .\\run_demo.ps1")
    print("  2. Show Scanner Inbox in Explorer (Reveal inbox folder)")
    print("  3. Click Process inbox — watch activity log")
    print("  4. Resolve flagged fields in Review queue")
    print("  5. Open EDC to verify — Screening visit, subjects 0101-0103")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
