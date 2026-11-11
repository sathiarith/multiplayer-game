// Chat rules, with no I/O: what a message may contain, how fast a person may
// send, and who is close enough to hear it.
export const CHAT_MAX_LENGTH = 200; // characters (Unicode code points)

// Control characters (newlines, tabs, NUL...) and the Unicode direction
// controls, which can make a message display backwards and disguise it.
function isForbidden(codePoint) {
  return (
    codePoint < 0x20 ||
    codePoint === 0x7f ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069)
  );
}

// { ok: true, text } for a message to deliver.
// { ok: false, reason: "malformed" } for nonsense (a violation).
// { ok: false, reason: "invalid" } for a person's mistake (not a violation).
export function parseChat(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "malformed" };
  }
  const keys = Object.keys(raw);
  if (keys.length !== 1 || keys[0] !== "text" || typeof raw.text !== "string") {
    return { ok: false, reason: "malformed" };
  }
  const text = raw.text.trim();
  const characters = [...text];
  if (characters.length === 0 || characters.length > CHAT_MAX_LENGTH) {
    return { ok: false, reason: "invalid" };
  }
  if (characters.some((c) => isForbidden(c.codePointAt(0)))) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, text };
}

// A token bucket: `burst` messages at once, then `ratePerSecond` more each second.
export function createBucket({ ratePerSecond, burst, now = () => Date.now() }) {
  let tokens = burst;
  let last = now();
  return {
    take() {
      const time = now();
      tokens = Math.min(burst, tokens + ((time - last) / 1000) * ratePerSecond);
      last = time;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}

// The ids of everyone within `radius` of `center` (the speaker included).
export function withinRadius(positions, center, radius) {
  return positions
    .filter((p) => Math.hypot(p.x - center.x, p.y - center.y) <= radius)
    .map((p) => p.id);
}
