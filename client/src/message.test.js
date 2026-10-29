import { test, expect } from "vitest";
import { describeError } from "./messages.js";

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
