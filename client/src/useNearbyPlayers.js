import { useEffect, useState } from "react";

// The other players within `range` of me, from the snapshots: [{ id, name }].
// It re-renders only when the group of nearby players changes.
export function useNearbyPlayers(connection, you, range) {
  const [nearby, setNearby] = useState([]);

  useEffect(() => {
    if (!connection) {
      setNearby([]);
      return undefined;
    }
    let key = "";
    return connection.onSnapshot(({ players }) => {
      const me = players.find((p) => p.id === you);
      const list = me
        ? players
            .filter(
              (p) =>
                p.id !== you && Math.hypot(p.x - me.x, p.y - me.y) <= range,
            )
            .map(({ id, name }) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [];
      const next = list.map((p) => `${p.id}:${p.name}`).join("|");
      if (next !== key) {
        key = next;
        setNearby(list);
      }
    });
  }, [connection, you, range]);

  return nearby;
}
