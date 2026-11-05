const MAX_SAMPLES = 30; // 1.5 seconds of history at 20 snapshots a second

// Other players are drawn this far in the past: two server ticks, so there are
// normally two snapshots to blend between.
export const INTERPOLATION_DELAY_MS = 100;

const noMove = () => ({ x: 0, y: 0 });

// `earlier` is the same player in the snapshot before, used for the movement
// (which the animation needs).
function withMove(player, x, y, earlier) {
  return {
    ...player,
    x,
    y,
    move: earlier
      ? { x: player.x - earlier.x, y: player.y - earlier.y }
      : noMove(),
  };
}

function hold(sample, before) {
  return [...sample.players.values()].map((p) =>
    withMove(p, p.x, p.y, before?.players.get(p.id)),
  );
}

function blend(from, to, t) {
  return [...to.players.values()].map((p) => {
    const f = from.players.get(p.id);
    // Someone new appears where they are, without sliding in from nowhere.
    if (!f) return withMove(p, p.x, p.y, undefined);
    return withMove(p, f.x + (p.x - f.x) * t, f.y + (p.y - f.y) * t, f);
  });
}

// Remembers recent snapshots with the time each one arrived, and answers
// "where was everyone at time t?"
export function createSnapshotBuffer() {
  const samples = []; // [{ at, players: Map(id -> player) }], oldest first

  return {
    push(at, players) {
      samples.push({ at, players: new Map(players.map((p) => [p.id, p])) });
      if (samples.length > MAX_SAMPLES) samples.shift();
    },

    get size() {
      return samples.length;
    },

    sample(at) {
      if (samples.length === 0) return [];
      const first = samples[0];
      const last = samples[samples.length - 1];
      if (at <= first.at) return hold(first, undefined);
      if (at >= last.at) return hold(last, samples[samples.length - 2]); // nothing newer: stay put
      const next = samples.findIndex((s) => s.at > at);
      const from = samples[next - 1];
      const to = samples[next];
      return blend(from, to, (at - from.at) / (to.at - from.at));
    },
  };
}
