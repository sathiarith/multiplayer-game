// @vitest-environment jsdom
import { test, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App.jsx";
import {
  renderApp,
  fakeApi,
  json,
  noContent,
  notLoggedIn,
  alice,
} from "./test-utils.jsx";

test("a visitor who is not logged in is sent to the login page", async () => {
  fakeApi({ "GET /api/me": notLoggedIn });
  renderApp(<App />, { route: "/characters" });

  expect(
    await screen.findByRole("heading", { name: "Log in" }),
  ).toBeInTheDocument();
});

test("a spinner shows while the server is asked who the user is", async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  fakeApi({
    "GET /api/me": async () => {
      await gate;
      return notLoggedIn();
    },
  });
  renderApp(<App />, { route: "/characters" });

  expect(screen.getByRole("status")).toBeInTheDocument();
  release();
  expect(
    await screen.findByRole("heading", { name: "Log in" }),
  ).toBeInTheDocument();
});

test("when the server cannot be reached, the page offers a retry", async () => {
  const user = userEvent.setup();
  const api = fakeApi({
    "GET /api/me": () => new Response("", { status: 502 }),
    "GET /api/characters": () => json(200, []),
  });
  renderApp(<App />, { route: "/characters" });

  expect(await screen.findByRole("alert")).toHaveTextContent(
    /cannot reach the server/i,
  );

  api.routes["GET /api/me"] = () => json(200, alice); // the server came back
  await user.click(screen.getByRole("button", { name: "Try again" }));

  expect(
    await screen.findByRole("heading", { name: "Your characters" }),
  ).toBeInTheDocument();
});

test("logging out sends the user to the login page", async () => {
  const user = userEvent.setup();
  fakeApi({
    "GET /api/me": () => json(200, alice),
    "GET /api/characters": () => json(200, []),
    "POST /api/logout": noContent,
  });
  renderApp(<App />, { route: "/characters" });

  await user.click(await screen.findByRole("button", { name: "Log out" }));

  expect(
    await screen.findByRole("heading", { name: "Log in" }),
  ).toBeInTheDocument();
});
