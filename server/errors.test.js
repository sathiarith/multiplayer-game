import { test, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createTestApp } from "./test-helpers.js";
import { errorHandler } from "./errors.js";

let app;
let db;
beforeEach(() => {
  ({ app, db } = createTestApp());
});
afterEach(() => db.close());

test("unknown routes return a JSON 404", async () => {
  for (const [method, path] of [
    ["get", "/nope"],
    ["post", "/api/nothing"],
  ]) {
    const res = await request(app)[method](path);
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body.error.code).toBe("not_found");
  }
});

test("malformed JSON returns a 400 JSON error, not an HTML page", async () => {
  const res = await request(app)
    .post("/api/login")
    .set("Content-Type", "application/json")
    .send('{"username":');
  expect(res.status).toBe(400);
  expect(res.headers["content-type"]).toMatch(/json/);
  expect(res.body.error.code).toBe("invalid_json");
});

test("an oversized body returns 413", async () => {
  const res = await request(app)
    .post("/api/login")
    .send({ username: "x".repeat(20000), password: "y" });
  expect(res.status).toBe(413);
  expect(res.body.error.code).toBe("payload_too_large");
});

test("unexpected errors become a generic 500 that leaks nothing", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});

  // A tiny app with two broken routes, plus the real error handler.
  const broken = express();
  broken.get("/sync", () => {
    throw new Error("db password is hunter2");
  });
  broken.get("/async", async () => {
    throw new Error("db password is hunter2");
  });
  broken.use(errorHandler);

  for (const path of ["/sync", "/async"]) {
    const res = await request(broken).get(path);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("internal_error");
    expect(res.text).not.toMatch(/hunter2|node_modules/);
  }
  expect(spy).toHaveBeenCalled(); // the details went to the log instead
  spy.mockRestore();
});
