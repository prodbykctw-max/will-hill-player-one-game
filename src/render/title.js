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

// ── THE PORTRAIT CARD ────────────────────────────────────────────────────
// The client's second title painting, and it replaces the landscape one for a
// reason arithmetic settles: it is 853x1844, an aspect of 0.4626, against a
// 430x932 phone at 0.4614. Six thousandths apart. It fills the screen edge to
// edge with no letterbox at all, where the 3:2 landscape plate left a third of
// a tall phone black and needed a zoom, a bias and a split line to cope.
//
// It also carries its own PRESS START and OPTIONS, painted where he wanted
// them, so neither has to be lifted or redrawn.
//
// ⚠️ NO CARDS YET. The landscape plate was cut into clouds, skyline, two signs
// and the hero, which is what the assembly intro and the sway animate. This
// painting has not been through that pass, so titleCards() is empty and the
// intro is a straight reveal until it has. Cutting it is the next job — SAM
// and its checkpoint are both present (tools/sam_segment.py, /root/sam).
import titleBase from '../assets/backgrounds/title-portrait.webp';
// The portrait plate's own cards, SAM-cut. The base is NOT cut — these are
// drawn over a whole painting, which is the rule everywhere in this game now.
import tpWordmark from '../assets/backgrounds/titlep-wordmark.webp';
import tpLogo from '../assets/backgrounds/titlep-logo.webp';
import tpStars from '../assets/backgrounds/titlep-stars.webp';
import tpSignL from '../assets/backgrounds/titlep-signL.webp';
import tpSignR from '../assets/backgrounds/titlep-signR.webp';
import tpHero from '../assets/backgrounds/titlep-hero.webp';
import tpPole from '../assets/backgrounds/titlep-pole.webp';
import titleOptions from '../assets/backgrounds/title-options0.webp';
import spriteManifest from '../assets/backgrounds/title-sprites.json';

export const SRC_W = 853;
export const SRC_H = 1844;

// The cloud sprites are cut by connected component, so how MANY there are is
// decided by the art, not by this file — globbing them keeps a re-cut that
// finds five clouds instead of four from silently dropping one.
const cloudUrls = import.meta.glob('../assets/backgrounds/title-clouds*.webp',
  { eager: true, query: '?url', import: 'default' });
const urlFor = (file) => cloudUrls[`../assets/backgrounds/${file}`];

// HOW FAST EACH CLOUD CROSSES, AND WHY IT IS DERIVED RATHER THAN LISTED.
//
// Source px per tick, so a full crossing is (1536 + w) / speed ticks. The
// nearest cloud stays at 0.62 — roughly 50 seconds end to end, weather rather
// than a screensaver — and everything behind it is scaled DOWN from there.
//
// A cloud's apparent SIZE is its distance. These are all the same kind of
// object, so the small ones are not small clouds, they are far ones, and the
// further one is the slower it should cross. That was a hand-tuned list of
// four numbers, which is fine until the cutter finds five clouds and the
// fifth silently gets a default — so it is computed from each sprite's own
// pixel count instead. sqrt(area) is the linear size; the 1.3 exponent is
// what makes the back of the sky move MUCH slower rather than merely slower,
// which is the client's note:
//
//     cloud   px      rel size   speed
//     0     16663      1.00      0.62
//     1     15512      0.95      0.59
//     2      2529      0.29      0.18
//     3      1660      0.22      0.14
//
// Same rule the stage backdrops use for depth, doing the same job: it stops
// the sky reading as one flat sheet sliding past.
const NEAR_SPEED = 0.62;
const DEPTH_EXP = 1.3;
const FLOOR_SPEED = 0.05;   // nothing is so far away that it stops entirely

function cloudSpeeds(list) {
  const size = list.map((s) => Math.sqrt(s.px || (s.w * s.h)));
  const near = Math.max(...size, 1);
  return size.map((v) => Math.max(FLOOR_SPEED,
    NEAR_SPEED * Math.pow(v / near, DEPTH_EXP)));
}

const CLOUD_LIST = spriteManifest.clouds || [];
const CLOUD_SPEEDS = cloudSpeeds(CLOUD_LIST);

export const CLOUD_SPRITES = CLOUD_LIST.map((s, i) => ({
  key: `title_cloud${i}`,
  url: urlFor(s.file),
  x: s.x, y: s.y, w: s.w, h: s.h,
  speed: CLOUD_SPEEDS[i],
}));

// Loaded through the same manifest as everything else; see main.js.
export const TITLE_IMAGES = {
  title_base: titleBase,
  tp_wordmark: tpWordmark, tp_logo: tpLogo, tp_stars: tpStars,
  tp_signL: tpSignL, tp_signR: tpSignR,
  tp_hero: tpHero, tp_pole: tpPole,
  title_options: titleOptions,
  ...Object.fromEntries(CLOUD_SPRITES.map((s) => [s.key, s.url])),
};

// PRESS START, in the painting's pixels. The mask came back x 504..964,
// y 869..913; padded out to take in the two ◀ ▶ arrows either side, which SAM
// grouped separately and which should light up with the words.
const PROMPT = { x: 195, y: 1518, w: 462, h: 54 };

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
export const TITLE_ZOOM = 1;
// THE BAND OF THE PAINTING THAT MUST STAY ON SCREEN, in its own rows.
// Everything outside it is budget the fit may crop to fill the width instead
// of letterboxing — see stillscene.fit.
//
// MEASURED THREE TIMES, and the third one is the one to trust. The first came
// off the letters' bright FACE, row 281. The second grew the letter mass 16px
// to catch the black outline and got 265. Both were measuring the GOLD line.
// Scanning for the topmost DARK row inside the text columns puts the top of
// WILL HILL: — outline and all — at row 165, a hundred rows higher.
//
// 1635 is the bottom-most painted UI pixel, the foot of OPTIONS.
//
//   165 rows of sky above the title      }
//   208 rows of wet street below OPTIONS }  373 rows of crop budget
//
// The old single number could only be spent off the TOP, so a phone needing
// 350 rows would have had to eat 185 rows of his name and fell back to black
// bars instead — which is the thing the client kept photographing. Split
// across both ends, 350 fits inside 373. See the table in stillscene.fit.
export const TITLE_SAFE = { top: 165, bottom: 1635 };
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
  if (!images) return CARD_SPEC;
  return CARD_SPEC.map((c) => ({ ...c, img: images[c.key] }));
}

// ── THE PORTRAIT PLATE'S CARDS ───────────────────────────────────────────
//
// SAM-cut off the painting itself (tools/sam_groups/title-portrait.json holds
// which mask indices are which card, which is the reviewable decision — the
// raw .npy is 130MB and its indices move the moment the sampling grid does).
//
// FAR TO NEAR, because that is the draw order. The logo is up in the sky and
// the two sign gantries stand on the kerb Will Hill is standing on, so he goes
// last and in front. The pole is nearest of all — it is the thing at the edge
// of frame you would walk past.
//
// SWAY IS THE SAME FUNCTION THE EAV TREES USE. A roadside sign is a plate on a
// post and the post is planted, which is a tree as far as the maths cares; the
// pivot is the foot of the post so the panel travels and the base does not.
// Will Hill's is a third of theirs on purpose — a person shifting their weight,
// not a person swaying. Amplitudes are FRACTIONS of the drawn width, never
// pixels, or a breath on a phone is a lurch on a desktop.
//
// Spans and pivots are read off each card's own emitted bounding box
// (title-portrait-planes.json), not eyeballed off a screenshot.
// ⚠️ THE WORDMARK IS THREE CARDS NOW, NOT ONE. tools/cut_title_extras.py split
// what `tp_logo` used to carry alone: WILL HILL: (tp_wordmark, never a card at
// all before — it lived in the undoubled backdrop and could not appear until
// the whole base faded up, after PLAYER ONE), PLAYER ONE re-cut clean of the
// sky fringing and star fragment SAM's mask used to drag in, and both red
// stars as their own card (tp_stars) so they can land on PLAYER ONE's own
// beat. See INTRO below for the order this earns them.
const CARD_SPEC = [
  { key: 'tp_wordmark', depth: 0.04 },
  { key: 'tp_logo', depth: 0.05 },
  { key: 'tp_stars', depth: 0.06 },
  {
    key: 'tp_signL', depth: 0.44,
    sway: [{ top: 0.398, pivot: 0.632, ampFrac: 0.0040, freq: 1.0,
      xRanges: [[0.062, 0.400]] }],
  },
  {
    key: 'tp_signR', depth: 0.46,
    sway: [{ top: 0.462, pivot: 0.636, ampFrac: 0.0040, freq: 1.25,
      xRanges: [[0.601, 0.894]] }],
  },
  {
    key: 'tp_hero', depth: 0.62,
    sway: [{ top: 0.515, pivot: 0.782, ampFrac: 0.0014, freq: 0.75,
      xRanges: [[0.361, 0.612]] }],
  },
  {
    key: 'tp_pole', depth: 0.80,
    // Only the lamp head and the ATL banner move; the post is bolted down.
    sway: [{ top: 0.173, pivot: 0.726, ampFrac: 0.0022, freq: 0.9,
      xRanges: [[0.768, 0.986]] }],
  },
];

export function createTitle(ctx, canvas, still) {
  function draw(images, tick, splash, introT, musicOn, musicPressAge) {
    // THE INTRO PAGE. The card assembles itself out of an empty street and a
    // blank sky — see introFx — and that assembly IS the whole page. It has no
    // words of its own; his painting's own PRESS START is the prompt.
    const fx = splash ? introFx(introT || 0) : null;
    const box = still.draw(images.title_base, titleCards(images), tick,
      TITLE_ZOOM, TITLE_BIAS, fx, TITLE_SAFE);
    // His OPTIONS, moved up into the dead road under PRESS START. Straight
    // after the plate and before anything drawn over it, and on EVERY frame
    // including the intro's — see liftOptions for why it needs the fade's
    // own alpha rather than being held back until the fade finishes.
    liftOptions(images.title_base, box, fx ? fx.base.a : 1);
    still.pulsePrompt(box, PROMPT, SRC_W, SRC_H, tick);
    // Client: "gleam off his chain... glimmer, glisten or glow off the red
    // stars." Held back until the card is fully settled — see drawGlints — so
    // the shimmer reads as the finished screen's own idle life rather than as
    // one more thing competing with the assembly.
    if (!splash) drawGlints(box, tick);
    // The one control that is NOT part of the painting comes up with the last
    // layer, so the page finishes as the menu instead of cutting to it.
    const a = splash ? splashControlAlpha(introT || 0) : 1;
    if (a > 0.002) {
      ctx.save();
      ctx.globalAlpha = a;
      drawOptions(images.title_options, box, tick);
      drawMusic(box, musicOn, tick, musicPressAge);
      ctx.restore();
    }
    return box;
  }

  // ── THE GLEAM, AND THE GLISTEN ────────────────────────────────────────────
  //
  // Client: "make it glistening a little bit like maybe a little gleam or
  // glisten come off his chain, and glimmer glisten or glow come off the red
  // stars as well."
  //
  // NOT A BREATHING GLOW — that is already spoken for. PRESS START, OPTIONS
  // and the drawn controls all use the same slow always-on pulse (pulseRect /
  // the shadowBlur breath on CHAMPAGNE RELAY) to say "you can press this."
  // A chain and two painted stars are not buttons, so borrowing that language
  // would tell the player they are. What jewellery and starlight actually do
  // is CATCH light and let it go — a brief flash, then dark again for a
  // while — so this is a short flare on a long, staggered cycle instead of a
  // continuous breath.
  //
  // Three points, read straight off the plate (python3+PIL, not eyeballed):
  // his chain's centroid, and the centroid of each red star individually.
  // Different periods and phases per point so the three never flash together
  // and read as one blinking unit — a chain catching the light does not do it
  // on the same beat a star does.
  // `r` is a radius in the PLATE'S OWN PIXELS (853x1844), scaled to the screen
  // in drawGlints the same way every other measured rect in this file is —
  // 15 on the chain is about a third of its own 48x52 bbox; 11 on a star is
  // about the star's own size, so it reads as the star itself catching light
  // rather than a separate glow sitting near it.
  // ⚠️ THE CHAIN GLINT WAS ON HIS MOUTH. One sparkle sat at (409, 1062),
  // which is his beard and closed lips, ~50 rows above the necklace — the
  // client spotted it on a screenshot: "it is on his mouth and not on his
  // chain." He then asked whether there was a grill there worth keeping, and
  // there is not: measured over x 385-440, y 1048-1080, the mouth holds ZERO
  // white pixels (no teeth showing) and its warmest pixels read R209 G133 B67
  // — lit skin on the upper lip, not gold. His mouth is closed and shadowed.
  // So the mouth sparkle is gone rather than kept.
  //
  // The chain itself was measured the same way, by finding the gold on the
  // tp_hero plate: it runs x 396-451, y 1067-1121 in a V, and these three
  // points are its brightest links — left strand, the bottom of the V, and
  // the right strand.
  //
  // THREE, AT DIFFERENT SIZES, ON DIFFERENT CLOCKS. Client: "we're only gonna
  // make the necklace glisten in a few places... variant sizes in proportion
  // to the necklace and himself, maybe two or three, triggering in different
  // sizes and different locations, periodically, naturally." The radii are
  // small on purpose — the links are 5-6 source px thick, so the old r:15
  // was a flare wider than the chain. The periods share no common factor
  // worth speaking of and the phases are spread, so the three never settle
  // into a pattern and never all fire at once.
  const GLINTS = [
    // the bottom of the V — thickest part of the chain, so the largest catch
    { x: 424 / SRC_W, y: 1118 / SRC_H, r: 9, period: 210, phase: 0, hue: '255,224,150' },
    // the left strand, small
    { x: 397 / SRC_W, y: 1103 / SRC_H, r: 6, period: 260, phase: 95, hue: '255,224,150' },
    // the right strand, riding up toward his neck
    { x: 444 / SRC_W, y: 1094 / SRC_H, r: 7, period: 320, phase: 185, hue: '255,224,150' },
    { x: 48 / SRC_W, y: 338 / SRC_H, r: 11, period: 310, phase: 90, hue: '255,120,120' },
    { x: 808 / SRC_W, y: 339 / SRC_H, r: 11, period: 340, phase: 200, hue: '255,120,120' },
  ];

  // A brief flare, most of its cycle dark. u sweeps 0..1 across `period`
  // ticks; the flash itself lives in a narrow window near u=0 so the point
  // sits quiet for several seconds between catches of light.
  function glintAlpha(tick, g) {
    const u = ((tick + g.phase) % g.period) / g.period;
    const flare = Math.max(0, 1 - u * 9);           // narrow: on for ~1/9 of the cycle
    return flare * flare * flare;                    // cubic, so it snaps in and eases out
  }

  // A four-point sparkle — a bright core plus two crossed blades — which is
  // what a catch of light on a hard edge (a chain link, a star's point) reads
  // as, rather than the soft round glow the pulse buttons use.
  function drawSparkle(cx, cy, r, a, hue) {
    if (a <= 0.002) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(cx, cy);
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.55);
    core.addColorStop(0, `rgba(${hue},${a})`);
    core.addColorStop(1, `rgba(${hue},0)`);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${hue},${a * 0.85})`;
    ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.lineCap = 'round';
    for (const rot of [0, Math.PI / 2]) {
      ctx.save();
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.lineTo(r, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawGlints(box, tick) {
    if (!box) return;
    const S = box.dw / SRC_W;          // r above is in the plate's own pixels
    for (const g of GLINTS) {
      const a = glintAlpha(tick, g);
      if (a <= 0.002) continue;
      drawSparkle(box.dx + g.x * box.dw, box.dy + g.y * box.dh, g.r * S, a, g.hue);
    }
  }

  // ── THE CARD BUILDING ITSELF ─────────────────────────────────────────────
  //
  // Client: "the intro page should be the main page, but with the layers
  // sliding in from different sides — each layer of that sliding into place —
  // and then of course you tap that and then you get to the press start page."
  //
  // The title screen is ALREADY a multiplane set: sky sprites, the skyline and
  // logo, the two roadside signs, and Will Hill himself, each on its own card
  // so they can sway independently. Separable layers can arrive separately, so
  // this costs one translate per card and no new art.
  //
  // EACH LAYER COMES FROM WHERE IT BELONGS. Clouds drift in across the sky.
  // The skyline drops. The signs come in off the kerb they stand on, one from
  // each side. Will Hill rises from the bottom and lands LAST, because he is
  // the thing the card is about and the eye should finish on him.
  //
  // ⚠️ THE BACKDROP ARRIVES LAST, AND THAT IS FORCED, NOT A CHOICE.
  //
  // The title base is the WHOLE painting — logo, signs, hero and all — because
  // it is doubled rather than cut. That is the rule now everywhere in the game
  // (see tools/cut_planes.py: "bruises everywhere"), and it is right: a hole
  // only needs filling if the thing that came out of it is gone, and it never
  // is. Every fill this project ever made was a grey patch somebody could see.
  //
  // But a doubled base cannot show a layer FLYING IN, because its twin is
  // already sitting at the destination. Two logos, which is exactly what the
  // first version of this did. So during the assembly the base is simply not
  // there yet: the cut pieces cross an empty screen and the street, the sky and
  // the skyline come up behind them as the last piece lands. Nothing is
  // inpainted, nothing is hidden, and there is no bruise to see because there
  // is no hole — there is just a backdrop that has not arrived.
  //
  // Cubic ease-out, no bounce: things settle, they do not boing. Overlapping
  // windows so it reads as one move rather than five.
  //
  // THE TAP IS LIVE THE WHOLE TIME. Nothing here gates input — main.js arms the
  // title at 24 ticks as it always has — so this never stands between the
  // player and the game. Tap during the assembly and you land on the menu with
  // the theme playing, which is exactly the skip the client asked for.
  //
  // Indices are positions in titleCards(). A card added there without a line
  // here simply arrives at rest, which is the safe failure.
  // ── THE ORDER: STREET FIRST, THEN HIS NAME, THEN THE TITLE ───────────────
  //
  // Client: "Will Hill's name should come in first after everything settles...
  // I want the stars to land with the words PLAYER ONE at the same time."
  //
  // So this is now three beats, not one:
  //   1. the street furniture — signs, hero, pole — same timing as before,
  //      all landed by tick 74.
  //   2. WILL HILL: drops in AFTER that, alone, and settles.
  //   3. PLAYER ONE and both stars drop in TOGETHER, last — same t0/t1 on
  //      purpose, so nothing separates their landing by even one tick.
  const INTRO = [
    { from: [0.00, -0.34], t0: 76, t1: 112 },   // 0 WILL HILL:, after the street settles
    { from: [0.00, -0.34], t0: 112, t1: 148 },  // 1 PLAYER ONE — lands WITH the stars
    { from: [0.00, -0.30], t0: 112, t1: 148 },  // 2 both stars — same beat as PLAYER ONE
    { from: [-0.46, 0.05], t0: 8, t1: 56 },     // 3 left gantry, off frame
    { from: [0.46, 0.05], t0: 14, t1: 62 },     // 4 right gantry
    { from: [0.00, 0.44], t0: 20, t1: 74 },     // 5 Will Hill, up off the street
    { from: [0.34, 0.00], t0: 4, t1: 58 },      // 6 the pole, in from the kerb
  ];
  const LAST_LAND = titleCards().length
    ? Math.max(...INTRO.slice(0, titleCards().length).map((c) => c.t1)) : 0;
  const BASE_IN = LAST_LAND ? [LAST_LAND, LAST_LAND + 26] : [6, 74];
  const INTRO_END = LAST_LAND ? LAST_LAND + 26 : 74;
  const ease = (u) => 1 - (1 - u) * (1 - u) * (1 - u);
  const at = (t, t0, t1) => ease(Math.max(0, Math.min(1, (t - t0) / (t1 - t0))));

  function introFx(t) {
    const W = canvas.width;
    const H = canvas.height;
    return {
      // The plate behind everything just comes up out of black — sliding it
      // too would leave a moving hard edge against the letterbox.
      base: { x: 0, y: 0, a: at(t, BASE_IN[0], BASE_IN[1]) },
      cards: INTRO.map((c) => {
        const u = at(t, c.t0, c.t1);
        return { x: c.from[0] * W * (1 - u), y: c.from[1] * H * (1 - u), a: u };
      }),
    };
  }

  // ── THE INTRO PAGE ───────────────────────────────────────────────────────
  //
  // WHY A GAME NEEDS A PAGE WHOSE ONLY JOB IS TO BE TAPPED. No browser lets
  // sound out before a gesture inside the page, and tapping a home-screen icon
  // is a tap on the OS launcher, not on us. Chrome, Safari and Firefox all
  // enforce it; there is no code that defeats it. So the theme cannot play on
  // open, and the client is right that it should: "as soon as I touch that
  // bitch I need things to move smoothly."
  //
  // The gesture was ALREADY being collected — main.js has spent the first title
  // input on waking the audio for a while now. What was missing is that the
  // screen looked identical before and after it, so a card sitting there in
  // silence read as broken rather than as press start, and the client reported
  // it as broken twice. This draws the difference.
  //
  // Client: "we need to design either an intro sequence that you can skip and
  // that will trigger the main theme music, or a page that you would tap as
  // like an intro page." This is that page, and it is the standard answer —
  // every web game ships one. It also plays better than autoplay would: the
  // theme lands on a deliberate press instead of dribbling in behind a loader.
  //
  // ⚠️ IT CARRIES NO WORDS OF ITS OWN, AND THAT IS THE POINT.
  //
  // The first version put a glowing TAP TO START and a TURN YOUR SOUND UP under
  // the card. The client killed both, correctly: "that TAP TO START / turn
  // sound on is redundant if you already got a PRESS START button." He does.
  // It is painted into his own artwork, it throbs, and it says the same thing
  // in his own lettering — which is the rule the whole of this file follows.
  // Two prompts asking for one tap is one prompt too many.
  //
  // SO THE ASSEMBLY IS THE ACTIVITY. "Everything cut out should move and fall
  // into place — it should basically be like a street and a blank skyline and
  // then everything falls into place." A card that is still building itself is
  // visibly not finished, which is a better invitation than a label, and by the
  // time it settles the tap has usually already happened.
  //
  // What this function is left holding is the ORDER OF APPEARANCE for the two
  // controls that are not part of the painting. OPTIONS and CHAMPAGNE RELAY are
  // held back until the assembly lands and then fade up with it, so the page
  // finishes as the menu rather than cutting to it.
  function splashControlAlpha(introT) {
    return at(introT, INTRO_END - 10, INTRO_END + 22);
  }

  // ── OPTIONS, WHERE HE PAINTED IT ─────────────────────────────────────
  //
  // On the landscape plate this word had to be CUT OUT and moved: it rendered
  // 54x9 px on a phone and sat thirteen screen pixels under PRESS START, which
  // is no target at all. The portrait plate fixes that in the art — the two
  // are 48 source pixels apart, which is 24 on a 430 phone, and the word comes
  // out 84x14. So nothing is lifted, nothing is redrawn, and this is only a
  // hit box: his lettering, in his position, left alone.
  //
  // Measured off the plate, not guessed: pale-neutral key over rows
  // 1600-1780, x 342-508, y 1609-1635.
  const OPTIONS_BOX = { x: 342, y: 1609, w: 167, h: 27 };

  // ── AND IT IS LIFTED OFF THE ROAD ────────────────────────────────────────
  //
  // Client: "we just need to move the options up slightly... it's a bigger
  // space underneath the PRESS START button, we could use that space as real
  // estate... can you not just lift that, make it transparent and put it
  // there?" Measured on his shape before touching anything: 22px of bare road
  // between PRESS START's foot and OPTIONS' top, and only 14px under MUSIC.
  // He is right — the empty space is above, and the crowding is below.
  //
  // The word is PAINTED INTO HIS PLATE at rows 1609-1635, so there is no
  // layer to nudge. The landscape plate solved this by SAM-cutting the word
  // out and retexturing the hole behind it (see above) — a real piece of
  // work, and it needed `retexture()` because the fill sat as a smooth patch
  // in a speckled road.
  //
  // NONE OF THAT IS NEEDED HERE, because of what is under the word: 208 rows
  // of plain road and nothing else. So instead of cutting the word out and
  // patching the gap it leaves, this REDRAWS THE WHOLE BOTTOM BAND of the
  // plate shifted up by OPTIONS_LIFT rows. The word rides up with the band
  // and the road closes behind it by itself — there is no hole to fill, and
  // so nothing to retexture.
  //
  // ONE SEAM, and it lands on bare road between PRESS START and OPTIONS with
  // only OPTIONS_LIFT rows of the plate's own vertical gradient across it —
  // far under the tone step the landscape cut had to work around.
  //
  // The band has room to slide into: the last plate row visible on any phone
  // measured is ~1724 of 1844, so the shift never runs out of road.
  const OPTIONS_LIFT = 16;                    // source rows, ~7px on his phone

  // ⚠️ WHERE THE BAND STARTS IS MEASURED, NOT CHOSEN, AND IT IS PINNED BETWEEN
  // TWO HARD LIMITS.
  //
  //   BAND_TOP - OPTIONS_LIFT  must stay BELOW PRESS START's foot, or the
  //                            shift saws the bottom off his prompt. PROMPT
  //                            is rows 1518-1572, so the earliest the band
  //                            can land is 1573 — an earlier pass here read
  //                            the foot as 1561 off a guess and picked a row
  //                            that would have clipped it.
  //   BAND_TOP                 must stay ABOVE the lettering at 1609, or the
  //                            band does not carry the word it exists to move.
  //
  // That leaves rows 1589-1608, and inside that window the seam step was
  // measured for every candidate (|row r-1| against |row r+LIFT|, mean
  // luminance across the plate's width). The flattest is 1592 at 2.22 levels.
  // NOTHING in the window is flat: the road under PRESS START carries a real
  // lighting gradient, so a hard join anywhere here shows. Rows further up
  // reach 0.01 and are unusable — they are inside PRESS START.
  const BAND_TOP = 1592;
  // So the join is CROSS-FADED rather than butted. Twelve rows is enough to
  // dissolve a 2-level step below the plate's own dither, and the whole
  // feather sits on bare road between the prompt and the word — clear of
  // PRESS START's foot above and OPTIONS' top below.
  const BAND_FEATHER = 12;
  const BAND_DEST_TOP = BAND_TOP - OPTIONS_LIFT;
  const BAND_H = SRC_H - BAND_DEST_TOP;

  // ── THE CORRECTION IS BUILT ONCE, IN THE PLATE'S OWN PIXELS ──────────────
  //
  // It depends only on the artwork, never on the window, so there is nothing
  // in it to redo when the phone rotates or the browser chrome moves. Built
  // at source resolution and scaled on the way out, exactly like the plate.
  // Keyed on the image itself because day and night are different plates.
  let bandCache = null;
  let bandCacheFor = null;

  function buildBand(base) {
    const cv = document.createElement('canvas');
    cv.width = SRC_W;
    cv.height = BAND_H;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    // The band, lifted: everything from BAND_TOP down, moved up by the lift.
    const lifted = SRC_H - BAND_TOP;
    c.drawImage(base, 0, BAND_TOP, SRC_W, lifted, 0, 0, SRC_W, lifted);
    // The lift leaves OPTIONS_LIFT rows bare at the plate's very foot. Off
    // screen on every phone measured, but a desktop contain-fit shows the
    // whole card, so the last rows are repeated to close it — road over road.
    c.drawImage(base, 0, SRC_H - OPTIONS_LIFT, SRC_W, OPTIONS_LIFT,
      0, lifted, SRC_W, OPTIONS_LIFT);
    // THE FEATHER. Lay the rows that genuinely belong at this destination
    // back over the top edge, fading out downward — so the band OPENS as an
    // exact continuation of the plate above it and has dissolved into the
    // lifted content well before the word arrives. Masked with
    // destination-out and a gradient, which is the only way to get a varying
    // alpha out of drawImage.
    const t = document.createElement('canvas');
    t.width = SRC_W;
    t.height = BAND_FEATHER;
    const tc = t.getContext('2d');
    tc.imageSmoothingEnabled = false;
    tc.drawImage(base, 0, BAND_DEST_TOP, SRC_W, BAND_FEATHER, 0, 0, SRC_W, BAND_FEATHER);
    tc.globalCompositeOperation = 'destination-out';
    const g = tc.createLinearGradient(0, 0, 0, BAND_FEATHER);
    g.addColorStop(0, 'rgba(0,0,0,0)');     // keep the original here
    g.addColorStop(1, 'rgba(0,0,0,1)');     // and none of it by the bottom
    tc.fillStyle = g;
    tc.fillRect(0, 0, SRC_W, BAND_FEATHER);
    c.drawImage(t, 0, 0);
    return cv;
  }

  // Repaint the band, shifted. Called every frame straight after the plate so
  // the word is NEVER drawn in its unlifted place — there is no frame where
  // it jumps, and no state where the pulse and the lettering disagree.
  //
  // ⚠️ IT TAKES THE BASE'S OWN FADE ALPHA, AND CLEARS TO BLACK FIRST. The
  // intro brings the plate up out of black (introFx: the base only fades, it
  // never moves), so simply drawing the band over it at the same alpha would
  // composite the shifted band ON TOP of the unshifted one and ghost a second
  // OPTIONS underneath. Painting the region black and then laying the band
  // down at `alpha` reproduces the fade exactly instead of doubling it — and
  // because the feather's first row IS the original row, the two halves of
  // the join stay identical at every alpha, not just at 1.
  function liftOptions(base, box, alpha) {
    if (!base || !base.width || !box || OPTIONS_LIFT <= 0) return;
    if (bandCacheFor !== base) {
      bandCache = buildBand(base);
      bandCacheFor = base;
    }
    const S = box.dw / SRC_W;
    const dy = box.dy + BAND_DEST_TOP * S;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // The same black the letterbox uses, so this is indistinguishable from
    // the fill stillscene.draw() already laid down under the plate.
    ctx.fillStyle = '#07060a';
    ctx.fillRect(0, dy, canvas.width, canvas.height - dy);
    ctx.globalAlpha = alpha;
    ctx.drawImage(bandCache, 0, 0, SRC_W, BAND_H, box.dx, dy, box.dw, BAND_H * S);
    ctx.restore();
  }

  function optionsRect(box) {
    if (!box) return null;
    const S = box.dw / SRC_W;
    // The LIFTED position — this is where the word actually is on screen, so
    // the hit box and the pulse both follow it without either being told.
    return { x: box.dx + OPTIONS_BOX.x * S,
             y: box.dy + (OPTIONS_BOX.y - OPTIONS_LIFT) * S,
             w: OPTIONS_BOX.w * S, h: OPTIONS_BOX.h * S };
  }

  function drawOptions(_img, box, tick) {
    const r = optionsRect(box);
    if (!r) return;
    // STILL NOTHING IS BLITTED HERE. The word is his lettering, moved by
    // liftOptions() above as part of the plate rather than lifted out of it.
    // All this adds is the breath that marks it as pressable — opposite beat
    // to PRESS START and cooler, so it reads as a second thing you can press
    // rather than as a caption under the first.
    still.pulseRect(r.x, r.y, r.w, r.h, tick + 57, '150,210,255');
  }

  // ── CHAMPAGNE RELAY IS OFF THE TITLE CARD ────────────────────────────────
  //
  // Client: "the champagne relay is not going to be there, that's like a
  // dev/dashboard thing. Nothing's gonna be there but PRESS START, OPTIONS
  // and MUSIC."
  //
  // This is the fourth pass on the pill in three days — a rounded box, then
  // flanking OPTIONS in a three-column row, then width-matched to it — and
  // the client's own call in the end is that a player should never have seen
  // it at all. It was always a walkthrough tool for reviewing the game, not
  // a thing to ship in front of an audience.
  //
  // NOTHING BUT THE DRAWING AND THE TAP TARGET IS GONE. `?relay=1` in the URL
  // and the `window.__startStage` dev hook (core/relay.js) still put a run
  // straight into relay mode exactly as before — that is the "dev/dashboard"
  // door he means, and every harness that drives relay mode through those
  // still passes unmodified. Only the on-screen pill, and the human path of
  // tapping it, are removed.

  // ── THE MUSIC BOX, STACKED UNDER OPTIONS ─────────────────────────────────
  //
  // Client: "that music button ultimately is going to be under the OPTIONS
  // button, if anything can go under the OPTIONS button, and that will be
  // stacked perfectly."
  //
  // With the pill gone there is nothing left to share a row with, so this
  // goes back to being a plain vertical stack: MUSIC directly under OPTIONS,
  // centred on the SAME x as the word — the painting's own centre line, since
  // OPTIONS sits there — and the same height, for the uniformity he asked for
  // earlier when there were three controls to keep level. Its width is its
  // own now; nothing else needs to fit beside it.
  //
  // Client, after killing the black TAP ANYWHERE card: "on the home screen
  // underneath it should be a question with a check box that says MUSIC, and
  // once you check the box it cuts music on, and it automatically plays from
  // there."
  //
  // It is a better answer than the card it replaces, and for a reason worth
  // stating: a browser will not release sound without a gesture, so SOMETHING
  // on this screen has to be touched first. A black page demanding a tap gives
  // nothing back for it. A checkbox labelled MUSIC gives an honest control that
  // says what it does, and CHECKING IT IS THE GESTURE — the same touch that
  // sets the preference is the one the browser accepts, so the theme comes up
  // under the finger.
  //
  // It reads and writes the SAME `wh_sound` setting the OPTIONS panel uses, so
  // the two can never disagree.
  const MUSIC_LABEL = 'MUSIC';
  const CAP = 0.72;        // cap height as a fraction of font size, bold system-ui
  const ICON_H = 0.86;     // the checkbox, as a fraction of row height
  const EDGE_PAD = 10;

  // Step the font down from `maxPx` (the CAP ceiling — never taller than
  // OPTIONS) until `label` plus whatever else shares the row (`extra`, a
  // function of the trial px since a gap scales with type) fits `targetW`.
  function fitToWidth(label, maxPx, targetW, extra) {
    ctx.save();
    let px = maxPx;
    for (; px > 4; px -= 0.25) {
      ctx.font = `700 ${px}px system-ui, sans-serif`;
      if (ctx.measureText(label).width + extra(px) <= targetW) break;
    }
    ctx.restore();
    return px;
  }

  function musicRect(box) {
    const o = optionsRect(box);
    if (!o) return null;
    // ⚠️ MUSIC MUST NEVER RUN OFF THE SCREEN, AND MUST NEVER TOUCH OPTIONS.
    // The ideal is the same height as OPTIONS, stepped down by a full gap —
    // but on the two tightest crops measured (iPhone SE, and the client's own
    // screenshot) there is only 7-9px of road left below OPTIONS before the
    // frame ends, LESS THAN OPTIONS' OWN HEIGHT. That is not a hypothetical:
    // his own screenshot is one of the two shapes that hits it, at 6.9px.
    //
    // A first pass floored the height at a fixed minimum and clamped the
    // position separately against the frame edge — on that 6.9px shape the
    // two floors CONTRADICTED each other (the position clamp wanted MUSIC
    // higher than the height floor allowed), and it landed a fraction of a
    // pixel INSIDE Options' own box. The fix is to stop treating "how much
    // height" and "where it sits" as two separate problems: gap and height
    // are solved TOGETHER against the one number that actually exists — the
    // raw room between OPTIONS' foot and the true bottom of the canvas — so
    // their sum can never exceed what is physically there.
    //
    // On every shape with real room — which is every phone at full height,
    // and most with the browser's own UI showing — none of this engages and
    // MUSIC comes out at OPTIONS' own height, stacked perfectly underneath.
    const idealH = o.h;
    // ── MUSIC COMES UP HALF AS FAR AS OPTIONS DID ──────────────────────────
    //
    // Client, exactly: "move the options up slightly... and then move the
    // music up half a pixel" — half of whatever OPTIONS moved, so the two
    // do not travel together and the space between them OPENS instead of
    // sliding along unchanged.
    //
    // MUSIC hangs off optionsRect, which now returns the LIFTED word, so it
    // would otherwise follow the full lift for free. Adding half the lift
    // back onto the gap is what leaves it behind by the other half: OPTIONS
    // rises by LIFT, MUSIC by LIFT/2, the gap between them grows by LIFT/2,
    // and MUSIC still gains LIFT/2 of clearance under it at the bottom —
    // which is the edge he said it was being cut off against.
    const halfLift = (OPTIONS_LIFT / 2) * (box.dw / SRC_W);
    const idealGap = Math.max(14, idealH * 0.65) + halfLift;
    const room = canvas.height - (o.y + o.h);          // to the TRUE edge, nothing assumed
    // ⚠️ THE GAP GETS A SHARE FIRST, BUT A SMALL ONE — HEIGHT STILL WINS THE
    // REST. A 0.5px floor read as one smear instead of two controls:
    // "OPTIONS needs to be up a little bit above the music section." But
    // giving the gap equal say with height went too far the other way on the
    // tightest crop measured — MUSIC shrank to 3px and stopped being
    // readable at all, which is worse than close-together. A quarter of
    // whatever room is left is enough gap to read as a real seam without
    // starving the label; height still takes whatever remains, which is
    // most of it.
    const MIN_GAP = 2.5;
    let h = idealH, gap = idealGap;
    if (gap + h > room) {
      gap = Math.max(MIN_GAP, Math.min(idealGap, room * 0.25));
      h = Math.max(0, room - gap);                      // whatever is left, however small
    }
    const boxSz = h * ICON_H;
    // Bounded by the SCREEN's width too, not by a neighbour — "MUSIC" alone
    // under OPTIONS has never needed to shrink on any phone measured, but a
    // floor this generous still cannot run the label off a genuinely tiny
    // display.
    const maxW = Math.max(20, canvas.width - EDGE_PAD * 2);
    const px = fitToWidth(MUSIC_LABEL, Math.max(4, h / CAP), maxW, (p) => boxSz + p * 0.40);
    ctx.save();
    ctx.font = `700 ${px}px system-ui, sans-serif`;
    const tw = ctx.measureText(MUSIC_LABEL).width;
    ctx.restore();
    const w = boxSz + px * 0.40 + tw;
    return {
      // y is a DIRECT sum, not a separately-clamped value — by construction
      // o.y + o.h + gap + h can never exceed canvas.height, because gap and h
      // were solved against exactly that budget above.
      x: (o.x + o.w / 2) - w / 2, y: o.y + o.h + gap,
      w, h, boxSz, gap: px * 0.40, fontPx: px,
    };
  }

  // ── AND IT ACKNOWLEDGES THE PRESS ────────────────────────────────────────
  //
  // Client: "I want the music button off, and for it to acknowledge you
  // clicking it." With the box now starting UNCHECKED (see soundEnabled in
  // ui/panel.js) this press is the gesture the whole soundtrack waits on, so
  // it has to look like it landed even in the instant before the theme has
  // buffered a note — otherwise a slow network reads as a dead button and
  // gets tapped again.
  //
  // `pressAge` is ticks since the last tap, or a big number for "not
  // recently". The flare is brief and additive: a ring thrown off the box and
  // a lift in its own brightness, gone inside a third of a second. It is
  // drawn whichever way the box was toggled — turning music OFF is just as
  // much a press that deserves an answer as turning it on.
  const PRESS_FLASH = 20;          // ticks the acknowledgement lasts

  function drawMusic(box, on, tick, pressAge = 1e9) {
    const r = musicRect(box);
    if (!r) return;
    const glow = 0.5 + 0.5 * Math.sin(tick / 52 + 4.2);
    const bx = r.x;
    const by = r.y + (r.h - r.boxSz) / 2;
    // Cubic ease-out so it snaps in and drains away rather than blinking.
    const p = Math.max(0, 1 - pressAge / PRESS_FLASH);
    const flash = p * p * p;
    ctx.save();
    if (flash > 0.002) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = flash * 0.85;
      const pad = r.boxSz * (0.30 + 0.55 * (1 - flash));
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx - pad, by - pad,
        r.boxSz + pad * 2, r.boxSz + pad * 2, 6);
      else ctx.rect(bx - pad, by - pad, r.boxSz + pad * 2, r.boxSz + pad * 2);
      ctx.strokeStyle = 'rgba(255,226,150,0.95)';
      ctx.lineWidth = Math.max(1.2, r.boxSz * 0.14);
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, r.boxSz, r.boxSz, 4);
    else ctx.rect(bx, by, r.boxSz, r.boxSz);
    ctx.fillStyle = on ? 'rgba(255,214,110,0.92)' : 'rgba(10,8,16,0.68)';
    ctx.fill();
    if (flash > 0.002) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = flash * 0.55;
      ctx.fillStyle = 'rgba(255,226,150,1)';
      ctx.fill();
      ctx.restore();
    }
    ctx.lineWidth = 1.6;
    // Unchecked, it breathes to ask for the tap. Checked, it sits still —
    // nothing left to prompt.
    ctx.strokeStyle = on ? 'rgba(255,236,190,0.95)'
      : `rgba(226,214,236,${0.42 + 0.34 * glow})`;
    ctx.stroke();
    if (on) {
      // A tick, drawn rather than typed, so it lands on the pixel grid.
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(18,12,6,0.95)';
      ctx.lineWidth = Math.max(2, r.boxSz * 0.16);
      ctx.lineCap = 'round';
      ctx.moveTo(bx + r.boxSz * 0.24, by + r.boxSz * 0.52);
      ctx.lineTo(bx + r.boxSz * 0.44, by + r.boxSz * 0.72);
      ctx.lineTo(bx + r.boxSz * 0.78, by + r.boxSz * 0.28);
      ctx.stroke();
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${r.fontPx}px system-ui, sans-serif`;
    ctx.fillStyle = on ? 'rgba(255,236,190,0.95)'
      : `rgba(226,214,236,${0.58 + 0.30 * glow})`;
    ctx.fillText(MUSIC_LABEL, bx + r.boxSz + r.h * 0.42, r.y + r.h / 2 + 1);
    ctx.restore();
  }

  function hitMusic(box, x, y) {
    const r = musicRect(box);
    if (!r) return false;
    return x >= r.x - HIT_MARGIN && x <= r.x + r.w + HIT_MARGIN
      && y >= r.y - HIT_MARGIN && y <= r.y + r.h + HIT_MARGIN;
  }

  // Which half of the screen was tapped. Above the line starts the game,
  // at or below it opens the panel — and "below" runs all the way to the
  // bottom of the display, not just to the bottom of the painting, so the
  // relocated word is inside its own zone by construction.
  // ── THE BUTTONS ARE THE BUTTONS, AND NOTHING ELSE IS ────────────────────
  //
  // This used to be `y >= the split line` — the ENTIRE lower part of the
  // display, black included, opened OPTIONS. That was the right answer to the
  // problem it was solving: the two controls are painted 43 rows apart, which
  // is thirteen screen pixels on a phone, and the client kept getting START
  // when he meant OPTIONS. Two enormous targets and one boundary fixed it.
  //
  // IT IS THE WRONG ANSWER NOW, and he is right about why. "That whole bottom
  // black area, once you tap it it's OPTIONS. I want those buttons isolated so
  // only when I tap the button is OPTIONS. If I tap empty space, that should
  // actually turn the music on." The reason the catch-all was needed is gone:
  // OPTIONS is no longer thirteen pixels of painting, it is a lifted card with
  // a measured rect, and MUSIC has its own box under it. Two real targets do
  // not need half the screen between them.
  //
  // So: the OPTIONS word is OPTIONS, the box is the box, and every other pixel
  // on this screen — the black band included — is the one big START that the
  // painting has always advertised. The first of those taps buys the sound.
  //
  // MARGIN, because a rect measured off lettering is smaller than a thumb.
  const HIT_MARGIN = 10;
  // ⚠️ LESS SLACK ABOVE THE WORD THAN AROUND IT, and this is the cost of the
  // lift. OPTIONS moved up into the gap under PRESS START, so the two are
  // closer than they were — and since EVERYTHING that is not OPTIONS or MUSIC
  // starts a run, an over-generous top edge turns a thumb aimed at PRESS
  // START into an accidental trip to the leaderboard. Measured after the
  // lift there are ~15px between PRESS START's painted foot and OPTIONS'
  // top; a 10px top margin would eat two thirds of that, 5 leaves the run
  // the bigger share of a gap that is bare road anyway. Sides and bottom
  // have nothing to steal from and stay generous.
  const HIT_MARGIN_TOP = 5;

  function hitOptions(box, x, y) {
    const r = optionsRect(box);
    if (!r) return false;
    return x >= r.x - HIT_MARGIN && x <= r.x + r.w + HIT_MARGIN
      && y >= r.y - HIT_MARGIN_TOP && y <= r.y + r.h + HIT_MARGIN;
  }
  return { draw, hitOptions, optionsRect,
    hitMusic, musicRect, drawMusic };
}
