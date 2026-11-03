// @vitest-environment jsdom
import { StrictMode } from "react";
import { test, expect } from "vitest";
import { render, renderHook, screen, act } from "@testing-library/react";
import { useGameConnection } from "./useGameConnection.js";
import { fakeIo } from "./game/fakeSocket.js";
import "./test-utils.jsx"; // registers the cleanup between tests

const welcome = { character: { id: 7 } };

test("with no character it does not connect", () => {
  const io = fakeIo();
  const { result } = renderHook(() => useGameConnection(undefined, { io }));
  expect(io).not.toHaveBeenCalled();
  expect(result.current.status).toBe("idle");
});

test("it connects once, follows the server, and disconnects on unmount", () => {
  const io = fakeIo();
  const { result, unmount } = renderHook(() => useGameConnection(7, { io }));
  expect(io).toHaveBeenCalledTimes(1);
  expect(result.current.status).toBe("connecting");

  act(() => io.sockets[0].emit("welcome", welcome));
  expect(result.current.status).toBe("connected");

  unmount();
  expect(io.sockets[0].close).toHaveBeenCalled();
});

test("choosing another character closes the old connection and opens a new one", () => {
  const io = fakeIo();
  const { rerender } = renderHook(({ id }) => useGameConnection(id, { io }), {
    initialProps: { id: 1 },
  });
  rerender({ id: 2 });

  expect(io.sockets).toHaveLength(2);
  expect(io.sockets[0].close).toHaveBeenCalled();
  expect(io.sockets[1].options.auth).toEqual({ characterId: 2 });
});

test("reconnect replaces the connection and starts again from connecting", () => {
  const io = fakeIo();
  const { result } = renderHook(() => useGameConnection(7, { io }));
  act(() => io.sockets[0].emit("replaced"));
  expect(result.current.status).toBe("replaced");

  act(() => result.current.reconnect());

  expect(io).toHaveBeenCalledTimes(2);
  expect(io.sockets[0].close).toHaveBeenCalled();
  expect(result.current.status).toBe("connecting");
});

test("StrictMode's extra start and stop leaves exactly one live connection", () => {
  const io = fakeIo();
  function Probe() {
    const { status } = useGameConnection(7, { io });
    return <p>{status}</p>;
  }
  render(
    <StrictMode>
      <Probe />
    </StrictMode>,
  );

  expect(io.sockets).toHaveLength(2);
  expect(io.sockets[0].close).toHaveBeenCalled();
  expect(io.sockets[1].close).not.toHaveBeenCalled();

  act(() => io.sockets[1].emit("welcome", welcome));
  expect(screen.getByText("connected")).toBeTruthy();
});
