import { test as base, expect } from "@playwright/test";
import { createClient } from "redis";
import { CLIENT_URL, REDIS_URL } from "../env.js";

export const test = base.extend({
  // A connection to the test Redis database, emptied before every test.
  redis: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const client = createClient({ url: REDIS_URL });
      client.on("error", () => {});
      await client.connect();
      await client.flushDb(); // database 15 only, as REDIS_URL names it
      await use(client);
      await client.close();
    },
    { auto: true },
  ],

  // Opens a page in a brand-new browser context: its own cookies, like a
  // separate browser. All of them are closed when the test ends.
  newPlayer: async ({ browser }, use) => {
    const contexts = [];
    await use(async () => {
      const context = await browser.newContext({ baseURL: CLIENT_URL });
      contexts.push(context);
      return context.newPage();
    });
    for (const context of contexts) await context.close();
  },
});

export { expect };
