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
INSTALL_ROOT="${INSTALL_ROOT:-/opt/nexa-labs}"
if [ ! -f "$INSTALL_ROOT/data/nexasource/source_values.json" ] && [ -f "$INSTALL_ROOT/landing/nexa-source-flow-demo/demo_data/source_values.json" ]; then
  cp "$INSTALL_ROOT/landing/nexa-source-flow-demo/demo_data/source_values.json" "$INSTALL_ROOT/data/nexasource/"
fi
if [ ! -d "$INSTALL_ROOT/data/nexasource/form_schemas" ] && [ -d "$INSTALL_ROOT/landing/nexa-source-flow-demo/demo_data/form_schemas" ]; then
  cp -r "$INSTALL_ROOT/landing/nexa-source-flow-demo/demo_data/form_schemas" "$INSTALL_ROOT/data/nexasource/"
fi
docker compose build
docker compose up -d

echo ">> Refreshing edge nginx (client demo videos)"
mkdir -p "$INSTALL_ROOT/data/client-videos"
if [ -f "$INSTALL_ROOT/.video-origin-secret" ]; then
  SECRET="$(cat "$INSTALL_ROOT/.video-origin-secret")"
  cat > /etc/nginx/nexa-video-auth.conf <<EOF
if (\$arg_key != "$SECRET") {
  return 403;
}
EOF
fi
cp "$LAB_VPS_DIR/nginx-edge.conf" /etc/nginx/sites-available/nexa-labs
nginx -t && systemctl reload nginx

echo "OK  Updated and restarted."
docker compose ps
