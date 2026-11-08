import { expect } from "@playwright/test";

export const PASSWORD = "correct-horse-battery";

// Names must be unique, because the database keeps what earlier tests created.
export const uniqueName = (prefix) =>
  `${prefix}${Math.random().toString(36).slice(2, 8)}`;

export async function register(page, username) {
  await page.goto("/register");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(
    page.getByRole("heading", { name: "Your characters" }),
  ).toBeVisible();
}

export async function logIn(page, username, password = PASSWORD) {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

export async function createCharacter(page, name) {
  await page.getByLabel("Character name").fill(name);
  await page.getByRole("button", { name: "Create character" }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: name }),
  ).toBeVisible();
}

// Clicks Play for a character and waits until the game is connected.
export async function play(page, name) {
  await page
    .getByRole("listitem")
    .filter({ hasText: name })
    .getByRole("button", { name: "Play" })
    .click();
  await expect(
    page.getByRole("heading", { name: `Playing as ${name}` }),
  ).toBeVisible();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
}

// Registers a new user, creates a character, and starts playing it.
export async function startPlaying(
  page,
  { user = uniqueName("player"), name = uniqueName("Hero") } = {},
) {
  await register(page, user);
  await createCharacter(page, name);
  await play(page, name);
  return { user, name };
}

// The newest snapshot's players, read from the development-only window into the canvas.
export const players = (page) =>
  page.evaluate(() => window.__game?.players() ?? []);

export async function positionOf(page, name) {
  return (await players(page)).find((p) => p.name === name);
}

export const waitForPlayers = (page, count) =>
  expect.poll(async () => (await players(page)).length).toBe(count);

// Holds a key down for a while, like a player walking.
export async function hold(page, key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}
