// Shared frame-advance helper for any entity with {anim, animT, frame}
// (player, enemy). Ticks up animT while the anim key is unchanged (reset on
// switch), derives the current frame from the atlas's frameCount. Looping
// anims wrap; non-looping ones (e.g. the enemy's `defeat`) hold their last
// frame instead of restarting.

// A clip a sheet does not have degrades to the nearest one it does, rather
// than vanishing. drawSprite used to `return` on an unknown anim, which is
// silent and looks like a rendering bug: during the knockdown both the player
// and the enemies stomping him simply disappeared. A missing clip should look
// wrong, not look absent.
//
// ONE table and ONE resolver, shared with render/renderer.js. They were two
// copies, and they had drifted: this one hopped once where the renderer
// chained five deep, so an unknown clip could tick against one animation's
// frameCount while a different animation was drawn — which freezes the sprite
// on frame 0. Same lookup on both sides or neither.
const FALLBACK = {
  knockdown: 'defeat', death: 'defeat', defeat: 'hit', hit: 'idle',
  stomp: 'attack', attack: 'walk', knockback: 'hit', fall: 'jumpLand',
  run: 'walk', walk: 'idle',
  // The money-counting idle degrades to the plain one, so a build whose sheet
  // predates the clip draws a standing Will Hill rather than nothing.
  idleFlex: 'idle',
};

export function resolveClip(atlas, name) {
  let n = name;
  for (let i = 0; i < 6 && n; i++) {
    if (atlas.animations[n]) return atlas.animations[n];
    n = FALLBACK[n];
  }
  return atlas.animations.idle;
}

export function advanceAnim(entity, atlas, ticksPerFrame = 4, rateScale = 1) {
  if (entity._prevAnim !== entity.anim) {
    entity.animT = 0;
    entity._prevAnim = entity.anim;
  }
  // Same resolver the renderer uses, so the frame COUNT always matches the
  // clip that actually gets drawn.
  const anim = resolveClip(atlas, entity.anim);
  // A `driven` clip is posed by the entity itself — the jump picks its frame
  // from vertical velocity so the pose always matches what the physics is
  // doing. Ticking it here as well would fight that and produce the flailing
  // this replaced.
  if (anim && anim.driven) return;

  entity.animT++;
  const total = anim ? anim.frameCount : 1;
  const loop = anim ? anim.loop !== false : true;
  // Per-animation rate, so a breathing idle can run slow while a run runs
  // fast. Fractional values are deliberate: they let a clip keep its original
  // duration while gaining frames, which is what makes it smoother rather
  // than merely slower.
  // `rateScale` lets the caller stretch a clip to match how fast the entity
  // is actually travelling, so a locomotion cycle does not slide its feet
  // when the same clip has to cover a walk and a jog.
  const rate = ((anim && anim.ticks) || ticksPerFrame) * (rateScale || 1);
  const raw = Math.floor(entity.animT / rate);
  entity.frame = loop ? raw % total : Math.min(raw, total - 1);
}
