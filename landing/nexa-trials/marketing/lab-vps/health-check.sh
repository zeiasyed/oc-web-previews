#!/usr/bin/env bash
# Optional cron job: */5 * * * * /opt/nexa-labs/landing/nexa-trials/marketing/lab-vps/health-check.sh
set -euo pipefail

LAB_VPS_DIR="${LAB_VPS_DIR:-/opt/nexa-labs/landing/nexa-trials/marketing/lab-vps}"
cd "$LAB_VPS_DIR"

check() {
  local url="$1"
  if curl -fsS -m 10 "$url" >/dev/null; then
    echo "OK  $url"
    return 0
  fi
  echo "FAIL $url — restarting compose"
  docker compose up -d
  return 1
}

failed=0
check "http://127.0.0.1:8070/health" || failed=1
check "http://127.0.0.1:8071/health" || failed=1
exit "$failed"
