# fall-v2 — the fall clip, regenerated

Not wired into the game yet. `tools/compose_player_sheet.py` still reads
`../fall/spritesheet.png`. This directory is here so the work survives a
container rollback while the client looks at it.

## Why there is a v2 at all

The shipping `fall/spritesheet.png` has **the wrong wardrobe**. Will Hill is
in a rust-coloured flannel that flaps behind him for all 16 frames. He does
not wear a flannel in any other clip — idle, walk, run, jump, hit, downed,
knockback and perform are all the cream tee. Falling into a pothole was the
one moment the character changed clothes.

## Why the first regeneration was thrown away

Sheet `cmswacxl9000rw4u51r0l0ymp`, from pose `cmsw88dl7000vcd71qppweqce`
("Manhole Fall"), fixed the wardrobe and broke something worse: the pose
prompt said *manhole*, so the generator **drew the manhole**. A black rim and
a teal pipe are painted into the sprite in every frame. In game that would
put a chunk of scenery on the player's own transform, rotating with him,
drawn wherever he happens to be.

Two things were tried before regenerating, and both are dead ends worth not
repeating:

- **Threshold + largest-dark-blob removal.** The rim's near-black is the same
  near-black as his outline, his cap and his sneakers, and the blob is one
  connected component with them — 22,128 px of 31,406 opaque. Cutting it
  removes most of the character.
- **SAM point-prompted segmentation** (`/root/sam/sam_vit_b.pth`, the same
  checkpoint `tools/sam_segment.py` uses). Correct in principle, but it is
  ~30s of CPU per frame here and it is the wrong tool: the fix belongs
  upstream in the pose, not downstream in a mask.

Both frames' bounding boxes tell the same story numerically. v1's figure fills
the full 256 cell (e.g. `(22, 0, 234, 256)`); the shipping sheet's is
`(45, 18, 188, 195)`. That matters beyond looks — `compose_player_sheet.py`
sizes **every** clip's cell to a `union_bbox` across all of them, so a fall
frame that fills its cell inflates idle, walk and run too, and moves the
anchors the character rig is measured against.

## What v2 is

- **Pose** `cmswavo1j005kilz8apd2h8gk` — "Free Fall (no scenery)". Character
  alone on an empty background, scenery banned by name in the prompt
  (manhole, rim, pipe, tunnel, hole, ground, street, walls, props, shadow),
  wardrobe pinned to the cream tee and olive cargos, flannel banned by name.
  Kept here as `pose-freefall.png`.
- **Sheet** `cmswb907q005cw4u52w0l4z5e` — 16 frames, 4 columns, 256x256,
  generated with `first_frame_pose_id` set to that pose so the motion is
  specified rather than invented: torso rocking, arms overhead, legs
  bicycling, character locked at frame centre.

Frame 15's bounding box is `(43, 39, 214, 210)` — identical to frame 0's, so
the loop closes on itself.

## Wiring it up

Replace `../fall/spritesheet.png` with this one and re-run
`python3 tools/compose_player_sheet.py`. The clip entry in `CLIPS` needs no
change: it already expects a 4x16 grid of 256px cells at 2 ticks per frame.
