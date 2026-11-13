import { saveCharacterState } from "./characters.js";

export const SAVE_EVERY_MS = 30_000;

// Writes the world's positions, health and scores to the database, but only
// for characters that changed since the last write.
export function createPersistence({
  db,
  world,
  ownerOf, // (characterId) => the owning user id, or undefined
  logger,
  onSaved, // optional: (characterId, savedState) => void | Promise, called after every write
  intervalMs = SAVE_EVERY_MS,
}) {
  const lastWritten = new Map(); // character id -> what was last written, as text
  const fingerprint = (s) =>
    `${s.x}|${s.y}|${s.hp}|${s.score}|${s.level}|${s.xp}`;
  let timer = null;

  // Tells the listener about a write. Its failure is logged and never stops a save.
  function announce(id, state) {
    const failed = (err) =>
      logger.error(
        { err, characterId: id },
        "could not update the leaderboard",
      );
    try {
      Promise.resolve(onSaved?.(id, state)).catch(failed);
    } catch (err) {
      failed(err);
    }
  }

  // Writes one character if it changed. Returns true if a row was written.
  function save(id) {
    const state = world.get(id);
    const userId = ownerOf(id);
    if (!state || userId === undefined) return false;

    const print = fingerprint(state);
    if (lastWritten.get(id) === print) return false; // nothing new to write

    try {
      const written = saveCharacterState(db, userId, id, state);
      if (written) {
        lastWritten.set(id, print);
        announce(id, state);
      }
      return written;
    } catch (err) {
      // Keep playing: the next save tries again.
      logger.error({ err, characterId: id }, "could not save character");
      return false;
    }
  }

  // Saves everyone in the world. Returns how many rows were written.
  function saveAll() {
    let written = 0;
    for (const id of world.ids()) if (save(id)) written += 1;
    return written;
  }

  return {
    save,
    saveAll,
    // Called when a player leaves, so a later join writes again.
    forget: (id) => lastWritten.delete(id),

    start() {
      if (timer) return; // never run two timers
      timer = setInterval(saveAll, intervalMs);
      timer.unref(); // never keeps the process alive on its own
    },

    stop() {
      clearInterval(timer);
      timer = null;
    },
  };
}
