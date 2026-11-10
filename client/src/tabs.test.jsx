// @vitest-environment jsdom
import { test, expect } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "./auth.jsx";
import { useCharacters } from "./useCharacters.js";
import { fakeApi, json, notLoggedIn, alice } from "./test-utils.jsx";

const bob = { id: 2, username: "bobby" };

// A pretend BroadcastChannel: what one channel posts reaches every other open one.
function fakeBus() {
  const channels = new Set();
  return {
    create: () => {
      const channel = {
        onmessage: null,
        postMessage: (data) => {
          for (const other of channels)
            if (other !== channel) other.onmessage?.({ data });
        },
        close: () => channels.delete(channel),
      };
      channels.add(channel);
      return channel;
    },
  };
}

// Collects each tab's "returned to the tab" callback, so a test can play it.
function fakeReturns() {
  const checks = [];
  return {
    checks,
    watch: ({ onCheck }) => {
      checks.push(onCheck);
      return () => {};
    },
    comeBack: (i = 0) =>
      act(async () => {
        await checks[i]();
      }),
  };
}

// One server for every tab. `state.me` is who the shared cookie belongs to.
function fakeServer() {
  const state = { me: alice, fail: false, slow: null };
  fakeApi({
    "GET /api/me": async () => {
      if (state.slow) await state.slow;
      if (state.fail)
        return json(500, {
          error: { code: "internal_error", message: "Boom" },
        });
      return state.me ? json(200, state.me) : notLoggedIn();
    },
    "POST /api/login": () => {
      state.me = bob;
      return json(200, bob);
    },
    "POST /api/logout": () => {
      state.me = null;
      return new Response(null, { status: 204 });
    },
    "GET /api/characters": () =>
      json(200, [
        {
          id: state.me?.id === bob.id ? 20 : 10,
          name: state.me?.id === bob.id ? "Borin" : "Aria",
        },
      ]),
  });
  return state;
}

function Who({ tab, log }) {
  const { status, user, login, logout } = useAuth();
  log?.push(user);
  return (
    <div>
      <p data-testid={tab}>
        {status}:{user?.username ?? "nobody"}
      </p>
      <button
        onClick={() => login({ username: "bobby", password: "irrelevant" })}
      >
        log in {tab}
      </button>
      <button onClick={() => logout()}>log out {tab}</button>
    </div>
  );
}

function Tab({ name, bus, returns, children }) {
  return (
    <AuthProvider createChannel={bus.create} watchReturn={returns.watch}>
      {children ?? <Who tab={name} />}
    </AuthProvider>
  );
}

const shows = (tab, text) =>
  waitFor(() => expect(screen.getByTestId(tab)).toHaveTextContent(text));

test("a login in one tab shows the new user in the other", async () => {
  const user = userEvent.setup();
  fakeServer();
  const bus = fakeBus();
  const returns = fakeReturns();
  render(
    <>
      <Tab name="A" bus={bus} returns={returns} />
      <Tab name="B" bus={bus} returns={returns} />
    </>,
  );
  await shows("A", "authenticated:alice");
  await shows("B", "authenticated:alice");

  await user.click(screen.getByRole("button", { name: "log in B" }));

  await shows("B", "authenticated:bobby");
  await shows("A", "authenticated:bobby");
});

test("a logout in one tab sends the other to logged out", async () => {
  const user = userEvent.setup();
  fakeServer();
  const bus = fakeBus();
  const returns = fakeReturns();
  render(
    <>
      <Tab name="A" bus={bus} returns={returns} />
      <Tab name="B" bus={bus} returns={returns} />
    </>,
  );
  await shows("B", "authenticated:alice");

  await user.click(screen.getByRole("button", { name: "log out A" }));

  await shows("B", "anonymous:nobody");
});

test("returning to a tab picks up a change it missed", async () => {
  const server = fakeServer();
  const returns = fakeReturns();
  render(<Tab name="A" bus={fakeBus()} returns={returns} />);
  await shows("A", "authenticated:alice");

  server.me = bob; // changed somewhere this tab did not hear about
  await returns.comeBack();
  await shows("A", "authenticated:bobby");

  server.me = null;
  await returns.comeBack();
  await shows("A", "anonymous:nobody");
});

test("a quiet check that fails keeps the current user", async () => {
  const server = fakeServer();
  const returns = fakeReturns();
  render(<Tab name="A" bus={fakeBus()} returns={returns} />);
  await shows("A", "authenticated:alice");

  server.fail = true;
  await returns.comeBack();

  expect(screen.getByTestId("A")).toHaveTextContent("authenticated:alice");
});

test("the same user answering again changes nothing", async () => {
  fakeServer();
  const returns = fakeReturns();
  const log = [];
  render(
    <Tab name="A" bus={fakeBus()} returns={returns}>
      <Who tab="A" log={log} />
    </Tab>,
  );
  await shows("A", "authenticated:alice");
  const renders = log.length;

  await returns.comeBack();

  expect(log.length).toBe(renders); // no re-render at all
});

test("an older answer never undoes a newer login", async () => {
  const user = userEvent.setup();
  const server = fakeServer();
  const returns = fakeReturns();
  render(<Tab name="A" bus={fakeBus()} returns={returns} />);
  await shows("A", "authenticated:alice");

  let release;
  server.slow = new Promise((resolve) => (release = resolve));
  let pending;
  act(() => {
    pending = returns.checks[0](); // a check that will answer late, as Alice
  });
  server.slow = null;
  await user.click(screen.getByRole("button", { name: "log in A" })); // now Bob

  server.me = alice; // the late answer will say Alice
  release();
  await act(async () => {
    await pending;
  });

  expect(screen.getByTestId("A")).toHaveTextContent("authenticated:bobby");
});

test("the character list reloads when the user changes", async () => {
  const server = fakeServer();
  const returns = fakeReturns();
  function List() {
    const { status, characters } = useCharacters();
    return (
      <p data-testid="list">
        {status}:{characters.map((c) => c.name).join(",")}
      </p>
    );
  }
  render(
    <Tab name="A" bus={fakeBus()} returns={returns}>
      <List />
    </Tab>,
  );
  await waitFor(() =>
    expect(screen.getByTestId("list")).toHaveTextContent("ready:Aria"),
  );

  server.me = bob;
  await returns.comeBack();

  await waitFor(() =>
    expect(screen.getByTestId("list")).toHaveTextContent("ready:Borin"),
  );
});
