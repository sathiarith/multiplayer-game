// @vitest-environment jsdom
import { test, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import CombatPanel from "./CombatPanel.jsx";
import "../test-utils.jsx";

const LEVELS = [
  { level: 1, xpRequired: 0, maxHp: 100 },
  { level: 2, xpRequired: 50, maxHp: 120 },
  { level: 3, xpRequired: 150, maxHp: 140 },
];

function fakeConnection() {
  const sets = { progress: new Set(), died: new Set() };
  const on = (name) => (listener) => {
    sets[name].add(listener);
    return () => sets[name].delete(listener);
  };
  return {
    levels: () => LEVELS,
    onProgress: on("progress"),
    onDied: on("died"),
    fire: (name, payload) =>
      act(() => {
        for (const listener of sets[name]) listener(payload);
      }),
    listening: () => sets.progress.size + sets.died.size,
  };
}

const bar = () =>
  screen.getByRole("progressbar", { name: "Progress to the next level" });
const region = () => screen.getByRole("region", { name: "Character" });

test("level and XP come from the character, with progress to the next level", () => {
  render(
    <CombatPanel
      connection={fakeConnection()}
      character={{ level: 1, xp: 20 }}
    />,
  );
  expect(region()).toHaveTextContent("Level 1");
  expect(region()).toHaveTextContent("20 / 50 XP");
  expect(bar()).toHaveAttribute("aria-valuenow", "40");
});

test("a kill updates the XP, and a level-up says so", () => {
  const connection = fakeConnection();
  render(
    <CombatPanel connection={connection} character={{ level: 1, xp: 20 }} />,
  );

  connection.fire("progress", { level: 1, xp: 45, leveledUp: false });
  expect(region()).toHaveTextContent("45 / 50 XP");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();

  connection.fire("progress", { level: 2, xp: 60, leveledUp: true });
  expect(region()).toHaveTextContent("Level 2");
  expect(region()).toHaveTextContent("60 / 150 XP");
  expect(bar()).toHaveAttribute("aria-valuenow", "10");
  expect(screen.getByRole("status")).toHaveTextContent(/Level 2!/);
});

test("a defeat is explained", () => {
  const connection = fakeConnection();
  render(
    <CombatPanel connection={connection} character={{ level: 1, xp: 0 }} />,
  );
  connection.fire("died", { by: "Goblin" });
  expect(screen.getByRole("status")).toHaveTextContent("Goblin defeated you.");
});

test("the highest level shows the XP and a full bar", () => {
  render(
    <CombatPanel
      connection={fakeConnection()}
      character={{ level: 3, xp: 999 }}
    />,
  );
  expect(region()).toHaveTextContent("999 XP · highest level");
  expect(bar()).toHaveAttribute("aria-valuenow", "100");
});

test("leaving stops listening", () => {
  const connection = fakeConnection();
  const { unmount } = render(
    <CombatPanel connection={connection} character={{ level: 1, xp: 0 }} />,
  );
  expect(connection.listening()).toBe(2);
  unmount();
  expect(connection.listening()).toBe(0);
});
