import { build } from 'esbuild';
import { mkdir, copyFile, stat, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
await mkdir(path.join(root, 'dist'), { recursive: true });
const result = await build({ entryPoints: [path.join(root, 'app.ts')], bundle: true, format: 'esm', target: 'es2022', minify: true, outfile: path.join(root, 'dist/app.js'), metafile: true });
for (const file of ['index.html', 'style.css']) await copyFile(path.join(root, file), path.join(root, 'dist', file));
console.log(`Web Lite: ${Object.values(result.metafile.outputs).reduce((n, f) => n + f.bytes, 0)} bytes JavaScript`);
if (process.argv.includes('--serve')) {
  const port = Number(process.env.PORT || 4173);
  createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!['index.html', 'app.js', 'style.css'].includes(name)) { res.writeHead(404).end(); return; }
    try {
      const file = path.join(root, 'dist', name);
      await stat(file);
      res.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  }).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}`));
}
