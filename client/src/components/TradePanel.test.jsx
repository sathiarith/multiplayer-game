// @vitest-environment jsdom
import { test, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TradePanel from "./TradePanel.jsx";
import "../test-utils.jsx";

const CATALOG = [
  { code: "gold_coin", name: "Gold coin" },
  { code: "meat", name: "Meat" },
  { code: "wood", name: "Wood" },
];

// Plays the part of the connection: tests call fire() to play the server.
function fakeConnection() {
  const sets = {};
  const on = (name) => (listener) => {
    (sets[name] ??= new Set()).add(listener);
    return () => sets[name].delete(listener);
  };
  return {
    catalog: () => CATALOG,
    onSnapshot: on("snapshot"),
    onInventory: on("inventory"),
    onPickupRejected: on("pickupRejected"),
    onTradeOffered: on("offered"),
    onTradeSent: on("sent"),
    onTradeResult: on("result"),
    sendTradeOffer: vi.fn(),
    sendTradeAccept: vi.fn(),
    sendTradeDecline: vi.fn(),
    sendTradeCancel: vi.fn(),
    fire: (name, payload) =>
      act(() => {
        for (const listener of sets[name] ?? []) listener(payload);
      }),
    listening: () => Object.values(sets).reduce((n, s) => n + s.size, 0),
  };
}

const at = (id, name, x) => ({
  id,
  name,
  x,
  y: 60,
  hp: 100,
  maxHp: 100,
  ack: 0,
});
const snapshot = (...players) => ({ tick: 1, players, items: [] });
const later = (ms = 25_000) => new Date(Date.now() + ms).toISOString();
const offerFromBorin = (id = "offer-1") => ({
  id,
  from: { id: 2, name: "Borin" },
  give: [{ code: "gold_coin", name: "Gold coin", quantity: 2 }],
  want: [{ code: "wood", name: "Wood", quantity: 1 }],
  expiresAt: later(),
});
const offerToBorin = (id = "offer-2") => ({
  id,
  to: { id: 2, name: "Borin" },
  give: [{ code: "meat", name: "Meat", quantity: 1 }],
  want: [],
  expiresAt: later(),
});
const region = () => screen.getByRole("region", { name: "Trade" });

function setup() {
  const connection = fakeConnection();
  const view = render(<TradePanel connection={connection} you={1} />);
  return { connection, ...view };
}

test("only players within reach can be chosen, and the list follows the snapshots", () => {
  const { connection } = setup();

  connection.fire(
    "snapshot",
    snapshot(at(1, "Aria", 100), at(2, "Borin", 150), at(3, "Cara", 400)),
  );
  const options = screen.getAllByRole("option").map((o) => o.textContent);
  expect(options).toEqual(["Choose a player", "Borin"]);

  connection.fire(
    "snapshot",
    snapshot(at(1, "Aria", 100), at(2, "Borin", 400)),
  );
  expect(screen.getByRole("combobox", { name: "Trade with" })).toBeDisabled();
  expect(screen.getByRole("option").textContent).toBe("No one is close enough");
});

test("an offer is built from what you carry and what exists, then sent", async () => {
  const user = userEvent.setup();
  const { connection } = setup();
  connection.fire(
    "snapshot",
    snapshot(at(1, "Aria", 100), at(2, "Borin", 150)),
  );
  connection.fire("inventory", [
    { code: "gold_coin", name: "Gold coin", description: "", quantity: 3 },
  ]);
  const sendButton = screen.getByRole("button", { name: "Send offer" });
  expect(sendButton).toBeDisabled(); // no partner, nothing chosen

  await user.selectOptions(
    screen.getByRole("combobox", { name: "Trade with" }),
    "Borin",
  );
  const giveGold = screen.getByRole("spinbutton", { name: "Give Gold coin" });
  await user.clear(giveGold);
  await user.type(giveGold, "9"); // more than she has: kept at 3
  expect(giveGold).toHaveValue(3);
  await user.clear(giveGold);
  await user.type(giveGold, "2");
  const wantWood = screen.getByRole("spinbutton", { name: "Want Wood" });
  await user.clear(wantWood);
  await user.type(wantWood, "1");
  await user.click(sendButton);

  expect(connection.sendTradeOffer).toHaveBeenCalledWith({
    to: 2,
    give: [{ code: "gold_coin", quantity: 2 }],
    want: [{ code: "wood", quantity: 1 }],
  });
  expect(giveGold).toHaveValue(0); // the form is ready for the next offer
});

test("an incoming offer can be accepted once, and the outcome is explained", async () => {
  const user = userEvent.setup();
  const { connection } = setup();

  connection.fire("offered", offerFromBorin());
  expect(region()).toHaveTextContent("Borin offers 2 Gold coin for 1 Wood.");
  expect(screen.getByText(/expires in \d+ s/i)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Accept" }));
  expect(connection.sendTradeAccept).toHaveBeenCalledWith("offer-1");
  expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Decline" })).toBeDisabled();

  connection.fire("result", { id: "offer-1", ok: true });
  expect(region()).toHaveTextContent("Trade with Borin completed.");
  expect(
    screen.queryByRole("button", { name: "Accept" }),
  ).not.toBeInTheDocument();
});

test("a decline is explained from each side", async () => {
  const user = userEvent.setup();
  const { connection } = setup();

  connection.fire("offered", offerFromBorin());
  await user.click(screen.getByRole("button", { name: "Decline" }));
  expect(connection.sendTradeDecline).toHaveBeenCalledWith("offer-1");
  connection.fire("result", { id: "offer-1", ok: false, reason: "declined" });
  expect(region()).toHaveTextContent("You declined Borin's offer.");

  connection.fire("sent", offerToBorin());
  connection.fire("result", { id: "offer-2", ok: false, reason: "declined" });
  expect(region()).toHaveTextContent("Borin declined your offer.");
});

test("a waiting offer is shown and can be cancelled", async () => {
  const user = userEvent.setup();
  const { connection } = setup();

  connection.fire("sent", offerToBorin());
  expect(region()).toHaveTextContent(
    "Waiting for Borin: you give 1 Meat for nothing.",
  );

  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(connection.sendTradeCancel).toHaveBeenCalledWith("offer-2");
  connection.fire("result", { id: "offer-2", ok: false, reason: "cancelled" });
  expect(region()).toHaveTextContent("You cancelled your offer to Borin.");
});

test("an offer refused before it existed is explained", () => {
  const { connection } = setup();
  connection.fire("result", { id: null, ok: false, reason: "too_far" });
  expect(region()).toHaveTextContent("Stand closer to trade.");
});

test("an expired offer is not shown", () => {
  const { connection } = setup();
  connection.fire("offered", { ...offerFromBorin(), expiresAt: later(-1000) });
  expect(screen.queryByText(/offers/)).not.toBeInTheDocument();
});

test("leaving stops listening", () => {
  const { connection, unmount } = setup();
  expect(connection.listening()).toBeGreaterThan(0);
  unmount();
  expect(connection.listening()).toBe(0);
});
