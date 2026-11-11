import { useEffect, useState } from "react";

// What this character carries, as the server last said, and the last pickup refusal.
export function useInventory(connection) {
  const [items, setItems] = useState(null); // null until the server has said
  const [rejection, setRejection] = useState(null);

  useEffect(() => {
    if (!connection) return undefined;
    const offItems = connection.onInventory((list) => {
      setItems(list);
      setRejection(null);
    });
    const offRejected = connection.onPickupRejected(({ reason }) =>
      setRejection(reason),
    );
    return () => {
      offItems();
      offRejected();
    };
  }, [connection]);

  return { items, rejection };
}
