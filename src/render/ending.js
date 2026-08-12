// THE ENDING SCREEN — the results board after Will Hill makes the show.
//
// Modelled on the mockup the client supplied (assets/refs/ending-mockup.webp):
// a titled panel, a short line of flavour, a column of stats, and a rank.
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
  // `t` is ticks since the screen opened, so the board can build itself in
  // rather than appearing all at once.
  function draw(stats, t) {
    const w = canvas.width;
    const h = canvas.height;

    ctx.save();
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, w, h);

    const pad = Math.round(Math.min(w * 0.09, 42));
    let y = Math.round(h * 0.17);

    ctx.textAlign = 'center';
    // Title, fitted rather than fixed — same reason the stage title on the
    // MARTA screen is fitted: a hardcoded size that fits a 430px phone runs
    // off a 375px one.
    let size = 40;
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    while (ctx.measureText('SHOWTIME').width > w - pad * 2 && size > 22) {
      size -= 1;
      ctx.font = `700 ${size}px system-ui, sans-serif`;
    }
    ctx.fillStyle = HOT;
    ctx.fillText('SHOWTIME', w / 2, y);
    y += Math.round(size * 0.78);

    // FLAVOUR, and it is about THIS game. He has spent four stages crossing
    // Atlanta on MARTA to make a show at Criminal Records; that is the story
    // the last screen should close.
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillStyle = PALE;
    for (const line of ['HE MADE IT TO THE SHOW.',
                        'CRIMINAL RECORDS, LITTLE 5 POINTS.',
                        'THE CROWD IS ALREADY IN.']) {
      ctx.fillText(line, w / 2, y);
      y += 20;
    }
    y += 14;

    ctx.strokeStyle = 'rgba(255,196,107,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
    y += 26;

    // The rows, revealed one per 6 ticks so the board counts itself up.
    const rows = [
      ['MONEY BAGS', String(stats.bags)],
      ['ENEMIES STOMPED', String(stats.stomps)],
      ['CHAMPAGNE', String(stats.champagne)],
      ['POTHOLES HIT', String(stats.potholes)],
      ['BAGS ROBBED', String(stats.robbed)],
      ['DISTANCE', `${stats.distanceM}m`],
      ['TIME', clock(stats.ms)],
      ['CONTINUES', String(stats.continues)],
    ];
    const shown = Math.min(rows.length, Math.floor(t / 6));
    ctx.font = '600 14px system-ui, sans-serif';
    for (let i = 0; i < shown; i++) {
      ctx.textAlign = 'left';
      ctx.fillStyle = DIM;
      ctx.fillText(rows[i][0], pad, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = PALE;
      ctx.fillText(rows[i][1], w - pad, y);
      y += 23;
    }
    y += (rows.length - shown) * 23 + 10;

    // SCORE, then RANK, after the rows have all landed.
    if (t > rows.length * 6) {
      ctx.textAlign = 'left';
      ctx.fillStyle = DIM;
      ctx.font = '700 16px system-ui, sans-serif';
      ctx.fillText('SCORE', pad, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = HOT;
      ctx.font = '700 22px system-ui, sans-serif';
      ctx.fillText(`$${stats.score.toLocaleString()}`, w - pad, y);
      y += 40;
    }
    if (t > rows.length * 6 + 14) {
      const r = rankFor(stats.score, stats);
      ctx.textAlign = 'left';
      ctx.fillStyle = DIM;
      ctx.font = '700 16px system-ui, sans-serif';
      ctx.fillText('RANK', pad, y);
      ctx.textAlign = 'right';
      // A little pop on the rank as it lands, because it is the one number
      // anyone screenshots.
      const pop = Math.max(0, 1 - (t - rows.length * 6 - 14) / 12);
      ctx.fillStyle = r.colour;
      ctx.font = `700 ${Math.round(38 + pop * 16)}px system-ui, sans-serif`;
      ctx.fillText(r.letter, w - pad, y + 6);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText('press JUMP to play again', w / 2, h - 34);
    ctx.restore();
  }

  return { draw };
}
