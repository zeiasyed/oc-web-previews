"""Google Drive helpers for ClinSpark raw data."""

from __future__ import annotations

import csv
import io
import os
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

ROOT = Path(__file__).resolve().parents[1]
CREDENTIALS_FILE = ROOT / "credentials.json"
TOKEN_FILE = ROOT / "token.json"
SCOPES = ["https://www.googleapis.com/auth/drive"]


def get_drive_service():
    creds = None
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            raise RuntimeError(
                "Google Drive token expired. Re-run scripts/fetch_assets.py locally to re-auth."
            )
        TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def list_files(service, folder_id: str) -> list[dict]:
    results, token = [], None
    while True:
        resp = (
            service.files()
            .list(
                q=f"'{folder_id}' in parents and trashed=false",
                fields="nextPageToken,files(id,name,mimeType)",
                pageToken=token,
                pageSize=100,
            )
            .execute()
        )
        results += resp.get("files", [])
        token = resp.get("nextPageToken")
        if not token:
            break
    return results


def download_bytes(service, file_id: str) -> bytes:
    return service.files().get_media(fileId=file_id).execute()


def parse_csv_bytes(data: bytes) -> list[dict]:
    text = data.decode("utf-8-sig", errors="replace")
    return list(csv.DictReader(io.StringIO(text)))


def parse_csv_file(path: Path) -> list[dict]:
    return parse_csv_bytes(path.read_bytes())
