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
    // ── THE TWO ROADSIDE SIGNS ────────────────────────────────────────
    //
    // ⚠️ THESE CARDS ONCE CARRIED THE SKYLINE WITH THEM, and it is the failure
    // mode to watch for on every SAM group: a card sways whatever is IN it, so
    // one wrongly-assigned mask puts a building on a pole. The client caught
    // it — "the sign on the left, the building is moving behind it… the one
    // closest to the left, touching the sign on the right, is still moving" —
    // and he was exactly right about which buildings. signL had swallowed the
    // tall spire (mask #52), the whole streetlamp and two clouds; signR had
    // taken the block against its left edge (#109), which is the one he named.
    //
    // Both groups are now derived by CONTAINMENT in the sign's own footprint
    // rather than by hand-picked mask lists — 70% inside the panel-and-posts
    // box, the same rule sam_group.py uses on the stage plates. That dropped
    // 14 masks from signL and 1 from signR, and it is a rule rather than a
    // patch, so a re-cut cannot quietly re-admit them.
    //
    // `top` is each sign's REAL top edge now, not a guess above it. The shear
    // ramps linearly from `pivot` to `top`, so a band starting 170 rows above
    // the object gave the object only part of the amplitude.
    {
      img: images.title_signL,
      // Mask x 1..387, y 468..707 — panel at 0.457, posts planted at 0.691.
      sway: [{ top: 0.457, pivot: 0.692, ampFrac: 0.0045, freq: 1.0,
        xRanges: [[0.0, 0.256]] }],
    },
    {
      img: images.title_signR,
      // Mask x 1213..1534, y 462..775.
      sway: [{ top: 0.451, pivot: 0.757, ampFrac: 0.0045, freq: 1.25,
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
  function draw(images, tick, splash, introT) {
    // THE INTRO PAGE. The card assembles itself, then asks for the one tap the
    // browser needs — see introFx and drawSplash.
    const fx = splash ? introFx(introT || 0) : null;
    const box = still.draw(images.title_base, titleCards(images), tick,
      TITLE_ZOOM, TITLE_BIAS, fx);
    if (splash) { drawSplash(box, tick, introT || 0); return box; }
    still.pulsePrompt(box, PROMPT, SRC_W, SRC_H, tick);
    drawOptions(images.title_options, box, tick);
    drawRelay(box, images.champagne, tick);
    return box;
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
  // Cubic ease-out, no bounce: things settle, they do not boing. Overlapping
  // windows so it reads as one move rather than five, ~1.8s end to end.
  //
  // THE TAP IS LIVE THE WHOLE TIME. Nothing here gates input — main.js arms the
  // title at 24 ticks as it always has — so this never stands between the
  // player and the game. Tap during the assembly and you land on the menu with
  // the theme playing, which is exactly the skip the client asked for.
  //
  // Indices are positions in titleCards(). A card added there without a line
  // here simply arrives at rest, which is the safe failure.
  const INTRO = [
    { from: [-0.38, 0.00], t0: 4, t1: 48 },    // 0 clouds — across the sky
    // 1 skyline and logo. ⚠️ THIS ONE MUST NOT TRAVEL. Unlike the signs and the
    // hero, it is not cut OUT of the base — cut_still.py fills their holes, but
    // this card is a duplicate of pixels the base still has, drawn again purely
    // so it sits in FRONT of the clouds. Slide it and the painting shows two
    // logos, the still one underneath and the moving one arriving. It rides the
    // base's own fade instead.
    { from: [0.00, 0.00], t0: 0, t1: 24 },
    { from: [-0.46, 0.06], t0: 10, t1: 58 },   // 2 sign, left of frame
    { from: [0.46, 0.06], t0: 16, t1: 64 },    // 3 sign, right of frame
    { from: [0.00, 0.42], t0: 24, t1: 78 },    // 4 Will Hill — up, and last
  ];
  // 78 ticks, about 1.3s. IT USED TO BE 1.8s AND THAT WAS TOO LONG, for a
  // reason only visible once it ran: cut_still.py fills the holes where the
  // signs and the hero were lifted out, so until a card lands there is a soft
  // grey ghost of it sitting in the base. Every extra frame of assembly is an
  // extra frame of looking at those. Overlap the windows hard instead — the
  // cards are moving over their own ghosts almost immediately.
  const INTRO_END = 78;
  const ease = (u) => 1 - (1 - u) * (1 - u) * (1 - u);
  const at = (t, t0, t1) => ease(Math.max(0, Math.min(1, (t - t0) / (t1 - t0))));

  function introFx(t) {
    const W = canvas.width;
    const H = canvas.height;
    return {
      // The plate behind everything just comes up out of black — sliding it
      // too would leave a moving hard edge against the letterbox.
      base: { x: 0, y: 0, a: at(t, 0, 30) },
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
  // like an intro page, and then the first page will be the main menu page."
  // This is the second one, and it is the standard answer — every web game
  // ships it. It also plays better than autoplay would: the theme lands on a
  // deliberate press instead of dribbling in behind a loading screen.
  //
  // IT IS THE PAINTING, DIMMED, NOT A BLACK CARD. The first thing anyone sees
  // should still be his art. The scrim only has to be deep enough that one word
  // reads as the only thing to do.
  //
  // NO OTHER CONTROL IS DRAWN. START, OPTIONS and CHAMPAGNE RELAY all appear on
  // the very next frame after the tap; showing them here would offer choices
  // that the first tap is going to swallow anyway.
  //
  // The empty upper third is deliberate: it is where a RARƎ AGENCY / prodbyKCTW
  // card goes when those logo files arrive, which is what turns this page into
  // the skippable intro SEQUENCE the client also asked about.
  function drawSplash(box, tick, introT) {
    const W = canvas.width;
    const H = canvas.height;
    // Hold the prompt back until the card has finished building itself, then
    // bring it up over half a second. Asking for a tap over a half-assembled
    // painting would throw away the reveal the assembly exists to give.
    const show = at(introT, INTRO_END - 12, INTRO_END + 20);
    if (show <= 0.001) return;
    const touch = typeof document !== 'undefined'
      && document.body && document.body.classList.contains('touch');
    const label = touch ? 'TAP TO START' : 'PRESS ANY KEY';
    // Slow and wide — a heartbeat, not a blink. Same breathing language as the
    // three controls it stands in for, on its own phase again.
    const glow = 0.5 + 0.5 * Math.sin(tick / 38);

    ctx.save();
    ctx.globalAlpha = show;
    ctx.fillStyle = 'rgba(6,5,12,0.52)';
    ctx.fillRect(0, 0, W, H);

    // Sized off the display, not the card: this page has to work on a 430px
    // phone and a desktop window, and unlike OPTIONS it is not tied to a
    // painted word whose pixel grid we have to respect.
    const size = Math.max(20, Math.min(46, W * 0.082));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(size)}px system-ui, sans-serif`;
    // IN THE BLACK BELOW THE CARD, not over it. The painting has its own PRESS
    // START lettering baked in around the middle of the frame, and dropping a
    // second prompt on top of it gave two prompts fighting in one place. The
    // letterbox band is empty, it is where OPTIONS and CHAMPAGNE RELAY live on
    // the menu that follows, and putting it there means the eye learns the same
    // spot for "the thing to press" on both pages.
    const below = box ? box.dy + box.dh : H * 0.72;
    const y = Math.min(H - size * 1.9, below + Math.max(size * 0.9,
      (H - below) * 0.34));
    ctx.shadowColor = `rgba(255,198,86,${0.30 + 0.45 * glow})`;
    ctx.shadowBlur = 26;
    ctx.fillStyle = `rgba(255,236,196,${0.78 + 0.22 * glow})`;
    ctx.fillText(label, W / 2, y);
    ctx.shadowBlur = 0;

    // THE SECOND LINE EARNS ITS PLACE. The soundtrack is ten of the client's
    // own instrumentals and it is the first thing this page exists to deliver,
    // so it is worth one quiet sentence asking for the volume before the theme
    // starts rather than after somebody has already missed it.
    ctx.font = `600 ${Math.round(size * 0.40)}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(226,214,236,0.62)';
    ctx.fillText('TURN YOUR SOUND UP', W / 2, y + size * 1.15);
    ctx.restore();
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

  // ── CHAMPAGNE RELAY ──────────────────────────────────────────────────
  //
  // The walkthrough build, offered as a choice on the card rather than hidden
  // behind a URL. The client: "when we go to start game it should be like a
  // champagne relay button at the bottom with a champagne bottle in it from
  // the game, for me to choose that version."
  //
  // It sits UNDER the OPTIONS word and gets its own hit rect, tested before
  // the lower-half catch-all — otherwise the whole bottom of the screen
  // belongs to the panel and this could never be pressed. Drawn small and
  // quiet on purpose: it is a door for him, not a third headline competing
  // with his painting.
  const RELAY_LABEL = 'CHAMPAGNE RELAY';

  function relayRect(box) {
    const o = optionsRect(box);
    if (!o) return null;
    const h = Math.max(26, Math.min(44, o.h * 0.62));
    const pad = h * 0.42;
    ctx.save();
    ctx.font = `700 ${Math.round(h * 0.40)}px system-ui, sans-serif`;
    const tw = ctx.measureText(RELAY_LABEL).width;
    ctx.restore();
    const w = Math.min(canvas.width - 24, tw + h * 0.80 + pad * 2);
    const y = Math.min(canvas.height - h - 8, o.y + o.h + Math.max(8, h * 0.34));
    return { x: (canvas.width - w) / 2, y, w, h, pad };
  }

  function drawRelay(box, champImg, tick) {
    const r = relayRect(box);
    if (!r) return;
    const rad = r.h / 2;
    // A slow breath, out of phase with both the prompt and OPTIONS, so three
    // pressable things on one card never pulse together and read as one.
    const glow = 0.5 + 0.5 * Math.sin(tick / 46 + 2.1);
    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(r.x, r.y, r.w, r.h, rad);
    else ctx.rect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = 'rgba(12,8,20,0.72)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(255,214,110,${0.42 + 0.30 * glow})`;
    ctx.stroke();

    const ih = r.h * 0.66;
    const ix = r.x + r.pad * 0.7;
    if (champImg && champImg.width) {
      const iw = ih * (champImg.width / champImg.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(champImg, ix, r.y + (r.h - ih) / 2, iw, ih);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd66e';
      ctx.font = `700 ${Math.round(r.h * 0.40)}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(RELAY_LABEL, ix + iw + r.pad * 0.5, r.y + r.h / 2 + 1);
    } else {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd66e';
      ctx.font = `700 ${Math.round(r.h * 0.40)}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(RELAY_LABEL, r.x + r.w / 2, r.y + r.h / 2 + 1);
    }
    ctx.restore();
  }

  function hitRelay(box, x, y) {
    const r = relayRect(box);
    if (!r) return false;
    // A finger-sized margin: the pill is deliberately small and a near miss
    // would otherwise open the panel instead, which is a confusing wrong door.
    const m = 10;
    return x >= r.x - m && x <= r.x + r.w + m && y >= r.y - m && y <= r.y + r.h + m;
  }

  // Which half of the screen was tapped. Above the line starts the game,
  // at or below it opens the panel — and "below" runs all the way to the
  // bottom of the display, not just to the bottom of the painting, so the
  // relocated word is inside its own zone by construction.
  function hitOptions(box, y) {
    if (!box) return false;
    return y >= box.dy + (SPLIT_Y / SRC_H) * box.dh;
  }
  return { draw, hitOptions, optionsRect, hitRelay, relayRect };
}
