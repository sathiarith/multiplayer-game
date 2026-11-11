import { useEffect, useRef, useState } from "react";
import { useChat } from "../useChat.js";
import "./ChatPanel.css";

const MAX_LENGTH = 200;

const NOTICES = {
  invalid:
    "That message wasn't sent: it was empty, too long, or had characters that aren't allowed.",
  too_fast: "You're sending messages too quickly. Wait a moment and try again.",
};

const clock = (at) =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function ChatPanel({ connection, you }) {
  const { messages, rejection, send } = useChat(connection);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);
  const logRef = useRef(null);

  // Keep the newest message in view.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages]);

  // Enter on the page opens the chat box. Escape in the box goes back to the game.
  useEffect(() => {
    const onKeyDown = (e) => {
      const inBox = e.target === inputRef.current;
      if (e.key === "Enter" && e.target === document.body && connection) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape" && inBox) {
        inputRef.current.blur();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [connection]);

  function onSubmit(e) {
    e.preventDefault();
    if (send(draft)) setDraft("");
  }

  return (
    <section className="chat" aria-label="Chat">
      <div className="chat__log" role="log" aria-live="polite" ref={logRef}>
        {messages.map((m) => (
          <p
            key={m.id}
            className={
              m.from.id === you ? "chat__line chat__line--mine" : "chat__line"
            }
          >
            <time className="chat__time" dateTime={m.at}>
              {clock(m.at)}
            </time>{" "}
            {/* Plain JSX text: React escapes it, so markup in a message stays text. */}
            <strong className="chat__name">{m.from.name}</strong>:{" "}
            <span>{m.text}</span>
          </p>
        ))}
      </div>
      {rejection && (
        <p className="small text-warning-emphasis mb-1" role="status">
          {NOTICES[rejection] ?? "That message wasn't sent."}
        </p>
      )}
      <form className="d-flex gap-2" onSubmit={onSubmit}>
        <input
          ref={inputRef}
          className="form-control form-control-sm"
          aria-label="Chat message"
          placeholder={
            connection
              ? "Press Enter to chat"
              : "Chat is available while connected"
          }
          maxLength={MAX_LENGTH}
          autoComplete="off"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!connection}
        />
        <button
          className="btn btn-sm btn-primary"
          type="submit"
          disabled={!connection || !draft.trim()}
        >
          Send
        </button>
      </form>
    </section>
  );
}
