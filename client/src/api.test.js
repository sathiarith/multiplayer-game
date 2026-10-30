import { test, expect, vi, afterEach } from "vitest";
import {
  login,
  logout,
  ApiError,
  listCharacters,
  createCharacter,
} from "./api.js";

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

test("listCharacters reads the array with a GET", async () => {
  const list = [{ id: 1, name: "Aria" }];
  const fetchMock = vi.fn().mockResolvedValue(json(200, list));
  vi.stubGlobal("fetch", fetchMock);

  expect(await listCharacters()).toEqual(list);
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/characters");
  expect(options.method).toBe("GET");
});

test("createCharacter posts only the fields it is given", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(json(201, { id: 2, name: "Aria" }));
  vi.stubGlobal("fetch", fetchMock);

  await createCharacter({ name: "Aria" });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: "Aria" });
});

test("a 409 when creating a character keeps its code", async () => {
  const body = {
    error: {
      code: "character_limit",
      message: "You can have at most 3 characters",
    },
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(409, body)));

  const err = await createCharacter({ name: "Aria" }).catch((e) => e);
  expect(err).toMatchObject({ status: 409, code: "character_limit" });
});
