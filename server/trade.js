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
export async function executeTrade(db, { from, to, give = [], want = [] }) {
  const move = async (tx, fromId, toId, { code, quantity }) => {
    const taken = await removeItem(tx, fromId, code, quantity);
    if (!taken.ok) throw new TradeError(taken.reason);
    const added = await addItem(tx, toId, code, quantity);
    if (!added.ok) throw new TradeError(added.reason);
  };

  try {
    await db.transaction(async (tx) => {
      for (const line of give) await move(tx, from, to, line);
      for (const line of want) await move(tx, to, from, line);
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof TradeError) return { ok: false, reason: err.reason }; // already rolled back
    throw err; // anything else is a real failure, also rolled back
  }
}
