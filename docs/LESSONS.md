# Lessons — where I got it wrong

A record of every mistake worth remembering on this project, kept so the same
ones stop costing prodbyKCTW time. Written by Claude, about Claude.

The client's standing instruction, and the one line that would have prevented
most of what follows:

> "Never assume, always measure. Whether that means looking at something,
> actually counting the code and bytes — never guess. This is not a guessing
> game."

Organised by ROOT CAUSE, not chronologically, because a handful of habits
produced most of these. The individual bugs are symptoms.

---

## 1. Guessing a number instead of measuring it

The single most expensive habit on this project.

| what happened | cost |
|---|---|
| **`_chan()` returned int16.** `r*299` overflows above red 109 under NumPy 2's scalar rules and wraps negative. 37.5% of EAV's pixels got a wrong luminance. | Shipped a fence with its planks chewed to lace. The client found it, not me. |
| Under that bug, `is_pale_neutral` matched **zero pixels, ever**. In an earlier session I "fixed" the tree/canopy split by lowering its threshold 88 → 62 and declared it solved. The rule could never fire. | A fix that did nothing, believed for days. Something else had actually fixed it. |
| Under the same bug, `is_deep_shadow` claimed **313,527 pixels of bright art** as unlit black. | This is what ate the fence. |
| Read the Coca-Cola sign's position off a downscaled screenshot and got it wrong — I was reading displayed pixel positions as if they were the labelled coordinates. | Two wasted iterations before switching to colour-signature component analysis. |
| Derived all the per-stage `SKY_RULES` thresholds *while the luminance was still broken*. | Every number invalid, had to redo the whole derivation. |
| Assumed a denser SAM sampling grid would find the missing letters. It moved coverage 85.0% → 86.0% and the letters stayed gone. | A whole background run spent on the wrong lever. The area floor and confidence bar were the actual cause. |
| Assumed the walk clip held one stride. Autocorrelation says **5.6**. | Weeks of "the walk is too fast", repeatedly re-tuned playback speed, which could never work — the frames spanned the wrong distance. |
| Assumed Kenney's `impactPunch_*` files were punches. Measured: 84–94% low-frequency energy. They are thuds. | Shipped a stomp the client described as "a dry kick drum". |

**The rule:** if a number appears in a threshold, a coordinate, or a claim,
it came from a measurement or it doesn't go in. "It looks like about 300px"
is not a measurement.

---

## 1b. Asserting what I CAN'T do, without touching it

A distinct flavour of the same sin, and the one the client had to push back on
hardest, because it wastes their time arguing instead of mine checking.

| what happened | cost |
|---|---|
| Told the client the AutoSprite API key "has to go in the MCP server config, not the chat" and that I couldn't apply it. **I had not looked at a single config file.** | Client: *"Wouldn't you do the MCP server configuration? What are you talking about bro?"* Only then did I check `/tmp/mcp-config-*.json` and find the real answer — every server is `type: http` proxied through Anthropic's connector layer, with no `env` and no `command`, so there is genuinely nowhere local to put a key. **The conclusion was right and the method was worthless.** |
| Said Google Drive "needs your approval on the connector" without checking what the error actually was. | Same shape. Guessing at a plausible cause instead of reading one. |

**Why this one is worse than a wrong number.** A wrong number gets caught by
the next measurement. A confident "I can't do that" gets BELIEVED, and the
client goes off and does the work themselves — or worse, drops something they
actually wanted. Being right by luck is not being right.

> "Never assert all this shit that I'm having to push back on you on just
> because you're not doing the work to touch the product to confirm."

**The rule, and it covers capability claims exactly like it covers numbers:**
before saying "I can't", "there's no way to", "that's not supported", or
"that's on your end" — go look. Read the config. Call the tool. Check the
error text. If the check is genuinely impossible, say *that*, and say what
would settle it. "I haven't checked yet" is always allowed. A guess dressed
as a finding never is.

---

## 2. Trusting my own earlier documentation over the code

| what happened | cost |
|---|---|
| Told the client the **enemies were front-facing** and needed regenerating. They were fine — their walk clips are clean side profiles and enemies never idle. I was repeating a stale line in `HANDOFF.md`. | Client had to correct me: *"who's bringing up an issue with the enemies... I never complained about the enemies."* Nearly regenerated four sprite sheets for nothing. |
| `preview_planes.py` kept its **own private copy** of the depth table. A verification tool checking against its own numbers verifies nothing. | Latent. Caught only when it crashed on a new stage. `lighting.js` had already done the same thing with the ground constant and drifted 2 against 3. |

The client's response to this one is the part to remember:

> "I can't keep correcting you, bro. That's a waste of time and tokens, and
> it's mentally straining on me."

**The rule:** docs are a hypothesis; the code is the fact. Before repeating any
claim from a doc, go read the thing it describes. A doc that is 90% right is
worse than no doc, because nobody knows which 90%.

---

## 3. Not checking whether a change actually did what I said

| what happened | cost |
|---|---|
| Declared the tree/canopy separation fixed via a threshold change that matched zero pixels. | See above. |
| Cut `leftblock` and `midbuild` as ROI boxes and wired them without looking at the assignment map first. They were **solid rectangles** — the exact "disjoint rectangular planes read as hard cuts" failure that got `cut_layers.py` thrown out. | Caught by looking at the map, but only after wiring. Should have been the first thing checked, not the last. |
| Cut the arch with the default hole-fill. The dome is a **wheel with gaps you see through**; it came back a filled semicircle. | One wasted cut cycle. |
| Wrote `keep_roi` entries as **two-point "polygons"**. Two points is a line, not a region. | The keep silently covered nothing. |
| Seeded the sky flood-fill from row 0. The plates vignette to black over ~5px, which fails any blue-dominance test, so Underground found **0.0% sky**. | Would have produced a garbage cut if I hadn't printed the percentage. |

**The rule:** every change gets a check that would FAIL if the change did
nothing. A green run is not evidence. The recompose diff, the assignment map,
and the coverage render exist for exactly this and should be looked at before
declaring anything.

---

## 3b. Calling the asset done when only the asset was done

| what happened | cost |
|---|---|
| Generated the knockdown, hit and stomp clips, verified the frames, and moved on. They were never **composed into the atlases**, so every reaction key fell through `CLIP_FALLBACK` to something else. | The client played the live build and asked "where's the fall sprite and i dont see anyone being stomped". A whole feature looked shipped and was not. |
| The clips then went in, and the beat *still* showed three men stomping bare pavement. `drawPlayer` skips frames while `inv` counts down, and the countdown lives in `stepPlayer`, which stops being called the moment he is dead. `inv` froze at 75 — an OFF frame — for all 98 knockdown ticks. | Invisible in code review, obvious in one screenshot. A knockdown always follows a hit, so it failed 100% of the time. |
| The stomper slots were `±46`, measured against the **fallback** clip — a man standing UP. The real downed clip is 162 world units end to end. Both side stompers stood inside his own footprint and covered him. | Same symptom, second cause. Found only because the first fix did not fix it. |

**The rule:** a generated asset is not a shipped feature. The chain is
generate → compose → wire → **drive the running game into that state and
photograph it**. And when a constant was tuned against a placeholder, it is
not a constant, it is a stale measurement — re-measure it against the real
thing the moment the real thing lands.

The corollary that keeps paying: a graceful fallback hides its own trigger. It
is still the right call — the alternative here was the sprite vanishing — but
it converts "broken and obvious" into "subtly wrong forever", so anything
behind a fallback needs a check that asserts the *real* clip is present, not
just that something drew.

---

## 4. Only looking at what worked, never at what was missing

| what happened | cost |
|---|---|
| Reviewed SAM by looking at the **proposal sheet** — which by construction only shows what it found. The client spotted the missing C and I in CRIMINAL and the big CR monogram by eye, from the same image I had been staring at. | Built `sam_coverage.py` afterwards, which renders the *complement*. It found the gaps in one run. Should have existed from the start. |

**The rule:** for any "did we get everything" question, render the negative
space. What is absent is invisible in a view of what is present.

---

## 5. Editing files with fragile anchors

| what happened | cost |
|---|---|
| Spliced a new block into `cut_planes.py` by searching for `"    ],\n}"`. It matched the **first** occurrence, not the end of the dict, and deleted 300+ lines including `main()`. The script then silently did nothing. | Restored from git. Client: *"don't be breaking the files."* Entirely self-inflicted. |
| Used `re.sub` with a replacement string containing a bad escape. | Minor, but the same class. |

**The rule:** anchor on something unique, or parse the structure (walk the
braces). And after any programmatic edit, verify the file still has its
entry point — `tail` it, import it, run it.

---

## 6. Reaching for scale before correctness

| what happened | cost |
|---|---|
| Widened the parallax spread to 0.02 → 0.62 for a "pronounced" 3D effect. Cards slid clean off each other and, because each wraps on its own phase, **the tree migrated a whole plate width across the stage** — starting the level on the left and ending it on the right. | Client: *"the tree from the beginning of the stage is moving to the whole other side."* Correct spread turned out to be 0.010 with a hard clamp. |
| Blitted every card full-frame. 44 Mpx/frame, 37.4ms — worse than the flat backdrop it replaced. | Fixed with viewport clipping (2.9 Mpx, 26.5ms), but shipped a regression first. |
| Ran the mask cutter with a naive labelling loop: 6m39s. With `scipy.ndimage.label`: 1.5s. | ~250× slower for no reason, across many iterations. |

---

## 7. Things the client got right that I did not propose

Worth recording separately, because these were not bugs — they were better
ideas that I should have reached first.

- **Two copies of each backdrop**, one untouched and one for cutting. Client's
  suggestion, and it is the right architecture.
- **Cascade the SAM pass** — coarse for object outlines, then fine for detail.
  I had been treating it as one-pass-with-a-flag and arguing about which
  threshold to pick. Coarse+fine merged took L5P coverage 86.0% → **92.9%**.
- **Add a skyline to Edgewood's black sky** rather than cutting the plate.
  Edgewood is a flat head-on facade with nothing in front of anything;
  manufacturing depth beats extracting depth that is not there.
- **Isolate the marquee drum** the UNDERGROUND letters sit on. I had the
  letters riding the dome card, which meant the glow was bolted to the wrong
  object. The client spotted that the letters "aren't just floating in space".
- **Make text detection the default, not a flag.** Every backdrop in this game
  is a real storefront covered in signage. Lettering is not an edge case here,
  and it must not depend on someone remembering to switch it on.
- **"The art map is horrible, it looks like AI slop."** Exactly right, and the
  reason was structural rather than taste. The map screen was canvas
  primitives — arcs, strokes, `system-ui` — over a procedural tile pattern,
  sitting next to plates that are real Atlanta photographs converted to pixel
  art. Nothing drawn that way can match that. The fix was to stop inventing
  artwork for it: the interstitial is Five Points, the Underground plate IS
  Five Points, so the screen now stands in the game's own art and everything
  printed on top is built from pixels the same size. **When a new screen has
  to match existing art, reuse the art — do not imitate it.**

---

## 8. Testing only the easy half of a two-sided flow

The contest could be entered BEFORE a run or AFTER one. Only the before path
was ever exercised, and the after path — which is how nearly everybody actually
does it — silently threw the run away. `lbSubmit()` returned early when nobody
was registered, and the submit fires at the moment of death, before the panel
has even offered the contest. So: play, die, decide to enter, and the score you
just set was gone.

Nobody found it because the harness that existed tested the half that worked.
**The client found it by asking a question**, not by seeing a symptom: *"I just
wanna make sure that that run is actually added."*

When a flow has an order to it, the orders are separate tests. `entrypaths.mjs`
now grades both, and asserts the held run is flushed exactly once.

## 9. Choosing a datastore without asking what it has to survive

The leaderboard shipped as one Cloudflare KV key holding the whole board, read
→ modified → written on every submit. It works perfectly with one player. With
two finishing at the same moment, both read the old list and the second write
erases the first — a lost score, in a contest with a real prize. KV also allows
about one write per second per key, so a launch party is a queue against a
single key.

None of that is obscure; it is on the first page of KV's documentation. It was
never checked because the store was picked for the shape of the DATA ("a list
of scores") rather than the shape of the LOAD. Again, the client asked the
question that exposed it: *"if a person plays 100 times a day, how can we make
sure it doesn't break?"*

**Pick storage by the concurrency it has to survive, not by what the data looks
like.** D1's `MAX(runs.score, excluded.score)` makes the whole race a database
guarantee instead of application code that happens to run alone.

## 10. Every check ran in Chrome; the client's phone is Safari

The rebuilt leaderboard passed a full green suite and arrived on his phone as a
blank panel with a lone ✕ floating near the middle of the screen. The ✕
position was the whole diagnosis: the card had collapsed to zero width, so its
top-right corner WAS the centre.

`#lbCard` derives its width from its height through `aspect-ratio`, and the
parent was set to `width: auto` — asking the parent to size itself from that
child. Chrome resolves the loop. Safari returns zero.

**A CSS layout change is exactly the class of bug a headless-Chrome harness
cannot see.** Give containers a definite width, and when the change is layout,
say out loud that the suite passing is not evidence.

## 11. A harness drifting into grading last month's product

Running the whole suite end to end for the first time in a while turned up one
red: `ceiling.mjs` still demanded WILL HILL pinned at row 1 with 50,000 — a
benchmark the client had explicitly asked to be REMOVED, and which the code had
correctly stopped producing. The suite was failing on correct code.

Two more in the same family: `introorder.mjs` called a `__title.settledAt()`
that had been designed for an unshipped feature and never existed, then hung
for four minutes polling a `g.introT` that is a local inside `draw()` and reads
undefined on state. It had never been run.

**A test nobody runs is a comment, and a test that outlives the decision it
encoded is worse than none** — it costs an investigation and teaches you to
distrust red.

## 12. A fixed sleep is not a contract

`share.mjs` waited 400ms after tapping SHARE and began reporting the entire
share feature as dead — no download, no clipboard, no error, nothing. Nothing
was broken. The card is an 852x1846 canvas encoded to a 2.5MB PNG, and on a
loaded machine that lands at about four seconds.

The measurement came before the "fix", which is the only reason a working
feature did not get rewritten to chase a phantom. Same fault in a different
costume in `endcue.mjs`: reading a value on the same frame the state flips
returns the previous frame's answer, because `update()` asks for the cue at the
top and the branch that changes the screen runs below it. Three stages passed
and one failed in the same run, on identical code — a race, not a bug.

**Poll the condition. Never sleep a number.**

## 13. Two right diagnoses can still both be wrong

The clouds-through-buildings bug took a week and four diagnoses. The first
three were each defensible and each incomplete: the far/near flag (impossible —
a card is wholly in front or wholly behind), enclosed holes (real, but half),
sky-connected gaps (real, still half). The client named the actual cause from a
screenshot: *"that long shadow strip going down the building is treating that
like it's something separate."* A building's dark side is painted blue and
meets the sky at the roofline, so a blue flood pours in at the roof and runs
the whole strip.

**When a fix reduces a symptom without removing it, the diagnosis is wrong, not
insufficient.** Three rounds were spent making a partial theory more thorough
instead of asking what else could produce the same picture.

## 14. A correction nobody measured had never run at all

The bare title plate's fill had a `gradient_fix()` whose docstring described
exactly the right thing — sample the error where the patch meets the painting,
diffuse it inward so the seam does not step. It had been a NO-OP since the day
it was written. It measured `orig[rim] - filled[rim]` on pixels *outside* the
hole, and the fill only ever wrote *inside* the hole, so the error was
identically zero, the diffusion spread zero, and nothing was ever corrected.

It survived because nothing downstream tested it. The tool printed a seam
number, that number was ~4.6 levels on a sky whose own neighbouring pixels
differ by 0.86, and 4.6 was quietly accepted as "how it is" instead of read as
"the correction you believe is running is not running." A function that cannot
tell you it did something is a comment with a call signature.

Two habits come out of it. **Give every correction a before/after of its own
metric** — had the tool printed the seam pre-fix and post-fix, the two
identical numbers would have exposed it in one run. And **when a measured value
sits stubbornly at the wrong level, suspect the code that claims to fix it
before tuning anything upstream**; two rounds went into better donors while the
thing that was supposed to close the gap was doing nothing.

## 15. "It is only on screen for a second" is not a quality budget

The same fill filled letter-shaped holes with per-row strips, blurred the
interior to hide the row-joins, and justified it in its own header: the plate
is only up for about a second before the lettering lands on top of it. The
client photographed that second. *"Can we do something about the scars and the
sky before the text for Will Hill falls in place."*

Worse, the answer was already in the repo. `cut_title_clouds.py` had measured
this exact sky and written the law down — it is textured, not smooth, so every
smooth fill shows — and the newer tool re-derived the opposite by reasoning
about how long the frame is visible instead of what is in the frame. The
mask's one-pixel margin left the letters' own shadow behind as a second,
independent ghost, which the same "brief" logic had waved through.

**A duration is not a defect budget, and a lesson learned in one tool does not
apply itself to the next one.** When two tools touch the same material, the
second one should be reading the first one's measurements, not its own
intuition about how much anyone will notice.

## 16. A scorer that measures the wrong thing confidently picks the wrong answer

The loop cutter chose lengths by normalised cross-correlation: does the audio
after the cut continue like the audio at the start? That is the right question
on paper, and it is phase-sensitive in practice — two takes of the same groove
a bar apart score near zero. It picked 44 bars for `ui_pause`, a cut whose wrap
measures **3.05×** that track's own typical splice, no better than the loop it
was replacing, and it had no opinion at all about the 48-bar cut sitting at
**1.11×**. The tool was not broken and its number was not wrong; it was
answering a different question from the one the client was asking, which was
*"does this sound like a cut."*

The fix was to score the join the way the ear does — spectra either side of the
wrap, normalised against 200 random splices inside the same track, so the
answer is in that music's own terms. Same candidates, same code path, different
question, and the ranking inverted.

**When a measurement disagrees with the client's ear, check what the
measurement is actually a measurement OF before defending it.** The number was
real the whole time. It just was not the number that mattered.

And a smaller one riding along: the client's own tempo beat the tool's
inference outright. The header had a documented, measured reason for never
snapping to bars — a beat tracker read 89 BPM on a 135 BPM track — and that
reason expired the moment the producer was asked. **A constraint derived from a
tool's limits is not a constraint on the person holding the tool.**

## 17. Three measurements lost to the same ear before anyone handed over the controls

Section 16 ends with the scorer being fixed. It was fixed, and it was wrong
again straight after: the rebuilt scorer rated a 40-bar cut of stage one the
**cleanest join in the whole grid** — 1.09 against a 2.9 average — and the
client heard it stutter. Both were right. The spectrum either side of that
splice matched beautifully *because the last two bars were a duplicate of the
first two*, so the join was joining a phrase to itself. A metric that asks
"does the audio continue" scores a repeat as perfect. Only a person can hear
that something came round twice.

That was the third time a measurement had lost to his ear on the same
material, and the third time the response was a better measurement. The right
response was to stop: build the bench, put the waveform and a millisecond
slider in front of him, and let the tool find numbers while he makes the
judgement. `tools/loopbench.html`.

**When the same person's ear keeps overruling the metric, that is not a signal
to improve the metric. It is a signal that the decision was never the metric's
to make.** Fifteen minutes of tooling would have saved three rounds of it.

## 18. Nearly publishing his masters as a convenience

The bench needed audio. The obvious build rendered fresh clips from the
original tracks so any loop length could be auditioned — which would have put
96-148s of each unreleased instrumental on a public URL, against the 66-102s
the game already serves. Nobody asked for that. It was a side effect of making
the tool nicer, and it would have shipped inside a commit about a slider.

The shipped loops turned out to be the better source anyway — same bytes the
CDN already serves, already cut to start at the hook, and they are what the
game actually sounds like rather than a cleaner render that flatters the join.
The only thing lost is auditioning a LONGER loop, which is now opt-in per cue
(`--master <slot>`) and stated in the interface rather than assumed.

**Check whether the convenient version of a favour is one he would actually
authorise.** His music, his call, and "it makes the tool better" is not
consent. The conservative default was also the more accurate one, which is
usually how this goes.

## 19. The tool and the game were not playing the same thing

He approved a loop at the bench and then said the game had "a pause at the end
of the loop." Both were true. `tools/loopbench.html` plays a loop with
`AudioBufferSourceNode` + `loopStart`/`loopEnd` — sample-accurate, butt-joined.
The game crossed two `<audio>` elements over **0.9 seconds**, so every wrap
played most of a second of bar 16 on top of bar 1. Nobody had noticed because
until he cut a loop himself, the two halves either side of a wrap were the
*same passage* — that is what the old search optimised for — and an overlap of
identical audio is inaudible. The moment the loop point became exact, the
overlap became the artefact.

I spent a while unable to reproduce it, because in the *game* nothing was
wrong by any measure I had: no silence, no dropout, no missing cue. The
mismatch was not inside the game at all. It was between the instrument he
judged with and the thing he judged.

**If someone approves work in one tool and rejects it in another, check that
the two tools do the same thing before looking for the bug in either.** And if
you build someone an instrument to make a decision with, the product has to
honour that instrument exactly, or the decision it produced is not the
decision that ships.

Two of my own bugs on the way there, both the same shape: an element that is
muted is *paused*, so its gain node can sit at full level and still be silent.
Carry that number onto a buffer source, which has no pause, and the music
plays with the sound switched off. Then the "assertion" I added to catch it
cancelled the very ramp that did the muting. **State that is only correct
because something else is switched off is not state, it is a coincidence** —
and a second mechanism will find it.

## The short version

0. **Touch the thing before you describe it** — including when what you are
   describing is a limit. "I can't" is a claim and needs evidence like any
   other. Being right by luck still cost the client an argument.
1. Measure it or don't claim it.
2. Read the code, not my notes about the code.
3. Make every change prove itself with a check that could fail.
4. Look at what's missing, not just what's there.
5. Anchor edits on something unique, then verify the file survived.
6. Get it correct, then get it big.
7. Test both orders of a two-sided flow; the untested half is the common one.
8. Pick storage for the load it must survive, not the shape of the data.
9. A green suite in Chrome is not evidence about Safari, least of all for layout.
10. Poll the condition; a fixed sleep is a guess wearing a number.
11. Run the whole suite sometimes, or it starts grading a product you no longer ship.
12. Print a correction's metric before AND after itself, or you cannot tell it
    from a comment. A number stuck at the wrong level indicts the fix, not the input.
13. A short exposure is not a defect budget — and the lesson another tool
    already measured on the same material does not port itself.
14. Ask what a measurement measures before defending it against the client's ear.
15. A limit that came from a tool's blind spot is not a limit on the person
    holding the tool — the producer knew the tempo all along.
16. If a fix shrinks a symptom without killing it, the theory is wrong — not too small.
17. When a judgement keeps coming back to one person's ear, stop building
    better measurements and build them the controls.
18. Check whether the convenient version of a favour is one the client would
    actually authorise, before it is the thing that shipped.
19. A break-test that proves a control is wired has not proved the checks have
    teeth. Re-run the real assertions against the broken state.
20. If they approve it in one tool and reject it in the product, suspect the
    two tools before suspecting either result.
21. State that is only correct because something else is switched off is a
    coincidence, and the next mechanism will expose it.
