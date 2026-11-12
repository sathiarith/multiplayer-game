import { test, expect } from "vitest";
import {
  levelFor,
  maxHpFor,
  playerDamage,
  applyDamage,
  isDead,
  gainXp,
  respawn,
  canAct,
  nearestWithin,
} from "./combat.js";

const LEVELS = [
  { level: 1, xpRequired: 0, maxHp: 100 },
  { level: 2, xpRequired: 50, maxHp: 120 },
  { level: 3, xpRequired: 150, maxHp: 140 },
];

test("the level is the highest one whose XP has been reached", () => {
  expect(
    [0, 49, 50, 149, 150, 99999].map((xp) => levelFor(xp, LEVELS)),
  ).toEqual([1, 1, 2, 2, 3, 3]);
});

test("each level comes with its own maximum health, and the top level's is kept past the table", () => {
  expect(maxHpFor(1, LEVELS)).toBe(100);
  expect(maxHpFor(3, LEVELS)).toBe(140);
  expect(maxHpFor(99, LEVELS)).toBe(140);
});

test("a player's hit grows with level", () => {
  expect([1, 2, 5].map(playerDamage)).toEqual([10, 12, 18]);
});

test("damage lowers health, never below zero, and never heals", () => {
  expect(applyDamage(30, 10)).toBe(20);
  expect(applyDamage(5, 10)).toBe(0);
  expect(applyDamage(30, -5)).toBe(30);
  expect(isDead(0)).toBe(true);
  expect(isDead(1)).toBe(false);
});

test("XP below the next level only adds up", () => {
  expect(gainXp({ xp: 40, level: 1, hp: 60 }, 5, LEVELS)).toEqual({
    xp: 45,
    level: 1,
    maxHp: 100,
    hp: 60,
    leveledUp: false,
  });
});

test("reaching a level raises the maximum health and heals to full", () => {
  expect(gainXp({ xp: 40, level: 1, hp: 60 }, 10, LEVELS)).toEqual({
    xp: 50,
    level: 2,
    maxHp: 120,
    hp: 120,
    leveledUp: true,
  });
});

test("enough XP at once can skip a level", () => {
  expect(gainXp({ xp: 40, level: 1, hp: 60 }, 200, LEVELS)).toMatchObject({
    level: 3,
    hp: 140,
    leveledUp: true,
  });
});

test("the rules never change what they are given", () => {
  const before = Object.freeze({ xp: 40, level: 1, hp: 60, x: 500, y: 60 });
  gainXp(before, 10, LEVELS);
  respawn(before, { x: 100, y: 60 }, LEVELS);
  expect(before).toEqual({ xp: 40, level: 1, hp: 60, x: 500, y: 60 });
});

test("respawning means full health at the spawn point, keeping level and XP", () => {
  const dead = { name: "Aria", x: 500, y: 60, hp: 0, level: 2, xp: 60 };
  expect(respawn(dead, { x: 100, y: 60 }, LEVELS)).toEqual({
    name: "Aria",
    x: 100,
    y: 60,
    hp: 120,
    level: 2,
    xp: 60,
  });
});

test("a cooldown allows the first action, then waits for its full length", () => {
  expect(canAct(null, 800, 0)).toBe(true);
  expect(canAct(1000, 800, 1799)).toBe(false);
  expect(canAct(1000, 800, 1800)).toBe(true);
});

test("the nearest target within range is chosen, or none", () => {
  const targets = [
    { id: 1, x: 140, y: 60 },
    { id: 2, x: 120, y: 60 },
    { id: 3, x: 400, y: 60 },
  ];
  expect(nearestWithin({ x: 100, y: 60 }, targets, 48)?.id).toBe(2);
  expect(nearestWithin({ x: 100, y: 60 }, [targets[2]], 48)).toBeNull();
});
