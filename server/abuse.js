// Protects the server from one connection: a token bucket for the message
// rate, and a count of recent violations. `now` is injected so tests can
// control the clock.
export function createGuard({
  ratePerSecond,
  burst,
  maxViolations,
  violationWindowMs,
  now = () => Date.now(),
}) {
  let tokens = burst;
  let last = now();
  let windowStart = last;
  let violations = 0;

  function refill(time) {
    tokens = Math.min(burst, tokens + ((time - last) / 1000) * ratePerSecond);
    last = time;
  }

  // Records one violation. Returns "drop" (ignore this message) or "kick".
  function violate(time) {
    if (time - windowStart > violationWindowMs) {
      windowStart = time; // the old violations have expired
      violations = 0;
    }
    violations += 1;
    return violations >= maxViolations ? "kick" : "drop";
  }

  return {
    // Call for every incoming message: "ok", "drop" or "kick".
    hit() {
      const time = now();
      refill(time);
      if (tokens >= 1) {
        tokens -= 1;
        return "ok";
      }
      return violate(time); // out of tokens: the message is over the rate
    },

    // Call when a message that got through the rate limit is nonsense:
    // "drop" or "kick".
    strike() {
      return violate(now());
    },
  };
}
