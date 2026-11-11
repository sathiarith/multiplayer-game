import { test, expect } from "../support/fixtures.js";
import {
  startPlaying,
  waitForPlayers,
  groundItems,
} from "../support/helpers.js";

const hasGold = async (page) =>
  (await groundItems(page)).some((i) => i.item === "gold_coin");

test("a player picks up the gold, it is saved, and the other player sees it go", async ({
  newPlayer,
}) => {
  const pageA = await newPlayer();
  const pageB = await newPlayer();
  const a = await startPlaying(pageA);
  await startPlaying(pageB);
  await waitForPlayers(pageA, 2);
  await expect.poll(() => hasGold(pageB)).toBe(true);
  const inventoryA = pageA.getByRole("region", { name: "Inventory" });
  await expect(inventoryA).toContainText(/nothing yet/i);

  await pageA.keyboard.press("e"); // the gold lies one tile from the spawn point

  await expect(inventoryA).toContainText("Gold coin");
  await expect(inventoryA).toContainText("×1");
  await expect.poll(() => hasGold(pageB)).toBe(false);

  await pageA.reload(); // the page forgets everything; the database does not
  await pageA
    .getByRole("listitem")
    .filter({ hasText: a.name })
    .getByRole("button", { name: "Play" })
    .click();
  await expect(pageA.getByRole("region", { name: "Inventory" })).toContainText(
    "Gold coin",
  );
});
