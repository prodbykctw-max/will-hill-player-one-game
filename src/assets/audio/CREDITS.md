# Audio sources and credits

Rebuild every shipped file with `python3 tools/make_sfx.py`.

## Stomp — KC TW's own voice

`punch-a.mp3` and `punch-b.mp3` are **KC TW's voice**, recorded as a phone
voice memo. Twelve mouth-punches; takes 3 and 4 are the ones he picked. They
alternate in game so no two stomps sound identical.

They beat every sample in Kenney's pack for this. Measured, Kenney's
`impactPunch_*` files are 84–94% low-frequency energy over 200–370ms — impact
*thuds*, and at full weight the stomp read as a kick drum rather than a punch.
His takes are the opposite problem, 1–6% low: pure slap, no body, because a
mouth cannot make one.

So each shipped punch is his slap with a synthesised body under it, soft-clipped
together. The body level is **solved per take** rather than fixed: at one
shared gain take 3 landed at 57% low and take 4 at 69%, so the two alternating
punches did not even match each other. Both are now solved to 30% — a slap with
weight behind it — which took a body gain of 0.42 and 0.30 respectively.

The source recording lives in `assets/sfx-src/kctw-punches.m4a`, git-ignored
with all raw assets. Without it the punches cannot be rebuilt.

## Pickups — Kenney Interface Sounds

From **Kenney — Interface Sounds** (https://kenney.nl/assets/interface-sounds),
**CC0 1.0 Universal**. No attribution required; this is provenance, not
obligation.

| shipped | source | why |
|---|---|---|
| `coin.mp3` | `confirmation_003.ogg` | short and bright — a frequently-repeated pickup cannot be long |
| `glisten.mp3` | `confirmation_002.ogg` | longer, rises further; an ascending sound is what reads as a power-up |

Chosen by ear from a comparison bench built off measured candidates. Ranking
was by how much brighter each sound gets by its end, since that rise is what
makes a sparkle read as a sparkle.

## Credits

To appear in the end-credits sequence, alongside the **Rare Agency logo** and
**KC TW's own logo** (neither asset supplied yet).

| role | credit |
|---|---|
| Game development — front and back end, app and web | **prodbyKCTW** |
| Sound effects | **SFX prod by KC TW** |
| Agency | **Rare Agency** — KC TW as Lead Developer |

Stage name, not the legal one (Melvin D. Brown III). That is the normal split:
the legal name belongs on contracts and rights paperwork, the working name
belongs on screen, because it is the name the work is findable under.

**Unconfirmed:** the exact styling of "Rare Agency" — whether it is two words,
and its casing — was taken down from speech and has not been checked.
