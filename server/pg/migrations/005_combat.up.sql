-- Experience, earned in combat.
ALTER TABLE characters ADD COLUMN xp integer NOT NULL DEFAULT 0;

-- How much XP each level needs, and the health that comes with it. Data, not
-- code: balancing the game means changing these rows, not the program.
CREATE TABLE levels (
  level integer PRIMARY KEY CHECK (level >= 1),
  xp_required integer NOT NULL UNIQUE CHECK (xp_required >= 0),
  max_hp integer NOT NULL CHECK (max_hp > 0)
);

INSERT INTO levels (level, xp_required, max_hp) VALUES
  (1, 0, 100),
  (2, 50, 120),
  (3, 150, 140),
  (4, 300, 160),
  (5, 500, 180),
  (6, 750, 200),
  (7, 1050, 220),
  (8, 1400, 240),
  (9, 1800, 260),
  (10, 2250, 280);