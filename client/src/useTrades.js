import { useCallback, useEffect, useReducer, useState } from "react";

const systemNow = () => Date.now();
const EMPTY = { incoming: [], outgoing: [], pending: new Set(), notice: null };

// What a trade result means, told from my side. `side` is { partner, mine },
// or null when the offer was refused before it existed.
export function explain(result, side) {
  const who = side?.partner ?? "the other player";
  if (result.ok) return `Trade with ${who} completed.`;
  switch (result.reason) {
    case "declined":
      return side?.mine
        ? `${who} declined your offer.`
        : `You declined ${who}'s offer.`;
    case "cancelled":
      return side?.mine
        ? `You cancelled your offer to ${who}.`
        : `${who} withdrew their offer.`;
    case "gone":
      return "That offer is no longer open.";
    case "missing_items":
      return "The trade didn't happen: the items were no longer there.";
    case "full":
      return "The trade didn't happen: someone can't carry that many.";
    case "too_far":
      return "Stand closer to trade.";
    case "not_here":
      return "That player isn't playing any more.";
    case "too_many_offers":
      return "You have too many open offers. Wait for an answer first.";
    case "invalid":
      return "That offer isn't possible.";
    default:
      return "Something went wrong. Nothing was traded.";
  }
}

// Everything the trade window shows, as a pure function of what happened.
export function tradesReducer(state, action) {
  switch (action.type) {
    case "reset":
      return EMPTY;
    case "offered":
      return { ...state, incoming: [...state.incoming, action.offer] };
    case "sent":
      return { ...state, outgoing: [...state.outgoing, action.offer] };
    case "answering":
      return { ...state, pending: new Set(state.pending).add(action.id) };
    case "expire": {
      const live = (o) => Date.parse(o.expiresAt) > action.now;
      return {
        ...state,
        incoming: state.incoming.filter(live),
        outgoing: state.outgoing.filter(live),
      };
    }
    case "result": {
      const { result } = action;
      const mine = state.outgoing.find((o) => o.id === result.id);
      const theirs = state.incoming.find((o) => o.id === result.id);
      const side = mine
        ? { partner: mine.to.name, mine: true }
        : theirs
          ? { partner: theirs.from.name, mine: false }
          : null;
      const pending = new Set(state.pending);
      pending.delete(result.id);
      return {
        incoming: state.incoming.filter((o) => o.id !== result.id),
        outgoing: state.outgoing.filter((o) => o.id !== result.id),
        pending,
        notice: explain(result, side),
      };
    }
    default:
      return state;
  }
}

export function useTrades(connection, { now = systemNow, tickMs = 1000 } = {}) {
  const [state, dispatch] = useReducer(tradesReducer, EMPTY);
  const [time, setTime] = useState(() => now());

  useEffect(() => {
    dispatch({ type: "reset" }); // a new connection starts with no offers
    if (!connection) return undefined;
    const offs = [
      connection.onTradeOffered((offer) => {
        setTime(now());
        dispatch({ type: "offered", offer });
      }),
      connection.onTradeSent((offer) => {
        setTime(now());
        dispatch({ type: "sent", offer });
      }),
      connection.onTradeResult((result) =>
        dispatch({ type: "result", result }),
      ),
    ];
    return () => offs.forEach((off) => off());
  }, [connection, now]);

  // While offers are open, count down once a second and drop the expired ones.
  const open = state.incoming.length + state.outgoing.length;
  useEffect(() => {
    if (open === 0) return undefined;
    const timer = setInterval(() => {
      const t = now();
      setTime(t);
      dispatch({ type: "expire", now: t });
    }, tickMs);
    return () => clearInterval(timer);
  }, [open, now, tickMs]);

  const answer = useCallback((send, id) => {
    dispatch({ type: "answering", id });
    send?.(id);
  }, []);
  const live = (o) => Date.parse(o.expiresAt) > time;

  return {
    incoming: state.incoming.filter(live),
    outgoing: state.outgoing.filter(live),
    pending: state.pending,
    notice: state.notice,
    secondsLeft: (offer) =>
      Math.max(0, Math.ceil((Date.parse(offer.expiresAt) - time) / 1000)),
    offer: (o) => connection?.sendTradeOffer(o),
    accept: (id) => answer(connection?.sendTradeAccept, id),
    decline: (id) => answer(connection?.sendTradeDecline, id),
    cancel: (id) => answer(connection?.sendTradeCancel, id),
  };
}
