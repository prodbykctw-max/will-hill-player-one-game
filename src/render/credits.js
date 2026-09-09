// THE CREDITS — a black screen, his names rolling up it like the end of a
// movie.
//
// Client: "there were supposed to be ending credits showing that I did all
// the motherfucking music and the sound effects... development done by me
// and Rare Agency." Placement: "talked to the options menu as well as a new
// screen, like a black screen like movie Credit like at the end, the title
// intro Music should play." Trigger: "not just a result screen... when the
// game is over and you've beat the game then you get ending credits" — the
// win screen only, never gameOver, and only after the stats have finished
// counting up, not instead of them.
//
// ⚠️ WHO'S PRESENTING, SETTLED LATE: "The rare agency is who Scoon is
// paying. So it would be the rare agency presents and then sound effects
// and music. It will be by prod by KCTW, music prod by kctw SFX prod by
// kctw." Development itself stays credited to prodbyKCTW too — that line
// was already settled in src/assets/audio/CREDITS.md and nothing here
// contradicts it.
//
// NOTHING IS PAINTED HERE. There is no plate for this screen — it was never
// commissioned — so unlike ending.js this file draws real text on a real
// black fill, the same overlay palette (`#ffd66e` gold, cream body) main.js
// already uses for PAUSED and GAME OVER rather than inventing a third one.
//
// ⚠️ THE REAL MARK NOW, NOT DRAWN TEXT. His actual logo arrived
// (assets/brand/rare-agency/README.md) after this screen first shipped
// text-only — that text used Ǝ, U+018E LATIN CAPITAL LETTER REVERSED E,
// because the mark itself is spelt with a genuinely reversed final E
// (docs/CREDITS.md); the artwork bears that out. `logo: true` below draws
// the actual bitmap (the logoImg below LINES) instead of setting it in
// type. If it somehow hasn't finished loading by the time this screen is
// reached — it's 69KB and starts loading the moment this module does, so in
// practice it always has — draw() falls back to the same Ǝ text this line
// used to be.
import rareAgencyLogo from '../assets/brand/rare-agency-logo.webp';

const LOGO_FALLBACK_TEXT = 'RARƎ AGENCY';
const LINES = [
  { logo: true, fallback: LOGO_FALLBACK_TEXT },
  { small: 'PRESENTS' },
  { gap: 1 },
  { title: 'WILL HILL: PLAYER ONE' },
  { gap: 1 },
  { role: 'GAME DEVELOPMENT' },
  { name: 'prodbyKCTW' },
  { gap: 0.6 },
  { role: 'MUSIC' },
  { name: 'prod by KCTW' },
  { gap: 0.6 },
  { role: 'SOUND EFFECTS' },
  { name: 'prod by KCTW' },
  { gap: 1.4 },
  { small: 'THANK YOU FOR PLAYING' },
];

const GOLD = '#ffd66e';
const CREAM = 'rgba(232,217,160,0.92)';
const WHITE = 'rgba(255,255,255,0.86)';

// Scroll speed in CSS px per tick, at a 1x reference scale — scaled by S
// below so it crosses the same fraction of the screen regardless of phone
// size, the same convention ending.js's box.dw / ENDING_W follows.
const SPEED = 0.85;

// Kicked off the moment this module loads, not when the credits screen is
// first reached — it's 69KB (see tools/matte_rare_agency.py), nowhere near
// images.js's boot-critical manifest (this file imports nothing from it and
// never will — that chain is owned elsewhere, see docs/CHECK_FIRST.md), and
// this screen is reached at the very earliest ~5.3s after a player has
// already won a five-stage run. In practice the mark has always finished
// loading long before anyone gets here; logoReady exists for the one
// hypothetical frame it hasn't.
const logoImg = new Image();
let logoReady = false;
let logoAspect = 1497 / 735; // the source file's own ratio, until onload corrects it
logoImg.onload = () => {
  logoAspect = logoImg.naturalWidth / logoImg.naturalHeight;
  logoReady = true;
};
logoImg.src = rareAgencyLogo;

export function createCredits(ctx, canvas) {
  // Laid out once per resize (or once the logo finishes loading) rather
  // than every frame — canvas.width doesn't change mid-scroll, and
  // recomputing 15 lines' sizes 60 times a second for a screen nobody
  // interacts with is pointless work.
  let laidW = -1;
  let laidLogoReady = false;
  let blockH = 0;
  let rows = [];

  function layout() {
    const S = Math.max(0.6, Math.min(1.6, canvas.width / 430));
    rows = [];
    let y = 0;
    for (const line of LINES) {
      if (line.gap != null) { y += 34 * S * line.gap; continue; }
      if (line.logo) {
        if (logoReady) {
          const w = canvas.width * 0.66;
          const h = w / logoAspect;
          rows.push({ logo: true, y, w, h });
          // Roughly the same *1.55 breathing room the text rows use below,
          // just measured off the image's own height instead of a font size.
          y += h * 1.3;
        } else {
          const size = 30 * S;
          rows.push({ text: line.fallback, y, size, color: GOLD, weight: 700, spacing: '0' });
          y += size * 1.55;
        }
        continue;
      }
      const size = line.title ? 20 * S
        : line.role ? 13 * S : line.name ? 17 * S : 15 * S;
      const color = line.role ? GOLD : line.name ? WHITE : CREAM;
      const weight = line.title || line.name ? 700 : 600;
      const spacing = line.role ? '0.12em' : '0';
      rows.push({ text: line.title || line.role || line.name || line.small,
        y, size, color, weight, spacing });
      y += size * 1.55;
    }
    blockH = y;
    laidW = canvas.width;
    laidLogoReady = logoReady;
  }

  return {
    // Ticks until the block has fully scrolled off the top, plus a screen's
    // worth of lead-in — the number main.js waits on before auto-advancing.
    ticksFor(scale) {
      if (laidW !== canvas.width || laidLogoReady !== logoReady) layout();
      return Math.ceil((canvas.height + blockH) / (SPEED * scale)) + 40;
    },
    draw(t, scale = Math.max(0.6, Math.min(1.6, canvas.width / 430))) {
      if (laidW !== canvas.width || laidLogoReady !== logoReady) layout();
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = 'center';
      const scrollY = canvas.height - t * SPEED * scale;
      for (const r of rows) {
        const y = scrollY + r.y;
        if (r.logo) {
          // Skip nowhere-near-visible logo rows too — same reasoning as the
          // text cull below, just measured against the image's own height.
          if (y + r.h < -60 || y > canvas.height + 60) continue;
          ctx.drawImage(logoImg, canvas.width / 2 - r.w / 2, y, r.w, r.h);
          continue;
        }
        // Skip anything nowhere near the visible band — cheap and avoids
        // fillText calls for lines that are hundreds of px offscreen.
        if (y < -60 || y > canvas.height + 60) continue;
        ctx.font = `${r.weight} ${Math.round(r.size)}px sans-serif`;
        ctx.fillStyle = r.color;
        if (r.spacing !== '0') {
          drawTracked(ctx, r.text, canvas.width / 2, y, 0.12 * r.size);
        } else {
          ctx.fillText(r.text, canvas.width / 2, y);
        }
      }
      ctx.restore();
    },
  };
}

// Canvas has no native letter-spacing, so the role labels (GAME DEVELOPMENT,
// MUSIC, SOUND EFFECTS) get theirs by hand: measure the tracked width first
// so the whole string still lands centred, then walk it letter by letter.
function drawTracked(ctx, text, cx, y, extra) {
  const chars = [...text];
  let total = 0;
  for (const c of chars) total += ctx.measureText(c).width + extra;
  total -= extra;
  let x = cx - total / 2;
  for (const c of chars) {
    const w = ctx.measureText(c).width;
    ctx.fillText(c, x + w / 2, y);
    x += w + extra;
  }
}
