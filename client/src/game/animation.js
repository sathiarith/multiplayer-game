// One entry per animation: which sheet, how many frames, how fast to play.
export const ANIMS = {
  idle: { file: "Warrior_Idle.png", frames: 8, fps: 8 },
  run: { file: "Warrior_Run.png", frames: 6, fps: 12 },
};

const MOVE_EPSILON = 0.01; // pixels; smaller than this counts as "not moving"

export function createAnim() {
  return { action: "idle", facing: 1, time: 0 }; // facing: 1 = right, -1 = left
}

// Work out the next animation state from where the player was and is now.
export function advanceAnim(anim, prev, next, dt) {
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;

  const action = Math.hypot(dx, dy) > MOVE_EPSILON ? "run" : "idle";

  let facing = anim.facing; // keep the old facing unless we moved sideways
  if (dx > MOVE_EPSILON) facing = 1;
  else if (dx < -MOVE_EPSILON) facing = -1;

  // Restart the clock when the action changes, otherwise keep counting.
  const time = action === anim.action ? anim.time + dt : 0;
  return { action, facing, time };
}

// Which frame to show after `time` seconds at `fps` frames per second.
export function frameIndex(time, fps, frames) {
  return Math.floor(time * fps) % frames;
}
