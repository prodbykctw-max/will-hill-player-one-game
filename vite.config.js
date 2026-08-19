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


// ── THE SERVICE WORKER, WRITTEN FROM THE BUILD THAT SHIPS ────────────────
//
// Client, with a screenshot of his own title screen stuck on LOADING…, and a
// tester: "Loading screen taking a bit… from browser it loads long, for like
// 6 seconds at least." Then: "a new pwa from the site takes as long to load
// as well."
//
// That last sentence is the one that matters. An installed PWA with no
// service worker is a bookmarked tab — it precaches NOTHING, so every cold
// open refetches the whole game. Measured against the production build:
// 101 images, 8.99 MB, all of it gated before PRESS START is reachable.
//
// ⚠️ AND GITHUB PAGES SENDS `cache-control: max-age=600` ON EVERYTHING,
// CONTENT-HASHED ASSETS INCLUDED. Ten minutes. That is why the second load
// was fast for the tester and the fifth one will not be: after ten minutes
// the browser revalidates all hundred-odd files, and a hundred conditional
// round trips on a phone is slow even when every answer is 304 and no bytes
// move. Pages cannot be configured, so this is the only place to fix it.
//
// The strategy is only safe because Vite content-hashes: a file under
// /assets/ whose name contains its own hash can never change meaning, so
// cache-first with no revalidation is CORRECT, not merely fast. Everything
// else — the document, the manifest, the icons — is network-first so a deploy
// is picked up on the next launch and nobody is pinned to an old build.
//
// ⚠️ apply: 'build' IS LOAD-BEARING. The harnesses drive the dev server, and
// a service worker caching dev modules would make them grade a build that no
// longer exists. There is no sw.js in dev at all; the registration in
// main.js is behind import.meta.env.PROD and folds to dead code there.
function serviceWorkerPlugin() {
  return {
    name: 'will-hill-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      // The exact filenames this build produced. Anything cached that is NOT
      // in this list is from an older build and is purged on activate, so the
      // cache cannot grow without bound across a contest's worth of deploys.
      const files = Object.keys(bundle).filter((f) => f.startsWith('assets/'));
      // The build id changes whenever the asset set changes, which is what
      // makes activate fire and prune.
      let h = 0;
      for (const f of files) for (let i = 0; i < f.length; i++) h = (h * 31 + f.charCodeAt(i)) | 0;
      const sw = SW_SOURCE
        .replace('__BUILD__', String(h >>> 0))
        .replace('__ASSETS__', JSON.stringify(files));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
    },
  };
}

const SW_SOURCE = `/* generated by vite.config.js - do not edit dist/sw.js. build __BUILD__ */
// ⚠️ ONE STABLE CACHE, NOT ONE PER BUILD. The name used to embed the build
// id, and activate's "delete every other cache" line then threw away the
// ENTIRE cache on every deploy — every unchanged plate and every song,
// 21 MB re-fetched each time, which is why music that had been instant went
// cold after each of a heavy day's deploys. Hashed names make per-build
// caches pointless: an unchanged file keeps its hash, and the per-entry
// purge below already evicts exactly the files a new build dropped.
const CACHE = 'wh-p1-static';
const ASSETS = new Set(__ASSETS__);
const isHashedAsset = (url) => {
  const i = url.pathname.indexOf('/assets/');
  return i !== -1 && ASSETS.has(url.pathname.slice(i + 1));
};

self.addEventListener('install', (e) => {
  // No precache list: pulling 9 MB at install time would move the wait rather
  // than remove it, and a player who never reaches L5P should never pay for
  // its plates. The cache fills with exactly what the game actually asks for.
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    const c = await caches.open(CACHE);
    // Purge anything this build no longer references - old hashed assets from
    // previous deploys would otherwise accumulate forever.
    for (const req of await c.keys()) {
      try { if (!isHashedAsset(new URL(req.url))) await c.delete(req); } catch (_e) {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_e) { return; }
  if (url.origin !== self.location.origin) return;   // never the leaderboard

  if (isHashedAsset(url)) {
    // CACHE-FIRST, NO REVALIDATION. The hash in the filename IS the version.
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok) c.put(req, res.clone());
      return res;
    })());
    return;
  }

  // Everything else - the document, the manifest, the icons - NETWORK-FIRST,
  // so a deploy lands on the next launch. The cache is only the offline
  // fallback, which is also what makes the installed app open on a bad train.
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await caches.match(req);
      if (hit) return hit;
      throw err;
    }
  })());
});
`;

export default defineConfig({
  base: './',
  plugins: [capturePlugin(), stripHtmlCommentsPlugin(), serviceWorkerPlugin()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0, // keep imported assets as separate hashed files, not inlined base64
  },
});
