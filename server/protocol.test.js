import { test, expect } from "vitest";
import fs from "node:fs";
import { PROTOCOL } from "./protocol.js";
import { STALE_AFTER_TICKS } from "./world.js";
import { CHAT_MAX_LENGTH } from "./chat.js";

const doc = fs.readFileSync(
  new URL("../docs/protocol.md", import.meta.url),
  "utf8",
);

// The table row that starts with this label, so a number can be checked in it.
function row(label) {
  const line = doc
    .split("\n")
    .find((l) => l.startsWith("|") && l.includes(label));
  expect(
    line,
    `docs/protocol.md has no table row for "${label}"`,
  ).toBeDefined();
  return line;
}

test("every event is documented", () => {
  for (const event of [...PROTOCOL.events.client, ...PROTOCOL.events.server]) {
    expect(doc, `event ${event}`).toContain(`\`${event}\``);
  }
});

test("every refusal code is documented", () => {
  for (const code of PROTOCOL.refusals)
    expect(doc, code).toContain(`\`${code}\``);
});

test("the kick reason is documented", () => {
  expect(doc).toContain(`\`${PROTOCOL.kickReason}\``);
});

test("the limits in the document match the code", () => {
  expect(row("Tick rate")).toContain(`${PROTOCOL.tickRate} per second`);
  expect(row("Maximum message size")).toContain(
    `${PROTOCOL.maxMessageBytes} bytes`,
  );
  expect(row("Sustained message rate")).toContain(
    `${PROTOCOL.rate.perSecond} per second`,
  );
  expect(row("Burst allowance")).toContain(`${PROTOCOL.rate.burst} messages`);
  expect(row("Violations before disconnect")).toContain(
    `${PROTOCOL.violations.max} in ${PROTOCOL.violations.windowMs / 1000} seconds`,
  );
  expect(row("Input released after")).toContain(`${STALE_AFTER_TICKS} ticks`);
  expect(row("Progress saved")).toContain(
    `every ${PROTOCOL.saveEveryMs / 1000} seconds`,
  );
  expect(row("Chat message length")).toContain(
    `${PROTOCOL.chat.maxLength} characters`,
  );
  expect(row("Chat messages per person")).toContain(
    `${PROTOCOL.chat.burst} per ${PROTOCOL.chat.burst / PROTOCOL.chat.perSecond} seconds`,
  );
  expect(row("Chat range")).toContain(`${PROTOCOL.chat.radius} pixels`);
});

test("every chat rejection reason is documented", () => {
  for (const reason of PROTOCOL.chatRejections)
    expect(doc, reason).toContain(`\`${reason}\``);
});

test("the chat length in the protocol is the one the code enforces", () => {
  expect(PROTOCOL.chat.maxLength).toBe(CHAT_MAX_LENGTH);
});
