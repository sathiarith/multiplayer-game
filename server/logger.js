import pino from "pino";

// Headers that must never reach the logs: whoever reads the log could use them
// to act as the user.
const REDACT_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]',
];

// `destination` is for tests; leave it out to write to standard output.
export function createLogger({ level = "info", destination } = {}) {
  return pino(
    { level, redact: { paths: REDACT_PATHS, censor: "[redacted]" } },
    destination,
  );
}
