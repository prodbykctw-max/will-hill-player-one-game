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

export const STAGES = [
  {
    id: 'eav',
    name: 'East Atlanta Village',
    bgRef: 'Citgo gas station / "Welcome To East Atlanta" sign, Swifty Car Wash, McDonald’s Drive-Thru',
    bg: bgEav,
    stageEnd: 240, // finish-line column (T=32px/col -> ~7680px)
    recipe: { gap: 0.12, plat: 0.30, haz: 0.45, gapMax: 2, vert: 0.25, enemy: 0.22, bag: 0.55, champagne: 0.04 },
  },
  {
    id: 'edgewood',
    name: 'Edgewood',
    bgRef: '"Colour Bar ATL" storefront — neon bar signage, Black Lives Matter signage, Soul Food & Spirits',
    bg: bgEdgewood,
    stageEnd: 260,
    recipe: { gap: 0.14, plat: 0.32, haz: 0.48, gapMax: 3, vert: 0.30, enemy: 0.28, bag: 0.55, champagne: 0.045 },
  },
  {
    id: 'l5p',
    name: 'Little 5 Points',
    bgRef: '"Criminal Records" record shop storefront — New & Used, Buy Sell Trade',
    bg: bgL5p,
    stageEnd: 280,
    recipe: { gap: 0.16, plat: 0.34, haz: 0.50, gapMax: 3, vert: 0.35, enemy: 0.34, bag: 0.55, champagne: 0.05 },
  },
  {
    id: 'underground',
    name: 'The Underground (5 Points)',
    bgRef: '"UNDERGROUND" transit-style entrance arch — Midtown/Westside + East Point/Airport signage, Coca-Cola sign, Waffle House',
    bg: bgUnderground,
    stageEnd: 300,
    recipe: { gap: 0.18, plat: 0.36, haz: 0.55, gapMax: 4, vert: 0.40, enemy: 0.40, bag: 0.55, champagne: 0.055 },
  },
];
