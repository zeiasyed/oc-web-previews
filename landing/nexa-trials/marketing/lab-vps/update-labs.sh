#!/usr/bin/env bash
# Pull latest code and rebuild lab containers (run on VPS as root).
set -euo pipefail

INSTALL_ROOT="${INSTALL_ROOT:-/opt/nexa-labs}"
BRANCH="${BRANCH:-main}"
LAB_VPS_DIR="$INSTALL_ROOT/landing/nexa-trials/marketing/lab-vps"

cd "$INSTALL_ROOT"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

cd "$LAB_VPS_DIR"
docker compose build
docker compose up -d

echo "OK  Updated and restarted."
docker compose ps
