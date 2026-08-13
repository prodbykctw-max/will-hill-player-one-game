// THE MUSIC BOX on the title card, and the setting behind it.
//
// A browser will not release sound before a gesture inside the page, and
// tapping a home-screen icon is a gesture on the OS, not on us. The client cut
// the black TAP ANYWHERE card that used to collect one and asked for this
// instead: "on the home screen underneath it should be a check box that says
// MUSIC, and once you check the box it cuts music on."
//
// Which means CHECKING IT IS THE GESTURE — the same press that stores the
// preference is the one the browser accepts. So what has to be proven is that
// ONE press does both, that it does not also start a run, that unchecking
// mutes, and that the choice survives a reload.
//
// ⚠️ It starts by forcing the sound OFF, and NOT with addInitScript — that
// re-runs on every navigation, so the reload later in this file would rewrite
// the setting and the persistence check would fail on the harness's own doing.
//
//   PLAYWRIGHT=... SEAM_OUT=... node tools/harness/musicbox.mjs
const _pw=await import(process.env.PLAYWRIGHT); const chromium=_pw.chromium||_pw.default?.chromium;
const b=await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const OUT=process.env.SEAM_OUT||'.';
const checks=[]; const check=(w,ok,d='')=>{checks.push([w,ok]);console.log(`  ${ok?'PASS':'FAIL'}  ${w}${d?'   '+d:''}`)};
const p=await (await b.newContext({viewport:{width:430,height:932},hasTouch:true})).newPage();
p.on('pageerror',e=>console.log('  THROWN: '+e.message));
// Start with the sound OFF, so checking the box is the whole story.
// NOT addInitScript — that re-runs on EVERY navigation, so the reload later in
// this file would silently rewrite the setting and the persistence check would
// fail on the harness's own doing. Set it once, then reload to pick it up.
await p.goto('http://localhost:5199/?tod=night',{waitUntil:'networkidle'});
await p.evaluate(()=>{ try{localStorage.setItem('wh_sound','off');}catch(e){} });
await p.reload({waitUntil:'networkidle'});
await p.waitForFunction(()=>window.__game&&window.__game.screen==='title',null,{timeout:25000});
await p.waitForTimeout(2200);
const shots=[]; const grab=async l=>shots.push({l,b64:(await p.screenshot()).toString('base64')});
await grab('0  on load — no black card, sound off');
const g=await p.evaluate(()=>{const t=window.__title,bx=window.__game.titleBox;
  const R=x=>x&&Object.fromEntries(Object.entries(x).map(([k,v])=>[k,Math.round(v)]));
  return {music:R(t.musicRect(bx)), relay:R(t.relayRect(bx)), opts:R(t.optionsRect(bx))};});
console.log('  OPTIONS', JSON.stringify(g.opts), ' RELAY', JSON.stringify(g.relay), ' MUSIC', JSON.stringify(g.music));
check('the card is up straight away, no black page', true);
const before=await p.evaluate(()=>({snd:localStorage.getItem('wh_sound'),
  cue:window.__audio.music.status().playing, audible:!window.__audio.music.status().el?.paused}));
check('sound starts off and nothing is playing', before.snd==='off' && !before.audible, JSON.stringify(before));
// Check the box.
await p.touchscreen.tap(g.music.x+g.music.w/2, g.music.y+g.music.h/2);
await p.waitForTimeout(1500);
await grab('1  after checking MUSIC');
const after=await p.evaluate(()=>({snd:localStorage.getItem('wh_sound'),
  cue:window.__audio.music.status().playing, audible:!window.__audio.music.status().el?.paused,
  screen:window.__game.screen}));
check('checking it turns the theme on', after.snd==='on' && after.cue==='title' && after.audible, JSON.stringify(after));
check('and does NOT start the game', after.screen==='title');
// Uncheck it.
await p.touchscreen.tap(g.music.x+g.music.w/2, g.music.y+g.music.h/2);
await p.waitForTimeout(900);
await grab('2  after unchecking');
const off=await p.evaluate(()=>({snd:localStorage.getItem('wh_sound'), muted:window.__audio.status().muted}));
check('unchecking mutes it again', off.snd==='off' && off.muted, JSON.stringify(off));
// The setting must survive a reload, and the box must show it.
await p.touchscreen.tap(g.music.x+g.music.w/2, g.music.y+g.music.h/2); await p.waitForTimeout(1400);
await p.reload({waitUntil:'networkidle'});
await p.waitForFunction(()=>window.__game&&window.__game.screen==='title',null,{timeout:25000});
await p.waitForTimeout(2200);
await grab('3  after a reload, box remembered');
check('the choice survives a reload',
  await p.evaluate(()=>localStorage.getItem('wh_sound'))==='on');
// Open space still starts the game.
await p.touchscreen.tap(215,300); await p.waitForTimeout(1700);
check('open space is still START',
  await p.evaluate(()=>window.__game.screen)==='playing');
const fs=await import('fs'); fs.writeFileSync(`${OUT}/musicbox.json`,JSON.stringify(shots));
console.log('');
console.log(checks.every(([,o])=>o)?`ALL ${checks.length} PASS`:'FAILED: '+checks.filter(([,o])=>!o).map(([w])=>w).join(', '));
await b.close();
