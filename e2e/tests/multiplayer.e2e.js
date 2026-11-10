import { test, expect } from "../support/fixtures.js";
import {
  uniqueName,
  startPlaying,
  createCharacter,
  play,
  players,
  positionOf,
  waitForPlayers,
  hold,
  PASSWORD,
} from "../support/helpers.js";

test("two players, each in their own browser, see each other move", async ({
  newPlayer,
}) => {
  const pageA = await newPlayer();
  const pageB = await newPlayer();
  const a = await startPlaying(pageA);
  const b = await startPlaying(pageB);

  await waitForPlayers(pageA, 2);
  await waitForPlayers(pageB, 2);
  const names = (await players(pageA)).map((p) => p.name).sort();
  expect(names).toEqual([a.name, b.name].sort());

  const start = await positionOf(pageB, a.name);
  await hold(pageA, "ArrowRight", 600);

  await expect
    .poll(async () => (await positionOf(pageB, a.name)).x)
    .toBeGreaterThan(start.x + 60);
});

test("a player who leaves disappears for the others", async ({ newPlayer }) => {
  const pageA = await newPlayer();
  const pageB = await newPlayer();
  await startPlaying(pageA);
  const b = await startPlaying(pageB);
  await waitForPlayers(pageA, 2);

  await pageB.getByRole("link", { name: "Back to characters" }).click();

  await waitForPlayers(pageA, 1);
  expect((await players(pageA)).map((p) => p.name)).not.toContain(b.name);
});

test("opening the same character in a second tab replaces the first", async ({
  context,
  page,
}) => {
  const { name } = await startPlaying(page);

  const second = await context.newPage(); // same browser, so the same login
  await second.goto("/characters");
  await play(second, name);

  await expect(page.getByText(/opened in another window/i)).toBeVisible();

  await page.getByRole("button", { name: "Play here" }).click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(second.getByText(/opened in another window/i)).toBeVisible();
});

test("logging out in one tab disconnects the game in another", async ({
  context,
  page,
}) => {
  await startPlaying(page);

  const second = await context.newPage();
  await second.goto("/characters");
  await second.getByRole("button", { name: "Log out" }).click();

  await expect(page.getByText(/disconnected from the game/i)).toBeVisible();
});

test("walking earns points that appear on the leaderboard", async ({
  page,
}) => {
  const { name } = await startPlaying(page);
  await waitForPlayers(page, 1);

  await hold(page, "ArrowRight", 1000); // about five tiles
  await page.getByRole("link", { name: "Back to characters" }).click(); // leaving saves the character

  await expect
    .poll(async () => {
      const board = await (await page.request.get("/api/leaderboard")).json();
      return board.find((entry) => entry.name === name)?.score ?? 0;
    })
    .toBeGreaterThanOrEqual(3);
});

test("logging in again in another tab ends the game in the first", async ({
  context,
  page,
}) => {
  await startPlaying(page);

  // The other tab logs in as someone else. It shares this browser's cookie.
  const other = { username: uniqueName("other"), password: PASSWORD };
  await context.request.post("/api/register", { data: other });
  const res = await context.request.post("/api/login", { data: other });
  expect(res.status()).toBe(200);

  await expect(page.getByText(/log in again in another tab/i)).toBeVisible();
});

// The backlog card "Detect a session change made in another tab". Today the
// first tab keeps showing the old user until it is reloaded.
test.fixme("a tab shows the new user after another tab logs in as someone else", async ({
  context,
  page,
}) => {
  const first = await startPlaying(page);
  const second = await context.newPage();
  await second.goto("/characters");
  await second.getByRole("button", { name: "Log out" }).click();
  await second.getByRole("link", { name: "Register" }).click();
  const other = uniqueName("other");
  await createCharacter(second, uniqueName("Hero")).catch(() => {});
  await expect(page.locator("nav")).not.toContainText(first.user);
  await expect(page.locator("nav")).toContainText(other);
});
