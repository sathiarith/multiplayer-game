// Dev tool for Story 6.4: connects one player to each of two servers and shows
// which groups of players each client is told about.
// Usage: node scripts/try-adapter.js <userA> <passA> <charA> <userB> <passB> <charB>
import { io } from "socket.io-client";

const [userA, passA, charA, userB, passB, charB] = process.argv.slice(2);
if (!charB) {
  console.error(
    "Usage: node scripts/try-adapter.js <userA> <passA> <charA> <userB> <passB> <charB>",
  );
  process.exit(1);
}
const urlA = process.env.URL_A ?? "http://127.0.0.1:3001";
const urlB = process.env.URL_B ?? "http://127.0.0.1:3002";

async function connect(url, username, password, characterId) {
  const login = await fetch(`${url}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!login.ok)
    throw new Error(`Login failed on ${url}: HTTP ${login.status}`);
  const cookie = login.headers.getSetCookie()[0].split(";")[0];

  const worlds = new Map(); // "1" or "1,2" -> how many snapshots listed exactly those players
  const socket = io(url, {
    transports: ["websocket"],
    extraHeaders: { cookie },
    auth: { characterId: Number(characterId) },
    reconnection: false,
  });
  socket.on("snapshot", ({ players }) => {
    const key = players
      .map((p) => p.id)
      .sort((a, b) => a - b)
      .join(",");
    worlds.set(key, (worlds.get(key) ?? 0) + 1);
  });
  await new Promise((resolve, reject) => {
    socket.once("welcome", resolve);
    socket.once("connect_error", (err) =>
      reject(new Error(err.data?.code ?? err.message)),
    );
  });
  return { socket, worlds, label: `${username} on ${url}` };
}

const clients = await Promise.all([
  connect(urlA, userA, passA, charA),
  connect(urlB, userB, passB, charB),
]);
await new Promise((resolve) => setTimeout(resolve, 2000));

for (const client of clients) {
  console.log(client.label);
  for (const [key, count] of client.worlds)
    console.log(`  players [${key}]: ${count} snapshots`);
  client.socket.close();
}
console.log(
  clients.some((c) => c.worlds.size > 1)
    ? "MIXED: a client was told about more than one world."
    : "Each client was told about its own world only.",
);
