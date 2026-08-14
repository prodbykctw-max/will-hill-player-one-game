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
  isRegistered, phoneDigits, lbTop, localRuns, withWillHill,
} from '../net/leaderboard.js';
// Through the bundler, so the URL is the content-hashed one. A literal path in
// the stylesheet resolves in dev and 404s in dist.
import leaderboardCard from '../assets/backgrounds/leaderboard-card.webp';

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
function nameProblem(v) {
  const s = String(v || '').trim();
  if (!s) return 'Pick a name — it is what shows on the leaderboard.';
  if (s.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return 'That name is too short.';
  return null;
}

// A US ten-digit number, which is what a contest run out of Atlanta needs.
function phoneProblem(v) {
  const d = phoneDigits(v);
  if (!d) return 'A phone number is how we reach you if you win.';
  if (d.length < 10) return 'That looks short — 10 digits, including area code.';
  if (d.length > 11) return 'That looks long — 10 digits, including area code.';
  return null;
}

// Loose on purpose. Anything with an @ and a dot after it is worth keeping;
// bouncing somebody out of a contest over a strict pattern is a worse outcome
// than storing an address that turns out to be wrong.
function emailProblem(v) {
  const s = String(v || '').trim();
  if (!s) return 'An email is the backup way to reach you.';
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? null : 'That does not look like an email address.';
}

export function createPanel({ onClose, onTimeOfDayChange, onSoundChange,
  onHapticsChange, haptics, audio }) {
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
  const views = { board: $('pvBoard'), form: $('pvForm'), settings: $('pvSettings') };
  const title = $('panelTitle');
  let open = false;

  function show(view) {
    for (const [k, v] of Object.entries(views)) if (v) v.hidden = k !== view;
    title.textContent = view === 'form' ? 'ENTER THE CONTEST'
      : view === 'settings' ? 'SETTINGS' : 'LEADERBOARD';
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
    $('btnRegister').textContent = isRegistered() ? 'EDIT MY DETAILS' : 'ENTER THE CONTEST';
  }

  function fillBoard() {
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
    const waiting = best
      ? `Your best on this device: ${best.toLocaleString()}. The board opens when the contest goes live.`
      : 'The board opens when the contest goes live.';

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
    feedback.commit();
    show('board');
  }

  // ── settings ──────────────────────────────────────────────────────────
  function fillSettings() {
    let tod = 'auto';
    let snd = true;
    try {
      tod = localStorage.getItem('wh_tod') || 'auto';
      snd = localStorage.getItem('wh_sound') !== 'off';
    } catch (_e) {}
    $('sTod').value = tod;
    $('sSound').checked = snd;
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
    $('todNote').textContent = tod === 'auto'
      ? 'The stages match the time of day on your phone — night streets after 7pm.'
      : (tod === 'day' ? 'Always daytime streets.' : 'Always night streets.');
  }

  // ── wiring ────────────────────────────────────────────────────────────
  on('panelClose', 'back', () => api.close());
  on('btnRegister', 'press', () => show('form'));
  on('btnSettings', 'press', () => show('settings'));
  on('btnBack', 'back', () => show('board'));
  on('btnSkip', 'back', () => show('board'));
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
    try { localStorage.setItem('wh_tod', e.target.value); } catch (_e) {}
    // The handler RELOADS when it can, and returns true when it did — so the
    // note below is only ever seen in the case it is true for. It used to be
    // printed unconditionally, which is how a setting that works after a
    // reload came to look like a setting that does nothing.
    const applied = onTimeOfDayChange?.(e.target.value);
    $('todNote').textContent = applied
      ? 'Switching…'
      : 'Applies when this run ends — finish the stage or go back to the title.';
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
export function setSoundEnabled(on) {
  try { localStorage.setItem('wh_sound', on ? 'on' : 'off'); } catch (_e) {}
}

export function soundEnabled() {
  try {
    return localStorage.getItem('wh_sound') !== 'off';
  } catch (_e) {
    return true;
  }
}
