import { test, expect, beforeEach, afterEach } from "vitest";
import { startRealtime } from "./realtime-test-helpers.js";
import { TEST_ORIGIN } from "./test-helpers.js";

let rt;
beforeEach(async () => {
  rt = await startRealtime();
});
afterEach(() => rt.close());

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const asPlayer = (p) => ({
  cookie: p.cookie,
  auth: { characterId: p.characterId },
});

test("a logged-in user can connect with their own character", async () => {
  const alice = await rt.player("alice", "Aria");
  const { socket, welcome, error } = await rt.open(asPlayer(alice));

  expect(error).toBeUndefined();
  expect(socket.connected).toBe(true);
  expect(welcome.character).toMatchObject({
    id: alice.characterId,
    name: "Aria",
    level: 1,
    hp: 100,
    x: 100,
    y: 60,
  });
});

test("without a session the connection is refused", async () => {
  const alice = await rt.player("alice", "Aria");
  const { error } = await rt.open({ auth: { characterId: alice.characterId } });
  expect(error.data.code).toBe("not_authenticated");
});

test("a made-up session cookie is refused", async () => {
  const alice = await rt.player("alice", "Aria");
  const { error } = await rt.open({
    cookie: "sid=s%3Aforged.notarealsignature",
    auth: { characterId: alice.characterId },
  });
  expect(error.data.code).toBe("not_authenticated");
});

test("another user's character looks the same as one that does not exist", async () => {
  const alice = await rt.player("alice", "Aria");
  const bob = await rt.player("bobby", "Borin");

  const theirs = await rt.open({
    cookie: bob.cookie,
    auth: { characterId: alice.characterId },
  });
  const missing = await rt.open({
    cookie: bob.cookie,
    auth: { characterId: 99999 },
  });

  expect(theirs.error.data.code).toBe("not_found");
  expect(missing.error.data).toEqual(theirs.error.data);
  expect(missing.error.message).toBe(theirs.error.message);
});

test("a missing or oddly written character id is refused", async () => {
  const alice = await rt.player("alice", "Aria");
  const bad = [undefined, null, "abc", "1e2", "0x10", -1, 1.5, {}, []];
  for (const characterId of bad) {
    const { error } = await rt.open({
      cookie: alice.cookie,
      auth: { characterId },
    });
    expect(error?.data.code, `characterId ${JSON.stringify(characterId)}`).toBe(
      "not_found",
    );
  }
  const noAuth = await rt.open({ cookie: alice.cookie });
  expect(noAuth.error.data.code).toBe("not_found");
});

test("a page from an unknown origin cannot connect, even with a valid session", async () => {
  const alice = await rt.player("alice", "Aria");
  const hostile = await rt.open({
    ...asPlayer(alice),
    origin: "http://evil.example",
  });
  expect(hostile.error).toBeDefined();
  expect(hostile.socket.connected).toBe(false);

  const allowed = await rt.open({ ...asPlayer(alice), origin: TEST_ORIGIN });
  expect(allowed.welcome).toBeDefined();
});

test("a client that sends no Origin (not a browser) can connect", async () => {
  const alice = await rt.player("alice", "Aria");
  const { welcome } = await rt.open({ ...asPlayer(alice), origin: null });
  expect(welcome).toBeDefined();
});

test("a second connection for the same character replaces the first", async () => {
  const alice = await rt.player("alice", "Aria");
  const first = await rt.open(asPlayer(alice));
  const replaced = new Promise((resolve) =>
    first.socket.once("replaced", resolve),
  );
  const closed = new Promise((resolve) =>
    first.socket.once("disconnect", resolve),
  );

  const second = await rt.open(asPlayer(alice));

  await replaced;
  expect(await closed).toBe("io server disconnect");
  expect(first.socket.connected).toBe(false);
  expect(second.socket.connected).toBe(true);
});

test("a refused attempt does not disturb the connection that is already there", async () => {
  const alice = await rt.player("alice", "Aria");
  const mallory = await rt.player("mallory", "Evil");
  const real = await rt.open(asPlayer(alice));

  const attack = await rt.open({
    cookie: mallory.cookie,
    auth: { characterId: alice.characterId },
  });
  expect(attack.error.data.code).toBe("not_found");

  await wait(50); // give a wrongful disconnect time to arrive
  expect(real.socket.connected).toBe(true);
});

test("different characters can be online at the same time", async () => {
  const alice = await rt.player("alice", "Aria");
  const bob = await rt.player("bobby", "Borin");
  const a = await rt.open(asPlayer(alice));
  const b = await rt.open(asPlayer(bob));
  await wait(50);
  expect(a.socket.connected && b.socket.connected).toBe(true);
});

test("logging out disconnects that session's game connection only", async () => {
  const alice = await rt.player("alice", "Aria");
  const bob = await rt.player("bobby", "Borin");
  const a = await rt.open(asPlayer(alice));
  const b = await rt.open(asPlayer(bob));
  const closed = new Promise((resolve) => a.socket.once("disconnect", resolve));

  const res = await fetch(`${rt.url}/api/logout`, {
    method: "POST",
    headers: { Cookie: alice.cookie },
  });
  expect(res.status).toBe(204);

  expect(await closed).toBe("io server disconnect");
  await wait(50);
  expect(b.socket.connected).toBe(true);
});

test("a database failure during the handshake is refused with a generic error", async () => {
  const alice = await rt.player("alice", "Aria");
  rt.db.exec("DROP TABLE characters"); // the user and session still work
  const { error } = await rt.open(asPlayer(alice));
  expect(error.data.code).toBe("internal_error");
  expect(error.message).not.toMatch(/no such table/);
});
