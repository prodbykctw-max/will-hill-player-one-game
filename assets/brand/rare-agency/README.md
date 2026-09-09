# RARƎ AGENCY logo

Supplied by the client on 2026-09-09. Kept in the repo under the rule in
CLAUDE.md: **if losing the file means the work cannot be rebuilt, commit it.**
This is a brand mark, it was not made here, and it cannot be regenerated —
`assets/brand/prodbykctw/README.md` had flagged it as STILL MISSING until
now.

The mark: `RARƎ` (the final E is genuinely reversed — see
`src/assets/audio/CREDITS.md` and `src/render/credits.js` for why that's a
real Unicode character, not a styling trick) in black, `AGENCY` in a
sky-blue, both inside a blue rounded-rectangle frame with a small triangular
accent under the reversed E. Two files arrived:

| file | |
|---|---|
| `rare-agency-logo-full-color.png` | the complete lockup — RARƎ + AGENCY + frame, flat white background, no alpha channel |
| `rare-agency-frame-agency-only.png` | just the frame + AGENCY wordmark, transparent background, blank space where RARƎ would sit — purpose unclear (possibly a template awaiting a symbol); not used anywhere yet |

**The game doesn't use either file directly.** The full-color lockup was
drawn for a white background — composited straight onto the credits
screen's black fill, the black RARƎ wordmark disappears into it. The game
uses a derived dark-background variant instead: `src/assets/brand/
rare-agency-logo.webp`, built by `tools/matte_rare_agency.py`
(alpha-matted off the white backing, RARƎ recolored to the same cream
`src/render/credits.js` already uses for its own body text, AGENCY/frame
left the original blue since that half already reads fine on black). If the
source lockup ever changes, re-run that script rather than hand-editing the
derived file.
