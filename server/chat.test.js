import { test, expect } from "vitest";
import {
  parseChat,
  createBucket,
  withinRadius,
  CHAT_MAX_LENGTH,
} from "./chat.js";

test("a normal message is accepted and trimmed", async () => {
  expect(parseChat({ text: "  hello there  " })).toEqual({
    ok: true,
    text: "hello there",
  });
});

test("text is not sanitized: escaping is the client's job when it displays it", async () => {
  const html = "<img src=x onerror=alert(1)>";
  expect(parseChat({ text: html })).toEqual({ ok: true, text: html });
});

test("the length limit counts characters, not bytes", async () => {
  expect(parseChat({ text: "é".repeat(CHAT_MAX_LENGTH) }).ok).toBe(true);
  expect(parseChat({ text: "😀".repeat(CHAT_MAX_LENGTH) }).ok).toBe(true);
  expect(parseChat({ text: "a".repeat(CHAT_MAX_LENGTH + 1) })).toEqual({
    ok: false,
    reason: "invalid",
  });
});

test("empty messages and forbidden characters are a person's mistake, not nonsense", async () => {
  for (const text of [
    "",
    "   ",
    "line one\nline two",
    "tab\there",
    "nul\u0000",
    "evil\u202Eecaf",
  ]) {
    expect(parseChat({ text }), JSON.stringify(text)).toEqual({
      ok: false,
      reason: "invalid",
    });
  }
});

test("anything that is not exactly { text: string } is malformed", async () => {
  for (const raw of [
    null,
    undefined,
    "hello",
    5,
    [],
    {},
    { text: 5 },
    { text: "hi", to: 3 },
    { message: "hi" },
  ]) {
    expect(parseChat(raw), JSON.stringify(raw)).toEqual({
      ok: false,
      reason: "malformed",
    });
  }
});

test("the bucket allows a burst, then refills over time", async () => {
  let time = 0;
  const bucket = createBucket({
    ratePerSecond: 0.5,
    burst: 5,
    now: () => time,
  });
  const takes = (n) => Array.from({ length: n }, () => bucket.take());

  expect(takes(6)).toEqual([true, true, true, true, true, false]);
  time += 2000; // half a token a second: one token after two seconds
  expect(takes(2)).toEqual([true, false]);
  time += 60_000;
  expect(takes(6)).toEqual([true, true, true, true, true, false]); // never more than the burst
});

test("only players within the radius hear, the speaker included", async () => {
  const positions = [
    { id: 1, x: 100, y: 100 },
    { id: 2, x: 400, y: 100 }, // 300 away
    { id: 3, x: 100, y: 421 }, // 321 away
    { id: 4, x: 326, y: 326 }, // about 319.6 away, diagonally
  ];
  expect(withinRadius(positions, { x: 100, y: 100 }, 320)).toEqual([1, 2, 4]);
});
