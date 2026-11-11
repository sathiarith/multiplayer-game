// @vitest-environment jsdom
import { test, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import InventoryPanel from "./InventoryPanel.jsx";
import "../test-utils.jsx";

function fakeConnection() {
  const items = new Set();
  const rejected = new Set();
  return {
    onInventory: (listener) => {
      items.add(listener);
      return () => items.delete(listener);
    },
    onPickupRejected: (listener) => {
      rejected.add(listener);
      return () => rejected.delete(listener);
    },
    show: (list) =>
      act(() => {
        for (const listener of items) listener(list);
      }),
    reject: (reason) =>
      act(() => {
        for (const listener of rejected) listener({ reason });
      }),
    listening: () => items.size + rejected.size,
  };
}

const gold = {
  code: "gold_coin",
  name: "Gold coin",
  description: "Shiny.",
  quantity: 3,
};

test("it waits for the server, then says when nothing is carried", () => {
  const connection = fakeConnection();
  render(<InventoryPanel connection={connection} />);
  expect(screen.getByText("Loading…")).toBeInTheDocument();

  connection.show([]);

  expect(screen.getByText(/nothing yet/i)).toBeInTheDocument();
});

test("items are listed with their quantity and description", () => {
  const connection = fakeConnection();
  render(<InventoryPanel connection={connection} />);

  connection.show([gold]);

  const line = screen.getByText("Gold coin").closest("li");
  expect(line).toHaveTextContent("Gold coin ×3");
  expect(line).toHaveAttribute("title", "Shiny.");
});

test("a refusal is explained, and the next inventory clears it", () => {
  const connection = fakeConnection();
  render(<InventoryPanel connection={connection} />);
  connection.show([]);

  connection.reject("too_far");
  expect(screen.getByText(/move closer/i)).toBeInTheDocument();

  connection.show([gold]);
  expect(screen.queryByText(/move closer/i)).not.toBeInTheDocument();
});

test("without a connection it says so, and leaving stops listening", () => {
  const { unmount } = render(<InventoryPanel connection={null} />);
  expect(screen.getByText(/available while connected/i)).toBeInTheDocument();
  unmount();

  const connection = fakeConnection();
  const second = render(<InventoryPanel connection={connection} />);
  expect(connection.listening()).toBe(2);
  second.unmount();
  expect(connection.listening()).toBe(0);
});
