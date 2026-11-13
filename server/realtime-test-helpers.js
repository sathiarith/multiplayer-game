import { createServer } from "node:http";
import { io as connectClient } from "socket.io-client";
import { createTestApp, TEST_ORIGIN } from "./test-helpers.js";
import { attachRealtime } from "./realtime.js";
import { createCharacter } from "./characters.js";
import { findUserByUsername } from "./users.js";

export async function startRealtime({
  tickMs = 10,
  guard,
  saveEveryMs = 60_000,
  logger,
  appOptions = {},
  makeLeaderboard,
  monsters,
} = {}) {
  const { app, db, leaderboard } = createTestApp({
    ...appOptions,
    makeLeaderboard,
  });
  const httpServer = createServer(app);
  const io = attachRealtime(httpServer, {
    app,
    db,
    allowedOrigins: [TEST_ORIGIN],
    tickMs,
    guard,
    saveEveryMs,
    logger,
    leaderboard,
    monsters,
  });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  const clients = [];

  const post = (path, body, headers = {}) =>
    fetch(url + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  // Registers and logs in over real HTTP, then creates a character.
  async function player(username, characterName) {
    const creds = { username, password: "correct-horse-battery" };
    await post("/api/register", creds);
    const login = await post("/api/login", creds);
    const cookie = login.headers.getSetCookie()[0].split(";")[0]; // "sid=s%3A..."
    const user = findUserByUsername(db, username);
    const character = createCharacter(db, user.id, characterName);
    return { cookie, userId: user.id, characterId: character.id };
  }

  // Connects like a browser page would and resolves with the first outcome:
  // { socket, welcome } when accepted, or { socket, error } when refused.
  // `origin: null` sends no Origin header (not a browser).
  function open({ cookie, auth, origin = TEST_ORIGIN } = {}) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (origin) headers.origin = origin;
    const socket = connectClient(url, {
      transports: ["websocket"],
      extraHeaders: headers,
      auth,
      reconnection: false,
      forceNew: true,
    });
    clients.push(socket);
    return new Promise((resolve) => {
      socket.once("welcome", (welcome) => resolve({ socket, welcome }));
      socket.once("connect_error", (error) => resolve({ socket, error }));
    });
  }

  return {
    io,
    url,
    db,
    player,
    open,
    async close() {
      for (const c of clients) c.disconnect();
      await io.close(); // also closes the HTTP server
      db.close();
    },
  };
}
