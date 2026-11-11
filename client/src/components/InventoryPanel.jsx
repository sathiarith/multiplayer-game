import { useInventory } from "../useInventory.js";

const NOTICES = {
  gone: "Someone got there first.",
  too_far: "Move closer to pick that up.",
  full: "You can't carry any more of that.",
  error: "That didn't work. Try again.",
};

export default function InventoryPanel({ connection }) {
  const { items, rejection } = useInventory(connection);

  let body;
  if (items === null) {
    body = connection ? "Loading…" : "Available while connected.";
  } else if (items.length === 0) {
    body = "Nothing yet. Stand next to an item and press E.";
  }

  return (
    <section className="mt-3" aria-label="Inventory">
      <h2 className="h6 mb-2">Inventory</h2>
      {body ? (
        <p className="small text-body-secondary mb-0">{body}</p>
      ) : (
        <ul className="list-unstyled mb-0">
          {items.map((item) => (
            <li key={item.code} title={item.description}>
              {item.name}{" "}
              <span className="badge text-bg-secondary">×{item.quantity}</span>
            </li>
          ))}
        </ul>
      )}
      {rejection && (
        <p className="small text-warning-emphasis mt-2 mb-0" role="status">
          {NOTICES[rejection] ?? "You couldn't pick that up."}
        </p>
      )}
    </section>
  );
}
