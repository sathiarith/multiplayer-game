function waitText(seconds) {
  if (!Number.isFinite(seconds)) return "Try again later.";
  if (seconds < 90) return `Try again in ${seconds} seconds.`;
  return `Try again in about ${Math.ceil(seconds / 60)} minutes.`;
}

export function describeError(err) {
  const ref = err?.requestId ? ` (reference ${err.requestId})` : "";
  switch (err?.code) {
    case "network_error":
      return "Cannot reach the server. Check that it is running and try again.";
    case "invalid_credentials":
      return "Wrong username or password.";
    case "username_taken":
      return "That username is already taken.";
    case "name_taken":
      return "That character name is already taken.";
    case "character_limit":
      return "You already have the maximum number of characters.";
    case "rate_limited":
      return `Too many attempts. ${waitText(err.retryAfter)}`;
    case "forbidden_origin":
      return `The server refused this request.${ref}`;
    case "invalid_input":
      return "Please fix the highlighted fields.";
    case "not_authenticated":
      return "Please log in.";
    case "internal_error":
      return `Something went wrong on the server.${ref}`;
    default:
      return err?.message
        ? `${err.message}${ref}`
        : "Something went wrong. Please try again.";
  }
}

const REFUSALS = {
  not_authenticated: "Your session has ended. Please log in again.",
  not_found: "This character could not be found.",
  internal_error: "The server could not start your game session.",
};

// What to show for a connection state, or null when there is nothing to show.
export function describeConnection(state) {
  switch (state?.status) {
    case "connecting":
      return { tone: "secondary", text: "Connecting…" };
    case "connected":
      return { tone: "success", text: "Connected" };
    case "reconnecting":
      return { tone: "warning", text: "Connection lost. Trying to reconnect…" };
    case "replaced":
      return {
        tone: "warning",
        text: "This character was opened in another window, so this one was disconnected.",
        retryLabel: "Play here",
      };
    case "ended":
      return {
        tone: "secondary",
        text: "You were disconnected from the game. This happens when you log out, or log in again in another tab.",
        retryLabel: "Reconnect",
      };
    case "kicked":
      return {
        tone: "danger",
        text: "The server disconnected you for sending too many messages.",
        retryLabel: "Reconnect",
      };
    case "refused":
      return {
        tone: "danger",
        text: REFUSALS[state.code] ?? "The server refused the connection.",
        retryLabel: state.code === "internal_error" ? "Try again" : undefined,
      };
    default:
      return null;
  }
}
