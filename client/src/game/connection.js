import { io as defaultIo } from "socket.io-client";

// Connects to the game server and reports progress as plain objects:
//   { status: "connecting" | "reconnecting" | "replaced" | "ended" }
//   { status: "connected", character }
//   { status: "refused", code }
// The returned object is also how the game talks to the server:
//   sendInput(input), onSnapshot(listener) -> unsubscribe, close()
export function connectToGame({ characterId, onChange, io = defaultIo }) {
  // No URL: connect to the page's own origin (the Vite proxy in development).
  const socket = io({ transports: ["websocket"], auth: { characterId } });
  let closed = false;
  let settled = false; // the outcome is final, so ignore anything that follows
  const snapshotListeners = new Set();

  const report = (state) => {
    if (!closed && !settled) onChange(state);
  };
  const settle = (state) => {
    report(state);
    settled = true;
  };

  report({ status: "connecting" });

  socket.on("welcome", ({ character }) =>
    report({ status: "connected", character }),
  );
  socket.on("replaced", () => settle({ status: "replaced" }));
  socket.on("connect_error", (err) => {
    const code = err.data?.code; // only present when the server refused us
    if (code) settle({ status: "refused", code });
    else report({ status: "reconnecting" }); // network trouble: Socket.IO retries
  });
  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect") settle({ status: "ended" });
    else report({ status: "reconnecting" });
  });
  socket.on("snapshot", (snapshot) => {
    if (closed) return;
    for (const listener of snapshotListeners) listener(snapshot);
  });

  return {
    // Sent "volatile": if the connection is not ready the message is dropped,
    // not queued. A key press from two seconds ago must never arrive late.
    sendInput(input) {
      if (!closed) socket.volatile.emit("input", input);
    },

    onSnapshot(listener) {
      snapshotListeners.add(listener);
      return () => snapshotListeners.delete(listener);
    },

    close() {
      closed = true;
      snapshotListeners.clear();
      socket.removeAllListeners();
      socket.close(); // also stops any reconnection attempts
    },
  };
}
