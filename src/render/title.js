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
import tpLogo from '../assets/backgrounds/titlep-logo.webp';
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
  tp_logo: tpLogo, tp_signL: tpSignL, tp_signR: tpSignR,
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
// How much sky the fit may crop off the top to fill the width instead of
// letterboxing — see stillscene.fit.
//
// MEASURED, AND MEASURED TWICE. The first number came off the letters' bright
// FACE, row 281, and a 430x800 window duly cropped 257 rows and clipped the top
// of WILL HILL: — because these glyphs carry a thick black outline the bright
// key cannot see. Growing the letter mass 16px and keeping the dark pixels it
// reaches finds the real edge at row 265. 241 leaves 24 rows of margin under
// that, which covers every window down to about 430x820 and falls back to bars
// below it.
export const TITLE_COVER_ROWS = 241;
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
const CARD_SPEC = [
  { key: 'tp_logo', depth: 0.05 },
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
  function draw(images, tick, splash, introT, musicOn) {
    // THE INTRO PAGE. The card assembles itself out of an empty street and a
    // blank sky — see introFx — and that assembly IS the whole page. It has no
    // words of its own; his painting's own PRESS START is the prompt.
    const fx = splash ? introFx(introT || 0) : null;
    const box = still.draw(images.title_base, titleCards(images), tick,
      TITLE_ZOOM, TITLE_BIAS, fx, TITLE_COVER_ROWS);
    still.pulsePrompt(box, PROMPT, SRC_W, SRC_H, tick);
    // The two controls that are NOT part of the painting come up with the last
    // layer, so the page finishes as the menu instead of cutting to it.
    const a = splash ? splashControlAlpha(introT || 0) : 1;
    if (a > 0.002) {
      ctx.save();
      ctx.globalAlpha = a;
      drawOptions(images.title_options, box, tick);
      drawRelay(box, images.champagne, tick);
      drawMusic(box, musicOn, tick);
      ctx.restore();
    }
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
  const INTRO = [
    { from: [0.00, -0.34], t0: 24, t1: 78 },   // 0 the title, dropping in
    { from: [-0.46, 0.05], t0: 8, t1: 56 },    // 1 left gantry, off frame
    { from: [0.46, 0.05], t0: 14, t1: 62 },    // 2 right gantry
    { from: [0.00, 0.44], t0: 20, t1: 74 },    // 3 Will Hill, up off the street
    { from: [0.34, 0.00], t0: 4, t1: 58 },     // 4 the pole, in from the kerb
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

  function optionsRect(box) {
    if (!box) return null;
    const S = box.dw / SRC_W;
    return { x: box.dx + OPTIONS_BOX.x * S, y: box.dy + OPTIONS_BOX.y * S,
             w: OPTIONS_BOX.w * S, h: OPTIONS_BOX.h * S };
  }

  function drawOptions(_img, box, tick) {
    const r = optionsRect(box);
    if (!r) return;
    // NOTHING IS BLITTED. The word is in the painting. All this adds is the
    // breath that marks it as pressable — opposite beat to PRESS START and
    // cooler, so it reads as a second thing you can press rather than as a
    // caption under the first. Additive glow over his lettering, as ever.
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
    // Into the empty road below the word. The portrait plate leaves 209 source
    // rows of bare wet street under OPTIONS — 105px on a 430 phone — so the
    // pill sits on painted ground instead of in a letterbox that no longer
    // exists, and still clears the word by a comfortable margin.
    const gap = Math.max(14, h * 0.55);
    const y = Math.min(canvas.height - h - 10, o.y + o.h + gap);
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

  // ── THE MUSIC BOX ────────────────────────────────────────────────────
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

  function musicRect(box) {
    const r = relayRect(box);
    if (!r) return null;
    const h = Math.max(22, Math.min(38, r.h * 0.86));
    ctx.save();
    ctx.font = `700 ${Math.round(h * 0.44)}px system-ui, sans-serif`;
    const tw = ctx.measureText(MUSIC_LABEL).width;
    ctx.restore();
    const boxSz = h * 0.62;
    const w = boxSz + h * 0.42 + tw;
    return { x: (canvas.width - w) / 2, y: Math.min(canvas.height - h - 8,
      r.y + r.h + Math.max(12, h * 0.5)), w, h, boxSz };
  }

  function drawMusic(box, on, tick) {
    const r = musicRect(box);
    if (!r) return;
    const glow = 0.5 + 0.5 * Math.sin(tick / 52 + 4.2);
    const bx = r.x;
    const by = r.y + (r.h - r.boxSz) / 2;
    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, r.boxSz, r.boxSz, 4);
    else ctx.rect(bx, by, r.boxSz, r.boxSz);
    ctx.fillStyle = on ? 'rgba(255,214,110,0.92)' : 'rgba(10,8,16,0.68)';
    ctx.fill();
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
    ctx.font = `700 ${Math.round(r.h * 0.44)}px system-ui, sans-serif`;
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
  // a measured rect, and CHAMPAGNE RELAY has its own pill under it. Two real
  // targets do not need half the screen between them.
  //
  // So: the OPTIONS word is OPTIONS, the pill is the pill, and every other
  // pixel on this screen — the black band included — is the one big START that
  // the painting has always advertised. The first of those taps buys the sound.
  //
  // MARGIN, because a rect measured off lettering is smaller than a thumb. The
  // same 10px the relay pill uses, and it is checked AFTER the pill so the two
  // margins cannot overlap into an ambiguous strip.
  const HIT_MARGIN = 10;

  function hitOptions(box, x, y) {
    const r = optionsRect(box);
    if (!r) return false;
    return x >= r.x - HIT_MARGIN && x <= r.x + r.w + HIT_MARGIN
      && y >= r.y - HIT_MARGIN && y <= r.y + r.h + HIT_MARGIN;
  }
  return { draw, hitOptions, optionsRect, hitRelay, relayRect,
    hitMusic, musicRect, drawMusic };
}
