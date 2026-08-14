// Does any viewport slice the top off WILL HILL: ?
const _pw = await import(process.env.PLAYWRIGHT);
const b = await (_pw.chromium||_pw.default.chromium).launch({executablePath:process.env.CHROMIUM});
let worst = null;
for (let w = 360; w <= 500; w += 10) {
  for (let h = 640; h <= 940; h += 20) {
    const cover = w/853, cropRows = 1844 - h/cover;
    if (cropRows < 100 || cropRows > 300) continue;      // only the danger window
    const p = await (await b.newContext({viewport:{width:w,height:h}})).newPage();
    await p.goto('http://localhost:5199/?tod=day',{waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>window.__game&&window.__game.titleBox,null,{timeout:20000});
    const r = await p.evaluate(()=>{const bx=window.__game.titleBox;
      // canvas row of source row 165 = the very top of WILL HILL:
      return { topOfName: bx.dy + (165/1844)*bx.dh, dx: bx.dx };});
    if (r.topOfName < 0) worst = {w,h,topOfName:Math.round(r.topOfName)};
    await p.context().close();
  }
}
console.log(worst ? `CLIPPED at ${worst.w}x${worst.h}: name top ${worst.topOfName}px above frame`
  : 'PASS  no viewport in the danger window clips the top of WILL HILL:');
await b.close();
