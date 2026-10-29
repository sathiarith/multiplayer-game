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
