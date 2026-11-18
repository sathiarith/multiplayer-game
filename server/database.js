// The server's whole view of the database: async methods that Part 2 backs with
// PostgreSQL. SQL uses $1, $2 ... placeholders, in order, each once.

// $1, $2 ... become SQLite's ?. Any other order is refused, so a mistake shows today.
function toSqlite(sql) {
  let expected = 1;
  return sql.replace(/\$(\d+)/g, (_, n) => {
    if (Number(n) !== expected) {
      throw new Error(
        `Parameters must be $1, $2 ... in order, each once: ${sql}`,
      );
    }
    expected += 1;
    return "?";
  });
}

export function sqliteDatabase(raw) {
  const statements = new Map(); // each SQL string is prepared once
  const prepare = (sql) => {
    let statement = statements.get(sql);
    if (!statement) {
      statement = raw.prepare(toSqlite(sql));
      statements.set(sql, statement);
    }
    return statement;
  };
  let inTransaction = false;

  const db = {
    engine: "sqlite",

    async query(sql, params = []) {
      const statement = prepare(sql);
      if (statement.reader) return statement.all(...params);
      statement.run(...params);
      return [];
    },

    async one(sql, params = []) {
      return (await db.query(sql, params))[0];
    },

    async run(sql, params = []) {
      const statement = prepare(sql);
      if (statement.reader) return { changes: statement.all(...params).length };
      return { changes: statement.run(...params).changes };
    },

    // Runs work(tx), committing if it succeeds and undoing everything if it throws.
    // A transaction started inside another one joins it.
    async transaction(work) {
      if (inTransaction) return work(db);
      raw.exec("BEGIN IMMEDIATE");
      inTransaction = true;
      try {
        const result = await work(db);
        raw.exec("COMMIT");
        return result;
      } catch (err) {
        raw.exec("ROLLBACK");
        throw err;
      } finally {
        inTransaction = false;
      }
    },

    isUniqueViolation: (err) =>
      err?.code === "SQLITE_CONSTRAINT_UNIQUE" ||
      err?.code === "SQLITE_CONSTRAINT_PRIMARYKEY",

    close: () => raw.close(),
    get open() {
      return raw.open;
    },

    // SQLite only, for tests and migrations. Part 2 removes these.
    raw,
    prepare: (sql) => raw.prepare(sql),
    exec: (sql) => raw.exec(sql),
    pragma: (...args) => raw.pragma(...args),
  };
  return db;
}
