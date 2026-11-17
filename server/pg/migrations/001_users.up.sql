-- Accounts. Usernames are unique whatever their case ("Alice" and "alice" are the
-- same account), enforced by an index on lower(username); the name keeps its case.
CREATE TABLE users (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_username_lower ON users (lower(username));