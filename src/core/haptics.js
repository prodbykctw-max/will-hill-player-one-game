// HAPTICS — the tick under the thumb.
//
// A touch control has no travel and no click, so the only thing that tells you
// the phone registered your press is the screen changing a frame or two later.
// That is the difference between a d-pad and a picture of a d-pad, and it is
// most of what "stiff" meant back when the pads were being debugged.
//
// TWO ROUTES, BECAUSE THE WEB HAS TWO PHONES.
//
// ANDROID / CHROME / FIREFOX: navigator.vibrate(ms). Supported, simple,
// verifiable. This is the real path.
//
// iOS SAFARI: THERE IS NO VIBRATION API. Never has been — navigator.vibrate is
// undefined on every version of iOS Safari to date, and no amount of feature
// detection conjures it. The only route from a web page to the Taptic Engine is
// a side effect: since iOS 17.4 a <input type="checkbox" switch> plays a haptic
// when it is toggled inside a user gesture. That is a hack and it is written
// here as one — gated to iOS so it cannot touch any other platform, and
// wrapped so a failure is silent.
//
// ⚠️ THE iOS PATH IS UNVERIFIED. It cannot be tested from this environment:
// Playwright's "iPhone" profile is Chromium wearing an iOS user-agent string
// (it reports navigator.vibrate as a function, which real Safari does not), so
// there is no way to distinguish "this works" from "the harness is lying".
// It needs one pass on a real iPhone. The Android path IS verified — see
// scratchpad/haptics.mjs, which counts the actual vibrate() calls.
//
// EVERYTHING IS BEST-EFFORT AND SILENT. A phone in a case, a phone on silent,
// a browser that refuses — none of those are errors, and none of them may
// interrupt the game.

const KEY = 'wh_haptics';

// Durations in ms. Short, because a game tick is 16.6ms and anything you can
// consciously time is too long to feel like a button.
const TICK = 8;      // a movement or action pad going down
const TAP = 14;      // a menu button
const CONFIRM = [14, 40, 26];   // buzz, pause, longer buzz — something happened

export function createHaptics() {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const canVibrate = !!(nav && typeof nav.vibrate === 'function');

  // iOS, and specifically NOT "iPhone-ish" — an iPad reports as a Mac with
  // touch points, which is why the second test is there.
  const isIOS = !!nav && (/iP(hone|ad|od)/.test(nav.userAgent)
    || (/Mac/.test(nav.userAgent) && nav.maxTouchPoints > 1));

  let enabled = true;
  try {
    enabled = localStorage.getItem(KEY) !== 'off';
  } catch (_e) { /* private mode; default on */ }

  // ⚠️ THREE FIXES WENT IN HERE BEFORE ANYONE PROVED THE MECHANISM, and all
  // three were real defects in a technique that could never have worked. Kept
  // as a record because the shape of the mistake matters more than the code:
  //   1. the switch was parked at left:-9999px with opacity:0, so WebKit had
  //      nothing to draw and nothing to animate;
  //   2. it was built and .click()ed in the same tick, before layout;
  //   3. it carried pointer-events:none.
  // Each fix answered "why is the click not producing a haptic?" None asked
  // whether a click produces one. It does not, and never did. See
  // docs/LESSONS.md 20.

  // ── WHAT HIS PHONE ACTUALLY SAYS ──────────────────────────────────────
  //
  // Three rounds of public/haptic.html, answered from the device:
  //
  //   round 1  a real switch under his own finger        BUZZED
  //            switch.click() / label.click() / for=     ALL DEAD
  //            navigator.vibrate                          does not exist
  //   round 2  hidden switch (opacity 0.01)              BUZZED
  //            ... with the control's art painted over it BUZZED
  //            hold two seconds, then release             ON RELEASE ONLY
  //            fifteen fast taps                          THROTTLED
  //   round 3  switch INSIDE a real <button>              BUZZED, handler ran once
  //            switch OVER a real <button>, forwarded     BUZZED, handler ran once
  //            plain button, no switch                    silent (the control)
  //
  // So the whole `fire()` idea below is dead on iOS and always was: nothing
  // can be fired AT the player. What works is putting a real switch under the
  // thumb, so THEIR tap is the thing that buzzes.
  //
  // ⚠️ AND IT IS ONLY GOOD FOR BUTTONS. The haptic lands on release and iOS
  // throttles it under repeated taps, so a movement pad — which needs a tick
  // the moment the thumb lands, hundreds of times a run — gets nothing on
  // iPhone and cannot be made to. Android keeps navigator.vibrate for all
  // three cues. Saying so is better than shipping a switch that fires at the
  // wrong end of a press and calling it haptics.
  //
  // INSIDE the button, not over it. Both buzzed and both kept the handler at
  // exactly one call per tap, so the tie-break is layout: the cabinet's
  // buttons are absolutely positioned at measured fractions of his artwork,
  // and an overlay would mean wrapping every one of them and moving all of
  // that geometry onto the wrappers. A child changes nothing. It is invalid
  // HTML — interactive content inside a button — and every engine tolerates
  // it; aria-hidden and tabIndex -1 keep it out of the accessibility tree and
  // the tab order, because it is not a control, it is a noise maker.
  //
  // The switch is scaled to cover its button, because probe 2 established
  // that a transform-scaled switch keeps its hit area, while stretching one
  // with width/height was never tested and is not going to be assumed.
  //
  // ⚠️ MEASURE THE CONTROL, DO NOT ASSUME ITS SIZE. This first went in with
  // 51x31 hardcoded — the size of a switch on iOS — and the harness caught it
  // immediately: Chromium does not implement the switch attribute, renders a
  // 13px checkbox instead, and every button ended up with a dot in the middle
  // of it covering one of the five points a thumb might land on. Reading the
  // rendered box back means the same code is right on both, and right again
  // if either engine changes the control.
  // el -> its switch. A Map rather than a Set because the switches have to
  // come OUT again when he turns vibration off — see setEnabled.
  const attached = new Map();
  const always = new Set();

  function sizeTo(input, el) {
    // ⚠️ RE-DECIDE THE CONTAINING BLOCK EVERY TIME, DO NOT SET IT ONCE.
    // attach() runs while the panel is being built, before any cabinet class
    // is on the card, so his OPTIONS / SETTINGS / ENTER CONTEST buttons are
    // still plain flow items at that moment. Writing `position: relative`
    // inline then is permanent — an inline style beats the stylesheet — so
    // when `#panelCard.cabinet-entry #btnFormRules { position: absolute }`
    // finally applied, it lost, and the button rendered at its flow position
    // PLUS its top offset: measured 896px down a 932px screen for a control
    // his artwork puts at 609. Clearing the inline value first lets the
    // stylesheet speak, and only a genuinely static element gets one.
    el.style.position = '';
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    input.style.transform = 'none';
    const s = input.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || !s.width || !s.height) {
      input.style.transform = 'translate(-50%, -50%)';
      return;
    }
    // 1.04 so a fractional device pixel cannot leave a hairline of his
    // painted button silent along an edge.
    const k = Math.max(r.width / s.width, r.height / s.height) * 1.04;
    input.style.transform = 'translate(-50%, -50%) scale(' + k.toFixed(4) + ')';
  }

  // Exposed so a harness can exercise the iOS path on a desktop browser —
  // everything except the haptic itself is testable, and the haptic is the one
  // part his thumb has already settled.
  let force = false;
  try {
    force = typeof location !== 'undefined'
      && /[?&]haptest=1/.test(location.search);
  } catch (_e) { /* no location; leave it off */ }

  function attach(el, opts) {
    if (!(isIOS || force) || !el || attached.has(el)) return false;
    if (typeof document === 'undefined') return false;
    // The vibration switch itself keeps its haptic even while vibration is
    // off, so he can feel the thing he is switching ON. Everything else
    // obeys the setting.
    if (opts && opts.always) always.add(el);
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.setAttribute('aria-hidden', 'true');
    input.dataset.haptic = '1';
    input.tabIndex = -1;
    input.style.cssText = 'position:absolute;left:50%;top:50%;margin:0;'
      + 'padding:0;border:0;opacity:0.01;z-index:0;'
      + 'appearance:auto;-webkit-appearance:auto;'
      + 'transform:translate(-50%,-50%)';
    // ⚠️ AND IT HAS TO CLIP. The scale is uniform — a non-uniform one on a
    // native control was never tested and is not going to be assumed — so on
    // anything that is not square the switch massively over-covers the short
    // axis. His CONTEST INFO column is 44x204 on a phone: scaled to cover its
    // height, the switch comes out 212 wide and reaches 84px past each side,
    // straight over LEADERBOARD and RULES & PRIZES next to it. The harness
    // caught it as those two buttons no longer being what a thumb lands on.
    // overflow:hidden clips descendants for hit-testing as well as painting,
    // and it follows border-radius — which is what keeps his round SAVE &
    // ENTER a disc rather than the square its switch would otherwise make.
    el.style.overflow = 'hidden';
    attached.set(el, input);
    if (enabled || always.has(el)) {
      el.insertBefore(input, el.firstChild);
      sizeTo(input, el);
    }
    // ── A CHECKBOX NEEDS THE TAP HANDING ON ────────────────────────────
    // On a button the click bubbles and the button's own handler runs. A
    // checkbox is different: the switch is ON TOP of it, and a click landing
    // on a nested interactive element does NOT trigger the label's control,
    // so without this the pill would buzz and never change. This is probe 3's
    // shape 11 — the switch toggles itself, which is the haptic, and forwards
    // the state change on. No preventDefault anywhere near it: suppressing
    // the switch's own activation is the likeliest way to suppress the very
    // haptic it exists for.
    if (opts && opts.toggles) {
      const target = opts.toggles;
      input.addEventListener('click', () => {
        if (target.disabled) return;
        target.checked = !target.checked;
        target.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    // The cabinet resizes with the viewport, and a switch sized for the old
    // box would leave part of the button dead.
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => sizeTo(input, el));
      ro.observe(el);
    }
    return true;
  }

  function fire(pattern) {
    if (!enabled) return false;
    if (canVibrate) {
      try {
        // A false return means the browser declined (backgrounded tab, no
        // gesture yet). Not an error and not worth a fallback attempt.
        return nav.vibrate(pattern) !== false;
      } catch (_e) { return false; }
    }
    // ⚠️ NOTHING TO DO ON iOS, AND THAT IS THE ANSWER, NOT A GAP. There is no
    // programmatic route to the Taptic Engine — see the round-by-round notes
    // above. A caller asking to be buzzed gets an honest false; the haptic on
    // this platform comes from attach(), where his own thumb produces it.
    return false;
  }

  return {
    // ⚠️ ANDROID ONLY, AND THAT IS NOT A BUG. A pad going down mid-run, the
    // shortest of the three because it fires hundreds of times a run and
    // anything longer becomes a continuous buzz under the thumb. On iOS it
    // returns false and always will: the only haptic available there lands on
    // RELEASE and is throttled under repeated taps, which is the exact
    // opposite of what a movement pad needs. Measured on his phone, round 2.
    tick: () => fire(TICK),
    // A menu button, a screen tap, anything that is a decision.
    tap: () => fire(TAP),
    // A decision that committed something — the run starting, the form saving.
    confirm: () => fire(CONFIRM),

    // ⚠️ THE iOS HAPTIC IS THIS, NOT tap()/confirm(). Give a real button a
    // hidden switch so the player's own tap is what buzzes. Call it on every
    // button that should answer a thumb; it is a no-op everywhere but iOS,
    // which is why nothing here changes what the harnesses see.
    attach,
    attachAll(root) {
      if (!root || typeof root.querySelectorAll !== 'function') return 0;
      let n = 0;
      root.querySelectorAll('button').forEach((el) => { if (attach(el)) n += 1; });
      return n;
    },
    // True when the buzz is coming from a real control under his thumb rather
    // than from a call — which is the only case where turning the setting off
    // has to physically remove something.
    isSwitchRoute: () => !canVibrate && (isIOS || force),

    setEnabled(v) {
      enabled = !!v;
      try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch (_e) { /* */ }
      // ⚠️ ON iOS THE SWITCH IS THE HAPTIC, SO TURNING IT OFF MEANS TAKING
      // THE SWITCHES OUT. This flag used to gate fire(), which was the only
      // route — now the buzz comes from WebKit reacting to his thumb landing
      // on a real control, and nothing in JS can decline that. Leaving them
      // in place would have left VIBRATION OFF still buzzing every button,
      // which is worse than never having wired it.
      attached.forEach((input, el) => {
        const want = enabled || always.has(el);
        const there = input.parentElement === el;
        if (want && !there) { el.insertBefore(input, el.firstChild); sizeTo(input, el); }
        else if (!want && there) { input.remove(); }
      });
    },
    isEnabled: () => enabled,
    // What route is actually available, for the settings copy and the harness.
    // 'ios-buttons' rather than the old 'ios-switch': the distinction matters
    // to the player, because it means menus buzz and the game pad does not.
    support: () => (canVibrate ? 'vibrate' : ((isIOS || force) ? 'ios-buttons' : 'none')),
  };
}

// Read at boot by main.js so the setting survives a reload.
export function hapticsEnabled() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch (_e) { return true; }
}
