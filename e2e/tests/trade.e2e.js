import { test, expect } from "../support/fixtures.js";
import { startPlaying, waitForPlayers, hold } from "../support/helpers.js";

const region = (page, name) => page.getByRole("region", { name });

test("two players trade: an offer, an acceptance, and both inventories change", async ({
  newPlayer,
}) => {
  const pageA = await newPlayer();
  const pageB = await newPlayer();
  const a = await startPlaying(pageA);
  const b = await startPlaying(pageB);
  await waitForPlayers(pageA, 2);

  // Both walk right to the meat (about 160 pixels), and A picks it up.
  await hold(pageA, "ArrowRight", 800);
  await hold(pageB, "ArrowRight", 800);
  await pageA.keyboard.press("e");
  await expect(region(pageA, "Inventory")).toContainText("Meat");

  const tradeA = region(pageA, "Trade");
  const tradeB = region(pageB, "Trade");
  await tradeA
    .getByRole("combobox", { name: "Trade with" })
    .selectOption({ label: b.name });
  await tradeA.getByRole("spinbutton", { name: "Give Meat" }).fill("1");
  await tradeA.getByRole("button", { name: "Send offer" }).click();

  await expect(tradeA).toContainText(`Waiting for ${b.name}`);
  await expect(tradeB).toContainText(`${a.name} offers 1 Meat for nothing.`);
  await tradeB.getByRole("button", { name: "Accept" }).click();

  await expect(tradeA).toContainText(`Trade with ${b.name} completed.`);
  await expect(tradeB).toContainText(`Trade with ${a.name} completed.`);
  await expect(region(pageB, "Inventory")).toContainText("Meat");
  await expect(region(pageA, "Inventory")).not.toContainText("Meat");
});
