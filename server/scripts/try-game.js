// Dev tool: logs in, plays a character for a few seconds, and prints what the server says.
// Usage: node scripts/try-game.js <username> <password> <characterId>
import { io } from "socket.io-client";

const [username, password, characterId] = process.argv.slice(2);
if (!username || !password || !characterId) {
  console.error("Usage: node scripts/try-game.js <username> <password> <characterId>");
  process.exit(1);
}

const base = process.env.API_URL ?? "http://127.0.0.1:3001";
const login = await fetch(`${base}/api/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username, password }),
});
if (!login.ok) {
  console.error(`Login failed: HTTP ${login.status}`);
  process.exit(1);
}
const cookie = login.headers.getSetCookie()[0].split(";")[0];

const socket = io(base, {
  transports: ["websocket"],
  extraHeaders: { cookie },
  auth: { characterId: Number(characterId) },
});

let seq = 0;
let me = null;
let sender = null;

socket.on("connect_error", (err) => {
  console.error("Refused:", err.data?.code ?? err.message);
  process.exit(1);
});

socket.on("welcome", ({ you, tickRate }) => {
  me = you;
  console.log(`Connected as character ${you}. The server ticks ${tickRate} times a second.`);
  // Hold "right" for 1.5 seconds, sending the input at the tick rate.
  const started = Date.now();
  sender = setInterval(() => {
    const holding = Date.now() - started < 1500;
    socket.emit("input", { seq: ++seq, up: false, down: false, left: false, right: holding });
  }, 1000 / tickRate);
});

socket.on("snapshot", ({ tick, players }) => {
  if (tick % 10 !== 0) return; // twice a second
  const mine = players.find((p) => p.id === me);
  if (!mine) return;
  console.log(
    `tick ${tick}: ${players.length} player(s), me at (${mine.x}, ${mine.y}), input ${mine.ack} applied`,
  );
});

setTimeout(() => {
  clearInterval(sender);
  socket.close();
  console.log("Done.");
}, 4000);