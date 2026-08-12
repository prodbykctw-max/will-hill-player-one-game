// THE TITLE SCREEN — the client's painting, made live.
//
// IT IS HIS IMAGE, WHOLE. Nothing is redrawn on top: the logo, the two
// roadside signs, PRESS START, OPTIONS, 1UP and HI SCORE are all his. What
// this file adds is motion, cut out of that same painting by the SAM pass
// (tools/sam_group.py 'title' -> tools/cut_still.py) so every moving piece is
// made of the art rather than of shapes invented to sit over it.
//
// WHAT MOVES, AND WHY EACH ONE MOVES THE WAY IT DOES
//
//   clouds  DRIFT. Clouds travel; they do not bend. One translation for the
//           whole card, so nothing can be torn in half at a band edge.
//   signs   SWAY about the foot of their posts. A roadside sign is a plate on
//           a pole and the pole is planted — same model as a tree, which is
//           why it uses the same gust field the EAV canopy does.
//   hero    SWAYS about his shoes, tiny. This is the difference between a
//           character standing there and a photograph of one. The amplitude
//           is a third of the signs' on purpose: a person shifting their
//           weight, not a person swaying.
//
// And PRESS START throbs — see stillscene.pulsePrompt for why it is a glow
// over his lettering rather than a blink that would have to cover it.
//
// COORDINATES ARE FRACTIONS OF THE PAINTING, measured off the emitted masks'
// own bounding boxes (printed by tools/cut_still.py) rather than eyeballed,
// and divided by the 1536x1024 plate. That way they stay correct at any
// screen size, and they stay correct if the plate is ever re-exported larger.

import titleBase from '../assets/backgrounds/title-base.webp';
import titleFront from '../assets/backgrounds/title-front.webp';
import titleSignL from '../assets/backgrounds/title-signL.webp';
import titleSignR from '../assets/backgrounds/title-signR.webp';
import titleHero from '../assets/backgrounds/title-hero.webp';
import spriteManifest from '../assets/backgrounds/title-sprites.json';

export const SRC_W = 1536;
export const SRC_H = 1024;

// The cloud sprites are cut by connected component, so how MANY there are is
// decided by the art, not by this file — globbing them keeps a re-cut that
// finds five clouds instead of four from silently dropping one.
const cloudUrls = import.meta.glob('../assets/backgrounds/title-clouds*.webp',
  { eager: true, query: '?url', import: 'default' });
const urlFor = (file) => cloudUrls[`../assets/backgrounds/${file}`];

// HOW FAST EACH CLOUD CROSSES. Source px per tick, so a full crossing is
// (1536 + w) / speed ticks — at 60Hz these work out at roughly 50 to 95
// seconds end to end. Slow enough to be weather rather than a screensaver,
// quick enough that you can see it happening while you read the logo.
//
// Ordered biggest-first by the cutter, and the bigger clouds are the nearer
// ones, so they get the higher speeds. That is the same parallax rule the
// stage backdrops use, doing the same job: it stops the sky reading as one
// flat sheet sliding past.
const CLOUD_SPEEDS = [0.62, 0.54, 0.34, 0.28];

export const CLOUD_SPRITES = (spriteManifest.clouds || []).map((s, i) => ({
  key: `title_cloud${i}`,
  url: urlFor(s.file),
  x: s.x, y: s.y, w: s.w, h: s.h,
  speed: CLOUD_SPEEDS[i] ?? 0.3,
}));

// Loaded through the same manifest as everything else; see main.js.
export const TITLE_IMAGES = {
  title_base: titleBase,
  // Buildings and the logo, drawn AFTER the clouds so they travel behind the
  // skyline instead of over it. The client's note: the buildings stay put.
  title_front: titleFront,
  title_signL: titleSignL,
  title_signR: titleSignR,
  title_hero: titleHero,
  ...Object.fromEntries(CLOUD_SPRITES.map((s) => [s.key, s.url])),
};

// PRESS START, in the painting's pixels. The mask came back x 504..964,
// y 869..913; padded out to take in the two ◀ ▶ arrows either side, which SAM
// grouped separately and which should light up with the words.
const PROMPT = { x: 488, y: 858, w: 548, h: 62 };
// OPTIONS, one row below it.
export const OPTIONS_PROMPT = { x: 600, y: 926, w: 336, h: 62 };

// ── ZOOM, AND WHY THE TWO CONTROLS STOPPED BEING BOXES ───────────────────
//
// The client kept hitting START when he meant OPTIONS, and the measurement
// says of course he did: the two are painted 15 rows apart, which at plain
// contain-fit on a 430px phone is FOUR AND A TWO TENTHS SCREEN PIXELS. A
// thumb is ten times that. No amount of care aims inside it.
//
// Two changes, because either alone is not enough.
//
// ZOOM scales the card past its contain fit, which on a portrait phone trims
// the left and right edges — so the ceiling is set by what is nearest those
// edges, and that is measured rather than guessed. The 1UP / HI SCORE row runs
// x 52..1475 of 1536, which caps it at 1.07; 1.16 was tried first and the
// screenshot showed exactly what the arithmetic predicts, "ELCOME TO" and a
// clipped score. 1.06 shows x 43..1493: the whole score line, both signs'
// words, and only the outer edge of the right-hand sign's panel.
//
// BIAS STAYS 0 — THE CARD IS CENTRED. It was lifted to -0.55 to hand the space
// underneath to the OPTIONS zone, and that was solving a problem the split
// below had already solved: with the boundary at painting row 920, a centred
// card still leaves roughly 345px of screen under the line, which is eight
// times a thumb. The lift bought nothing and cost the composition, and the
// client's note was that it should "stay center and stretched in the
// up-and-down directions so it appears larger" — i.e. bigger about its own
// middle, not shoved upward.
//
// Bigger here means the ZOOM, uniformly. Not a vertical stretch: "without
// warping it, you ain't gotta do that shit you did with stretching the pixels
// earlier" — a non-uniform scale on a dithered pixel painting is the same
// mistake as the letterbox filler that got thrown out.
//
// And the controls are no longer two small boxes at all — see SPLIT_Y. The
// screen is cut in two: everything above the line starts the game, everything
// below opens the panel. Both targets are enormous and there is exactly one
// boundary to miss instead of two adjacent edges.
export const TITLE_ZOOM = 1.07;
export const TITLE_BIAS = 0;
// In the painting's own rows: below PRESS START (ends 913), above OPTIONS
// (starts ~926). Everything at or under this — including all the black below
// the card — is the OPTIONS half.
export const SPLIT_Y = 920;

// `key` indexes the loaded image set. Bands are in 0..1 of the painting.
// ORDER IS PAINT ORDER: clouds first, then the layer that must cover them,
// then the things standing in front of everything.
export function titleCards(images) {
  return [
    {
      srcW: SRC_W,
      srcH: SRC_H,
      sprites: CLOUD_SPRITES.map((s) => ({ ...s, img: images[s.key] })),
    },
    // The skyline and the logo, over the clouds. Nothing animates it — it is
    // here purely to be in front. Everything below y 340 in the painting is
    // omitted from this layer because no cloud ever reaches down there and
    // the base already has it.
    { img: images.title_front },
    {
      img: images.title_signL,
      // Mask y 298..708: the plate starts at 0.291 and the posts are planted
      // at 0.691.
      sway: [{ top: 0.29, pivot: 0.692, ampFrac: 0.0045, freq: 1.0,
        xRanges: [[0.0, 0.256]] }],
    },
    {
      img: images.title_signR,
      // Mask y 420..775, x 1213..1534.
      sway: [{ top: 0.41, pivot: 0.757, ampFrac: 0.0045, freq: 1.25,
        xRanges: [[0.786, 1.0]] }],
    },
    {
      img: images.title_hero,
      // Mask x 649..919, y 345..844 — pivot on the soles.
      sway: [{ top: 0.336, pivot: 0.824, ampFrac: 0.0016, freq: 0.75,
        xRanges: [[0.418, 0.602]] }],
    },
  ];
}

export function createTitle(ctx, canvas, still) {
  function draw(images, tick) {
    const box = still.draw(images.title_base, titleCards(images), tick,
      TITLE_ZOOM, TITLE_BIAS);
    still.pulsePrompt(box, PROMPT, SRC_W, SRC_H, tick);
    // OPTIONS breathes too, on the opposite beat and cooler, so it reads as a
    // second thing you can press rather than as a caption under the first.
    still.pulsePrompt(box, OPTIONS_PROMPT, SRC_W, SRC_H, tick + 57, '150,210,255');
    drawOptionsButton(box, tick);
    return box;
  }
  // ── THE OPTIONS BUTTON ────────────────────────────────────────────────
  //
  // Drawn in the black BELOW the card, because the painted labels cannot be
  // separated. PRESS START and OPTIONS sit 4 screen pixels apart in the
  // artwork and the zoom is already at its measured ceiling, so no amount of
  // scaling pulls them apart — at 1.07 they are still under four pixels from
  // each other. A dead zone between them would be three pixels wide, which
  // buys nothing.
  //
  // So the reachable OPTIONS control moves off the label entirely and into
  // the empty space underneath: a real, thumb-sized button with 60px of clear
  // black between it and the bottom of the card. Nobody aiming at it can
  // land on PRESS START, and nobody tapping the picture to start can land on
  // it. The painted word is not a decoy — it is inside the same lower zone,
  // so pressing it does the same thing.
  const BTN = { w: 232, h: 60, gapBelowCard: 60 };

  function optionsButton(box) {
    if (!box) return null;
    const y = Math.min(canvas.height - BTN.h - 24,
      box.dy + box.dh + BTN.gapBelowCard);
    return { x: (canvas.width - BTN.w) / 2, y, w: BTN.w, h: BTN.h };
  }

  function drawOptionsButton(box, tick) {
    const b = optionsButton(box);
    if (!b) return;
    const pulse = 0.5 + 0.5 * Math.sin(tick * 0.045);
    ctx.save();
    ctx.beginPath();
    const r = 12;
    ctx.moveTo(b.x + r, b.y);
    ctx.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + b.h, r);
    ctx.arcTo(b.x + b.w, b.y + b.h, b.x, b.y + b.h, r);
    ctx.arcTo(b.x, b.y + b.h, b.x, b.y, r);
    ctx.arcTo(b.x, b.y, b.x + b.w, b.y, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(18,14,28,0.72)';
    ctx.fill();
    ctx.strokeStyle = `rgba(255,214,110,${(0.36 + 0.24 * pulse).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffd66e';
    ctx.font = '800 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LEADERBOARD  ·  OPTIONS', b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.restore();
  }

  // Which half of the screen was tapped. Above the line starts the game,
  // at or below it opens the panel — and "below" runs all the way to the
  // bottom of the display, not just to the bottom of the painting.
  function hitOptions(box, y) {
    if (!box) return false;
    return y >= box.dy + (SPLIT_Y / SRC_H) * box.dh;
  }
  return { draw, hitOptions, optionsButton };
}
