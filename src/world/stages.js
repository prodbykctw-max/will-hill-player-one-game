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
// THE INPAINTED BASE, not the whole plate. Every card is drawn OVER
// this, so if it were the untouched painting each item would appear
// twice the moment the parallax moved it.
import bgEavDay from '../assets/backgrounds/eav-day-base.webp';
// THE INPAINTED BASE, not the whole plate. Every card is drawn OVER
// this, so if it were the untouched painting each item would appear
// twice the moment the parallax moved it.
import bgEdgewoodDay from '../assets/backgrounds/edgewood-day-base.webp';
// THE INPAINTED BASE, not the whole plate. Every card is drawn OVER
// this, so if it were the untouched painting each item would appear
// twice the moment the parallax moved it.
import bgL5pDay from '../assets/backgrounds/l5p-day-base.webp';

// ── DAY MULTIPLANE CARDS ─────────────────────────────────────────────────
import eavDayClouds from '../assets/backgrounds/eav-day-clouds.webp';
import eavDaySkystruct from '../assets/backgrounds/eav-day-skystruct.webp';
import eavDaySkyline from '../assets/backgrounds/eav-day-skyline.webp';
import eavDayMcdonalds from '../assets/backgrounds/eav-day-mcdonalds.webp';
import eavDayCars from '../assets/backgrounds/eav-day-cars.webp';
import eavDaySwifty from '../assets/backgrounds/eav-day-swifty.webp';
import eavDayCitgo from '../assets/backgrounds/eav-day-citgo.webp';
import eavDayFence from '../assets/backgrounds/eav-day-fence.webp';
import eavDayVerge from '../assets/backgrounds/eav-day-verge.webp';
import eavDayTree from '../assets/backgrounds/eav-day-tree.webp';
import eavDayPole from '../assets/backgrounds/eav-day-pole.webp';
import eavDayShrubRight from '../assets/backgrounds/eav-day-shrub_right.webp';
import edgewoodDayClouds from '../assets/backgrounds/edgewood-day-clouds.webp';
import edgewoodDaySkystruct from '../assets/backgrounds/edgewood-day-skystruct.webp';
import edgewoodDayTrees from '../assets/backgrounds/edgewood-day-trees.webp';
import edgewoodDaySkyline from '../assets/backgrounds/edgewood-day-skyline.webp';
import edgewoodDayParapet from '../assets/backgrounds/edgewood-day-parapet.webp';
import edgewoodDayFacade from '../assets/backgrounds/edgewood-day-facade.webp';
import edgewoodDayBayLeft from '../assets/backgrounds/edgewood-day-bay_left.webp';
import edgewoodDayBayMid1 from '../assets/backgrounds/edgewood-day-bay_mid1.webp';
import edgewoodDayBayMid2 from '../assets/backgrounds/edgewood-day-bay_mid2.webp';
import edgewoodDayBayRight from '../assets/backgrounds/edgewood-day-bay_right.webp';
import edgewoodDaySignBlm from '../assets/backgrounds/edgewood-day-sign_blm.webp';
import edgewoodDaySignSoul from '../assets/backgrounds/edgewood-day-sign_soul.webp';
import edgewoodDayNeonOpen from '../assets/backgrounds/edgewood-day-neon_open.webp';
import edgewoodDayNeonOurbar from '../assets/backgrounds/edgewood-day-neon_ourbar.webp';
import edgewoodDayNeonDis from '../assets/backgrounds/edgewood-day-neon_dis.webp';
import edgewoodDayLamps from '../assets/backgrounds/edgewood-day-lamps.webp';
import edgewoodDayPavement from '../assets/backgrounds/edgewood-day-pavement.webp';
import l5pDayClouds from '../assets/backgrounds/l5p-day-clouds.webp';
import l5pDaySkystruct from '../assets/backgrounds/l5p-day-skystruct.webp';
import l5pDayFarbuild from '../assets/backgrounds/l5p-day-farbuild.webp';
import l5pDaySign from '../assets/backgrounds/l5p-day-sign.webp';
import l5pDayLetters from '../assets/backgrounds/l5p-day-letters.webp';
import l5pDayRightpillar from '../assets/backgrounds/l5p-day-rightpillar.webp';
import l5pDayNewused from '../assets/backgrounds/l5p-day-newused.webp';
import l5pDayNewusedsign from '../assets/backgrounds/l5p-day-newusedsign.webp';
import l5pDayBrick from '../assets/backgrounds/l5p-day-brick.webp';
import l5pDayBuysell from '../assets/backgrounds/l5p-day-buysell.webp';
import l5pDayBayleft from '../assets/backgrounds/l5p-day-bayleft.webp';
import l5pDayOpenneon from '../assets/backgrounds/l5p-day-openneon.webp';
import l5pDayBaymid from '../assets/backgrounds/l5p-day-baymid.webp';
import l5pDayAwning from '../assets/backgrounds/l5p-day-awning.webp';
import l5pDayBayright from '../assets/backgrounds/l5p-day-bayright.webp';
import l5pDayPoster from '../assets/backgrounds/l5p-day-poster.webp';
import l5pDayKerb from '../assets/backgrounds/l5p-day-kerb.webp';
import l5pDayPole from '../assets/backgrounds/l5p-day-pole.webp';

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
// ── FIVE POINTS, CUT AT LAST ─────────────────────────────────────────────
// The client's wide 1535x1024 pair replaced a 1122x1402 portrait painting, and
// every one of the old thirty-four cards was keyed to coordinates in a picture
// that no longer exists — so Underground shipped FLAT while the other three
// stages had depth. This is the re-cut: a fresh SAM cascade per plate (407
// usable masks in daylight, 326 at night), grouped by region in
// tools/sam_group.py, checked on its --map render before anything was cut, and
// cut by tools/cut_planes.py. Fifteen cards a side, plus the day's drifting
// clouds and its sky seal.
//
// Day and night are the same composition relit and cross-correlate at dx 0,
// dy 2 — but the two sets are cut PER PLATE, because at night SAM finds
// different edges (the left office block is dark and its lit windows are the
// only thing with a boundary) and a mask ten pixels out silently loses a card.
import ugTowers from '../assets/backgrounds/underground-towers.webp';
import ugBackdrop from '../assets/backgrounds/underground-backdrop.webp';
import ugLeftblock from '../assets/backgrounds/underground-leftblock.webp';
import ugPark from '../assets/backgrounds/underground-park.webp';
import ugMidbuild from '../assets/backgrounds/underground-midbuild.webp';
import ugPeachtree from '../assets/backgrounds/underground-peachtree.webp';
import ugArch from '../assets/backgrounds/underground-arch.webp';
import ugCoke from '../assets/backgrounds/underground-coke.webp';
import ugWaffle from '../assets/backgrounds/underground-waffle.webp';
import ugDirsign from '../assets/backgrounds/underground-dirsign.webp';
import ugTrees from '../assets/backgrounds/underground-trees.webp';
import ugShelter from '../assets/backgrounds/underground-shelter.webp';
import ugFurniture from '../assets/backgrounds/underground-furniture.webp';
import ugLamps from '../assets/backgrounds/underground-lamps.webp';
import ugColumns from '../assets/backgrounds/underground-columns.webp';
import bgUndergroundDayBase from '../assets/backgrounds/underground-day-base.webp';
import ugdClouds from '../assets/backgrounds/underground-day-clouds.webp';
import ugdSkystruct from '../assets/backgrounds/underground-day-skystruct.webp';
import ugdTowers from '../assets/backgrounds/underground-day-towers.webp';
import ugdBackdrop from '../assets/backgrounds/underground-day-backdrop.webp';
import ugdLeftblock from '../assets/backgrounds/underground-day-leftblock.webp';
import ugdPark from '../assets/backgrounds/underground-day-park.webp';
import ugdMidbuild from '../assets/backgrounds/underground-day-midbuild.webp';
import ugdPeachtree from '../assets/backgrounds/underground-day-peachtree.webp';
import ugdArch from '../assets/backgrounds/underground-day-arch.webp';
import ugdCoke from '../assets/backgrounds/underground-day-coke.webp';
import ugdWaffle from '../assets/backgrounds/underground-day-waffle.webp';
import ugdDirsign from '../assets/backgrounds/underground-day-dirsign.webp';
import ugdTrees from '../assets/backgrounds/underground-day-trees.webp';
import ugdShelter from '../assets/backgrounds/underground-day-shelter.webp';
import ugdFurniture from '../assets/backgrounds/underground-day-furniture.webp';
import ugdLamps from '../assets/backgrounds/underground-day-lamps.webp';
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
        { key: 'verge', img: eavVerge, depth: 0.75, span: [0.000, 0.859] },
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
        // ⚠️ PLANTED IN THE GROUND STRIP, SO IT SITS AT THE GROUND'S DEPTH.
          // Client, on an earlier build: "the street on the left of that pole,
          // as you move to the right it separates from the pole." A thing
          // whose base is IN another card is not at its own depth — it is at
          // that card's. So the pole takes the verge/kerb's depth rather than
          // the 1.0 its position in the draw order would suggest.
          { key: 'pole', img: eavPole, depth: 0.76, span: [0.823, 0.916] },
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
        // ── THE SKY IS SAMPLED OFF THE PLATE, NOT PICKED ─────────────
        // The gradient is only ever visible ABOVE the plate's top edge, so
        // the colour it reaches THERE is the only one that matters — and it
        // was reaching a pale #9dbbe6 while the painting's own sky is a
        // saturated #438fef, which puts a visible band across the top of the
        // frame. Client: "pallet absorb the sky from the image to make that
        // blue backdrop match the blue exactly so it blends better."
        //
        // So the lower stop AND the horizon are the plate's own top rows,
        // medianed across the full width so a cloud or a spire cannot drag
        // the sample. Only the zenith is derived rather than measured — the
        // painting has no sky above itself to copy — and it is the same
        // colour taken down 28% red / 14% green with blue held, which is how
        // a real sky deepens overhead. Wherever the plate's top edge lands on
        // whatever screen, the gradient meets it within a few levels.
        sky: ['#307aef', '#438fef'],
        horizon: '#438fef',
        glow: 'rgba(255,244,214,0.09)',
        // No rain in the daytime set. The client's day plates are clear-sky
        // and dry; keeping the night stage's rain over them would be weather
        // falling out of a blue sky.
        rain: 0.0,
        // No practicals. Neon and streetlights do not read at midday, and
        // painting them as if they did is what makes a day scene look like a
        // night scene with the brightness turned up.
        // ── THE DAY MULTIPLANE SET ──────────────────────────────────
        // Same card names, same depths, same sway constants as the night
        // cut, because the client's requirement is that the two match
        // exactly apart from the weather. Only `span` and the sway
        // xRanges are recomputed, from each DAY card's own alpha bbox and
        // the measured night->day transform, since the two exports are a
        // percent or two different in size.
        cards: [
          // Puffs on transparency, not a band of sky — the band's alpha edge
          // printed a travelling seam and its baked twins doubled every
          // cloud once the drift accumulated (tools/scrub_stage_clouds.py).
          { key: 'clouds', img: eavDayClouds, depth: 0.02, drift: -0.035, span: [0.490, 0.993] },
          // Poles, signal, arch — the sky band's STATIC furniture, repainted
          // over the drifting puffs so a cloud passes BEHIND them. Depth 0.5
          // is BASE_DEPTH on purpose: at the base's own rate it registers
          // with the base's copy to the pixel, forever.
          { key: 'skystruct', img: eavDaySkystruct, depth: 0.5, span: [0.000, 1.000] },
          { key: 'skyline', img: eavDaySkyline, depth: 0.07, span: [0.768, 0.980] },
          { key: 'mcdonalds', img: eavDayMcdonalds, depth: 0.16, span: [0.899, 0.979] },
          { key: 'cars', img: eavDayCars, depth: 0.21, span: [0.772, 0.979] },
          { key: 'swifty', img: eavDaySwifty, depth: 0.25, span: [0.129, 0.416] },
          { key: 'citgo', img: eavDayCitgo, depth: 0.41, span: [0.119, 0.542] },
          { key: 'fence', img: eavDayFence, depth: 0.67, span: [0.212, 0.772] },
          { key: 'verge', img: eavDayVerge, depth: 0.75, span: [0.000, 0.837] },
          {
          key: 'tree', img: eavDayTree, depth: 0.81, span: [0.000, 0.298],
          sway: [
            // CANOPY. Pivot at the bottom of the leaf mass — the trunk is
            // below it and stays dead still.
            { top: 0.02, pivot: 0.44, amp: 5, freq: 0.9, xRanges: [[0.000, 0.097]] },
            // Low shrubs along the fence: shorter lever, so less travel at a
            // quicker frequency.
            { top: 0.52, pivot: 0.92, amp: 2.5, freq: 1.7, xRanges: [[0.077, 0.290]] },
          ],
          },
          // THE CARD THE OLD DAY CUT LOST. Night has always had it; the day
          // pass never emitted it, and the fence card was cut with a
          // shrub-shaped hole where it belongs — which is what the client saw
          // as vertical slots torn through the planks with the skyline
          // showing between them. Same depth and the same sway as night.
          {
            key: 'shrub_right', img: eavDayShrubRight, depth: 0.85, span: [0.725, 0.799],
            sway: [{ top: 0.66, pivot: 0.88, amp: 2.5, freq: 1.7, xRanges: [[0.725, 0.799]] }],
          },
          // ⚠️ PLANTED IN THE GROUND STRIP, SO IT SITS AT THE GROUND'S DEPTH.
          // Client, on an earlier build: "the street on the left of that pole,
          // as you move to the right it separates from the pole." A thing
          // whose base is IN another card is not at its own depth — it is at
          // that card's. So the pole takes the verge/kerb's depth rather than
          // the 1.0 its position in the draw order would suggest.
          { key: 'pole', img: eavDayPole, depth: 0.76, span: [0.810, 0.894] },
        ],
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
    // ── LENGTH ────────────────────────────────────────────────────────
    // +50% on the whole ramp (240/260/280/300 -> 360/390/420/450) at the
    // client's request: "I may want to extend each stage length by 50% just
    // to make each stage a little longer. This is supposed to be a 72 hour
    // contest and the stages are pretty short."
    //
    // The ramp's SHAPE is preserved — each stage is still 30 columns longer
    // than the one before, so the difficulty curve and the MARTA route are
    // unchanged. Everything downstream is a fraction of stageEnd and scales
    // with it: the two champagne bottles sit at 0.34 and 0.68, and every
    // hazard, bag and enemy is a per-column roll, so density is identical and
    // only the duration grows.
    stageEnd: 360, // finish-line column (T=32px/col -> 11520px, ~137m)
    recipe: { gap: 0.072, plat: 0.20, haz: 0.306, gapMax: 2, vert: 0.25, enemy: 0.27, bags: 90 },
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
        { key: 'pavement', img: ewPavement, depth: 0.84, span: [0.001, 1.000] },
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
        // ── THE SKY IS SAMPLED OFF THE PLATE, NOT PICKED ─────────────
        // The gradient is only ever visible ABOVE the plate's top edge, so
        // the colour it reaches THERE is the only one that matters — and it
        // was reaching a pale #9dbbe6 while the painting's own sky is a
        // saturated #438fef, which puts a visible band across the top of the
        // frame. Client: "pallet absorb the sky from the image to make that
        // blue backdrop match the blue exactly so it blends better."
        //
        // So the lower stop AND the horizon are the plate's own top rows,
        // medianed across the full width so a cloud or a spire cannot drag
        // the sample. Only the zenith is derived rather than measured — the
        // painting has no sky above itself to copy — and it is the same
        // colour taken down 28% red / 14% green with blue held, which is how
        // a real sky deepens overhead. Wherever the plate's top edge lands on
        // whatever screen, the gradient meets it within a few levels.
        sky: ['#2b77f2', '#3d8bf2'],
        horizon: '#3d8bf2',
        glow: 'rgba(255,244,214,0.09)',
        // No rain in the daytime set. The client's day plates are clear-sky
        // and dry; keeping the night stage's rain over them would be weather
        // falling out of a blue sky.
        rain: 0.0,
        // No practicals. Neon and streetlights do not read at midday, and
        // painting them as if they did is what makes a day scene look like a
        // night scene with the brightness turned up.
        // ── THE DAY MULTIPLANE SET ──────────────────────────────────
        // Same card names, same depths, same sway constants as the night
        // cut, because the client's requirement is that the two match
        // exactly apart from the weather. Only `span` and the sway
        // xRanges are recomputed, from each DAY card's own alpha bbox and
        // the measured night->day transform, since the two exports are a
        // percent or two different in size.
        cards: [
          // The one card with NO night counterpart: the night plate's sky is a
          // black band with nothing in it to lift. Farthest thing in the
          // picture, so it gets the smallest depth and barely moves.
          { key: 'clouds', img: edgewoodDayClouds, depth: 0.02, drift: -0.035, span: [0.163, 0.568] },
          // The sky band's static furniture, repainted over the drifting
          // clouds so weather passes BEHIND it. depth 0.5 is BASE_DEPTH:
          // at the base's own rate it registers with the base's copy to
          // the pixel. tools/seal_stage_clouds.py.
          { key: 'skystruct', img: edgewoodDaySkystruct, depth: 0.5, span: [0.000, 1.000] },
          // ── THE OVERHANGING TREE ────────────────────────────────────
          // Its own card at last. It was split between `skyline` (25% of the
          // canopy, travelling with the buildings) and the static base (the
          // other 75%) — a tree torn in half along a line nobody drew.
          //
          // DEPTH 0.70 puts it well in FRONT of the facade at 0.34, which is
          // the client's point: "a tree is not where that building is, but it
          // covers it up." It overhangs the near side of the frame, so it
          // should travel faster than the wall behind it.
          //
          // Sway pivots at the bottom of the leaf mass, the same model as the
          // EAV canopy — the trunk below is not in this card at all, so
          // everything in it is allowed to move.
          {
            key: 'trees', img: edgewoodDayTrees, depth: 0.70,
            span: [0.000, 0.274],
            sway: [{ top: 0.0, pivot: 0.328, amp: 4, freq: 0.85,
              xRanges: [[0.000, 0.274]] }],
          },
          { key: 'skyline', img: edgewoodDaySkyline, depth: 0.05, span: [0.021, 0.995] },
          { key: 'parapet', img: edgewoodDayParapet, depth: 0.20, span: [0.025, 0.992] },
          { key: 'facade', img: edgewoodDayFacade, depth: 0.34, span: [0.001, 0.995] },
          { key: 'bay_left', img: edgewoodDayBayLeft, depth: 0.44, span: [0.056, 0.244] },
          { key: 'bay_mid1', img: edgewoodDayBayMid1, depth: 0.46, span: [0.367, 0.518] },
          { key: 'bay_mid2', img: edgewoodDayBayMid2, depth: 0.48, span: [0.522, 0.655] },
          { key: 'bay_right', img: edgewoodDayBayRight, depth: 0.44, span: [0.781, 0.929] },
          { key: 'sign_blm', img: edgewoodDaySignBlm, depth: 0.47, span: [0.396, 0.488] },
          { key: 'sign_soul', img: edgewoodDaySignSoul, depth: 0.49, span: [0.554, 0.627] },
          { key: 'neon_open', img: edgewoodDayNeonOpen, depth: 0.49, span: [0.592, 0.650] },
          { key: 'neon_ourbar', img: edgewoodDayNeonOurbar, depth: 0.45, span: [0.109, 0.201] },
          { key: 'neon_dis', img: edgewoodDayNeonDis, depth: 0.45, span: [0.823, 0.890] },
          { key: 'lamps', img: edgewoodDayLamps, depth: 0.62, span: [0.004, 0.992] },
          { key: 'pavement', img: edgewoodDayPavement, depth: 0.84, span: [0.003, 0.995] },
        ],
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
    stageEnd: 390,
    recipe: { gap: 0.090, plat: 0.22, haz: 0.342, gapMax: 3, vert: 0.30, enemy: 0.324, bags: 97 },
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
      // THE PLATE. Client-supplied, 1535x1024 — it replaced a 1122x1402
      // PORTRAIT painting, which was the single cause of three faults he
      // photographed: "cloud coming through building, double building", and
      // "that should be the first seam of the bg where it repeats". Measured
      // with tools/harness/seamsweep.mjs, scaling the portrait plate by its
      // height to sit on the world's ground squeezed its drawn width to 478px
      // against a 430px screen, so the join was on screen in 82 of 94 frames
      // (EAV: 0 of 80) and anything wider than 48px had two copies showing at
      // once. This one draws ~984px, so a second copy of the arch cannot fit on
      // screen at all. Ground line measured at y 727-753 of 1024 — the yellow
      // platform edge — hence groundFrac 0.71. Day and night are a matched
      // pair: cross-correlating their edge maps puts them at dx 0, dy 2 on a
      // 512-tall resample, so the tod swap does not jump.
      meters: 8.6,
      groundFrac: 0.71,
      sky: ['#080818', '#06091e'],
      horizon: '#191a30',
      glow: 'rgba(220,60,60,0.10)',
      rain: 0.55, // partly sheltered under the arch
      windBands: [{ top: 0.02, pivot: 0.26, amp: 2, freq: 1.1, xRanges: [[0.60, 0.70]] }],
      // ── THE MULTIPLANE SET, far -> near ─────────────────────────────
      // Built in real perspective, so this plate has more genuine depth than
      // any of the other three: downtown behind, the office block the arch
      // stands in front of, the arch itself in the middle distance, and two
      // cast-iron columns almost at the kerb.
      //
      // Spans are the cutter's own reported x-extents over the 1535px plate,
      // divided by its width — not estimates. Depth is a far->near ordering in
      // 0..1; the renderer turns it into a rate inside a deliberately TINY
      // spread, so nothing migrates across the level.
      //
      // ⚠️ THE COLUMNS AND THE ARCH ARE 0.02 APART, AND THAT IS THE POINT.
      // They are one structure: the columns hold the arch up. Placing the dome
      // in the middle distance and the columns at the kerb — which is what
      // their positions on screen suggest — shears the arch off its own legs a
      // few hundred pixels into the stage. Things that hold each other up stay
      // together.
      //
      // ⚠️ NO `street` CARD, on either half. The plaza is a ground strip: no
      // landmark inside it, but a hard edge along the top with the columns
      // planted on that edge. The one time a strip got its own rate the verge
      // travelled 400px while the fence standing in it travelled 20 — 380px of
      // shear on a 430px screen. The plaza is the base plate.
      cards: [
        { key: 'towers', img: ugTowers, depth: 0.07, span: [0.513, 0.999] },
        { key: 'backdrop', img: ugBackdrop, depth: 0.12, span: [0.242, 0.589] },
        { key: 'leftblock', img: ugLeftblock, depth: 0.18, span: [0.000, 0.242] },
        // PARK / ALL DAY — a blade sign bolted to the left block's corner, so
        // it sits with the block rather than at the depth its position in the
        // draw order would suggest.
        { key: 'park', img: ugPark, depth: 0.20, span: [0.050, 0.116] },
        { key: 'peachtree', img: ugPeachtree, depth: 0.22, span: [0.826, 0.999] },
        { key: 'midbuild', img: ugMidbuild, depth: 0.28, span: [0.180, 0.657] },
        // The Waffle House frontage is ON the midbuild block; the Coca-Cola
        // disc stands off it on a post.
        { key: 'waffle', img: ugWaffle, depth: 0.33, span: [0.558, 0.596] },
        { key: 'coke', img: ugCoke, depth: 0.38, span: [0.538, 0.593] },
        {
          key: 'trees', img: ugTrees, depth: 0.48, span: [0.000, 0.948],
          // Street trees, pivoted at the bottom of each canopy so the trunks
          // stay put. Three windows rather than one, or the whole line leans
          // together like the single cutout it would otherwise be.
          sway: [
            { top: 0.30, pivot: 0.62, amp: 3.5, freq: 0.9, xRanges: [[0.000, 0.080]] },
            { top: 0.30, pivot: 0.66, amp: 3, freq: 1.1, xRanges: [[0.630, 0.720]] },
            { top: 0.28, pivot: 0.64, amp: 3, freq: 0.8, xRanges: [[0.730, 0.950]] },
          ],
        },
        { key: 'dirsign', img: ugDirsign, depth: 0.56, span: [0.468, 0.527] },
        { key: 'shelter', img: ugShelter, depth: 0.58, span: [0.000, 0.182] },
        { key: 'arch', img: ugArch, depth: 0.68, span: [0.392, 0.592] },
        { key: 'columns', img: ugColumns, depth: 0.70, span: [0.349, 0.633] },
        // News boxes, bin, mail box, hydrant and the parked cars — everything
        // standing on the plaza at one distance, on one card.
        { key: 'furniture', img: ugFurniture, depth: 0.76, span: [0.189, 0.816] },
        { key: 'lamps', img: ugLamps, depth: 0.78, span: [0.226, 0.888] },
      ],
      // The arch marquee bulbs, the Coca-Cola disc and the Waffle House
      // frontage — the three things genuinely emitting in this plate.
      // `layer` bolts each glow to its card so it travels with the thing that
      // emits it instead of sliding off it.
      // ⚠️ THE MARQUEE GLOW RIDES `arch`, NOT A LETTERS CARD. UNDERGROUND was
      // cut as its own card so the bulbs could be bolted to the word — and the
      // cut came back with six of eleven glyphs, reading "N ERGROU D". SAM
      // finds some letters on this plate and not others, and the ones it misses
      // are not recoverable by lowering a threshold already at the floor. The
      // letters are painted flat on the drum with no gap behind them, so they
      // were never a depth layer; the whole sign is the thing emitting.
      lights: [
        { x: 0.50, y: 0.30, r: 0.26, rgb: '255,226,160', a: 0.24, flicker: 0.030, layer: 'arch' },
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
        groundFrac: 0.71,   // the yellow platform edge, measured at y 727/1024
        // ── THE SKY IS SAMPLED OFF THE PLATE, NOT PICKED ─────────────
        // The gradient is only ever visible ABOVE the plate's top edge, so
        // the colour it reaches THERE is the only one that matters — and it
        // was reaching a pale #9dbbe6 while the painting's own sky is a
        // saturated #438fef, which puts a visible band across the top of the
        // frame. Client: "pallet absorb the sky from the image to make that
        // blue backdrop match the blue exactly so it blends better."
        //
        // So the lower stop AND the horizon are the plate's own top rows,
        // medianed across the full width so a cloud or a spire cannot drag
        // the sample. Only the zenith is derived rather than measured — the
        // painting has no sky above itself to copy — and it is the same
        // colour taken down 28% red / 14% green with blue held, which is how
        // a real sky deepens overhead. Wherever the plate's top edge lands on
        // whatever screen, the gradient meets it within a few levels.
        // ⚠️ RE-MEASURED AFTER THE CLOUD SCRUB. Lifting the clouds off this
        // plate repaints sky where they were, and the top-row median moved
        // #2e89f9 -> #2386fa — 11 levels of red. Small, but it is a band across
        // the top of the frame exactly where the gradient meets the plate, and
        // re-measuring is the whole reason these are sampled rather than picked.
        // Zenith is the same colour taken down 28% red / 14% green with blue
        // held, which is how a real sky deepens overhead.
        sky: ['#1973fa', '#2386fa'],
        horizon: '#2386fa',
        glow: 'rgba(255,236,190,0.10)',
        rain: 0.0,
        windBands: [{ top: 0.02, pivot: 0.26, amp: 2, freq: 1.1, xRanges: [[0.60, 0.70]] }],
        // FIFTEEN cards plus the weather, cut from the day plate's OWN SAM
        // pass rather than reusing the night set — same reasoning as the night
        // half above, and the depths are deliberately identical so the tod swap
        // changes the paint and nothing else.
        cards: [
          // ⚠️ THE CLOUDS ARE PUFFS ON TRANSPARENCY, NOT A BAND OF SKY. Cut as
          // a region of sky with clouds in it, a drifting card drags a slab of
          // slightly-wrong blue across the real sky and its edges wipe over
          // whatever they cross — both of which the client reported on sight.
          // tools/scrub_stage_clouds.py lifts the free-floating blobs off the
          // base and repaints sky behind them; eight lifted here, one left
          // baked because its ring is 47% structure — it is the cloud behind
          // the left block, and lifting a cloud a building is standing in front
          // of is how you get a cloud in front of the building.
          { key: 'clouds', img: ugdClouds, depth: 0.02, drift: -0.030, span: [0.220, 0.949] },
          // ⚠️ THE SEAL, AND ITS TWO FIELDS DO TWO DIFFERENT JOBS. `depth: 0.5`
          // is the BASE's own depth, which is what makes this register with the
          // base's copy of the same pixels to the pixel, forever. Its POSITION
          // IN THIS ARRAY — after `clouds` — is what makes it occlude the
          // weather, because drawCards iterates the list in order and `depth`
          // only sets the rate. Move the line and the fix moves with it: a
          // cloud becomes visible through every building it passes behind,
          // which is the longest-running bug on this project.
          { key: 'skystruct', img: ugdSkystruct, depth: 0.5, span: [0.000, 1.000] },
          { key: 'towers', img: ugdTowers, depth: 0.07, span: [0.511, 0.999] },
          { key: 'backdrop', img: ugdBackdrop, depth: 0.12, span: [0.242, 0.539] },
          { key: 'leftblock', img: ugdLeftblock, depth: 0.18, span: [0.000, 0.243] },
          { key: 'park', img: ugdPark, depth: 0.20, span: [0.079, 0.117] },
          { key: 'peachtree', img: ugdPeachtree, depth: 0.22, span: [0.827, 0.999] },
          { key: 'midbuild', img: ugdMidbuild, depth: 0.28, span: [0.248, 0.657] },
          { key: 'waffle', img: ugdWaffle, depth: 0.33, span: [0.564, 0.638] },
          { key: 'coke', img: ugdCoke, depth: 0.38, span: [0.543, 0.597] },
          {
            key: 'trees', img: ugdTrees, depth: 0.48, span: [0.000, 0.947],
            sway: [
              { top: 0.30, pivot: 0.62, amp: 3.5, freq: 0.9, xRanges: [[0.000, 0.080]] },
              { top: 0.30, pivot: 0.66, amp: 3, freq: 1.1, xRanges: [[0.630, 0.720]] },
              { top: 0.28, pivot: 0.64, amp: 3, freq: 0.8, xRanges: [[0.730, 0.950]] },
            ],
          },
          { key: 'dirsign', img: ugdDirsign, depth: 0.56, span: [0.477, 0.534] },
          { key: 'shelter', img: ugdShelter, depth: 0.58, span: [0.000, 0.186] },
          { key: 'arch', img: ugdArch, depth: 0.68, span: [0.387, 0.639] },
          { key: 'columns', img: ugdColumns, depth: 0.70, span: [0.357, 0.635] },
          { key: 'furniture', img: ugdFurniture, depth: 0.76, span: [0.154, 0.780] },
          { key: 'lamps', img: ugdLamps, depth: 0.78, span: [0.225, 0.890] },
        ],
        // Daylight. The marquee bulbs still read, faintly, but a Coca-Cola
        // disc and a Waffle House sign do not glow at midday, and painting
        // them as if they did is what makes a day scene look like a night
        // scene with the brightness turned up. Bolted to `arch` for the same
        // reason as the night half — there is no letters card, and why not is
        // written up there.
        lights: [
          { x: 0.50, y: 0.55, r: 0.20, rgb: '255,236,190', a: 0.12, flicker: 0.030, layer: 'arch' },
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
    stageEnd: 420,
    recipe: { gap: 0.108, plat: 0.24, haz: 0.378, gapMax: 3, vert: 0.35, enemy: 0.378, bags: 103 },
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
        { key: 'kerb', img: l5pKerb, depth: 0.82, span: [0.004, 0.965] },
        // ⚠️ PLANTED IN THE GROUND STRIP, SO IT SITS AT THE GROUND'S DEPTH.
          // Client, on an earlier build: "the street on the left of that pole,
          // as you move to the right it separates from the pole." A thing
          // whose base is IN another card is not at its own depth — it is at
          // that card's. So the pole takes the verge/kerb's depth rather than
          // the 1.0 its position in the draw order would suggest.
          { key: 'pole', img: l5pPole, depth: 0.83, span: [0.055, 0.132] },
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
        // ── THE SKY IS SAMPLED OFF THE PLATE, NOT PICKED ─────────────
        // The gradient is only ever visible ABOVE the plate's top edge, so
        // the colour it reaches THERE is the only one that matters — and it
        // was reaching a pale #9dbbe6 while the painting's own sky is a
        // saturated #438fef, which puts a visible band across the top of the
        // frame. Client: "pallet absorb the sky from the image to make that
        // blue backdrop match the blue exactly so it blends better."
        //
        // So the lower stop AND the horizon are the plate's own top rows,
        // medianed across the full width so a cloud or a spire cannot drag
        // the sample. Only the zenith is derived rather than measured — the
        // painting has no sky above itself to copy — and it is the same
        // colour taken down 28% red / 14% green with blue held, which is how
        // a real sky deepens overhead. Wherever the plate's top edge lands on
        // whatever screen, the gradient meets it within a few levels.
        sky: ['#2872ee', '#3885ee'],
        horizon: '#3885ee',
        glow: 'rgba(255,244,214,0.09)',
        // No rain in the daytime set. The client's day plates are clear-sky
        // and dry; keeping the night stage's rain over them would be weather
        // falling out of a blue sky.
        rain: 0.0,
        // No practicals. Neon and streetlights do not read at midday, and
        // painting them as if they did is what makes a day scene look like a
        // night scene with the brightness turned up.
        // ── THE DAY MULTIPLANE SET ──────────────────────────────────
        // Same card names, same depths, same sway constants as the night
        // cut, because the client's requirement is that the two match
        // exactly apart from the weather. Only `span` and the sway
        // xRanges are recomputed, from each DAY card's own alpha bbox and
        // the measured night->day transform, since the two exports are a
        // percent or two different in size.
        cards: [
          // The one card with NO night counterpart: the night plate's sky is a
          // black band with nothing in it to lift. Farthest thing in the
          // picture, so it gets the smallest depth and barely moves.
          { key: 'clouds', img: l5pDayClouds, depth: 0.02, drift: -0.035, span: [0.178, 0.764] },
          // The sky band's static furniture, repainted over the drifting
          // clouds so weather passes BEHIND it. depth 0.5 is BASE_DEPTH:
          // at the base's own rate it registers with the base's copy to
          // the pixel. tools/seal_stage_clouds.py.
          { key: 'skystruct', img: l5pDaySkystruct, depth: 0.5, span: [0.055, 1.000] },
          { key: 'farbuild', img: l5pDayFarbuild, depth: 0.06, span: [0.021, 0.173] },
          { key: 'sign', img: l5pDaySign, depth: 0.22, span: [0.458, 0.936] },
          { key: 'letters', img: l5pDayLetters, depth: 0.23, span: [0.512, 0.897] },
          { key: 'rightpillar', img: l5pDayRightpillar, depth: 0.30, span: [0.937, 1.000] },
          { key: 'newused', img: l5pDayNewused, depth: 0.40, span: [0.143, 0.315] },
          { key: 'newusedsign', img: l5pDayNewusedsign, depth: 0.41, span: [0.160, 0.313] },
          { key: 'brick', img: l5pDayBrick, depth: 0.48, span: [0.313, 0.466] },
          { key: 'buysell', img: l5pDayBuysell, depth: 0.49, span: [0.339, 0.411] },
          { key: 'bayleft', img: l5pDayBayleft, depth: 0.56, span: [0.454, 0.605] },
          { key: 'openneon', img: l5pDayOpenneon, depth: 0.57, span: [0.478, 0.544] },
          { key: 'baymid', img: l5pDayBaymid, depth: 0.60, span: [0.606, 0.726] },
          { key: 'awning', img: l5pDayAwning, depth: 0.63, span: [0.776, 0.898] },
          { key: 'bayright', img: l5pDayBayright, depth: 0.64, span: [0.736, 0.975] },
          { key: 'poster', img: l5pDayPoster, depth: 0.65, span: [0.802, 0.906] },
          { key: 'kerb', img: l5pDayKerb, depth: 0.82, span: [0.022, 0.971] },
          // ⚠️ PLANTED IN THE GROUND STRIP, SO IT SITS AT THE GROUND'S DEPTH.
          // Client, on an earlier build: "the street on the left of that pole,
          // as you move to the right it separates from the pole." A thing
          // whose base is IN another card is not at its own depth — it is at
          // that card's. So the pole takes the verge/kerb's depth rather than
          // the 1.0 its position in the draw order would suggest.
          { key: 'pole', img: l5pDayPole, depth: 0.83, span: [0.072, 0.149] },
        ],
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
    stageEnd: 450,
    recipe: { gap: 0.126, plat: 0.26, haz: 0.414, gapMax: 4, vert: 0.40, enemy: 0.432, bags: 110 },
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

// ── THE GAME RUNS ON ATLANTA TIME, WHEREVER YOU ARE ──────────────────────
//
// Client: "the goal was to bring Atlanta to the world… if I'm in California
// and I'm playing this game, the time it is in Atlanta needs to be the time it
// is in this game. If I'm in Australia and I'm playing this game, the time it
// is in Atlanta needs to be the time it is in this game."
//
// So the default is no longer the device's clock. It is Eastern. A player in
// Sydney opening this at their lunchtime gets Atlanta's night streets, because
// the streets ARE Atlanta's — EAV, Edgewood, Underground, Little Five Points —
// and a game about a place should be on that place's clock.
//
// `Intl` is asked for the hour in America/New_York rather than an offset being
// subtracted, so daylight saving is handled by the platform's own tz database
// and there is no March and November bug waiting to happen. If Intl is missing
// or the zone is unknown — ancient browsers, stripped runtimes — it falls back
// to the device clock rather than throwing, because a wrong-looking sky is a
// blemish and a crash is a lost player.
export function atlantaHour(d = new Date()) {
  try {
    const s = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: 'numeric', hour12: false,
    }).format(d);
    const h = parseInt(s, 10);
    // hour12:false can render midnight as 24 depending on the engine.
    if (Number.isFinite(h)) return h % 24;
  } catch (_e) { /* no Intl, or no tz data */ }
  return d.getHours();
}

export function isNightInAtlanta(d = new Date()) {
  const h = atlantaHour(d);
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
    // 'local' is the old default under its honest name: the clock on the
    // device in the player's hand. 'auto' is what that setting used to be
    // stored as, so anybody who explicitly picked "Match my clock" before this
    // change keeps it — the settings panel maps the same pair the same way,
    // and the two must agree or the dropdown would say one thing while the sky
    // did another. Anything else — including an empty slot, which is every new
    // player — falls through to Atlanta.
    if (v === 'local' || v === 'auto') return isNightNow() ? 'night' : 'day';
  } catch (_e) { /* private mode, or storage disabled */ }
  return isNightInAtlanta() ? 'night' : 'day';
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
