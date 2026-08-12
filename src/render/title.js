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
    const box = still.draw(images.title_base, titleCards(images), tick);
    still.pulsePrompt(box, PROMPT, SRC_W, SRC_H, tick);
    return box;
  }
  return { draw };
}
