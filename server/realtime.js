import { Server } from "socket.io";
import { createLogger } from "./logger.js";
import { findUserById } from "./users.js";
import { findCharacter } from "./characters.js";
import { parseId } from "./validation.js";

// Socket.IO shows a refusal to the client as `connect_error`, carrying err.data.
const refuse = (code, message) =>
  Object.assign(new Error(message), { data: { code } });

export function attachRealtime(
  httpServer,
  { app, db, allowedOrigins, logger = createLogger({ level: "silent" }) },
) {
  const io = new Server(httpServer, {
    serveClient: false, // we do not serve the browser bundle ourselves
    transports: ["websocket"], // no HTTP polling: one handshake request
    // Browsers do not apply CORS to WebSockets, so check the Origin here.
    // No Origin at all means the caller is not a browser page.
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, origin === undefined || allowedOrigins.includes(origin));
    },
  });

  // Run the Express session middleware on the handshake request, so that
  // socket.request.session is the same session the REST API uses.
  io.engine.use(app.locals.sessionMiddleware);

  const online = new Map(); // characterId -> the socket currently playing it

  // Runs for every connection attempt. Calling next(error) refuses it.
  io.use((socket, next) => {
    try {
      const userId = socket.request.session?.userId;
      const user = userId ? findUserById(db, userId) : undefined;
      if (!user) return next(refuse("not_authenticated", "Please log in"));

      // The user comes from the session. Only the character id comes from the client.
      const characterId = parseId(String(socket.handshake.auth?.characterId));
      const character = characterId
        ? findCharacter(db, user.id, characterId)
        : undefined;
      if (!character) return next(refuse("not_found", "Character not found"));

      socket.data.user = user;
      socket.data.character = character;
      return next();
    } catch (err) {
      logger.error({ err }, "socket handshake failed");
      return next(refuse("internal_error", "Something went wrong"));
    }
  });

  io.on("connection", (socket) => {
    const { user, character } = socket.data;
    const log = logger.child({ userId: user.id, characterId: character.id });

    socket.join(`session:${socket.request.session.id}`);

    // The newest connection for a character wins, so a page refresh gets back in.
    const previous = online.get(character.id);
    if (previous) {
      previous.emit("replaced");
      previous.disconnect(true);
    }
    online.set(character.id, socket);

    socket.emit("welcome", { character });
    log.info("player connected");

    socket.on("disconnect", (reason) => {
      if (online.get(character.id) === socket) online.delete(character.id);
      log.info({ reason }, "player disconnected");
    });
  });

  // Called by POST /api/logout: a logged-out session must not keep a game connection.
  app.locals.onSessionEnded = (sessionId) => {
    io.in(`session:${sessionId}`).disconnectSockets(true);
  };

  return io;
}
