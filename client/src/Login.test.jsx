// @vitest-environment jsdom
import { test, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App.jsx";
import { renderApp, fakeApi, json, notLoggedIn, alice } from "./test-utils.jsx";

const rejectLogin = (status, code, headers) => () =>
  json(status, { error: { code, message: code } }, headers);

async function fillIn(user, username, password) {
  await user.type(await screen.findByLabelText("Username"), username);
  await user.type(screen.getByLabelText("Password"), password);
}

test("empty fields show messages and send nothing", async () => {
  const user = userEvent.setup();
  const api = fakeApi({ "GET /api/me": notLoggedIn });
  renderApp(<App />, { route: "/login" });

  await user.click(await screen.findByRole("button", { name: "Log in" }));

  expect(screen.getByText("Enter your username")).toBeInTheDocument();
  expect(screen.getByText("Enter your password")).toBeInTheDocument();
  expect(screen.getByLabelText("Username")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(api.count("POST /api/login")).toBe(0);
});

test("a successful login sends only the credentials and shows the characters page", async () => {
  const user = userEvent.setup();
  const api = fakeApi({
    "GET /api/me": notLoggedIn,
    "POST /api/login": () => json(200, alice),
    "GET /api/characters": () => json(200, []),
  });
  renderApp(<App />, { route: "/login" });

  await fillIn(user, "alice", "correct-horse-battery");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  expect(
    await screen.findByRole("heading", { name: "Your characters" }),
  ).toBeInTheDocument();
  expect(api.bodiesOf("POST /api/login")).toEqual([
    { username: "alice", password: "correct-horse-battery" },
  ]);
});

test("wrong credentials show a message, keep the form, and allow another try", async () => {
  const user = userEvent.setup();
  fakeApi({
    "GET /api/me": notLoggedIn,
    "POST /api/login": rejectLogin(401, "invalid_credentials"),
  });
  renderApp(<App />, { route: "/login" });

  await fillIn(user, "alice", "wrong-password");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Wrong username or password.",
  );
  expect(screen.getByRole("heading", { name: "Log in" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();
  expect(screen.getByLabelText("Username")).toHaveValue("alice"); // typing is kept
});

test("being rate limited says how long to wait", async () => {
  const user = userEvent.setup();
  fakeApi({
    "GET /api/me": notLoggedIn,
    "POST /api/login": rejectLogin(429, "rate_limited", {
      "Retry-After": "30",
    }),
  });
  renderApp(<App />, { route: "/login" });

  await fillIn(user, "alice", "whatever-password");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Try again in 30 seconds.",
  );
});

test("an unreachable server is reported as such", async () => {
  const user = userEvent.setup();
  fakeApi({
    "GET /api/me": notLoggedIn,
    "POST /api/login": () => new Response("", { status: 502 }), // what the dev proxy sends
  });
  renderApp(<App />, { route: "/login" });

  await fillIn(user, "alice", "whatever-password");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    /cannot reach the server/i,
  );
});

test("while the request is running the button is disabled and a second click sends nothing", async () => {
  const user = userEvent.setup();
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const api = fakeApi({
    "GET /api/me": notLoggedIn,
    "POST /api/login": async () => {
      await gate;
      return json(200, alice);
    },
    "GET /api/characters": () => json(200, []),
  });
  renderApp(<App />, { route: "/login" });

  await fillIn(user, "alice", "correct-horse-battery");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  const pending = await screen.findByRole("button", { name: /logging in/i });
  expect(pending).toBeDisabled();
  await user.click(pending);
  expect(api.count("POST /api/login")).toBe(1);

  release();
  expect(
    await screen.findByRole("heading", { name: "Your characters" }),
  ).toBeInTheDocument();
});

test("a visitor who is already logged in is sent away from the login page", async () => {
  fakeApi({
    "GET /api/me": () => json(200, alice),
    "GET /api/characters": () => json(200, []),
  });
  renderApp(<App />, { route: "/login" });

  expect(
    await screen.findByRole("heading", { name: "Your characters" }),
  ).toBeInTheDocument();
});
