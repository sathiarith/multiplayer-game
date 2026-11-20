import { saveCharacterState } from "./characters.js";

export const SAVE_EVERY_MS = 30_000;

// Writes the world's positions, health, scores and progress to the database,
// but only for characters that changed since the last write.
export function createPersistence({
  db,
  world,
  ownerOf, // (characterId) => the owning user id, or undefined
  logger,
  onSaved, // optional: (characterId, savedState) => void | Promise, called after every write
  intervalMs = SAVE_EVERY_MS,
}) {
  const lastWritten = new Map(); // character id -> what was last written, as text
  const pending = new Set(); // writes still in flight, so a shutdown can wait for them
  const inFlight = new Map(); // character id -> the write in progress for it
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

  // Writes one character if it changed. Resolves to true if a row was written.
  // The state and the owner are read NOW, before anything waits: a player who
  // leaves is removed from the online list right after this call.
  // Writes for one character run one at a time, in order, so an older state
  // can never land after a newer one, and an unchanged one is not written twice.
  function save(id) {
    const state = world.get(id);
    const userId = ownerOf(id);
    if (!state || userId === undefined) return Promise.resolve(false);

    const print = fingerprint(state);
    if (lastWritten.get(id) === print) return Promise.resolve(false); // nothing new to write

    const previous = inFlight.get(id) ?? Promise.resolve();
    const write = previous.then(async () => {
      if (lastWritten.get(id) === print) return false; // the write before this one saved it already
      try {
        const written = await saveCharacterState(db, userId, id, state);
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
    });

    inFlight.set(id, write);
    pending.add(write);
    write.finally(() => {
      pending.delete(write);
      if (inFlight.get(id) === write) inFlight.delete(id);
    });
    return write;
  }

  // Saves everyone in the world. Resolves to how many rows were written.
  async function saveAll() {
    const results = await Promise.all(world.ids().map((id) => save(id)));
    return results.filter(Boolean).length;
  }

  return {
    save,
    saveAll,
    // Called when a player leaves, so a later join writes again.
    forget: (id) => lastWritten.delete(id),

    // Resolves once every write already started has finished.
    drain: () => Promise.all([...pending]),

    start() {
      if (timer) return; // never run two timers
      timer = setInterval(() => void saveAll(), intervalMs);
      timer.unref(); // never keeps the process alive on its own
    },

    stop() {
      clearInterval(timer);
      timer = null;
    },
  };
}
