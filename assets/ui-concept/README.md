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
| `contest-entry.png` | 1086 x 1448 | the ENTER CONTEST sign-up cabinet |
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
contest sign up page."* Every rect below is measured off the 1086 x 1448
plate, by colour, and verified by drawing the box back onto the image.

| control | x | y | maps to |
|---|---|---|---|
| card (the lit screen) | 207 – 635 | 500 – 824 | — |
| NAME field | 225 – 619 | 581 – 625 | `#fName` |
| PHONE field | 225 – 619 | 671 – 715 | `#fPhone` |
| EMAIL field | 225 – 619 | 761 – 806 | `#fEmail` |
| painted ✕ | 590 – 632 | 502 – 544 | `#panelClose` |
| CANCEL | 735 – 870 | 672 – 724 | the same handler as NOT NOW |
| red X button | 763 – 837 | 749 – 822 | the same handler as NOT NOW |
| SAVE & ENTER | circle, centre 537, 1042 | radius 99 | `#btnSave` |
| LEADERBOARD row | 705 – 975 | 945 – 1030 | the board view |
| RULES & PRIZES row | 705 – 975 | 1040 – 1125 | HOW TO PLAY |
| marquee glass | 117 – 999 | 41 – 149 | where a validation error goes |

His painted placeholders say exactly what the code's placeholders say — *The
name on the leaderboard*, *10 digits — how we reach a winner*, *Backup
contact, never shown*. So the inputs sit transparent over his lettering while
they are empty, and paint their own interior (`rgb(4,12,21)`, sampled from the
field) only once there is a value to show. Empty state is 100% his pixels.

## Using them

- Portrait, ~852x1845 — deliberate, so the cabinet fills a phone screen.
  `contest-entry.png` is the exception at 3:4; it was drawn on his phone in a
  different tool and does not have the same aspect ratio as the others.
- `TIME OF DAY` shows `ATLANTA TIME` because that is the real worldwide
  default — the point of the feature, in the client's words *"the goal was to
  bring Atlanta to the world."*
