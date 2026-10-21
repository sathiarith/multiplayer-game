import express from "express";
import bcrypt from "bcryptjs";
import { createUser } from "./users.js";
import { validateCredentials } from "./validation.js";

export function createApp(db, { bcryptCost = 12 } = {}) {
  const app = express();
  app.use(express.json({ limit: "10kb" }));

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
      return res.status(201).json(user); // id and username only, never the hash
    } catch (err) {
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return res.status(409).json({
          error: { code: "username_taken", message: "That username is taken" },
        });
      }
      throw err; // anything else is a real bug; Express answers 500
    }
  });

  return app;
}
