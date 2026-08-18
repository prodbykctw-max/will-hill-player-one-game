# UI concept art — the MARTA cabinet screens

Commissioned and iterated by the client in ChatGPT, on his phone, across
several passes. These are the **approved finals**. The real screens get built
by measuring against them, so they are kept at full resolution.

| file | size | what it is |
|---|---|---|
| `options.png` | 852 x 1846 | the OPTIONS panel |
| `settings.png` | 852 x 1846 | SETTINGS, everything **ON**, TIME OF DAY = ATLANTA TIME |
| `settings-all-off.png` | 878 x 1791 | SETTINGS, everything **OFF** — the pill state a painting cannot hold |
| `settings-empty.png` | 852 x 1846 | SETTINGS with the value sockets cleared |
| `settings-tod-values.png` | 1024 x 1536 | the four TIME OF DAY values, drawn separately |
| `dashboard.png` | 853 x 1844 | the contest dashboard, populated |
| `dashboard-empty.png` | 853 x 1844 | the same dashboard with every value emptied — **this is the one that ships** |
| `contest-entry.png` | 853 x 1844 | the ENTER CONTEST sign-up cabinet — pass 3, and the source the shipped **crop** is cut from |
| `contest-entry-console.png` | 851 x 1849 | pass 2: portrait, but with a driver's console along the bottom |
| `contest-entry-wide.png` | 1086 x 1448 | pass 1: too wide for a phone without cropping a third of it |
| `underground-wide-day.png` | 1535 x 1024 | the wide Underground plate, day |
| `underground-wide-night.png` | 1535 x 1024 | the wide Underground plate, night |
| `underground-wide-stacked.png` | 1535 x 1024 | both, stacked, as he sent them |

⚠️ `settings-all-off.png` is a **different canvas** from `settings.png` — 878 x
1791 against 852 x 1846. Each render came back its own size. `align()` in
`tools/cut_cabinet.py` resamples any of them so the panel lands on the
reference panel before anything is cut out; do not crop one against the
other's coordinates.

## They match the shipped product, and that took correcting

Earlier passes carried a lot the game cannot back up: a CONTEST INFO block, an
editable SCORING block, four tabs, DIFFICULTY / TUTORIAL HINTS /
AUTO-ACCELERATE / SHOW BLOOD / LANGUAGE / UNITS rows, `WILL_HILL` pinned at
rank 1, seven-figure scores against a measured ceiling of 61,650, three
invented anti-cheat reasons (IMPOSSIBLE MOVEMENT, MODIFIED CLIENT, VPN
DETECTED), a "PAID TO CONTINUE" tile in a game with no purchases, and an
"ALL REGIONS" filter on a field that filters by name or phone. All gone.

Two label errors in these finals were mine, caught by the client against a
live screenshot, and both came from reading element **IDs** and inventing the
**labels**:

- Settings is **MUSIC / SOUND EFFECTS / VIBRATION**, not "SOUND / SOUND
  EFFECTS / HAPTICS".
- Options is **four** buttons ending in **BACK TO GAME**, plus a **✕** — not
  three plus CLOSE.

Read the real strings out of `src/ui/panel.js` before briefing another pass.

## Measured panel rects

The amber-bordered panel is where live controls go. Measured off the PNGs by
finding the longest amber runs (`r - b > 45`), then verified by drawing the
box back onto the image and looking at it — the numbers alone were wrong three
times before that check.

| file | panel x | panel y | size |
|---|---|---|---|
| `options.png` | 110 – 655 | 207 – 1208 | 546 x 1002 |
| `settings.png` | 143 – 643 | 236 – 1382 | 501 x 1147 |

Don't measure this by luminance or by local flatness. The housing is dark
metal and the screen is dark glass, so "the big dark region" is the whole
cabinet, and "the big flat region" lands on whichever card happens to be
emptiest — on `dashboard.png` it picks CITIES.

Within `options.png`, the four button borders sit at y 418–565, 613–757,
806–949 and 997–1138. In `settings.png` the BACK button is y 958–1021; the
three toggle rows have no full-width amber rule, so they do not show up in a
row profile.

## ⚠️ The two housings are not the same painting

They look identical and they are not. Masking out both panels and diffing the
housings gives a mean absolute difference of **48.6 / 765**, with **48% of
housing pixels differing by more than 30**. The MARTA logo, the joystick, the
ALERT lamps and the whole cabinet frame sit at different offsets and scales —
each image was generated independently.

So they cannot be shipped as one housing with two panel contents without
choosing. If both PNGs are used as-is, going OPTIONS → SETTINGS makes the
entire cabinet jump, which reads as a broken transition.

**Pick one housing** — `options.png`'s is the fuller cabinet view — clear its
screen area, and draw both panels live inside the one plate. That halves the
asset weight as well.

## `contest-entry.png` — the sign-up cabinet

His words: *"I want you to activate these buttons so I can use this as my
contest sign up page."*

⚠️ **Three passes, and only pass 3's numbers are live.** Pass 1 was 1086x1448
— filling a 430x932 phone with a 3:4 plate would have thrown 418 plate pixels
off the sides, taking the A–E buttons, the coin column and half the OPTIONS
panel. He redrew it portrait (pass 2), then again without the driver's console
(pass 3), adding a CONTEST INFO column and lettering the cancel plate NOT NOW
/ CANCEL to match the code. All three are kept because Drive reuses the same
filename — pass 1 and 2 are already gone from it.

Every rect below is measured off **pass 3**, by colour, and verified by
putting a live element on each one and asserting `elementFromPoint` returns it
at five viewport sizes. If the plate changes again, none of these carry over.

⚠️ **THE SHIPPED PLATE IS NOW A CROP OF THIS ONE — 853 x 992, cut at y992.**
Client: *"crop this image out of the contest registration image. It will alone
be the sole contest reg view."* The table below is still in the FULL plate's
coordinates, because that is what this file documents and what
`tools/crop_entry_plate.py` reads. To get the shipped card's fractions, every
vertical number goes through `v' = v * 1844 / 992` and every horizontal one is
unchanged; the tool prints the conversion. `index.html` holds the converted
values and is the live copy.

| control | x | y | maps to |
|---|---|---|---|
| card (the lit screen) | 151 – 518 | 511 – 959 | — |
| NAME field | 167 – 499 | 616 – 679 | `#fName` |
| PHONE field | 167 – 499 | 739 – 802 | `#fPhone` |
| EMAIL field | 167 – 499 | 862 – 925 | `#fEmail` |
| painted ✕ | 486 – 498 | 534 – 547 | `#entryClose` — was `#panelClose` |
| NOT NOW / CANCEL | 603 – 717 | 750 – 829 | `#btnSkip` |
| red X button | 613 – 690 | 817 – 898 | `#btnFormX`, same handler |
| **the silver knob** | **603 – 694** | **537 – 635** | `#btnSave` — a green tick is composited here |
| CONTEST INFO panel | 720 – 807 | 645 – 1049 | HOW TO PLAY — he drew two doors to one room; **clamped**, it runs 57px past the cut |
| ~~SAVE & ENTER~~ | 302 – 534 | 1050 – 1315 | **below the cut — gone** |
| ~~LEADERBOARD row~~ | 573 – 842 | 1060 – 1179 | **below the cut — gone** |
| ~~RULES & PRIZES row~~ | 591 – 841 | 1210 – 1329 | **below the cut — gone** |

### Why the crop costs a button, and what replaces it

His gold ENTER disc is centred (418, 1182) with a radius of 116 — entirely
below y992 — so cropping the cabinet throws away its own submit control. The
silver knob is the only thing in that column that survives, and it becomes SAVE.

It is drawn as a **green tick**, not as his ENTER shrunk down: his cabinet
already teaches that the round buttons in that column are the actions, so red X
is cancel and green tick is confirm, read with no words to translate. ENTER at
knob size would be 232 plate px of lettering squeezed into 91.

The button is HIS red CANCEL disc: cross inpainted out with a per-RADIUS median
(his button is concentric — a per-row median, which is right for the flat
settings pills, breaks his inner ring into arcs), tick redrawn at his measured
stroke width in his measured ink, then R and G swapped so the green is his own
red gradient rather than a colour anyone chose. It is fitted inside his inner
ring, which the radial profile puts at r=22.5 — a groove at r21–22 with a lit
edge at r24. **His own cross overshot that ring at r=28**, so the cross's radius
is the wrong target to copy.

If he would rather draw the tick himself — as he did for the settings pill
states, *"I CAN LITERALLY EDIT THE IMAGE TO EXACTLY AS NEEDED"* — dropping a
PNG at `assets/ui-concept/contest-confirm.png` makes the tool use it instead.

LEADERBOARD and RULES & PRIZES going costs nothing reachable: CONTEST INFO
already opens what RULES & PRIZES opened, and after a run NOT NOW lands on the
board.

His painted placeholders say exactly what the code's placeholders say — *The
name on the leaderboard*, *10 digits — how we reach a winner*, *Backup
contact, never shown*. So the inputs sit transparent over his lettering while
they are empty, and paint their own interior only once there is a value.
Empty state is 100% his pixels.

⚠️ **The error message has a character budget.** It renders inside his card,
which is 367 plate px wide — about nineteen characters a line at a size that
survives a phone. Anything over ~34 characters runs to three lines and covers
his NAME label. The validators in `src/ui/panel.js` were shortened to fit and
carry a comment saying so.

## Using them

- Portrait, ~852x1845 — deliberate, so the cabinet fills a phone screen. Every
  shipping plate now has that shape, `contest-entry.png` included; the 3:4
  pass-1 sketch is kept only as `contest-entry-wide.png`.
- `TIME OF DAY` shows `ATLANTA TIME` because that is the real worldwide
  default — the point of the feature, in the client's words *"the goal was to
  bring Atlanta to the world."*
