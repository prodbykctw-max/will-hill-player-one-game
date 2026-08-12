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
  let sw = null;
  function iosSwitch() {
    if (sw || !isIOS || typeof document === 'undefined') return sw;
    sw = document.createElement('input');
    sw.type = 'checkbox';
    sw.setAttribute('switch', '');
    sw.tabIndex = -1;
    sw.setAttribute('aria-hidden', 'true');
    sw.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;'
      + 'opacity:0;pointer-events:none';
    document.body.appendChild(sw);
    return sw;
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
    if (!el) return false;
    try {
      // Toggling is the haptic. Which way it ends up does not matter, so it
      // is left wherever it lands rather than being toggled back — a second
      // click would be a second haptic.
      el.click();
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
