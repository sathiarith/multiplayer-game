import { test, expect, afterEach } from "vitest";
import request from "supertest";
import { createTestApp } from "./test-helpers.js";

const opened = [];
afterEach(async () => {
  while (opened.length) await opened.pop().close();
});
async function make(options) {
  const t = await createTestApp(options);
  opened.push(t.db);
  return t.app;
}

test("Swagger UI is served when docs are enabled", async () => {
  const res = await request(await make({ docs: true })).get("/api/docs/");
  expect(res.status).toBe(200);
  expect(res.text).toMatch(/swagger/i);
  const csp = res.headers["content-security-policy"];
  expect(csp).toBeDefined();
  expect(csp).not.toMatch(/upgrade-insecure-requests/);
});

test("the served UI embeds this API's spec", async () => {
  const res = await request(await make({ docs: true })).get(
    "/api/docs/swagger-ui-init.js",
  );
  expect(res.status).toBe(200);
  expect(res.text).toContain("Multiplayer Game API");
});

test("the documentation is not served unless enabled", async () => {
  const res = await request(await make()).get("/api/docs/");
  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe("not_found");
});
