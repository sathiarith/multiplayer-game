import { ANIMS, frameIndex } from "./animation.js";

const FRAME = 192; // every frame in the sprite sheets is 192 x 192 px
const SPRITE_SCALE = 0.5; // use your tuned value from Step 1
const FOOT_Y = 130; // use your tuned value from Step 1

function drawMap(ctx, level) {
  const { tiles, tileSize } = level;
  for (let row = 0; row < tiles.length; row++) {
    for (let col = 0; col < tiles[row].length; col++) {
      ctx.fillStyle = tiles[row][col] === 1 ? "#475569" : "#1e293b";
      ctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);
    }
  }
}

function drawSprite(ctx, player, anim, sheet) {
  const { frames, fps } = ANIMS[anim.action];
  const index = frameIndex(anim.time, fps, frames);
  const size = FRAME * SPRITE_SCALE;
  const feetY = player.y + player.size / 2; // bottom of the collision box

  ctx.save(); // remember the current transform...
  ctx.translate(player.x, feetY - FOOT_Y * SPRITE_SCALE);
  ctx.scale(anim.facing, 1); // -1 mirrors everything drawn next, left to right
  ctx.drawImage(
    sheet,
    index * FRAME,
    0,
    FRAME,
    FRAME,
    -size / 2,
    0,
    size,
    size,
  );
  ctx.restore(); // ...and put it back so later drawing is unaffected
}

// Used when the art is not installed: the square from Story 1.1.
function drawPlaceholder(ctx, player) {
  ctx.fillStyle = "#4ade80";
  ctx.fillRect(
    player.x - player.size / 2,
    player.y - player.size / 2,
    player.size,
    player.size,
  );
}

function drawPlayer(ctx, player, anim, sheets, showHitbox) {
  const sheet = sheets[anim.action];
  if (sheet) drawSprite(ctx, player, anim, sheet);
  else drawPlaceholder(ctx, player);

  if (showHitbox) {
    ctx.strokeStyle = "#4ade80";
    ctx.strokeRect(
      player.x - player.size / 2,
      player.y - player.size / 2,
      player.size,
      player.size,
    );
  }
}

export function render(
  ctx,
  level,
  player,
  anim,
  sheets,
  { showHitbox = false } = {},
) {
  drawMap(ctx, level);
  drawPlayer(ctx, player, anim, sheets, showHitbox);
}
