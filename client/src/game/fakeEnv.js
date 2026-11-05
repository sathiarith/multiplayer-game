import { vi } from "vitest";

// A pretend browser: the test decides when frames run and when keys are pressed.
export function fakeEnv() {
  const frames = new Map();
  const target = new EventTarget();
  let nextId = 1;
  let time = 0;

  const key = (type, code) => {
    const e = Object.assign(new Event(type, { cancelable: true }), { code });
    target.dispatchEvent(e);
    return e;
  };

  return {
    env: {
      raf: vi.fn((cb) => {
        const id = nextId++;
        frames.set(id, cb);
        return id;
      }),
      caf: vi.fn((id) => frames.delete(id)),
      now: () => time,
      target,
    },
    pendingFrames: () => frames.size,
    // Runs the scheduled frame, `ms` later.
    frame(ms = 16) {
      time += ms;
      const due = [...frames.values()];
      frames.clear();
      due.forEach((cb) => cb(time));
    },
    press: (code) => key("keydown", code),
    release: (code) => key("keyup", code),
    blur: () => target.dispatchEvent(new Event("blur")),
  };
}

// A canvas whose drawing context records every call and does nothing.
export function fakeCanvas() {
  const ctx = new Proxy(
    {},
    {
      get: (t, p) => (p in t ? t[p] : (t[p] = vi.fn())),
      set: (t, p, v) => ((t[p] = v), true),
    },
  );
  return { width: 0, height: 0, getContext: () => ctx, ctx };
}
