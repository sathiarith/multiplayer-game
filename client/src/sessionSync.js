// Tells other tabs of this site that the login changed, and notices when they
// say so. The message carries no user data: whoever hears it asks the server.
const CHANNEL = "session";

export function createSessionSync({
  onSignal,
  createChannel = (name) => new BroadcastChannel(name),
  makeId = () => crypto.randomUUID(),
}) {
  let channel = null;
  try {
    channel = createChannel(CHANNEL);
  } catch {
    channel = null; // no BroadcastChannel: the checks on focus still work
  }
  const me = makeId();

  if (channel) {
    channel.onmessage = ({ data }) => {
      if (data?.type === "session-changed" && data.from !== me) onSignal();
    };
  }

  return {
    announce() {
      channel?.postMessage({ type: "session-changed", from: me });
    },
    close() {
      channel?.close();
    },
  };
}

// Calls `onCheck` when the tab becomes visible or gets focus, at most once
// per `minIntervalMs`. Returns a function that removes the listeners.
export function watchTabReturn({
  onCheck,
  target = window,
  doc = document,
  now = () => Date.now(),
  minIntervalMs = 5000,
}) {
  let last = -Infinity;
  const maybeCheck = () => {
    if (doc.visibilityState === "hidden") return; // only when the tab is shown
    const time = now();
    if (time - last < minIntervalMs) return;
    last = time;
    onCheck();
  };
  target.addEventListener("focus", maybeCheck);
  doc.addEventListener("visibilitychange", maybeCheck);
  return () => {
    target.removeEventListener("focus", maybeCheck);
    doc.removeEventListener("visibilitychange", maybeCheck);
  };
}
