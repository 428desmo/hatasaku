#!/usr/bin/env bash
set -euo pipefail
CONOHA_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$CONOHA_DIR/.." && pwd)
CONFIG=${HATASAKU_DEPLOY_CONFIG:-"$CONOHA_DIR/config.sh"}
[ -f "$CONFIG" ] || { echo 'Copy config.example.sh to config.sh first.' >&2; exit 1; }
source "$CONFIG"
: "${VPS_HOST:?Set VPS_HOST}"
SSH_USER=${SSH_USER:-root}; SSH_PORT=${SSH_PORT:-22}; SSH_KEY=${SSH_KEY:-}
REMOTE_ROOT=${REMOTE_ROOT:-/srv/hatasaku}
PUBLIC_DOMAIN=${PUBLIC_DOMAIN:-lab.tokyo-desmo.com}
PORTAL_FILE=${PORTAL_FILE:-/srv/quota/web/current/portal/index.html}
[[ "$VPS_HOST" =~ ^[A-Za-z0-9._-]+$ ]] && [[ "$SSH_USER" =~ ^[A-Za-z0-9_-]+$ ]] || exit 1
[[ "$SSH_PORT" =~ ^[1-9][0-9]*$ ]] && [ "$SSH_PORT" -le 65535 ] || exit 1
[[ "$REMOTE_ROOT" = /srv/hatasaku ]] || { echo 'This deploy is restricted to /srv/hatasaku.' >&2; exit 1; }
[[ "$PUBLIC_DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || exit 1
[[ "$PORTAL_FILE" = /srv/quota/web/current/portal/index.html ]] || exit 1
SSH_TARGET="$SSH_USER@$VPS_HOST"
SSH_ARGS=(-o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -p "$SSH_PORT")
if [ -n "$SSH_KEY" ]; then SSH_ARGS+=(-i "$SSH_KEY"); fi
printf -v RSYNC_SSH '%q ' ssh "${SSH_ARGS[@]}"
remote() { ssh "${SSH_ARGS[@]}" "$SSH_TARGET" "$@"; }
root_command() {
  if [ "$SSH_USER" = root ]; then printf 'bash '; else printf 'sudo -n bash '; fi
  printf '%q ' "$@"
}
