import { useEffect, useState } from "react";

// My level and XP: from the character in the welcome, then from each kill.
// `notice` explains a level-up or a defeat.
export function useProgress(connection, character) {
  const [state, setState] = useState({
    level: character?.level ?? 1,
    xp: character?.xp ?? 0,
    notice: null,
  });

  useEffect(() => {
    if (character)
      setState((s) => ({ ...s, level: character.level, xp: character.xp }));
  }, [character]);

  useEffect(() => {
    if (!connection) return undefined;
    const offs = [
      connection.onProgress(({ level, xp, leveledUp }) =>
        setState({
          level,
          xp,
          notice: leveledUp
            ? `Level ${level}! Your health is full, and your hits are stronger.`
            : null,
        }),
      ),
      connection.onDied(({ by }) =>
        setState((s) => ({
          ...s,
          notice: `${by} defeated you. You're back at the start, with full health.`,
        })),
      ),
    ];
    return () => offs.forEach((off) => off());
  }, [connection]);

  return state;
}
