import { TICK_RATE } from "../shared/prediction.js";

// The rules of the game connection, in one place. `docs/protocol.md` describes
// them, and server/protocol.test.js fails if the two disagree.
export const PROTOCOL = {
  tickRate: TICK_RATE,
  maxMessageBytes: 1024, // a bigger message closes the connection
  rate: { perSecond: 40, burst: 60 }, // a real client sends about 20 a second
  violations: { max: 20, windowMs: 10_000 }, // this many in this long means a kick
  kickReason: "too_many_messages",
  saveEveryMs: 30_000, // positions and health are written this often, and when a player leaves
  chat: { maxLength: 200, perSecond: 0.5, burst: 5, radius: 320 }, // radius in pixels (8 tiles)
  chatRejections: ["invalid", "too_fast"],
  events: {
    client: ["input", "chat"],
    server: [
      "welcome",
      "snapshot",
      "replaced",
      "kicked",
      "chat",
      "chat_rejected",
    ],
  },
  refusals: ["not_authenticated", "not_found", "internal_error"],
};
