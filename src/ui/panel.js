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
  isRegistered, phoneDigits, lbTop, localRuns,
} from '../net/leaderboard.js';

const $ = (id) => document.getElementById(id);

// A US ten-digit number, which is what a contest run out of Atlanta needs.
// Deliberately the ONLY hard requirement: the name has a default and the
// email is optional, because every required field costs entrants and the
// phone is the one the prize is actually claimed on.
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
  if (!s) return null;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? null : 'That does not look like an email address.';
}

export function createPanel({ onClose, onTimeOfDayChange, onSoundChange }) {
  const el = $('panel');
  if (!el) return { open() {}, close() {}, get isOpen() { return false; } };

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

  // ── the board ─────────────────────────────────────────────────────────
  function render(runs, note) {
    const ol = $('board');
    ol.innerHTML = '';
    const me = lbName().toLowerCase();
    runs.slice(0, 20).forEach((r, i) => {
      const li = document.createElement('li');
      if (r.me || String(r.name || '').toLowerCase() === me) li.className = 'me';
      const rank = document.createElement('span');
      rank.className = 'r';
      rank.textContent = `${i + 1}.`;
      const name = document.createElement('span');
      name.className = 'n';
      name.textContent = r.name || 'PLAYER ONE';   // textContent, never innerHTML
      const score = document.createElement('span');
      score.className = 's';
      score.textContent = `$${Number(r.score || 0).toLocaleString()}`;
      li.append(rank, name, score);
      ol.append(li);
    });
    if (!runs.length) {
      const li = document.createElement('li');
      li.textContent = 'No runs yet. Be the first.';
      ol.append(li);
    }
    $('boardNote').textContent = note;
    $('btnRegister').textContent = isRegistered() ? 'EDIT MY DETAILS' : 'ENTER THE CONTEST';
  }

  function fillBoard() {
    const local = localRuns();
    render(local, 'Loading…');
    lbTop(20, (runs) => {
      if (!open) return;
      if (runs && runs.length) {
        render(runs, isRegistered() ? 'You are entered in the contest.'
          : 'Enter the contest to get your score on this board.');
      } else {
        // The Worker is not deployed yet, or the phone is offline. Either way
        // the honest thing is to show what we do have and say what it is.
        render(local, local.length ? 'Your runs on this device. The global board is not live yet.'
          : 'The global board is not live yet.');
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
    const p = phoneProblem($('fPhone').value) || emailProblem($('fEmail').value);
    if (p) {
      err.textContent = p;
      err.hidden = false;
      return;
    }
    setLbName($('fName').value);
    setContestRegistration({ phone: $('fPhone').value, email: $('fEmail').value });
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
    $('todNote').textContent = tod === 'auto'
      ? 'The stages match the time of day on your phone — night streets after 7pm.'
      : 'Takes effect next time the game loads.';
  }

  // ── wiring ────────────────────────────────────────────────────────────
  $('panelClose').addEventListener('click', () => api.close());
  $('btnRegister').addEventListener('click', () => show('form'));
  $('btnSettings').addEventListener('click', () => show('settings'));
  $('btnBack').addEventListener('click', () => show('board'));
  $('btnSkip').addEventListener('click', () => show('board'));
  $('btnSave').addEventListener('click', save);
  // Enter on the last field submits, the way a form should.
  $('fEmail').addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  $('fPhone').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('fEmail').focus(); });
  $('fName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('fPhone').focus(); });

  $('sSound').addEventListener('change', (e) => {
    const on = e.target.checked;
    try { localStorage.setItem('wh_sound', on ? 'on' : 'off'); } catch (_e) {}
    onSoundChange?.(on);
  });
  $('sTod').addEventListener('change', (e) => {
    try { localStorage.setItem('wh_tod', e.target.value); } catch (_e) {}
    $('todNote').textContent = 'Takes effect next time the game loads.';
    onTimeOfDayChange?.(e.target.value);
  });

  // Tapping the dimmed area behind the card closes it. Not the card itself,
  // or every mis-tap while typing would throw the form away.
  el.addEventListener('pointerdown', (e) => { if (e.target === el) api.close(); });
  window.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') api.close(); });

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

export function soundEnabled() {
  try {
    return localStorage.getItem('wh_sound') !== 'off';
  } catch (_e) {
    return true;
  }
}
