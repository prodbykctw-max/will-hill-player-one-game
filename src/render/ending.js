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

// Loaded through main.js's one image manifest, like everything else.
//
// ⚠️ ONE IMAGE NOW, not three. The old ending was cut into base/crowd/hero so
// the crowd could sway (tools/cut_still.py). Those cards were cut from the
// LANDSCAPE plate and mean nothing on this one, so they are gone rather than
// left to rot as dead weight Vite would still bundle. The sway is a separate
// pass over the new painting — his call, "ship it flat first".
export const ENDING_IMAGES = {
  ending_base: endingBase,
};

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
    // silent and total. Read them off the artwork, not off statsFrom.
    const values = [
      String(stats.bags),                     // MONEY BAGS
      String(stats.stomps),                   // ENEMIES STOMPED
      String(stats.champagne),                // CHAMPAGNE
      String(stats.potholes),                 // POTHOLES HIT
      String(stats.robbed),                   // BAGS ROBBED
      `${stats.distanceM}m`,                  // DISTANCE
      clock(stats.ms),                        // TIME
      `$${stats.score.toLocaleString()}`,     // SCORE
    ];

    ctx.save();
    // Counted in a row at a time, so the board tallies itself up rather than
    // arriving finished. His labels are already there from the first frame,
    // which reads better than the old version did — the shape of the board
    // stands still and only the numbers arrive.
    const shown = Math.min(values.length, Math.floor(t / 7));
    ctx.font = `700 ${Math.max(7, Math.round(VALUE_PX * S))}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillStyle = VALUE_INK;
    for (let i = 0; i < shown; i++) {
      ctx.fillText(values[i], box.dx + VALUE_X * S, box.dy + ROW_Y[i] * S);
    }
    ctx.restore();
  }

  void canvas;
  return { draw };
}
