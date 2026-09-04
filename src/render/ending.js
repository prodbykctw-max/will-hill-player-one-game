// THE ENDING SCREEN — the results board after Will Hill makes the show.
//
// IT IS THE CLIENT'S PAINTING, SHOWN WHOLE, and by now it is his painting far
// more completely than it used to be. The plate carries its own SHOWTIME
// title, its own flavour lines, its own eight stat LABELS and its own RESTART
// button. Nothing here letters anything. The only thing this file draws is
// eight numbers.
//
// ⚠️ IT REPLACED A LANDSCAPE MOCKUP AND THAT IS MOST OF THE WIN. The old plate
// was 1536x1024; fitted to his 430x932 phone it painted 430x287 with more than
// half the screen black. This one is 853x1843 — the same shape as the contest
// cabinet and the dashboard — and covers his phone with three pixels to spare.
// He asked for 1024x2212 and the generator returned 853x1843: same ratio to
// four decimals, and the same pixel size as every other shipping plate, so
// nothing is resampled.
//
// THE STATS ARE THE RUN'S OWN NUMBERS. Every one is derived from the replay log
// the leaderboard already keeps (net/leaderboard.js) — the same event stream
// that validates a submitted score — so the board cannot drift from what
// actually happened and there is no second set of counters to keep in step. If
// a number appears here, it was recorded when the thing happened.
//
// ⚠️ THE ROWS ARE THIS GAME'S, AND IT TOOK TWO PASSES OF HIS ARTWORK TO GET
// THERE. Both the old mockup and the first version of this plate came back
// with the standard beat-em-up set — ENEMIES DEFEATED / BOSSES DEFEATED / TIME
// / MAX COMBO / SCORE. Will Hill has no bosses (three separate comments in
// src/world/ say so) and no combo meter. The old plate was handled by
// overwriting its labels; this time he relettered the artwork himself, which
// is the better outcome and his standing preference — so every word on the
// shipped plate is his and this file has no label table at all.
//
// (MAX COMBO was the one that could have been made real: every log event
// carries a millisecond stamp, so the chained-stomp run the punch sounds
// already escalate on — audio.js, 1.2s window — is derivable without any new
// state. He picked the eight that exist. It is one function away if he wants
// it later.)
//
// ⚠️ RANK IS GONE, deliberately, because he dropped it from the plate. The old
// rankFor() docked you 1500 a continue and 250 a robbery before reading five
// thresholds; it is in git history if that judgement is ever wanted back.

import endingBase from '../assets/backgrounds/ending-base.webp';
import endingCrowd from '../assets/backgrounds/ending-crowd.webp';

// Loaded through main.js's one image manifest, like everything else.
//
// ⚠️ ONE IMAGE NOW, not three. The old ending was cut into base/crowd/hero so
// the crowd could sway (tools/cut_still.py). Those cards were cut from the
// LANDSCAPE plate and mean nothing on this one, so they are gone rather than
// left to rot as dead weight Vite would still bundle. The sway is a separate
// pass over the new painting — his call, "ship it flat first".
export const ENDING_IMAGES = {
  ending_base: endingBase,
  ending_crowd: endingCrowd,
};

// ── THE CROWD SWAYS ──────────────────────────────────────────────────────
//
// His call was "ship it flat first, re-cut after", and this is the re-cut.
// tools/cut_ending_crowd.py lifts the crowd off the painting and fills behind
// it; this is the band that shears.
//
// ⚠️ THE PIVOT IS AT THE CARD'S FEET, WHICH IS THE POINT. Shear is zero at the
// pivot line and full at the top of the band, so the front row stands still on
// the stage lip it is sitting on and only the heads move. A pivot anywhere
// else slides the whole crowd sideways against a static floor.
//
// ⚠️ AND THE AMPLITUDE IS SMALL ON PURPOSE. `ampFrac` is a fraction of the
// drawn width, so it holds at any phone size — 0.004 is about 1.7px on a 430px
// screen. A crowd at a show sways; it does not wave. The mask edge at x=140 is
// a ruled line through a painting rather than a cutout, and the reason a
// straight edge is safe there is that 9px of feather over a ~2px shear means
// no column ever changes by more than a fifth of its own value.
//
// Fractions are of the PAINTING, 853x1843: the band runs from the head line
// (726/1843) to the stage lip (1596/1843), and starts right of Will Hill
// (140/853) so he does not move with it.
export const ENDING_CARDS = [{
  key: 'crowd',
  sway: [{
    top: 726 / 1843,
    pivot: 1596 / 1843,
    ampFrac: 0.004,
    freq: 0.55,
    xRanges: [[140 / 853, 1.0]],
  }],
}];

// ── HIS PLATE'S OWN GEOMETRY ─────────────────────────────────────────────
//
// ⚠️ EXPORTED, BECAUSE A RECT IS MEANINGLESS WITHOUT THE PLATE IT WAS MEASURED
// ON. main.js used to map RESTART's predecessor through title.js's SRC_W/SRC_H
// — 853x1844 against a 1536x1024 painting — which put that prompt's glow at
// x=605 on a 430px phone, off the right-hand edge, so it never once appeared.
// Both constants were called SRC_W. See docs/LESSONS.md 21.
export const SRC_W = 853;
export const SRC_H = 1843;

// His gold RESTART plate, from its own border. THE painted control on this
// screen, and the only one.
export const RESTART = { x: 169, y: 1620, w: 504, h: 141 };

// ⚠️ THE PLATE WAS NEVER GIVEN A SAFE BAND, AND RESTART SITS RIGHT WHERE IT
// WOULD HAVE NEEDED ONE. Client, iPhone 15 PWA screenshot: RESTART sliced
// off at the bottom. title.js's plate has carried a TITLE_SAFE since the
// PRESS START era (see its own comment) so its content survives both a
// status-bar/island crop at the top and a home-indicator reserve at the
// bottom; main.js's still.draw(images.ending_base, ...) call never passed
// one, so this plate got neither.
//
// ⚠️ TOP IS DELIBERATELY LOOSE (250, past the SHOWTIME wordmark's own ink —
// the tagline below it is what gets to crop first). RESTART sits only ~60
// rows of spare above the plate's OWN bottom edge (1843), the thinnest
// margin any control on either still scene has ever had — protecting the
// wordmark too tightly leaves stillscene.js's dy nothing to spend on the
// button that actually needs tapping. A cropped tagline is a detail; a
// button a thumb cannot see is the bug he reported.
export const ENDING_SAFE = { top: 250, bottom: 1780 };

// ⚠️ NO ENDING_ZOOM. A zoom bump was tried here to buy stillscene.js's
// foot-reserve nudge some real vertical crop slack — this plate's own ratio
// (853x1843) was generated to all but exactly match an iPhone's, so at zoom
// 1 there is NONE, and the nudge alone cannot do anything a plain browser
// (footReserve 0) wouldn't have done anyway. The zoom made it worse, not
// better: `cropRows` — the budget the top/bottom split is measured against
// — is derived from the PRE-zoom `cover`, not the scale zoom actually
// produces, so the extra height a zoom buys is not accounted for by that
// split at all; it landed entirely below the canvas, and RESTART sat off
// the bottom edge in a PLAIN BROWSER, not just a reserve-carrying PWA —
// worse than doing nothing. `betweenscreens.mjs` caught it immediately
// ("off the edge of the painting"). Fixing that properly means teaching
// `fit()`'s crop-budget math about post-zoom scale, which is a change to
// code every still scene shares (title included) and needs its own pass,
// not a one-line add here. Until then this plate ships with the same
// nudge every safe-banded plate gets and no zoom — real protection on
// phone shapes that already have slack (SE, Android), no protection beyond
// that on the ~2.16 ratio this plate was sized to match, same as before
// this file existed. See stillscene.js's note on the nudge for the rest.

// The eight value baselines and their right edge, printed by
// tools/cut_ending_plate.py off the plate itself — it locates his rows by ink
// and empties his placeholder values, so these two lists and that erase are
// derived from one measurement rather than agreeing by hand.
// Caps sit on the baseline and none of these glyphs descend, so the baseline
// is the bottom of each ink band.
const ROW_Y = [483, 516, 550, 583, 617, 651, 684, 717];
const VALUE_X = 780;
// Sampled off the core of his own "$31,200", not chosen: the numbers this
// draws have to look like the numbers he drew, because for one row they
// literally replace them.
const VALUE_INK = '#e1bb88';
// Cap height measures 18px on the plate, which is a 25px face.
const VALUE_PX = 25;

// ── THE READOUT — accumulating, not appearing ────────────────────────────
//
// Client, with a screenshot of this board: "I want the ending stats to read
// digitally... accumulating like they're adding up... with a little sound
// effects." The board used to just FLASH each number in, whole, on its row's
// turn — his labels arrived one at a time but the numbers behind them did
// not, and a whole number appearing in one frame is a slide, not a readout.
//
// Now every row counts up from zero to its real value over COUNT_TICKS, on
// an ease-out curve (fast start, settling into place rather than snapping) —
// the odometer look he described. STAT_ROWS and REVEAL_TICKS are exported
// so main.js can fire a chime on the exact tick each row STARTS counting,
// off the same arithmetic this file uses to decide it, rather than a second
// timer that could drift from what is actually on screen.
export const STAT_ROWS = ROW_Y.length;
export const REVEAL_TICKS = 7;     // ticks between one row starting and the next
const COUNT_TICKS = 22;            // ticks a single row takes to settle

// How many rows have started counting by tick `t` — the one place this
// arithmetic lives, so the sound (main.js) and the paint (draw() below)
// can never disagree about which row is on.
export function rowsShown(t) {
  return Math.min(STAT_ROWS, Math.floor(t / REVEAL_TICKS));
}

function easeOutCubic(x) {
  const f = 1 - x;
  return 1 - f * f * f;
}

// Counts a whole number up to `end`, formatting the IN-FLIGHT value with
// `fmt` at every step — so a row like SCORE reads "$100", "$4,900",
// "$18,300"... on the way to "$42,200" rather than animating bare digits
// and pasting the $ and commas on only at the end.
function countTo(end, frac, fmt) {
  return fmt(Math.round(end * easeOutCubic(frac)));
}
const comma = (n) => n.toLocaleString();

export function statsFrom(log, score, distanceM) {
  const events = (log && log.events) || [];
  const n = (type) => events.filter((e) => e.type === type).length;
  return {
    score,
    stomps: n('stomp'),
    bags: n('bag'),
    champagne: n('champagne'),
    potholes: n('pothole'),
    robbed: n('bagLost'),
    continues: n('continue'),
    distanceM: Math.round(distanceM),
    ms: (log && log.durationMs) || 0,
  };
}

function clock(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function createEnding(ctx, canvas) {
  // `t` is ticks since the screen opened. `box` is where stillscene put the
  // painting, so everything drawn here lands on the image's own coordinates
  // whatever size the phone is.
  function draw(stats, t, box) {
    if (!box) return;
    const S = box.dw / SRC_W;                 // painting px -> screen px

    // ⚠️ THE ORDER IS HIS PLATE'S ORDER. These are values only — the labels
    // beside them are painted, so a row that lines up with the wrong label is
    // silent and total. Read them off the artwork, not off statsFrom. Each
    // entry is the row's REAL total plus how to print an in-flight count
    // toward it — see the readout note above.
    const rows = [
      { end: stats.bags,      fmt: (n) => String(n) },        // MONEY BAGS
      { end: stats.stomps,    fmt: (n) => String(n) },        // ENEMIES STOMPED
      { end: stats.champagne, fmt: (n) => String(n) },        // CHAMPAGNE
      { end: stats.potholes,  fmt: (n) => String(n) },        // POTHOLES HIT
      { end: stats.robbed,    fmt: (n) => String(n) },        // BAGS ROBBED
      { end: stats.distanceM, fmt: (n) => `${n}m` },          // DISTANCE
      { end: stats.ms,        fmt: (n) => clock(n) },         // TIME
      { end: stats.score,     fmt: (n) => `$${comma(n)}` },   // SCORE
    ];

    ctx.save();
    // Counted in a row at a time, so the board tallies itself up rather than
    // arriving finished. His labels are already there from the first frame,
    // which reads better than the old version did — the shape of the board
    // stands still and only the numbers arrive.
    const shown = rowsShown(t);
    ctx.font = `700 ${Math.max(7, Math.round(VALUE_PX * S))}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillStyle = VALUE_INK;
    for (let i = 0; i < shown; i++) {
      // Each row counts up on its OWN clock, started the tick it appeared —
      // not the screen's clock — so row 8 counts up exactly like row 1 did,
      // just later.
      const frac = Math.min(1, (t - i * REVEAL_TICKS) / COUNT_TICKS);
      const text = countTo(rows[i].end, frac, rows[i].fmt);
      ctx.fillText(text, box.dx + VALUE_X * S, box.dy + ROW_Y[i] * S);
    }
    ctx.restore();
  }

  void canvas;
  return { draw };
}
