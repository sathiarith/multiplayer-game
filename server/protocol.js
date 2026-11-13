import { TICK_RATE } from "../shared/prediction.js";
import { PICKUP_RANGE } from "../shared/items.js";
import { MAX_TRADE_LINES, TRADE_RANGE } from "../shared/trade.js";
import { ATTACK_COOLDOWN_MS, ATTACK_RANGE } from "../shared/combat.js";

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
  pickup: { range: PICKUP_RANGE, respawnSeconds: 30, maxStack: 9999 },
  pickupRejections: ["gone", "too_far", "full", "error"],
  events: {
    client: [
      "input",
      "chat",
      "pickup",
      "trade_offer",
      "trade_accept",
      "trade_decline",
      "trade_cancel",
    ],
    server: [
      "welcome",
      "snapshot",
      "replaced",
      "kicked",
      "chat",
      "chat_rejected",
      "inventory",
      "pickup_rejected",
      "trade_offered",
      "trade_sent",
      "trade_result",
    ],
  },
  refusals: ["not_authenticated", "not_found", "internal_error"],
  trade: {
    range: TRADE_RANGE,
    offerSeconds: 30,
    maxOffers: 3,
    maxLines: MAX_TRADE_LINES,
  },
  tradeReasons: [
    "invalid",
    "not_here",
    "too_far",
    "missing_items",
    "too_many_offers",
    "full",
    "gone",
    "declined",
    "cancelled",
    "error",
  ],
  combat: { attackRange: ATTACK_RANGE, attackCooldownMs: ATTACK_COOLDOWN_MS },
  attackRejections: ["cooldown", "no_target"],
};
