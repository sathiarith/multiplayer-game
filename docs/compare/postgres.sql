-- PostgreSQL 18: how our real schema does it, for comparison.

-- 1. Names unique whatever their case: an index on lower(username).
CREATE TABLE users (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username text NOT NULL
);
CREATE UNIQUE INDEX users_username_lower ON users (lower(username));

-- 2. The new row back: RETURNING.
INSERT INTO users (username) VALUES ('Alice') RETURNING id, username;
\echo '--- expect a duplicate error next: same name, other case'
INSERT INTO users (username) VALUES ('alice');
\echo '--- accents count: José and Jose are two different names'
INSERT INTO users (username) VALUES ('José'), ('Jose');
SELECT username FROM users ORDER BY id;

-- 3. An upsert that stops at the stack limit: ON CONFLICT ... WHERE.
CREATE TABLE inventory (
  character_id integer NOT NULL,
  item_id integer NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 9999),
  PRIMARY KEY (character_id, item_id)
);
INSERT INTO inventory VALUES (1, 1, 9998);
INSERT INTO inventory VALUES (1, 1, 5)
  ON CONFLICT (character_id, item_id) DO UPDATE
    SET quantity = inventory.quantity + excluded.quantity
    WHERE inventory.quantity + excluded.quantity <= 9999
  RETURNING quantity;
\echo '--- no row returned above means the add was refused'
SELECT quantity AS still_9998 FROM inventory;

-- 4. A partial index.
CREATE TABLE characters (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, score integer NOT NULL DEFAULT 0);
CREATE INDEX leaderboard ON characters (score DESC, id) WHERE score > 0;
\echo '--- the partial index was created'

-- 5. A schema change inside a transaction, then ROLLBACK.
BEGIN;
CREATE TABLE half_done (x integer);
ROLLBACK;
SELECT to_regclass('half_done') IS NULL AS half_done_is_gone;

-- 6. A row lock, and a named (advisory) lock.
BEGIN;
SELECT id FROM users WHERE username = 'Alice' FOR UPDATE;
COMMIT;
SELECT pg_try_advisory_lock(8000001) AS got_lock, pg_advisory_unlock(8000001) AS released;