#!/usr/bin/env python3
"""The three pieces of the title wordmark SAM could not separate.

WHAT IT CUTS, AND WHY EACH ONE IS NEEDED

  wordmark  WILL HILL:, the white line. It was never a card at all — measured,
            39,668 of the 39,674 gold pixels are inside the SAM logo mask and
            only 155 white ones are — so it lived in the backdrop and could not
            appear until the whole backdrop faded up, which is AFTER the line
            beneath it. That is why the intro read backwards. Client: "his name
            should appear and PLAYER ONE appear last than all of that."
  logo      PLAYER ONE, the gold line, RE-CUT. The SAM mask took the gold plus
            chunks of sky plus half of the right-hand star, which is what the
            client saw during the assembly: "look at the stars, they're not
            landing complete, they're broken off or partly."
  stars     The two red stars, cleanly and both of them, so they can land at
            the same moment as PLAYER ONE — his other note on the same beat.

⚠️ EVERY CARD IS EMITTED AT THE FULL PLATE SIZE, 853x1844, WITH THE ELEMENT
SITTING IN TRANSPARENCY. This is the contract and it is not optional. A
previous pass emitted cards cropped to their bounding box (813x85 for one of
them); the renderer stretches a card across the whole plate rect, so an
85-pixel-tall strip became a 21.7x vertical smear and the title screen came
out as full-height white bars. Check any new card against an existing one:

    logo   853x1844 RGBA        <- correct
    signL  853x1844 RGBA        <- correct

Nothing is inpainted. The base stays the whole uncut painting — the rule this
project settled on after "bruises everywhere" — so every card lands back
exactly on top of its own twin and there is no hole to fill.
"""
import json
import os
import sys

import numpy as np
import scipy.ndimage as ndi
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
BG = os.path.join(HERE, '..', 'src', 'assets', 'backgrounds')
PLATE = os.path.join(BG, 'title-portrait.webp')
PLANES = os.path.join(BG, 'title-portrait-planes.json')

# The wordmark band. Measured: every glyph of WILL HILL: spans y 172-258 and
# the line spans x 173-697 including the colon; the gold starts at y 231.
BAND = (140, 440)
TEXT_X = (155, 715)
WHITE_MAX_Y = 278
# The stars sit well outside the letters — left at x 33-63, right at x 792-823,
# both y ~321-356. Keying red alone also lights the dark shading inside the
# gold glyphs, so position is what separates them, not colour.
STAR_EDGE = 100          # a star's centre is inside this of a frame edge
FEATHER = 1.1


def channels(rgb):
    mx = rgb.max(2)
    mn = rgb.min(2)
    return mx, np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)


def cut_wordmark(rgb):
    """WILL HILL: — bright and unsaturated, on the top line of the band."""
    mx, sat = channels(rgb)
    m = (mx > 150) & (sat < 0.22)
    keep = np.zeros(m.shape, bool)
    keep[BAND[0]:WHITE_MAX_Y, TEXT_X[0]:TEXT_X[1]] = True
    m &= keep
    # The glyphs carry a thick black outline the brightness key cannot see.
    # Close it back on and fill, or every letter comes out hollow.
    m = ndi.binary_fill_holes(ndi.binary_closing(m, np.ones((5, 5), bool)))
    return grow_outline(rgb, drop_specks(m, 200))


def cut_logo(rgb):
    """PLAYER ONE — warm, saturated, below the white line."""
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    _, sat = channels(rgb)
    m = (R > 120) & (R > B + 55) & (G > B + 25) & (sat > 0.35)
    keep = np.zeros(m.shape, bool)
    keep[WHITE_MAX_Y - 60:BAND[1], TEXT_X[0] - 80:TEXT_X[1] + 80] = True
    m &= keep
    m = ndi.binary_fill_holes(ndi.binary_closing(m, np.ones((5, 5), bool)))
    return grow_outline(rgb, drop_specks(m, 200))


def cut_stars(rgb):
    """Both red stars, and only them."""
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    _, sat = channels(rgb)
    m = (R > 85) & (R > G * 1.7) & (R > B * 1.4) & (sat > 0.45)
    m[BAND[1]:, :] = False
    lab, n = ndi.label(ndi.binary_closing(m, np.ones((3, 3), bool)))
    if not n:
        raise SystemExit('no stars found')
    w = rgb.shape[1]
    keep = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        ys, xs = sl
        cx = (xs.start + xs.stop) / 2
        if int((lab[sl] == i).sum()) < 150:
            continue
        # Only the two out at the frame edges; everything else this key finds
        # is shading inside the gold letters.
        if cx < STAR_EDGE or cx > w - STAR_EDGE:
            keep.append(i)
    if len(keep) != 2:
        raise SystemExit(f'expected 2 stars, matched {len(keep)}')
    return grow_outline(rgb, ndi.binary_fill_holes(np.isin(lab, keep)))


def grow_outline(rgb, m, rings=3):
    """Take the black outline with the glyph.

    Every one of these elements is drawn with a hard dark keyline. A colour key
    sees the face and not the line, so a card cut on colour alone lands with a
    bright edge and no outline and reads as a sticker. Dilating and keeping
    only the DARK pixels the dilation reaches picks the keyline up without
    dragging in the sky next to it.
    """
    lum = rgb.mean(2)
    grown = ndi.binary_dilation(m, np.ones((3, 3), bool), iterations=rings)
    return m | (grown & (lum < 80))


def drop_specks(m, min_px):
    lab, n = ndi.label(m)
    if not n:
        return m
    sizes = ndi.sum(m, lab, range(1, n + 1))
    small = [i for i, s in enumerate(sizes, 1) if s < min_px]
    return m & ~np.isin(lab, small) if small else m


def alpha_of(m):
    a = ndi.gaussian_filter(m.astype(np.float32), FEATHER)
    a = np.clip((a - 0.32) / 0.5, 0, 1)
    return np.maximum(a, m.astype(np.float32))


def emit(rgb, m, name, planes):
    """Write a FULL-PLATE RGBA card. See the warning at the top of this file."""
    ys, xs = np.where(m)
    if not len(ys):
        raise SystemExit(f'{name}: empty mask')
    h, w = m.shape
    a = (alpha_of(m) * 255).astype(np.uint8)
    card = np.dstack([rgb.astype(np.uint8), a])          # full plate, not a crop
    assert card.shape[:2] == (h, w), 'card must be the whole plate'
    Image.fromarray(card, 'RGBA').save(
        os.path.join(BG, f'titlep-{name}.webp'), quality=95, method=6)
    planes[name] = {
        'px': int(m.sum()),
        'frac': [round(xs.min() / w, 4), round(ys.min() / h, 4),
                 round((xs.max() + 1) / w, 4), round((ys.max() + 1) / h, 4)],
    }
    print(f'  {name:9s} {int(m.sum()):7d}px  x {xs.min()}..{xs.max()}  '
          f'y {ys.min()}..{ys.max()}  -> titlep-{name}.webp  ({w}x{h})')


def main():
    rgb = np.asarray(Image.open(PLATE).convert('RGB'))
    print(f'title-portrait {rgb.shape[1]}x{rgb.shape[0]}')
    cuts = {'wordmark': cut_wordmark(rgb), 'logo': cut_logo(rgb),
            'stars': cut_stars(rgb)}

    if '--proof' in sys.argv:
        proof = rgb.copy()
        for m, col in zip(cuts.values(), ([255, 0, 160], [0, 255, 160], [0, 200, 255])):
            proof[m] = col
        Image.fromarray(proof).save('/tmp/title_extras_proof.png')
        print('  -> /tmp/title_extras_proof.png  (nothing written to the repo)')
        return

    planes = json.load(open(PLANES))
    for name, m in cuts.items():
        emit(rgb, m, name, planes)
    json.dump(planes, open(PLANES, 'w'), separators=(',', ':'))
    print(f'  planes -> title-portrait-planes.json ({len(planes)} cards)')


if __name__ == '__main__':
    main()
