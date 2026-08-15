// SHARE MY SCORE — his MARTA card, with your run written on it.
//
// Client: "social share of score/leaderboard position to Instagram/Facebook."
//
// THE PLATFORM REALITY THIS RESPECTS. Instagram has no web API for making a
// post, and Facebook's sharer takes a URL, not an image — no web page can
// post to either directly. What the web CAN do is the Web Share API with
// files: hand the OS a finished image and the native share sheet opens with
// everything the phone has — Instagram Stories/feed, Facebook, Messages, the
// lot. That IS "post my score to IG/FB" as far as a browser is permitted to
// take it, and it is the honest version rather than a button that pretends.
//
// THE CARD IS HIS OWN ART. The share image is the leaderboard MARTA card
// (852x1846 — near-exactly the 9:16 of an Instagram Story) with the player's
// run written into the same measured rows the on-screen board uses, and the
// game's URL at the foot so a screenshot of a screenshot still leads home.
//
// ⚠️ THE GESTURE RULE, learned the hard way with audio: navigator.share must
// run inside user activation, and Safari's window for that does not survive
// long async work. So the File is PRE-RENDERED when the board opens
// (panel.js calls prepareShareCard from fillBoard) and cached; by the time a
// thumb reaches the button the blob exists and share() is called with no
// meaningful await between tap and sheet.

import leaderboardCard from '../assets/backgrounds/leaderboard-card.webp';
import { lbName, localRuns, withWillHill } from '../net/leaderboard.js';

export const GAME_URL = 'https://prodbykctw-max.github.io/will-hill-player-one-game/';

// The card's measured geometry, as FRACTIONS of the artwork. These are the
// same numbers the live board uses — panel.js carries ROW_TOP and
// index.html's stylesheet carries the column fractions (rank 12.7%, name
// 28.6%, score right edge at 88.0%, YOUR RANK band at 79.5%). Three renderers
// read one measurement of one painting; if the card art is ever re-measured,
// change all three together.
const ROW_TOP = [0.5385, 0.5850, 0.6300, 0.6745, 0.7180];
const ROW_H = 0.044;            // of card WIDTH (the CSS is 4.4cqw)
const FONT_F = 0.040;           // row font, of card width — 4.0cqw
const YOU_TOP = 0.795;
const YOU_FONT_F = 0.044;
const COL_RANK = 0.127;
const COL_NAME = 0.286;
const COL_SCORE_R = 0.880;
const INK = '#cfcabf';
const GOLD = '#f0b429';         // rank one, and whoever is reading it
const MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

let cardImg = null;
function loadCard() {
  if (cardImg) return cardImg;
  cardImg = new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = leaderboardCard;
  });
  return cardImg;
}

// What goes on the card and into the share text.
//
// ⚠️ SHARING IS FOR ENTRANTS. Client: "once you're presented with entering
// the contest, you shouldn't be able to share your score until you enter the
// contest, and the score you share should basically be your name on the
// leaderboard with your score." Which is right on both counts — a shared
// card is an advert for the contest, so it should carry a real entrant's
// real board name, not an anonymous number from a device nobody can
// identify. The gate itself lives on the button (panel.js); this function
// is what makes the second half true, by naming the row from the
// registration rather than from whatever nickname is lying around.
function shareData() {
  const runs = localRuns();
  const best = runs.length ? runs.reduce((m, r) => (r.score > m.score ? r : m)) : null;
  const mine = best ? { name: lbName(), score: Number(best.score) || 0, me: true } : null;
  // Same composer the live board uses, so the card can never claim a
  // placing the board does not show.
  const rows = withWillHill(mine ? [mine] : []);
  const rank = mine ? rows.findIndex((r) => r.me) + 1 : 0;
  return { mine, rows, rank };
}

async function buildFile() {
  const im = await loadCard();
  const W = im.naturalWidth || 852;
  const H = im.naturalHeight || 1846;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d');
  c.drawImage(im, 0, 0, W, H);

  const { mine, rows, rank } = shareData();
  const px = Math.round(FONT_F * W);
  c.textBaseline = 'middle';
  c.shadowColor = 'rgba(0,0,0,0.55)';
  c.shadowOffsetY = Math.max(1, 0.0025 * W);

  rows.slice(0, ROW_TOP.length).forEach((r, i) => {
    const y = (ROW_TOP[i] + (ROW_H * W) / H / 2) * H;
    c.font = `700 ${px}px ${MONO}`;
    c.fillStyle = i === 0 || r.me ? GOLD : INK;
    c.textAlign = 'left';
    c.fillText(String(i + 1), COL_RANK * W, y);
    c.fillText(String(r.name || 'PLAYER ONE').slice(0, 16), COL_NAME * W, y);
    c.textAlign = 'right';
    c.fillText(Number(r.score || 0).toLocaleString(), COL_SCORE_R * W, y);
  });

  if (mine) {
    const py = Math.round(YOU_FONT_F * W);
    const y = (YOU_TOP + (ROW_H * W) / H / 2) * H;
    c.font = `700 ${py}px ${MONO}`;
    c.fillStyle = GOLD;
    c.textAlign = 'left';
    c.fillText(String(rank), COL_RANK * W, y);
    c.fillText(mine.name.slice(0, 16), COL_NAME * W, y);
    c.textAlign = 'right';
    c.fillText(mine.score.toLocaleString(), COL_SCORE_R * W, y);
  }

  // The way back, small and out of the artwork's way, above the bottom
  // stripes. A shared image travels further than the post it rode in on.
  c.shadowColor = 'rgba(0,0,0,0.7)';
  c.font = `700 ${Math.round(0.026 * W)}px ${MONO}`;
  c.fillStyle = 'rgba(242,234,216,0.92)';
  c.textAlign = 'center';
  c.fillText(GAME_URL.replace(/^https:\/\//, '').replace(/\/$/, ''), W / 2, 0.842 * H);

  const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
  if (!blob) throw new Error('toBlob failed');
  return new File([blob], 'will-hill-player-one-score.png', { type: 'image/png' });
}

function shareText() {
  const { mine, rank, rows } = shareData();
  if (!mine) return `WILL HILL: PLAYER ONE — run the streets of Atlanta. ${GAME_URL}`;
  // ⚠️ NO MORE "I TOOK THE TOP SPOT OFF WILL HILL." That line was true while
  // his 50,000 was pinned to the board and you had to pass it to reach rank
  // one. With the pin removed, rank one on an empty board is any score at
  // all, so the same sentence would have every first player claiming they
  // beat him — caught in the harness output, reading "took the TOP SPOT off
  // Will Hill himself with $777". Topping the board is only worth saying
  // when there is somebody under you.
  const brag = rank === 1 && rows.length > 1
    ? `I'm #1 on the board with $${mine.score.toLocaleString()}`
    : `I ran up $${mine.score.toLocaleString()}`;
  return `${brag} in WILL HILL: PLAYER ONE. Think you can beat me? ${GAME_URL}`;
}

// The cache prepareShareCard fills and shareScore spends. Rebuilt whenever
// the board is (re)shown, so a new best run gets a new card.
let cached = null;
export function prepareShareCard() {
  cached = buildFile().catch(() => null);
  return cached;
}

// Returns how it went, so the panel can word #boardNote:
//   'shared'     the OS sheet took it (or the user closed it — their call)
//   'text'       no file support; text + URL went to the sheet
//   'downloaded' desktop: PNG saved, text + URL on the clipboard
//   'failed'     none of the routes exist
export async function shareScore() {
  const text = shareText();
  // Cached and (in the normal flow) already resolved — fillBoard ran when
  // the board opened, seconds before any tap can land. One await of a
  // settled promise keeps Safari's user-activation alive.
  const file = cached ? await cached : null;

  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text, title: 'WILL HILL: PLAYER ONE' });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'shared'; // they closed the sheet
      // fall through — some engines lie about canShare
    }
  }
  if (navigator.share) {
    try {
      await navigator.share({ text, url: GAME_URL, title: 'WILL HILL: PLAYER ONE' });
      return 'text';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'shared';
    }
  }
  // Desktop: hand them the image and put the words on the clipboard.
  let got = false;
  if (file) {
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      got = true;
    } catch (_e) { /* keep trying the clipboard */ }
  }
  try {
    await navigator.clipboard.writeText(text);
    got = true;
  } catch (_e) { /* clipboard can be denied; the download may still have run */ }
  return got ? 'downloaded' : 'failed';
}
