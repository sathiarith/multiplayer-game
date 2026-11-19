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

// Adds `amount` of an item, in one statement: insert, or grow the stack, but
// only while the result stays within MAX_STACK. Postgres locks the row while
// the statement runs, so two adds at once both count.
// { ok: true, quantity } or { ok: false, reason: "full" }. Throws for an unknown item.
export function addItem(db, characterId, code, amount = 1) {
  return db.transaction(async (tx) => {
    const id = await itemId(tx, code);
    const row = await tx.one(
      `INSERT INTO inventory (character_id, item_id, quantity) VALUES ($1, $2, $3)
       ON CONFLICT (character_id, item_id) DO UPDATE
         SET quantity = inventory.quantity + excluded.quantity
         WHERE inventory.quantity + excluded.quantity <= $4
       RETURNING quantity`,
      [characterId, id, amount, MAX_STACK],
    );
    if (!row) return { ok: false, reason: "full" };
    return { ok: true, quantity: row.quantity };
  });
}

// Takes `amount` of an item away. Each statement checks the quantity as it
// changes it, so two removals at once can never take the same items twice.
// The row disappears at zero. { ok: true, quantity } or
// { ok: false, reason: "missing_items" }. Throws for an unknown item.
export function removeItem(db, characterId, code, amount = 1) {
  return db.transaction(async (tx) => {
    const id = await itemId(tx, code);
    const emptied = await tx.one(
      `DELETE FROM inventory
        WHERE character_id = $1 AND item_id = $2 AND quantity = $3
        RETURNING quantity`,
      [characterId, id, amount],
    );
    if (emptied) return { ok: true, quantity: 0 };

    const left = await tx.one(
      `UPDATE inventory SET quantity = quantity - $1
        WHERE character_id = $2 AND item_id = $3 AND quantity > $1
        RETURNING quantity`,
      [amount, characterId, id],
    );
    if (!left) return { ok: false, reason: "missing_items" };
    return { ok: true, quantity: left.quantity };
  });
}
