const BINDINGS = {
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
};

// The held keys as the four booleans the server understands.
export function inputFromKeys(keys) {
  const held = (codes) => codes.some((code) => keys.has(code));
  return {
    up: held(BINDINGS.up),
    down: held(BINDINGS.down),
    left: held(BINDINGS.left),
    right: held(BINDINGS.right),
  };
}

export const sameInput = (a, b) =>
  a.up === b.up &&
  a.down === b.down &&
  a.left === b.left &&
  a.right === b.right;

export const anyHeld = (input) =>
  input.up || input.down || input.left || input.right;
