Will Hill performing — the finale at Criminal Records.

4x16 grid, 256px cells, generated front-on rather than the side profile every
other clip uses, because at a show he faces the crowd and the camera is in the
crowd. Mic up to his mouth, other arm raised, bouncing on the beat. Isolated on
an empty background so the venue art can go behind him.

NOT COMPOSED INTO will-hill.atlas.json YET, on purpose. Nothing draws it until
the concert scene exists, and sixteen unused frames would grow the shipped
sheet for no benefit. It costs nothing in cell size when it does go in — its
bbox (x 81-193, y 3-243) sits inside the atlas's existing 15-244 x 0-251 box,
so adding it will not re-trim every other clip.

To wire it: add a `perform` entry to CLIPS in tools/compose_player_sheet.py
with `'grid': (4, 16)`, and a KEY_MAP entry, same as the other reaction clips.
