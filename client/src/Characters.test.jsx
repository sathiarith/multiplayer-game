// @vitest-environment jsdom
import { test, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App.jsx";
import { renderApp, fakeApi, json, notLoggedIn, alice } from "./test-utils.jsx";

// jsdom cannot draw on a canvas or load images, so the game is replaced by a stub.
vi.mock("./components/GameCanvas.jsx", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ character }) =>
      createElement("div", null, `game for ${character.name}`),
  };
});

const aria = {
  id: 1,
  name: "Aria",
  class: "warrior",
  level: 1,
  hp: 100,
  x: 100,
  y: 60,
};
const borin = { ...aria, id: 2, name: "Borin" };
const corin = { ...aria, id: 3, name: "Corin" };
const apiError = (status, code) => () =>
  json(status, { error: { code, message: code } });

function signedIn(extra) {
  return fakeApi({ "GET /api/me": () => json(200, alice), ...extra });
}

test("it lists the user's characters", async () => {
  signedIn({ "GET /api/characters": () => json(200, [aria, borin]) });
  renderApp(<App />, { route: "/characters" });

  expect(await screen.findByText("Aria")).toBeInTheDocument();
  expect(screen.getByText("Borin")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Play" })).toHaveLength(2);
});

test("with no characters it says so and shows the form", async () => {
  signedIn({ "GET /api/characters": () => json(200, []) });
  renderApp(<App />, { route: "/characters" });

  expect(await screen.findByText(/no characters yet/i)).toBeInTheDocument();
  expect(screen.getByLabelText("Character name")).toBeInTheDocument();
});

test("a new character appears in the list without loading the list again", async () => {
  const user = userEvent.setup();
  const api = signedIn({
    "GET /api/characters": () => json(200, []),
    "POST /api/characters": (body) =>
      json(201, { ...aria, id: 5, name: body.name }),
  });
  renderApp(<App />, { route: "/characters" });

  await user.type(await screen.findByLabelText("Character name"), "Aria");
  await user.click(screen.getByRole("button", { name: "Create character" }));

  expect(await screen.findByText("Aria")).toBeInTheDocument();
  expect(screen.getByLabelText("Character name")).toHaveValue("");
  expect(api.bodiesOf("POST /api/characters")).toEqual([{ name: "Aria" }]);
  expect(api.count("GET /api/characters")).toBe(1);
});

test("an invalid name is refused before anything is sent", async () => {
  const user = userEvent.setup();
  const api = signedIn({ "GET /api/characters": () => json(200, []) });
  renderApp(<App />, { route: "/characters" });

  await user.type(await screen.findByLabelText("Character name"), "ab");
  await user.click(screen.getByRole("button", { name: "Create character" }));

  expect(
    screen.getByText("3 to 16 characters: letters, numbers, underscore"),
  ).toBeInTheDocument();
  expect(api.count("POST /api/characters")).toBe(0);
});

test("at the limit the form is replaced by an explanation", async () => {
  signedIn({ "GET /api/characters": () => json(200, [aria, borin, corin]) });
  renderApp(<App />, { route: "/characters" });

  expect(await screen.findByText(/3 of 3 characters/)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Create character" }),
  ).not.toBeInTheDocument();
});

test("the server's limit wins when the page is out of date", async () => {
  const user = userEvent.setup();
  signedIn({
    "GET /api/characters": () => json(200, []),
    "POST /api/characters": apiError(409, "character_limit"),
  });
  renderApp(<App />, { route: "/characters" });

  await user.type(await screen.findByLabelText("Character name"), "Aria");
  await user.click(screen.getByRole("button", { name: "Create character" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "You already have the maximum number of characters.",
  );
});

test("a taken name is shown next to the field, not as a banner", async () => {
  const user = userEvent.setup();
  signedIn({
    "GET /api/characters": () => json(200, []),
    "POST /api/characters": apiError(409, "name_taken"),
  });
  renderApp(<App />, { route: "/characters" });

  await user.type(await screen.findByLabelText("Character name"), "Aria");
  await user.click(screen.getByRole("button", { name: "Create character" }));

  expect(
    await screen.findByText("That character name is already taken."),
  ).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Character name")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});

test("a failed load offers a retry that loads the list", async () => {
  const user = userEvent.setup();
  const api = signedIn({
    "GET /api/characters": apiError(500, "internal_error"),
  });
  renderApp(<App />, { route: "/characters" });

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Something went wrong on the server.",
  );

  api.routes["GET /api/characters"] = () => json(200, [aria]);
  await user.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText("Aria")).toBeInTheDocument();
});

test("when the session has ended, the page ends up at login", async () => {
  let meCalls = 0;
  fakeApi({
    "GET /api/me": () => (++meCalls === 1 ? json(200, alice) : notLoggedIn()),
    "GET /api/characters": apiError(401, "not_authenticated"),
  });
  renderApp(<App />, { route: "/characters" });

  expect(
    await screen.findByRole("heading", { name: "Log in" }),
  ).toBeInTheDocument();
});

test("choosing a character opens the game for it", async () => {
  const user = userEvent.setup();
  signedIn({ "GET /api/characters": () => json(200, [aria, borin]) });
  renderApp(<App />, { route: "/characters" });

  await screen.findByText("Borin");
  await user.click(screen.getAllByRole("button", { name: "Play" })[1]);

  expect(
    await screen.findByRole("heading", { name: "Playing as Borin" }),
  ).toBeInTheDocument();
  expect(screen.getByText("game for Borin")).toBeInTheDocument();
});

test("opening the game with nothing chosen goes back to the characters page", async () => {
  signedIn({ "GET /api/characters": () => json(200, []) });
  renderApp(<App />, { route: "/play" });

  expect(
    await screen.findByRole("heading", { name: "Your characters" }),
  ).toBeInTheDocument();
});
