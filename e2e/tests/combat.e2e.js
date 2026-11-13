import { test, expect } from "../support/fixtures.js";
import {
  startPlaying,
  waitForPlayers,
  hold,
  monstersOn,
} from "../support/helpers.js";

test("a player defeats a goblin, earns XP, and appears on the leaderboard", async ({
  page,
}) => {
  const { name } = await startPlaying(page);
  await waitForPlayers(page, 1);
  await expect.poll(async () => (await monstersOn(page)).length).toBe(2);
  const character = page.getByRole("region", { name: "Character" });
  await expect(character).toContainText("0 / 50 XP");

  // Walk along the corridor to the first goblin, about 440 pixels away.
  await hold(page, "ArrowRight", 2200);

  // Attack until it falls. The server enforces the cooldown, so extra presses are refused.
  for (let i = 0; i < 40; i++) {
    if ((await character.textContent()).includes("25 / 50 XP")) break;
    await page.keyboard.press("Space");
    await page.waitForTimeout(250);
  }
  await expect(character).toContainText("25 / 50 XP");
  await expect.poll(async () => (await monstersOn(page)).length).toBe(1); // gone until it respawns

  await page.getByRole("link", { name: "Back to characters" }).click(); // leaving saves the character
  await expect
    .poll(async () => {
      const board = await (await page.request.get("/api/leaderboard")).json();
      return board.find((entry) => entry.name === name)?.score ?? 0;
    })
    .toBe(25);
});
