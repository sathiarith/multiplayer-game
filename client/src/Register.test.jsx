// @vitest-environment jsdom
import { test, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App.jsx";
import { renderApp, fakeApi, json, notLoggedIn, alice } from "./test-utils.jsx";

const USERNAME_RULE = "3 to 20 characters: letters, numbers, underscore";

async function fillIn(user, username, password) {
  await user.type(await screen.findByLabelText("Username"), username);
  await user.type(screen.getByLabelText("Password"), password);
}

test("a rule is only shown once the user has left the field", async () => {
  const user = userEvent.setup();
  fakeApi({ "GET /api/me": notLoggedIn });
  renderApp(<App />, { route: "/register" });

  await user.type(await screen.findByLabelText("Username"), "ab");
  expect(screen.queryByText(USERNAME_RULE)).not.toBeInTheDocument(); // still typing

  await user.tab(); // leave the field
  expect(screen.getByText(USERNAME_RULE)).toBeInTheDocument();
  expect(screen.getByLabelText("Username")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});

test("submitting invalid input shows every problem and sends nothing", async () => {
  const user = userEvent.setup();
  const api = fakeApi({ "GET /api/me": notLoggedIn });
  renderApp(<App />, { route: "/register" });

  await user.click(await screen.findByRole("button", { name: "Register" }));

  expect(screen.getByText(USERNAME_RULE)).toBeInTheDocument();
  expect(screen.getByText("At least 10 characters")).toBeInTheDocument();
  expect(api.count("POST /api/register")).toBe(0);
});

test("a taken username is reported", async () => {
  const user = userEvent.setup();
  fakeApi({
    "GET /api/me": notLoggedIn,
    "POST /api/register": () =>
      json(409, { error: { code: "username_taken", message: "taken" } }),
  });
  renderApp(<App />, { route: "/register" });

  await fillIn(user, "alice_01", "correct-horse-battery");
  await user.click(screen.getByRole("button", { name: "Register" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "That username is already taken.",
  );
});

test("a field message from the server appears next to the field", async () => {
  const user = userEvent.setup();
  const body = {
    error: {
      code: "invalid_input",
      message: "Invalid input",
      fields: { username: "server says no" },
    },
  };
  fakeApi({
    "GET /api/me": notLoggedIn,
    "POST /api/register": () => json(400, body),
  });
  renderApp(<App />, { route: "/register" });

  await fillIn(user, "alice_01", "correct-horse-battery");
  await user.click(screen.getByRole("button", { name: "Register" }));

  expect(await screen.findByText("server says no")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Please fix the highlighted fields.",
  );
});

test("registering logs the new user in and shows the characters page", async () => {
  const user = userEvent.setup();
  const api = fakeApi({
    "GET /api/me": notLoggedIn,
    "POST /api/register": () => json(201, alice),
    "POST /api/login": () => json(200, alice),
    "GET /api/characters": () => json(200, []),
  });
  renderApp(<App />, { route: "/register" });

  await fillIn(user, "alice_01", "correct-horse-battery");
  await user.click(screen.getByRole("button", { name: "Register" }));

  expect(
    await screen.findByRole("heading", { name: "Your characters" }),
  ).toBeInTheDocument();
  const posts = api.calls.map((c) => c.key).filter((k) => k.startsWith("POST"));
  expect(posts).toEqual(["POST /api/register", "POST /api/login"]);
});
