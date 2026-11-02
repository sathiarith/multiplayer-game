// @vitest-environment jsdom
import { StrictMode } from "react";
import { test, expect, vi } from "vitest";
import {
  renderHook,
  render,
  screen,
  waitFor,
  act,
} from "@testing-library/react";
import { AuthProvider, useAuth } from "./auth.jsx";
import { fakeApi, json, noContent, notLoggedIn, alice } from "./test-utils.jsx";

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

const serverError = () =>
  json(500, {
    error: { code: "internal_error", message: "Something went wrong" },
  });
const badLogin = () =>
  json(401, {
    error: {
      code: "invalid_credentials",
      message: "Invalid username or password",
    },
  });

function setup(routes, options = { wrapper }) {
  const api = fakeApi(routes);
  const hook = renderHook(() => useAuth(), options);
  return { api, ...hook };
}

test("it starts loading, then reports the logged-in user", async () => {
  const { result } = setup({ "GET /api/me": () => json(200, alice) });
  expect(result.current.status).toBe("loading");
  await waitFor(() => expect(result.current.status).toBe("authenticated"));
  expect(result.current.user).toEqual(alice);
});

test("a 401 from /api/me means anonymous, not an error", async () => {
  const { result } = setup({ "GET /api/me": notLoggedIn });
  await waitFor(() => expect(result.current.status).toBe("anonymous"));
  expect(result.current.user).toBeNull();
  expect(result.current.error).toBeNull();
});

test("a server error is reported, and retry asks again", async () => {
  const { api, result } = setup({ "GET /api/me": serverError });
  await waitFor(() => expect(result.current.status).toBe("error"));
  expect(result.current.error.code).toBe("internal_error");

  api.routes["GET /api/me"] = () => json(200, alice);
  act(() => result.current.retry());
  expect(result.current.status).toBe("loading");
  await waitFor(() => expect(result.current.status).toBe("authenticated"));
});

test("login stores the user and sends only the credentials", async () => {
  const { api, result } = setup({
    "GET /api/me": notLoggedIn,
    "POST /api/login": () => json(200, alice),
  });
  await waitFor(() => expect(result.current.status).toBe("anonymous"));

  await act(async () => {
    await result.current.login({
      username: "alice",
      password: "pw",
      isAdmin: true,
    });
  });

  expect(result.current.status).toBe("authenticated");
  expect(result.current.user).toEqual(alice);
  expect(api.bodiesOf("POST /api/login")).toEqual([
    { username: "alice", password: "pw" },
  ]);
});

test("a failed login rejects with the error and leaves the user logged out", async () => {
  const { result } = setup({
    "GET /api/me": notLoggedIn,
    "POST /api/login": badLogin,
  });
  await waitFor(() => expect(result.current.status).toBe("anonymous"));

  await expect(
    act(async () => {
      await result.current.login({ username: "alice", password: "wrong" });
    }),
  ).rejects.toMatchObject({ code: "invalid_credentials" });

  expect(result.current.status).toBe("anonymous");
});

test("register creates the account, then logs in", async () => {
  const { api, result } = setup({
    "GET /api/me": notLoggedIn,
    "POST /api/register": () => json(201, alice),
    "POST /api/login": () => json(200, alice),
  });
  await waitFor(() => expect(result.current.status).toBe("anonymous"));

  await act(async () => {
    await result.current.register({
      username: "alice",
      password: "correct-horse-battery",
    });
  });

  const posts = api.calls.map((c) => c.key).filter((k) => k.startsWith("POST"));
  expect(posts).toEqual(["POST /api/register", "POST /api/login"]);
  expect(result.current.status).toBe("authenticated");
});

test("when register fails, no login is attempted", async () => {
  const taken = () =>
    json(409, {
      error: { code: "username_taken", message: "That username is taken" },
    });
  const { api, result } = setup({
    "GET /api/me": notLoggedIn,
    "POST /api/register": taken,
  });
  await waitFor(() => expect(result.current.status).toBe("anonymous"));

  await expect(
    act(async () => {
      await result.current.register({
        username: "alice",
        password: "correct-horse-battery",
      });
    }),
  ).rejects.toMatchObject({ code: "username_taken" });

  expect(api.count("POST /api/login")).toBe(0);
  expect(result.current.status).toBe("anonymous");
});

test("logout ends the session", async () => {
  const { result } = setup({
    "GET /api/me": () => json(200, alice),
    "POST /api/logout": noContent,
  });
  await waitFor(() => expect(result.current.status).toBe("authenticated"));

  await act(async () => {
    await result.current.logout();
  });

  expect(result.current.status).toBe("anonymous");
  expect(result.current.user).toBeNull();
});

test("if logout fails, the user stays logged in and the error reaches the caller", async () => {
  const { result } = setup({
    "GET /api/me": () => json(200, alice),
    "POST /api/logout": serverError,
  });
  await waitFor(() => expect(result.current.status).toBe("authenticated"));

  await expect(
    act(async () => {
      await result.current.logout();
    }),
  ).rejects.toMatchObject({ code: "internal_error" });

  expect(result.current.status).toBe("authenticated");
});

test("a stale answer is ignored when StrictMode runs the effect twice", async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  fakeApi({
    "GET /api/me": async () => {
      calls += 1;
      if (calls === 1) {
        await gate; // the first request answers late, with "not logged in"
        return notLoggedIn();
      }
      return json(200, alice);
    },
  });

  function Probe() {
    const { status } = useAuth();
    return <p>{status}</p>;
  }
  render(
    <StrictMode>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </StrictMode>,
  );

  expect(await screen.findByText("authenticated")).toBeInTheDocument();
  await act(async () => {
    release();
    await gate;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(screen.getByText("authenticated")).toBeInTheDocument(); // the late 401 was discarded
  expect(calls).toBe(2); // StrictMode really did ask twice
});

test("useAuth outside the provider explains the mistake", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/);
  spy.mockRestore();
});
