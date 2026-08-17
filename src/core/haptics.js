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

  // The iOS switch, built lazily and only on iOS. Kept out of the tab order
  // and out of the accessibility tree: it is not a control, it is a noise
  // maker, and a screen reader announcing "switch, off" before every button
  // press would be worse than no haptics at all.
  // ⚠️ THREE THINGS WERE WRONG WITH THIS AND THE CLIENT FELT ALL OF THEM:
  // "I still haven't felt any haptic feedback from the game."
  //
  //  1. IT WAS PARKED AT left:-9999px WITH opacity:0. WebKit plays the switch
  //     haptic as a side effect of ANIMATING a real control. A control parked
  //     off-canvas at zero opacity is not something it has to draw, so there
  //     is nothing to animate and nothing to feel. It now sits inside the
  //     viewport at a hair above transparent, 1x1, under everything.
  //  2. IT WAS BUILT LAZILY AND CLICKED IN THE SAME TICK. The element was
  //     created and .click()ed before layout had ever run on it, so at the
  //     moment of the first press it was not a laid-out control yet. It is
  //     now built once up front and forced through layout immediately.
  //  3. pointer-events:none. Harmless for a scripted click, but it is one
  //     more signal that this is not an interactive control, so it is gone.
  //
  // This is still a hack against an undocumented side effect and it is still
  // the only route a web page has to the Taptic Engine.
  //  4. IT CLICKED THE INPUT. Client, after all of the above: "Vibration is
  //     still not working." The route that is actually reported to work is
  //     clicking a <label> BOUND to the switch, not the switch itself — the
  //     haptic rides on the label-driven activation, and a direct .click() on
  //     the input toggles the checked state without ever producing one. The
  //     label wraps the input, so it is bound by nesting and needs no id.
  //
  // ⚠️ STILL UNVERIFIED FROM HERE, AND NOW MEASURED INSTEAD OF GUESSED AGAIN.
  // public/haptic.html is a probe he can open on the phone: five routes side
  // by side, including a real switch he flips himself as the control. If the
  // control does not buzz, this iOS build has no switch haptic and no code
  // change reaches the Taptic Engine. Whichever route he feels is the one
  // that stays; the rest of this comment becomes history.
  let sw = null;
  let lab = null;
  function buildIosSwitch() {
    if (sw || !isIOS || typeof document === 'undefined' || !document.body) return sw;
    sw = document.createElement('input');
    sw.type = 'checkbox';
    sw.setAttribute('switch', '');
    sw.tabIndex = -1;
    sw.setAttribute('aria-hidden', 'true');
    sw.style.cssText = 'margin:0;padding:0;border:0;'
      + 'appearance:auto;-webkit-appearance:auto';
    // In the viewport, drawn, but invisible and un-hittable by a thumb.
    lab = document.createElement('label');
    lab.setAttribute('aria-hidden', 'true');
    lab.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;'
      + 'opacity:0.01;z-index:-1;display:block;overflow:hidden';
    lab.appendChild(sw);
    document.body.appendChild(lab);
    void lab.offsetHeight;            // force layout NOW, not at first press
    return sw;
  }
  function iosSwitch() { return sw || buildIosSwitch(); }

  // ⚠️ BUILT HERE, NOT UP WITH THE OTHER SETUP. `sw` is a `let` declared just
  // above, so calling buildIosSwitch() before this point lands in the
  // temporal dead zone and throws "Cannot access 'sw' before
  // initialization" — and createHaptics() runs at module load, so that
  // throw would have taken the whole game down ON iOS ONLY, which is the one
  // platform this code path exists for and the one I cannot test here.
  // Caught by asking each platform which route it reports.
  if (isIOS && typeof document !== 'undefined') {
    if (document.body) buildIosSwitch();
    else document.addEventListener('DOMContentLoaded', buildIosSwitch, { once: true });
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
    const el = iosSwitch();
    if (!el || !lab) return false;
    try {
      // ⚠️ THE LABEL, NOT THE INPUT. Clicking the input toggles the checked
      // state and produces nothing to feel; the haptic rides on activating
      // the label that owns it.
      //
      // Toggling is the haptic. Which way it ends up does not matter, so it
      // is left wherever it lands rather than being toggled back — a second
      // click would be a second haptic.
      lab.click();
      el.blur();
      return true;
    } catch (_e) { return false; }
  }

  return {
    // A pad going down mid-run. Deliberately the shortest of the three: this
    // one fires hundreds of times in a run and anything longer turns into a
    // continuous buzz under the thumb.
    tick: () => fire(TICK),
    // A menu button, a screen tap, anything that is a decision.
    tap: () => fire(TAP),
    // A decision that committed something — the run starting, the form saving.
    confirm: () => fire(CONFIRM),

    setEnabled(v) {
      enabled = !!v;
      try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch (_e) { /* */ }
    },
    isEnabled: () => enabled,
    // What route is actually available, for the settings copy and the harness.
    support: () => (canVibrate ? 'vibrate' : (isIOS ? 'ios-switch' : 'none')),
  };
}

// Read at boot by main.js so the setting survives a reload.
export function hapticsEnabled() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch (_e) { return true; }
}
