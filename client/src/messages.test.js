import { test, expect } from "vitest";
import { describeError, describeConnection } from "./messages.js";

test("known codes get messages a player can act on", () => {
  expect(describeError({ code: "invalid_credentials" })).toMatch(
    /username or password/i,
  );
  expect(describeError({ code: "username_taken" })).toMatch(/taken/i);
  expect(describeError({ code: "network_error" })).toMatch(/cannot reach/i);
});

test("rate limits say how long to wait", () => {
  expect(describeError({ code: "rate_limited", retryAfter: 30 })).toMatch(
    /30 seconds/,
  );
  expect(describeError({ code: "rate_limited", retryAfter: 600 })).toMatch(
    /10 minutes/,
  );
  expect(describeError({ code: "rate_limited" })).toMatch(/later/);
});

test("server errors include the request id so the log line can be found", () => {
  const text = describeError({ code: "internal_error", requestId: "req-123" });
  expect(text).toContain("req-123");
});

test("unknown errors and non-errors still produce a message", () => {
  expect(describeError(undefined)).toMatch(/went wrong/i);
  expect(describeError({ code: "something_new", message: "Custom text" })).toBe(
    "Custom text",
  );
});

test("every connection state has its own message", () => {
  expect(describeConnection({ status: "connecting" }).text).toMatch(
    /connecting/i,
  );
  expect(describeConnection({ status: "connected" }).tone).toBe("success");
  expect(describeConnection({ status: "reconnecting" }).tone).toBe("warning");
  expect(describeConnection({ status: "idle" })).toBeNull();
  expect(describeConnection(undefined)).toBeNull();
});

test("a replaced or ended connection offers a way back in", () => {
  expect(describeConnection({ status: "replaced" }).retryLabel).toBe(
    "Play here",
  );
  expect(describeConnection({ status: "ended" }).retryLabel).toBe("Reconnect");
});

test("refusals explain themselves, and only a server fault offers a retry", () => {
  const refused = (code) => describeConnection({ status: "refused", code });
  expect(refused("not_authenticated").text).toMatch(/log in/i);
  expect(refused("not_found").text).toMatch(/could not be found/i);
  expect(refused("not_found").retryLabel).toBeUndefined();
  expect(refused("internal_error").retryLabel).toBe("Try again");
  expect(refused("something_new").text).toMatch(/refused/i);
});
