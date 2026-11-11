// Inventory data access. The SQL stays here, so Sprint 8's database swap touches one place.
export const MAX_STACK = 9999; // also enforced by a CHECK in migration 004

// What a character carries, with each item's name: a JOIN of inventory and items.
export function listInventory(db, characterId) {
  return db
    .prepare(
      `SELECT items.code, items.name, items.description, inventory.quantity
         FROM inventory
         JOIN items ON items.id = inventory.item_id
        WHERE inventory.character_id = ?
        ORDER BY items.name`,
    )
    .all(characterId);
}

// Adds `amount` of an item, in one transaction.
// { ok: true, quantity } or { ok: false, reason: "full" }. Throws for an unknown item.
export function addItem(db, characterId, code, amount = 1) {
  return db.transaction(() => {
    const item = db.prepare("SELECT id FROM items WHERE code = ?").get(code);
    if (!item) throw new Error(`Unknown item: ${code}`);

    const row = db
      .prepare(
        "SELECT quantity FROM inventory WHERE character_id = ? AND item_id = ?",
      )
      .get(characterId, item.id);
    const quantity = (row?.quantity ?? 0) + amount;
    if (quantity > MAX_STACK) return { ok: false, reason: "full" };

    db.prepare(
      `INSERT INTO inventory (character_id, item_id, quantity) VALUES (?, ?, ?)
       ON CONFLICT (character_id, item_id) DO UPDATE SET quantity = excluded.quantity`,
    ).run(characterId, item.id, quantity);
    return { ok: true, quantity };
  })();
}

// Takes `amount` of an item away, in one transaction. The row disappears at zero.
// { ok: true, quantity } or { ok: false, reason: "missing_items" }. Throws for an unknown item.
export function removeItem(db, characterId, code, amount = 1) {
  return db.transaction(() => {
    const item = db.prepare("SELECT id FROM items WHERE code = ?").get(code);
    if (!item) throw new Error(`Unknown item: ${code}`);

    const row = db
      .prepare(
        "SELECT quantity FROM inventory WHERE character_id = ? AND item_id = ?",
      )
      .get(characterId, item.id);
    if (!row || row.quantity < amount)
      return { ok: false, reason: "missing_items" };

    const quantity = row.quantity - amount;
    if (quantity === 0) {
      db.prepare(
        "DELETE FROM inventory WHERE character_id = ? AND item_id = ?",
      ).run(characterId, item.id);
    } else {
      db.prepare(
        "UPDATE inventory SET quantity = ? WHERE character_id = ? AND item_id = ?",
      ).run(quantity, characterId, item.id);
    }
    return { ok: true, quantity };
  })();
}

// Every item that exists, for the trade window: [{ code, name }].
export function listItems(db) {
  return db.prepare("SELECT code, name FROM items ORDER BY name").all();
}
