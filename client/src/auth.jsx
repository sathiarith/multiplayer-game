import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as api from "./api.js";
import { createSessionSync, watchTabReturn } from "./sessionSync.js";

const AuthContext = createContext(null);

const sameUser = (a, b) => a?.id === b?.id && a?.username === b?.username;

// `createChannel` and `watchReturn` are for tests. By default the tabs talk
// over a BroadcastChannel, and a tab checks again when the user comes back to it.
export function AuthProvider({
  children,
  createChannel,
  watchReturn = watchTabReturn,
}) {
  const [state, setState] = useState({
    status: "loading",
    user: null,
    error: null,
  });

  // Every change to who we are takes a number, and only the newest may write
  // the state, so an older /api/me answer can never undo a newer login.
  const latest = useRef(0);
  const sync = useRef(null);

  // Asks the server who we are. A quiet check (after another tab's message, or
  // on returning to this tab) never shows an error once we have an answer:
  // a network blip or a server error must not log anyone out.
  const ask = useCallback(async ({ quiet }) => {
    const ticket = ++latest.current;
    try {
      const user = await api.me();
      if (ticket !== latest.current) return; // a newer request or change won
      setState((s) =>
        s.status === "authenticated" && sameUser(s.user, user)
          ? s // the same user: keep the same object, so nothing re-renders
          : { status: "authenticated", user, error: null },
      );
    } catch (err) {
      if (ticket !== latest.current) return;
      if (err.status === 401) {
        setState((s) =>
          s.status === "anonymous"
            ? s
            : { status: "anonymous", user: null, error: null },
        );
      } else {
        setState((s) =>
          quiet && s.status !== "loading"
            ? s
            : { status: "error", user: null, error: err },
        );
      }
    }
  }, []);

  // The first answer. Under StrictMode this runs twice, and the numbering
  // makes sure only the second request's answer is used.
  useEffect(() => {
    ask({ quiet: false });
  }, [ask]);

  // Listen to the other tabs, and check again when the user returns to this one.
  useEffect(() => {
    const quietCheck = () => ask({ quiet: true });
    sync.current = createSessionSync({ onSignal: quietCheck, createChannel });
    const stopWatching = watchReturn({ onCheck: quietCheck });
    return () => {
      stopWatching();
      sync.current.close();
      sync.current = null;
    };
  }, [ask, createChannel, watchReturn]);

  const retry = useCallback(() => {
    setState({ status: "loading", user: null, error: null });
    ask({ quiet: false });
  }, [ask]);

  const login = useCallback(async ({ username, password }) => {
    const user = await api.login({ username, password });
    latest.current += 1; // any check still on its way is now out of date
    setState({ status: "authenticated", user, error: null });
    sync.current?.announce();
    return user;
  }, []);

  const register = useCallback(
    async ({ username, password }) => {
      await api.register({ username, password });
      return login({ username, password }); // announces through login
    },
    [login],
  );

  const logout = useCallback(async () => {
    await api.logout();
    latest.current += 1;
    setState({ status: "anonymous", user: null, error: null });
    sync.current?.announce();
  }, []);

  const value = useMemo(
    () => ({ ...state, login, register, logout, retry }),
    [state, login, register, logout, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
