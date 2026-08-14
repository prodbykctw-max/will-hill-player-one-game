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

// ⚠️ HTML COMMENTS SHIP. JAVASCRIPT COMMENTS DO NOT.
//
// esbuild strips every `//` and `/* */` out of the bundle on the way through,
// so the engineering notes in src/ never reach a browser — measured: zero
// occurrences of "Client:" in dist/assets/index-*.js. `index.html` gets no
// such treatment. Its `<!-- -->` blocks were being served verbatim, nine of
// them, and one quoted the client word for word. That is internal
// conversation sitting in View Source on a public contest page.
//
// The comments are worth KEEPING IN THE SOURCE — they are the reason half the
// decisions in that file are legible a month later — so they are removed at
// BUILD time instead of being deleted or thinned out. `apply: 'build'` means
// dev still serves them, and reading the file is unchanged.
//
// ⚠️ AND SO DO THE CSS COMMENTS IN THE INLINE <style>. Removing only the
// `<!-- -->` blocks left 24 `/* */` ones in the stylesheet, two of them
// quoting the client word for word — Vite does not minify an inline <style>
// in index.html, so they went out verbatim as well. Both kinds are stripped
// here, and the check that matters is the one in the build log below: zero
// occurrences of "Client:" anywhere in dist/.
//
// The regexes are safe on this document specifically: it has no inline
// <script>, no conditional comments, and nothing in the CSS that contains
// `/*` or `<!--` inside a string or a url(). Check that again before pasting
// third-party markup or a CSS framework into index.html.
function stripHtmlCommentsPlugin() {
  return {
    name: 'will-hill-strip-html-comments',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/<!--[\s\S]*?-->/g, '')
        // CSS comments, but ONLY inside the style block — never loose across
        // the whole document, where `/*` could appear in ordinary text.
        .replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi,
          (_m, attrs, css) => `<style${attrs}>${css.replace(/\/\*[\s\S]*?\*\//g, '')}</style>`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [capturePlugin(), stripHtmlCommentsPlugin()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0, // keep imported assets as separate hashed files, not inlined base64
  },
});
