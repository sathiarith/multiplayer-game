import { test, expect } from "../support/fixtures.js";
import {
  PASSWORD,
  uniqueName,
  register,
  logIn,
  createCharacter,
  play,
  startPlaying,
  positionOf,
  waitForPlayers,
  hold,
} from "../support/helpers.js";

test("a new user can register, create a character and enter the game", async ({
  page,
}) => {
  const name = uniqueName("Hero");
  await register(page, uniqueName("newbie"));
  await expect(page.getByText(/no characters yet/i)).toBeVisible();

  await createCharacter(page, name);
  await play(page, name);

  await expect(page.locator(".hud__name")).toHaveText(name);
  await expect(page.locator(".hud__pos")).toHaveText("Tile 2, 1"); // the spawn tile
  await waitForPlayers(page, 1);
});

test("a wrong password shows a message and stays on the login page", async ({
  page,
}) => {
  await page.goto("/login");
  await logIn(page, uniqueName("nobody"), "definitely-not-it");

  await expect(page.getByRole("alert")).toHaveText(
    "Wrong username or password.",
  );
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
});

test("a visitor who is not logged in is sent to the login page, and back after logging in", async ({
  page,
}) => {
  const username = uniqueName("back");
  await page.request.post("/api/register", {
    data: { username, password: PASSWORD },
  });

  await page.goto("/characters");
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();

  await logIn(page, username);
  await expect(
    page.getByRole("heading", { name: "Your characters" }),
  ).toBeVisible();
});

test("after leaving the game and returning, the character is where it was left", async ({
  page,
}) => {
  const { name } = await startPlaying(page);
  await waitForPlayers(page, 1);
  const start = await positionOf(page, name);

  await hold(page, "ArrowRight", 600);
  await expect
    .poll(async () => (await positionOf(page, name)).x)
    .toBeGreaterThan(start.x + 60);
  await page.waitForTimeout(300); // let the character settle
  const settled = await positionOf(page, name);

  await page.getByRole("link", { name: "Back to characters" }).click();
  await play(page, name);

  await expect
    .poll(async () => (await positionOf(page, name))?.x)
    .toBeCloseTo(settled.x, 0);
});
