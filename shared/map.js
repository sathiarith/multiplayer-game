// Turn rows of text into a 2D array: 1 = wall, 0 = floor.
export function parseMap(rows) {
  return rows.map((row) => [...row].map((ch) => (ch === "#" ? 1 : 0)));
}

// Anything outside the map counts as a wall.
export function isWall(tiles, col, row) {
  if (row < 0 || row >= tiles.length) return true;
  if (col < 0 || col >= tiles[0].length) return true;
  return tiles[row][col] === 1;
}

// Can a square of `size` pixels, centered at (x, y), stand here?
export function canMoveTo(tiles, tileSize, x, y, size) {
  const half = size / 2;
  const eps = 0.001; // so touching a wall edge is not "inside" it
  const left = Math.floor((x - half) / tileSize);
  const right = Math.floor((x + half - eps) / tileSize);
  const top = Math.floor((y - half) / tileSize);
  const bottom = Math.floor((y + half - eps) / tileSize);

  for (let row = top; row <= bottom; row++) {
    for (let col = left; col <= right; col++) {
      if (isWall(tiles, col, row)) return false;
    }
  }
  return true;
}
