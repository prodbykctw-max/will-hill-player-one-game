// Tiny image-preload helper. Vite's asset imports give us URL strings (see
// entities/player.js, entities/enemy.js, world/stages.js) — this turns them
// into loaded HTMLImageElements the renderer can actually draw.

// ⚠️ A STALLED IMAGE FIRES NEITHER onload NOR onerror, AND THAT IS THE BUG
// THIS EXISTS TO STOP. The boot is one Promise.all over ~100 images; a request
// that opens and then goes nowhere — a phone handing off between cell and
// wifi, a proxy that accepts and never answers — leaves its promise pending
// forever, so the whole boot hangs on LOADING… with no error, no console line
// and nothing to retry. It is NOT a slow load and it does NOT resolve itself.
// A player reported the loading screen "taking a bit"; that one was genuinely
// just bytes, but the same screen is what a true stall looks like, and there
// was no way to tell them apart from the outside.
//
// So: every image gets a deadline and one retry with a cache-busting query, on
// the theory that a stalled connection is stalled for that URL and a fresh one
// may not be. Two attempts, not five — this is on the boot path and a phone
// that cannot fetch a file twice is not going to manage it on the fifth try.
const LOAD_TIMEOUT_MS = 15000;

export function loadImage(url, { timeout = LOAD_TIMEOUT_MS, retry = true } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      // ⚠️ CLEAR src BEFORE RETRYING. Leaving the dead request attached keeps
      // the browser's per-host connection slot occupied, which on a phone
      // (6 connections) means a handful of stalls can starve every image
      // still queued behind them.
      img.onload = img.onerror = null;
      img.src = '';
      if (retry) {
        const bust = url + (url.includes('?') ? '&' : '?') + 'r=1';
        loadImage(bust, { timeout, retry: false }).then(resolve, reject);
      } else {
        reject(new Error(`image timed out after ${timeout}ms: ${url}`));
      }
    }, timeout);
    img.onload = () => { if (done) return; done = true; clearTimeout(timer); resolve(img); };
    img.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // A hard error retries too — a 5xx or a dropped connection on one file
      // out of a hundred used to fail the entire boot to ASSET LOAD FAILED.
      if (retry) {
        const bust = url + (url.includes('?') ? '&' : '?') + 'r=1';
        loadImage(bust, { timeout, retry: false }).then(resolve, reject);
      } else {
        reject(new Error(`image failed: ${url}`));
      }
    };
    img.src = url;
  });
}

export function loadImages(urlMap, opts) {
  const keys = Object.keys(urlMap);
  return Promise.all(keys.map((k) => loadImage(urlMap[k], opts))).then((imgs) => {
    const out = {};
    keys.forEach((k, i) => (out[k] = imgs[i]));
    return out;
  });
}
