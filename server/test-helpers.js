import { openDb } from "./db.js";
import { createApp } from "./app.js";

// A minimal "browser": stores cookies from Set-Cookie and sends them back.
export function makeClient(base) {
  const jar = new Map();

  async function request(method, path, body) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (jar.size) {
      headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    const res = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (value === "") jar.delete(name);
      else jar.set(name, value);
    }

    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  return {
    jar,
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body),
    put: (path, body) => request("PUT", path, body),
  };
}

// Starts the app on a random free port with a fresh in-memory database.
export async function startTestServer() {
  const db = openDb(":memory:");
  const app = createApp(db, { bcryptCost: 4, sessionSecret: "test-secret" });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    db,
    client: () => makeClient(base),
    close() {
      server.close();
      db.close();
    },
  };
}
