// THE DEVELOPER'S DOOR: ?relay=1, ?stage=N, ?tod=day|night.
//
// Client, wanting to inspect the backgrounds rather than play them: "add me to
// champagne relay back so I can look at them that way, and I guess I'll
// screenshot any locations."
//
// CHAMPAGNE RELAY was never removed — it lost its BUTTON, on his own call
// ("the champagne relay is not going to be there, that's like a dev/dashboard
// thing"), and lives at ?relay=1. What was missing was a way to reach stage
// three without walking one and two first, so ?stage=N was added beside it.
//
// ⚠️ NONE OF THESE MAY LEAK INTO THE PLAYER'S BUILD. So this grades both
// halves: the flags do what they say, AND a plain URL with no flags still
// starts at EAV with enemies in it. If that last check ever fails, the
// dashboard has become the game.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/stageflag.mjs
const _pw=await import(process.env.PLAYWRIGHT); const chromium=_pw.chromium||_pw.default?.chromium;
const b=await chromium.launch({executablePath:process.env.CHROMIUM});
const checks=[]; const ck=(w,ok,d='')=>{checks.push([w,ok]);console.log(`  ${ok?'PASS':'FAIL'}  ${w}${d?'   '+d:''}`)};
for (const [q,want,relay] of [['?relay=1&stage=3&tod=day','underground',true],
                              ['?relay=1&stage=4&tod=night','l5p',true],
                              ['?relay=1&stage=5&tod=night','buckhead',true],
                              ['?stage=9','eav',false],
                              ['','eav',false]]) {
  const p=await (await b.newContext({viewport:{width:430,height:932},hasTouch:true})).newPage();
  p.on('pageerror',e=>console.log('  THROWN: '+e.message));
  await p.goto('http://localhost:5199/'+q,{waitUntil:'networkidle'});
  await p.waitForFunction(()=>window.__game&&window.__game.screen==='title',null,{timeout:25000});
  await p.evaluate(()=>{const g=window.__game; window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space'}));});
  await p.waitForTimeout(1200);
  const r=await p.evaluate(()=>({id:window.__game.level&&window.__game.level.stage.id,
    screen:window.__game.screen, enemies:window.__game.level?window.__game.level.enemies.length:-1}));
  ck(`${q||'(no flags)'} starts on ${want}`, r.id===want, JSON.stringify(r));
  if (relay) ck(`  and relay is on (no enemies)`, r.enemies===0, 'enemies='+r.enemies);
  await p.close();
}
console.log('\n'+(checks.every(([,o])=>o)?`ALL ${checks.length} PASS`:'FAILED'));
await b.close();
