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
// ⚠️ Ǝ IS A REAL UNICODE CHARACTER (U+018E, LATIN CAPITAL LETTER REVERSED
// E), typed directly rather than drawn with a manual horizontal flip.
// docs/CREDITS.md: "RARƎ AGENCY is spelt with a REVERSED final E... if the
// name is ever drawn as text rather than placed as artwork, flip that
// glyph." Every system sans-serif this game already renders in (the same
// stack used for PAUSED/GAME OVER) carries this codepoint, so the browser
// draws the mirror for free — worth revisiting only if some device is ever
// caught rendering it as a tofu box or a plain E.
const LINES = [
  { big: 'RARƎ AGENCY' },
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

export function createCredits(ctx, canvas) {
  // Laid out once per resize rather than every frame — canvas.width doesn't
  // change mid-scroll, and recomputing 15 lines' font sizes 60 times a
  // second for a screen nobody interacts with is pointless work.
  let laidW = -1;
  let blockH = 0;
  let rows = [];

  function layout() {
    const S = Math.max(0.6, Math.min(1.6, canvas.width / 430));
    rows = [];
    let y = 0;
    for (const line of LINES) {
      if (line.gap != null) { y += 34 * S * line.gap; continue; }
      const size = line.big ? 30 * S : line.title ? 20 * S
        : line.role ? 13 * S : line.name ? 17 * S : 15 * S;
      const color = line.big || line.role ? GOLD : line.name ? WHITE : CREAM;
      const weight = line.big || line.title || line.name ? 700 : 600;
      const spacing = line.role ? '0.12em' : '0';
      rows.push({ text: line.big || line.title || line.role || line.name || line.small,
        y, size, color, weight, spacing });
      y += size * 1.55;
    }
    blockH = y;
    laidW = canvas.width;
  }

  return {
    // Ticks until the block has fully scrolled off the top, plus a screen's
    // worth of lead-in — the number main.js waits on before auto-advancing.
    ticksFor(scale) {
      if (laidW !== canvas.width) layout();
      return Math.ceil((canvas.height + blockH) / (SPEED * scale)) + 40;
    },
    draw(t, scale = Math.max(0.6, Math.min(1.6, canvas.width / 430))) {
      if (laidW !== canvas.width) layout();
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = 'center';
      const scrollY = canvas.height - t * SPEED * scale;
      for (const r of rows) {
        const y = scrollY + r.y;
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
