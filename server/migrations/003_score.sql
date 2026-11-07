ALTER TABLE characters ADD COLUMN score INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_characters_score ON characters(score);