DROP INDEX idx_characters_leaderboard;
CREATE INDEX idx_characters_score ON characters (score);