// THE ENDING SCREEN — the results board after Will Hill makes the show.
//
// IT IS THE CLIENT'S PAINTING, SHOWN WHOLE. Not a crop of it behind a panel
// of my own — the image carries its own title, its own flavour lines and its
// own PRESS START button, and all of that is used. Only two things are
// changed on it: the word ENDING becomes SHOWTIME, and the five placeholder
// stat rows become the run's real ones.
//
// THE LETTERING IS REPAINTED, NOT COVERED. "Mimic its style exactly" — so the
// four inks below were sampled straight out of the mockup's own ENDING
// lettering by brightness band, and SHOWTIME is drawn with the same
// highlight, face, shade and outline at the same size and baseline.
//
// THE STATS ARE THE RUN'S OWN NUMBERS. Every one is derived from the replay
// log the leaderboard already keeps (net/leaderboard.js) — the same event
// stream that validates a submitted score — so the board cannot drift from
// what actually happened and there is no second set of counters to keep in
// step. If a number appears here, it was recorded when the thing happened.
//
// THE ROWS ARE THIS GAME'S, NOT THE MOCKUP'S. The mockup lists ENEMIES
// DEFEATED / BOSSES DEFEATED / TIME / MAX COMBO / SCORE / RANK, which is the
// standard beat-em-up set. Will Hill has no bosses and no combo meter — he
// has money, stomps, potholes, champagne, and men who rob him — so those are
// the rows. A board reporting "BOSSES DEFEATED 0" every single run tells the
// player nothing except that the board was copied from somewhere else.

const HOT = '#ffc46b';
const PALE = '#f2ead8';
const DIM = 'rgba(242,234,216,0.62)';
const INK = 'rgba(10,8,14,0.86)';

// Rank thresholds, in dollars banked. Set against what a run actually pays:
// four stages of roughly 15 bags at BAG_VALUE 100 plus 50 a stomp puts a
// clean full clear near $9-10k, so S is a genuinely good run rather than
// participation. Penalties below make sure a continued, robbed run cannot
// out-rank a clean one on money alone.
const RANK_STEPS = [
  [9000, 'S', '#ff5f4a'],
  [6500, 'A', '#ffc46b'],
  [4500, 'B', '#9fe08f'],
  [2500, 'C', '#8fc7e0'],
  [0, 'D', '#b9b2a4'],
];

export function rankFor(score, stats) {
  // Continues and robberies dock you before the thresholds are read: a run
  // that took the continue and got robbed twice is not the same run as one
  // that did neither, even at the same money.
  const adjusted = score - stats.continues * 1500 - stats.robbed * 250;
  for (const [floor, letter, colour] of RANK_STEPS) {
    if (adjusted >= floor) return { letter, colour };
  }
  return { letter: 'D', colour: '#b9b2a4' };
}

// Count the run's events into the numbers the board shows.
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
  // ── THE MOCKUP'S OWN GEOMETRY, in its 1536x1024 pixels ──────────────────
  // Measured off the image, not estimated: the stat rows were found by
  // scanning the panel column for bands of gold ink, which came back at
  // y 355-373, 392-409, 428-446, 465-482 and 501-519 — a 36px pitch — with
  // RANK at 546-567. The wall behind them samples near-black, rgb(3,7,7) to
  // rgb(9,11,10), which is what the overwrite paints with.
  const SRC_W = 1536, SRC_H = 1024;
  // Generous, because the first pass at y 52 h 100 left the bottom of the
  // old ENDING glyphs showing through as a dashed gold line under SHOWTIME.
  // Measured against the ink: the lettering runs y 40..178.
  const TITLE = { x: 1022, y: 38, w: 420, h: 142 };
  const PANEL = { x: 1030, y: 336, w: 448, h: 250 };
  const ROW0 = 368, ROW_PITCH = 30;
  const LABEL_X = 1052, VALUE_X = 1452;

  const INK_HI = '#f5cd77';
  const INK_FACE = '#d9a752';
  const INK_SHADE = '#ac7831';
  const INK_LINE = '#080805';
  const WALL = '#07090a';

  // Draw a string in the mockup's title ink: black outline, shaded body, lit
  // top edge. Four passes, same order a pixel artist would lay them down.
  function titleInk(text, cx, baseline, px) {
    ctx.textAlign = 'center';
    ctx.font = `900 ${px}px system-ui, sans-serif`;
    const o = Math.max(2, Math.round(px * 0.075));
    ctx.fillStyle = INK_LINE;
    for (let dx = -o; dx <= o; dx++) {
      for (let dy = -o; dy <= o; dy++) {
        if (dx * dx + dy * dy > o * o) continue;
        ctx.fillText(text, cx + dx, baseline + dy);
      }
    }
    ctx.fillStyle = INK_SHADE;
    ctx.fillText(text, cx, baseline);
    ctx.fillStyle = INK_FACE;
    ctx.fillText(text, cx, baseline - Math.round(px * 0.035));
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - px * 4, baseline - px * 1.05, px * 8, px * 0.42);
    ctx.clip();
    ctx.fillStyle = INK_HI;
    ctx.fillText(text, cx, baseline - Math.round(px * 0.05));
    ctx.restore();
  }

  // `t` is ticks since the screen opened. `art` is the full painting; `box`
  // is where stillscene put it, so everything drawn here lands on the image's
  // own coordinates whatever size the phone is.
  function draw(stats, t, box) {
    if (!box) return;
    const S = box.dw / SRC_W;                 // painting px -> screen px
    const X = (v) => box.dx + v * S;
    const Y = (v) => box.dy + v * S;
    const P = (v) => v * S;

    ctx.save();

    // ── SHOWTIME, over ENDING, in ENDING's own ink.
    ctx.fillStyle = WALL;
    ctx.fillRect(X(TITLE.x) - 2, Y(TITLE.y) - 2, P(TITLE.w) + 4, P(TITLE.h) + 4);
    let px = Math.round(P(86));
    ctx.font = `900 ${px}px system-ui, sans-serif`;
    while (ctx.measureText('SHOWTIME').width > P(TITLE.w) * 0.98 && px > 8) {
      px -= 1;
      ctx.font = `900 ${px}px system-ui, sans-serif`;
    }
    titleInk('SHOWTIME', X(TITLE.x + TITLE.w / 2), Y(TITLE.y + TITLE.h * 0.86), px);

    // ── THE REAL ROWS, over the placeholder ones.
    ctx.fillStyle = WALL;
    ctx.fillRect(X(PANEL.x), Y(PANEL.y), P(PANEL.w), P(PANEL.h));

    const rows = [
      ['MONEY BAGS', String(stats.bags)],
      ['ENEMIES STOMPED', String(stats.stomps)],
      ['CHAMPAGNE', String(stats.champagne)],
      ['POTHOLES HIT', String(stats.potholes)],
      ['BAGS ROBBED', String(stats.robbed)],
      ['DISTANCE', `${stats.distanceM}m`],
      ['TIME', clock(stats.ms)],
    ];
    // Counted in a row at a time, so the board tallies itself up rather than
    // arriving finished.
    const shown = Math.min(rows.length, Math.floor(t / 7));
    const rpx = Math.max(7, Math.round(P(25)));
    ctx.font = `700 ${rpx}px system-ui, sans-serif`;
    for (let i = 0; i < shown; i++) {
      const ry = Y(ROW0 + i * ROW_PITCH);
      ctx.textAlign = 'left';
      ctx.fillStyle = INK_FACE;
      ctx.fillText(rows[i][0], X(LABEL_X), ry);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#f4ead6';
      ctx.fillText(rows[i][1], X(VALUE_X), ry);
    }

    if (t > rows.length * 7) {
      const ry = Y(ROW0 + rows.length * ROW_PITCH + 6);
      ctx.textAlign = 'left';
      ctx.fillStyle = INK_FACE;
      ctx.fillText('SCORE', X(LABEL_X), ry);
      ctx.textAlign = 'right';
      ctx.fillStyle = INK_HI;
      ctx.fillText(`$${stats.score.toLocaleString()}`, X(VALUE_X), ry);
    }
    if (t > rows.length * 7 + 12) {
      const r = rankFor(stats.score, stats);
      const ry = Y(ROW0 + (rows.length + 1) * ROW_PITCH + 16);
      ctx.textAlign = 'left';
      ctx.fillStyle = INK_FACE;
      ctx.font = `700 ${rpx}px system-ui, sans-serif`;
      ctx.fillText('RANK', X(LABEL_X), ry);
      // A pop as it lands — the rank is the number people screenshot.
      const pop = Math.max(0, 1 - (t - rows.length * 7 - 12) / 12);
      ctx.textAlign = 'right';
      ctx.fillStyle = r.colour;
      ctx.font = `900 ${Math.round(rpx * (1.7 + pop * 0.7))}px system-ui, sans-serif`;
      ctx.fillText(r.letter, X(VALUE_X), ry + P(8));
    }

    // NO PROMPT DRAWN. The painting has PRESS START TO CONTINUE on it
    // already, bottom right, and the client asked for that one to be used.
    ctx.restore();
  }

  return { draw };
}
