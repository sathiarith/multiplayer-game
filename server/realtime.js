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
import { addItem, listInventory, listItems } from "./inventory.js";
import { createOffers, parseOffer, parseTradeId } from "./offers.js";
import { executeTrade } from "./trade.js";
import { MONSTERS, parseAttack } from "./monsters.js";
import { loadLevels } from "./levels.js";

// Socket.IO shows a refusal to the client as `connect_error`, carrying err.data.
const refuse = (code, message) =>
  Object.assign(new Error(message), { data: { code } });

export async function attachRealtime(
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
    monsters = MONSTERS, // monster types and spots; tests may pass their own
    adapter, // optional: a Socket.IO adapter (the Redis one, for the experiment). Undefined means in memory.
    guard = {}, // tests pass smaller limits
  },
) {
  // Everything that needs the database is loaded BEFORE the server exists: a
  // connection arriving while we waited could slip past the checks below.
  const levels = await loadLevels(db); // the XP table, checked once at startup

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
    monsters,
    levels,
  });

  const online = new Map(); // characterId -> the socket currently playing it

  // Trade offers waiting for an answer. In memory: a restart cancels them,
  // which is safe, because nothing moves until an offer is accepted.
  const offers = createOffers({
    ttlMs: PROTOCOL.trade.offerSeconds * 1000,
    maxPerPlayer: PROTOCOL.trade.maxOffers,
  });

  const near = (a, b, range) => {
    const p = world.get(a);
    const q = world.get(b);
    return Boolean(p && q && Math.hypot(p.x - q.x, p.y - q.y) <= range);
  };
  // A courtesy check when an offer is made. The real check happens inside the trade.
  const carries = async (characterId, lines) => {
    const carried = new Map(
      (await listInventory(db, characterId)).map((i) => [i.code, i.quantity]),
    );
    return lines.every(
      (line) => (carried.get(line.code) ?? 0) >= line.quantity,
    );
  };
  const sendInventory = async (characterId) => {
    const socket = online.get(characterId);
    if (socket)
      socket.emit("inventory", { items: await listInventory(db, characterId) });
  };
  const tellBoth = (offer, result) => {
    online.get(offer.from)?.emit("trade_result", result);
    online.get(offer.to)?.emit("trade_result", result);
  };

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
  // A shutdown waits for the saves its disconnects started.
  app.locals.flushSaves = () => persistence.drain();

  // The game loop: one fixed step of the world, then a snapshot for everyone.
  // It never waits on the database.
  const timer = setInterval(() => {
    if (world.size === 0) return; // nobody is playing
    try {
      for (const event of world.step()) {
        if (event.type === "died")
          online.get(event.id)?.emit("died", { by: event.by });
      }
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
  io.use(async (socket, next) => {
    try {
      const userId = socket.request.session?.userId;
      const user = userId ? await findUserById(db, userId) : undefined;
      if (!user) return next(refuse("not_authenticated", "Please log in"));

      // The user comes from the session. Only the character id comes from the client.
      const characterId = parseId(String(socket.handshake.auth?.characterId));
      const character = characterId
        ? await findCharacter(db, user.id, characterId)
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

    // Database work that a handler starts without waiting for it. Its errors are logged.
    const background = (work) =>
      work().catch((err) => log.error({ err }, "background work failed"));

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

    // Every incoming message passes through here, including events we have no
    // handler for, so none of them can be used to flood the server.
    const limiter = createGuard(guardOptions);
    let kicked = false;

    // Each handler answers at once whether the message was valid (false = a
    // violation), and starts any database work in the background.

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

    async function pickUp(id) {
      const check = world.checkPickup(character.id, id, PROTOCOL.pickup.range);
      if (!check.ok) {
        socket.emit("pickup_rejected", { reason: check.reason });
        return;
      }
      // Take it off the map now, before waiting on the database, so nobody can
      // claim it in the meantime. If saving fails, it goes back.
      world.take(id);
      let result;
      try {
        result = await addItem(db, character.id, check.item, 1);
      } catch (err) {
        log.error({ err }, "pickup failed");
        result = { ok: false, reason: "error" };
      }
      if (!result.ok) {
        world.restore(id);
        socket.emit("pickup_rejected", { reason: result.reason });
        return;
      }
      await sendInventory(character.id);
    }

    function handlePickup(raw) {
      const id = parsePickup(raw);
      if (id === null) return false;
      background(() => pickUp(id));
      return true;
    }

    const refuseOffer = (reason) =>
      socket.emit("trade_result", { id: null, ok: false, reason });

    async function makeOffer(parsed) {
      try {
        const names = new Map(
          (await listItems(db)).map((i) => [i.code, i.name]),
        );
        const lines = [...parsed.give, ...parsed.want];
        if (
          parsed.to === character.id ||
          !lines.every((l) => names.has(l.code))
        ) {
          return refuseOffer("invalid");
        }
        const target = online.get(parsed.to);
        if (!target) return refuseOffer("not_here");
        if (!near(character.id, parsed.to, PROTOCOL.trade.range))
          return refuseOffer("too_far");
        if (!(await carries(character.id, parsed.give)))
          return refuseOffer("missing_items");

        const created = offers.create({ from: character.id, ...parsed });
        if (!created.ok) return refuseOffer(created.reason);

        const { offer } = created;
        const named = (list) =>
          list.map((l) => ({ ...l, name: names.get(l.code) }));
        const view = {
          id: offer.id,
          give: named(offer.give),
          want: named(offer.want),
          expiresAt: new Date(offer.expiresAt).toISOString(),
        };
        target.emit("trade_offered", {
          ...view,
          from: { id: character.id, name: character.name },
        });
        socket.emit("trade_sent", {
          ...view,
          to: { id: parsed.to, name: target.data.character.name },
        });
      } catch (err) {
        log.error({ err }, "trade offer failed");
        refuseOffer("error");
      }
    }

    function handleTradeOffer(raw) {
      const parsed = parseOffer(raw, { maxLines: PROTOCOL.trade.maxLines });
      if (!parsed) return false; // nonsense: a violation
      background(() => makeOffer(parsed));
      return true;
    }

    async function completeTrade(offer) {
      let result;
      try {
        result = await executeTrade(db, offer); // one transaction: everything or nothing
      } catch (err) {
        log.error({ err }, "trade failed");
        result = { ok: false, reason: "error" };
      }
      tellBoth(
        offer,
        result.ok
          ? { id: offer.id, ok: true }
          : { id: offer.id, ok: false, reason: result.reason },
      );
      if (result.ok) {
        await Promise.all([sendInventory(offer.from), sendInventory(offer.to)]);
        log.info(
          { tradeId: offer.id, from: offer.from, to: offer.to },
          "trade completed",
        );
      }
    }

    function handleTradeAccept(raw) {
      const id = parseTradeId(raw);
      if (!id) return false;
      const offer = offers.get(id);
      if (!offer || offer.to !== character.id || !online.has(offer.from)) {
        socket.emit("trade_result", { id, ok: false, reason: "gone" });
        return true;
      }
      offers.remove(id); // answered once, decided now, before anything waits
      if (!near(offer.from, offer.to, PROTOCOL.trade.range)) {
        tellBoth(offer, { id, ok: false, reason: "too_far" });
        return true;
      }
      background(() => completeTrade(offer));
      return true;
    }

    // Declining (by the receiver) and cancelling (by the sender) end an offer the same way.
    function handleTradeAnswer(raw, { by, reason }) {
      const id = parseTradeId(raw);
      if (!id) return false;
      const offer = offers.get(id);
      if (!offer || offer[by] !== character.id) {
        socket.emit("trade_result", { id, ok: false, reason: "gone" });
        return true;
      }
      offers.remove(id);
      tellBoth(offer, { id, ok: false, reason });
      return true;
    }

    // An attack is a bare request: the server picks the target and checks the cooldown.
    function handleAttack(raw) {
      if (!parseAttack(raw)) return false; // nonsense: a violation
      const result = world.attack(character.id);
      if (!result.ok) {
        socket.emit("attack_rejected", { reason: result.reason });
        return true;
      }
      if (result.killed) {
        socket.emit("progress", {
          level: result.level,
          xp: result.xp,
          leveledUp: result.leveledUp,
        });
      }
      return true;
    }

    // Every event a client may send, and what handles it.
    const handlers = {
      input: handleInput,
      chat: handleChat,
      pickup: handlePickup,
      trade_offer: handleTradeOffer,
      trade_accept: handleTradeAccept,
      trade_decline: (raw) =>
        handleTradeAnswer(raw, { by: "to", reason: "declined" }),
      trade_cancel: (raw) =>
        handleTradeAnswer(raw, { by: "from", reason: "cancelled" }),
      attack: handleAttack,
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
        // Started before the player is forgotten: the save reads the owner at once.
        void persistence.save(character.id);
        online.delete(character.id);
        // A player who leaves takes their open offers along, and the other side is told.
        for (const offer of offers.removeFor(character.id)) {
          tellBoth(offer, { id: offer.id, ok: false, reason: "gone" });
        }
        world.remove(character.id);
        persistence.forget(character.id);
      }
      log.info({ reason }, "player disconnected");
    });

    // The welcome comes last, once every handler is listening. The inventory and
    // the item catalog travel with it.
    background(async () => {
      let inventory = [];
      let catalog = [];
      try {
        [inventory, catalog] = await Promise.all([
          listInventory(db, character.id),
          listItems(db),
        ]);
      } catch (err) {
        log.error({ err }, "could not read the inventory");
      }
      socket.emit("welcome", {
        character,
        you: character.id,
        tickRate: TICK_RATE,
        inventory,
        catalog,
        levels,
      });
      log.info("player connected");
    });
  });

  // Called by POST /api/logout: a logged-out session must not keep a game connection.
  app.locals.onSessionEnded = (sessionId) => {
    io.in(`session:${sessionId}`).disconnectSockets(true);
  };

  return io;
}
