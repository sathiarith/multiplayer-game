import { test, expect, vi } from "vitest";
import { createSessionSync, watchTabReturn } from "./sessionSync.js";

// A pretend BroadcastChannel: what one channel posts reaches every other open one.
function fakeBus() {
  const channels = new Set();
  const create = () => {
    const channel = {
      onmessage: null,
      postMessage: vi.fn((data) => {
        for (const other of channels)
          if (other !== channel) other.onmessage?.({ data });
      }),
      close: () => channels.delete(channel),
    };
    channels.add(channel);
    return channel;
  };
  return { create, open: () => channels.size };
}

let ids = 0;
const sync = (bus, onSignal = vi.fn()) => ({
  onSignal,
  ...createSessionSync({
    onSignal,
    createChannel: bus.create,
    makeId: () => `tab${++ids}`,
  }),
});

test("an announcement reaches the other tabs and not the one that made it", () => {
  const bus = fakeBus();
  const a = sync(bus);
  const b = sync(bus);
  const c = sync(bus);

  a.announce();

  expect(a.onSignal).not.toHaveBeenCalled();
  expect(b.onSignal).toHaveBeenCalledTimes(1);
  expect(c.onSignal).toHaveBeenCalledTimes(1);
});

test("the message carries no user data", () => {
  const bus = fakeBus();
  const posted = [];
  const a = createSessionSync({
    onSignal: vi.fn(),
    makeId: () => "tab-a",
    createChannel: () => {
      const channel = bus.create();
      channel.postMessage.mockImplementation((data) => posted.push(data));
      return channel;
    },
  });

  a.announce();

  expect(posted).toEqual([{ type: "session-changed", from: "tab-a" }]);
});

test("messages that are not announcements are ignored", () => {
  const bus = fakeBus();
  const b = sync(bus);
  const stranger = bus.create();

  stranger.postMessage({ type: "something-else" });
  stranger.postMessage(null);

  expect(b.onSignal).not.toHaveBeenCalled();
});

test("a closed tab hears nothing more", () => {
  const bus = fakeBus();
  const a = sync(bus);
  const b = sync(bus);

  b.close();
  a.announce();

  expect(b.onSignal).not.toHaveBeenCalled();
  expect(bus.open()).toBe(1);
});

test("without BroadcastChannel nothing breaks", () => {
  const s = createSessionSync({
    onSignal: vi.fn(),
    createChannel: () => {
      throw new ReferenceError("BroadcastChannel is not defined");
    },
  });
  expect(() => s.announce()).not.toThrow();
  expect(() => s.close()).not.toThrow();
});

// ---- returning to the tab ----

function fakeTab() {
  const target = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  let time = 0;
  return {
    target,
    doc,
    now: () => time,
    advance: (ms) => (time += ms),
    focus: () => target.dispatchEvent(new Event("focus")),
    show: () => {
      doc.visibilityState = "visible";
      doc.dispatchEvent(new Event("visibilitychange"));
    },
    hide: () => {
      doc.visibilityState = "hidden";
      doc.dispatchEvent(new Event("visibilitychange"));
    },
  };
}

test("coming back to the tab checks once, then waits before checking again", () => {
  const tab = fakeTab();
  const onCheck = vi.fn();
  watchTabReturn({
    onCheck,
    target: tab.target,
    doc: tab.doc,
    now: tab.now,
    minIntervalMs: 5000,
  });

  tab.focus();
  tab.show();
  tab.focus();
  expect(onCheck).toHaveBeenCalledTimes(1);

  tab.advance(5000);
  tab.focus();
  expect(onCheck).toHaveBeenCalledTimes(2);
});

test("hiding the tab does not check", () => {
  const tab = fakeTab();
  const onCheck = vi.fn();
  watchTabReturn({ onCheck, target: tab.target, doc: tab.doc, now: tab.now });

  tab.hide();

  expect(onCheck).not.toHaveBeenCalled();
});

test("the returned function removes the listeners", () => {
  const tab = fakeTab();
  const onCheck = vi.fn();
  const stop = watchTabReturn({
    onCheck,
    target: tab.target,
    doc: tab.doc,
    now: tab.now,
  });

  stop();
  tab.focus();
  tab.show();

  expect(onCheck).not.toHaveBeenCalled();
});
