// IS THE RUN-IN TO EVERY FINISH LINE CLEAR?
//
// Client: "the finish line of criminal records is in a pothole. Is it always
// gonna be there or did it just spawn there this time?"
//
// It was always there. `createLevel` seeds with `stageIndex * 97 + 13` — a
// pure function of the stage number — so every stage lays out identically for
// every player on every run. That determinism is the reason this file can be
// an EXHAUSTIVE check rather than a sampling one: there is exactly one layout
// per stage, and either it is clean or it is not.
//
// Measured before the fix: EAV, Edgewood and the Underground were clear for
// eight columns before their line; Little 5 Points had an obstacle spanning
// columns 449-454 across a finish at 450. The generation loop refuses to
// place features AT or past `stageEnd`, but never checked whether one placed
// just before it EXTENDS across — and a pothole is up to 5.25 columns wide.
//
// ⚠️ THIS RUNS THE REAL GENERATOR, NOT A COPY OF ITS RULES. A checker that
// re-implements the placement maths would agree with itself and prove
// nothing; preview_planes.py kept its own copy of the depth table for weeks
// and verified against its own numbers. This imports the shipping module and
// asks it for the shipping levels.
//
// BREAK-TEST: set FINISH_BREAK=1 to grade against a clear-zone of 0, which is
// the pre-fix behaviour. Little 5 Points must go red, or this file is
// decoration.
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const BREAK = process.env.FINISH_BREAK === '1';
const checks = [];
const check = (what, pass, detail = '') => {
  checks.push([what, pass]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

const p = await (await b.newContext({ viewport: { width: 430, height: 932 } })).newPage();
p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
await p.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game, null, { timeout: 25000 });

const stages = await p.evaluate(async (isBreak) => {
  // ⚠️ THE BREAK-TEST HAS TO CHANGE THE PRODUCT, NOT THE THRESHOLD. The first
  // cut of this file "broke" itself by grading against a zero-column zone —
  // and reported 12/12, because the generator was still applying its
  // clearance and there was nothing near any line to find. Flipping the
  // generator's own door reproduces the shipped layout instead.
  if (isBreak) window.__finishClearOff = true;
  const gen = await import('/src/world/generator.js');
  const { STAGES } = await import('/src/world/stages.js');
  const T = 32;
  const CLEAR = 6;
  const out = [];
  for (let i = 0; i < STAGES.length; i++) {
    const lv = gen.createLevel(STAGES[i], i);
    gen.buildRunway(lv);
    // Generate past the line so the plaza exists too — a feature can only be
    // seen to cross the line if the columns beyond it have been built.
    gen.genAhead(lv, STAGES[i].stageEnd + 40);
    const endX = STAGES[i].stageEnd * T;
    const zoneX = endX - CLEAR * T;
    const offenders = [];
    for (const o of lv.obstacles) {
      const x0 = o.x, x1 = o.x + (o.w || T);
      if (x1 > zoneX && x0 < endX + T) {
        offenders.push({ c0: Math.round(x0 / T), c1: Math.round(x1 / T),
          crosses: x0 < endX && x1 > endX });
      }
    }
    // Enemies standing on the line are the same problem in a different coat.
    const enemiesNear = (lv.enemies || []).filter((e) => e.x + (e.w || T) > zoneX && e.x < endX + T).length;
    out.push({ name: STAGES[i].name, end: STAGES[i].stageEnd,
      offenders, enemiesNear, obstacles: lv.obstacles.length, clear: CLEAR });
  }
  return out;
}, BREAK);

console.log(`  clear zone graded: ${stages[0].clear} columns${BREAK ? '   (BREAK-TEST: pre-fix behaviour)' : ''}`);
for (const s of stages) {
  const crossing = s.offenders.filter((o) => o.crosses);
  console.log(`  ${s.name} — finish col ${s.end}, ${s.obstacles} obstacles, `
    + `${s.offenders.length} in the run-in, ${crossing.length} across the line`);
  for (const o of s.offenders) {
    console.log(`      obstacle cols ${o.c0}-${o.c1}${o.crosses ? '  <-- ACROSS THE FINISH LINE' : ''}`);
  }
  check(`${s.name}: nothing crosses the finish line`, crossing.length === 0,
    crossing.length ? `${crossing.length} obstacle(s) span col ${s.end}` : '');
  check(`${s.name}: the run-in is clear of obstacles`, s.offenders.length === 0,
    `${s.offenders.length} within ${s.clear} columns`);
  check(`${s.name}: no enemy waiting on the line`, s.enemiesNear === 0,
    `${s.enemiesNear} near the finish`);
}

const pass = checks.filter((c) => c[1]).length;
console.log(`\n${pass === checks.length ? 'ALL ' : ''}${pass}/${checks.length} PASS`);
await b.close();
process.exit(pass === checks.length ? 0 : 1);
