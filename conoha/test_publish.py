import unittest
from publish import nginx_patch, portal_patch

NGINX = '''server {
    listen 80;
    return 301 https://example.test$request_uri;
}
server {
    listen 443 ssl;
    root /srv/quota/web/current/portal;
    location /quota/ { alias /srv/quota/web/current/; }
    location /loop/ { alias /srv/loop/web/current/; }
}
'''
PORTAL = '''<html><head><meta name="app-index"><style>.apps {display:grid}</style></head><body>
<div>THREE GAMES</div><nav><a href="#quota">Quota</a></nav><small>3 titles</small>
<div class="apps">
<article><a href="/quota/">Quota</a></article>
<article><a href="/loop/">Loop</a></article>
        </div>
      </main>
</body></html>'''

class PublishPatchTest(unittest.TestCase):
    def test_routes_only_added_to_content_server(self):
        result = nginx_patch(NGINX, '/srv/hatasaku')
        self.assertEqual(result.split('server {')[1], NGINX.split('server {')[1])
        self.assertIn('location /loop/ { alias /srv/loop/web/current/; }', result)
        self.assertEqual(result.count('location ^~ /hatasaku/'), 1)
        self.assertEqual(result.count('{'), result.count('}'))
        self.assertEqual(nginx_patch(result, '/srv/hatasaku'), result)

    def test_index_preserves_games_and_adds_one_card(self):
        result = portal_patch(PORTAL)
        for link in ['/quota/', '/loop/', '/hatasaku/']:
            self.assertIn(f'href="{link}"', result)
        self.assertEqual(result.count('id="hatasaku"'), 1)
        self.assertIn('FOUR GAMES', result)
        self.assertEqual(portal_patch(result), result)

    def test_unknown_configs_are_rejected(self):
        with self.assertRaises(ValueError): nginx_patch('server {}', '/srv/hatasaku')
        with self.assertRaises(ValueError): portal_patch('<html>unknown</html>')

if __name__ == '__main__': unittest.main()
