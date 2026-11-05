import { test, expect, afterEach } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import request from "supertest";
import YAML from "yaml";
import SwaggerParser from "@apidevtools/swagger-parser";
import { createTestApp, loggedInAgent, ALICE } from "./test-helpers.js";

const SPEC_FILE = fileURLToPath(
  new URL("../docs/openapi.yaml", import.meta.url),
);
const spec = YAML.parse(fs.readFileSync(SPEC_FILE, "utf8"));
const errorCodes = spec.components.schemas.ErrorCode.enum;
const METHODS = ["get", "post", "put", "patch", "delete"];

const opened = [];
function make(options) {
  const t = createTestApp(options);
  opened.push(t.db);
  return t.app;
}
afterEach(() => {
  while (opened.length) opened.pop().close();
});

// "get /health", "put /api/characters/{id}/position", sorted.
function documentedRoutes() {
  return Object.entries(spec.paths)
    .flatMap(([path, item]) =>
      METHODS.filter((m) => item[m]).map((m) => `${m} ${path}`),
    )
    .sort();
}

// The same list, read from the Express router instead of the spec.
function implementedRoutes(app) {
  const routes = [];
  for (const layer of app.router.stack) {
    if (!layer.route) continue;
    const path = layer.route.path.replace(/:(\w+)/g, "{$1}");
    for (const method of Object.keys(layer.route.methods))
      routes.push(`${method} ${path}`);
  }
  return routes.sort();
}

// Asserts the status is the one the scenario intended, that the spec lists it
// for this operation, and that any error code is one the spec defines.
function seen(res, status, method, path) {
  const label = `${method.toUpperCase()} ${path}`;
  expect(res.status, `${label} returned an unexpected status`).toBe(status);
  const operation = spec.paths[path]?.[method];
  expect(operation, `${label} is not in the spec`).toBeDefined();
  expect(
    Object.keys(operation.responses),
    `${label} does not document ${status}`,
  ).toContain(String(status));
  if (res.body?.error?.code) {
    expect(
      errorCodes,
      `${label} returned an undocumented error code`,
    ).toContain(res.body.error.code);
  }
}

test("the spec is a valid OpenAPI document", async () => {
  await expect(
    SwaggerParser.validate(structuredClone(spec)),
  ).resolves.toBeDefined();
});

test("the spec lists exactly the routes the app implements", () => {
  expect(documentedRoutes()).toEqual(implementedRoutes(make()));
});

test("every documented route exists", async () => {
  const app = make();
  for (const route of documentedRoutes()) {
    const [method, path] = route.split(" ");
    const res = await request(app)[method](path.replace("{id}", "1"));
    const unknownRoute =
      res.status === 404 && res.body?.error?.message === "Route not found";
    expect(
      unknownRoute,
      `${route} is in the spec but the app does not have it`,
    ).toBe(false);
  }
});

test("responses seen in practice are all documented", async () => {
  const app = make();
  const anon = request(app);

  seen(await anon.get("/health"), 200, "get", "/health");

  // Accounts
  seen(await anon.post("/api/register").send({}), 400, "post", "/api/register");
  seen(
    await anon.post("/api/register").send(ALICE),
    201,
    "post",
    "/api/register",
  );
  seen(
    await anon.post("/api/register").send(ALICE),
    409,
    "post",
    "/api/register",
  );
  const evil = { Origin: "http://evil.example" };
  seen(
    await anon.post("/api/register").set(evil).send(ALICE),
    403,
    "post",
    "/api/register",
  );
  seen(await anon.post("/api/login").send({}), 400, "post", "/api/login");
  const wrong = { ...ALICE, password: "definitely-not-it" };
  seen(await anon.post("/api/login").send(wrong), 401, "post", "/api/login");
  const huge = { username: "x".repeat(20000), password: "y" };
  seen(await anon.post("/api/login").send(huge), 413, "post", "/api/login");
  seen(
    await anon.post("/api/login").set(evil).send(ALICE),
    403,
    "post",
    "/api/login",
  );

  // Not logged in
  seen(await anon.get("/api/me"), 401, "get", "/api/me");
  seen(await anon.get("/api/characters"), 401, "get", "/api/characters");
  seen(
    await anon.post("/api/characters").send({ name: "Aria" }),
    401,
    "post",
    "/api/characters",
  );

  // Logged in
  const agent = request.agent(app);
  seen(await agent.post("/api/login").send(ALICE), 200, "post", "/api/login");
  seen(await agent.get("/api/me"), 200, "get", "/api/me");
  seen(await agent.get("/api/characters"), 200, "get", "/api/characters");
  seen(
    await agent.post("/api/characters").send({}),
    400,
    "post",
    "/api/characters",
  );
  const created = await agent.post("/api/characters").send({ name: "Aria" });
  seen(created, 201, "post", "/api/characters");
  seen(
    await agent.post("/api/characters").set(evil).send({ name: "X_x" }),
    403,
    "post",
    "/api/characters",
  );

  // 409 for the character limit and for a taken name
  await agent.post("/api/characters").send({ name: "Second" });
  await agent.post("/api/characters").send({ name: "Third" });
  seen(
    await agent.post("/api/characters").send({ name: "Fourth" }),
    409,
    "post",
    "/api/characters",
  );
  const other = await loggedInAgent(app, "bobby");
  seen(
    await other.post("/api/characters").send({ name: "ARIA" }),
    409,
    "post",
    "/api/characters",
  );

  seen(await agent.post("/api/logout"), 204, "post", "/api/logout");
  seen(await anon.post("/api/logout").set(evil), 403, "post", "/api/logout");
});

test("the rate limit response is documented, with its Retry-After header", async () => {
  const app = make({ rateLimits: { login: { limit: 1, windowMs: 60_000 } } });
  const wrong = { ...ALICE, password: "definitely-not-it" };
  seen(
    await request(app).post("/api/login").send(wrong),
    401,
    "post",
    "/api/login",
  );
  const res = await request(app).post("/api/login").send(wrong);
  seen(res, 429, "post", "/api/login");
  expect(res.headers["retry-after"]).toBeDefined();
  expect(
    spec.components.responses.RateLimited.headers["Retry-After"],
  ).toBeDefined();
});
