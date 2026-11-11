import { useCallback, useEffect, useState } from "react";

const KEEP = 50; // messages shown; older ones scroll away for good

// The chat for one connection: the messages the server sent, the last refusal,
// and a way to send.
export function useChat(connection) {
  const [messages, setMessages] = useState([]);
  const [rejection, setRejection] = useState(null);

  useEffect(() => {
    if (!connection) return undefined;
    const offChat = connection.onChat((message) => {
      setMessages((list) => [...list, message].slice(-KEEP));
    });
    const offRejected = connection.onChatRejected(({ reason }) =>
      setRejection(reason),
    );
    return () => {
      offChat();
      offRejected();
    };
  }, [connection]);

  // Returns true when something was sent.
  const send = useCallback(
    (draft) => {
      const text = draft.trim();
      if (!connection || text === "") return false;
      setRejection(null);
      connection.sendChat(text);
      return true;
    },
    [connection],
  );

  return { messages, rejection, send };
}
