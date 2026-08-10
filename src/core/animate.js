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
  entity.animT++;
  const anim = atlas.animations[entity.anim];
  const total = anim ? anim.frameCount : 1;
  const loop = anim ? anim.loop !== false : true;
  const raw = Math.floor(entity.animT / ticksPerFrame);
  entity.frame = loop ? raw % total : Math.min(raw, total - 1);
}
