-- MySQL 9.7: the same six things as postgres.sql.
-- Run with --force, so the expected errors don't stop the script, and with
-- --default-character-set=utf8mb4, or accented names are stored garbled.
-- The full command is in docs/database-comparison.md.

DROP TABLE IF EXISTS inventory, characters, users, half_done;

-- 1. Names unique whatever their case. The default collation, utf8mb4_0900_ai_ci,
--    compares without case (ci) AND without accents (ai), so a plain UNIQUE does it.
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE
);

-- 2. The new row back: there is no RETURNING in MySQL. Ask afterwards, on the same connection.
INSERT INTO users (username) VALUES ('Alice');
SELECT LAST_INSERT_ID() AS new_id;
SELECT '--- expect a duplicate error next: same name, other case' AS note;
INSERT INTO users (username) VALUES ('alice');
SELECT '--- and next: accents are ignored too, so Jose collides with José' AS note;
INSERT INTO users (username) VALUES ('José');
INSERT INTO users (username) VALUES ('Jose');
SELECT username FROM users ORDER BY id;

-- 3. An upsert that stops at the stack limit. ON DUPLICATE KEY UPDATE has no WHERE,
--    so the condition goes inside the new value.
CREATE TABLE inventory (
  character_id INT NOT NULL,
  item_id INT NOT NULL,
  quantity INT NOT NULL CHECK (quantity BETWEEN 1 AND 9999),
  PRIMARY KEY (character_id, item_id)
);
INSERT INTO inventory VALUES (1, 1, 9998);
INSERT INTO inventory VALUES (1, 1, 5) AS new
  ON DUPLICATE KEY UPDATE quantity = IF(inventory.quantity + new.quantity <= 9999,
                                        inventory.quantity + new.quantity,
                                        inventory.quantity);
SELECT ROW_COUNT() AS rows_changed_0_means_refused;
SELECT quantity AS still_9998 FROM inventory;

-- 4. A partial index: MySQL has none, so this fails.
CREATE TABLE characters (id INT AUTO_INCREMENT PRIMARY KEY, score INT NOT NULL DEFAULT 0);
CREATE INDEX leaderboard ON characters (score DESC, id) WHERE score > 0;
SELECT '--- without the WHERE it works: descending indexes exist' AS note;
CREATE INDEX leaderboard ON characters (score DESC, id);

-- 5. A schema change inside a transaction: MySQL commits it at once.
START TRANSACTION;
CREATE TABLE half_done (x INT);
ROLLBACK;
SELECT COUNT(*) AS half_done_still_exists_1_means_yes
  FROM information_schema.tables
 WHERE table_schema = DATABASE() AND table_name = 'half_done';

-- 6. A row lock (same syntax as PostgreSQL), and a named lock.
START TRANSACTION;
SELECT id FROM users WHERE username = 'Alice' FOR UPDATE;
COMMIT;
SELECT GET_LOCK('migrations', 5) AS got_lock, RELEASE_LOCK('migrations') AS released;