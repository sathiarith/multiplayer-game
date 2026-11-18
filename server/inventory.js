// Inventory data access. The SQL stays here, so Sprint 8's database swap touches one place.
export const MAX_STACK = 9999; // also enforced by a CHECK in migration 004

async function itemId(db, code) {
  const item = await db.one("SELECT id FROM items WHERE code = $1", [code]);
  if (!item) throw new Error(`Unknown item: ${code}`);
  return item.id;
}

// What a character carries, with each item's name: a JOIN of inventory and items.
export function listInventory(db, characterId) {
  return db.query(
    `SELECT items.code, items.name, items.description, inventory.quantity
       FROM inventory
       JOIN items ON items.id = inventory.item_id
      WHERE inventory.character_id = $1
      ORDER BY items.name`,
    [characterId],
  );
}

// Every item that exists, for the trade window: [{ code, name }].
export function listItems(db) {
  return db.query("SELECT code, name FROM items ORDER BY name");
}

// Adds `amount` of an item, in one transaction.
// { ok: true, quantity } or { ok: false, reason: "full" }. Throws for an unknown item.
export function addItem(db, characterId, code, amount = 1) {
  return db.transaction(async (tx) => {
    const id = await itemId(tx, code);
    const row = await tx.one(
      "SELECT quantity FROM inventory WHERE character_id = $1 AND item_id = $2",
      [characterId, id],
    );
    const quantity = (row?.quantity ?? 0) + amount;
    if (quantity > MAX_STACK) return { ok: false, reason: "full" };

    await tx.run(
      `INSERT INTO inventory (character_id, item_id, quantity) VALUES ($1, $2, $3)
       ON CONFLICT (character_id, item_id) DO UPDATE SET quantity = excluded.quantity`,
      [characterId, id, quantity],
    );
    return { ok: true, quantity };
  });
}

// Takes `amount` of an item away, in one transaction. The row disappears at zero.
// { ok: true, quantity } or { ok: false, reason: "missing_items" }. Throws for an unknown item.
export function removeItem(db, characterId, code, amount = 1) {
  return db.transaction(async (tx) => {
    const id = await itemId(tx, code);
    const row = await tx.one(
      "SELECT quantity FROM inventory WHERE character_id = $1 AND item_id = $2",
      [characterId, id],
    );
    if (!row || row.quantity < amount)
      return { ok: false, reason: "missing_items" };

    const quantity = row.quantity - amount;
    if (quantity === 0) {
      await tx.run(
        "DELETE FROM inventory WHERE character_id = $1 AND item_id = $2",
        [characterId, id],
      );
    } else {
      await tx.run(
        "UPDATE inventory SET quantity = $1 WHERE character_id = $2 AND item_id = $3",
        [quantity, characterId, id],
      );
    }
    return { ok: true, quantity };
  });
}
