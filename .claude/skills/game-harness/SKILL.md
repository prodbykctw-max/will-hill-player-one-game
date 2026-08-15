---
name: game-harness
description: Measure a running canvas/WebGL game from a Playwright harness without lying to yourself — deterministic frame capture, audio that is actually audible, polling instead of sleeping, and telling a harness bug from a product bug. Use when writing or debugging automated checks against a browser game, when a test reports a working feature as broken, or when verifying a visual/audio change actually landed.
---

# Harnessing a browser game

Written from Will Hill: Player One, where the harness suite caught real bugs
and also *invented* several that cost more time than the bugs did. Every rule
below is a specific failure that happened, with its number.

## The one-line version

**A running game is a moving target and a harness is a stopwatch.** Almost
every false result here came from reading a value at a moment nobody had
pinned down.

---

## ⚠️ Determinism first, or the number means nothing

`page.screenshot()` is not synchronised to the game loop. The tick advances
between being set and the frame being taken.

**Measured: two identical runs of the same before/after comparison differed by
12,384 pixels.** A change that "fixed 19,410 px" could not be distinguished
from noise.

```js
// Pin the tick across several frames, then read the canvas INSIDE ONE evaluate.
const shot = await page.evaluate(async (t) => {
  const frame = () => new Promise(r => requestAnimationFrame(r));
  for (let k = 0; k < 3; k++) { game.tick = t; await frame(); }
  game.tick = t; await frame();
  return document.querySelector('canvas').toDataURL('image/png');
}, TICK);
```

One `evaluate`, because anything that crosses the CDP boundary lets frames slip.

## ⚠️ Measure the noise floor, do not assume there isn't one

Even pinned, things move: idle animations, HUD timers, swaying scenery.

Capture the **same state twice**, diff those, and subtract that mask from your
real comparison. One pair is not enough if anything cycles — take the union
across every sample.

> Skipping this reported **236 px of "cloud on a building"** that turned out to
> be the player's own trousers, rows 508–569, his sprite box on every stage.

## ⚠️ Do not park the player off-screen to clear the frame

The obvious way to get a clean shot is to shove the character out of view.

> At `y = -40000` he falls, dies, respawns and the camera snaps — forever.
> Pairs came back **279,503 px apart** at some ticks and 3,000 at others. That
> is not the thing being measured, it is the phase of a death loop.

Leave him at spawn. He stands still. If you must move him, re-state `hearts`
and `screen` every step and prove the frames settled before trusting them.

## Isolate a layer by DRAWING IT TWICE, not by colour-keying

To ask "what does this card contribute?", render the frame with it and without
it. **The difference IS the layer** — no guessing which pixels belong to what.

```js
bg.cards = all.filter(c => c.key !== 'clouds');  const off = await grab();
bg.cards = all;                                   const on  = await grab();
```

This is how "are clouds crossing buildings" became a number instead of an
argument.

---

## ⚠️ Poll the condition. Never sleep a number.

A fixed `waitForTimeout` is a guess wearing a number, and it rots.

> `share.mjs` waited 400ms after tapping SHARE and reported the whole feature
> dead — no download, no clipboard, no error. Nothing was broken: the card is
> an 852×1846 canvas encoded to a 2.5MB PNG and on a loaded machine that lands
> at **about four seconds**. 400ms had never been a contract, just a number
> that used to be enough.

```js
await page.waitForFunction(() => window.__downloads.length > 0 && window.__clip,
  null, { timeout: 30000 });
```

**Corollary — the one-frame race.** Reading a value on the same frame a state
flips gives you the *previous* frame's answer, because most loops do
`update()` top-down and the branch that changes the state runs below the code
that consumed it.

> `endcue.mjs` polled `while (screen !== 'stageClear')` and read the music cue
> the instant it exited — three stages passed and one failed **in the same run,
> on identical code**. Whether an extra frame slipped in was a race between the
> harness's `requestAnimationFrame` and the game's. Hold 3–4 frames after a
> transition before reading anything about it.

---

## ⚠️ Audio: `!el.paused` is not "audible"

An element can run happily with its gain multiplied by zero.

> This passed for **weeks** while the game was silent. `readyState` 4, no
> error, `currentTime` climbing, master-bus RMS **0.000000**. The client:
> *"it shows the speaker is live in the browser but it doesn't play the music."*

Read the **master bus** — the RMS of samples actually reaching the destination:

```js
const peak = await page.evaluate(async () => {
  const v = [];
  for (let i = 0; i < 40; i++) { v.push(window.__audio.level()); await raf(); }
  return Math.max(...v);
});
```

Two things about that: the analyser is built on **first call**, so the first
read is always 0 and must be discarded; and it is an instantaneous RMS of a
waveform, so a single sample can land on a zero crossing. **Always take a peak
across frames, never one reading.**

---

## Telling a harness bug from a product bug

The default assumption when a check goes red should be "the product broke".
Roughly half the time on this project it was the harness. Signs it is the test:

- **It fails on some items and not others, with identical code paths.** That is
  a race, not a bug.
- **It asserts an API that does not exist.** `introorder.mjs` called
  `__title.settledAt()`, designed for a feature that never shipped. It threw on
  frame one. It had never been run.
- **It polls a field that is a local, not state.** The same file then hung for
  four minutes on `g.introT`, which lives inside `draw()` and reads `undefined`
  — `(g.introT || 0)` pinned the clock at zero and the loop never ended.
- **It encodes a decision that was reversed.** `ceiling.mjs` demanded a pinned
  benchmark row the client had asked to be REMOVED. The suite went red on
  correct code.

**So: run the whole suite end to end regularly.** A suite nobody runs entire
drifts into grading last month's product, and then teaches everyone to
distrust red — which is the expensive part.

**And measure before you fix.** Every one of the above would have been "fixed"
in the product if the first move had not been to reproduce and instrument.

---

## ⚠️ A green suite in headless Chrome says nothing about Safari

> A rebuilt panel passed everything and arrived on the client's iPhone **blank**
> — one ✕ floating near the middle of the screen. That position was the whole
> diagnosis: the card had collapsed to zero width, so its top-right corner was
> the centre. A child took its width from `aspect-ratio`; the parent was
> `width: auto`, asking the parent to size itself from that child. Chrome
> resolves the loop. Safari returns zero.

When the change is **CSS layout**, say out loud that the harness cannot see the
bug class, and give containers a definite size rather than a circular one.

---

## Housekeeping that actually matters

- **Default every output path to a gitignored directory**, never the repo root.
  Three separate sweeps had to clean up stray PNGs and JSON dropped beside the
  source — and on a project with a deploy branch that is the exact shape of a
  private-file leak.
- **Print one machine-readable verdict line** (`ALL n PASS` / `FAILED: ...`) so
  a sweep can read the suite mechanically — and accept that some harnesses are
  legitimately **report-only** (contact sheets, tables for a human). Say which
  are which, or the next person reads "no verdict" as "broken".
- **Expose dev hooks from the app, not by re-importing its modules.** A harness
  doing `await import('/src/thing.js')` under Vite gets a **second instance** —
  the app's copy was fetched with an HMR timestamp on the URL, so a bare
  specifier is a different URL, and module state reads empty. Hang a
  `window.__x` off the app's own copy behind `import.meta.env.DEV`.
- **Make the untestable testable, behind a dev-only flag.** A submit path
  gated on a deployed backend could not be exercised at all, and that is
  precisely how a bug that discarded real entries survived. A `?flag=` read
  under `import.meta.env.DEV` is folded to dead code in production, so it
  cannot leak into what ships.
