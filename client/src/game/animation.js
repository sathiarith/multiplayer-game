// One entry per animation: which sheet, how many frames, how fast to play.
export const ANIMS = {
  idle: { file: "Warrior_Idle.png", frames: 8, fps: 8 },
  run: { file: "Warrior_Run.png", frames: 6, fps: 12 },
  attack: { file: "Warrior_Attack1.png", frames: 4, fps: 10 }, // plays once, in 0.4 s
};

const MOVE_EPSILON = 0.01; // pixels; smaller than this counts as "not moving"
const ATTACK_SECONDS = ANIMS.attack.frames / ANIMS.attack.fps;

export function createAnim() {
  return { action: "idle", facing: 1, time: 0 }; // facing: 1 = right, -1 = left
}

// A swing starts from its first frame, facing the given way.
export function startAttack(anim, facing = anim.facing) {
  return { action: "attack", facing, time: 0 };
}

// Work out the next animation state from where the player was and is now.
export function advanceAnim(anim, prev, next, dt) {
  // A swing plays to its end before the character idles or runs again.
  if (anim.action === "attack" && anim.time + dt < ATTACK_SECONDS) {
    return { ...anim, time: anim.time + dt };
  }

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
