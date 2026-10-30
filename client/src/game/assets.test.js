import { test, expect, vi, afterEach } from "vitest";
import { loadLevel } from "./assets.js";

afterEach(() => vi.unstubAllGlobals());

const data = {
  tileSize: 40,
  spawn: { col: 1, row: 1 },
  rows: ["###", "#.#", "###"],
};

test("loadLevel fetches the map and builds the level", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(data)));
  vi.stubGlobal("fetch", fetchMock);

  const level = await loadLevel("/maps/test.json");

  expect(fetchMock.mock.calls[0][0]).toBe("/maps/test.json");
  expect(level.tiles[1]).toEqual([1, 0, 1]);
  expect(level.tileSize).toBe(40);
});

test("the abort signal is passed on to fetch", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(data)));
  vi.stubGlobal("fetch", fetchMock);
  const controller = new AbortController();

  await loadLevel("/maps/test.json", controller.signal);

  expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
});

test("a failed response becomes a readable error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("", { status: 404 })),
  );
  await expect(loadLevel("/maps/missing.json")).rejects.toThrow(/404/);
});
