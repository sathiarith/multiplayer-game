import { useCallback, useEffect, useState } from "react";
import { connectToGame } from "./game/connection.js";

export function useGameConnection(characterId, { io } = {}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: "connecting" });

  useEffect(() => {
    if (characterId == null) return undefined; // nothing chosen, nothing to connect
    const connection = connectToGame({ characterId, onChange: setState, io });
    // Cleanup: runs when the page is left, when the character changes, when
    // the user asks to reconnect, and in development before StrictMode's
    // second run.
    return () => connection.close();
  }, [characterId, attempt, io]);

  // Changing `attempt` re-runs the effect, which closes the old connection
  // and opens a new one.
  const reconnect = useCallback(() => setAttempt((n) => n + 1), []);

  return { ...(characterId == null ? { status: "idle" } : state), reconnect };
}
