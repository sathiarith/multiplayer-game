import { test, expect } from "../support/fixtures.js";
import {
  startPlaying,
  positionOf,
  waitForPlayers,
  hold,
} from "../support/helpers.js";

const chatBox = (page) => page.getByRole("textbox", { name: "Chat message" });
const chatLog = (page) => page.getByRole("log");

async function say(page, text) {
  await chatBox(page).fill(text);
  await chatBox(page).press("Enter");
}

test("players nearby see each other's messages, and markup stays text", async ({
  newPlayer,
}) => {
  const pageA = await newPlayer();
  const pageB = await newPlayer();
  const a = await startPlaying(pageA);
  await startPlaying(pageB);
  await waitForPlayers(pageA, 2);

  await say(pageA, "hello <b>there</b>");

  await expect(chatLog(pageB)).toContainText(`${a.name}: hello <b>there</b>`);
  await expect(chatLog(pageA)).toContainText("hello <b>there</b>"); // the server's echo
  await expect(chatLog(pageB).locator("b")).toHaveCount(0);
});

test("a player far away does not hear the message", async ({ newPlayer }) => {
  const pageA = await newPlayer();
  const pageB = await newPlayer();
  await startPlaying(pageA);
  const b = await startPlaying(pageB);
  await waitForPlayers(pageA, 2);

  await hold(pageB, "ArrowRight", 2000); // about 400 pixels: further than 8 tiles
  await expect
    .poll(async () => (await positionOf(pageA, b.name)).x)
    .toBeGreaterThan(100 + 320);

  await say(pageA, "anyone here?");

  await expect(chatLog(pageA)).toContainText("anyone here?");
  await pageB.waitForTimeout(500);
  await expect(chatLog(pageB)).not.toContainText("anyone here?");
});

test("typing in the chat box does not move the character", async ({ page }) => {
  const { name } = await startPlaying(page);
  await waitForPlayers(page, 1);
  const start = await positionOf(page, name);

  await chatBox(page).click();
  await chatBox(page).pressSequentially("dddd ssss", { delay: 50 }); // D is right, S is down
  await page.waitForTimeout(300);

  const now = await positionOf(page, name);
  expect(now.x).toBe(start.x);
  expect(now.y).toBe(start.y);
  await expect(chatBox(page)).toHaveValue("dddd ssss");
});
