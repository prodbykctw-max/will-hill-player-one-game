// Camera — pulled back further than a typical side-scroller, with extra
// "headroom" so the player can see upcoming obstacles/platforms/enemies
// before reaching them (see docs/GDD.md "Camera"). This is a co-decision
// with world/level layout, not just a rendering detail — level design should
// assume the player can see this far ahead when placing hazards.

export function createCamera({ headroom = true } = {}) {
  return {
    x: 0,
    y: 0,
    // TODO: tune the actual look-ahead distance once level geometry exists.
    lookAheadPx: headroom ? 420 : 220,
    follow(target) {
      this.x = target.x - this.lookAheadPx * 0.35;
      this.y = target.y;
    },
  };
}
