// Shared frame-advance helper for any entity with {anim, animT, frame}
// (player, enemy). Ticks up animT while the anim key is unchanged (reset on
// switch), derives the current frame from the atlas's frameCount. Looping
// anims wrap; non-looping ones (e.g. the enemy's `defeat`) hold their last
// frame instead of restarting.

export function advanceAnim(entity, atlas, ticksPerFrame = 4) {
  if (entity._prevAnim !== entity.anim) {
    entity.animT = 0;
    entity._prevAnim = entity.anim;
  }
  const anim = atlas.animations[entity.anim];
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
  const rate = (anim && anim.ticks) || ticksPerFrame;
  const raw = Math.floor(entity.animT / rate);
  entity.frame = loop ? raw % total : Math.min(raw, total - 1);
}
