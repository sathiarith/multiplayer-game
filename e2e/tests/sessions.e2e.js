import { test, expect } from "../support/fixtures.js";
import { uniqueName, register, logIn } from "../support/helpers.js";

test("a login creates one session in Redis, and logging out removes it", async ({
  page,
  redis,
}) => {
  await register(page, uniqueName("sess")); // registering also logs in
  expect(await redis.keys("game:sess:*")).toHaveLength(1);

  await page.getByRole("button", { name: "Log out" }).click();

  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  expect(await redis.keys("game:sess:*")).toHaveLength(0);
});

test("a session that is gone from Redis logs the browser out", async ({
  page,
  redis,
}) => {
  await register(page, uniqueName("gone"));

  await redis.del(await redis.keys("game:sess:*")); // as if it had expired

  await page.reload();
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
});

test("repeated wrong passwords lock the login, and the page says how long to wait", async ({
  page,
  request,
}) => {
  const username = uniqueName("lock");
  await register(page, username);
  await page.getByRole("button", { name: "Log out" }).click();

  for (let i = 0; i < 10; i++) {
    const res = await request.post("/api/login", {
      data: { username, password: "definitely-not-it" },
    });
    expect(res.status()).toBe(401);
  }

  await logIn(page, username); // even the right password is refused now
  await expect(page.getByRole("alert")).toContainText("Too many attempts");
  await expect(page.getByRole("alert")).toContainText("15 minutes");
});
