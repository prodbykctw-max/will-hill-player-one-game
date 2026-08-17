// THE PANEL — leaderboard, contest sign-up, settings.
//
// Reached two ways: OPTIONS on the title card, and automatically at the end of
// a run. OPTIONS was painted into the client's title artwork and did nothing,
// which reads as a broken button; this is the job it now has.
//
// IT IS HTML, OVER THE CANVAS, AND THAT IS THE POINT. A canvas text field
// means hand-rolling a caret, selection and an on-screen keyboard, and it
// still gets none of what a real <input> gives you free on a phone: the
// numeric pad for a telephone number, the @ key for an address, autofill,
// paste, and the OS lifting the field above the keyboard. The sign-up form is
// the narrowest part of the contest funnel — every bit of friction there is an
// entrant lost.
//
// WHEN IT IS OPEN THE GAME IS PAUSED AND THE PADS ARE GONE, because the panel
// is not a screen the player can play through. `hidden` on the element is the
// only "closed" state, so there is no open-but-invisible variant to leak
// through onto the title card.

import {
  lbName, setLbName, contestRegistration, setContestRegistration,
  isRegistered, phoneDigits, lbTop, localRuns, withWillHill, flushPendingRun,
} from '../net/leaderboard.js';
// Through the bundler, so the URL is the content-hashed one. A literal path in
// the stylesheet resolves in dev and 404s in dist.
// The settings note tells the player what time it is in Atlanta right now —
// one function, from the module that owns the rule, rather than a second
// copy of the timezone maths living in the interface layer.
import { atlantaHour } from '../world/stages.js';
import leaderboardCard from '../assets/backgrounds/leaderboard-card.webp';
// ⚠️ THE CLIENT'S ARTWORK IS THE SCREEN. Two painted layers, cut by
// tools/cut_cabinet.py: the MARTA housing with its screen emptied, and his
// painted OPTIONS panel that lays into the opening. The painted buttons are
// made live by transparent hit targets — nothing here draws a control.
// Imported for the same reason the card above is: a literal path 404s under
// the Pages subpath.
import cabinetPlate from '../assets/ui/cabinet.webp';
// The sign-up screen is his too, and it is a WHOLE cabinet rather than a
// panel that drops into one — housing, marquee, coin column and all. It also
// has its own aspect ratio, 1086x1448 against the other two at 852x1846, so
// #panelCard.cabinet-entry overrides both the plate and the sizing.
import entryPlate from '../assets/ui/contest-entry.webp';
import panelOptionsPlate from '../assets/ui/panel-options.webp';
import panelSettingsPlate from '../assets/ui/panel-settings.webp';
import pillOn from '../assets/ui/pill-on.webp';
import pillOff from '../assets/ui/pill-off.webp';
import todAtl from '../assets/ui/tod-atl.webp';
import todDay from '../assets/ui/tod-day.webp';
import todNight from '../assets/ui/tod-night.webp';
import todLocal from '../assets/ui/tod-local.webp';

// His four TIME OF DAY boxes, keyed by the <select> value they belong to.
const TOD_PLATE = { atl: todAtl, day: todDay, night: todNight, local: todLocal };
// HOW TO PLAY, in real frames from the running game — see
// tools/shoot_howto.mjs. Imported rather than written into index.html for the
// same reason the card above is: the bundler content-hashes these, and a
// literal path resolves in dev and 404s under the Pages subpath.
import howPotholeBad from '../assets/howto/pothole-bad.webp';
import howPotholeGood from '../assets/howto/pothole-good.webp';
import howManholeBad from '../assets/howto/manhole-bad.webp';
import howManholeGood from '../assets/howto/manhole-good.webp';
import howNinjaBad from '../assets/howto/ninja-bad.webp';
import howNinjaGood from '../assets/howto/ninja-good.webp';
// The champagne lesson is a real ✕/✓ pair now — the ✓ shot with the aura lit
// so the bags are visibly grown and blue, which the old lone `money` frame
// never showed. tools/shoot_howto.mjs refuses to write the pair unless the ✓
// frame measures bluer AT THE BAGS than the ✕.
import howChampagneBad from '../assets/howto/champagne-bad.webp';
import howChampagneGood from '../assets/howto/champagne-good.webp';

const HOW_SHOTS = {
  'pothole-bad': howPotholeBad, 'pothole-good': howPotholeGood,
  'manhole-bad': howManholeBad, 'manhole-good': howManholeGood,
  'ninja-bad': howNinjaBad, 'ninja-good': howNinjaGood,
  'champagne-bad': howChampagneBad, 'champagne-good': howChampagneGood,
};
import { prepareShareCard, shareScore } from './share.js';

const $ = (id) => document.getElementById(id);

// ALL THREE FIELDS ARE REQUIRED. An earlier pass made only the phone
// mandatory on the reasoning that every required field costs entrants — true
// in general, and wrong for this form. This is a contest entry, not a
// newsletter: a name is what goes ON the board, and one contact route with no
// backup means a winner with a dead number cannot be reached at all. The
// client asked for all three, and for the form to say so.
//
// Each check returns which FIELD failed as well as why, so the offending box
// can be outlined and focused instead of the player hunting for it.
//
// ⚠️ KEEP THESE UNDER ~34 CHARACTERS. On his cabinet the message has to fit
// inside the card he painted, which is 367 plate px wide — about nineteen
// characters a line at the size that stays legible on a phone. The old
// fifty-character phone message ran to three lines and covered his NAME
// label to say something about the PHONE field. Two lines is the budget.
function nameProblem(v) {
  const s = String(v || '').trim();
  if (!s) return 'Pick the name for the board.';
  if (s.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return 'That name is too short.';
  return null;
}

// A US ten-digit number, which is what a contest run out of Atlanta needs.
function phoneProblem(v) {
  const d = phoneDigits(v);
  if (!d) return 'A phone is how we reach you.';
  if (d.length < 10) return 'Too short — 10 digits please.';
  if (d.length > 11) return 'Too long — 10 digits please.';
  return null;
}

// Loose on purpose. Anything with an @ and a dot after it is worth keeping;
// bouncing somebody out of a contest over a strict pattern is a worse outcome
// than storing an address that turns out to be wrong.
function emailProblem(v) {
  const s = String(v || '').trim();
  if (!s) return 'An email is the backup contact.';
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? null : 'That is not an email address.';
}

export function createPanel({ onClose, onTimeOfDayChange, onSoundChange,
  onSfxChange, onHapticsChange, haptics, audio, isPendingRun }) {
  const el = $('panel');
  if (!el) return { open() {}, close() {}, get isOpen() { return false; } };

  // EVERY BUTTON IN HERE MAKES A NOISE AND A TICK, and the three shapes say
  // three different things — see the note on the cues in audio/audio.js.
  // Wired as one wrapper per button rather than a `click` listener on the card
  // that guesses from the target: the panel also contains a checkbox, a
  // select and three text fields, and a blanket handler would click at every
  // keystroke and every tap into a field.
  const feedback = {
    press: () => { audio?.click(); haptics?.tap(); },
    commit: () => { audio?.confirm(); haptics?.confirm(); },
    back: () => { audio?.back(); haptics?.tap(); },
  };
  const on = (id, cue, fn) => $(id)?.addEventListener('click', () => {
    feedback[cue]();
    fn();
  });

  const card = $('lbCard');
  if (card) card.style.backgroundImage = `url(${leaderboardCard})`;
  // ⚠️ A CUSTOM PROPERTY, NOT `style.backgroundImage`. Setting the image
  // directly would paint the cabinet behind EVERY view: an inline style beats
  // any stylesheet rule, so `#panelCard`'s own dark plate could never win it
  // back. Only the `.cabinet` rule reads this variable, so the class stays
  // the single thing that decides whether the housing shows — and the URL is
  // assigned once, so switching views never re-decodes it.
  const panelCard = $('panelCard');
  if (panelCard) {
    panelCard.style.setProperty('--cabinet-plate', `url(${cabinetPlate})`);
    panelCard.style.setProperty('--entry-plate', `url(${entryPlate})`);
    panelCard.style.setProperty('--panel-options', `url(${panelOptionsPlate})`);
    panelCard.style.setProperty('--panel-settings', `url(${panelSettingsPlate})`);
    panelCard.style.setProperty('--pill-on', `url(${pillOn})`);
    panelCard.style.setProperty('--pill-off', `url(${pillOff})`);
  }
  const views = { menu: $('pvMenu'), board: $('pvBoard'), how: $('pvHow'),
    form: $('pvForm'), settings: $('pvSettings') };
  const title = $('panelTitle');
  let open = false;

  function show(view) {
    for (const [k, v] of Object.entries(views)) if (v) v.hidden = k !== view;
    // ── THE BOARD IS THE TICKET, NOT A TICKET INSIDE A BOX ───────────────
    //
    // Client, marking up a screenshot in yellow all the way round the panel:
    // "that's a piece of art. I want it basically to fill out that whole area
    // as much as you can... I don't need it to be like leaderboard inside of
    // an empty space inside of a square, I need that whole area to be the
    // leaderboard."
    //
    // Measured on his 430px phone, the ticket was 259px wide inside a 384px
    // content box, because the panel spent its height on a title, a note and
    // a BACK button and then sized the artwork with what was left. This class
    // strips the panel back to nothing on the board view — no padding, no
    // plate, no border, no external heading — so the artwork gets the whole
    // frame. Every other view keeps the panel it has always had.
    $('panelCard').classList.toggle('bare', view === 'board');
    // ── OPTIONS IS THE MARTA CABINET ─────────────────────────────────────
    //
    // Only OPTIONS, for now. It is the one screen with NO STATE — four
    // painted buttons and a painted ✕, nothing that has to show on/off — so
    // his painting works as-is and every visible pixel is his.
    //
    // SETTINGS joins it once he delivers the pieces a painting cannot carry:
    // the switch in its OFF state, and the TIME OF DAY box in its other three
    // values. He asked to draw those himself rather than have them
    // composited — "I CAN LITERALLY EDIT THE IMAGE TO EXACTLY AS NEEDED" —
    // and tools/cut_cabinet.py already cuts panel-settings.webp with those
    // four sockets blanked, ready for them. Until then SETTINGS keeps the
    // plain panel, because a cabinet whose switches are invisible is worse
    // than one that has not arrived.
    //
    // THE SIGN-UP FORM IS A CABINET TOO, and a whole one — he drew ENTER
    // CONTEST as its own machine, marquee to coin slot, and asked for it
    // outright: "I want you to activate these buttons so I can use this as my
    // contest sign up page." His painted fields are the fields, his SAVE &
    // ENTER is the button, his CANCEL and his red X both mean not now.
    //
    // ⚠️ IT IS FITTED, NOT COVERED, and that is his call: "fit the whole
    // cabinet, don't crop my art." The other two plates are 852x1846 — his
    // phone's own shape — so growing them past the screen loses nothing.
    // This one is 1086x1448, and covering a 430x932 screen with a 3:4 plate
    // throws away about 210 plate pixels off each side: the A-E buttons, the
    // coin column, and the right edge of the LEADERBOARD panel.
    //
    // The board keeps his breeze card, and HOW TO PLAY keeps the plain panel:
    // a four-page swipe pager inside a cabinet opening either scrolls within a
    // scroller or shrinks the pictures to nothing.
    const inCabinet = view === 'menu' || view === 'settings' || view === 'form';
    $('panelCard').classList.toggle('cabinet', inCabinet);
    $('panelCard').classList.toggle('cabinet-menu', view === 'menu');
    $('panelCard').classList.toggle('cabinet-settings', view === 'settings');
    $('panelCard').classList.toggle('cabinet-entry', view === 'form');
    if (view !== 'form') $('panelCard').classList.remove('typing');
    // The cabinet is full-bleed, so the SCROLLER has to stop padding and
    // start clipping. On the element rather than the card, because it is the
    // container's own padding and overflow that leave the gap.
    el.classList.toggle('cabinetView', inCabinet);
    title.hidden = view === 'board';   // the ticket is lettered LEADERBOARD
    title.textContent = view === 'form' ? 'ENTER THE CONTEST'
      : view === 'settings' ? 'SETTINGS'
        : view === 'menu' ? 'OPTIONS'
          : view === 'how' ? 'HOW TO PLAY' : 'LEADERBOARD';
    if (view === 'how') fillHow();
    if (view === 'board') fillBoard();
    if (view === 'form') fillForm();
    if (view === 'settings') fillSettings();
  }

  // ── the board, laid over his MARTA card ───────────────────────────────
  //
  // The card carries five rows and a YOUR RANK line, so that is what the board
  // shows — his design decides the shape, not the other way round. It used to
  // list twenty; the rest are one tap away in the run log and nobody reads
  // past five on a phone anyway.
  //
  // Row TOPS are fractions of the card, measured off the artwork and matching
  // the bands its placeholder rows were blanked out of. Positioning each `li`
  // absolutely means a name too long to fit ellipsises inside its own row
  // instead of pushing the ones below it off their measured line.
  const ROW_TOP = [0.5385, 0.5850, 0.6300, 0.6745, 0.7180];

  function render(runs, note) {
    const ol = $('board');
    ol.innerHTML = '';
    const me = lbName().toLowerCase();
    const top = runs.slice(0, ROW_TOP.length);
    top.forEach((r, i) => {
      const li = document.createElement('li');
      li.style.top = `${ROW_TOP[i] * 100}%`;
      if (r.me || String(r.name || '').toLowerCase() === me) li.className = 'me';
      const rank = document.createElement('span');
      rank.className = 'r';
      rank.textContent = String(i + 1);
      const name = document.createElement('span');
      name.className = 'n';
      name.textContent = r.name || 'PLAYER ONE';   // textContent, never innerHTML
      const score = document.createElement('span');
      score.className = 's';
      score.textContent = Number(r.score || 0).toLocaleString();
      li.append(rank, name, score);
      ol.append(li);
    });

    // YOUR RANK. Where the player actually placed, even if that is well below
    // the five on show — which is the whole reason his card has the line.
    const you = $('lbYou');
    const mine = runs.findIndex((r) => r.me || String(r.name || '').toLowerCase() === me);
    if (mine >= 0) {
      const r = runs[mine];
      you.querySelector('.r').textContent = String(mine + 1);
      you.querySelector('.n').textContent = r.name || 'PLAYER ONE';
      you.querySelector('.s').textContent = Number(r.score || 0).toLocaleString();
      you.hidden = false;
    } else {
      you.hidden = true;
    }

    const empty = $('lbEmpty');
    empty.hidden = !!runs.length;
    if (!runs.length) empty.textContent = 'NO RUNS YET. BE THE FIRST.';

    $('boardNote').textContent = note;
    // ⚠️ GONE ONCE YOU ARE IN, NOT RELABELLED. Client: "you can sign up for
    // the contest there if you're not already signed up — if you are already
    // signed up the button wouldn't appear." It used to turn into EDIT MY
    // DETAILS, which is a second thing to read and a row of height the card
    // needs (see #lbCard).
    // ── ONE BUTTON, AND WHICH ONE DEPENDS ON WHETHER YOU ARE IN ──────────
    //
    // Client: "you can sign up for the contest there if you're not already
    // signed up — if you are already signed up the button wouldn't appear",
    // and "you shouldn't be able to share your score until you enter the
    // contest." Together those make ENTER and SHARE mutually exclusive, which
    // is also what lets both live ON the card: there is only ever one of them
    // to place, so it gets the full width of the band.
    $('btnRegister').hidden = isRegistered();
    $('btnRegister').textContent = 'ENTER THE CONTEST';
    $('btnShare').hidden = !isRegistered();
  }

  // Assign once and leave them; the browser caches the decode, so reopening
  // the page is free.
  let howFilled = false;
  function fillHow() {
    // Every open starts on lesson one. 'auto', not smooth — this is a reset,
    // not a scroll the player should watch happen.
    const pager = $('howPager');
    if (pager) pager.scrollTo({ left: 0, behavior: 'auto' });
    syncHowDots();
    if (howFilled) return;
    for (const img of document.querySelectorAll('#howPager .howShot')) {
      const src = HOW_SHOTS[img.dataset.shot];
      if (src) img.src = src;
    }
    howFilled = true;
  }

  // Which page is under the viewport, from scroll position — the dots are
  // derived state, never separately tracked, so they cannot drift.
  function howPage() {
    const pager = $('howPager');
    if (!pager || pager.clientWidth === 0) return 0;
    return Math.max(0, Math.min(3, Math.round(pager.scrollLeft / pager.clientWidth)));
  }

  function syncHowDots() {
    const dots = document.querySelectorAll('#howDots i');
    const cur = howPage();
    dots.forEach((d, i) => d.classList.toggle('on', i === cur));
  }

  $('howPager')?.addEventListener('scroll', syncHowDots, { passive: true });
  // A tap in the outer fifths pages — for desktops, and for anyone who does
  // not think to swipe. The middle stays inert so the pictures can be looked
  // at without the page jumping.
  $('howPager')?.addEventListener('click', (e) => {
    const pager = $('howPager');
    const x = (e.clientX - pager.getBoundingClientRect().left) / pager.clientWidth;
    const cur = howPage();
    const next = x < 0.2 ? cur - 1 : x > 0.8 ? cur + 1 : cur;
    if (next === cur || next < 0 || next > 3) return;
    feedback.press();
    pager.scrollTo({ left: next * pager.clientWidth, behavior: 'smooth' });
  });

  function fillBoard() {
    // The share card is drawn NOW, while the board is opening, so the File
    // already exists when the thumb reaches SHARE — navigator.share has to
    // run inside the tap's user activation and Safari will not wait around
    // for a canvas render. See the gesture note in ui/share.js.
    prepareShareCard();
    // ── UNTIL THE CONTEST IS LIVE, THE BOARD IS WILL HILL AND FOUR EMPTY
    //    SLOTS ──────────────────────────────────────────────────────────
    //
    // Client: "all the other slots empty, until live."
    //
    // It used to fall back to this device's own runs, which was the right call
    // when the board had no art of its own — better than "could not load".
    // On his card it is the wrong one twice over: those runs are not RANKED
    // against anybody, so putting them in slots 2-5 states a placing that does
    // not exist, and a board full of one person's practice runs is not what
    // this screen is for.
    //
    // The runs are still banked (bankLocalRun is untouched) and the player's
    // best is still told to them — in the note, where it can say what it
    // actually is rather than pretending to be a rank.
    const local = localRuns();
    const best = local.reduce((m, r) => Math.max(m, Number(r.score) || 0), 0);
    // ⚠️ NOTHING HERE SAYS "NOT LIVE YET". Client: anything that "speaks
    // about the game as if it's not live already" comes out. These two lines
    // are the only copy in the whole game that did — and they are the
    // FALLBACK shown when the Worker returns nothing, which is also what a
    // dropped connection looks like, so announcing a launch date was wrong in
    // that case too. They now say what is actually true: no scores came back.
    const waiting = best
      ? `Your best on this device: ${best.toLocaleString()}.`
      : 'No scores to show yet.';

    render(withWillHill([]), 'Loading…');
    lbTop(20, (runs) => {
      if (!open) return;
      if (runs && runs.length) {
        render(withWillHill(runs), isRegistered() ? 'You are entered in the contest.'
          : 'Enter the contest to get your score on this board.');
      } else {
        // The Worker is not deployed, or the phone is offline. Either way
        // there is no ranking to show, so the slots stay empty and the note
        // says why.
        render(withWillHill([]), waiting);
      }
    });
  }

  // ── the form ──────────────────────────────────────────────────────────
  function fillForm() {
    const reg = contestRegistration() || {};
    const n = $('fName');
    // ⚠️ CLEAR `bad` TOO. Setting .value does not fire `input`, so the
    // listener that strips this class never runs — a refused entry, then NOT
    // NOW, then re-opening left a field still flagged with no message beside
    // it saying why. In the plain panel that was a one-pixel tint; in the
    // cabinet it is a red field sitting on his artwork.
    for (const id of ['fName', 'fPhone', 'fEmail']) $(id).classList.remove('bad');
    n.value = lbName() === 'PLAYER ONE' ? '' : lbName();
    $('fPhone').value = reg.phone || '';
    $('fEmail').value = reg.email || '';
    $('formErr').hidden = true;
  }

  function save() {
    const err = $('formErr');
    // Checked in the order they are read, so the message and the outline
    // always point at the FIRST thing wrong rather than the last.
    const checks = [
      ['fName', nameProblem($('fName').value)],
      ['fPhone', phoneProblem($('fPhone').value)],
      ['fEmail', emailProblem($('fEmail').value)],
    ];
    for (const [id] of checks) $(id).classList.remove('bad');
    const bad = checks.find(([, problem]) => problem);
    if (bad) {
      const [id, problem] = bad;
      err.textContent = problem;
      err.hidden = false;
      $(id).classList.add('bad');
      $(id).focus();
      // The descending pair, not the triad. On a phone the keyboard is over
      // the error line at exactly this moment, so the sound is often the only
      // thing the player gets — it has to be the one that means "no".
      feedback.back();
      return;
    }
    setLbName($('fName').value);
    setContestRegistration({ phone: $('fPhone').value, email: $('fEmail').value });
    // ⚠️ AND SEND THE RUN THEY JUST PLAYED. Client: "when they enter after the
    // run, I just wanna make sure that that run is actually added." It was not
    // — the submit fires at the moment of death, before this form has even
    // been offered, and used to be dropped outright when nobody was
    // registered. leaderboard.js parks it instead; this is where it goes.
    flushPendingRun();
    feedback.commit();
    // The field keeps focus through the tap now (see the mousedown handlers),
    // so drop it here or the cabinet stays lifted on the way to the board and
    // the phone keeps its keyboard up over a screen with no fields on it.
    document.activeElement?.blur?.();
    show('board');
  }

  // ── settings ──────────────────────────────────────────────────────────
  function fillSettings() {
    // 'atl' is the default for everyone who has never chosen — see the select
    // in index.html and timeOfDay() in world/stages.js. 'auto' is the old
    // stored value for "match my clock"; it maps to 'local' so anybody who
    // set it before this change keeps what they picked.
    let tod = 'atl';
    let snd = true;
    let sfx = true;
    try {
      const stored = localStorage.getItem('wh_tod');
      tod = stored === 'auto' ? 'local' : (stored || 'atl');
      snd = localStorage.getItem('wh_sound') !== 'off';
      sfx = localStorage.getItem('wh_sfx') !== 'off';
    } catch (_e) {}
    $('sTod').value = tod;
    $('sSound').checked = snd;
    const sx = $('sSfx');
    if (sx) sx.checked = sfx;
    const h = $('sHaptics');
    if (h) {
      h.checked = haptics ? haptics.isEnabled() : true;
      // A switch that cannot do anything should say so rather than sit there
      // being flipped. Desktop has no vibration motor; iOS below 17.4 has no
      // route to one at all.
      const sup = haptics ? haptics.support() : 'none';
      h.disabled = sup === 'none';
      const note = $('hapticsNote');
      if (note) {
        note.textContent = sup === 'none'
          ? 'This device has no vibration for the browser to use.'
          : (sup === 'ios-switch'
            ? 'Uses the iPhone’s Taptic Engine. Needs iOS 17.4 or newer.'
            : '');
        note.hidden = !note.textContent;
      }
    }
    // The Atlanta line names the hour it is THERE, so a player in Sydney can
    // see why their streets are dark at lunchtime instead of thinking the
    // setting is broken.
    let note;
    if (tod === 'day') note = 'Always daytime streets.';
    else if (tod === 'night') note = 'Always night streets.';
    else if (tod === 'local') {
      note = 'The stages match the clock on your phone — night streets after 7pm.';
    } else {
      const h = atlantaHour();
      const hh = h % 12 === 0 ? 12 : h % 12;
      note = `The stages run on Atlanta time — it is ${hh}${h < 12 ? 'am' : 'pm'} there `
        + 'right now. Night streets after 7pm Eastern, wherever you are.';
    }
    $('todNote').textContent = note;
    paintTod(tod);
  }

  // Swap the <select>'s background to HIS box for the chosen value. Set on
  // the card rather than the select so it lives with the other plate vars,
  // and so a value with no artwork simply shows nothing rather than the
  // previous value's words.
  function paintTod(v) {
    const card = $('panelCard');
    if (!card) return;
    const url = TOD_PLATE[v];
    card.style.setProperty('--tod-value', url ? `url(${url})` : 'none');
  }

  // ── wiring ────────────────────────────────────────────────────────────
  //
  // ONE LEVEL OF BACK PER VIEW, AND EVERY VIEW HAS ONE. Client: "when I'm
  // done the leaderboard, I need to be able to go back one level, and then
  // from there back another level... how can I get out of options? How can
  // I get out of the leaderboard?" The board is the panel's home view
  // (OPTIONS opens straight to it), so its "back" is the panel itself
  // closing — same destination as ✕, same 'back' cue, just a second,
  // thumb-reachable way to reach it instead of only the corner icon. Form
  // and settings both already stepped back to the board; this is what was
  // missing from the board's own step, not a new idea.
  on('panelClose', 'back', () => api.close());
  // OPTIONS is the shelf; every other view steps back to it, and it is the
  // one place BACK TO GAME lives.
  on('btnMenuBoard', 'press', () => show('board'));
  on('btnMenuHow', 'press', () => show('how'));
  on('btnMenuSettings', 'press', () => show('settings'));
  on('btnMenuClose', 'back', () => api.close());
  on('btnHowBack', 'back', () => show('menu'));
  on('btnBoardBack', 'back', () => show('menu'));
  on('btnRegister', 'press', () => show('form'));
  // SHARE decides its own note copy, because the same tap means different
  // things on different machines: a phone opens the OS sheet (nothing to
  // say), a desktop silently saves the card and copies the caption — which
  // NEEDS saying, or the button looks like it did nothing.
  // ⚠️ SHARE IS GATED ON ENTERING. Client: "you shouldn't be able to share
  // your score until you enter the contest." An unregistered tap is not a
  // dead end though — it goes where it was always going to have to go.
  on('btnShare', 'press', async () => {
    if (!isRegistered()) {
      show('form');
      return;
    }
    // ⚠️ THE BUTTON SAYS WHAT IT IS DOING, because for a measured ~4 seconds
    // on a loaded phone it is doing something invisible: encoding the
    // 852x1846 card to a ~2.5MB PNG. share.mjs proved a silent button here
    // reads as a dead one — the harness itself once declared the whole
    // feature broken over exactly this window. Disabled too, so a second
    // impatient tap cannot start a second encode over the first.
    const btn = $('btnShare');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'MAKING YOUR CARD…';
    let how;
    try {
      how = await shareScore();
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
    if (how === 'downloaded') {
      $('boardNote').textContent = 'Card saved and caption copied — post it anywhere.';
    } else if (how === 'text') {
      $('boardNote').textContent = 'Shared the challenge — the card needs a newer phone.';
    } else if (how === 'failed') {
      $('boardNote').textContent = 'This browser refused every share route.';
    }
  });
  on('btnBack', 'back', () => show('menu'));
  // NOT NOW steps back to the board normally — but when a run is queued
  // behind this form (the pre-run offer), the way on is OUT, not deeper in.
  // isPendingRun is supplied by main.js, the same way onClose is.
  const notNow = () => (isPendingRun && isPendingRun() ? api.close() : show('board'));
  on('btnSkip', 'back', notNow);
  // He painted TWO ways out of the sign-up cabinet — the CANCEL plate and the
  // red X beside it — so both are wired, to the same thing NOT NOW does. The
  // small x at the top of his card is #panelClose and closes the panel
  // outright, which is what a x on a dialog means everywhere else.
  on('btnFormX', 'back', notNow);
  on('btnFormBoard', 'press', () => show('board'));
  on('btnFormRules', 'press', () => show('how'));
  // Pass 3 of his artwork added a CONTEST INFO column beside the screen —
  // "See rules, prizes and full details" — which is the same room RULES &
  // PRIZES opens. He drew two doors; both work.
  on('btnFormInfo', 'press', () => show('how'));
  // ⚠️ DO NOT LET A TAP MOVE THE CABINET OUT FROM UNDER THE THUMB.
  // The machine slides up 12% while a field has focus. Tapping SAVE blurs the
  // field, which drops the class, which starts a 180ms slide — and a real
  // thumb is still on the way down. Measured: ~100px of travel against a
  // 97px-tall button, so the click lands on the plate and nothing happens.
  // Playwright's 10-20ms press never reproduces it, which is exactly why this
  // needed reasoning rather than a green harness. Preventing the default on
  // mousedown stops the blur without touching click synthesis.
  for (const id of ['btnSave', 'btnSkip', 'btnFormX', 'btnFormBoard',
    'btnFormRules', 'btnFormInfo', 'panelClose']) {
    $(id)?.addEventListener('mousedown', (e) => e.preventDefault());
  }
  // SAVE decides its own cue, because it has two outcomes. A rejected form
  // that played the happy triad would be lying to you, and on a phone — where
  // the keyboard is covering the error line — the sound may be the first thing
  // you notice. See save().
  $('btnSave')?.addEventListener('click', save);
  // Enter on the last field submits, the way a form should.
  for (const id of ['fName', 'fPhone', 'fEmail']) {
    $(id).addEventListener('input', () => {
      $(id).classList.remove('bad');
      $('formErr').hidden = true;
    });
    // ── LIFT THE CABINET WHILE THE KEYBOARD IS UP ────────────────────────
    // The cabinet is FITTED, so it is centred in the screen with space above
    // and below — and #panel.cabinetView clips instead of scrolling, so the
    // browser cannot nudge a covered field into view the way it would on an
    // ordinary page. Focusing a field slides the whole machine up by 14% of
    // its own height, which puts SAVE & ENTER clear of an iPhone keyboard
    // (~340px of a 932px screen) and puts it straight back on blur.
    $(id).addEventListener('focus', () => $('panelCard').classList.add('typing'));
    $(id).addEventListener('blur', () => $('panelCard').classList.remove('typing'));
  }
  $('fEmail').addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  $('fPhone').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('fEmail').focus(); });
  $('fName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('fPhone').focus(); });

  $('sSound').addEventListener('change', (e) => {
    const v = e.target.checked;
    try { localStorage.setItem('wh_sound', v ? 'on' : 'off'); } catch (_e) {}
    onSoundChange?.(v);
    // Only on the way ON, and after the mute has lifted — a click confirming
    // that you just turned the sound off would be a contradiction, and it
    // would not play anyway.
    if (v) feedback.press();
  });
  // SFX is its own switch for the same reason MUSIC is — see setSfxEnabled.
  // Ticking it ON clicks, which is the only honest way to show what it does;
  // ticking it OFF cannot click, because it has just turned the click off.
  $('sSfx')?.addEventListener('change', (e) => {
    const v = e.target.checked;
    setSfxEnabled(v);
    onSfxChange?.(v);
    if (v) feedback.press();
  });
  // HAPTICS ARE THEIR OWN SWITCH, not a rider on SOUND. They are the setting
  // that matters most to the person who plays with the sound off, which is
  // most people at a party — turning the volume down should not also take the
  // feel of the buttons away. Toggling it ON ticks, which is the only honest
  // way to show what the setting does.
  $('sHaptics')?.addEventListener('change', (e) => {
    onHapticsChange?.(e.target.checked);
    if (e.target.checked) haptics?.tap();
  });
  $('sTod').addEventListener('change', (e) => {
    // Repaint first, so the box reads as the new value while the plates for
    // the other half of the day are still decoding.
    paintTod(e.target.value);
    try { localStorage.setItem('wh_tod', e.target.value); } catch (_e) {}
    // The handler returns FALSE only mid-run, where switching the world under
    // a live run would be worse than waiting. Otherwise it returns a promise
    // that resolves once the other half's plates have decoded and been swapped
    // in — nothing reloads, the music does not stop, and this panel stays
    // open on this pane, so the note is the only thing that moves.
    const applied = onTimeOfDayChange?.(e.target.value);
    if (applied === false) {
      $('todNote').textContent =
        'Applies when this run ends — finish the stage or go back to the title.';
      return;
    }
    $('todNote').textContent = 'Switching…';
    Promise.resolve(applied).then((ok) => {
      // fillSettings writes the real note for the chosen mode — including the
      // hour it currently is in Atlanta, which is the whole point of the
      // default. Re-running it is how the note goes back to being true.
      if (ok !== false) fillSettings();
      else $('todNote').textContent = 'That one could not load — still on the previous look.';
    });
  });

  // Tapping the dimmed area behind the card closes it. Not the card itself,
  // or every mis-tap while typing would throw the form away.
  el.addEventListener('pointerdown', (e) => {
    if (e.target !== el) return;
    feedback.back();
    api.close();
  });
  window.addEventListener('keydown', (e) => {
    if (!open || e.key !== 'Escape') return;
    feedback.back();
    api.close();
  });

  const api = {
    get isOpen() { return open; },
    open(view = 'board') {
      open = true;
      el.hidden = false;
      show(view);
    },
    close() {
      if (!open) return;
      open = false;
      el.hidden = true;
      onClose?.();
    },
  };
  return api;
}

// Read once at boot, before the stage table resolves. `?tod=` still wins over
// this, so a link can force one regardless of what the player has chosen.
export function savedTimeOfDay() {
  try {
    const v = localStorage.getItem('wh_tod');
    return v === 'day' || v === 'night' ? v : null;
  } catch (_e) {
    return null;
  }
}

// The title card's MUSIC box writes through here, so the checkbox and the
// OPTIONS toggle are the same setting and cannot drift apart.
//
// ⚠️ `wh_sound` IS THE MUSIC, NOT THE WHOLE SOUND. It used to be one master
// switch over everything. The client wanted them apart on the pause menu —
// "checkboxes, no slider" — and they are genuinely different things: most
// people at a party play with the song off, and taking the song away should
// not also take the thump that tells you a stomp landed. The KEY is left
// alone deliberately: renaming it would silently reset the preference of
// everyone who has already played.
export function setSoundEnabled(on) {
  try { localStorage.setItem('wh_sound', on ? 'on' : 'off'); } catch (_e) {}
}

// ⚠️ MUSIC DEFAULTS **OFF**, AND THAT IS THE POINT — `=== 'on'`, not
// `!== 'off'`. Client: "I want the music button off, and for it to
// acknowledge you clicking it, and once it is clicked the user gesture
// should activate the theme song."
//
// It is not a preference so much as a mechanism. No browser releases sound
// before a real gesture inside the page, and tapping a home-screen icon is a
// gesture on the OS, not on us — so SOMETHING on this screen has to be
// touched before the theme can ever start. A box that is already ticked
// invites nobody to touch it, and then the silence reads as broken. Starting
// it unticked makes the one press that turns music on the same press the
// browser accepts, so the theme comes up under the finger.
//
// Anyone who has already chosen 'on' keeps it — this only changes the
// default for a device that has never answered.
export function soundEnabled() {
  try {
    return localStorage.getItem('wh_sound') === 'on';
  } catch (_e) {
    return false;
  }
}

// The effects, the UI cues and the outdoor bed. Defaults ON — a game with no
// sound at all on first load reads as broken, and this is the half that does
// not need a gesture-collected unlock to work.
export function setSfxEnabled(on) {
  try { localStorage.setItem('wh_sfx', on ? 'on' : 'off'); } catch (_e) {}
}

export function sfxEnabled() {
  try {
    return localStorage.getItem('wh_sfx') !== 'off';
  } catch (_e) {
    return true;
  }
}
