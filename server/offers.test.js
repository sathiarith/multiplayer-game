import { test, expect } from "vitest";
import { createOffers, parseOffer, parseTradeId } from "./offers.js";

const gold = (quantity) => ({ code: "gold_coin", quantity });
const valid = { to: 2, give: [gold(1)], want: [] };

test("a well-formed offer is accepted, with a gift or a swap", () => {
  expect(parseOffer(valid, { maxLines: 4 })).toEqual(valid);
  const swap = {
    to: 2,
    give: [gold(2)],
    want: [{ code: "wood", quantity: 1 }],
  };
  expect(parseOffer(swap, { maxLines: 4 })).toEqual(swap);
});

test("anything else is malformed", () => {
  const bad = [
    null,
    "offer",
    [],
    {},
    { ...valid, extra: 1 },
    { ...valid, to: 0 },
    { ...valid, to: "2" },
    { to: 2, give: [], want: [] }, // nothing on either side
    { ...valid, give: "gold" },
    { ...valid, give: [gold(0)] },
    { ...valid, give: [gold(1.5)] },
    { ...valid, give: [gold(10000)] },
    { ...valid, give: [gold(1), gold(2)] }, // the same item twice
    { ...valid, give: [{ code: "Gold Coin", quantity: 1 }] },
    { ...valid, give: [{ code: "gold_coin", quantity: 1, price: 5 }] },
    {
      ...valid,
      give: ["a", "b", "c", "d", "e"].map((c) => ({ code: c, quantity: 1 })),
    }, // too many
  ];
  for (const raw of bad)
    expect(parseOffer(raw, { maxLines: 4 }), JSON.stringify(raw)).toBeNull();
});

test("an answer names an offer by its id, and nothing else", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  expect(parseTradeId({ id })).toBe(id);
  for (const raw of [
    null,
    id,
    {},
    { id: 5 },
    { id: "nope" },
    { id, extra: true },
  ]) {
    expect(parseTradeId(raw), JSON.stringify(raw)).toBeNull();
  }
});

function setup() {
  let time = 0;
  let n = 0;
  const offers = createOffers({
    ttlMs: 1000,
    maxPerPlayer: 2,
    now: () => time,
    makeId: () => `offer-${++n}`,
  });
  return { offers, advance: (ms) => (time += ms) };
}
const offer = (from, to) => ({ from, to, give: [gold(1)], want: [] });

test("an offer can be found until it is removed", () => {
  const { offers } = setup();
  const created = offers.create(offer(1, 2));
  expect(created.ok).toBe(true);
  expect(offers.get(created.offer.id)).toMatchObject({ from: 1, to: 2 });

  offers.remove(created.offer.id);
  expect(offers.get(created.offer.id)).toBeUndefined();
});

test("an offer expires", () => {
  const { offers, advance } = setup();
  const { offer: made } = offers.create(offer(1, 2));
  advance(999);
  expect(offers.get(made.id)).toBeDefined();
  advance(1);
  expect(offers.get(made.id)).toBeUndefined();
});

test("a player may only have so many open offers, and expired ones do not count", () => {
  const { offers, advance } = setup();
  offers.create(offer(1, 2));
  offers.create(offer(1, 3));
  expect(offers.create(offer(1, 4))).toEqual({
    ok: false,
    reason: "too_many_offers",
  });
  expect(offers.create(offer(2, 1)).ok).toBe(true); // someone else is not limited by player 1

  advance(1000);
  expect(offers.create(offer(1, 4)).ok).toBe(true);
});

test("a player who leaves takes every offer they are part of", () => {
  const { offers } = setup();
  const a = offers.create(offer(1, 2)).offer;
  const b = offers.create(offer(3, 1)).offer;
  const c = offers.create(offer(3, 2)).offer;

  const removed = offers.removeFor(1);

  expect(removed.map((o) => o.id).sort()).toEqual([a.id, b.id].sort());
  expect(offers.get(a.id)).toBeUndefined();
  expect(offers.get(c.id)).toBeDefined();
});
