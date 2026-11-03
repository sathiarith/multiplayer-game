// @vitest-environment jsdom
import { test, expect, vi, beforeEach } from "vitest";
import { screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { io } from "socket.io-client";
import App from "./App.jsx";
import { renderApp, fakeApi, json, notLoggedIn, alice } from "./test-utils.jsx";

// The real socket library is replaced by a fake, and the canvas by a stub.
vi.mock("socket.io-client", async () => {
  const { fakeIo } = await import("./game/fakeSocket.js");
  return { io: fakeIo() };
});
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

beforeEach(() => {
  io.mockClear();
  io.sockets.length = 0;
});

// Logs in, lists two characters, and opens the game for the second one.
async function playBorin(extraRoutes = {}) {
  const user = userEvent.setup();
  fakeApi({
    "GET /api/me": () => json(200, alice),
    "GET /api/characters": () => json(200, [aria, borin]),
    ...extraRoutes,
  });
  renderApp(<App />, { route: "/characters" });
  await screen.findByText("Borin");
  await user.click(screen.getAllByRole("button", { name: "Play" })[1]);
  await screen.findByRole("heading", { name: "Playing as Borin" });
  return { user, socket: io.sockets.at(-1) };
}

test("opening the game connects the chosen character and shows when it is connected", async () => {
  const { socket } = await playBorin();

  expect(io).toHaveBeenCalledWith({
    transports: ["websocket"],
    auth: { characterId: 2 },
  });
  expect(screen.getByText("Connecting…")).toBeInTheDocument();

  act(() => socket.emit("welcome", { character: borin }));
  expect(screen.getByText("Connected")).toBeInTheDocument();
});

test("when another window takes over, the page says so and can take the character back", async () => {
  const { user, socket } = await playBorin();
  act(() => socket.emit("welcome", { character: borin }));
  act(() => {
    socket.emit("replaced");
    socket.emit("disconnect", "io server disconnect");
  });

  expect(screen.getByText(/opened in another window/i)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Play here" }));
  expect(io).toHaveBeenCalledTimes(2);
  expect(screen.getByText("Connecting…")).toBeInTheDocument();
});

test("when the server says the session is gone, the page ends up at login", async () => {
  let meCalls = 0;
  const { socket } = await playBorin({
    "GET /api/me": () => (++meCalls === 1 ? json(200, alice) : notLoggedIn()),
  });

  act(() =>
    socket.emit(
      "connect_error",
      Object.assign(new Error("Please log in"), {
        data: { code: "not_authenticated" },
      }),
    ),
  );

  expect(
    await screen.findByRole("heading", { name: "Log in" }),
  ).toBeInTheDocument();
});

test("leaving the game page closes the connection", async () => {
  const { user, socket } = await playBorin();

  await user.click(screen.getByRole("link", { name: "Back to characters" }));

  expect(
    await screen.findByRole("heading", { name: "Your characters" }),
  ).toBeInTheDocument();
  expect(socket.close).toHaveBeenCalled();
});
