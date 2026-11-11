import { addItem, removeItem } from "./inventory.js";

class TradeError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

// Moves items between two characters in one transaction: everything, or nothing.
// Every quantity is checked now, inside the transaction, never trusted from
// when the offer was made: the giver may have traded the same items since.
export function executeTrade(db, { from, to, give = [], want = [] }) {
  const move = (fromId, toId, { code, quantity }) => {
    const taken = removeItem(db, fromId, code, quantity);
    if (!taken.ok) throw new TradeError(taken.reason);
    const added = addItem(db, toId, code, quantity);
    if (!added.ok) throw new TradeError(added.reason);
  };

  try {
    db.transaction(() => {
      for (const line of give) move(from, to, line);
      for (const line of want) move(to, from, line);
    })();
    return { ok: true };
  } catch (err) {
    if (err instanceof TradeError) return { ok: false, reason: err.reason }; // already rolled back
    throw err; // anything else is a real failure, also rolled back
  }
}
