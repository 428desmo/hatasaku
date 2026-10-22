#!/usr/bin/env python3
"""Publish Hatasaku while preserving other Nginx routes and index cards.

A persistent backup includes every modified file and the previous release path.
Any failed validation/health check restores files and the previous symlink.
"""
import datetime
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

BEGIN = '    # BEGIN HATASAKU (managed by hatasaku/conoha)'
END = '    # END HATASAKU'
CARD = '''          <!-- BEGIN HATASAKU -->
          <article id="hatasaku" class="app-card quota-card" aria-labelledby="hatasaku-title">
            <div class="app-info">
              <span class="card-kicker">04 / FARMING CARD GAME</span>
              <h2 id="hatasaku-title" class="quota-name">Hatasaku</h2>
              <p class="quota-copy">植えて、待って、実らせる。</p>
              <p class="quota-detail">小さな畑で、先を読む。<br>作物と天候を見極める、1人＋CPUのカードゲーム。</p>
              <a class="play-link" href="/hatasaku/">はたさくをプレイ <span aria-hidden="true">↗</span></a>
            </div>
            <div class="quota-art hatasaku-art"><img src="/hatasaku/hatasaku-cover.svg" alt="スマホの農場画面に4枚の作物カードと、葉のアイコン付きはたさく HATASAKUロゴを重ねたビジュアル" width="1600" height="800" loading="lazy" decoding="async"></div>
          </article>
          <!-- END HATASAKU -->'''
STYLE = '''
    /* BEGIN HATASAKU */
    .hatasaku-art { position: relative; background: #294a3b; overflow: hidden; }
    .hatasaku-art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; }
    @media (min-width: 1001px) { .apps { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    /* END HATASAKU */
'''

def nginx_patch(text, root):
    text = re.sub(re.escape(BEGIN) + r'.*?' + re.escape(END) + r'\n?', '', text, flags=re.S)
    route = f'''{BEGIN}
    location = /hatasaku {{ return 308 /hatasaku/$is_args$args; }}
    location ^~ /hatasaku/ {{
        alias {root}/web/current/;
        index index.html;
        add_header Cache-Control "no-cache";
        add_header X-Content-Type-Options "nosniff" always;
        add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
    }}
{END}
'''
    # Only the content-serving block: HTTPS files also have a redirect server.
    pos = text.rfind('}')
    if pos < 0 or 'root /srv/quota/web/current/portal;' not in text:
        raise ValueError('Unexpected Nginx content server; refusing changes')
    return text[:pos] + route + text[pos:]

def portal_patch(text):
    if 'name="app-index"' not in text or '<div class="apps">' not in text:
        raise ValueError('Unexpected shared index; refusing changes')
    if '<!-- BEGIN HATASAKU -->' in text:
        text = re.sub(r'(?m)^ *<!-- BEGIN HATASAKU -->.*?<!-- END HATASAKU -->', CARD, text, flags=re.S)
    else:
        marker = '        </div>\n      </main>'
        if marker not in text:
            raise ValueError('Cannot locate the end of the app cards')
        text = text.replace(marker, CARD + '\n' + marker, 1)
    if '/* BEGIN HATASAKU */' in text:
        text = re.sub(r'(?m)^ */\* BEGIN HATASAKU \*/.*?/\* END HATASAKU \*/', STYLE.strip('\n'), text, flags=re.S)
    else:
        text = text.replace('</style>', STYLE + '  </style>', 1)
    if 'href="#hatasaku"' not in text:
        text = text.replace('</nav>', '  <a href="#hatasaku">04　Hatasaku</a>\n        </nav>', 1)
    text = text.replace('THREE GAMES', 'FOUR GAMES').replace('3 titles', '4 titles')
    text = text.replace('Quota、Fragile、Loop。3つのゲーム', 'Quota、Fragile、Loop、Hatasaku。4つのゲーム')
    return text

def write_atomic(path, content):
    tmp = path.with_name(path.name + '.hatasaku-new')
    tmp.write_text(content, encoding='utf-8')
    tmp.chmod(path.stat().st_mode & 0o777)
    os.replace(tmp, path)

def switch(current, target):
    temporary = current.with_name('current-hatasaku-next')
    if temporary.is_symlink(): temporary.unlink()
    temporary.symlink_to(target)
    os.replace(temporary, current)

def check(url, marker, domain=None):
    args = ['curl', '-fsS', '--max-time', '15']
    if domain: args += ['--resolve', f'{domain}:443:127.0.0.1']
    body = subprocess.check_output(args + [url])
    if marker.encode().lower() not in body.lower():
        raise RuntimeError(f'Unexpected response: {url}')

def publish(root, release, portal, domain):
    root, release, portal = Path(root), Path(release), Path(portal).resolve()
    if root != Path('/srv/hatasaku') or not release.is_relative_to(root / 'web/releases'):
        raise ValueError('Unexpected deployment destination')
    configs = [Path('/etc/nginx/conf.d/quota.conf'), Path('/etc/nginx/conf.d/quota-https.conf')]
    configs = [p for p in configs if p.is_file()]
    if not configs: raise ValueError('No existing Nginx configuration')
    changes = {p: nginx_patch(p.read_text(), root) for p in configs}
    changes[portal] = portal_patch(portal.read_text())
    backup = root / 'backups' / datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup.mkdir(parents=True)
    current = root / 'web/current'
    if current.exists() and not current.is_symlink(): raise ValueError('Current must be a release symlink')
    old = os.readlink(current) if current.is_symlink() else None
    (backup / 'previous-release.txt').write_text(old or '')
    originals = {}
    for i, path in enumerate(changes):
        saved = backup / f'{i}-{path.name}'
        shutil.copy2(path, saved)
        originals[path] = saved
    try:
        switch(current, release)
        for path, content in changes.items(): write_atomic(path, content)
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        for attempt in range(6):
            try:
                check(f'https://{domain}/hatasaku/', 'はたさく · Web Lite', domain)
                check(f'https://{domain}/hatasaku/app.js', 'HATASAKU', domain)
                check(f'https://{domain}/hatasaku/style.css', '.game-table', domain)
                check(f'https://{domain}/hatasaku/hatasaku-cover.svg', 'HATASAKU', domain)
                check(f'https://{domain}/', 'href="/hatasaku/"', domain)
                for game, marker in [('quota2','Quota'), ('fragile','Fragile'), ('loop','Loop')]:
                    check(f'https://{domain}/{game}/', marker, domain)
                break
            except Exception:
                if attempt == 5: raise
                time.sleep(1)
    except Exception:
        for path, saved in originals.items(): shutil.copy2(saved, path)
        if old: switch(current, old)
        elif current.is_symlink(): current.unlink()
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        raise
    print(f'Published {release}; rollback files: {backup}')

if __name__ == '__main__':
    publish(*sys.argv[1:])
