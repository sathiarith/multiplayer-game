import { openDb } from "./db.js";
import { createApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 3001);
const app = createApp(openDb());

// 127.0.0.1 = reachable only from this machine
app.listen(PORT, "127.0.0.1", () => {
  console.log(`API listening on http://127.0.0.1:${PORT}`);
});
