// Tiny image-preload helper. Vite's asset imports give us URL strings (see
// entities/player.js, entities/enemy.js, world/stages.js) — this turns them
// into loaded HTMLImageElements the renderer can actually draw.

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export function loadImages(urlMap) {
  const keys = Object.keys(urlMap);
  return Promise.all(keys.map((k) => loadImage(urlMap[k]))).then((imgs) => {
    const out = {};
    keys.forEach((k, i) => (out[k] = imgs[i]));
    return out;
  });
}
