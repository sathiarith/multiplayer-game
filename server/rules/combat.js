// Combat rules, with no I/O: every number comes in as an argument.
// `levels` is the XP table: [{ level, xpRequired, maxHp }], sorted by level.

// The highest level whose XP requirement has been reached.
export function levelFor(xp, levels) {
  let current = levels[0];
  for (const row of levels) if (xp >= row.xpRequired) current = row;
  return current.level;
}

// The health that comes with a level. Past the end of the table, the top level's.
export function maxHpFor(level, levels) {
  return (levels.find((row) => row.level === level) ?? levels.at(-1)).maxHp;
}

// A player's hit gets stronger with each level.
export function playerDamage(level) {
  return 10 + 2 * (level - 1);
}

// Health after a hit. Never below zero, and a negative "hit" never heals.
export function applyDamage(hp, amount) {
  return Math.max(0, hp - Math.max(0, amount));
}

export const isDead = (hp) => hp <= 0;

// Adds XP. Reaching a new level (one or several at once) raises the maximum
// health and heals to full.
export function gainXp(character, amount, levels) {
  const xp = character.xp + amount;
  const level = levelFor(xp, levels);
  const maxHp = maxHpFor(level, levels);
  const leveledUp = level > character.level;
  return { xp, level, maxHp, hp: leveledUp ? maxHp : character.hp, leveledUp };
}

// After dying: full health at the spawn point. XP, level and everything else are kept.
export function respawn(character, spawn, levels) {
  return {
    ...character,
    x: spawn.x,
    y: spawn.y,
    hp: maxHpFor(character.level, levels),
  };
}

// Is the cooldown over? `lastAt` is when the action last happened, or null if never.
export function canAct(lastAt, cooldownMs, now) {
  return lastAt === null || now - lastAt >= cooldownMs;
}

// The closest of `targets` within `range` of `from`, or null.
export function nearestWithin(from, targets, range) {
  let best = null;
  for (const target of targets) {
    const distance = Math.hypot(target.x - from.x, target.y - from.y);
    if (distance <= range && (!best || distance < best.distance))
      best = { target, distance };
  }
  return best ? best.target : null;
}
