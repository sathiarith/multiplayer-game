import { useCallback, useEffect, useState } from "react";
import * as api from "./api.js";
import { useAuth } from "./auth.jsx";

export function useCharacters() {
  const { user } = useAuth();
  const userId = user?.id;
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

  // Load again whenever the logged-in user changes (for example after a login
  // in another tab), and never show one user's list under another user's name.
  useEffect(() => {
    let current = true;
    setState({ status: "loading", characters: [], error: null });
    load(() => current);
    return () => {
      current = false;
    };
  }, [load, userId]);

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
