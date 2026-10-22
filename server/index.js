import crypto from "node:crypto";
import { openDb } from "./db.js";
import { createApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 3001);

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(32).toString("hex");
  console.warn("SESSION_SECRET is not set: using a random one for this run.");
}

const app = createApp(openDb(), {
  sessionSecret,
  secureCookies: process.env.NODE_ENV === "production",
});

// 127.0.0.1 = reachable only from this machine
app.listen(PORT, "127.0.0.1", () => {
  console.log(`API listening on http://127.0.0.1:${PORT}`);
});
