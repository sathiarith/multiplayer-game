import "@testing-library/jest-dom/vitest"; // adds toBeInTheDocument() and friends
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AuthProvider } from "./auth.jsx";
import { SelectedCharacterProvider } from "./selection.jsx";

// Tells React that act() is in use, which silences a warning.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let unexpected = [];
beforeEach(() => {
  unexpected = [];
});
afterEach(() => {
  cleanup(); // removes whatever the test rendered
  vi.unstubAllGlobals();
  const problems = unexpected;
  unexpected = [];
  if (problems.length) {
    throw new Error(`Requests with no fake route: ${problems.join(", ")}`);
  }
});

export const alice = { id: 1, username: "alice" };

export const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

export const noContent = () => new Response(null, { status: 204 });

export const notLoggedIn = () =>
  json(401, { error: { code: "not_authenticated", message: "Please log in" } });

// Replaces fetch with a table of routes: { "POST /api/login": (body) => Response }.
// Each handler must be a function, because a Response can only be read once.
// Tests may change `routes` while they run.
export function fakeApi(routes) {
  const calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options = {}) => {
      const key = `${options.method ?? "GET"} ${url}`;
      const body = options.body ? JSON.parse(options.body) : undefined;
      calls.push({ key, body });
      const handler = routes[key];
      if (!handler) {
        unexpected.push(key);
        throw new Error(`No fake route for ${key}`);
      }
      return handler(body);
    }),
  );
  return {
    routes,
    calls,
    count: (key) => calls.filter((c) => c.key === key).length,
    bodiesOf: (key) => calls.filter((c) => c.key === key).map((c) => c.body),
  };
}

// Renders `ui` inside the same providers as the real app, at `route`.
export function renderApp(ui, { route = "/" } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <SelectedCharacterProvider>{ui}</SelectedCharacterProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}
