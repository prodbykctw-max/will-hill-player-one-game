# Techniques extract — animation cycles, multiplane parallax, per-card sway

Written to be handed to another project. Everything here is lifted from
**Will Hill: Player One** and is self-contained: no imports from this repo are
needed to understand or port any of it.

Three things, in the order they were asked for.

---

## 1. Animation cycles — measuring the period, cutting one, timing it

### The problem, which is not the one people expect

A generated spritesheet clip does not contain one cycle. AutoSprite's 96-frame
`walk` holds about **five and a half strides**; its `idle` holds **three
breaths**; its `jump` holds **seven separate hops**.

Loop the whole clip and you play every one of those cycles per loop. This
project shipped, in order: an idle breathing 168 times a minute, a walk running
4.2 strides a second that read as running on the spot, and a jump that flailed
between grounded and airborne poses.

**Slowing the playback does not fix it.** The frames themselves span the wrong
distance, so slowing down gives you five slow strides instead of five fast
ones. You have to take ONE cycle and then time THAT.

### Measuring it

`tools/measure_cycle.py` in this repo. The core is ~40 lines:

```python
MIN_LAG = 4        # below this it is frame-to-frame continuity, not a cycle
FEAT = 24          # feature grid, per side

def features(frames):
    """One mean-removed, alpha-masked vector per frame."""
    out = []
    for fr in frames:
        a = np.asarray(fr.convert('RGBA').resize((FEAT, FEAT), Image.BOX)).astype(float)
        g = (a[..., :3] * [0.30, 0.59, 0.11]).sum(2) * (a[..., 3] / 255.0)
        v = g.ravel()
        v -= v.mean()
        n = np.linalg.norm(v)
        out.append(v / n if n > 1e-6 else v)
    return np.array(out)

def period_of(frames, min_lag=MIN_LAG):
    F = features(frames)
    n = len(F)
    if n < min_lag * 2 + 2:
        return None, 0.0, []
    scores = np.array([float(np.mean(np.sum(F[:-lag] * F[lag:], axis=1)))
                       for lag in range(1, n // 2 + 1)])

    peaks = []
    for i in range(min_lag - 1, len(scores) - 1):
        if scores[i] <= scores[i - 1] or scores[i] <= scores[i + 1]:
            continue
        li = i
        while li > 0 and scores[li - 1] <= scores[li]:
            li -= 1
        ri = i
        while ri < len(scores) - 1 and scores[ri + 1] <= scores[ri]:
            ri += 1
        prom = scores[i] - max(scores[li], scores[ri])
        peaks.append((i + 1, float(prom)))
    if not peaks:
        return None, 0.0, scores.tolist()

    span = float(scores.max() - scores.min()) or 1e-9
    strongest = max(p[1] for p in peaks)
    # The fundamental, not a harmonic: a period P peaks at P, 2P, 3P...
    for lag, prom in peaks:
        if prom >= 0.6 * strongest:
            return lag, prom / span, scores.tolist()
    return peaks[0][0], peaks[0][1] / span, scores.tolist()
```

**Four things here were learned the hard way. Do not drop them:**

- **Mask by alpha and remove the mean.** A sprite cell is mostly empty and
  empty matches empty perfectly. Leave the transparent surround in and every
  lag scores ~0.99 — the peak vanishes into the noise.
- **Ignore lags below ~4.** Consecutive frames of anything are similar. That
  is continuity, not a cycle.
- **Require PROMINENCE, not just argmax.** My first version took the argmax
  over lags ≥ MIN_LAG and reported its distance above the median as a
  "confidence". That is not a confidence. Similarity decays monotonically for
  any clip that *isn't* cyclic, so the argmax lands on MIN_LAG every time and
  the confidence comes back 1.00 because the maximum is trivially the maximum.
  Run against this project's own atlas it confidently declared that a one-shot
  hit reaction and a lying-down knockdown both had clean 4-frame cycles.
  Prominence — peak minus the higher flanking trough — is what separates a
  peak from a slope, and it lets the tool say **"no cycle"**, which is the
  correct answer for a one-shot.
- **Take the lowest strong peak, not the strongest.** Period P peaks at P, 2P,
  3P… and you want the fundamental.

### Prove it before you trust it

The tool has `--selftest`, which runs it against synthetic clips of known
period (a blob orbiting on a fixed cycle) plus one deliberate non-cycle:

```
PASS  4 reps of a 8-frame cycle -> measured 8 (conf 1.00)
PASS  3 reps of a 12-frame cycle -> measured 12 (conf 1.00)
PASS  3 reps of a 17-frame cycle -> measured 17 (conf 1.00)
PASS  6 reps of a 6-frame cycle -> measured 6 (conf 1.00)
PASS  noisy 11-frame cycle -> 11 (conf 1.00)
PASS  one-shot (no cycle) -> None (conf 0.00)
```

A measurement tool nobody has checked against a known answer is an opinion
with decimal places. The broken first version passed every eyeball test.

Note the gap: real cycles score **1.00**, true one-shots **0.00**. Set the
accept threshold well clear of the floor — 0.20, not 0.08. At 0.08 a one-shot
squeaked through at 0.09 and was reported as holding 3.2 cycles.

### One caveat that surprises people

**Point it at RAW sheets.** Run it against an already-composed atlas and every
clip returns "nothing repeats" — which is arithmetic, not failure:
autocorrelation needs two repeats to see a period, so a clip cut to exactly one
cycle has none left to find. That makes it a good *regression* check on a
composed atlas (anything still reporting a period was cut wrong) but the
measurement belongs on the raw sheet.

### Timing the cut cycle

```
ticks_per_frame = seconds_per_cycle * 1000 / TICK_MS / frames_in_cycle
```

with `TICK_MS = 16.6` (one fixed physics step). Fractional values are
deliberate and worth keeping — they let a clip gain frames later without
changing its duration. This project's walk runs **17 frames at 3.85 ticks**,
one stride per 65 ticks.

**Sanity-check against travel, not just against taste.** If the character
moves at *v* px/tick and a stride takes *T* ticks, the stride covers *vT* px.
That should be near the drawn stride length or the feet visibly skate.

---

## 2. Multiplane parallax — rates, clamps and wrap

From `src/render/backdrop.js`.

```js
const DEPTH_SPREAD = 0.010;
const MAX_SEPARATION = 90;         // px at zoom 1
const STRIP_MAX_SEPARATION = 400;  // px at zoom 1, ground bands only

function cardParallax(camX, depth, card) {
  const common = camX * PLATE_PARALLAX;
  if (card && card.rate !== undefined) {
    const diff = camX * (card.rate - PLATE_PARALLAX);
    const cap = card.maxSep === undefined ? STRIP_MAX_SEPARATION : card.maxSep;
    return common + Math.max(-cap, Math.min(cap, diff));
  }
  const diff = camX * (depth - 0.5) * DEPTH_SPREAD;
  return common + Math.max(-MAX_SEPARATION, Math.min(MAX_SEPARATION, diff));
}

function pmod(a, m) { return ((a % m) + m) % m; }
```

and the wrap, which is the other half:

```js
const period = drawW;
let off = -pmod(par, period);
for (let x = off; x < canvas.width + drawW; x += drawW) { /* blit */ }
```

### The two things that matter

**THE SPREAD IS TINY — 0.010, not 0.1.** Every card's rate sits within one
hundredth of the base plate's. A wide spread does not read as depth, it reads
as *the set falling over*: cards slide clean off one another and the empty base
plate shows through the gaps.

**MAX_SEPARATION is a hard backstop against MIGRATION.** Each card wraps on its
own phase, so a card running even slightly fast drifts a whole plate width over
a long stage — the tree that starts the level on the left finishes it on the
right. At 0.010 spread the tree stays within ~77px of home across a 7680px
stage; the clamp makes migration impossible even if the spread is later dialled
up. **Items have to stay where they are.** They float in front of what is
behind them; they do not travel.

**Ground strips are the one legitimate exception**, and the reason is precise:
the clamp exists to stop a *discrete object* migrating, and that failure needs
a landmark to be visible on. A grass verge, a kerb, a wet street — a continuous
featureless band running the full width — has nothing in it to notice having
moved. All you see is that it is travelling faster than the buildings behind
it, which is exactly the cue that the street is nearer. So a card may opt into
a real `rate` and a looser cap. **Only ground strips should.** Anything with an
identifiable feature keeps the tight default.

### Also worth carrying over

- **Each card is a full-frame RGBA image**, so the cutout is already in
  position — no per-card offset bookkeeping.
- **The base plate is inpainted where every card was lifted from, then sunk.**
  Without the inpaint the base's own copy of an item peeks out as a ghost the
  moment the card moves. ~70% of the base is hole, so a *sharp* fill produced
  ghosts; a soft push-pull pyramid fill is right, and it is never seen because
  the card sits on top of it.
- **Repeat the plate, do not mirror it.** Mirroring hides the seam on a
  non-tiling image and renders every sign as backwards text.
- **Verify with a recompose check**: base + every card at zero offset must
  reproduce the original plate. Under 0.1% difference is the bar.

---

## 3. Sway subdivision within a card

Two pieces: the gust field, and the shear.

```js
// One shared gust field. Two sines at different rates under a slow squared
// envelope — the envelope is what makes it come in WAVES rather than running
// at constant amplitude.
export function gustAt(t, x, freq) {
  const env = 0.30 + 0.70 * Math.pow(
    0.5 + 0.5 * Math.sin(t * 0.0062 + x * 0.0007 * freq), 2);
  return env * (Math.sin(t * 0.030 + x * 0.0013 * freq)
              + 0.40 * Math.sin(t * 0.071 + x * 0.0032 * freq));
}

const SECTIONS = 10;   // vertical slices per sway range

for (let i = 0; i < SECTIONS; i++) {
  const dx = box.dx + a * box.dw + i * secW;
  const phase = (a * box.dw + i * secW) * 2.7 + (bd.top || 0) * 900;
  const k = amp * gustAt(tick, phase, bd.freq);

  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, bandTop, secW, bandH);
  ctx.clip();
  // Shear about the pivot: zero movement at the pivot line, full `k` at the
  // top of the band, linear between.
  ctx.transform(1, 0, -k / bandH, 1, (k / bandH) * pivotY, 0);
  ctx.drawImage(card.img, box.dx, box.dy, box.dw, box.dh);
  ctx.restore();
}
```

### Why it is built this way

- **A band shears ABOVE ITS PIVOT.** For a tree the pivot is the trunk; for a
  crowd it is the floor they stand on. Heads and raised arms travel, feet do
  not. That is what makes it read as *people swaying* rather than as the
  picture wobbling.
- **Phase is keyed to x**, so neighbouring slices drift out of step instead of
  the whole card pulsing as one mass. Ten slices is enough; the seams do not
  show because adjacent slices differ by very little.
- **Sway is PER CARD, never plate-relative.** A plant shears on its own pivot
  and cannot wobble the architecture beside it.
- **Bands must not overlap** within the same x-range. Each band draws the card
  clipped to its own rect, so an overlap composites the feathered alpha twice.
- **Amplitudes as a FRACTION of the card's drawn width**, not pixels, if the
  scene is ever fit to varying screen sizes. A fixed pixel amplitude that reads
  as a breath on a desktop is a lurch on a phone.

### The rigid remainder needs an even-odd clip

Everything the sway windows do NOT reach still has to be drawn, and it must be
**punched out**, not drawn under:

```js
ctx.beginPath();
ctx.rect(box.dx, box.dy, box.dw, box.dh);
for (const bd of bands) { /* rect() each band's window */ }
ctx.clip('evenodd');
ctx.drawImage(card.img, box.dx, box.dy, box.dw, box.dh);
```

These cards have soft alpha edges. Drawing a sheared copy on top of a rigid one
composites that edge onto itself and leaves the rigid copy showing wherever the
shear moved content away.

---

## The meta-lesson, which is the most portable part

Every number above replaced a guess, and in three separate cases the guess had
survived a long time because it *looked* right:

- The walk cadence was wrong for weeks and read as "the animation is a bit
  fast" rather than as "this clip contains five strides".
- The parallax spread was 10× too wide and read as "the depth effect is
  strong" rather than as "the set is falling over".
- The stomp hit-box in this game had a **three-tick window** — 50ms — and read
  as "landing on enemies is fiddly" rather than as "the attack is a coin toss".

None of those are findable by playing. Build the measuring harness first, check
the harness against a known answer, then tune.
