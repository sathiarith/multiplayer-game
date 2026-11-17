CREATE TABLE characters (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  class text NOT NULL DEFAULT 'warrior',
  level integer NOT NULL DEFAULT 1,
  hp integer NOT NULL DEFAULT 100,
  -- double precision, not real: Postgres's real keeps only about 6 digits.
  pos_x double precision NOT NULL DEFAULT 0,
  pos_y double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX characters_name_lower ON characters (lower(name));
-- Postgres does not index foreign keys by itself; listing a user's characters needs this.
CREATE INDEX idx_characters_user_id ON characters (user_id);