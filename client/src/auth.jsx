import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as api from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    status: "loading",
    user: null,
    error: null,
  });

  // Asks the server who we are. `isCurrent` lets an effect that has been
  // cleaned up discard its answer.
  const refresh = useCallback(async (isCurrent = () => true) => {
    try {
      const user = await api.me();
      if (isCurrent()) setState({ status: "authenticated", user, error: null });
    } catch (err) {
      if (!isCurrent()) return;
      if (err.status === 401)
        setState({ status: "anonymous", user: null, error: null });
      else setState({ status: "error", user: null, error: err });
    }
  }, []);

  useEffect(() => {
    let current = true;
    refresh(() => current);
    return () => {
      current = false;
    };
  }, [refresh]);

  const retry = useCallback(() => {
    setState({ status: "loading", user: null, error: null });
    refresh();
  }, [refresh]);

  const login = useCallback(async ({ username, password }) => {
    const user = await api.login({ username, password });
    setState({ status: "authenticated", user, error: null });
    return user;
  }, []);

  const register = useCallback(
    async ({ username, password }) => {
      await api.register({ username, password });
      return login({ username, password });
    },
    [login],
  );

  const logout = useCallback(async () => {
    await api.logout();
    setState({ status: "anonymous", user: null, error: null });
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
