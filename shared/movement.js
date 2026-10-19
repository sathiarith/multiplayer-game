// Turn the set of held keys into a direction of length 0 or 1.
export function getDirection(keys) {
  let x = 0;
  let y = 0;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) x -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) x += 1;
  if (keys.has("ArrowUp") || keys.has("KeyW")) y -= 1;
  if (keys.has("ArrowDown") || keys.has("KeyS")) y += 1;

  const length = Math.hypot(x, y);
  if (length === 0) return { x: 0, y: 0 };
  return { x: x / length, y: y / length }; // normalize
}

// Return a new player moved by speed (pixels/second) over dt (seconds).
export function step(player, dir, speed, dt) {
  return {
    ...player,
    x: player.x + dir.x * speed * dt,
    y: player.y + dir.y * speed * dt,
  };
}
