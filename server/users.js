export function createUser(db, username, passwordHash) {
  const info = db
    .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run(username, passwordHash);
  return { id: Number(info.lastInsertRowid), username };
}

export function findUserByUsername(db, username) {
  return db
    .prepare("SELECT id, username, password_hash FROM users WHERE username = ?")
    .get(username);
}

export function findUserById(db, id) {
  return db.prepare("SELECT id, username FROM users WHERE id = ?").get(id);
}
