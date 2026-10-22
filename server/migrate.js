import fs from "node:fs";

const DIR = new URL("./migrations/", import.meta.url);

// Run every migration file newer than the database's recorded version.
export function migrate(db) {
  const files = fs
    .readdirSync(DIR)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();
  const current = db.pragma("user_version", { simple: true });

  for (const file of files) {
    const version = parseInt(file, 10); // "002_characters.sql" -> 2
    if (version <= current) continue;
    const sql = fs.readFileSync(new URL(file, DIR), "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version}`);
    })();
  }
}
