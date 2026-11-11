import { Server } from "socket.io";
import { createLogger } from "./logger.js";
import { findUserById } from "./users.js";
import { findCharacter } from "./characters.js";
import { parseId } from "./validation.js";
import { level as sharedLevel } from "./level.js";
import { createWorld, parseInput, TICK_RATE } from "./world.js";
import { createGuard } from "./abuse.js";
import { createPersistence } from "./persistence.js";
import { PROTOCOL } from "./protocol.js";
import crypto from "node:crypto";
import { parseChat, createBucket, withinRadius } from "./chat.js";
import { LOOT, parsePickup } from "./loot.js";
import { addItem, listInventory } from "./inventory.js";

// Socket.IO shows a refusal to the client as `connect_error`, carrying err.data.
const refuse = (code, message) =>
  Object.assign(new Error(message), { data: { code } });

export function attachRealtime(
  httpServer,
  {
    app,
    db,
    allowedOrigins,
    logger = createLogger({ level: "silent" }),
    level = sharedLevel,
    tickMs = 1000 / TICK_RATE,
    saveEveryMs = PROTOCOL.saveEveryMs,
    leaderboard, // optional: told about every score that is saved
    loot = LOOT.spawns, // where items lie; tests may pass their own
    adapter, // optional: a Socket.IO adapter (the Redis one, for the experiment). Undefined means in memory.
    guard = {}, // tests pass smaller limits
  },
) {
  const guardOptions = {
    ratePerSecond: PROTOCOL.rate.perSecond,
    burst: PROTOCOL.rate.burst,
    maxViolations: PROTOCOL.violations.max,
    violationWindowMs: PROTOCOL.violations.windowMs,
    ...guard,
  };

  const io = new Server(httpServer, {
    serveClient: false, // we do not serve the browser bundle ourselves
    transports: ["websocket"], // no HTTP polling: one handshake request
    maxHttpBufferSize: PROTOCOL.maxMessageBytes, // a bigger message closes the connection
    // Browsers do not apply CORS to WebSockets, so check the Origin here.
    // No Origin at all means the caller is not a browser page.
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, origin === undefined || allowedOrigins.includes(origin));
    },
    ...(adapter ? { adapter } : {}),
  });

  // Run the Express session middleware on the handshake request, so that
  // socket.request.session is the same session the REST API uses.
  io.engine.use(app.locals.sessionMiddleware);

  const world = createWorld(level, {
    spawns: loot,
    respawnTicks: PROTOCOL.pickup.respawnSeconds * TICK_RATE,
  });
  const online = new Map(); // characterId -> the socket currently playing it

  // Writes positions and health to the database: on a timer for players who
  // changed, and once more when a player leaves.
  const persistence = createPersistence({
    db,
    world,
    ownerOf: (characterId) => online.get(characterId)?.data.user.id,
    logger,
    intervalMs: saveEveryMs,
    onSaved: (id, state) => leaderboard?.update(id, state.score),
  });
  persistence.start();

  // The game loop: one fixed step of the world, then a snapshot for everyone.
  const timer = setInterval(() => {
    if (world.size === 0) return; // nobody is playing
    try {
      world.step();
      io.to("world").emit("snapshot", world.snapshot());
    } catch (err) {
      logger.error({ err }, "game tick failed");
    }
  }, tickMs);
  timer.unref(); // never keeps the process alive on its own
  httpServer.once("close", () => {
    clearInterval(timer);
    persistence.stop();
  });

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
    socket.join("world");

    // The newest connection for a character wins, so a page refresh gets back in.
    // Register the new socket first: the old one's disconnect handler then sees
    // it has been replaced, and leaves the player in the world.
    const previous = online.get(character.id);
    online.set(character.id, socket);
    world.add(character);
    if (previous) {
      previous.emit("replaced");
      previous.disconnect(true);
    }

    // The inventory travels with the welcome, so the page has it before it listens for changes.
    let inventory = [];
    try {
      inventory = listInventory(db, character.id);
    } catch (err) {
      log.error({ err }, "could not read the inventory");
    }
    socket.emit("welcome", {
      character,
      you: character.id,
      tickRate: TICK_RATE,
      inventory,
    });
    log.info("player connected");

    // Every incoming message passes through here, including events we have no
    // handler for, so none of them can be used to flood the server.
    const limiter = createGuard(guardOptions);
    let kicked = false;

    // The only event a client may send. False means the message was nonsense.
    function handleInput(raw) {
      const input = parseInput(raw);
      if (!input) return false;
      world.setInput(character.id, input); // a stale sequence number is ignored, not punished
      return true;
    }

    // People type, machines flood: chat has its own, slower limit.
    const chatBucket = createBucket({
      ratePerSecond: PROTOCOL.chat.perSecond,
      burst: PROTOCOL.chat.burst,
    });

    // Returns false only for nonsense (a violation). A person's mistake is
    // answered with chat_rejected and is not held against them.
    function handleChat(raw) {
      const parsed = parseChat(raw);
      if (!parsed.ok && parsed.reason === "malformed") return false;
      if (!parsed.ok) {
        socket.emit("chat_rejected", { reason: "invalid" });
        return true;
      }
      if (!chatBucket.take()) {
        socket.emit("chat_rejected", { reason: "too_fast" });
        return true;
      }
      const speaker = world.get(character.id);
      if (!speaker) return true;

      const message = {
        id: crypto.randomUUID(),
        from: { id: character.id, name: character.name },
        text: parsed.text,
        at: new Date().toISOString(),
      };
      const positions = world.ids().map((id) => ({ id, ...world.get(id) }));
      for (const id of withinRadius(positions, speaker, PROTOCOL.chat.radius)) {
        online.get(id)?.emit("chat", message);
      }
      return true;
    }

    // Returns false only for nonsense (a violation).
    function handlePickup(raw) {
      const id = parsePickup(raw);
      if (id === null) return false;

      const check = world.checkPickup(character.id, id, PROTOCOL.pickup.range);
      if (!check.ok) {
        socket.emit("pickup_rejected", { reason: check.reason });
        return true;
      }

      // The database first: if the write fails, the item stays on the ground.
      let result;
      try {
        result = addItem(db, character.id, check.item, 1);
      } catch (err) {
        log.error({ err }, "pickup failed");
        socket.emit("pickup_rejected", { reason: "error" });
        return true;
      }
      if (!result.ok) {
        socket.emit("pickup_rejected", { reason: result.reason });
        return true;
      }

      world.take(id); // nothing else ran in between: Node handles one message at a time
      socket.emit("inventory", { items: listInventory(db, character.id) });
      return true;
    }

    // Every event a client may send, and what handles it.
    const handlers = {
      input: handleInput,
      chat: handleChat,
      pickup: handlePickup,
    };

    function kick() {
      kicked = true;
      log.warn(
        { reason: PROTOCOL.kickReason },
        "player disconnected for abuse",
      );
      socket.emit("kicked", { reason: PROTOCOL.kickReason });
      socket.disconnect(true);
    }

    socket.onAny((event, ...args) => {
      if (kicked) return;
      let verdict = limiter.hit(); // every message costs a token
      if (verdict === "ok") {
        const handler = handlers[event];
        const valid = handler ? handler(args[0]) : false; // unknown events are violations
        if (!valid) verdict = limiter.strike(); // an unknown event or a malformed payload
      }
      if (verdict === "kick") kick();
    });

    socket.on("disconnect", (reason) => {
      if (online.get(character.id) === socket) {
        persistence.save(character.id); // the last position, before the player is forgotten
        online.delete(character.id);
        world.remove(character.id);
        persistence.forget(character.id);
      }
      log.info({ reason }, "player disconnected");
    });
  });

  // Called by POST /api/logout: a logged-out session must not keep a game connection.
  app.locals.onSessionEnded = (sessionId) => {
    io.in(`session:${sessionId}`).disconnectSockets(true);
  };

  return io;
}
