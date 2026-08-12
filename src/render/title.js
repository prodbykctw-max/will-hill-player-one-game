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
import titleOptions from '../assets/backgrounds/title-options0.webp';
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
  title_options: titleOptions,
  ...Object.fromEntries(CLOUD_SPRITES.map((s) => [s.key, s.url])),
};

// PRESS START, in the painting's pixels. The mask came back x 504..964,
// y 869..913; padded out to take in the two ◀ ▶ arrows either side, which SAM
// grouped separately and which should light up with the words.
const PROMPT = { x: 488, y: 858, w: 548, h: 62 };

// ── OPTIONS: HIS WORD, LIFTED OFF THE PLATE ──────────────────────────────
//
// This is the one piece of the painting that does not stay where he put it,
// and it is cut rather than redrawn for the same reason everything else here
// is: it should be HIS lettering.
//
// SAM mask #92 is the word — one connected component, x 671..853, y 946..979,
// holding 99.8% of the word's pixels with three stray pixels left in the whole
// band outside it. tools/cut_still.py lifts it and fills the hole; the road
// under it is near-black (mean 24 of 255), so the rim delta after the pyramid
// fill measures 0.5 levels. There is nothing there to see.
//
// WHY IT HAD TO MOVE. Measured on a 430px phone at the current zoom: PRESS
// START's baseline ends at screen y 584 and OPTIONS begins at 597. THIRTEEN
// PIXELS. And the word itself renders 54.5 x 8.7 px — smaller than the text
// you are reading. A thumb is 40-50px across; there is no aiming inside that,
// which is exactly what the client kept hitting.
//
// It replaces a drawn "LEADERBOARD · OPTIONS" button that sat in the black
// below the card. That button worked and was the wrong answer twice over: it
// was a system-ui rounded rectangle stuck under a hand-painted arcade card,
// and it duplicated a control the painting already had. Same position, his
// artwork, one control instead of two.
const OPT = (spriteManifest.options || [])[0] || null;

// ── ZOOM, AND WHY THE TWO CONTROLS STOPPED BEING BOXES ───────────────────
//
// The client kept hitting START when he meant OPTIONS, and the measurement
// says of course he did: colour-keyed off the plate, PRESS START ends on row
// 907 and OPTIONS begins on row 950, and 43 painting rows is THIRTEEN SCREEN
// PIXELS on a 430px phone. A thumb is three to four times that. No amount of
// care aims inside it.
//
// (An earlier note here said 4.2 pixels, from 15 rows. Both were wrong — the
// rows were read off the SAM masks' padded boxes rather than off the glyphs.
// Thirteen is measured from the lettering itself and matches the screen:
// 43 x 0.2995. It does not change the conclusion, only its size.)
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
// In the painting's own rows: below PRESS START, which ends on row 907. Row
// 950 used to be the top of OPTIONS; the word has since been lifted out and
// re-placed below the card, so there is nothing painted under this line at
// all now and the boundary sits in clear road. Everything at or under it —
// including every pixel of black beneath the card — is the OPTIONS half.
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
    drawOptions(images.title_options, box, tick);
    return box;
  }

  // ── WHERE THE LIFTED WORD LANDS, AND HOW BIG ─────────────────────────
  //
  // IT IS MEASURED FROM THE SPLIT LINE, NOT FROM THE BOTTOM OF THE CARD, and
  // that is the whole correctness argument. Anchoring it below the card was
  // the obvious way and it is right only while there IS black below the card.
  // Widen the window to landscape and `fit`'s zoom makes the card TALLER than
  // the display, so the card's bottom is off-screen, the placement clamps to
  // the last row that fits, and the word lands straddling the boundary — at
  // 1280x800 it came out with its top on 740.0 against a split at 741.1.
  // Tapping the top edge of the OPTIONS control would have started the game.
  //
  // So the band the word lives in runs from `floor` — below BOTH the split
  // line and the painted PRESS START, whichever is lower — to the bottom of
  // the display. That band always exists, so the word is always reachable,
  // always in its own tap zone, and never touching the other control.
  //
  // Three caps on the scale, smallest wins, because one number cannot be
  // right on both a 430px phone and a desktop window:
  //
  //   40% OF THE DISPLAY WIDTH — a control you can read without leaning in.
  //   3x THE CARD'S OWN SAMPLING RATE — the word is 189 source pixels and the
  //     plate is dithered. Past 3x the dither becomes blocks, which is the
  //     same artefact that got the stretched letterbox filler thrown out.
  //   A THIRD OF THE BAND — where the band is small the word has to be small,
  //     and it is better to be legible-and-small than clipped.
  //
  // On the target phone the first two land within 1.3% of each other (0.910
  // against 0.898) so the pixel-grid cap is the one that bites, which is the
  // right one to be bound by. Measured there: 84px between the word and the
  // bottom of PRESS START, up from THIRTEEN.
  const CAP_W = 0.40;
  const CAP_SCALE = 3;
  const CAP_BAND = 0.34;
  const START_BOTTOM = 907;   // last painted row of PRESS START, colour-keyed

  function optionsRect(box) {
    if (!box || !OPT) return null;
    const floor = Math.max(box.dy + (SPLIT_Y / SRC_H) * box.dh,
      box.dy + (START_BOTTOM / SRC_H) * box.dh);
    const band = Math.max(1, canvas.height - floor);
    const s = Math.min(canvas.width * CAP_W / OPT.w, box.s * CAP_SCALE,
      CAP_BAND * band / OPT.h);
    const w = OPT.w * s;
    const h = OPT.h * s;
    // A quarter of the band as breathing room, capped at 80 so that on a tall
    // phone the word stays tied to the card instead of drifting off down the
    // screen on its own.
    const gap = Math.min(80, Math.max(10, band * 0.24));
    const y = Math.min(canvas.height - h - 10, floor + gap);
    return { x: (canvas.width - w) / 2, y, w, h };
  }

  function drawOptions(img, box, tick) {
    const r = optionsRect(box);
    if (!r || !img || !img.width) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
    ctx.restore();
    // It breathes on the opposite beat to PRESS START and cooler, so it reads
    // as a second thing you can press rather than as a caption under the
    // first. Same additive glow over his lettering — nothing is drawn on top.
    still.pulseRect(r.x, r.y, r.w, r.h, tick + 57, '150,210,255');
  }

  // Which half of the screen was tapped. Above the line starts the game,
  // at or below it opens the panel — and "below" runs all the way to the
  // bottom of the display, not just to the bottom of the painting, so the
  // relocated word is inside its own zone by construction.
  function hitOptions(box, y) {
    if (!box) return false;
    return y >= box.dy + (SPLIT_Y / SRC_H) * box.dh;
  }
  return { draw, hitOptions, optionsRect };
}
