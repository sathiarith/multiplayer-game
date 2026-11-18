export class UsernameTakenError extends Error {}

export async function createUser(db, username, passwordHash) {
  try {
    return await db.one(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username",
      [username, passwordHash],
    );
  } catch (err) {
    if (db.isUniqueViolation(err)) throw new UsernameTakenError();
    throw err;
  }
}

// Usernames are unique whatever their case, so the lookup ignores case too.
export function findUserByUsername(db, username) {
  return db.one(
    "SELECT id, username, password_hash FROM users WHERE lower(username) = lower($1)",
    [username],
  );
}

export function findUserById(db, id) {
  return db.one("SELECT id, username FROM users WHERE id = $1", [id]);
}
