import { test, expect, vi } from "vitest";
import { connectToGame } from "./connection.js";
import { fakeIo } from "./fakeSocket.js";

function start(characterId = 7) {
  const io = fakeIo();
  const onChange = vi.fn();
  const connection = connectToGame({ characterId, onChange, io });
  const socket = io.sockets[0];
  const last = () => onChange.mock.lastCall[0];
  return { io, onChange, connection, socket, last };
}

test("it connects to the page's own origin over WebSocket, with the character id", () => {
  const { io } = start(7);
  expect(io).toHaveBeenCalledWith({
    transports: ["websocket"],
    auth: { characterId: 7 },
  });
});

test("it starts as connecting, and the welcome makes it connected", () => {
  const { socket, last } = start();
  expect(last()).toEqual({ status: "connecting" });

  socket.emit("welcome", { character: { id: 7, name: "Aria" } });
  expect(last()).toEqual({
    status: "connected",
    character: { id: 7, name: "Aria" },
  });
});

test("a replaced connection stays replaced when the server then closes it", () => {
  const { socket, last, onChange } = start();
  socket.emit("welcome", { character: { id: 7 } });

  socket.emit("replaced");
  socket.emit("disconnect", "io server disconnect");

  expect(last()).toEqual({ status: "replaced" });
  const statuses = onChange.mock.calls.map(([s]) => s.status);
  expect(statuses).not.toContain("ended");
});

test("a refusal reports the server's reason, and nothing overrides it", () => {
  const { socket, last } = start();
  socket.emit(
    "connect_error",
    Object.assign(new Error("Please log in"), {
      data: { code: "not_authenticated" },
    }),
  );
  expect(last()).toEqual({ status: "refused", code: "not_authenticated" });

  socket.emit("welcome", { character: { id: 7 } });
  socket.emit("disconnect", "transport close");
  expect(last()).toEqual({ status: "refused", code: "not_authenticated" });
});

test("a network error without a reason means reconnecting, and a welcome recovers", () => {
  const { socket, last } = start();
  socket.emit("connect_error", new Error("websocket error"));
  expect(last()).toEqual({ status: "reconnecting" });

  socket.emit("welcome", { character: { id: 7 } });
  expect(last().status).toBe("connected");
});

test("a close by the server (such as a logout) is final", () => {
  const { socket, last } = start();
  socket.emit("welcome", { character: { id: 7 } });
  socket.emit("disconnect", "io server disconnect");
  expect(last()).toEqual({ status: "ended" });
});

test("a lost transport means reconnecting", () => {
  const { socket, last } = start();
  socket.emit("welcome", { character: { id: 7 } });
  socket.emit("disconnect", "transport close");
  expect(last()).toEqual({ status: "reconnecting" });
});

test("close removes every listener, closes the socket and silences later events", () => {
  const { socket, connection, onChange } = start();
  const calls = onChange.mock.calls.length;

  connection.close();

  expect(socket.close).toHaveBeenCalled();
  for (const event of ["welcome", "replaced", "connect_error", "disconnect"]) {
    expect(socket.listenerCount(event)).toBe(0);
  }
  socket.emit("welcome", { character: { id: 7 } });
  expect(onChange.mock.calls.length).toBe(calls);
});

test("snapshots reach listeners until they unsubscribe", () => {
  const { connection, socket } = start();
  const seen = [];
  const off = connection.onSnapshot((s) => seen.push(s.tick));

  socket.emit("snapshot", { tick: 1, players: [] });
  off();
  socket.emit("snapshot", { tick: 2, players: [] });

  expect(seen).toEqual([1]);
});

test("input is sent as a volatile 'input' event", () => {
  const { connection, socket } = start();
  const input = { seq: 1, up: false, down: false, left: false, right: true };
  connection.sendInput(input);
  expect(socket.volatile.emit).toHaveBeenCalledWith("input", input);
});

test("after close, nothing is sent and snapshots are ignored", () => {
  const { connection, socket } = start();
  const seen = vi.fn();
  connection.onSnapshot(seen);

  connection.close();
  connection.sendInput({
    seq: 1,
    up: false,
    down: false,
    left: false,
    right: true,
  });
  socket.emit("snapshot", { tick: 1, players: [] });

  expect(socket.volatile.emit).not.toHaveBeenCalled();
  expect(seen).not.toHaveBeenCalled();
});
