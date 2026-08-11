// The 4 stages — real Atlanta neighborhoods. See docs/GDD.md "Setting:
// Atlanta, 4 stages" for the background reference descriptions each `bgRef`
// points at.
//
// `recipe` fields drive world/generator.js's per-column procedural rolls —
// structurally the same idea as Jandé's STAGE_RECIPE (once-upon-a-time
// index.html ~line 728-738: cumulative gap/plat/haz probability thresholds,
// gapMax = max jumpable gap width in columns, vert = platform-height bias).
// Reskinned differences from Jandé:
//   - no `foes` roster — there's only one enemy archetype (docs/GDD.md
//     "Enemy design"), so a flat `enemy` spawn chance replaces it.
//   - `bag`/`champagne` replace Jandé's `notes`/power-up spawn chances —
//     champagne is deliberately rare (30s invulnerability is a strong
//     effect, same rarity role as Jandé's power-up slot).
//   - `stageEnd` (finish-line column) ends the stage directly — no boss
//     arena, per the "reach a finish line" decision.
// Difficulty ramps gently across the 4 stages (EAV -> Underground), same
// shape as Jandé's progression but compressed from 9 stages to 4.
//
// `bg` imports are built by tools/compose_backgrounds.py from the raw
// references in assets/backgrounds/<id>/ (git-ignored) — see that script
// for how to regenerate after swapping a reference image.

import bgEav from '../assets/backgrounds/eav.webp';
import bgEdgewood from '../assets/backgrounds/edgewood.webp';
import bgL5p from '../assets/backgrounds/l5p.webp';
import bgUnderground from '../assets/backgrounds/underground.webp';

// ── `bg` — real-world backdrop metrics (see src/render/backdrop.js) ──
// These neighbourhoods are real places Will Hill walks through, so the
// backdrop is sized in METRES against his own height rather than fitted to
// the screen.
//   meters     — real-world vertical extent of the ABOVE-GROUND part of the
//                source image (i.e. of the `groundFrac` crop, not the whole
//                file). Tune this and the building reads bigger/smaller
//                against the character.
//   groundFrac — where the source image's own ground/building-base line
//                sits, as a fraction down from the top. Everything at or
//                below it is cropped off; the game draws its own street
//                there, and leaving the photo's street in reads as two
//                grounds stacked.
//   sky/horizon/glow — gradient + wet-street glow behind the plate. `sky`
//                values were SAMPLED from each reference image's own upper
//                bands (tools-side median sample) so the gradient can't
//                drift away from the art.
// meters/groundFrac are first-pass estimates from identifiable features
// (a ~2.1m door, a ~1.8m fence, the arch) and are meant to be tuned against
// the character in the browser — that's the only place the comparison is
// real.

export const STAGES = [
  {
    id: 'eav',
    name: 'East Atlanta Village',
    bgRef: 'Citgo gas station / "Welcome To East Atlanta" sign, Swifty Car Wash, McDonald’s Drive-Thru',
    bg: {
      img: bgEav,
      meters: 8.0, // billboard top down to the grass verge
      groundFrac: 0.88,
      sky: ['#090b19', '#141428'],
      horizon: '#2a2233',
      glow: 'rgba(255,196,120,0.10)',
      rain: 0.75,
      // Two independent sway bands, each with its own vertical extent AND
      // its own horizontal windows. Both are needed: the Citgo canopy, the
      // Swifty billboard, the fence and the Welcome sign share a vertical
      // band with the tree crown, so a full-width shear visibly wobbles hard
      // architecture. Keep these windows tight — the billboard starts at
      // ~0.13 and the canopy runs to ~0.50.
      windBands: [
        {
          // CANOPY ONLY. The pivot sits at the bottom of the leaf mass, not
          // partway down the tree — shear is zero at the pivot and grows
          // upward, so anything below it is untouched and the trunk stays
          // dead still.
          top: 0.02, pivot: 0.44, amp: 5, freq: 0.9,
          xRanges: [[0.00, 0.105]],
        },
        {
          // Low shrubs along the fence, at a shorter lever so less travel at
          // a quicker frequency. Starts at x 0.085 to clear the trunk
          // column: the trunk sits below the canopy pivot AND left of this
          // window, so it falls in NO band and never moves. This band is low
          // enough (y 0.52+) to miss the billboard entirely.
          top: 0.52, pivot: 0.92, amp: 2.5, freq: 1.7,
          xRanges: [[0.085, 0.30]],
        },
      ],
      // Practicals actually visible in the art: the Citgo canopy soffit, the
      // backlit Swifty billboard, the McDonald's sign, and the uplighters
      // washing the fence.
      lights: [
        { x: 0.30, y: 0.36, r: 0.42, rgb: '255,208,140', a: 0.20 },
        { x: 0.15, y: 0.14, r: 0.30, rgb: '190,215,255', a: 0.12 },
        { x: 0.93, y: 0.42, r: 0.26, rgb: '255,196,90',  a: 0.16, flicker: 0.012 },
        { x: 0.60, y: 0.92, r: 0.24, rgb: '255,180,90',  a: 0.18 },
      ],
    },
    light: { pool: 'rgba(255,186,96,0.20)', shaft: 'rgba(255,186,96,0.045)', bloom: 'rgba(255,180,90,0.13)', key: '255,206,150', bounce: '150,120,70', shadowRgb: '20,14,30' },
    under: {
      // Asphalt -> aggregate base -> fill -> Georgia red clay -> bedrock.
      asphalt: '#2e2c2b', base: '#4a453d', fill: '#5c4433', mid: '#6b3a24', bottom: '#2c1c15',
      brick: '#7a4530', metal: '#7a7d82', metalDark: '#3a3c40', concrete: '#5a564f',
      concreteDark: '#3b3833', gas: '#b8952e', accent: '#c25a2a', root: '#4a3320',
      tile: '#3a3f42', ballast: '#3d3a35', void_: '#0d0b12', lamp: 'rgba(255,214,140,0.22)',
      // Big street trees here, so roots are part of the section.
      kinds: ['roots', 'conduit', 'water', 'sewer', 'manhole', 'rats', 'footings'],
    },
    enemyVariants: ['a'],
    stageEnd: 240, // finish-line column (T=32px/col -> ~7680px)
    recipe: { gap: 0.08, plat: 0.20, haz: 0.34, gapMax: 2, vert: 0.25, enemy: 0.30, bag: 0.34, champagne: 0.05 },
  },
  {
    id: 'edgewood',
    name: 'Edgewood',
    bgRef: '"Colour Bar ATL" storefront — neon bar signage, Black Lives Matter signage, Soul Food & Spirits',
    bg: {
      img: bgEdgewood,
      meters: 7.0, // one-storey bar facade + the skyline strip above it
      groundFrac: 0.78,
      sky: ['#010005', '#0a0c12'],
      horizon: '#1d1a2c',
      glow: 'rgba(255,120,190,0.11)',
      rain: 1.0,
      windBands: [{ top: 0.02, pivot: 0.34, amp: 2.5, freq: 1.4, xRanges: [[0.00, 0.05]] }],
      // Neon bar frontage — the pink/violet signs are the light source here.
      lights: [
        // OUR BAR ATL — the amber/violet tube, the steadiest of the three
        { x: 0.13, y: 0.52, r: 0.34, rgb: '255,150,60',  a: 0.22, flicker: 0.020, relight: 1.15 },
        // DIS ATL HOE — hot red, and the one with the worst stutter
        { x: 0.86, y: 0.52, r: 0.34, rgb: '255,70,90',   a: 0.22, flicker: 0.031, relight: 1.30 },
        // OPEN sign over the door
        { x: 0.52, y: 0.34, r: 0.16, rgb: '120,180,255', a: 0.18, flicker: 0.044, relight: 1.10 },
        // string lights along the awning — a fast, shallow shimmer
        { x: 0.50, y: 0.26, r: 0.42, rgb: '255,214,150', a: 0.14, flicker: 0.013, relight: 0.7 },
        { x: 0.50, y: 0.44, r: 0.28, rgb: '255,225,190', a: 0.14 },
      ],
    },
    light: { pool: 'rgba(255,120,190,0.20)', shaft: 'rgba(255,120,190,0.045)', bloom: 'rgba(255,110,180,0.14)', key: '255,190,220', bounce: '140,60,110', shadowRgb: '18,10,26' },
    under: {
      asphalt: '#2b2a2c', base: '#463f3c', fill: '#54382f', mid: '#5d3a2c', bottom: '#241610',
      brick: '#8a4038', metal: '#7d7f84', metalDark: '#3d3f43', concrete: '#565149',
      concreteDark: '#38342e', gas: '#b8952e', accent: '#b0446e', root: '#43301f',
      tile: '#3c3a40', ballast: '#3b3833', void_: '#0c0a10', lamp: 'rgba(255,150,200,0.20)', rat: '#2a2320',
      // Older brick district: brick sewer barrel dominates.
      kinds: ['conduit', 'water', 'sewer', 'manhole', 'rats', 'footings'],
    },
    enemyVariants: ['b'],
    stageEnd: 260,
    recipe: { gap: 0.10, plat: 0.22, haz: 0.38, gapMax: 3, vert: 0.30, enemy: 0.36, bag: 0.34, champagne: 0.055 },
  },
  {
    id: 'l5p',
    name: 'Little 5 Points',
    bgRef: '"Criminal Records" record shop storefront — New & Used, Buy Sell Trade',
    bg: {
      img: bgL5p,
      meters: 9.0, // storefront row incl. the sign band
      groundFrac: 0.75,
      sky: ['#090b17', '#090d1e'],
      horizon: '#1c1d33',
      glow: 'rgba(150,200,255,0.09)',
      rain: 0.85,
      windBands: [{ top: 0.02, pivot: 0.30, amp: 2.5, freq: 1.2, xRanges: [[0.12, 0.22]] }],
      // Storefront windows and the OPEN sign do the work on this block.
      lights: [
        { x: 0.20, y: 0.56, r: 0.30, rgb: '255,214,140', a: 0.18 },
        { x: 0.52, y: 0.60, r: 0.24, rgb: '120,200,255', a: 0.16, flicker: 0.025 },
        { x: 0.78, y: 0.52, r: 0.32, rgb: '255,226,170', a: 0.16 },
      ],
    },
    light: { pool: 'rgba(180,215,255,0.19)', shaft: 'rgba(180,215,255,0.04)', bloom: 'rgba(150,200,255,0.12)', key: '210,230,255', bounce: '70,100,140', shadowRgb: '14,14,28' },
    under: {
      asphalt: '#2c2b2c', base: '#454039', fill: '#523c2f', mid: '#5a4030', bottom: '#201814',
      brick: '#7d4a35', metal: '#787e85', metalDark: '#383c41', concrete: '#54514b',
      concreteDark: '#37342f', gas: '#b8952e', accent: '#4a7a8a', root: '#463322',
      tile: '#39383f', ballast: '#39352f', void_: '#0b0a11', lamp: 'rgba(150,200,255,0.20)', rat: '#272220',
      kinds: ['roots', 'conduit', 'water', 'sewer', 'rats', 'footings'],
    },
    enemyVariants: ['c'],
    stageEnd: 280,
    recipe: { gap: 0.12, plat: 0.24, haz: 0.42, gapMax: 3, vert: 0.35, enemy: 0.42, bag: 0.34, champagne: 0.06 },
  },
  {
    id: 'underground',
    name: 'The Underground (5 Points)',
    bgRef: '"UNDERGROUND" transit-style entrance arch — Midtown/Westside + East Point/Airport signage, Coca-Cola sign, Waffle House',
    bg: {
      img: bgUnderground,
      meters: 18.0, // the arch is ~9m; towers run well above it
      groundFrac: 0.78,
      sky: ['#080818', '#06091e'],
      horizon: '#191a30',
      glow: 'rgba(220,60,60,0.10)',
      rain: 0.55, // partly sheltered under the arch
      windBands: [{ top: 0.02, pivot: 0.26, amp: 2, freq: 1.1, xRanges: [[0.60, 0.70]] }],
      // The arch marquee bulbs, the Coca-Cola disc and the Waffle House
      // frontage — the three things genuinely emitting in this plate.
      lights: [
        { x: 0.50, y: 0.30, r: 0.26, rgb: '255,226,160', a: 0.24, flicker: 0.030 },
        { x: 0.72, y: 0.50, r: 0.24, rgb: '230,60,60',   a: 0.20 },
        { x: 0.76, y: 0.62, r: 0.22, rgb: '255,196,90',  a: 0.18, flicker: 0.014 },
        { x: 0.06, y: 0.24, r: 0.28, rgb: '255,196,120', a: 0.12 },
      ],
    },
    light: { pool: 'rgba(255,170,90,0.22)', shaft: 'rgba(255,170,90,0.05)', bloom: 'rgba(240,90,70,0.14)', key: '255,200,140', bounce: '150,90,60', shadowRgb: '12,10,22' },
    under: {
      // Five Points sits on top of the MARTA tunnel — the neighbourhood's
      // literal underground, and the stage's namesake. Deepest section of
      // the four, so the tunnel gets the slowest sub-parallax of anything.
      asphalt: '#2a2a2c', base: '#423e39', fill: '#4a4038', mid: '#4c3c30', bottom: '#17141a',
      brick: '#6f4436', metal: '#8b9199', metalDark: '#3f4348', concrete: '#5c5850',
      concreteDark: '#3a3733', gas: '#b8952e', accent: '#b04040', root: '#3c2c1e',
      tile: '#4a5560', ballast: '#332f2b', void_: '#08070c', lamp: 'rgba(255,196,120,0.34)', rat: '#2b2622',
      kinds: ['conduit', 'water', 'sewer', 'tunnel', 'rats', 'train', 'footings'],
    },
    enemyVariants: ['a', 'b', 'c'],
    stageEnd: 300,
    recipe: { gap: 0.14, plat: 0.26, haz: 0.46, gapMax: 4, vert: 0.40, enemy: 0.48, bag: 0.34, champagne: 0.065 },
  },
];
