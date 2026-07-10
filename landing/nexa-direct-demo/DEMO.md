# NexaDirect Demo

Scan handwritten CDASH forms from a local Scanner Inbox folder, simulate OCR extraction with confidence scoring, route low-confidence fields to CRC review, and sync approved data to a mock Medidata Rave EDC.

## Quick start

```powershell
cd nexa-direct-demo
.\setup.ps1      # venv, schemas, sample PDFs, seed inbox
.\run_demo.ps1    # console :5070 + mock Rave :5071
```

## Demo script (presenter)

1. Open **Scanner Inbox** in Explorer (`Reveal inbox folder`) — 24 PDFs for subjects 0101–0103.
2. Click **Process inbox** — activity log shows per-file extract, validate, auto-write vs flagged.
3. Resolve 2–3 items in **Review queue** (edit messy age, confirm ethnicity).
4. Click **Open EDC to verify** — mock Rave shows CDASH forms with green highlighted synced fields.

### Automated verification (no browser)

```powershell
$env:NEXA_DEMO_SPEED="0"
.\.venv\Scripts\python.exe scripts\verify_edc_sync.py
```

Thorough test: 24 inbox PDFs → process → approve all review items → verify all **117 fields** in SQLite and CRF display.

Legacy quick test:

```powershell
.\.venv\Scripts\python scripts\e2e_demo_test.py
```

## Subjects

| ID   | Style   | Behavior                                      |
|------|---------|-----------------------------------------------|
| 0101 | neat    | High confidence, mostly auto-write            |
| 0102 | messy   | Low confidence on age, ethnicity, BP, AE term |
| 0103 | partial | Missing/ambiguous required fields             |

## Verify

```powershell
.\.venv\Scripts\python scripts\e2e_demo_test.py
```

## Ports

- NexaDirect console: **5070**
- Mock Medidata Rave: **5071**

(Ports 5060/5061 are blocked by Chrome/Edge as `ERR_UNSAFE_PORT`.)

External folder (read/write): `C:\Users\zeias\OneDrive\Documents\NexaDirect Demo\Scanner Inbox`
