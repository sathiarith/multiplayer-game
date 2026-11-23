-- SQL Server 2025: the same six things as postgres.sql.
-- Each GO ends a batch; an error stops only its own batch.
IF DB_ID('game') IS NULL CREATE DATABASE game;
GO
USE game;
SET QUOTED_IDENTIFIER ON; -- filtered indexes need this; sqlcmd leaves it off by default
GO
GO
DROP TABLE IF EXISTS inventory, characters, users, half_done;
GO

-- 1. Names unique whatever their case. The default collation,
--    SQL_Latin1_General_CP1_CI_AS, ignores case (CI) but not accents (AS).
CREATE TABLE users (
  id INT IDENTITY(1, 1) PRIMARY KEY,
  username NVARCHAR(100) NOT NULL UNIQUE
);
GO

-- 2. The new row back: OUTPUT instead of RETURNING.
INSERT INTO users (username) OUTPUT inserted.id, inserted.username VALUES (N'Alice');
GO
PRINT '--- expect a duplicate error next: same name, other case';
INSERT INTO users (username) VALUES (N'alice');
GO
PRINT '--- accents count: José and Jose are two different names';
INSERT INTO users (username) VALUES (N'José');
INSERT INTO users (username) VALUES (N'Jose');
SELECT username FROM users ORDER BY id;
GO

-- 3. An upsert that stops at the stack limit: MERGE, with HOLDLOCK so that two
--    at the same moment cannot both decide to insert.
CREATE TABLE inventory (
  character_id INT NOT NULL,
  item_id INT NOT NULL,
  quantity INT NOT NULL CHECK (quantity BETWEEN 1 AND 9999),
  PRIMARY KEY (character_id, item_id)
);
INSERT INTO inventory VALUES (1, 1, 9998);
GO
MERGE inventory WITH (HOLDLOCK) AS t
USING (VALUES (1, 1, 5)) AS s (character_id, item_id, quantity)
   ON t.character_id = s.character_id AND t.item_id = s.item_id
WHEN MATCHED AND t.quantity + s.quantity <= 9999 THEN
  UPDATE SET quantity = t.quantity + s.quantity
WHEN NOT MATCHED THEN
  INSERT (character_id, item_id, quantity) VALUES (s.character_id, s.item_id, s.quantity);
SELECT @@ROWCOUNT AS rows_changed_0_means_refused;
SELECT quantity AS still_9998 FROM inventory;
GO

-- 4. A filtered (partial) index: SQL Server has them.
CREATE TABLE characters (id INT IDENTITY(1, 1) PRIMARY KEY, score INT NOT NULL DEFAULT 0);
CREATE INDEX leaderboard ON characters (score DESC, id) WHERE score > 0;
PRINT '--- the filtered index was created';
GO

-- 5. A schema change inside a transaction, then ROLLBACK.
BEGIN TRANSACTION;
CREATE TABLE half_done (x INT);
ROLLBACK;
SELECT CASE WHEN OBJECT_ID('half_done') IS NULL THEN 'half_done is gone'
            ELSE 'half_done still exists' END AS result;
GO

-- 6. A row lock, by table hint, and an application (named) lock.
BEGIN TRANSACTION;
SELECT id FROM users WITH (UPDLOCK, ROWLOCK) WHERE username = N'Alice';
DECLARE @result INT;
EXEC @result = sp_getapplock @Resource = 'migrations', @LockMode = 'Exclusive',
                             @LockOwner = 'Transaction', @LockTimeout = 5000;
SELECT @result AS got_lock_0_means_granted;
COMMIT;
GO