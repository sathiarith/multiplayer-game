// Dev tool: connects a character and floods the server, to show the protection.
// Usage: node scripts/try-flood.js <username> <password> <characterId>
import { io } from "socket.io-client";

const [username, password, characterId] = process.argv.slice(2);
if (!username || !password || !characterId) {
  console.error("Usage: node scripts/try-flood.js <username> <password> <characterId>");
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
  reconnection: false,
});

socket.on("connect_error", (err) => {
  console.error("Refused:", err.data?.code ?? err.message);
  process.exit(1);
});

socket.on("welcome", () => {
  console.log("Connected. Sending 500 inputs as fast as possible...");
  for (let seq = 1; seq <= 500; seq++) {
    socket.emit("input", { seq, up: false, down: false, left: false, right: true });
  }
});

socket.on("kicked", ({ reason }) => console.log("Kicked by the server:", reason));
socket.on("disconnect", (reason) => {
  console.log("Disconnected:", reason);
  process.exit(0);
});

setTimeout(() => {
  console.log("Not kicked after 5 seconds.");
  process.exit(1);
}, 5000);