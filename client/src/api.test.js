import { test, expect, vi, afterEach } from "vitest";
import { login, logout, ApiError } from "./api.js";

afterEach(() => vi.unstubAllGlobals());

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

test("login posts JSON and returns the user", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(json(200, { id: 1, username: "alice" }));
  vi.stubGlobal("fetch", fetchMock);

  const user = await login({ username: "alice", password: "pw" });

  expect(user).toEqual({ id: 1, username: "alice" });
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/login");
  expect(options.method).toBe("POST");
  expect(options.headers["Content-Type"]).toBe("application/json");
  expect(JSON.parse(options.body)).toEqual({
    username: "alice",
    password: "pw",
  });
});

test("an error body becomes an ApiError with its code, fields and request id", async () => {
  const body = {
    error: {
      code: "invalid_input",
      message: "Invalid input",
      fields: { username: "bad" },
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(json(400, body, { "X-Request-Id": "abc" })),
  );

  const err = await login({ username: "x", password: "y" }).catch((e) => e);

  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({
    status: 400,
    code: "invalid_input",
    fields: { username: "bad" },
    requestId: "abc",
  });
});

test("a 429 carries Retry-After as a number", async () => {
  const body = {
    error: { code: "rate_limited", message: "Too many attempts" },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(json(429, body, { "Retry-After": "30" })),
  );

  const err = await login({ username: "x", password: "y" }).catch((e) => e);

  expect(err.code).toBe("rate_limited");
  expect(err.retryAfter).toBe(30);
});

test("a 204 response returns null", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
  );
  expect(await logout()).toBeNull();
});

test("fetch failing outright becomes a network_error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
  );
  const err = await logout().catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.code).toBe("network_error");
});

test("a 5xx without our JSON error shape counts as the server being unreachable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("", { status: 502 })),
  );
  const err = await logout().catch((e) => e);
  expect(err.code).toBe("network_error");
});

test("a 500 with our JSON error shape keeps its own code", async () => {
  const body = {
    error: { code: "internal_error", message: "Something went wrong" },
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(500, body)));
  const err = await logout().catch((e) => e);
  expect(err.code).toBe("internal_error");
});
