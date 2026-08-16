# UI concept art — the MARTA cabinet screens

Commissioned and iterated by the client in ChatGPT, on his phone, across
several passes. These are the **approved finals**. The real screens get built
by measuring against them, so they are kept at full resolution.

| file | size | what it is |
|---|---|---|
| `options.png` | 852 x 1846 | the OPTIONS panel |
| `settings.png` | 852 x 1846 | the SETTINGS panel |
| `dashboard.png` | 853 x 1844 | the contest dashboard, empty state |

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

## Using them

- Portrait, ~852x1845 — deliberate, so the cabinet fills a phone screen.
- `TIME OF DAY` shows `ATLANTA TIME` because that is the real worldwide
  default — the point of the feature, in the client's words *"the goal was to
  bring Atlanta to the world."*
