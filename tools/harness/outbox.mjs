// A SCORE IS NEVER LOST, AND NOBODY EVER LOGS IN.
//
// Client: "I don't want any login. Anytime a person downloads this it has on
// their phone, they never have to login again. It tracks everything… it keeps
// up with all the scores, it doesn't make any errors… before they answer the
// contest it should keep all of this shit on local storage."
//
// There is no login and never was — registration is a phone and an email
// stored on the device, and `wh_signup_asked` stops the offer repeating. What
// was NOT true was the second half. Two ways a run could vanish, both fixed
// here and both graded below:
//
//   THE QUEUE WAS A VARIABLE. Runs finished before registering were held in
//   `let pendingRuns = []` and nothing else. Background the tab, let iOS evict
//   it, come back and register: nothing to send. On a phone at a party that is
//   the likely path, not the unlucky one.
//
//   A FAILED SUBMIT WAS DISCARDED AND MARKED SENT. The fetch ended in
//   `.catch(() => {})` and `sentRunIds.add()` ran BEFORE the request, so one
//   bad-signal moment lost the run permanently and nothing retried it.
//
// Runs now sit in a PERSISTED OUTBOX and leave it only on a 2xx.
//
//   1-3.  Not registered: a finished run is held, and it is on disk — read
//         out of localStorage directly, not from the module's memory.
//   4-5.  ⚠️ IT SURVIVES A RELOAD. This is the client's actual sentence, and
//         the old build failed it.
//   6-7.  Registering sends everything held, and empties the outbox.
//   8-9.  A submit that FAILS keeps its run and does not mark it sent; the
//         next flush sends it. No score is dropped on bad signal.
//   10.   An accepted run is not re-sent after a reload (the dashboard was
//         logging replay rejections against runs that had already scored).
//   11.   Registration itself survives a reload — nobody signs in twice.
//
//   12-17. ⚠️ AND A REFUSAL IS NOT A BAD MOMENT. Everything above graded the
//         hold; nothing graded the release, so a run the Worker had REFUSED
//         sat in the outbox and was re-POSTed on every boot, every reconnect
//         and after every later run. The live abuse log caught it: one
//         payload, 15 rows, 14 minutes. A 4xx is a verdict — drop it. A 409
//         means it is already on the board — remember it. A 5xx or a dead
//         connection still holds, which is the case this file was built for
//         and the one that must not regress while fixing the other.
//   18.   ⚠️ BREAK-TEST: with the outbox key wiped, the survives-a-reload
//         check must go red — otherwise it is grading nothing.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/outbox.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch({
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const checks = [];
const check = (w, ok, d = '') => {
  checks.push([w, ok]);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`);
};

const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));

// The Worker is never called for real. `mode` decides what it answers, so the
// bad-signal case is a genuine failed request rather than a stubbed function.
// A NUMBER is an HTTP status the Worker really can return: 400 `invalid run`,
// 409 `already submitted`, 500. Those are the answers the client used to read
// as "try again later", every one of them.
let mode = 'fail';
const seen = [];
await ctx.route('**/submit', async (route) => {
  try { seen.push(JSON.parse(route.request().postData() || '{}').runId); } catch (_e) {}
  if (mode === 'fail') return route.abort('failed');
  if (typeof mode === 'number') {
    return route.fulfill({
      status: mode,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, err: 'refused' }),
    });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
});

const boot = async () => {
  await p.waitForFunction(() => window.__lb && window.__game, null, { timeout: 25000 });
};
const outboxOnDisk = () => p.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('wh_pending_runs') || '[]'); } catch (_e) { return null; }
});
// A finished run in the shape the game submits — the same fields lbSubmit
// reads, so this exercises the real path rather than a parallel one.
const finishRun = (id, bags) => p.evaluate(([runId, n]) => {
  const events = [];
  for (let i = 0; i < n; i++) events.push({ t: 1000 + i * 100, type: 'bag' });
  window.__lb.lbSubmit({ runId, events, durationMs: 60000 + n * 100 });
}, [id, bags]);

await p.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await p.evaluate(() => {
  try {
    localStorage.removeItem('wh_contest_reg');
    localStorage.removeItem('wh_pending_runs');
    localStorage.removeItem('wh_sent_runs');
    localStorage.setItem('wh_name', 'HARNESS');
  } catch (_e) {}
});
await p.reload({ waitUntil: 'networkidle' });
await boot();

// ── played before entering the contest ──────────────────────────────────
check('nobody is registered yet', !(await p.evaluate(() => window.__lb.hasPendingRun())));
await finishRun('run-a', 12);
await finishRun('run-b', 40);
check('runs finished before registering are held',
  await p.evaluate(() => window.__lb.pendingRunCount()) === 2);
const disk = await outboxOnDisk();
check('and they are ON DISK, not just in a variable',
  Array.isArray(disk) && disk.length === 2 && disk.map((r) => r.runId).join() === 'run-a,run-b',
  JSON.stringify((disk || []).map((r) => r.runId)));
check('nothing was sent — there is nobody to attribute them to', seen.length === 0);

// ── ⚠️ the client's actual sentence: it survives the app going away ──────
await p.reload({ waitUntil: 'networkidle' });
await boot();
const after = await p.evaluate(() => window.__lb.pendingRunCount());
check('THE HELD RUNS SURVIVE A RELOAD', after === 2, `${after} still held`);
check('and the best one is still there',
  (await outboxOnDisk()).some((r) => (r.events || []).length === 40));

// ── entering the contest sends them, with no login anywhere ─────────────
mode = 'ok';
await p.evaluate(() => {
  localStorage.setItem('wh_contest_reg', JSON.stringify({ phone: '4045550100', email: 'a@b.co' }));
  window.__lb.flushPendingRun();
});
await p.waitForFunction(() => window.__lb.pendingRunCount() === 0, null, { timeout: 10000 })
  .catch(() => {});
check('registering sends every run that was waiting',
  seen.includes('run-a') && seen.includes('run-b'), JSON.stringify(seen));
check('and the outbox is empty afterwards, on disk too',
  await p.evaluate(() => window.__lb.pendingRunCount()) === 0
  && (await outboxOnDisk()).length === 0);

// ── bad signal at a party: the run must not evaporate ───────────────────
mode = 'fail';
seen.length = 0;
await finishRun('run-c', 55);
await p.waitForTimeout(600);
check('a submit that FAILS keeps its run in the outbox',
  await p.evaluate(() => window.__lb.pendingRunCount()) === 1,
  `tried ${seen.length}x`);
mode = 'ok';
await p.evaluate(() => window.__lb.flushPendingRun());
await p.waitForFunction(() => window.__lb.pendingRunCount() === 0, null, { timeout: 10000 })
  .catch(() => {});
check('and the next attempt sends it — nothing is lost to one bad moment',
  await p.evaluate(() => window.__lb.pendingRunCount()) === 0 && seen.includes('run-c'));

// ── an accepted run is never asked about twice ──────────────────────────
await p.reload({ waitUntil: 'networkidle' });
await boot();
seen.length = 0;
await finishRun('run-c', 55);
await p.waitForTimeout(600);
check('an accepted run is not re-sent after a reload',
  seen.length === 0 && (await p.evaluate(() => window.__lb.pendingRunCount())) === 0,
  `${seen.length} resends`);
check('registration survived the reload — nobody signs in again',
  await p.evaluate(() => !!JSON.parse(localStorage.getItem('wh_contest_reg') || 'null')));

// ── ⚠️ a REFUSAL is a verdict, and it must not be retried forever ────────
mode = 400;
seen.length = 0;
await finishRun('run-e', 8);
await p.waitForTimeout(600);
check('a run refused on the merits LEAVES the outbox',
  await p.evaluate(() => window.__lb.pendingRunCount()) === 0,
  `tried ${seen.length}x`);
check('and it was asked once, not in a loop', seen.length === 1, `${seen.length} attempts`);
await p.reload({ waitUntil: 'networkidle' });
await boot();
seen.length = 0;
await p.evaluate(() => window.__lb.flushPendingRun());
await p.waitForTimeout(600);
check('a reload does not resurrect it — the abuse log stays clean',
  seen.length === 0, `${seen.length} resends`);

// ── 409: the Worker already has that run. Done, not failed. ──────────────
mode = 409;
seen.length = 0;
await finishRun('run-f', 9);
await p.waitForTimeout(600);
check('a 409 empties the outbox — that score is already banked',
  await p.evaluate(() => window.__lb.pendingRunCount()) === 0);
await p.reload({ waitUntil: 'networkidle' });
await boot();
seen.length = 0;
await finishRun('run-f', 9);
await p.waitForTimeout(600);
check('and it is remembered, so a reload never asks about it again',
  seen.length === 0, `${seen.length} resends`);

// ── but a 5xx is still just a bad moment ─────────────────────────────────
mode = 500;
seen.length = 0;
await finishRun('run-g', 11);
await p.waitForTimeout(600);
check('a 5xx still HOLDS the run — the outbox has not stopped doing its job',
  await p.evaluate(() => window.__lb.pendingRunCount()) === 1);
mode = 'ok';
await p.evaluate(() => window.__lb.flushPendingRun());
await p.waitForFunction(() => window.__lb.pendingRunCount() === 0, null, { timeout: 10000 })
  .catch(() => {});
check('and the next attempt sends it, exactly as before',
  await p.evaluate(() => window.__lb.pendingRunCount()) === 0 && seen.includes('run-g'));

// ── ⚠️ it can fail: wipe the stored outbox and the survival check goes red ─
await p.evaluate(() => {
  localStorage.removeItem('wh_contest_reg');
  localStorage.removeItem('wh_pending_runs');
  localStorage.removeItem('wh_sent_runs');
});
await p.reload({ waitUntil: 'networkidle' });
await boot();
await finishRun('run-d', 20);
await p.evaluate(() => localStorage.removeItem('wh_pending_runs'));   // the old behaviour
await p.reload({ waitUntil: 'networkidle' });
await boot();
check('BREAK-TEST — with nothing persisted the run IS lost, so the check has teeth',
  await p.evaluate(() => window.__lb.pendingRunCount()) === 0);

await b.close();
const bad = checks.filter(([, ok]) => !ok);
console.log(bad.length ? `\nFAILED: ${bad.length} of ${checks.length}` : `\nALL ${checks.length} PASS`);
process.exit(bad.length ? 1 : 0);
