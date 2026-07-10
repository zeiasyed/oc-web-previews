#!/usr/bin/env python3
"""Create or reset the NexaSource admin user."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("NEXA_ENV", "dev")
os.environ.setdefault("NEXA_DATA_DIR", str(ROOT / "demo_data"))

from nexa_core.auth.passwords import hash_password
from nexa_core.auth.roles import Role
from nexa_core.auth.users import create_user, ensure_schema, get_user_by_username
from nexa_core.config import sqlite_path
from nexa_core.db import adapt_sql, connect


def upsert_admin(username: str, password: str) -> None:
    ensure_schema()
    uname = username.strip().lower()
    existing = get_user_by_username(uname)
    pw_hash = hash_password(password)
    if existing:
        sql = adapt_sql(
            """
            UPDATE users
            SET password_hash = ?, role = ?, active = 1,
                failed_attempts = 0, locked_until = NULL,
                totp_enabled = 0, totp_secret = NULL
            WHERE username = ?
            """
        )
        with connect() as conn:
            conn.execute(sql, (pw_hash, Role.ADMIN.value, uname))
        print(f"Updated admin user {uname!r} in {sqlite_path()}")
        return
    create_user(uname, password, Role.ADMIN.value)
    print(f"Created admin user {uname!r} in {sqlite_path()}")


if __name__ == "__main__":
    user = sys.argv[1] if len(sys.argv) > 1 else "admin"
    password = sys.argv[2] if len(sys.argv) > 2 else "Academy123!"
    upsert_admin(user, password)
