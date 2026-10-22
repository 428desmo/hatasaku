#!/usr/bin/env bash
set -Eeuo pipefail
[ "$EUID" -eq 0 ] || { echo 'Root privileges required.' >&2; exit 1; }
stage=$(cd "$(dirname "$0")" && pwd)
root=$1; domain=$2; portal=$3
[ "$root" = /srv/hatasaku ] && [[ "$domain" =~ ^[A-Za-z0-9.-]+$ ]] || exit 1
[ "$portal" = /srv/quota/web/current/portal/index.html ] || exit 1
for file in index.html app.js style.css hatasaku-cover.svg; do [ -s "$stage/web/$file" ] || exit 1; done
# Public assets only: never upload source, SSH configuration or project files.
[ "$(find "$stage/web" -type f | wc -l)" -eq 4 ] || exit 1
mkdir -p "$root/web/releases" "$root/backups"
release=$(mktemp -d "$root/web/releases/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXXXX")
cp "$stage/web/"{index.html,app.js,style.css,hatasaku-cover.svg} "$release/"
chmod 755 "$release"
chmod 644 "$release/"*
python3 "$stage/publish.py" "$root" "$release" "$portal" "$domain"
