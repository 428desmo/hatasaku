#!/usr/bin/env bash
# Build and publish only the standalone Hatasaku static bundle.
set -Eeuo pipefail
source "$(dirname "$0")/common.sh"
cd "$PROJECT_ROOT"
python3 -m unittest discover -s conoha -p 'test_*.py'
npm run check:lite
npm run test:lite
npm run build:lite
remote 'echo "SSH connection OK"'
remote_stage=$(remote 'mktemp -d /tmp/hatasaku-deploy.XXXXXXXX')
[[ "$remote_stage" =~ ^/tmp/hatasaku-deploy\.[A-Za-z0-9]+$ ]] || exit 1
cleanup() { remote "rm -rf -- '$remote_stage'" >/dev/null 2>&1 || true; }
trap cleanup EXIT
rsync -az --timeout=120 -e "$RSYNC_SSH" "$PROJECT_ROOT/web-lite/dist/" "$SSH_TARGET:$remote_stage/web/"
rsync -az --timeout=120 -e "$RSYNC_SSH" "$CONOHA_DIR/deploy-server.sh" "$CONOHA_DIR/publish.py" "$SSH_TARGET:$remote_stage/"
remote "$(root_command "$remote_stage/deploy-server.sh" "$REMOTE_ROOT" "$PUBLIC_DOMAIN" "$PORTAL_FILE")"
echo "Published: https://$PUBLIC_DOMAIN/hatasaku/"
