# Sound sources

## Kept in the repo

- **`kctw-punches.m4a`** — prodbyKCTW's own voice, twelve mouth-punches from a
  phone voice memo. The shipped stomp is cut from takes 3 and 4 of this.
  Irreplaceable: it is a performance, not an asset that can be regenerated.

## Deliberately NOT kept

Everything else here is build scratch and is git-ignored, because it can all be
recreated by `python3 tools/make_sfx.py`:

- `kenney_*.zip` — fetched automatically from stable URLs at kenney.nl
- `*.ogg` — extracted from those zips
- `*.wav`, `_decode.wav` — intermediate decodes on the way to the shipped mp3s

If this directory is empty apart from the m4a and this file, that is correct.
Run the script and the rest reappears.
