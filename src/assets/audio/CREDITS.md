# Audio sources

## Stomp impact

Two samples from **Kenney — Impact Sounds** (https://kenney.nl/assets/impact-sounds),
released under **CC0 1.0 Universal** (public domain). No attribution is
required; this file exists for provenance, not obligation.

| shipped file | source | processing |
|---|---|---|
| `punch-medium.mp3` | `impactPunch_medium_000.ogg` | none — used as recorded |
| `punch-heavy.mp3` | `impactPunch_heavy_001.ogg` | low end removed |

**Why heavy_001 is filtered.** Measured, the pack's punches are 84–94%
low-frequency energy — they are impact thuds, and at full weight the stomp
read as a kick drum rather than a punch. `heavy_001` was high-passed with a
steep FFT filter (silent below 260Hz, raised-cosine ramp to unity by 700Hz),
taking it from 91.8% to 35.3% low. A gentle 12dB/oct slope was tried first and
was nowhere near enough: even cornered at 400Hz it only reached 65%, because
the energy is concentrated far too low for a shallow filter to shift.

Regenerate with `tools/make_sfx.py`.

## Everything else

Pickups, the power-up glisten and the fallback punch are synthesised at
runtime in `src/audio/audio.js` — no files, no licences.
