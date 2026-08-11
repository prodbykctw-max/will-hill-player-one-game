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
      // Big street trees fill the left of this plate, so the wind band is
      // generous and the pivot sits at the canopy base — trunks stay put.
      wind: {
        top: 0.04, pivot: 0.66, amp: 14, freq: 1.0,
        // Plate-local x windows that actually contain foliage. The Citgo
        // canopy, the Swifty billboard, the fence and the Welcome sign share
        // this vertical band and must NOT move.
        // ONLY the left-hand street tree. The Swifty billboard starts at
        // ~0.13 and the Citgo canopy runs to ~0.50, so anything past ~0.11
        // visibly wobbles hard architecture. Keep this window tight.
        xRanges: [[0.00, 0.105]],
      },
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
      kinds: ['roots', 'conduit', 'water', 'sewer', 'manhole', 'footings', 'rats'],
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
      windBands: [{ top: 0.02, pivot: 0.34, amp: 5, freq: 1.4, xRanges: [[0.00, 0.05]] }],
      // Neon bar frontage — the pink/violet signs are the light source here.
      lights: [
        { x: 0.13, y: 0.52, r: 0.34, rgb: '255,150,60',  a: 0.20, flicker: 0.020 },
        { x: 0.86, y: 0.52, r: 0.34, rgb: '255,70,90',   a: 0.20, flicker: 0.017 },
        { x: 0.50, y: 0.40, r: 0.30, rgb: '255,225,190', a: 0.16 },
        { x: 0.50, y: 0.22, r: 0.40, rgb: '255,190,120', a: 0.10 },
      ],
    },
    light: { pool: 'rgba(255,120,190,0.20)', shaft: 'rgba(255,120,190,0.045)', bloom: 'rgba(255,110,180,0.14)', key: '255,190,220', bounce: '140,60,110', shadowRgb: '18,10,26' },
    under: {
      asphalt: '#2b2a2c', base: '#463f3c', fill: '#54382f', mid: '#5d3a2c', bottom: '#241610',
      brick: '#8a4038', metal: '#7d7f84', metalDark: '#3d3f43', concrete: '#565149',
      concreteDark: '#38342e', gas: '#b8952e', accent: '#b0446e', root: '#43301f',
      tile: '#3c3a40', ballast: '#3b3833', void_: '#0c0a10', lamp: 'rgba(255,150,200,0.20)', rat: '#2a2320',
      // Older brick district: brick sewer barrel dominates.
      kinds: ['conduit', 'water', 'sewer', 'manhole', 'footings', 'rats'],
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
      windBands: [{ top: 0.02, pivot: 0.30, amp: 5, freq: 1.2, xRanges: [[0.12, 0.22]] }],
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
      kinds: ['roots', 'conduit', 'water', 'sewer', 'footings', 'rats'],
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
      windBands: [{ top: 0.02, pivot: 0.26, amp: 4, freq: 1.1, xRanges: [[0.60, 0.70]] }],
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
      kinds: ['conduit', 'water', 'sewer', 'tunnel', 'footings', 'train', 'rats'],
    },
    enemyVariants: ['a', 'b', 'c'],
    stageEnd: 300,
    recipe: { gap: 0.14, plat: 0.26, haz: 0.46, gapMax: 4, vert: 0.40, enemy: 0.48, bag: 0.34, champagne: 0.065 },
  },
];
