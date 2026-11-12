import { io as defaultIo } from "socket.io-client";

// Connects to the game server and reports progress as plain objects:
//   { status: "connecting" | "reconnecting" | "replaced" | "kicked" | "ended" }
//   { status: "connected", character }
//   { status: "refused", code }
// The returned object is also how the game talks to the server:
//   sendInput(input)
//   onSnapshot(listener) -> unsubscribe
//   sendChat(text)
//   onChat(listener) -> unsubscribe
//   onChatRejected(listener) -> unsubscribe
//   close()
//   sendPickup(id)
//   onInventory(listener) -> unsubscribe (called at once with the latest inventory)
//   onPickupRejected(listener) -> unsubscribe
//   catalog() -> [{ code, name }]
//   sendTradeOffer({ to, give, want }), sendTradeAccept(id), sendTradeDecline(id), sendTradeCancel(id)
//   onTradeOffered(listener), onTradeSent(listener), onTradeResult(listener) -> unsubscribe
export function connectToGame({ characterId, onChange, io = defaultIo }) {
  // No URL: connect to the page's own origin (the Vite proxy in development).
  const socket = io({ transports: ["websocket"], auth: { characterId } });
  let closed = false;
  let settled = false; // the outcome is final, so ignore anything that follows
  const snapshotListeners = new Set();
  const chatListeners = new Set();
  const inventoryListeners = new Set();
  const tradeListeners = {
    offered: new Set(),
    sent: new Set(),
    result: new Set(),
  };
  let lastCatalog = [];

  const deliver = (listeners) => (payload) => {
    if (closed) return;
    for (const listener of listeners) listener(payload);
  };
  const subscribe = (listeners) => (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const pickupRejectionListeners = new Set();
  let lastInventory = null;

  // The newest inventory is kept, so a listener that subscribes late (React
  // subscribes after the welcome) still gets it at once.
  function publishInventory(items) {
    if (closed) return;
    lastInventory = items;
    for (const listener of inventoryListeners) listener(items);
  }
  const rejectionListeners = new Set();

  const report = (state) => {
    if (!closed && !settled) onChange(state);
  };
  const settle = (state) => {
    report(state);
    settled = true;
  };

  report({ status: "connecting" });

  socket.on("welcome", ({ character, inventory, catalog }) => {
    if (catalog) lastCatalog = catalog;
    if (inventory) publishInventory(inventory);
    report({ status: "connected", character });
  });
  socket.on("inventory", ({ items }) => publishInventory(items));
  socket.on("pickup_rejected", (rejection) => {
    if (closed) return;
    for (const listener of pickupRejectionListeners) listener(rejection);
  });
  socket.on("replaced", () => settle({ status: "replaced" }));
  socket.on("kicked", () => settle({ status: "kicked" }));
  socket.on("connect_error", (err) => {
    const code = err.data?.code; // only present when the server refused us
    if (code) settle({ status: "refused", code });
    else report({ status: "reconnecting" }); // network trouble: Socket.IO retries
  });
  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect") settle({ status: "ended" });
    else report({ status: "reconnecting" });
  });
  socket.on("snapshot", (snapshot) => {
    if (closed) return;
    for (const listener of snapshotListeners) listener(snapshot);
  });

  socket.on("chat", (message) => {
    if (closed) return;
    for (const listener of chatListeners) listener(message);
  });
  socket.on("chat_rejected", (rejection) => {
    if (closed) return;
    for (const listener of rejectionListeners) listener(rejection);
  });
  socket.on("trade_offered", deliver(tradeListeners.offered));
  socket.on("trade_sent", deliver(tradeListeners.sent));
  socket.on("trade_result", deliver(tradeListeners.result));

  return {
    // Sent "volatile": if the connection is not ready the message is dropped,
    // not queued. A key press from two seconds ago must never arrive late.
    sendInput(input) {
      if (!closed) socket.volatile.emit("input", input);
    },
    // Volatile, like input: a message typed while the connection is down is
    // dropped rather than delivered late. Only the server's echo is shown.
    sendChat(text) {
      if (!closed) socket.volatile.emit("chat", { text });
    },

    onChat(listener) {
      chatListeners.add(listener);
      return () => chatListeners.delete(listener);
    },

    onChatRejected(listener) {
      rejectionListeners.add(listener);
      return () => rejectionListeners.delete(listener);
    },

    onSnapshot(listener) {
      snapshotListeners.add(listener);
      return () => snapshotListeners.delete(listener);
    },

    close() {
      closed = true;
      snapshotListeners.clear();
      chatListeners.clear();
      rejectionListeners.clear();
      socket.removeAllListeners();
      socket.close(); // also stops any reconnection attempts
      inventoryListeners.clear();
      pickupRejectionListeners.clear();
      for (const listeners of Object.values(tradeListeners)) listeners.clear();
    },
    sendPickup(id) {
      if (!closed) socket.volatile.emit("pickup", { id });
    },

    onInventory(listener) {
      inventoryListeners.add(listener);
      if (lastInventory) listener(lastInventory);
      return () => inventoryListeners.delete(listener);
    },

    onPickupRejected(listener) {
      pickupRejectionListeners.add(listener);
      return () => pickupRejectionListeners.delete(listener);
    },
    // Every item that exists, from the welcome: [{ code, name }].
    catalog: () => lastCatalog,

    sendTradeOffer({ to, give, want }) {
      if (!closed) socket.volatile.emit("trade_offer", { to, give, want });
    },
    sendTradeAccept(id) {
      if (!closed) socket.volatile.emit("trade_accept", { id });
    },
    sendTradeDecline(id) {
      if (!closed) socket.volatile.emit("trade_decline", { id });
    },
    sendTradeCancel(id) {
      if (!closed) socket.volatile.emit("trade_cancel", { id });
    },

    onTradeOffered: subscribe(tradeListeners.offered),
    onTradeSent: subscribe(tradeListeners.sent),
    onTradeResult: subscribe(tradeListeners.result),
  };
}
