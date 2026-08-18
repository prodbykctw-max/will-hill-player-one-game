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
// The same painting with the title lettering lifted out and the sky closed
// behind it — the intro's first beat. tools/cut_title_bare.py.
import titleBare from '../assets/backgrounds/title-portrait-bare.webp';
// The same plate with his painted OPTIONS painted out — the word is a drawn
// control now and two of them would show. tools/cut_title_options_out.py.
import titleNoOpts from '../assets/backgrounds/title-portrait-nooptions.webp';
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
import cloudManifest from '../assets/backgrounds/title-portrait-clouds.json';
import titleSkyfill from '../assets/backgrounds/title-portrait-skyfill.webp';
import titleSkyline from '../assets/backgrounds/title-portrait-skyline.webp';

export const SRC_W = 853;
export const SRC_H = 1844;

// The cloud sprites are cut by connected component, so how MANY there are is
// decided by the art, not by this file — globbing them keeps a re-cut that
// finds five clouds instead of four from silently dropping one.
//
// ⚠️ `title-pcloud*`, NOT `title-clouds*`. The latter were cut from the old
// LANDSCAPE plate: their coordinates run out to x=1532 against this plate's
// 853, so they are the wrong sky at the wrong scale and were never drawable
// here. They stayed in the tree, loaded and unused, which is why the portrait
// title had a sky full of clouds that never moved.
const cloudUrls = import.meta.glob('../assets/backgrounds/title-pcloud*.webp',
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

const CLOUD_LIST = cloudManifest.clouds || [];
const CLOUD_SPEEDS = cloudSpeeds(CLOUD_LIST);

// ── NEAR AND FAR ARE TWO DIFFERENT CARDS ─────────────────────────────────
//
// Client: "I want some of the clouds moving in front of and behind the
// building — if it's a cloud that's supposed to be behind the building based
// on distance, I want it to move behind the building."
//
// So the towers are cut as their own card (title-portrait-skyline.webp) and
// the clouds are split around it. Which side a cloud goes on is decided by
// its SIZE — the same signal that sets its speed, so the two depth cues can
// never disagree with each other. `near` is stamped by the cutter.
export const CLOUD_SPRITES = CLOUD_LIST.map((s, i) => ({
  key: `title_pcloud${i}`,
  url: urlFor(s.file),
  x: s.x, y: s.y, w: s.w, h: s.h,
  speed: CLOUD_SPEEDS[i],
  near: !!s.near,
}));

// Loaded through the same manifest as everything else; see main.js.
export const TITLE_IMAGES = {
  title_base: titleBase,
  title_bare: titleBare,
  title_noopts: titleNoOpts,
  tp_wordmark: tpWordmark, tp_logo: tpLogo, tp_stars: tpStars,
  tp_signL: tpSignL, tp_signR: tpSignR,
  tp_hero: tpHero, tp_pole: tpPole,
  title_options: titleOptions,
  // The sky with every drifting cloud lifted out of it, and the towers on
  // their own so the far clouds can pass behind them.
  tp_skyfill: titleSkyfill,
  tp_skyline: titleSkyline,
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
  return CARD_SPEC.map((c) => {
    if (!c.clouds) return { ...c, img: images[c.key] };
    // drawCard's travelling-sprite branch wants `sprites` + `srcW`; the
    // painted x of each cloud is its phase, so at tick 0 every one of them is
    // exactly where he put it and it goes on from there.
    const want = c.clouds === 'near';
    return {
      ...c,
      srcW: SRC_W,
      sprites: CLOUD_SPRITES.filter((s) => s.near === want)
        .map((s) => ({ ...s, img: images[s.key] })),
    };
  });
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
  // ── THE SKY, IN THREE LAYERS ───────────────────────────────────────────
  //
  // Far clouds, then the towers, then near clouds — so the weather passes
  // BOTH behind and in front of the skyline depending on how far away it is.
  // Client: "if it's a cloud that's supposed to be behind the building based
  // on distance, I want it to move behind the building."
  //
  // The towers card is the SAME PIXELS the base already has, drawn again on
  // top of the far clouds and landing exactly over its own position — so it
  // needs no inpainting and can never reveal anything behind it. It does NOT
  // sway: everything else on this plate breathes, and a skyline that wobbled
  // against the street it stands on would look like an earthquake.
  //
  // `backdrop: true` keeps them out of the assembly. They are scenery, not
  // things that fly in — see LAST_LAND and introFx.
  { key: 'tp_cloudsFar', depth: 0.010, backdrop: true, clouds: 'far' },
  { key: 'tp_skyline', depth: 0.020, backdrop: true },
  { key: 'tp_cloudsNear', depth: 0.030, backdrop: true, clouds: 'near' },
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
  // ⚠️ INTRO IS INDEXED POSITIONALLY TO CARD_SPEC — entry i drives card i.
  // `backdrop: true` means "arrive with the plate": introFx hands that card
  // the BASE's own fade instead of a flight path, so it comes up as part of
  // the painting. Its from/t0/t1 are never read.
  { from: [0, 0], t0: 0, t1: 1, backdrop: true },   // far clouds
  { from: [0, 0], t0: 0, t1: 1, backdrop: true },   // the towers
  { from: [0, 0], t0: 0, t1: 1, backdrop: true },   // near clouds
  { from: [0.00, -0.34], t0: 30, t1: 74 },    // 0 WILL HILL:, onto the finished street
  { from: [0.00, -0.34], t0: 74, t1: 118 },   // 1 PLAYER ONE — lands WITH the stars
  { from: [0.00, -0.30], t0: 74, t1: 118 },   // 2 both stars — same beat as PLAYER ONE
  // THE STREET IS BACKGROUND NOW, NOT CARGO. Signs, hero and pole are in
  // the bare plate and rise with it; flying them as well would print two of
  // each. See BASE_IN.
  { from: [0, 0], t0: 0, t1: 1, backdrop: true },   // 3 left gantry
  { from: [0, 0], t0: 0, t1: 1, backdrop: true },   // 4 right gantry
  { from: [0, 0], t0: 0, t1: 1, backdrop: true },   // 5 Will Hill
  { from: [0, 0], t0: 0, t1: 1, backdrop: true },   // 6 the pole
];

// ── THE BACKGROUND ARRIVES FIRST ─────────────────────────────────────────
//
// Client: "most definitely the background should appear on the intro screen,
// and then all the other layers — background first then all the other
// layers."
//
// IT USED TO BE THE EXACT OPPOSITE, and not only by design. BASE_IN was
// derived as [LAST_LAND, LAST_LAND + 26] = [148, 174], while main.js ends
// the splash at INTRO_TICKS = 134 — so the plate's fade never reached a
// single frame of the intro. Every card flew in over BLACK and the whole
// painting then snapped to full alpha the instant the splash ended. That
// mismatch is why the two numbers are now ONE number, exported from here
// and imported by main.js, instead of two constants drifting apart in two
// files.
//
// WHY IT COULD NOT SIMPLY BE FLIPPED. `title-portrait.webp` is the whole
// painting: measured, every card cut from it is still in it (0.93-1.00
// identical). Fading it up first would show WILL HILL and PLAYER ONE
// already in place and then fly a second copy of each in — the two-PLAYER
// ONEs bug, again. So the intro fades up `title-portrait-bare.webp`
// instead (tools/cut_title_bare.py): the same street, the same skyline, the
// same signs, hero and pole, with only the title lettering lifted out and
// the sky closed behind it. The moment the assembly ends, the real plate
// takes over — by then the lettering has landed, so the two are identical
// and there is nothing to see in the swap.
const BASE_IN = [0, 26];
const LANDING = INTRO.slice(0, titleCards().length).filter((c) => !c.backdrop);
const LAST_LAND = LANDING.length ? Math.max(...LANDING.map((c) => c.t1)) : 0;
const INTRO_END = LAST_LAND ? LAST_LAND + 16 : 74;
const ease = (u) => 1 - (1 - u) * (1 - u) * (1 - u);
const at = (t, t0, t1) => ease(Math.max(0, Math.min(1, (t - t0) / (t1 - t0))));

// The one number main.js needs: how long the assembly runs. It used to keep
// its own copy (INTRO_TICKS = 134) and the two drifted 40 ticks apart, which
// is what stranded the plate fade outside the intro entirely.
export const INTRO_TICKS = INTRO_END;

export function createTitle(ctx, canvas, still) {
  function draw(images, tick, splash, introT, musicOn, musicPressAge, mouse,
                registered) {
    // THE INTRO PAGE. The card assembles itself out of an empty street and a
    // blank sky — see introFx — and that assembly IS the whole page. It has no
    // words of its own; his painting's own PRESS START is the prompt.
    const fx = splash ? introFx(introT || 0) : null;
    // During the assembly the plate is the BARE one, so the lettering can
    // land on a street that does not already have it. Everything else about
    // the painting is identical, and once the assembly ends the real plate
    // takes over with the lettering already covered — see BASE_IN.
    // ⚠️ THE SETTLED PLATE IS THE ONE WITH HIS PAINTED "OPTIONS" REMOVED.
    // OPTIONS is a drawn control now (see homeLayout), and leaving the painted
    // word on the road would show two of them. PRESS START is untouched — it
    // is above the patched band. tools/cut_title_options_out.py.
    const settled = (images.title_noopts && images.title_noopts.width)
      ? images.title_noopts : images.title_base;
    const plate = (fx && images.title_bare && images.title_bare.width)
      ? images.title_bare : settled;
    // ⚠️ THE SKY-FILL GOES IN AS AN UNDERLAY, NOT AFTER THE FACT.
    //
    // Client: "clouds should never pass through buildings or inside of
    // buildings, and they should never pass behind the fill — it looks like
    // there are empty spaces in the sky that clouds are coming in and out of,
    // because the clouds aren't layered over the fill, they're behind it."
    //
    // Exactly right, and the comment below this call had claimed the opposite
    // for weeks: the fill was drawn AFTER still.draw(), which has already
    // painted the base AND every card. So the patches of repaired sky — the
    // holes left where the drifting clouds were lifted out — were sitting ON
    // TOP of the clouds, and any cloud crossing one vanished into it and came
    // back out the other side. still.draw now takes it as an underlay and
    // paints it on the base, under every card, which is where the comment
    // always said it belonged.
    const box = still.draw(plate, titleCards(images), tick,
      TITLE_ZOOM, TITLE_BIAS, fx, TITLE_SAFE, images.tp_skyfill);
    still.pulsePrompt(box, PROMPT, SRC_W, SRC_H, tick);
    // Client: "gleam off his chain... glimmer, glisten or glow off the red
    // stars." Held back until the card is fully settled — see drawGlints — so
    // the shimmer reads as the finished screen's own idle life rather than as
    // one more thing competing with the assembly.
    if (!splash) drawGlints(box, tick);
    // After the hero card has landed, so the pupils sit on the face rather
    // than on the empty street it flies in over.
    if (!splash) drawEyes(images.title_base, box, mouse);
    // The one control that is NOT part of the painting comes up with the last
    // layer, so the page finishes as the menu instead of cutting to it.
    const a = splash ? splashControlAlpha(introT || 0) : 1;
    if (a > 0.002) {
      ctx.save();
      ctx.globalAlpha = a;
      drawBanner(box, tick, registered);
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

  function introFx(t) {
    const W = canvas.width;
    const H = canvas.height;
    return {
      // The plate behind everything just comes up out of black — sliding it
      // too would leave a moving hard edge against the letterbox.
      base: { x: 0, y: 0, a: at(t, BASE_IN[0], BASE_IN[1]) },
      cards: INTRO.map((c) => {
        // Scenery comes up WITH the plate it belongs to, not on its own
        // schedule — a skyline sliding in from the side would be a different
        // screen entirely.
        if (c.backdrop) return { x: 0, y: 0, a: at(t, BASE_IN[0], BASE_IN[1]) };
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

  // ── HIS EYES FOLLOW THE MOUSE, ON DESKTOP ────────────────────────────────
  //
  // Client: "when I move the mouse on the home screen... I want Will Hill's
  // eyes to follow the mouse."
  //
  // ⚠️ I FIRST SAID THIS WAS IMPOSSIBLE because he was wearing dark glasses
  // and all I could see were two specular dots. He corrected me — "he's
  // wearing clear glasses and you see his eyes, they have a white pupil with
  // slightly white of the eye showing" — and he was right. Measured on the
  // plate: two bright low-saturation blobs at (388.1, 1019.6) and
  // (427.5, 1019.2), peak luminance 254, each about 3px across, sitting in an
  // eye whose interior is essentially black (median RGB 9,7,3 and 5,3,0).
  // Those are pupils, not glare.
  //
  // HOW MUCH ROOM THERE IS, read straight off the luminance across each eye:
  //   left   10 10 9 8 8 0 |148 254 177| 23 4 4 2 2 2
  //   right   4 2 3 8 0 19 |173 253 252 170| 11 1 12 37 55
  // So the left eye has about 6 dark pixels either side of its pupil and the
  // right has 6 to the left but only 2 to the right before skin. TRAVEL IS
  // CLAMPED PER EYE for that reason — a pupil that slid onto his cheek would
  // be worse than one that did not move at all.
  // ⚠️ THE WHITE OF THE EYE MOVES THE OPPOSITE WAY TO THE PUPIL. Client:
  // "the weight of the eyes has to be on the opposite side of where the
  // pupils are for it to be natural — if the pupils are on the left, the
  // white of the eye should be on the right." That is how an eye works: the
  // sclera is REVEALED on the side the iris is travelling away from.
  //
  // And it is already in his painting. The two vertical streaks I first
  // dismissed as frame highlights — (378.8, 1022.8) and (417.6, 1021.6),
  // each a few px wide and sitting about 10px to the LEFT of its pupil — are
  // the sclera. He has painted Will Hill glancing slightly right: pupils
  // right, whites showing left. So the two travel as a pair in opposite
  // directions, which is also what sells the movement at this size.
  //
  // `dir` is +1 for something that follows the cursor and -1 for something
  // the cursor pushes away.
  const EYES = [
    // left eye: pupil, then its sclera
    { px: 0, x: 388.0, y: 1019.6, dir: 1, ink: '#090703',
      left: 3.2, right: 3.2, up: 1.6, down: 1.6 },
    { px: 1, x: 379.0, y: 1023.0, dir: -1, ink: '#090703', scale: 0.55,
      left: 1.8, right: 1.8, up: 1.0, down: 1.0 },
    // right eye
    { px: 2, x: 427.5, y: 1019.2, dir: 1, ink: '#050300',
      left: 3.2, right: 1.6, up: 1.6, down: 1.6 },
    { px: 3, x: 417.5, y: 1022.0, dir: -1, ink: '#050300', scale: 0.55,
      left: 1.6, right: 1.6, up: 1.0, down: 1.0 },
  ];
  // How far away the cursor has to be before the eyes are looking at it
  // rather than tracking every twitch, in fractions of the canvas.
  const EYE_REACH = 0.42;

  // The two pupils, cut out of the plate ONCE into a little strip so each
  // frame is a single drawImage. Half-width of each square patch, in source
  // px: big enough to take the pupil and its soft edge, small enough not to
  // drag the eyelid along with it.
  const EYE_PATCH = 3;
  // How much of the dark eye is wiped before each mark is put back down.
  const EYE_INK = 3.1;
  let eyePatch = null;
  let eyePatchFor = null;

  function buildEyePatch(base) {
    const pw = EYE_PATCH * 2 + 1;
    const cv = document.createElement('canvas');
    cv.width = pw * EYES.length;
    cv.height = pw;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    EYES.forEach((e, i) => {
      c.drawImage(base, Math.round(e.x) - EYE_PATCH, Math.round(e.y) - EYE_PATCH,
        pw, pw, i * pw, 0, pw, pw);
    });
    return cv;
  }

  // `mouse` is canvas-space {x,y} or null. Null means no mouse has ever
  // moved — a phone — and the pupils stay exactly where he painted them.
  function drawEyes(base, box, mouse) {
    if (!box || !mouse || !base || !base.width) return;
    const S = box.dw / SRC_W;
    if (S <= 0) return;
    if (eyePatchFor !== base) {
      eyePatch = buildEyePatch(base);
      eyePatchFor = base;
    }
    for (const e of EYES) {
      const cx = box.dx + e.x * S;
      const cy = box.dy + e.y * S;
      // Direction to the cursor, softened so a cursor right beside his face
      // does not peg the pupil at full travel.
      const dx = (mouse.x - cx) / (canvas.width * EYE_REACH);
      const dy = (mouse.y - cy) / (canvas.height * EYE_REACH);
      const m = Math.hypot(dx, dy) || 1;
      const u = Math.min(1, m) / m;              // clamp length, keep angle
      // `dir` flips the sclera so it slides out on the far side.
      const k = (e.dir || 1) * (e.scale || 1);
      const ox = dx * u * (dx < 0 ? e.left : e.right) * k;
      const oy = dy * u * (dy < 0 ? e.up : e.down) * k;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      // Paint out the painted pupil with the eye's own ink. The interior is
      // flat black, so a fill is indistinguishable from the artwork — no
      // patch to source and nothing to feather.
      ctx.fillStyle = e.ink;
      ctx.beginPath();
      ctx.ellipse(cx, cy, EYE_INK * S, EYE_INK * S, 0, 0, 7);
      ctx.fill();
      // ⚠️ AND HIS OWN PUPIL GOES BACK DOWN, not a drawn circle. An ellipse
      // of the same radius came out visibly dimmer than the painting —
      // measured 139 against the painted 254 — because a 1.7px shape is
      // mostly antialiased edge. Blitting the pupil's actual pixels keeps
      // his lettering-grade detail and carries its own dark surround, which
      // blends it into the ink for free.
      if (eyePatch) {
        const pw = EYE_PATCH * 2 + 1;
        ctx.drawImage(eyePatch,
          e.px * pw, 0, pw, pw,
          cx + (ox - EYE_PATCH) * S, cy + (oy - EYE_PATCH) * S, pw * S, pw * S);
      }
      ctx.restore();
    }
  }

  // ── OPTIONS, WHERE HE PAINTED IT ─────────────────────────────────────
  //
  // ⚠️ THIS IS A RECORD, NOT A HIT BOX ANY MORE. It is where his painted
  // OPTIONS used to sit on the plate, and tools/cut_title_options_out.py
  // paints that rectangle out — the two have to agree, which is why the
  // number stays here next to the code that used to use it. The live OPTIONS
  // is a drawn control laid out by homeLayout() and has nothing to do with
  // this position.
  //
  // Measured off the plate, not guessed: pale-neutral key over rows
  // 1600-1780, x 342-508, y 1609-1635.
  const OPTIONS_BOX = { x: 342, y: 1609, w: 167, h: 27 };
  // ⚠️ THE BAND-LIFT MACHINERY IS GONE. OPTIONS used to be his painted word,
  // shifted up 16 source rows by repainting a band of the plate every frame
  // (OPTIONS_LIFT, buildBand, liftOptions and a cache), so it would clear the
  // MUSIC control below it. That whole apparatus existed to buy a few pixels
  // in a place where the amount of room is not knowable from the painting —
  // see the note on homeLayout. The word is off the plate now and OPTIONS is
  // drawn, so there is nothing to lift and nothing to cache.

  // ══ THE HOME CONTROLS ═════════════════════════════════════════════════
  //
  // Client, on the live build: "I'm not really comfortable with how start
  // game, options and music buttons are sitting. And also, from that page, I
  // want someone to be able to immediately enter the contest."
  //
  // ⚠️ THE OLD LAYOUT WAS ANCHORED TO THE PAINTING, AND THAT WAS THE BUG.
  // OPTIONS was his painted lettering at source row 1609 of 1844, so where it
  // landed on screen depended entirely on how the cover-crop happened to
  // fall. Measured across four phones: 12-14px tall — a third of a usable tap
  // target — and simultaneously bunched high with 73-82px of dead pavement
  // underneath on a tall phone, and crushed against the bottom edge with a
  // 6px gap on an iPhone SE. Same layout, opposite failure, one cause.
  //
  // musicRect had grown four layers of compensation for it: a 16-row lift of
  // OPTIONS, a half-lift for MUSIC, a 25/75 crop weighting in stillscene.js
  // bought purely to give MUSIC room, and a gap-versus-height solver so two
  // floors could not contradict each other. All of it fighting the fact that
  // the amount of room down there is not knowable from the painting.
  //
  // So the controls are laid out from the SCREEN, upward from the bottom
  // inset, at fixed sizes. Every phone gets the same real targets; only how
  // much pavement shows above them varies. The painted OPTIONS is gone from
  // the plate (tools/cut_title_options_out.py) so there is only one of it.
  //
  // PRESS START stays painted and untouched — the client's call. It is his
  // hero lettering and the layout below must never reach it.
  const HOME_MIN_H = 44;        // the whole point: a real tap target
  const HOME_BOTTOM = 20;       // clear of the home indicator
  const HOME_GAP = 12;
  const HOME_SIDE = 16;
  const BANNER_H = 56;
  // Never thinner than this, even where the pavement runs out.
  const BANNER_MIN_H = 42;
  // The floor when everything shares one row on a short phone.
  const SHORT_MIN_H = 34;
  // PRESS START's painted baseline in source rows. The stack is clamped to
  // stay below it, so on a very short phone the controls stop rather than
  // climbing over his lettering.
  const PROMPT_FOOT = 1580;

  function homeLayout(box) {
    if (!box) return null;
    const W = canvas.width;
    const H = canvas.height;
    const S = box.dw / SRC_W;
    const side = Math.max(10, Math.min(HOME_SIDE, W * 0.05));
    const inner = W - side * 2;

    // ⚠️ HOW MUCH ROAD IS ACTUALLY BELOW HIS LETTERING, MEASURED.
    // PRESS START is painted into the plate and cannot move, so the controls
    // get whatever is under it and no more. On an iPhone SE that is 45px —
    // against 98px for a banner, a gap and a 44px row. Two earlier attempts
    // ignored this: the first pushed the row 72px off the bottom of the
    // screen, the second drew it straight over his lettering.
    //
    // Cropping harder does not rescue it either. The title plate is already
    // cropped as far as its budget allows, and taking the top margin to zero
    // (stillscene.js) bought six pixels.
    //
    // So the layout has two shapes, chosen by what fits:
    //   TALL  — banner across the pavement, OPTIONS and MUSIC in a row below.
    //   SHORT — all three share one row, contest first and widest.
    // Both keep a real tap target and neither ever touches PRESS START.
    const promptFoot = box.dy + PROMPT_FOOT * S;
    const road = (H - HOME_BOTTOM) - promptFoot;
    const twoRows = BANNER_MIN_H + HOME_GAP + HOME_MIN_H;

    if (road >= twoRows) {
      const rowH = HOME_MIN_H;
      const ry = H - HOME_BOTTOM - rowH;
      const bannerH = Math.max(BANNER_MIN_H,
        Math.min(BANNER_H, (ry - HOME_GAP) - promptFoot));
      const optW = Math.round((inner - HOME_GAP) * 0.44);
      return {
        banner: { x: side, y: ry - HOME_GAP - bannerH, w: inner, h: bannerH },
        options: { x: side, y: ry, w: optW, h: rowH },
        music: { x: side + optW + HOME_GAP, y: ry,
                 w: inner - HOME_GAP - optW, h: rowH },
        rows: 2,
      };
    }

    // SHORT. One row, and the height is whatever the road gives down to a
    // floor — 34px is still nearly three times the 12px these controls used
    // to be, and it beats drawing over his lettering to keep a round number.
    const bottom = Math.min(HOME_BOTTOM, Math.max(6, road * 0.18));
    const rowH = Math.max(SHORT_MIN_H, Math.min(HOME_MIN_H, road - bottom));
    const ry = H - bottom - rowH;
    const g = Math.max(6, HOME_GAP * 0.6);
    const bw = Math.round((inner - g * 2) * 0.46);
    const rest = Math.round((inner - g * 2 - bw) / 2);
    return {
      banner: { x: side, y: ry, w: bw, h: rowH },
      options: { x: side + bw + g, y: ry, w: rest, h: rowH },
      music: { x: side + bw + g + rest + g, y: ry,
               w: inner - bw - g * 2 - rest, h: rowH },
      rows: 1,
    };
  }

  function bannerRect(box) {
    const l = homeLayout(box);
    return l && l.banner;
  }

  function optionsRect(box) {
    const l = homeLayout(box);
    return l && l.options;
  }

  // ── HIS OWN HIGHWAY SIGN, REUSED AS A BUTTON ──────────────────────────
  //
  // Client's call: the contest entry is "a banner across the pavement,
  // styled like the road signage in your art."
  //
  // ⚠️ THE COLOURS ARE SAMPLED FROM THE PLATE, NOT INVENTED. Median of the
  // WELCOME TO ATLANTA sign at source x55..340 y740..890: the green field is
  // #022c17, and the type and border are #988d70 — a weathered warm white,
  // not pure white, which is why a clean #fff button looked pasted on beside
  // it. Re-sample if the title art is ever repainted.
  const SIGN_FIELD = '#022c17';
  const SIGN_INK = '#988d70';
  const SIGN_SHADOW = 'rgba(2,23,6,0.85)';

  function drawBanner(box, tick, registered) {
    const r = bannerRect(box);
    if (!r) return;
    const l = homeLayout(box);
    const tight = l && l.rows === 1;
    const label = registered
      ? (tight ? 'LEADERBOARD' : "YOU'RE IN  ·  SEE THE BOARD")
      : (tight ? 'ENTER' : 'ENTER THE CONTEST');
    const rad = Math.min(10, r.h * 0.18);
    ctx.save();
    // Drop shadow first, so the sign sits ON the road rather than floating.
    ctx.fillStyle = SIGN_SHADOW;
    rr(r.x + 2, r.y + 3, r.w, r.h, rad);
    ctx.fill();
    ctx.fillStyle = SIGN_FIELD;
    rr(r.x, r.y, r.w, r.h, rad);
    ctx.fill();
    // The white keyline his signs all carry, inset the way they are.
    ctx.strokeStyle = SIGN_INK;
    ctx.lineWidth = Math.max(1.5, r.h * 0.045);
    rr(r.x + r.h * 0.10, r.y + r.h * 0.10,
       r.w - r.h * 0.20, r.h - r.h * 0.20, rad * 0.7);
    ctx.stroke();
    ctx.fillStyle = SIGN_INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const px = fitToWidth(label, r.h * 0.34, r.w - r.h * 0.9, () => 0);
    ctx.font = `700 ${px}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.letterSpacing = '0.06em';
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
    ctx.restore();
    // Its own beat, a third out of phase with PRESS START and OPTIONS, so the
    // three read as three separate pressable things and not one blink.
    still.pulseRect(r.x, r.y, r.w, r.h, tick + 114, '150,255,190');
  }

  function rr(x, y, w, h, rad) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad);
    else ctx.rect(x, y, w, h);
  }

  function hitBanner(box, x, y) {
    const r = bannerRect(box);
    return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  // OPTIONS is a drawn control now, not his painted word — the painted one is
  // gone from the plate. Same weathered ink as the banner so the row reads as
  // one set of controls rather than three unrelated things.
  function drawOptions(_img, box, tick) {
    const r = optionsRect(box);
    if (!r) return;
    ctx.save();
    ctx.fillStyle = 'rgba(6,10,9,0.55)';
    rr(r.x, r.y, r.w, r.h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(152,141,112,0.55)';
    ctx.lineWidth = 1.5;
    rr(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 7);
    ctx.stroke();
    ctx.fillStyle = SIGN_INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const px = fitToWidth('OPTIONS', r.h * 0.36, r.w - 18, () => 0);
    ctx.font = `700 ${px}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.letterSpacing = '0.08em';
    ctx.fillText('OPTIONS', r.x + r.w / 2, r.y + r.h / 2 + 1);
    ctx.restore();
    // Opposite beat to PRESS START, as before.
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
  // ⚠️ IT MEASURES IN THE FONT IT WILL BE DRAWN IN. This used to size the
  // label against `system-ui, sans-serif` while all three controls render in
  // the monospace stack, which is materially wider — so the number it handed
  // back was a fit for a font nobody uses. Same string here as in every
  // fillText below; change one, change all of them.
  const CONTROL_FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';

  function fitToWidth(label, maxPx, targetW, extra) {
    ctx.save();
    let px = maxPx;
    for (; px > 4; px -= 0.25) {
      ctx.font = `700 ${px}px ${CONTROL_FONT}`;
      if (ctx.measureText(label).width + extra(px) <= targetW) break;
    }
    ctx.restore();
    return px;
  }

  function musicRect(box) {
    const l = homeLayout(box);
    if (!l) return null;
    const r = l.music;
    // The checkbox and its label, centred together inside the control. No
    // solver any more: the room is given, not fought for.
    const boxSz = Math.round(r.h * 0.42);
    // ⚠️ THE BOX IS SUBTRACTED ONCE, NOT TWICE. It used to come off the target
    // width AND be added back by extra(), which on the one-row layout left
    // "MUSIC" 32px to live in and sized it at 8px — small print again, beside
    // a 44px tap target, which is the exact complaint this whole change is
    // answering. The side padding scales with the control now too; a flat 26px
    // is a third of the width on a short phone and nothing on a tall one.
    const pad = Math.max(10, Math.round(r.h * 0.36));
    const px = fitToWidth(MUSIC_LABEL, r.h * 0.36, r.w - pad,
                          (q) => boxSz + q * 0.40);
    ctx.save();
    ctx.font = `700 ${px}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const tw = ctx.measureText(MUSIC_LABEL).width;
    ctx.restore();
    const contentW = boxSz + px * 0.40 + tw;
    return { x: r.x, y: r.y, w: r.w, h: r.h,
             boxSz, gap: px * 0.40, fontPx: px,
             // Where the content starts, so drawMusic can centre it.
             inset: Math.max(8, (r.w - contentW) / 2) };
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
    // The control is a plate now, the same as OPTIONS, with the box and label
    // centred inside it rather than being the whole of it.
    ctx.fillStyle = 'rgba(6,10,9,0.55)';
    rr(r.x, r.y, r.w, r.h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(152,141,112,0.55)';
    ctx.lineWidth = 1.5;
    rr(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 7);
    ctx.stroke();
    const bx = r.x + r.inset;
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
    ctx.fillText(MUSIC_LABEL, bx + r.boxSz + r.gap, r.y + r.h / 2 + 1);
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
    hitMusic, musicRect, drawMusic,
    hitBanner, bannerRect, homeLayout };
}
