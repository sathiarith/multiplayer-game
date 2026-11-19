// The server's whole view of the database, backed by PostgreSQL:
// query, one, run, transaction, isUniqueViolation, close.

export function pgDatabase(pool) {
  let closed = false;

  // The methods, sending queries through `runner`: the pool, or one
  // transaction's own connection.
  function methods(runner, inTransaction) {
    const db = {
      engine: "postgres",

      async query(sql, params = []) {
        return (await runner.query(sql, params)).rows;
      },

      async one(sql, params = []) {
        return (await runner.query(sql, params)).rows[0];
      },

      async run(sql, params = []) {
        return { changes: (await runner.query(sql, params)).rowCount ?? 0 };
      },

      // Runs work(tx) on ONE connection, from BEGIN to COMMIT. Undoes everything
      // if it throws. A transaction started inside another one joins it.
      async transaction(work) {
        if (inTransaction) return work(db);
        const client = await pool.connect();
        let broken = false;
        try {
          await client.query("BEGIN");
          const result = await work(methods(client, true));
          await client.query("COMMIT");
          return result;
        } catch (err) {
          try {
            await client.query("ROLLBACK");
          } catch {
            broken = true; // a connection that cannot even roll back is thrown away
          }
          throw err;
        } finally {
          client.release(broken); // always back to the pool, or destroyed if broken
        }
      },

      isUniqueViolation: (err) => err?.code === "23505",
    };
    return db;
  }

  const db = methods(pool, false);
  db.close = async () => {
    if (closed) return;
    closed = true;
    await pool.end();
  };
  Object.defineProperty(db, "open", { get: () => !closed });
  return db;
}
