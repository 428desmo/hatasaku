#!/usr/bin/env python3
"""Add the lab hostname to the existing shared vhost; retain all application routes.

The old hostname remains usable for bookmarks and browser-local saves. Nginx and
Certbot renewal hooks are backed by existing services, not a second proxy stack.
"""
from pathlib import Path
import datetime
import os
import re
import shutil
import subprocess
import time

OLD = 'app1.gunsnstoneroses.com'
NEW = 'lab.tokyo-desmo.com'
IP = '133.88.122.153'
CONFIG = Path('/etc/nginx/conf.d/quota-https.conf')


def domain_patch(text):
    if 'root /srv/quota/web/current/portal;' not in text:
        raise ValueError('Unexpected shared vhost')
    pattern = r'(?m)^(\s*server_name\s+)([^;]+);'
    names = re.findall(pattern, text)
    if len(names) != 2 or any(set(value.split()) not in ({OLD}, {OLD, NEW}) for _, value in names):
        raise ValueError('Unexpected vhost names; refusing broad changes')
    text = re.sub(pattern, lambda m: m[1] + NEW + ' ' + OLD + ';', text)
    text = text.replace('return 301 https://' + OLD + '$request_uri;', 'return 301 https://$host$request_uri;')
    if 'return 301 https://$host$request_uri;' not in text:
        raise ValueError('Unexpected HTTP redirect')
    return text


def run(*args):
    subprocess.run(args, check=True)


def write_config(text):
    temporary = CONFIG.with_name(CONFIG.name + '.lab-next')
    temporary.write_text(text)
    shutil.copymode(CONFIG, temporary)
    os.replace(temporary, CONFIG)


def health():
    for host in (NEW, OLD):
        for path, marker in [('/', 'app-index'), ('/hatasaku/', 'はたさく'), ('/quota2/', 'Quota'), ('/fragile/', 'Fragile'), ('/loop/', 'Loop'), ('/lxxp/', 'LxxP')]:
            body = subprocess.check_output(['curl', '-fsS', '--max-time', '20', '--resolve', f'{host}:443:127.0.0.1', f'https://{host}{path}'])
            if marker.lower().encode() not in body.lower():
                raise RuntimeError(f'Failed content check: {host}{path}')
        redirect = subprocess.check_output(['curl', '-sS', '-o', '/dev/null', '-w', '%{redirect_url}', '--resolve', f'{host}:80:127.0.0.1', f'http://{host}/hatasaku/?check=domain']).decode()
        if redirect != f'https://{host}/hatasaku/?check=domain':
            raise RuntimeError(f'Failed HTTP redirect: {host}')


def migrate():
    if os.geteuid() != 0:
        raise PermissionError('Root required')
    for host in (NEW, OLD):
        addresses = subprocess.check_output(['dig', '+short', host, 'A']).decode().split()
        if IP not in addresses:
            raise RuntimeError(f'DNS not ready for {host}')
    original = CONFIG.read_text()
    updated = domain_patch(original)
    backup = Path('/srv/hatasaku/backups') / ('domain-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    backup.mkdir(parents=True)
    shutil.copy2(CONFIG, backup / CONFIG.name)
    try:
        write_config(updated)
        run('nginx', '-t')
        run('systemctl', 'reload', 'nginx')
        # Extend the current certificate/account. Its paths and existing reload hook stay valid.
        run('certbot', 'certonly', '--nginx', '--cert-name', OLD, '--expand', '-d', OLD, '-d', NEW, '--non-interactive')
        run('nginx', '-t')
        run('systemctl', 'reload', 'nginx')
        for attempt in range(6):
            try:
                health()
                break
            except Exception:
                if attempt == 5:
                    raise
                time.sleep(1)
        run('systemctl', 'is-active', 'certbot-renew.timer')
    except Exception:
        shutil.copy2(backup / CONFIG.name, CONFIG)
        run('nginx', '-t')
        run('systemctl', 'reload', 'nginx')
        raise
    print(f'Domain ready: https://{NEW}/ ; previous config: {backup}')


if __name__ == '__main__':
    migrate()
