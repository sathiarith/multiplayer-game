-- What kinds of items exist. Rows are data: a new item is a new row, not new code.
CREATE TABLE items (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT ''
);

-- What each character carries: one row per character and item, so a stack is
-- a quantity, never several rows.
CREATE TABLE inventory (
  character_id integer NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item_id integer NOT NULL REFERENCES items(id),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 9999),
  PRIMARY KEY (character_id, item_id)
);

INSERT INTO items (code, name, description) VALUES
  ('gold_coin', 'Gold coin', 'Shiny. Traders will want these.'),
  ('meat', 'Meat', 'Will restore health once there is combat.'),
  ('wood', 'Wood', 'Good for building, one day.');