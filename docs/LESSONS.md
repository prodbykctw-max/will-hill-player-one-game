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

---

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
