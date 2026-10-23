import { test, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import { startTestServer } from "./test-helpers.js";
import { errorHandler } from "./errors.js";

let t;
beforeAll(async () => {
  t = await startTestServer();
});
afterAll(() => t.close());

test("unknown routes return a JSON 404", async () => {
  for (const [method, path] of [
    ["GET", "/nope"],
    ["POST", "/api/nothing"],
  ]) {
    const res = await fetch(t.base + path, { method });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/json/);
    expect((await res.json()).error.code).toBe("not_found");
  }
});

test("malformed JSON returns a 400 JSON error, not an HTML page", async () => {
  const res = await fetch(t.base + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"username":',
  });
  expect(res.status).toBe(400);
  expect(res.headers.get("content-type")).toMatch(/json/);
  expect((await res.json()).error.code).toBe("invalid_json");
});

test("an oversized body returns 413", async () => {
  const res = await fetch(t.base + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "x".repeat(20000), password: "y" }),
  });
  expect(res.status).toBe(413);
  expect((await res.json()).error.code).toBe("payload_too_large");
});

test("unexpected errors become a generic 500 that leaks nothing", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});

  // A tiny app with two broken routes, plus the real error handler.
  const app = express();
  app.get("/sync", () => {
    throw new Error("db password is hunter2");
  });
  app.get("/async", async () => {
    throw new Error("db password is hunter2");
  });
  app.use(errorHandler);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    for (const path of ["/sync", "/async"]) {
      const res = await fetch(url + path);
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(JSON.parse(text).error.code).toBe("internal_error");
      expect(text).not.toMatch(/hunter2|node_modules/);
    }
    expect(spy).toHaveBeenCalled(); // the details went to the log instead
  } finally {
    server.close();
    spy.mockRestore();
  }
});
