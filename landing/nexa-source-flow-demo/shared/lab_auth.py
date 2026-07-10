"""Optional HTTP Basic Auth for hosted lab demos."""

from __future__ import annotations

import os

from flask import Request, Response

PUBLIC_PATHS = frozenset({"/health", "/healthz"})


def _expected_credentials() -> tuple[str, str] | None:
    user = os.environ.get("LAB_AUTH_USER", "").strip()
    password = os.environ.get("LAB_AUTH_PASSWORD", "").strip()
    if not user or not password:
        return None
    return user, password


def lab_auth_enabled_for_edc() -> bool:
    return os.environ.get("LAB_AUTH_EDC", "").strip().lower() in ("1", "true", "yes")


def edc_passthrough_launch(request: Request) -> bool:
    """Console opens mock EDC with a session token — skip a second login gate."""
    return bool(request.args.get("token"))


def check_lab_auth(request: Request) -> Response | None:
    if request.path in PUBLIC_PATHS:
        return None
    if edc_passthrough_launch(request):
        return None
    expected = _expected_credentials()
    if expected is None:
        return None

    exp_user, exp_pass = expected
    auth = request.authorization
    if auth and auth.username == exp_user and auth.password == exp_pass:
        return None

    return Response(
        "Authentication required.",
        401,
        {
            "WWW-Authenticate": 'Basic realm="Nexa Trials Lab", charset="UTF-8"',
            "Cache-Control": "no-store",
        },
    )
