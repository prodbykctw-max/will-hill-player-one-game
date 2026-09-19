// PLAYWRIGHT=/path/to/playwright/index.mjs node tools/harness/startaudio.mjs
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT);
const { startFromTitle } = await import('./startchain.mjs');
const browser = await chromium.launch({args: ['--autoplay-policy=document-user-activation-required']});
try {
  for (const mode of ['fresh', 'touch', 'keyboard']) {
    const context = await browser.newContext({viewport: {width: 430, height: 932}, hasTouch: true});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (mode !== 'fresh') await page.addInitScript(() => {
      localStorage.setItem('wh_sound', 'off');
      localStorage.setItem('wh_sfx', 'off');
    });
    await page.goto('http://localhost:5199/');
    await page.waitForFunction(() => window.__game?.screen === 'title' && window.__game.screenT > 150);
    if (mode === 'fresh') {
      assert.equal(await page.evaluate(() => window.__audio.status().muted), false);
      await page.mouse.click(5, 5);
      assert.equal(await page.evaluate(() => window.__game.screen), 'title');
    } else if (mode === 'touch') {
      assert.equal(await startFromTitle(page), 'playing');
    } else {
      await page.keyboard.press('Space');
    }
    await page.waitForFunction(() => {
      const s = window.__audio.status();
      return !s.muted && !s.sfxMuted && s.ctx === 'running';
    });
    // Measure actual output, not merely the playing flag.
    let peak = 0;
    for (let i = 0; i < 30; i++) {
      peak = Math.max(peak, await page.evaluate(() => window.__audio.level()));
      await page.waitForTimeout(100);
    }
    assert.ok(peak > .005, `${mode}: silent output ${peak}`);
    if (mode !== 'fresh') assert.deepEqual(await page.evaluate(() =>
      [localStorage.getItem('wh_sound'), localStorage.getItem('wh_sfx')]), ['on', 'on']);
    // A later gesture must retry playback without undoing a deliberate mute.
    await page.evaluate(() => {
      localStorage.setItem('wh_sound', 'off');
      window.__audio.setMuted(true);
    });
    await page.keyboard.press('Shift');
    assert.equal(await page.evaluate(() => window.__audio.status().muted), true);
    assert.deepEqual(errors, []);
    console.log(`PASS ${mode}: audio output peak ${peak.toFixed(4)}, later mute preserved`);
    await context.close();
  }
} finally {
  await browser.close();
}
