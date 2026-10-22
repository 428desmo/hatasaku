import unittest
from migrate_domain import domain_patch, OLD, NEW
from test_publish import NGINX

class DomainTest(unittest.TestCase):
    def test_only_names_and_redirect_change(self):
        source=NGINX.replace('listen 80;',f'listen 80;\n    server_name {OLD};').replace('listen 443 ssl;',f'listen 443 ssl;\n    server_name {OLD};').replace('https://example.test',f'https://{OLD}')
        result=domain_patch(source)
        self.assertEqual(result.count(f'server_name {NEW} {OLD};'),2)
        self.assertIn('https://$host$request_uri',result)
        self.assertIn('location /loop/ { alias /srv/loop/web/current/; }',result)
        self.assertEqual(domain_patch(result),result)
        self.assertEqual(result.replace(f'{NEW} {OLD}',OLD).replace('https://$host',f'https://{OLD}'),source)
    def test_unexpected_servers_rejected(self):
        with self.assertRaises(ValueError):domain_patch('server {}')
        with self.assertRaises(ValueError):domain_patch('server_name external.example;\nroot /srv/quota/web/current/portal;')
