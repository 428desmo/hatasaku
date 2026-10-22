#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "$0")/common.sh"
remote_stage=$(remote 'mktemp -d /tmp/hatasaku-domain.XXXXXXXX')
[[ "$remote_stage" =~ ^/tmp/hatasaku-domain\.[A-Za-z0-9]+$ ]] || exit 1
cleanup() { remote "rm -rf -- '$remote_stage'" >/dev/null 2>&1 || true; }
trap cleanup EXIT
rsync -az --timeout=120 -e "$RSYNC_SSH" "$CONOHA_DIR/migrate_domain.py" "$SSH_TARGET:$remote_stage/"
if [ "$SSH_USER" = root ]; then remote "python3 '$remote_stage/migrate_domain.py'"; else remote "sudo -n python3 '$remote_stage/migrate_domain.py'"; fi
