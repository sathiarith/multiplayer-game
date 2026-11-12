import { useState } from "react";
import { useTrades } from "../useTrades.js";
import { useNearbyPlayers } from "../useNearbyPlayers.js";
import { useInventory } from "../useInventory.js";
import { MAX_TRADE_LINES, TRADE_RANGE } from "../../../shared/trade.js";

const describe = (lines) =>
  lines.map((l) => `${l.quantity} ${l.name}`).join(", ") || "nothing";
const chosen = (amounts) =>
  Object.entries(amounts)
    .filter(([, quantity]) => quantity > 0)
    .map(([code, quantity]) => ({ code, quantity }));

export default function TradePanel({ connection, you }) {
  const trades = useTrades(connection);
  const nearby = useNearbyPlayers(connection, you, TRADE_RANGE);
  const { items } = useInventory(connection);
  const catalog = connection?.catalog() ?? [];
  const [to, setTo] = useState("");
  const [give, setGive] = useState({});
  const [want, setWant] = useState({});

  const partner = nearby.find((p) => String(p.id) === to);
  const giveLines = chosen(give);
  const wantLines = chosen(want);
  const canSend =
    Boolean(connection && partner) &&
    giveLines.length + wantLines.length > 0 &&
    giveLines.length <= MAX_TRADE_LINES &&
    wantLines.length <= MAX_TRADE_LINES;

  // Keeps a quantity a whole number between 0 and `max`.
  const setAmount = (setter, code, max) => (e) => {
    const n = Math.max(
      0,
      Math.min(max, Math.floor(Number(e.target.value) || 0)),
    );
    setter((amounts) => ({ ...amounts, [code]: n }));
  };

  function send(e) {
    e.preventDefault();
    if (!canSend) return;
    trades.offer({ to: partner.id, give: giveLines, want: wantLines });
    setGive({});
    setWant({});
  }

  return (
    <section className="mt-3 small" aria-label="Trade">
      <h2 className="h6 mb-2">Trade</h2>
      {trades.notice && (
        <p className="mb-2" role="status">
          {trades.notice}
        </p>
      )}

      {trades.incoming.map((o) => (
        <div key={o.id} className="border rounded p-2 mb-2">
          <p className="mb-1">
            <strong>{o.from.name}</strong> offers {describe(o.give)} for{" "}
            {describe(o.want)}.
          </p>
          <p className="text-body-secondary mb-1">
            Expires in {trades.secondsLeft(o)} s
          </p>
          <button
            className="btn btn-sm btn-success me-2"
            disabled={trades.pending.has(o.id)}
            onClick={() => trades.accept(o.id)}
          >
            Accept
          </button>
          <button
            className="btn btn-sm btn-outline-secondary"
            disabled={trades.pending.has(o.id)}
            onClick={() => trades.decline(o.id)}
          >
            Decline
          </button>
        </div>
      ))}

      {trades.outgoing.map((o) => (
        <div key={o.id} className="border rounded p-2 mb-2">
          <p className="mb-1">
            Waiting for <strong>{o.to.name}</strong>: you give{" "}
            {describe(o.give)} for {describe(o.want)}.
          </p>
          <p className="text-body-secondary mb-1">
            Expires in {trades.secondsLeft(o)} s
          </p>
          <button
            className="btn btn-sm btn-outline-secondary"
            disabled={trades.pending.has(o.id)}
            onClick={() => trades.cancel(o.id)}
          >
            Cancel
          </button>
        </div>
      ))}

      <form onSubmit={send}>
        <label className="form-label mb-1" htmlFor="trade-with">
          Trade with
        </label>
        <select
          id="trade-with"
          className="form-select form-select-sm mb-2"
          value={partner ? to : ""}
          onChange={(e) => setTo(e.target.value)}
          disabled={!connection || nearby.length === 0}
        >
          <option value="">
            {nearby.length ? "Choose a player" : "No one is close enough"}
          </option>
          {nearby.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <fieldset className="mb-2">
          <legend className="fs-6 mb-1">You give</legend>
          {!items?.length && (
            <p className="text-body-secondary mb-0">
              You have nothing to give.
            </p>
          )}
          {items?.map((item) => (
            <label
              key={item.code}
              className="d-flex align-items-center gap-2 mb-1"
            >
              <input
                type="number"
                className="form-control form-control-sm w-auto"
                aria-label={`Give ${item.name}`}
                min={0}
                max={item.quantity}
                value={give[item.code] ?? 0}
                onChange={setAmount(setGive, item.code, item.quantity)}
              />
              {item.name} (you have {item.quantity})
            </label>
          ))}
        </fieldset>

        <fieldset className="mb-2">
          <legend className="fs-6 mb-1">You want</legend>
          {catalog.map((item) => (
            <label
              key={item.code}
              className="d-flex align-items-center gap-2 mb-1"
            >
              <input
                type="number"
                className="form-control form-control-sm w-auto"
                aria-label={`Want ${item.name}`}
                min={0}
                max={9999}
                value={want[item.code] ?? 0}
                onChange={setAmount(setWant, item.code, 9999)}
              />
              {item.name}
            </label>
          ))}
        </fieldset>

        <button
          type="submit"
          className="btn btn-sm btn-primary"
          disabled={!canSend}
        >
          Send offer
        </button>
      </form>
    </section>
  );
}
