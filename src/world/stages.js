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
//   - `bag` replaces Jandé's `notes` spawn chance. There is NO `champagne`
//     rate any more. It used to be a rare per-column roll, filling the same
//     slot as Jandé's power-ups, but a rate cannot promise a count: over a
//     240-300 column stage the same recipe could hand one run four bottles
//     and the next none. Every stage now gets EXACTLY TWO, placed at fixed
//     fractions of its length by createLevel in world/generator.js.
//   - `stageEnd` (finish-line column) ends the stage directly — no boss
//     arena, per the "reach a finish line" decision.
// STAGE THREE FELT HARDEST, AND HERE IS WHY — the ordering was not the fault.
// The recipe ramp was already correct in array order (gap 0.072 < 0.090 <
// 0.108 < 0.126) and l5p already carried the all-three-variant roster. Two
// other things made the Underground the hardest stage in play:
//
//   1. LENGTH DID NOT RAMP. The Underground was 300 columns while the FINALE
//      was 280 — the third stage was the longest in the game. Lengths now
//      ramp 240 / 260 / 280 / 300 with the rest of the curve.
//   2. A GENERATOR BUG turned every feature into extra holes (see the notes
//      in world/generator.js), and because holes leaked per FEATURE, the
//      longest stage collected the most of them. Measured before the fix:
//      38 pit spans on the Underground against 32 on the finale, of which
//      twenty were accidental.
//
// Difficulty is separately down 10% across enemy, pothole and gap rates at
// the client's request, and platform width with them.
//
// ORDER MATTERS AND IT CHANGED. Criminal Records (l5p) is the FINALE, not the
// Underground — Will Hill is travelling to his show, and the show is at
// Criminal Records, where people really have performed. On the MARTA map the
// route is real: East Lake -> Edgewood-Candler Park -> FIVE POINTS (the
// transfer hub, which is the Underground stage and the reason there is a
// tunnel under the street) -> back east to Inman Park-Reynoldstown for L5P.
// That is genuinely how you would make that trip.
//
// Difficulty and the enemy roster follow POSITION, not the stage, so they
// were swapped when the order changed: l5p now carries the hardest recipe and
// the all-three-variant finale roster, and underground took l5p's old
// mid-tier numbers. If the order is ever changed again, move these too or the
// ramp inverts.
//
// `bg` imports are built by tools/compose_backgrounds.py from the raw
// references in assets/backgrounds/<id>/ (git-ignored) — see that script
// for how to regenerate after swapping a reference image.

// EAV is cut into a multiplane set by tools/cut_planes.py: a base plate with
// every item lifted off it, plus one card per item. See that script for how
// the cutting works and src/render/backdrop.js for how the cards are driven.
// ── DAY PLATES ───────────────────────────────────────────────────────────
// Not cut into multiplane cards yet, so these are flat: the renderer already
// treats a stage with no `cards` as the old single-plate backdrop, which is
// shallow rather than broken. Underground is the exception and has its full
// nineteen-card day set. Cutting the other three is the outstanding work.
import bgEavDay from '../assets/backgrounds/eav-day.webp';
import bgEdgewoodDay from '../assets/backgrounds/edgewood-day.webp';
import bgL5pDay from '../assets/backgrounds/l5p-day.webp';

import bgEav from '../assets/backgrounds/eav-base.webp';
import eavClouds from '../assets/backgrounds/eav-clouds.webp';
import eavSkyline from '../assets/backgrounds/eav-skyline.webp';
import eavMcdonalds from '../assets/backgrounds/eav-mcdonalds.webp';
import eavCars from '../assets/backgrounds/eav-cars.webp';
import eavSwifty from '../assets/backgrounds/eav-swifty.webp';
import eavCitgo from '../assets/backgrounds/eav-citgo.webp';
import eavFence from '../assets/backgrounds/eav-fence.webp';
import eavVerge from '../assets/backgrounds/eav-verge.webp';
import eavTree from '../assets/backgrounds/eav-tree.webp';
import eavShrubRight from '../assets/backgrounds/eav-shrub_right.webp';
import eavPole from '../assets/backgrounds/eav-pole.webp';
import bgEdgewood from '../assets/backgrounds/edgewood-base.webp';
import ewSkyline from '../assets/backgrounds/edgewood-skyline.webp';
import ewParapet from '../assets/backgrounds/edgewood-parapet.webp';
import ewFacade from '../assets/backgrounds/edgewood-facade.webp';
import ewBayLeft from '../assets/backgrounds/edgewood-bay_left.webp';
import ewBayMid1 from '../assets/backgrounds/edgewood-bay_mid1.webp';
import ewBayMid2 from '../assets/backgrounds/edgewood-bay_mid2.webp';
import ewBayRight from '../assets/backgrounds/edgewood-bay_right.webp';
import ewSignBlm from '../assets/backgrounds/edgewood-sign_blm.webp';
import ewSignSoul from '../assets/backgrounds/edgewood-sign_soul.webp';
import ewNeonOpen from '../assets/backgrounds/edgewood-neon_open.webp';
import ewNeonOurbar from '../assets/backgrounds/edgewood-neon_ourbar.webp';
import ewNeonDis from '../assets/backgrounds/edgewood-neon_dis.webp';
import ewLamps from '../assets/backgrounds/edgewood-lamps.webp';
import ewPavement from '../assets/backgrounds/edgewood-pavement.webp';
import bgL5p from '../assets/backgrounds/l5p-base.webp';
import l5pFarbuild from '../assets/backgrounds/l5p-farbuild.webp';
import l5pSign from '../assets/backgrounds/l5p-sign.webp';
import l5pLetters from '../assets/backgrounds/l5p-letters.webp';
import l5pRightpillar from '../assets/backgrounds/l5p-rightpillar.webp';
import l5pNewused from '../assets/backgrounds/l5p-newused.webp';
import l5pNewusedsign from '../assets/backgrounds/l5p-newusedsign.webp';
import l5pBrick from '../assets/backgrounds/l5p-brick.webp';
import l5pBuysell from '../assets/backgrounds/l5p-buysell.webp';
import l5pBayleft from '../assets/backgrounds/l5p-bayleft.webp';
import l5pOpenneon from '../assets/backgrounds/l5p-openneon.webp';
import l5pBaymid from '../assets/backgrounds/l5p-baymid.webp';
import l5pAwning from '../assets/backgrounds/l5p-awning.webp';
import l5pBayright from '../assets/backgrounds/l5p-bayright.webp';
import l5pPoster from '../assets/backgrounds/l5p-poster.webp';
import l5pKerb from '../assets/backgrounds/l5p-kerb.webp';
import l5pPole from '../assets/backgrounds/l5p-pole.webp';
import bgUnderground from '../assets/backgrounds/underground-base.webp';
// DAYTIME Five Points. Client-supplied, same 1122x1402 frame as the night
// plate but a different composition — the arch sits higher and the columns
// are narrower — so the night plate's fifteen multiplane cards do NOT line up
// with it and are not used while this is the base. Its own cut is in
// progress; see assets/refs/underground-day.webp and tools/cut_planes.py.
import bgUndergroundDayBase from '../assets/backgrounds/underground-day-base.webp';
import ugClouds from '../assets/backgrounds/underground-clouds.webp';
import ugSpire from '../assets/backgrounds/underground-spire.webp';
import ugTowers from '../assets/backgrounds/underground-towers.webp';
import ugBackdrop from '../assets/backgrounds/underground-backdrop.webp';
import ugLeftblock from '../assets/backgrounds/underground-leftblock.webp';
import ugMidbuild from '../assets/backgrounds/underground-midbuild.webp';
import ugDome from '../assets/backgrounds/underground-dome.webp';
import ugMarquee from '../assets/backgrounds/underground-marquee.webp';
import ugLoans from '../assets/backgrounds/underground-loans.webp';
import ugCoke from '../assets/backgrounds/underground-coke.webp';
import ugWaffle from '../assets/backgrounds/underground-waffle.webp';
import ugDirsign from '../assets/backgrounds/underground-dirsign.webp';
import ugPed from '../assets/backgrounds/underground-ped.webp';
import ugStreet from '../assets/backgrounds/underground-street.webp';
import ugColumns from '../assets/backgrounds/underground-columns.webp';
// The DAY set, cut from the day plate by tools/cut_planes.py against SAM
// masks grouped in tools/sam_groups/underground-day.json.
import ugdClouds from '../assets/backgrounds/underground-day-clouds.webp';
import ugdSpire from '../assets/backgrounds/underground-day-spire.webp';
import ugdTowers from '../assets/backgrounds/underground-day-towers.webp';
import ugdBackdrop from '../assets/backgrounds/underground-day-backdrop.webp';
import ugdLeftblock from '../assets/backgrounds/underground-day-leftblock.webp';
import ugdMidbuild from '../assets/backgrounds/underground-day-midbuild.webp';
import ugdArch from '../assets/backgrounds/underground-day-arch.webp';
import ugdLetters from '../assets/backgrounds/underground-day-letters.webp';
import ugdTrees from '../assets/backgrounds/underground-day-trees.webp';
import ugdLoans from '../assets/backgrounds/underground-day-loans.webp';
import ugdChecks from '../assets/backgrounds/underground-day-checks.webp';
import ugdCoke from '../assets/backgrounds/underground-day-coke.webp';
import ugdWaffle from '../assets/backgrounds/underground-day-waffle.webp';
import ugdDirsign from '../assets/backgrounds/underground-day-dirsign.webp';
import ugdPed from '../assets/backgrounds/underground-day-ped.webp';
import ugdNewsbox from '../assets/backgrounds/underground-day-newsbox.webp';
import ugdPoles from '../assets/backgrounds/underground-day-poles.webp';
import ugdStreet from '../assets/backgrounds/underground-day-street.webp';
import ugdColumns from '../assets/backgrounds/underground-day-columns.webp';

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

// The stage table itself is written NIGHT-FIRST — `bg`/`light` are the night
// dressing, and each entry carries a `day` twin. `STAGES` at the bottom of
// this file is the resolved list for whichever it currently is where the
// player is standing.
const STAGE_DEFS = [
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
      // ── The multiplane set, far -> near ──────────────────────────────
      // `depth` is 0 at the far wall and 1 at the kerb; backdrop.js turns it
      // into a rate. Nothing here is a scroll speed on purpose: every card
      // travels at the same base rate and depth only adds a small difference
      // on top, which is what keeps the picture from coming apart. See
      // backdrop.js for why the spread is as narrow as it is.
      //
      // `span` is the card's content extent as x fractions of the plate,
      // written out by tools/cut_planes.py into <stage>-planes.json. The
      // renderer draws and culls against it, so a card that occupies 8% of
      // the plate costs 8% of a full-frame blit instead of a whole one.
      //
      // `sway` is the OLD windBands structure, unchanged, but scoped to one
      // card. Keeping the structure matters: shearing a whole card about a
      // single pivot makes a tree lean like a rigid cutout, which is wrong —
      // what reads as foliage is many small sections of the crown drifting
      // out of step, subdivided WITHIN each window so a narrow window still
      // gets fine motion. The pivot sits at the bottom of the leaf mass, not
      // partway down the tree: shear is zero at the pivot and grows upward,
      // so the trunk below it never moves. Only leaves move.
      //
      // What being a card buys is that the shear can no longer touch anything
      // but this item — the old version had to pick x-ranges that dodged the
      // billboard and canopy sharing the same horizontal band, and wobbled
      // the architecture anyway.
      cards: [
        { key: 'clouds', img: eavClouds, depth: 0.02, span: [0.428, 1.000] },
        { key: 'skyline', img: eavSkyline, depth: 0.07, span: [0.780, 1.000] },
        { key: 'mcdonalds', img: eavMcdonalds, depth: 0.16, span: [0.913, 1.000] },
        { key: 'cars', img: eavCars, depth: 0.21, span: [0.784, 0.999] },
        { key: 'swifty', img: eavSwifty, depth: 0.25, span: [0.133, 0.432] },
        { key: 'citgo', img: eavCitgo, depth: 0.41, span: [0.094, 0.559] },
        { key: 'fence', img: eavFence, depth: 0.67, span: [0.217, 0.792] },
        { key: 'verge', img: eavVerge, depth: 0.75, span: [0.000, 0.859] , rate: 0.30 },
        {
          key: 'tree', img: eavTree, depth: 0.81, span: [0.000, 0.313],
          sway: [
            // CANOPY. Pivot at the bottom of the leaf mass — the trunk is
            // below it and stays dead still.
            { top: 0.02, pivot: 0.44, amp: 5, freq: 0.9, xRanges: [[0.00, 0.105]] },
            // Low shrubs along the fence: shorter lever, so less travel at a
            // quicker frequency.
            { top: 0.52, pivot: 0.92, amp: 2.5, freq: 1.7, xRanges: [[0.085, 0.30]] },
          ],
        },
        {
          key: 'shrub_right', img: eavShrubRight, depth: 0.85, span: [0.737, 0.820],
          sway: [{ top: 0.66, pivot: 0.88, amp: 2.5, freq: 1.7, xRanges: [[0.737, 0.820]] }],
        },
        { key: 'pole', img: eavPole, depth: 1.00, span: [0.823, 0.916] },
      ],
      // Practicals actually visible in the art: the Citgo canopy soffit, the
      // backlit Swifty billboard, the McDonald's sign, and the uplighters
      // washing the fence.
      // `layer` names the card the practical is bolted to, so the glow travels
      // with the thing that emits it instead of sliding off it. A light with no
      // layer rides the base plate.
      lights: [
        { x: 0.30, y: 0.36, r: 0.42, rgb: '255,208,140', a: 0.20, layer: 'citgo' },
        { x: 0.15, y: 0.14, r: 0.30, rgb: '190,215,255', a: 0.12, layer: 'swifty' },
        { x: 0.93, y: 0.42, r: 0.26, rgb: '255,196,90',  a: 0.16, flicker: 0.012, layer: 'mcdonalds' },
        { x: 0.60, y: 0.92, r: 0.24, rgb: '255,180,90',  a: 0.18, layer: 'fence' },
      ],
    },
    light: { pool: 'rgba(255,186,96,0.20)', shaft: 'rgba(255,186,96,0.045)', bloom: 'rgba(255,180,90,0.13)', key: '255,206,150', bounce: '150,120,70', shadowRgb: '20,14,30' },
    // ── DAYTIME TWIN ────────────────────────────────────────────────
    // Same street, same signage, same composition — the client's day plates
    // are the night scene relit, not a different picture. FLAT FOR NOW: the
    // multiplane cut has not been run on this plate yet, and the renderer
    // treats a stage with no `cards` as the old single-plate backdrop. That
    // is shallow, not broken, and it is the outstanding work. Underground's
    // day plate IS cut, nineteen cards, and is what the other three are
    // being brought up to.
    //
    // `groundFrac` and `meters` are MEASURED AGAINST THE NIGHT PLATE by
    // matching a named landmark across the two — see tools/check_day_framing.py,
    // which prints the derivation and writes a proof image showing the match.
    // Sky and horizon are MEDIANS SAMPLED OFF THE PLATE, not picked by eye —
    // a sky gradient that disagrees with the image it sits behind shows as a
    // band along the top of the frame.
    //
    // ⚠️ THESE WERE WRONG, AND THE METHOD THAT GOT THEM WRONG IS RECORDED IN
    // THAT TOOL. They were set by aligning the two plates' row-wise
    // edge-energy profiles, which cannot tell scale from offset — collapsing
    // an image to one number per row throws away which feature a peak belongs
    // to. Re-run honestly it returns groundFrac 1.595 for eav, a row 866 of a
    // 543-row file. Do not go back to it.
    day: {
      bg: {
        img: bgEavDay,
        // Landmark: the WELCOME TO EAST ATLANTA oval, matched at scale
        // 0.985 — the two paintings are drawn at all but the same source
        // scale, which is why the corrected groundFrac lands within 0.002
        // of the night plate's 0.88 rather than 0.11 away from it.
        // 0.766 cut the frame off through the MIDDLE OF THE FENCE and
        // threw away the footings, the grass verge and the base of the
        // tree, while rendering what was left 19.7% too big.
        meters: 7.81,
        groundFrac: 0.882,
        sky: ['#4390ef', '#9dbbe6'],
        horizon: '#c8d8ec',
        glow: 'rgba(255,244,214,0.09)',
        // No rain in the daytime set. The client's day plates are clear-sky
        // and dry; keeping the night stage's rain over them would be weather
        // falling out of a blue sky.
        rain: 0.0,
        // No practicals. Neon and streetlights do not read at midday, and
        // painting them as if they did is what makes a day scene look like a
        // night scene with the brightness turned up.
        lights: [],
      },
      light: { pool: 'rgba(255,244,214,0.10)', shaft: 'rgba(255,246,220,0.04)', bloom: 'rgba(255,240,200,0.07)', key: '255,248,226', bounce: '150,170,200', shadowRgb: '30,36,52' },
    },
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
    recipe: { gap: 0.072, plat: 0.20, haz: 0.306, gapMax: 2, vert: 0.25, enemy: 0.27, bag: 0.34 },
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
      cards: [
        { key: 'skyline', img: ewSkyline, depth: 0.05, span: [0.000, 1.000] },
        { key: 'parapet', img: ewParapet, depth: 0.20, span: [0.024, 0.997] },
        { key: 'facade', img: ewFacade, depth: 0.34, span: [0.000, 1.000] },
        { key: 'bay_left', img: ewBayLeft, depth: 0.44, span: [0.055, 0.243] },
        { key: 'bay_mid1', img: ewBayMid1, depth: 0.46, span: [0.368, 0.520] },
        { key: 'bay_mid2', img: ewBayMid2, depth: 0.48, span: [0.525, 0.658] },
        { key: 'bay_right', img: ewBayRight, depth: 0.44, span: [0.785, 0.935] },
        { key: 'sign_blm', img: ewSignBlm, depth: 0.47, span: [0.398, 0.490] },
        { key: 'sign_soul', img: ewSignSoul, depth: 0.49, span: [0.556, 0.630] },
        { key: 'neon_open', img: ewNeonOpen, depth: 0.49, span: [0.594, 0.653] },
        { key: 'neon_ourbar', img: ewNeonOurbar, depth: 0.45, span: [0.107, 0.200] },
        { key: 'neon_dis', img: ewNeonDis, depth: 0.45, span: [0.827, 0.894] },
        { key: 'lamps', img: ewLamps, depth: 0.62, span: [0.003, 0.997] },
        { key: 'pavement', img: ewPavement, depth: 0.84, span: [0.001, 1.000], rate: 0.30 },
      ],
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
    // ── DAYTIME TWIN ────────────────────────────────────────────────
    // Same street, same signage, same composition — the client's day plates
    // are the night scene relit, not a different picture. FLAT FOR NOW: the
    // multiplane cut has not been run on this plate yet, and the renderer
    // treats a stage with no `cards` as the old single-plate backdrop. That
    // is shallow, not broken, and it is the outstanding work. Underground's
    // day plate IS cut, nineteen cards, and is what the other three are
    // being brought up to.
    //
    // `groundFrac` and `meters` are MEASURED AGAINST THE NIGHT PLATE by
    // matching a named landmark across the two — see tools/check_day_framing.py,
    // which prints the derivation and writes a proof image showing the match.
    // Sky and horizon are MEDIANS SAMPLED OFF THE PLATE, not picked by eye —
    // a sky gradient that disagrees with the image it sits behind shows as a
    // band along the top of the frame.
    //
    // ⚠️ THESE WERE WRONG, AND THE METHOD THAT GOT THEM WRONG IS RECORDED IN
    // THAT TOOL. They were set by aligning the two plates' row-wise
    // edge-energy profiles, which cannot tell scale from offset — collapsing
    // an image to one number per row throws away which feature a peak belongs
    // to. Re-run honestly it returns groundFrac 1.595 for eav, a row 866 of a
    // 543-row file. Do not go back to it.
    day: {
      bg: {
        img: bgEdgewoodDay,
        // Landmark: the OUR BAR ATL window, matched at scale 0.990. The
        // crop line was already right here — 2 rows out — but the plate
        // was rendering 7.7% SMALL, so the bar was a shorter building by
        // day than by night.
        meters: 7.70,
        groundFrac: 0.821,
        sky: ['#3e8bf1', '#8fb8ea'],
        horizon: '#c2d6ee',
        glow: 'rgba(255,244,214,0.09)',
        // No rain in the daytime set. The client's day plates are clear-sky
        // and dry; keeping the night stage's rain over them would be weather
        // falling out of a blue sky.
        rain: 0.0,
        // No practicals. Neon and streetlights do not read at midday, and
        // painting them as if they did is what makes a day scene look like a
        // night scene with the brightness turned up.
        lights: [],
      },
      light: { pool: 'rgba(255,244,214,0.10)', shaft: 'rgba(255,246,220,0.04)', bloom: 'rgba(255,240,200,0.07)', key: '255,248,226', bounce: '150,170,200', shadowRgb: '30,36,52' },
    },
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
    recipe: { gap: 0.090, plat: 0.22, haz: 0.342, gapMax: 3, vert: 0.30, enemy: 0.324, bag: 0.34 },
  },
  {
    id: 'underground',
    name: 'The Underground (5 Points)',
    bgRef: '"UNDERGROUND" transit-style entrance arch — Midtown/Westside + East Point/Airport signage, Coca-Cola sign, Waffle House',
    bg: {
      img: bgUnderground,
      // SCALE, AND IT WAS BADLY WRONG. `meters` is how much real-world height
      // the plate's visible band spans, and at 18.0 this plate drew 976px tall
      // — against the 559px of screen that exists above the ground line. Four
      // hundred and seventeen pixels of it, INCLUDING THE ENTIRE UNDERGROUND
      // ARCH, sat above the top of the frame. All you could see was one giant
      // teal column and half a LOANS sign, which is exactly what the client
      // reported. The other three plates fill 68-87% of that space; this one
      // was at 175%.
      //
      // 8.6 puts it at 466px, an 83% fill, between EAV's 78% and L5P's 87% —
      // so the arch reads, and Will Hill is the size of a man next to it
      // rather than the size of a bollard. The day and night plates are the
      // same 1122x1402, so the fix applies to both.
      meters: 8.6,
      groundFrac: 0.78,
      sky: ['#080818', '#06091e'],
      horizon: '#191a30',
      glow: 'rgba(220,60,60,0.10)',
      rain: 0.55, // partly sheltered under the arch
      windBands: [{ top: 0.02, pivot: 0.26, amp: 2, freq: 1.1, xRanges: [[0.60, 0.70]] }],
      // ── The multiplane set, far -> near ──────────────────────────────
      // Built in real perspective, so this plate has more genuine depth than
      // any of the other three: sky wedge, towers behind, the arch in the
      // middle distance, two columns almost at the kerb.
      //
      // The office block down the left and the buildings framed inside the
      // arch are deliberately NOT cards — see tools/cut_planes.py. They abut
      // other dark buildings with nothing to separate them, so cutting them
      // gave back rectangles, and rectangles read as hard cuts. They are the
      // matrix; the cards are what stands in front of it.
      // THE NIGHT SET — fifteen cards. Spans are the cutter's own reported
      // x-extents over the 1122px plate, not estimates.
      cards: [
        { key: 'clouds', img: ugClouds, depth: 0.03, span: [0.640, 0.844] },
        { key: 'spire', img: ugSpire, depth: 0.08, span: [0.814, 0.881] },
        { key: 'towers', img: ugTowers, depth: 0.12, span: [0.863, 1.000] },
        { key: 'backdrop', img: ugBackdrop, depth: 0.16, span: [0.270, 0.820] },
        { key: 'leftblock', img: ugLeftblock, depth: 0.26, span: [0.000, 0.251] },
        { key: 'midbuild', img: ugMidbuild, depth: 0.34, span: [0.265, 0.777] },
        { key: 'dome', img: ugDome, depth: 0.44, span: [0.296, 0.750] },
        { key: 'marquee', img: ugMarquee, depth: 0.50, span: [0.138, 0.894] },
        { key: 'loans', img: ugLoans, depth: 0.56, span: [0.000, 0.133] },
        { key: 'coke', img: ugCoke, depth: 0.60, span: [0.663, 0.773] },
        { key: 'waffle', img: ugWaffle, depth: 0.62, span: [0.703, 0.786] },
        { key: 'dirsign', img: ugDirsign, depth: 0.70, span: [0.452, 0.598] },
        { key: 'ped', img: ugPed, depth: 0.74, span: [0.328, 0.429] },
        { key: 'street', img: ugStreet, depth: 0.82, span: [0.003, 0.996] },
        { key: 'columns', img: ugColumns, depth: 0.94, span: [0.161, 0.880] },
      ],
      // The arch marquee bulbs, the Coca-Cola disc and the Waffle House
      // frontage — the three things genuinely emitting in this plate.
      // `layer` bolts each glow to its card so it travels with the thing that
      // emits it instead of sliding off it.
      lights: [
        { x: 0.50, y: 0.30, r: 0.26, rgb: '255,226,160', a: 0.24, flicker: 0.030, layer: 'marquee' },
        { x: 0.72, y: 0.50, r: 0.24, rgb: '230,60,60', a: 0.20, layer: 'coke' },
        { x: 0.76, y: 0.62, r: 0.22, rgb: '255,196,90', a: 0.18, flicker: 0.014, layer: 'waffle' },
        { x: 0.06, y: 0.24, r: 0.28, rgb: '255,196,120', a: 0.12 },
      ],
    },
    light: { pool: 'rgba(255,170,90,0.22)', shaft: 'rgba(255,170,90,0.05)', bloom: 'rgba(240,90,70,0.14)', key: '255,200,140', bounce: '150,90,60', shadowRgb: '12,10,22' },
    day: {
      bg: {
        img: bgUndergroundDayBase,
        meters: 8.6,
        groundFrac: 0.78,
        sky: ['#4d8fd6', '#a8cdf0'],
        horizon: '#cfe2f4',
        glow: 'rgba(255,236,190,0.10)',
        rain: 0.0,
        windBands: [{ top: 0.02, pivot: 0.26, amp: 2, freq: 1.1, xRanges: [[0.60, 0.70]] }],
        // NINETEEN cards, cut from the day plate's OWN SAM pass rather than
        // reusing the night set. The compositions differ — the day arch sits
        // higher and its columns are narrower — so the night cards never
        // registered against this plate.
        cards: [
          { key: 'clouds', img: ugdClouds, depth: 0.03, span: [0.359, 0.999] },
          { key: 'spire', img: ugdSpire, depth: 0.08, span: [0.758, 0.888] },
          { key: 'towers', img: ugdTowers, depth: 0.12, span: [0.480, 0.999] },
          { key: 'backdrop', img: ugdBackdrop, depth: 0.16, span: [0.299, 0.348] },
          { key: 'leftblock', img: ugdLeftblock, depth: 0.26, span: [0.000, 0.302] },
          { key: 'midbuild', img: ugdMidbuild, depth: 0.34, span: [0.272, 0.884] },
          { key: 'arch', img: ugdArch, depth: 0.46, span: [0.183, 0.888] },
          { key: 'letters', img: ugdLetters, depth: 0.48, span: [0.281, 0.775] },
          { key: 'trees', img: ugdTrees, depth: 0.52, span: [0.689, 0.999] },
          { key: 'loans', img: ugdLoans, depth: 0.56, span: [0.034, 0.146] },
          { key: 'checks', img: ugdChecks, depth: 0.58, span: [0.000, 0.143] },
          { key: 'coke', img: ugdCoke, depth: 0.60, span: [0.657, 0.773] },
          { key: 'waffle', img: ugdWaffle, depth: 0.62, span: [0.681, 0.880] },
          { key: 'dirsign', img: ugdDirsign, depth: 0.70, span: [0.448, 0.616] },
          { key: 'ped', img: ugdPed, depth: 0.74, span: [0.320, 0.434] },
          { key: 'newsbox', img: ugdNewsbox, depth: 0.78, span: [0.501, 0.597] },
          { key: 'poles', img: ugdPoles, depth: 0.80, span: [0.356, 0.875] },
          { key: 'street', img: ugdStreet, depth: 0.86, span: [0.000, 0.999], rate: 0.30 },
          { key: 'columns', img: ugdColumns, depth: 0.94, span: [0.155, 0.837] },
        ],
        // Daylight. The marquee bulbs still read, faintly, but a Coca-Cola
        // disc and a Waffle House sign do not glow at midday, and painting
        // them as if they did is what makes a day scene look like a night
        // scene with the brightness turned up.
        lights: [
          { x: 0.50, y: 0.55, r: 0.20, rgb: '255,236,190', a: 0.12, flicker: 0.030, layer: 'letters' },
        ],
      },
      light: { pool: 'rgba(255,244,214,0.10)', shaft: 'rgba(255,246,220,0.04)', bloom: 'rgba(255,240,200,0.07)', key: '255,248,226', bounce: '150,170,200', shadowRgb: '30,36,52' },
    },
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
    enemyVariants: ['c'],
    stageEnd: 280,
    recipe: { gap: 0.108, plat: 0.24, haz: 0.378, gapMax: 3, vert: 0.35, enemy: 0.378, bag: 0.34 },
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
      cards: [
        { key: 'farbuild', img: l5pFarbuild, depth: 0.06, span: [0.003, 0.157] },
        { key: 'sign', img: l5pSign, depth: 0.22, span: [0.445, 0.929] },
        { key: 'letters', img: l5pLetters, depth: 0.23, span: [0.500, 0.890] },
        { key: 'rightpillar', img: l5pRightpillar, depth: 0.30, span: [0.930, 1.000] },
        { key: 'newused', img: l5pNewused, depth: 0.40, span: [0.126, 0.301] },
        { key: 'newusedsign', img: l5pNewusedsign, depth: 0.41, span: [0.143, 0.299] },
        { key: 'brick', img: l5pBrick, depth: 0.48, span: [0.299, 0.453] },
        { key: 'buysell', img: l5pBuysell, depth: 0.49, span: [0.325, 0.397] },
        { key: 'bayleft', img: l5pBayleft, depth: 0.56, span: [0.442, 0.594] },
        { key: 'openneon', img: l5pOpenneon, depth: 0.57, span: [0.465, 0.532] },
        { key: 'baymid', img: l5pBaymid, depth: 0.60, span: [0.595, 0.717] },
        { key: 'awning', img: l5pAwning, depth: 0.63, span: [0.768, 0.891] },
        { key: 'bayright', img: l5pBayright, depth: 0.64, span: [0.726, 0.969] },
        { key: 'poster', img: l5pPoster, depth: 0.65, span: [0.794, 0.899] },
        { key: 'kerb', img: l5pKerb, depth: 0.82, span: [0.004, 0.965] , rate: 0.30 },
        { key: 'pole', img: l5pPole, depth: 0.96, span: [0.055, 0.132] },
      ],
      lights: [
        { x: 0.20, y: 0.56, r: 0.30, rgb: '255,214,140', a: 0.18 },
        { x: 0.52, y: 0.60, r: 0.24, rgb: '120,200,255', a: 0.16, flicker: 0.025 },
        { x: 0.78, y: 0.52, r: 0.32, rgb: '255,226,170', a: 0.16 },
      ],
    },
    light: { pool: 'rgba(180,215,255,0.19)', shaft: 'rgba(180,215,255,0.04)', bloom: 'rgba(150,200,255,0.12)', key: '210,230,255', bounce: '70,100,140', shadowRgb: '14,14,28' },
    // ── DAYTIME TWIN ────────────────────────────────────────────────
    // Same street, same signage, same composition — the client's day plates
    // are the night scene relit, not a different picture. FLAT FOR NOW: the
    // multiplane cut has not been run on this plate yet, and the renderer
    // treats a stage with no `cards` as the old single-plate backdrop. That
    // is shallow, not broken, and it is the outstanding work. Underground's
    // day plate IS cut, nineteen cards, and is what the other three are
    // being brought up to.
    //
    // `groundFrac` and `meters` are MEASURED AGAINST THE NIGHT PLATE by
    // matching a named landmark across the two — see tools/check_day_framing.py,
    // which prints the derivation and writes a proof image showing the match.
    // Sky and horizon are MEDIANS SAMPLED OFF THE PLATE, not picked by eye —
    // a sky gradient that disagrees with the image it sits behind shows as a
    // band along the top of the frame.
    //
    // ⚠️ THESE WERE WRONG, AND THE METHOD THAT GOT THEM WRONG IS RECORDED IN
    // THAT TOOL. They were set by aligning the two plates' row-wise
    // edge-energy profiles, which cannot tell scale from offset — collapsing
    // an image to one number per row throws away which feature a peak belongs
    // to. Re-run honestly it returns groundFrac 1.595 for eav, a row 866 of a
    // 543-row file. Do not go back to it.
    day: {
      bg: {
        img: bgL5pDay,
        // Landmark: the CRIMINAL RECORDS fascia, matched at scale 0.980.
        // 0.677 cut through the shop windows, losing the RECORDS-TAPES-CDS
        // board, the bottom of every display window and the kerb.
        meters: 9.25,
        groundFrac: 0.730,
        sky: ['#3885ee', '#7fa9e2'],
        horizon: '#bed2ea',
        glow: 'rgba(255,244,214,0.09)',
        // No rain in the daytime set. The client's day plates are clear-sky
        // and dry; keeping the night stage's rain over them would be weather
        // falling out of a blue sky.
        rain: 0.0,
        // No practicals. Neon and streetlights do not read at midday, and
        // painting them as if they did is what makes a day scene look like a
        // night scene with the brightness turned up.
        lights: [],
      },
      light: { pool: 'rgba(255,244,214,0.10)', shaft: 'rgba(255,246,220,0.04)', bloom: 'rgba(255,240,200,0.07)', key: '255,248,226', bounce: '150,170,200', shadowRgb: '30,36,52' },
    },
    under: {
      asphalt: '#2c2b2c', base: '#454039', fill: '#523c2f', mid: '#5a4030', bottom: '#201814',
      brick: '#7d4a35', metal: '#787e85', metalDark: '#383c41', concrete: '#54514b',
      concreteDark: '#37342f', gas: '#b8952e', accent: '#4a7a8a', root: '#463322',
      tile: '#39383f', ballast: '#39352f', void_: '#0b0a11', lamp: 'rgba(150,200,255,0.20)', rat: '#272220',
      kinds: ['roots', 'conduit', 'water', 'sewer', 'rats', 'footings'],
    },
    enemyVariants: ['a', 'b', 'c'],
    stageEnd: 300,
    recipe: { gap: 0.126, plat: 0.26, haz: 0.414, gapMax: 4, vert: 0.40, enemy: 0.432, bag: 0.34 },
  },
];

// ── DAY OR NIGHT, WHEREVER THE PLAYER IS ─────────────────────────────────
//
// The client's rule: these are real Atlanta streets, so the stage should
// match the time of day the player is actually in. Night where they are means
// night streets; day means the daytime plates, and no rain.
//
// WHAT IT READS, AND WHY THAT AND NOT SOMETHING BETTER. `new Date()` gives the
// device's own local hour — already converted through whatever time zone the
// phone is set to, with no permission prompt, no network call, and no
// geolocation dialog in front of a game the player has not started yet. That
// is the whole component. There is nothing else a web page can read that is
// closer to "is it dark outside" without asking for the player's location,
// and a contest build that opens with a location request will lose people at
// the door.
//
// ITS LIMIT, STATED HONESTLY: a fixed clock boundary is not sunset. Atlanta
// gets dark near 17:30 in December and near 20:50 in June, so an evening in
// early summer will hand you night streets while it is still light out. Fixing
// that properly needs latitude and the day of the year, which needs location.
// 19:00-07:00 is the compromise: it is right for most of the day, every day of
// the year, for free.
const NIGHT_FROM = 19;   // 7pm
const NIGHT_UNTIL = 7;   // 7am

export function isNightNow(d = new Date()) {
  const h = d.getHours();
  return h >= NIGHT_FROM || h < NIGHT_UNTIL;
}

// `?tod=day` / `?tod=night` forces it. This is not debug scaffolding to strip
// later — it is how the client checks both halves of his own game without
// changing the clock on his phone, and how a bug report can say which one it
// was looking at.
export function timeOfDay() {
  if (typeof location !== 'undefined') {
    const m = /[?&]tod=(day|night)/.exec(location.search);
    if (m) return m[1];
  }
  // Then the player's own choice from the settings panel. Read straight out
  // of storage rather than imported from src/ui — the world layer should not
  // depend on the interface layer, and this is one key.
  try {
    const v = localStorage.getItem('wh_tod');
    if (v === 'day' || v === 'night') return v;
  } catch (_e) { /* private mode, or storage disabled */ }
  return isNightNow() ? 'night' : 'day';
}

// Fold the chosen half up to the top level so every reader — the renderer,
// the image manifest, the ambience — keeps saying `stage.bg` and `stage.light`
// and never has to know which it got. A stage with no `day` block stays on its
// night dressing rather than breaking.
export function resolveStages(tod = timeOfDay()) {
  return STAGE_DEFS.map((s) => {
    const { day, ...rest } = s;
    if (tod !== 'day' || !day) return { ...rest, tod: 'night' };
    return { ...rest, tod: 'day', bg: day.bg, light: day.light || rest.light };
  });
}

export const TIME_OF_DAY = timeOfDay();
export const STAGES = resolveStages(TIME_OF_DAY);
