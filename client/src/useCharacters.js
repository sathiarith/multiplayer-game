import { useCallback, useEffect, useState } from "react";
import * as api from "./api.js";

export function useCharacters() {
  const [state, setState] = useState({
    status: "loading",
    characters: [],
    error: null,
  });

  // `isCurrent` lets an effect that has been cleaned up discard its answer.
  const load = useCallback(async (isCurrent = () => true) => {
    try {
      const characters = await api.listCharacters();
      if (isCurrent()) setState({ status: "ready", characters, error: null });
    } catch (error) {
      if (isCurrent()) setState({ status: "error", characters: [], error });
    }
  }, []);

  useEffect(() => {
    let current = true;
    load(() => current);
    return () => {
      current = false;
    };
  }, [load]);

  const reload = useCallback(() => {
    setState({ status: "loading", characters: [], error: null });
    load();
  }, [load]);

  const create = useCallback(async (input) => {
    const character = await api.createCharacter(input);
    // Build a new array from the latest state; never change the old one.
    setState((s) => ({ ...s, characters: [...s.characters, character] }));
    return character;
  }, []);

  return { ...state, reload, create };
}
