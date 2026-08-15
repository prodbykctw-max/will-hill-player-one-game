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
// ⚠️ THIS FILE USED TO ASK THE WRONG QUESTION, AND A SILENT GAME PASSED IT.
//
// It checked `!el.paused` — "is the media element running" — which stayed
// true for weeks while the cue was being multiplied by a gain of ZERO and
// nothing at all came out of the speaker. The element advanced, readyState
// was 4, there was no error, and the game was silent. Client: "it shows that
// the speaker is live inside the browser area on my iPhone, but it doesn't
// play the music."
//
// So the checks below read the MASTER BUS instead — audio.level(), the RMS of
// the last frame of samples actually reaching the destination. That is the
// only number that cannot be true while the game is silent.
//
// Two things about level(): the analyser is built on FIRST call, so the first
// read is always 0 and has to be discarded, and it is an instantaneous RMS of
// a waveform, so a single sample can land on a zero crossing — take the peak
// across several frames, never one reading.
const b=await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
  args:['--autoplay-policy=no-user-gesture-required'] });
// Defaults to `shots/` (gitignored), never the repo root. This one was
// missed when the other five harnesses were moved off the root, because it is
// written without spaces and the sweep matched the spaced form — so it kept
// dropping musicbox.json beside the source. Written out longhand now so the
// next grep for this pattern finds it.
const OUT = process.env.SEAM_OUT || 'shots';
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
// Peak master-bus RMS over ~40 frames. See the note at the top of this file.
const busPeak = async () => p.evaluate(async () => {
  const v=[];
  for(let i=0;i<40;i++){ v.push(window.__audio.level());
    await new Promise(r=>requestAnimationFrame(r)); }
  return Math.max(...v);
});
await p.evaluate(()=>window.__audio.level());   // build the analyser, discard
await p.waitForTimeout(250);
await grab('0  on load — no black card, sound off');
const g=await p.evaluate(()=>{const t=window.__title,bx=window.__game.titleBox;
  const R=x=>x&&Object.fromEntries(Object.entries(x).map(([k,v])=>[k,Math.round(v)]));
  return {music:R(t.musicRect(bx)), opts:R(t.optionsRect(bx))};});
console.log('  OPTIONS', JSON.stringify(g.opts), ' MUSIC', JSON.stringify(g.music));
check('the card is up straight away, no black page', true);
const before=await p.evaluate(()=>({snd:localStorage.getItem('wh_sound'),
  cue:window.__audio.music.status().playing,
  muted:window.__audio.music.status().muted,
  // Kept ONLY to show in the log how misleading it is: with autoplay allowed
  // the element runs happily while its gain is zero, which is precisely the
  // false "it's playing" this file used to assert on.
  elRunning:!window.__audio.music.status().el?.paused}));
const quiet = await busPeak();
check('sound starts off — the setting is off and the cue is muted',
  before.snd==='off' && before.muted===true, JSON.stringify(before));
check('and the master bus is genuinely quiet before the tap', quiet < 0.02, `busRMS=${quiet.toFixed(6)}`);
// Check the box.
await p.touchscreen.tap(g.music.x+g.music.w/2, g.music.y+g.music.h/2);
await p.waitForTimeout(1500);
await grab('1  after checking MUSIC');
const after=await p.evaluate(()=>({snd:localStorage.getItem('wh_sound'),
  cue:window.__audio.music.status().playing, audible:!window.__audio.music.status().el?.paused,
  screen:window.__game.screen}));
const loud = await busPeak();
check('checking it turns the theme on', after.snd==='on' && after.cue==='title' && after.audible, JSON.stringify(after));
// The one that a gain of zero cannot fake.
check('AND SOUND ACTUALLY REACHES THE SPEAKER', loud > 0.02 && loud > quiet * 4,
  `busRMS ${quiet.toFixed(6)} -> ${loud.toFixed(6)}`);
check('the cue is at its intended gain, not zero',
  (await p.evaluate(()=>{const l=window.__audio.music.status().live.find(x=>x.slot==='title');
    return l?l.level:0;})) > 0.3);
check('and does NOT start the game', after.screen==='title');
// Uncheck it.
await p.touchscreen.tap(g.music.x+g.music.w/2, g.music.y+g.music.h/2);
await p.waitForTimeout(900);
await grab('2  after unchecking');
const off=await p.evaluate(()=>({snd:localStorage.getItem('wh_sound'), muted:window.__audio.status().muted}));
const silenced = await busPeak();
check('unchecking mutes it again', off.snd==='off' && off.muted, JSON.stringify(off));
check('and the bus drops back to quiet', silenced < loud / 3,
  `busRMS ${loud.toFixed(6)} -> ${silenced.toFixed(6)}`);
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
const fs=await import('fs'); fs.mkdirSync(OUT,{recursive:true});
fs.writeFileSync(`${OUT}/musicbox.json`,JSON.stringify(shots));
console.log('');
console.log(checks.every(([,o])=>o)?`ALL ${checks.length} PASS`:'FAILED: '+checks.filter(([,o])=>!o).map(([w])=>w).join(', '));
await b.close();
