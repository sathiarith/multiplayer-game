import crypto from "node:crypto";

const CODE = /^[a-z_]{1,32}$/;

// One side of an offer: up to `maxLines` different items, each [{ code, quantity }].
function parseLines(raw, maxLines) {
  if (!Array.isArray(raw) || raw.length > maxLines) return null;
  const seen = new Set();
  const lines = [];
  for (const line of raw) {
    if (line === null || typeof line !== "object" || Array.isArray(line))
      return null;
    const keys = Object.keys(line);
    if (
      keys.length !== 2 ||
      !keys.includes("code") ||
      !keys.includes("quantity")
    )
      return null;
    const { code, quantity } = line;
    if (typeof code !== "string" || !CODE.test(code) || seen.has(code))
      return null;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999)
      return null;
    seen.add(code);
    lines.push({ code, quantity });
  }
  return lines;
}

// An offer is exactly { to, give, want }, with something on at least one side.
export function parseOffer(raw, { maxLines }) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    return null;
  const keys = Object.keys(raw);
  if (
    keys.length !== 3 ||
    !["to", "give", "want"].every((k) => keys.includes(k))
  )
    return null;
  if (!Number.isInteger(raw.to) || raw.to < 1) return null;
  const give = parseLines(raw.give, maxLines);
  const want = parseLines(raw.want, maxLines);
  if (!give || !want || give.length + want.length === 0) return null;
  return { to: raw.to, give, want };
}

// An answer to an offer is exactly { id }, where id is one the server made.
export function parseTradeId(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    return null;
  const keys = Object.keys(raw);
  if (keys.length !== 1 || keys[0] !== "id" || typeof raw.id !== "string")
    return null;
  return /^[0-9a-f-]{36}$/.test(raw.id) ? raw.id : null;
}

// Offers waiting for an answer. Nothing moves until one is accepted.
export function createOffers({
  ttlMs,
  maxPerPlayer,
  now = () => Date.now(),
  makeId = () => crypto.randomUUID(),
}) {
  const offers = new Map();
  const live = (offer) => offer !== undefined && now() < offer.expiresAt;
  const prune = () => {
    for (const [id, offer] of offers) if (!live(offer)) offers.delete(id);
  };

  return {
    create({ from, to, give, want }) {
      prune();
      const open = [...offers.values()].filter((o) => o.from === from).length;
      if (open >= maxPerPlayer) return { ok: false, reason: "too_many_offers" };
      const offer = {
        id: makeId(),
        from,
        to,
        give,
        want,
        expiresAt: now() + ttlMs,
      };
      offers.set(offer.id, offer);
      return { ok: true, offer };
    },

    // The offer, or undefined if it never existed, was answered, or expired.
    get(id) {
      const offer = offers.get(id);
      if (!live(offer)) {
        offers.delete(id);
        return undefined;
      }
      return offer;
    },

    remove(id) {
      offers.delete(id);
    },

    // Removes every offer a character is part of, and returns them, so the other side can be told.
    removeFor(characterId) {
      const removed = [];
      for (const [id, offer] of offers) {
        if (offer.from === characterId || offer.to === characterId) {
          offers.delete(id);
          removed.push(offer);
        }
      }
      return removed;
    },
  };
}
