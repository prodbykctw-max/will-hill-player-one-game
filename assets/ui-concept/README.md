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

## Using them

- Portrait, ~852x1845 — deliberate, so the cabinet fills a phone screen.
- The lit screen opening inside the housing is the region live controls get
  placed against; measure it off the PNG rather than guessing.
- `TIME OF DAY` shows `ATLANTA TIME` because that is the real worldwide
  default — the point of the feature, in the client's words *"the goal was to
  bring Atlanta to the world."*
