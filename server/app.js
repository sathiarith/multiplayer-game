import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import { createUser, findUserByUsername, findUserById } from "./users.js";
import {
  validateCredentials,
  validateNewCharacter,
  validatePosition,
} from "./validation.js";
import {
  listCharacters,
  createCharacter,
  updatePosition,
  CharacterLimitError,
  MAX_CHARACTERS,
  WORLD,
} from "./characters.js";
import { notFoundHandler, errorHandler } from "./errors.js";
import crypto from "node:crypto";
import pinoHttp from "pino-http";
import { createLogger } from "./logger.js";

export const COOKIE_NAME = "sid";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const INVALID_CREDENTIALS = {
  error: {
    code: "invalid_credentials",
    message: "Invalid username or password",
  },
};
const NOT_AUTHENTICATED = {
  error: { code: "not_authenticated", message: "Please log in" },
};

// express-session reports completion through callbacks; wrap them in promises.
const regenerate = (req) =>
  new Promise((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve())),
  );
const destroy = (req) =>
  new Promise((resolve, reject) =>
    req.session.destroy((err) => (err ? reject(err) : resolve())),
  );

export function createApp(
  db,
  {
    bcryptCost = 12,
    sessionSecret,
    secureCookies = false,
    logger = createLogger({ level: "silent" }),
  } = {},
) {
  if (!sessionSecret) throw new Error("sessionSecret is required");

  // Checked against when the username does not exist, so that path costs the
  // same time as a real password check.
  const dummyHash = bcrypt.hashSync("not-a-real-password", bcryptCost);

  const app = express();
  app.use(
    pinoHttp({
      logger,
      // Keep a well-formed incoming id; otherwise make a new one.
      genReqId: (req, res) => {
        const incoming = req.headers["x-request-id"];
        const id =
          typeof incoming === "string" &&
          /^[A-Za-z0-9._-]{1,64}$/.test(incoming)
            ? incoming
            : crypto.randomUUID();
        res.setHeader("X-Request-Id", id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === "/health" },
      customLogLevel: (req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      customProps: (req) => ({ userId: req.session?.userId }),
    }),
  );

  // Before the session middleware, so polling never creates a session.
  app.get("/health", (req, res) => {
    try {
      db.prepare("SELECT 1").get();
      res.json({ status: "ok", uptime: Math.floor(process.uptime()) });
    } catch (err) {
      req.log.error({ err }, "health check failed");
      res.status(503).json({ status: "unavailable" });
    }
  });
  app.use(express.json({ limit: "10kb" }));
  app.use(
    session({
      name: COOKIE_NAME,
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false, // no cookie until we actually log someone in
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
        maxAge: WEEK_MS,
      },
    }),
  );

  // Runs before a route: lets logged-in users through, answers 401 otherwise.
  function requireAuth(req, res, next) {
    const user = req.session.userId && findUserById(db, req.session.userId);
    if (!user) return res.status(401).json(NOT_AUTHENTICATED);
    req.user = user;
    next();
  }

  app.post("/api/register", async (req, res) => {
    const { username, password } = req.body ?? {};

    const errors = validateCredentials({ username, password });
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        error: {
          code: "invalid_input",
          message: "Invalid input",
          fields: errors,
        },
      });
    }

    const hash = await bcrypt.hash(password, bcryptCost);

    try {
      const user = createUser(db, username, hash);
      return res.status(201).json(user);
    } catch (err) {
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return res.status(409).json({
          error: { code: "username_taken", message: "That username is taken" },
        });
      }
      throw err;
    }
  });

  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body ?? {};

    // Only a shape check here. Password rules apply when choosing one, not when using it.
    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      username.length > 50 ||
      password.length > 200
    ) {
      return res.status(400).json({
        error: {
          code: "invalid_input",
          message: "Username and password are required",
        },
      });
    }

    const user = findUserByUsername(db, username);
    // Always run one bcrypt comparison, whether or not the user exists.
    const ok = await bcrypt.compare(
      password,
      user ? user.password_hash : dummyHash,
    );
    if (!user || !ok) return res.status(401).json(INVALID_CREDENTIALS);

    await regenerate(req); // new session ID on privilege change
    req.session.userId = user.id;
    return res.json({ id: user.id, username: user.username });
  });

  app.post("/api/logout", async (req, res) => {
    await destroy(req); // deletes the server-side record
    res.clearCookie(COOKIE_NAME); // and tells the browser to drop the cookie
    return res.status(204).end();
  });

  app.get("/api/me", requireAuth, (req, res) => {
    res.json(req.user);
  });

  app.get("/api/characters", requireAuth, (req, res) => {
    res.json(listCharacters(db, req.user.id));
  });

  app.post("/api/characters", requireAuth, (req, res) => {
    const { name, class: characterClass } = req.body ?? {};

    const errors = validateNewCharacter({ name, class: characterClass });
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        error: {
          code: "invalid_input",
          message: "Invalid input",
          fields: errors,
        },
      });
    }

    try {
      const character = createCharacter(db, req.user.id, name, characterClass);
      return res.status(201).json(character);
    } catch (err) {
      if (err instanceof CharacterLimitError) {
        return res.status(409).json({
          error: {
            code: "character_limit",
            message: `You can have at most ${MAX_CHARACTERS} characters`,
          },
        });
      }
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return res.status(409).json({
          error: {
            code: "name_taken",
            message: "That character name is taken",
          },
        });
      }
      throw err;
    }
  });

  // Temporary: Sprint 5 replaces client-reported positions with server-owned ones.
  app.put("/api/characters/:id/position", requireAuth, (req, res) => {
    const NOT_FOUND = {
      error: { code: "not_found", message: "Character not found" },
    };
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(404).json(NOT_FOUND);

    const { x, y } = req.body ?? {};
    const errors = validatePosition({ x, y }, WORLD);
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        error: {
          code: "invalid_input",
          message: "Invalid input",
          fields: errors,
        },
      });
    }

    // Same answer whether the character is missing or belongs to someone else.
    if (!updatePosition(db, req.user.id, id, x, y)) {
      return res.status(404).json(NOT_FOUND);
    }
    return res.json({ id, x, y });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
