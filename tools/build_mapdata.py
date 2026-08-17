#!/usr/bin/env python3
"""
Bake the dashboard's three map zooms into cloudflare/mapdata.js.

WHY THIS EXISTS
---------------
Client, on the heatmap: "you need to actually plot a live map... as accurate
as possible and zoom in as much as possible for realism. You can get a map
from online, there's free online sources... but we need an actual overlay of
actual map location so it's realistic, so it's functional, so it's real real
world." And on the switch under it: "the option pops up the world, North
America and Atlanta — none of that is a button that I can touch."

So the map is real geography at three real zooms, and the chips move it.

⚠️ STILL NOTHING IS FETCHED AT RUN TIME. dashboard-worker.js serves a page
with `default-src 'none'` because it joins public scores to private phone
numbers; a tile server would learn, request by request, which part of the map
the contest owner is looking at, and a map library from a CDN would hold
script access to exactly the page that must not be trusted out. Everything
below is baked in at build time and shipped as text.

SOURCES, ALL FREE AND REDISTRIBUTABLE
-------------------------------------
  Natural Earth 1:50m admin-0 countries          public domain
  Natural Earth 1:50m admin-1 state/province lines
  OpenStreetMap via Overpass                     ODbL, attribution required
                                                 and printed on the page

Fetch them into a working directory first:

  B=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson
  curl -o ne_50m_admin_0_countries.geojson $B/ne_50m_admin_0_countries.geojson
  curl -o ne_50m_admin_1_states_provinces_lines.geojson \\
       $B/ne_50m_admin_1_states_provinces_lines.geojson

  # Atlanta: motorway/trunk/primary, and rivers/lakes, over the metro box.
  # Overpass 504s under load — retry, it comes back.
  curl -X POST -d '[out:json][timeout:180];
    way["highway"~"^(motorway|trunk|primary)$"](33.52,-84.95,34.08,-83.85);
    out geom;' https://overpass-api.de/api/interpreter -o atl_wide.json
  curl -X POST -d '[out:json][timeout:180];(
    way["waterway"="river"](33.60,-84.60,33.95,-84.15);
    way["natural"="water"](33.60,-84.60,33.95,-84.15););
    out geom;' https://overpass-api.de/api/interpreter -o atl_water.json

Then:
    python3 tools/build_mapdata.py <dir>

The world zoom is NOT rebuilt here — it is the 1:110m outline already in
cloudflare/worldmap.js, which is correct for a whole-globe view and has been
on the page since the map went in.

FORMAT
------
"lon,lat lon,lat|lon,lat ..." — space between points, pipe between rings.
Raw degrees, so the page can hand them straight to an SVG path inside a
<g transform="scale(k,-1)"> and let the browser do the projection. Smaller
than JSON and one split() to parse.
"""
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'cloudflare', 'mapdata.js')

# Clip boxes, a little wider than the views themselves so nothing pops in at
# the edge when the panel's aspect ratio works out slightly different.
US_BOX = (-178.0, 8.0, -20.0, 74.0)
ATL_BOX = (-85.00, 33.50, -83.80, 34.10)


def dp(points, tol):
    """Douglas-Peucker. Degrees in, degrees out."""
    if len(points) < 3:
        return points
    x0, y0 = points[0]
    x1, y1 = points[-1]
    dx, dy = x1 - x0, y1 - y0
    den = math.hypot(dx, dy)
    worst, wi = -1.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        if den == 0:
            d = math.hypot(px - x0, py - y0)
        else:
            d = abs(dy * px - dx * py + x1 * y0 - y1 * x0) / den
        if d > worst:
            worst, wi = d, i
    if worst <= tol:
        return [points[0], points[-1]]
    return dp(points[:wi + 1], tol)[:-1] + dp(points[wi:], tol)


def span(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return max(max(xs) - min(xs), max(ys) - min(ys))


def clip(points, box):
    """Keep the runs of a line that fall inside the box, with one point of
    overhang each side so a road does not stop short of the frame."""
    x0, y0, x1, y1 = box
    runs, cur = [], []
    for i, (x, y) in enumerate(points):
        if x0 <= x <= x1 and y0 <= y <= y1:
            if not cur and i:
                cur.append(points[i - 1])
            cur.append((x, y))
        else:
            if cur:
                cur.append((x, y))
                runs.append(cur)
                cur = []
    if cur:
        runs.append(cur)
    return [r for r in runs if len(r) > 1]


def enc(rings, dp_tol, places):
    out = []
    for r in rings:
        r = dp(r, dp_tol)
        if len(r) < 2:
            continue
        out.append(' '.join(f'{x:.{places}f},{y:.{places}f}'.replace('.0,', ',')
                            for x, y in r))
    return '|'.join(out)


def rings_of(geom):
    t, c = geom['type'], geom['coordinates']
    if t == 'Polygon':
        return [c[0]]
    if t == 'MultiPolygon':
        return [p[0] for p in c]
    if t == 'LineString':
        return [c]
    if t == 'MultiLineString':
        return list(c)
    return []


def load(d, name):
    with open(os.path.join(d, name), encoding='utf-8') as fh:
        return json.load(fh)


def overpass_lines(doc):
    out = []
    for el in doc.get('elements', []):
        g = el.get('geometry')
        if g:
            out.append([(p['lon'], p['lat']) for p in g])
    return out


def main():
    d = sys.argv[1] if len(sys.argv) > 1 else '.'

    # ── NORTH AMERICA: coastline plus the state and province lines ──────────
    land = []
    for f in load(d, 'ne_50m_admin_0_countries.geojson')['features']:
        for r in rings_of(f['geometry']):
            land += clip(r, US_BOX)
    lines = []
    for f in load(d, 'ne_50m_admin_1_states_provinces_lines.geojson')['features']:
        for r in rings_of(f['geometry']):
            lines += clip(r, US_BOX)

    # ── ATLANTA: the real road network and the real water ───────────────────
    # ⚠️ THROW AWAY THE RAMPS. OSM splits an interchange into dozens of tiny
    # ways; at this zoom one pixel is 0.0035 degrees, so a 200m slip road is
    # 60 pixels of file for half a pixel of picture. Dropping ways whose span
    # is under 120m took the road network from 586KB to a size the page can
    # actually carry, and nothing visible went with it.
    roads = [r for ln in overpass_lines(load(d, 'atl_wide.json'))
             for r in clip(ln, ATL_BOX) if span(r) > 0.0012]
    water = [r for ln in overpass_lines(load(d, 'atl_water.json'))
             for r in clip(ln, ATL_BOX) if span(r) > 0.004]

    # Tolerances are set from the pixel, not from taste. The panel is about
    # 310 CSS px wide on his phone: NORTH AMERICA spans 150 degrees there
    # (0.48 deg/px) and ATLANTA spans 1.1 (0.0035 deg/px). 0.2 and 0.0025 are
    # both under half a pixel of error at those zooms.
    parts = {
        'usLand': enc(land, 0.20, 2),
        'usLines': enc(lines, 0.20, 2),
        'atlRoads': enc(roads, 0.0025, 4),
        'atlWater': enc(water, 0.0025, 4),
    }
    for k, v in parts.items():
        n = sum(s.count(' ') + 1 for s in v.split('|')) if v else 0
        print(f'{k:10s} {len(v) / 1024:7.1f} KB  {n:6d} points', file=sys.stderr)

    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write(
            '// Generated by tools/build_mapdata.py — do not hand-edit.\n'
            '//\n'
            '// The dashboard map at two zooms below the globe. The world zoom\n'
            '// lives in worldmap.js; these are NORTH AMERICA and ATLANTA.\n'
            '//\n'
            '// usLand/usLines: Natural Earth 1:50m, public domain.\n'
            '// atlRoads/atlWater: OpenStreetMap contributors, ODbL. The page\n'
            '// carries the attribution — that licence requires it.\n'
            '//\n'
            '// "lon,lat lon,lat|..." — space between points, pipe between\n'
            '// rings. Raw degrees; the page projects them with one SVG\n'
            '// transform.\n\n')
        fh.write('export const MAPS = {\n')
        for k, v in parts.items():
            fh.write(f"  {k}: '{v}',\n")
        fh.write('};\n')
    print(f'wrote {OUT} ({os.path.getsize(OUT) / 1024:.1f} KB)', file=sys.stderr)


if __name__ == '__main__':
    sys.setrecursionlimit(20000)
    main()
