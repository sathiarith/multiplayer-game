// @vitest-environment jsdom
import { test, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatPanel from "./ChatPanel.jsx";
import "../test-utils.jsx"; // cleanup between tests, and the jest-dom matchers

// Plays the part of the connection: tests call say() and reject() to play the server.
function fakeConnection() {
  const chat = new Set();
  const rejected = new Set();
  return {
    sendChat: vi.fn(),
    onChat: (listener) => {
      chat.add(listener);
      return () => chat.delete(listener);
    },
    onChatRejected: (listener) => {
      rejected.add(listener);
      return () => rejected.delete(listener);
    },
    say: (message) =>
      act(() => {
        for (const listener of chat) listener(message);
      }),
    reject: (reason) =>
      act(() => {
        for (const listener of rejected) listener({ reason });
      }),
    listening: () => chat.size + rejected.size,
  };
}

let count = 0;
const message = (text, from = { id: 2, name: "Borin" }) => ({
  id: `m${++count}`,
  from,
  text,
  at: "2026-11-08T12:00:00.000Z",
});
const box = () => screen.getByRole("textbox", { name: "Chat message" });

test("messages from the server appear, and markup in them is shown as plain text", () => {
  const connection = fakeConnection();
  const { container } = render(<ChatPanel connection={connection} you={1} />);

  connection.say(message("hello"));
  connection.say(message("<img src=x onerror=alert(1)>"));

  expect(screen.getByText("hello")).toBeInTheDocument();
  expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
  expect(container.querySelector("img")).toBeNull(); // no element was created
});

test("Enter sends the message, trimmed, and clears the box", async () => {
  const user = userEvent.setup();
  const connection = fakeConnection();
  render(<ChatPanel connection={connection} you={1} />);

  await user.type(box(), "  hi there  {Enter}");

  expect(connection.sendChat).toHaveBeenCalledWith("hi there");
  expect(box()).toHaveValue("");
});

test("a blank message is not sent", async () => {
  const user = userEvent.setup();
  const connection = fakeConnection();
  render(<ChatPanel connection={connection} you={1} />);

  await user.type(box(), "   {Enter}");

  expect(connection.sendChat).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
});

test("a refusal is explained, and the next message sent clears it", async () => {
  const user = userEvent.setup();
  const connection = fakeConnection();
  render(<ChatPanel connection={connection} you={1} />);

  connection.reject("too_fast");
  expect(screen.getByText(/too quickly/i)).toBeInTheDocument();

  connection.reject("invalid");
  expect(screen.getByText(/wasn't sent/i)).toBeInTheDocument();

  await user.type(box(), "ok{Enter}");
  expect(screen.queryByText(/wasn't sent/i)).not.toBeInTheDocument();
});

test("without a connection the chat box is disabled", () => {
  render(<ChatPanel connection={null} you={1} />);
  expect(box()).toBeDisabled();
  expect(box()).toHaveAttribute(
    "placeholder",
    "Chat is available while connected",
  );
});

test("your own messages are marked", () => {
  const connection = fakeConnection();
  render(<ChatPanel connection={connection} you={1} />);

  connection.say(message("mine", { id: 1, name: "Aria" }));
  connection.say(message("theirs"));

  expect(screen.getByText("mine").closest(".chat__line")).toHaveClass(
    "chat__line--mine",
  );
  expect(screen.getByText("theirs").closest(".chat__line")).not.toHaveClass(
    "chat__line--mine",
  );
});

test("only the newest 50 messages are kept", () => {
  const connection = fakeConnection();
  const { container } = render(<ChatPanel connection={connection} you={1} />);

  for (let i = 1; i <= 60; i++) connection.say(message(`message ${i}`));

  expect(container.querySelectorAll(".chat__line")).toHaveLength(50);
  expect(screen.queryByText("message 10")).not.toBeInTheDocument();
  expect(screen.getByText("message 11")).toBeInTheDocument();
});

test("Enter on the page opens the chat box, and Escape goes back to the game", async () => {
  const user = userEvent.setup();
  render(<ChatPanel connection={fakeConnection()} you={1} />);

  await user.keyboard("{Enter}");
  expect(box()).toHaveFocus();

  await user.keyboard("{Escape}");
  expect(box()).not.toHaveFocus();
});

test("leaving the page stops listening", () => {
  const connection = fakeConnection();
  const { unmount } = render(<ChatPanel connection={connection} you={1} />);
  expect(connection.listening()).toBe(2);

  unmount();

  expect(connection.listening()).toBe(0);
});
