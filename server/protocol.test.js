import { test, expect } from "vitest";
import fs from "node:fs";
import { PROTOCOL } from "./protocol.js";
import { STALE_AFTER_TICKS } from "./world.js";
import { CHAT_MAX_LENGTH } from "./chat.js";
import { MAX_STACK } from "./inventory.js";

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

test("every event is documented", async () => {
  for (const event of [...PROTOCOL.events.client, ...PROTOCOL.events.server]) {
    expect(doc, `event ${event}`).toContain(`\`${event}\``);
  }
});

test("every refusal code is documented", async () => {
  for (const code of PROTOCOL.refusals)
    expect(doc, code).toContain(`\`${code}\``);
});

test("the kick reason is documented", async () => {
  expect(doc).toContain(`\`${PROTOCOL.kickReason}\``);
});

test("the limits in the document match the code", async () => {
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
  expect(row("Pickup range")).toContain(`${PROTOCOL.pickup.range} pixels`);
  expect(row("Item respawn")).toContain(
    `${PROTOCOL.pickup.respawnSeconds} seconds`,
  );
  expect(row("Most of one item")).toContain(String(PROTOCOL.pickup.maxStack));
  expect(row("Trade range")).toContain(`${PROTOCOL.trade.range} pixels`);
  expect(row("Trade offer lifetime")).toContain(
    `${PROTOCOL.trade.offerSeconds} seconds`,
  );
  expect(row("Open offers per player")).toContain(
    String(PROTOCOL.trade.maxOffers),
  );
  expect(row("Items per side of a trade")).toContain(
    String(PROTOCOL.trade.maxLines),
  );
  expect(row("Attack reach")).toContain(
    `${PROTOCOL.combat.attackRange} pixels`,
  );
  expect(row("Attack cooldown")).toContain(
    `${PROTOCOL.combat.attackCooldownMs} milliseconds`,
  );
});

test("every chat rejection reason is documented", async () => {
  for (const reason of PROTOCOL.chatRejections)
    expect(doc, reason).toContain(`\`${reason}\``);
});

test("the chat length in the protocol is the one the code enforces", async () => {
  expect(PROTOCOL.chat.maxLength).toBe(CHAT_MAX_LENGTH);
});

test("every pickup rejection reason is documented", async () => {
  for (const reason of PROTOCOL.pickupRejections)
    expect(doc, reason).toContain(`\`${reason}\``);
});

test("the stack limit in the protocol is the one the code enforces", async () => {
  expect(PROTOCOL.pickup.maxStack).toBe(MAX_STACK);
});

test("every trade result reason is documented", async () => {
  for (const reason of PROTOCOL.tradeReasons)
    expect(doc, reason).toContain(`\`${reason}\``);
});

test("every attack rejection reason is documented", async () => {
  for (const reason of PROTOCOL.attackRejections)
    expect(doc, reason).toContain(`\`${reason}\``);
});
