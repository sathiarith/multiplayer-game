-- The leaderboard asks for the highest scores, ties broken by the lower id,
-- and only for characters that have scored. An index in exactly that order,
-- holding only those rows, lets PostgreSQL read the top ten straight off it.
DROP INDEX idx_characters_score;
CREATE INDEX idx_characters_leaderboard ON characters (score DESC, id ASC) WHERE score > 0;