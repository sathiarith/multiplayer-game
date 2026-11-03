import { io as defaultIo } from "socket.io-client";

// Connects to the game server and reports progress as plain objects:
//   { status: "connecting" | "reconnecting" | "replaced" | "ended" }
//   { status: "connected", character }
//   { status: "refused", code }
export function connectToGame({ characterId, onChange, io = defaultIo }) {
  // No URL: connect to the page's own origin (the Vite proxy in development).
  const socket = io({ transports: ["websocket"], auth: { characterId } });
  let closed = false;
  let settled = false; // the outcome is final, so ignore anything that follows

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

  return {
    close() {
      closed = true;
      socket.removeAllListeners();
      socket.close(); // also stops any reconnection attempts
    },
  };
}
