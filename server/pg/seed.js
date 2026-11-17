import bcrypt from "bcryptjs";

export const DEMO_PASSWORD = "demo-password-123";

const DEMO = [
  {
    username: "demo_alice",
    character: "DemoAria",
    items: [
      ["gold_coin", 3],
      ["meat", 1],
    ],
  },
  { username: "demo_bob", character: "DemoBorin", items: [["wood", 2]] },
];

// Demo accounts for local development. Safe to run again: nothing is duplicated.
export async function seed(client, { cost = 12 } = {}) {
  const hash = await bcrypt.hash(DEMO_PASSWORD, cost);
  for (const demo of DEMO) {
    await client.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [demo.username, hash],
    );
    const user = (
      await client.query(
        "SELECT id FROM users WHERE lower(username) = lower($1)",
        [demo.username],
      )
    ).rows[0];

    await client.query(
      `INSERT INTO characters (user_id, name, pos_x, pos_y) VALUES ($1, $2, 100, 60)
       ON CONFLICT DO NOTHING`,
      [user.id, demo.character],
    );
    const character = (
      await client.query(
        "SELECT id FROM characters WHERE lower(name) = lower($1) AND user_id = $2",
        [demo.character, user.id],
      )
    ).rows[0];
    if (!character)
      throw new Error(`The name ${demo.character} belongs to another account`);

    for (const [code, quantity] of demo.items) {
      await client.query(
        `INSERT INTO inventory (character_id, item_id, quantity)
         SELECT $1, id, $3 FROM items WHERE code = $2
         ON CONFLICT (character_id, item_id) DO NOTHING`,
        [character.id, code, quantity],
      );
    }
  }
}
