import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// DEV-ONLY capture endpoint. Browsers suspend requestAnimationFrame and stop
// compositing when the preview pane isn't visible, so screenshots aren't
// always available during headless verification. Combined with the `?pump=1`
// timer shim in src/core/loop.js, this lets a run be driven and its canvas
// written straight to disk for inspection.
//   POST /__capture  body: a data: URL  ->  tools/captures/<name>.png
// Same idea as the Jandé project's devserver `POST /save`. Not part of the
// production build — `apply: 'serve'` keeps it out of `vite build`.
function capturePlugin() {
  return {
    name: 'will-hill-capture',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__capture', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end('POST only');
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'capture')
              .replace(/[^a-z0-9_-]/gi, '');
            const b64 = body.slice(body.indexOf(',') + 1);
            const dir = path.resolve(process.cwd(), 'tools/captures');
            fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, `${name}.png`);
            fs.writeFileSync(file, Buffer.from(b64, 'base64'));
            res.end(file);
          } catch (e) {
            res.statusCode = 500;
            res.end(String(e));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [capturePlugin()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0, // keep imported assets as separate hashed files, not inlined base64
  },
});
